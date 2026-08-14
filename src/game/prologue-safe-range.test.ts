import { describe, expect, it } from "vitest";
import { LEARNING_SAVE_SCHEMA, type LearningProgressionSnapshot, type WordLearningProgress } from "../learning/progression";
import { GameSession, type GameSessionEvent } from "../session/game-session";
import { commitSessionProposal } from "../session/adapters";
import { PrologueSettlementSession } from "./prologue-settlement";
import { PrologueReturnFlowSession, PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS } from "./prologue-return-flow";
import {
  PROLOGUE_SAFE_RANGE_SCENE_ID,
  PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID,
  PrologueSafeRangeSession,
  SafeRangeRuntimeWorld,
  type PrologueSafeRangeCompileRequest,
  type PrologueSafeRangeSession as SafeRangeCoordinator,
  type SafeRangeRuntimeActor,
} from "./prologue-safe-range";
import { SAFE_RANGE_TARGET_CLASSES, type SafeRangeTargetClass } from "./safe-range-physics";
import { createSafeRangeRuntimeFramePayload, safeRangeInteractionPointPx } from "./safe-range-authority";

const progress = (wordId: string, learningState: WordLearningProgress["learningState"]): WordLearningProgress => ({
  wordId,
  discoveryState: "discovered",
  attunementState: "attuned",
  learningState,
  evidence: [],
  productionTaskFamilies: [],
  producedBaselineTaskFamilies: [],
  producedBaselineEnvironmentFingerprints: [],
  demonstratedSemanticFacets: [],
});

const preparedLearning = (): LearningProgressionSnapshot => ({
  schema: LEARNING_SAVE_SCHEMA,
  revision: 0,
  words: {
    telo: progress("telo", "produced"),
    tawa: progress("tawa", "produced"),
    wawa: progress("wawa", "grounded"),
  },
  processedEventPayloads: {},
});

const commit = (session: GameSession, batch: import("../session/adapters").SessionProposalBatch): GameSession => {
  const result = commitSessionProposal(session, batch);
  expect(result.committed, result.reason ?? "commit rejected").toBe(true);
  return result.session;
};
const returnFacts = {
  settlementSupplyFlowInBand: true,
  wetMeadowFlowInBand: true,
  overflowContact: false,
  overflowGateSeated: true,
  overflowSealIntact: true,
  overflowConduitClear: true,
  mudMassBelowLimit: true,
  channelGradeContinuous: true,
  returnIntakeClear: true,
  oldChannelConnected: true,
  oldChannelClear: true,
  oldChannelBankStable: true,
} as const;

// This fixture traverses the trusted N07 and N02 coordinators. Protected attack state is never
// placed in the replay origin, synthesized through public proposals, or injected as a snapshot.
const qualifiedSettlementSession = (permission = true,
  sceneId: string = PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID): GameSession => {
  if (!permission) return GameSession.create({
    sessionId: `safe-range.${permission ? "qualified" : "early"}.${sceneId}`,
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: sceneId,
    learning: preparedLearning(),
  });

  let session = GameSession.create({
    sessionId: `safe-range.qualified.${sceneId}`,
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: "scene.valley.high_cistern",
    learning: preparedLearning(),
  });
  session = commit(session, { transactionId: "fixture.return.ladder", drafts: [{
    eventId: "fixture.return.ladder",
    type: "world_flag_set",
    payload: { flagId: "exit_ladder_lowered", value: true, scope: "region", regionId: "valley_prologue" },
  }] });
  const entered = PrologueReturnFlowSession.enterFromCistern(session, "fixture.return.entry");
  if (!entered.accepted || !entered.returnFlow) throw new Error(`return entry rejected: ${entered.reason}`);
  const returnFlow = entered.returnFlow;
  const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
  expect(returnFlow.completeSolution("fixture.return.complete", solution.id, {
    completedActionIds: solution.requiredActions,
    world: returnFacts,
  }).accepted).toBe(true);
  expect(returnFlow.groundWawa("fixture.return.wawa", {
    solutionId: solution.id,
    promptLevel: 0,
    predictedForceContrastCorrect: true,
    worldOutcomeContribution: true,
  }).accepted).toBe(true);
  const returned = returnFlow.returnToSettlement("fixture.return.settlement");
  if (!returned.accepted || !returned.session) throw new Error(`return rejected: ${returned.reason}`);

  const settlement = new PrologueSettlementSession(returned.session);
  for (let tick = 0; tick < 700 && settlement.snapshot().runtime.player.position.x < 576; tick += 1) {
    settlement.advanceTicks(1, { moveX: 1 });
  }
  const actions = [
    "settlement.telo.h0",
    "settlement.telo.h1",
    "settlement.tawa.h0",
    "settlement.tawa.h1",
    "settlement.repair.motion_h0",
    "settlement.calibration.unrelated_delivery_commit",
    "settlement.calibration.unrelated_route_commit",
    "settlement.delayed_retrieval_h0",
  ] as const;
  for (const [index, actionId] of actions.entries()) {
    const result = settlement.commitAttackQualificationAction(actionId, `fixture.action.${index}`);
    expect(result.accepted, `${actionId}: ${result.reason}`).toBe(true);
  }
  const calibrated = settlement.calibrateAttackCapacity("fixture.calibration");
  expect(calibrated.accepted, calibrated.reason).toBe(true);
  const granted = settlement.grantAttackRangeTrialPermission("fixture.permission");
  expect(granted.accepted, granted.reason).toBe(true);
  session = granted.session;

  if (sceneId !== PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID) {
    const moved = session.apply({
      eventId: "fixture.scene.requested",
      sequence: session.nextSequence(),
      type: "scene_entered",
      payload: { sceneId },
    });
    expect(moved.applied, moved.reason).toBe(true);
  }
  return session;
};

const nearTarget = (targetId: SafeRangeTargetClass | "material_collision_table") => {
  const point = safeRangeInteractionPointPx(targetId);
  if (!point) throw new Error(`missing safe-range target ${targetId}`);
  return { x: point.x - 12, y: point.y - 4 };
};

const enter = (runtime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy") })): SafeRangeCoordinator => {
  const result = PrologueSafeRangeSession.enterFromSettlement(qualifiedSettlementSession(), "enter", runtime);
  expect(result).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
  if (!result.safeRange) throw new Error(result.reason);
  runtime.relocatePlayer(nearTarget("wood_dummy"));
  return result.safeRange;
};

const request = (targetClass: SafeRangeTargetClass = "wood_dummy",
  overrides: Partial<PrologueSafeRangeCompileRequest> = {}): PrologueSafeRangeCompileRequest => ({
  targetClass,
  promptLevel: 0,
  waterSource: "bound_existing",
  ...overrides,
});

const compile = (coordinator: SafeRangeCoordinator, value: PrologueSafeRangeCompileRequest) => {
  const result = coordinator.compile(value);
  expect(result.ok, result.reason ?? "compile failed").toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.preview;
};

const refill = (coordinator: SafeRangeCoordinator): void => {
  const state = coordinator.session.snapshot();
  const result = coordinator.session.apply({
    eventId: `test.refill.${state.lastEventSequence}`,
    sequence: coordinator.session.nextSequence(),
    type: "mp_replaced",
    payload: { mp: { currentMp: 30, maxMp: 30, worldVersion: state.mp.worldVersion + 1 } },
  });
  expect(result.applied, result.reason).toBe(true);
};

describe("prologue safe-range coordinator", () => {
  it("allows entry only after permission and only over the canonical N02 -> N08 edge", () => {
    expect(PrologueSafeRangeSession.enterFromSettlement(qualifiedSettlementSession(false), "early"))
      .toMatchObject({ accepted: false, reason: "permission_denied", safeRange: null });
    expect(PrologueSafeRangeSession.enterFromSettlement(
      qualifiedSettlementSession(true, "scene.valley.return_channel"), "wrong"))
      .toMatchObject({ accepted: false, reason: "wrong_source_scene", safeRange: null });

    const session = qualifiedSettlementSession();
    const entered = PrologueSafeRangeSession.enterFromSettlement(session, "canonical");
    expect(entered).toMatchObject({ accepted: true, entryMode: "direct_transition" });
    const transition = entered.safeRange?.session.events().find((event) =>
      event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_SAFE_RANGE_SCENE_ID);
    expect(transition?.eventId).toContain(
      `${PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID}->${PROLOGUE_SAFE_RANGE_SCENE_ID}`);
    expect(entered.safeRange?.snapshot().permissionGranted).toBe(true);

    const adoptedSession = qualifiedSettlementSession();
    const adoptedEvent: GameSessionEvent = {
      eventId: `runtime.transition.${PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID}->${PROLOGUE_SAFE_RANGE_SCENE_ID}`,
      sequence: adoptedSession.nextSequence(),
      type: "scene_entered",
      payload: { sceneId: PROLOGUE_SAFE_RANGE_SCENE_ID },
    };
    expect(adoptedSession.apply(adoptedEvent).applied).toBe(true);
    expect(PrologueSafeRangeSession.adoptRuntimeEntry(adoptedSession, "adopt"))
      .toMatchObject({ accepted: true, entryMode: "adopted_runtime_transition" });
  });

  it("keeps raw text and authoritative world/HP/MP verdicts out of the action request", () => {
    const coordinator = enter();
    const semantic = request();
    expect(Object.keys(semantic).sort()).toEqual(["promptLevel", "targetClass", "waterSource"]);
    const forged = {
      ...semantic,
      rawUtterance: "forged",
      permission: "granted",
      sceneId: PROLOGUE_SAFE_RANGE_SCENE_ID,
      currentMp: 999,
      targetHp: 999,
      livingOverlap: false,
      sweptLivingCollision: false,
      damageHp: 999,
    } as PrologueSafeRangeCompileRequest;
    expect(coordinator.compile(forged).ok).toBe(true);
    expect(coordinator.snapshot().targets.wood_dummy.completed).toBe(false);
    expect(coordinator.session.snapshot().mp).toMatchObject({ currentMp: 24, maxMp: 30 });
    expect(Object.keys(coordinator.snapshot())).not.toEqual(expect.arrayContaining([
      "actors", "playerPositionPx", "runtimeRevision",
    ]));
    const authority = new SafeRangeRuntimeWorld({ playerPositionPx: { x: 0, y: 0 } });
    const distant = enter(authority);
    authority.synchronize({ x: 0, y: 0 }, []);
    expect(distant.compile({ ...semantic, direction: { x: 80, y: 16 }, livingOverlap: false } as PrologueSafeRangeCompileRequest))
      .toMatchObject({ ok: false, reason: "invalid_request" });
  });

  it("derives living overlap and swept collision from the runtime actor frame and fails closed", () => {
    const overlapping: SafeRangeRuntimeActor = {
      actorId: "npc.overlap", kind: "living", boundsPx: { x: 80, y: 240, width: 16, height: 32 },
    };
    const overlapRuntime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy"), actors: [overlapping] });
    const overlap = enter(overlapRuntime);
    expect(overlap.compile(request())).toMatchObject({ ok: false, reason: "living_overlap" });

    const swept: SafeRangeRuntimeActor = {
      actorId: "npc.swept", kind: "living", boundsPx: { x: 72, y: 246, width: 4, height: 12 },
    };
    const sweptRuntime = new SafeRangeRuntimeWorld({ playerPositionPx: { x: 64, y: 252 }, actors: [swept] });
    const sweptCoordinator = enter(sweptRuntime);
    expect(sweptCoordinator.compile(request())).toMatchObject({ ok: false, reason: "swept_living_collision" });

    const inertRuntime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy"), actors: [{ ...swept, actorId: "crate", kind: "inert" }] });
    expect(enter(inertRuntime).compile(request())).toMatchObject({ ok: true });
  });

  it("invalidates a preview when either runtime or session world facts change", () => {
    const runtime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy") });
    const coordinator = enter(runtime);
    const runtimeStale = compile(coordinator, request());
    runtime.synchronize({ x: 32, y: 32 }, []);
    expect(coordinator.execute("runtime-stale", runtimeStale))
      .toMatchObject({ accepted: false, reason: "world_version_conflict" });
    runtime.synchronize(nearTarget("wood_dummy"), []);

    const sessionStale = compile(coordinator, request());
    const current = coordinator.session.snapshot();
    expect(coordinator.session.apply({ eventId: "test.world.change", sequence: coordinator.session.nextSequence(),
      type: "receipt_recorded", payload: { receiptId: "test.world.change", domain: "world", payloadHash: "changed" } }).applied)
      .toBe(true);
    // A receipt does not advance world.revision, so change the scene twice and restore N08.
    expect(coordinator.session.apply({ eventId: "test.scene.away", sequence: coordinator.session.nextSequence(),
      type: "scene_entered", payload: { sceneId: PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID } }).applied).toBe(true);
    expect(coordinator.session.apply({ eventId: "test.scene.back", sequence: coordinator.session.nextSequence(),
      type: "scene_entered", payload: { sceneId: PROLOGUE_SAFE_RANGE_SCENE_ID } }).applied).toBe(true);
    expect(coordinator.session.snapshot().world.revision).toBeGreaterThan(current.world.revision);
    expect(coordinator.execute("session-stale", sessionStale))
      .toMatchObject({ accepted: false, reason: "world_version_conflict" });
  });

  it("keeps a preview valid across idle runtime synchronization with identical authoritative facts", () => {
    const position = nearTarget("wood_dummy");
    const runtime = new SafeRangeRuntimeWorld({ playerPositionPx: position });
    const coordinator = enter(runtime);
    const preview = compile(coordinator, request());
    runtime.synchronize(position, []);
    expect(coordinator.execute("idle-frame", preview))
      .toMatchObject({ accepted: true, reason: "committed" });
  });

  it("requires a protected adjacent runtime-frame witness for live commits and replay", () => {
    const runtime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy") });
    const coordinator = enter(runtime);
    expect(coordinator.execute("witness.transfer", compile(coordinator, request("wood_dummy"))))
      .toMatchObject({ accepted: true, reason: "committed" });

    const save = coordinator.toSave();
    const transferIndex = save.eventLedger.findIndex((event) =>
      event.type === "safe_range_transfer_passed" && event.payload.transactionId === "witness.transfer");
    expect(transferIndex).toBeGreaterThan(0);
    const frame = save.eventLedger[transferIndex - 1];
    const receipt = save.eventLedger[transferIndex + 1];
    expect(frame?.type).toBe("safe_range_runtime_frame_committed");
    expect(receipt?.type).toBe("receipt_recorded");
    expect(frame && receipt ? [frame.sequence, save.eventLedger[transferIndex]!.sequence, receipt.sequence] : [])
      .toEqual(frame ? [frame.sequence, frame.sequence + 1, frame.sequence + 2] : []);
    expect(GameSession.load(JSON.parse(JSON.stringify(save))).ok).toBe(true);

    const orphaned = structuredClone(save.eventLedger) as GameSessionEvent[];
    orphaned[transferIndex - 1] = {
      eventId: "witness.replaced-frame",
      sequence: frame!.sequence,
      type: "receipt_recorded",
      payload: { receiptId: "witness.replaced-frame", domain: "world", payloadHash: "benign" },
    };
    expect(GameSession.replayLedger(save.sessionId, save.origin, orphaned).ok).toBe(false);

    const corruptedFrame = structuredClone(save.eventLedger) as GameSessionEvent[];
    const frameEvent = corruptedFrame[transferIndex - 1];
    if (!frameEvent || frameEvent.type !== "safe_range_runtime_frame_committed") {
      throw new Error("missing canonical runtime-frame witness");
    }
    corruptedFrame[transferIndex - 1] = {
      ...frameEvent,
      payload: { ...frameEvent.payload, playerPositionPx: { x: 0, y: 0 } },
    };
    expect(GameSession.replayLedger(save.sessionId, save.origin, corruptedFrame).ok).toBe(false);

    const malformedFrame = structuredClone(save.eventLedger) as GameSessionEvent[];
    malformedFrame[transferIndex - 1] = {
      ...frameEvent,
      payload: { transactionId: "witness.transfer", writerEvent: "safe_range_runtime_frame_committed" },
    } as unknown as GameSessionEvent;
    expect(() => GameSession.replayLedger(save.sessionId, save.origin, malformedFrame)).not.toThrow();
    expect(GameSession.replayLedger(save.sessionId, save.origin, malformedFrame).ok).toBe(false);

    const malformedAction = structuredClone(save.eventLedger) as GameSessionEvent[];
    const transferEvent = malformedAction[transferIndex]!;
    malformedAction[transferIndex] = {
      ...transferEvent,
      payload: { transactionId: "witness.transfer", writerEvent: "safe_range_transfer_passed" },
    } as unknown as GameSessionEvent;
    expect(() => GameSession.replayLedger(save.sessionId, save.origin, malformedAction)).not.toThrow();
    expect(GameSession.replayLedger(save.sessionId, save.origin, malformedAction).ok).toBe(false);

    const state = coordinator.session.snapshot();
    const forgedFrame = createSafeRangeRuntimeFramePayload({
      transactionId: "witness.public-forge",
      actionKind: "transfer",
      targetId: "sandbag",
      requestHash: "public-forge",
      sessionWorldRevision: state.world.revision,
      mpWorldVersion: state.mp.worldVersion,
      runtimeRevision: 0,
      playerPositionPx: nearTarget("sandbag"),
    });
    expect(coordinator.session.apply({
      eventId: "session.safe-range.frame.witness.public-forge",
      sequence: coordinator.session.nextSequence(),
      type: "safe_range_runtime_frame_committed",
      payload: forgedFrame,
    })).toMatchObject({ applied: false, reason: "invalid_event" });
  });

  it("commits each authored inert outcome, charges exact MP once, persists HP, then completes the table", () => {
    const runtime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy") });
    const coordinator = enter(runtime);
    const expected = {
      wood_dummy: { hp: 5, charged: 13 },
      sandbag: { hp: 8, charged: 18 },
      minecart: { hp: 9, charged: 13 },
      hanging_stone: { hp: 7, charged: 18 },
    } as const;
    SAFE_RANGE_TARGET_CLASSES.forEach((klass, index) => {
      if (index > 0) refill(coordinator);
      const waterSource = index % 2 === 0 ? "bound_existing" as const : "manifest_default" as const;
      const before = coordinator.session.snapshot().mp.currentMp;
      runtime.synchronize(nearTarget(klass), []);
      const preview = compile(coordinator, request(klass, { promptLevel: index % 2 as 0 | 1, waterSource }));
      const result = coordinator.execute(`transfer.${klass}`, preview);
      expect(result).toMatchObject({ accepted: true, reason: "committed" });
      expect(coordinator.session.snapshot().mp.currentMp).toBe(before - expected[klass].charged);
      const transfer = [...coordinator.session.events()].reverse().find((event) =>
        event.type === "safe_range_transfer_passed" && event.payload.targetClass === klass);
      expect(transfer?.type === "safe_range_transfer_passed" ? transfer.payload.physicsResult.targetHpAfter : null)
        .toBe(expected[klass].hp);
      expect(result.snapshot.targets[klass]).toMatchObject({ completed: true });
    });
    expect(coordinator.snapshot().firstAttackSignatureAvailable).toBe(true);
    expect(coordinator.inspectMaterialTable("table.too-far"))
      .toMatchObject({ accepted: false, reason: "table_out_of_range" });
    runtime.synchronize(nearTarget("material_collision_table"), []);
    expect(coordinator.inspectMaterialTable("table.complete"))
      .toMatchObject({ accepted: true, reason: "committed" });
    expect(coordinator.snapshot().firstAttackSignatureCompleted).toBe(true);
    const completedSave = coordinator.toSave();
    const tableIndex = completedSave.eventLedger.findIndex((event) =>
      event.type === "safe_range_material_table_completed" &&
      event.payload.transactionId === "table.complete");
    expect(tableIndex).toBeGreaterThan(0);
    expect(completedSave.eventLedger[tableIndex - 1]?.type).toBe("safe_range_runtime_frame_committed");
    expect(completedSave.eventLedger[tableIndex + 1]?.type).toBe("receipt_recorded");
    expect(GameSession.load(JSON.parse(JSON.stringify(completedSave))).ok).toBe(true);

    const orphanedTable = structuredClone(completedSave.eventLedger) as GameSessionEvent[];
    const tableFrame = orphanedTable[tableIndex - 1]!;
    orphanedTable[tableIndex - 1] = {
      eventId: "table.replaced-frame",
      sequence: tableFrame.sequence,
      type: "receipt_recorded",
      payload: { receiptId: "table.replaced-frame", domain: "world", payloadHash: "benign" },
    };
    expect(GameSession.replayLedger(completedSave.sessionId, completedSave.origin, orphanedTable).ok).toBe(false);
  });

  it("treats the same operation as a duplicate, rejects transaction conflicts, and consumes previews once", () => {
    const runtime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy") });
    const coordinator = enter(runtime);
    const first = compile(coordinator, request("wood_dummy"));
    expect(coordinator.execute("same", first)).toMatchObject({ accepted: true, duplicate: false });
    expect(coordinator.execute("same", first)).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    refill(coordinator);
    runtime.synchronize(nearTarget("sandbag"), []);
    const conflicting = compile(coordinator, request("sandbag", { promptLevel: 1 }));
    expect(coordinator.execute("same", conflicting))
      .toMatchObject({ accepted: false, reason: "transaction_conflict" });
    expect(coordinator.execute("other", first))
      .toMatchObject({ accepted: false, reason: "preview_already_executed" });
    expect(coordinator.execute("forged", { ...conflicting }))
      .toMatchObject({ accepted: false, reason: "untrusted_preview" });
  });

  it("reconstructs target HP across reset/recovery and checksummed reload", () => {
    const runtime = new SafeRangeRuntimeWorld({ playerPositionPx: nearTarget("wood_dummy") });
    const coordinator = enter(runtime);
    expect(coordinator.execute("wood", compile(coordinator, request("wood_dummy"))).accepted).toBe(true);
    const before = coordinator.snapshot().targets.wood_dummy;
    expect(coordinator.resetToCheckpoint("reset")).toMatchObject({ accepted: true, reason: "committed" });
    expect(coordinator.snapshot().targets.wood_dummy).toEqual(before);
    expect(coordinator.recoverSoftLock("recover")).toMatchObject({ accepted: true, reason: "committed" });
    expect(coordinator.snapshot().targets.wood_dummy).toEqual(before);

    const loaded = PrologueSafeRangeSession.fromSave(coordinator.toSave(), new SafeRangeRuntimeWorld());
    expect(loaded.snapshot().targets.wood_dummy).toEqual(before);
    expect(loaded.snapshot().targets.sandbag).toMatchObject({ completed: false });
  });

  it("returns over the canonical N08 -> N02 edge and keeps return idempotent", () => {
    const coordinator = enter();
    const returned = coordinator.returnToSettlement("return");
    expect(returned).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(returned.session?.snapshot().world.currentSceneId).toBe(PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID);
    const transition = returned.session?.events().at(-3);
    expect(transition?.type).toBe("scene_entered");
    expect(transition?.eventId).toContain(`${PROLOGUE_SAFE_RANGE_SCENE_ID}->${PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID}`);
    expect(coordinator.returnToSettlement("return"))
      .toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    expect(coordinator.compile(request())).toMatchObject({ ok: false, reason: "wrong_scene" });
  });
});
