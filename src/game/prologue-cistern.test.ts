import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { CisternLearningSession } from "../learning/cistern-session";
import type { LearningProgressionSnapshot } from "../learning/progression";
import {
  commitSessionProposal,
  proposeCapabilityMilestone,
} from "../session/adapters";
import { readVerifiedCapabilityMilestoneContract } from "../session/capability-contract";
import { GameSession } from "../session/game-session";
import type { LivingSafetyZone } from "../spells/cast-plan";
import {
  PROLOGUE_CISTERN_CAPACITY_MILESTONE_REF,
  PROLOGUE_CISTERN_DIRECT_EXPRESSIONS,
  PROLOGUE_CISTERN_FAMILY_CONTRACTS,
  PROLOGUE_CISTERN_REGION_FLAGS,
  PROLOGUE_CISTERN_SCENE_ID,
  PROLOGUE_CISTERN_STAGE_CONTRACTS,
  PROLOGUE_CISTERN_TASK_ID,
  PrologueCisternSession,
  createPrologueCisternInitialSession,
} from "./prologue-cistern";

const REGION_ID = "valley_prologue";
const SERVICE_SCENE_ID = "scene.valley.service_channel";

const preparedLearning = (sessionId: string): LearningProgressionSnapshot => {
  const learning = new CisternLearningSession({ playerSaveId: sessionId, expressionCapacity: 2 });
  for (const wordId of ["telo", "lili", "suli"] as const) {
    learning.discoverGlyph({
      wordId,
      occurrenceId: `cistern.wall.${wordId}`,
      locationId: `scene.valley.high_cistern.${wordId}`,
    });
    learning.attuneGlyph({
      wordId,
      occurrenceId: `cistern.attune.${wordId}`,
      environmentalWitnessId: `cistern.receiver.${wordId}`,
    });
  }
  return learning.snapshot().learning;
};

const PRE_CISTERN_CONTRACT = readVerifiedCapabilityMilestoneContract(
  generatedRuntimeArtifact.capabilityProgression,
  PROLOGUE_CISTERN_CAPACITY_MILESTONE_REF,
);

const commitPreCisternMilestone = (session: GameSession): GameSession => {
  const commit = commitSessionProposal(
    session,
    proposeCapabilityMilestone("test.pre-cistern-capacity", PRE_CISTERN_CONTRACT),
  );
  expect(commit.committed).toBe(true);
  return commit.session;
};

const regionTrue = (target: PrologueCisternSession, flagId: string): boolean =>
  Object.values(target.snapshot().session.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === REGION_ID && flag.flagId === flagId && flag.value === true
  );

const room = (options: Readonly<{
  sessionId?: string;
  currentMp?: number;
  expressionCapacityWords?: number;
  prepared?: boolean;
}> = {}): PrologueCisternSession => {
  const sessionId = options.sessionId ?? "save.prologue-cistern.test";
  const fresh = createPrologueCisternInitialSession({
    sessionId,
    currentMp: options.currentMp,
    learning: options.prepared === false ? undefined : preparedLearning(sessionId),
  });
  const authoritative = (options.expressionCapacityWords ?? 2) === 2
    ? commitPreCisternMilestone(fresh)
    : fresh;
  return new PrologueCisternSession(authoritative);
};

const cast = (
  target: PrologueCisternSession,
  expression: "telo_lili" | "telo" | "telo_suli",
  transactionId: string,
) => {
  target.setExpression(expression);
  target.setDirection("east");
  target.targetCurrentReceiver();
  const preview = target.beginPreview();
  expect(preview).toMatchObject({ accepted: true, reason: "preview_ready" });
  expect(preview.preview?.plan).toMatchObject({ canConfirm: true });
  return target.confirmPending(transactionId);
};

const serviceSession = (sessionId: string): GameSession => {
  let session = GameSession.create({
    sessionId,
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: SERVICE_SCENE_ID,
  });
  session = commitPreCisternMilestone(session);
  const committed = commitSessionProposal(session, {
    transactionId: "service-ready",
    drafts: [
      {
        eventId: "test.service.ready",
        type: "world_flag_set",
        payload: { flagId: "service_gate_open", value: true, scope: "region", regionId: REGION_ID },
      },
    ],
  });
  expect(committed.committed).toBe(true);
  session = committed.session;
  return session;
};

describe("PrologueCisternSession generated contract", () => {
  it("consumes the canonical generated three-stage/two-family N05 task", () => {
    expect(PROLOGUE_CISTERN_SCENE_ID).toBe("scene.valley.high_cistern");
    expect(PROLOGUE_CISTERN_TASK_ID).toBe("ch01_length_cistern");
    expect(PROLOGUE_CISTERN_STAGE_CONTRACTS.map(({ id, activationMp, canonicalWordIds }) => ({
      id,
      activationMp,
      canonicalWordIds,
    }))).toEqual([
      { id: "short", activationMp: 6, canonicalWordIds: ["word.telo", "word.lili"] },
      { id: "default", activationMp: 5, canonicalWordIds: ["word.telo"] },
      { id: "long", activationMp: 10, canonicalWordIds: ["word.telo", "word.suli"] },
    ]);
    expect(PROLOGUE_CISTERN_FAMILY_CONTRACTS.map((family) => [family.id, family.stageIds])).toEqual([
      ["cistern.family_a.calibration", ["short", "default"]],
      ["cistern.family_b.transfer", ["long"]],
    ]);
    expect(room().snapshot()).toMatchObject({
      sceneManifestId: PROLOGUE_CISTERN_SCENE_ID,
      taskId: PROLOGUE_CISTERN_TASK_ID,
      expressionCapacityWords: 2,
      softLockRecovery: { maximumSeconds: 60 },
      killCount: 0,
    });
  });

  it("enters directly from service, checkpoints once, and rejects conflict reuse", () => {
    const source = serviceSession("save.cistern.entry");
    const entered = PrologueCisternSession.enterFromServiceChannel(source, "cistern.entry.001");
    expect(entered).toMatchObject({ accepted: true, duplicate: false, reason: "committed", entryMode: "direct_transition" });
    expect(entered.cistern?.snapshot()).toMatchObject({
      session: {
        world: { currentSceneId: PROLOGUE_CISTERN_SCENE_ID },
        checkpoint: { id: "checkpoint.valley.high_cistern.entry", sceneId: PROLOGUE_CISTERN_SCENE_ID },
      },
    });
    expect(regionTrue(entered.cistern!, PROLOGUE_CISTERN_REGION_FLAGS.entryCrossed)).toBe(true);

    const duplicate = PrologueCisternSession.enterFromServiceChannel(entered.cistern!.session, "cistern.entry.001");
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    const conflict = PrologueCisternSession.adoptRuntimeEntry(entered.cistern!.session, "cistern.entry.001");
    expect(conflict).toMatchObject({ accepted: false, duplicate: false, reason: "transaction_conflict" });
  });

  it("reads expression capacity from GameSession and blocks a two-word preview at capacity one", () => {
    const target = room({ expressionCapacityWords: 1 });
    target.setExpression("telo_lili");
    target.targetCurrentReceiver();
    expect(target.beginPreview()).toMatchObject({ accepted: false, reason: "capacity_insufficient", preview: null });
    expect(target.snapshot().session.mp).toMatchObject({ currentMp: 24, worldVersion: 0 });

    target.setExpression("telo");
    expect(target.beginPreview()).toMatchObject({ accepted: true, reason: "preview_ready" });
  });

  it("charges a legal wrong-length cast but advances no receiver, family, or evidence", () => {
    const target = room({ sessionId: "save.cistern.wrong-length" });
    const before = target.snapshot().session;
    target.setExpression("telo");
    target.setDirection("east");
    target.setTargetAnchorPx({ x: 20, y: 20 });
    const preview = target.beginPreview();
    expect(preview.preview?.plan).toMatchObject({ canConfirm: true });
    const result = target.confirmPending("cistern.cast.wrong-short");

    expect(result).toMatchObject({
      accepted: true,
      duplicate: false,
      reason: "incorrect_length",
      stage: "short",
      expression: "telo",
      correctLength: false,
      receiverSatisfied: false,
      evidence: null,
      confirmation: { execution: { mpCharge: 5 } },
    });
    expect(result.snapshot.session.mp).toMatchObject({ currentMp: 19, maxMp: 26, worldVersion: 2 });
    expect(result.snapshot.session.learning).toEqual(before.learning);
    expect(result.snapshot.stages).toEqual({ short: false, default: false, long: false });
    expect(Object.values(result.snapshot.families)).toEqual([false, false]);
    expect(result.snapshot.cistern.stage).toBe("short");
  });

  it("rechecks living safety and rebuilds the executor after rejection without MP, water, or evidence", () => {
    const target = room({ sessionId: "save.cistern.safety" });
    const before = target.snapshot().session;
    target.setExpression("telo_lili");
    target.targetCurrentReceiver();
    const preview = target.beginPreview();
    const cell = preview.preview!.plan!.preview.geometry.simulationCellGeometry.manifestationCells[0]!;
    const lateCreature: LivingSafetyZone = {
      entityId: "creature.rabbit.late",
      boundsPx: { x: cell.x * 2, y: cell.y * 2, width: 2, height: 2 },
      marginPx: 0,
    };
    const result = target.confirmPending("cistern.cast.living-safety", [lateCreature]);
    expect(result).toMatchObject({
      accepted: false,
      reason: "cast_rejected",
      confirmation: { execution: { committed: false, rejectionCode: "world_mutation_rejected" } },
    });
    expect(result.snapshot.session).toEqual(before);
    expect(result.snapshot.cistern).toMatchObject({ stage: "short", mp: before.mp.currentMp, pendingPlan: null });
  });

  it("requires both independent families before atomic region completion and produces after two families", () => {
    const target = room({ sessionId: "save.cistern.direct", currentMp: 24 });
    const short = cast(target, PROLOGUE_CISTERN_DIRECT_EXPRESSIONS.short, "cistern.cast.short");
    expect(short).toMatchObject({ accepted: true, reason: "committed", receiverSatisfied: true });
    expect(short.snapshot.families["cistern.family_a.calibration"]).toBe(false);

    const normal = cast(target, PROLOGUE_CISTERN_DIRECT_EXPRESSIONS.default, "cistern.cast.default");
    expect(normal.snapshot.families["cistern.family_a.calibration"]).toBe(true);
    expect(normal.snapshot.completed).toBe(false);
    expect(regionTrue(target, PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected)).toBe(false);

    const long = cast(target, PROLOGUE_CISTERN_DIRECT_EXPRESSIONS.long, "cistern.cast.long");
    expect(long.snapshot).toMatchObject({
      completed: true,
      returnChannelAvailable: true,
      stages: { short: true, default: true, long: true },
      session: { mp: { currentMp: 3, maxMp: 26, worldVersion: 4 } },
    });
    expect(long.snapshot.families).toMatchObject({
      "cistern.family_a.calibration": true,
      "cistern.family_b.transfer": true,
    });
    expect(regionTrue(target, PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected)).toBe(true);
    expect(regionTrue(target, PROLOGUE_CISTERN_REGION_FLAGS.upperChannelAvailable)).toBe(true);
    expect(regionTrue(target, PROLOGUE_CISTERN_REGION_FLAGS.exitLadderLowered)).toBe(true);
    expect(long.snapshot.session.learning.words.telo?.learningState).toBe("produced");
  });

  it("allows either family to use tools, grants zero evidence, and still requires the other family", () => {
    const target = room({ sessionId: "save.cistern.tool" });
    const beforeLearning = target.snapshot().session.learning;
    const a = target.completeFamilyWithTools("cistern.tool.a", "cistern.family_a.calibration");
    expect(a).toMatchObject({ accepted: true, reason: "tool_bypass_no_evidence", snapshot: { completed: false } });
    expect(a.snapshot.session.learning).toEqual(beforeLearning);
    expect(a.snapshot.families["cistern.family_a.calibration"]).toBe(true);
    expect(a.snapshot.families["cistern.family_b.transfer"]).toBe(false);

    const b = target.completeFamilyWithTools("cistern.tool.b", "cistern.family_b.transfer");
    expect(b).toMatchObject({ accepted: true, reason: "tool_bypass_no_evidence", snapshot: { completed: true } });
    expect(b.snapshot.session.learning).toEqual(beforeLearning);
    expect(b.snapshot.session.mp).toMatchObject({ currentMp: 24, worldVersion: 1 });
  });

  it("supports lili/suli discovery and attunement with persisted idempotency", () => {
    const target = room({ sessionId: "save.cistern.words", prepared: false });
    for (const wordId of ["lili", "suli"] as const) {
      const discovered = target.discoverLengthWord(`cistern.discover.${wordId}`, wordId);
      expect(discovered).toMatchObject({ accepted: true, evidenceGranted: true });
      const attuned = target.attuneLengthWord(`cistern.attune.${wordId}`, wordId);
      expect(attuned).toMatchObject({ accepted: true, evidenceGranted: true });
    }
    expect(target.snapshot().session.learning.words).toMatchObject({
      lili: { discoveryState: "discovered", attunementState: "attuned" },
      suli: { discoveryState: "discovered", attunementState: "attuned" },
    });
    const loaded = PrologueCisternSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.discoverLengthWord("cistern.discover.lili", "lili")).toMatchObject({
      accepted: true,
      duplicate: true,
      evidenceGranted: false,
    });
  });

  it("synchronizes natural, meditation, and checkpoint recovery proposals through GameSession receipts", () => {
    const target = room({ sessionId: "save.cistern.recovery", currentMp: 0 });
    expect(target.applyNaturalRecovery("cistern.natural.001", 4)).toMatchObject({
      accepted: true,
      snapshot: { session: { mp: { currentMp: 1, maxMp: 26, worldVersion: 1 } } },
    });
    expect(target.meditate("cistern.meditate.001", false, false)).toMatchObject({
      accepted: true,
      snapshot: { session: { mp: { currentMp: 4, maxMp: 26, worldVersion: 1 } } },
    });
    const checkpoint = target.recoverAtCheckpoint("cistern.checkpoint.001");
    expect(checkpoint.accepted).toBe(true);
    expect(checkpoint.snapshot.session.mp.currentMp).toBeGreaterThan(4);
    const after = checkpoint.snapshot.session;
    expect(target.applyNaturalRecovery("cistern.natural.001", 4)).toMatchObject({ accepted: true, duplicate: true });
    expect(target.snapshot().session).toEqual(after);
  });

  it("preserves committed stages, MP, evidence, completion and killCount=0 across reset/recovery/save-load", () => {
    const target = room({ sessionId: "save.cistern.persist", currentMp: 24 });
    cast(target, "telo_lili", "cistern.persist.short");
    const before = target.snapshot();
    const reset = target.resetToCheckpoint("cistern.reset.001");
    expect(reset.accepted).toBe(true);
    expect(reset.snapshot.session.mp).toEqual(before.session.mp);
    expect(reset.snapshot.session.learning).toEqual(before.session.learning);
    expect(reset.snapshot.stages.short).toBe(true);
    expect(reset.snapshot.cistern).toMatchObject({ stage: "default", mp: before.session.mp.currentMp });

    const recovered = target.recoverSoftLock("cistern.softlock.001");
    expect(recovered).toMatchObject({ accepted: true, snapshot: { softLockRecovery: { maximumSeconds: 60 }, killCount: 0 } });
    expect(recovered.snapshot.stages.short).toBe(true);

    const loaded = PrologueCisternSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().session).toEqual(target.snapshot().session);
    expect(loaded.snapshot()).toMatchObject({ stages: { short: true }, killCount: 0 });
    expect(loaded.snapshot().cistern.stage).toBe("default");
  });
});
