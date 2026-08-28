import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeInfrastructureTaskManifestIndex } from "../content/runtime-task-manifest";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import { commitSessionProposal, type SessionBatchCommitResult, type SessionProposalBatch } from "../session/adapters";
import type { GameSession, GameSessionSave } from "../session/game-session";
import type { CrossSaveWalRecovery, CrossSaveWalRecord } from "../persistence/cross-save-wal";
import {
  BrowserGameSessionWalCoordinator,
  LocalStorageDurableJsonStore,
  type LocalStorageLike,
} from "../persistence/browser-game-session-wal";
import { PROLOGUE_STREAM_SCENE_ID } from "./prologue-arrival-stream";
import {
  PROLOGUE_CISTERN_SCENE_ID,
} from "./prologue-cistern";
import {
  PROLOGUE_RETURN_FLOW_FLAGS,
  PROLOGUE_RETURN_FLOW_SCENE_ID,
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
} from "./prologue-return-flow";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "./prologue-settlement";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
} from "./prologue-waterwheel";
import type { CrossSaveTransactionCoordinator } from "./cross-save-transaction-coordinator";
import { PrologueFlowSession } from "./prologue-flow";
import type { P0LearningActionId } from "./p0-learning-contract";

const tasks = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const p0 = readRuntimeP0CurriculumManifest(generatedRuntimeArtifact);
const requiredActions = (taskId: string, solutionId: string): readonly string[] =>
  tasks.byId[taskId]!.solutions.find((solution) => solution.id === solutionId)!.requiredActions;

const goRightUntil = (target: PrologueFlowSession, sceneId: string, maximumTicks = 1_200): void => {
  for (let tick = 0; tick < maximumTicks && target.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  expect(target.snapshot().runtime.sceneId).toBe(sceneId);
};

const reachCompletedCistern = (sessionId: string,
  beforeSettlementDeparture?: (target: PrologueFlowSession) => void): PrologueFlowSession => {
  const target = PrologueFlowSession.fresh({ sessionId });
  goRightUntil(target, PROLOGUE_STREAM_SCENE_ID);
  expect(target.pushLooseStone(`${sessionId}.stone`).accepted).toBe(true);
  goRightUntil(target, PROLOGUE_SETTLEMENT_SCENE_ID);
  beforeSettlementDeparture?.(target);
  expect(target.enterWaterwheel(`${sessionId}.waterwheel.entry`).accepted).toBe(true);
  expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_WATERWHEEL_SCENE_ID);
  expect(target.observeWaterwheelPhysics(`${sessionId}.physics`, {
    angularVelocityRpm: 12,
    elapsedTicks: 600,
    downstreamFlowBand: "safe",
    overflowContact: false,
  }).accepted).toBe(true);
  const wheelSolution = "waterwheel.repair_axle";
  expect(target.completeWaterwheelSolution(`${sessionId}.wheel`, wheelSolution, {
    completedActionIds: requiredActions("ch01_waterwheel", wheelSolution),
    world: { axleSupported: true, wheelRotatesFreely: true, downstreamFlowBandSafe: true },
  }).accepted).toBe(true);
  expect(target.enterServiceChannel(`${sessionId}.service.entry`).accepted).toBe(true);
  expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_SERVICE_CHANNEL_SCENE_ID);
  const serviceSolution = "service.open_bypass_valve";
  expect(target.completeServiceSolution(`${sessionId}.service`, serviceSolution, {
    completedActionIds: requiredActions("ch01_service_channel", serviceSolution),
    world: { bypassValveOpen: true, bypassRouteClear: true },
  }).accepted).toBe(true);
  expect(target.enterCistern(`${sessionId}.cistern.entry`).accepted).toBe(true);
  expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_CISTERN_SCENE_ID);
  expect(target.completeCisternFamilyWithTools(`${sessionId}.family-a`, "cistern.family_a.calibration").accepted).toBe(true);
  expect(target.completeCisternFamilyWithTools(`${sessionId}.family-b`, "cistern.family_b.transfer").accepted).toBe(true);
  expect(target.snapshot()).toMatchObject({ mode: "cistern", cistern: { completed: true, returnChannelAvailable: true }, killCount: 0 });
  return target;
};

const completeP0AndPrepareTelo = (target: PrologueFlowSession, prefix: string): void => {
  for (let tick = 0; tick < 760 && target.snapshot().runtime.player.position.x < 608; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  for (const wordId of p0.scope.wordIds) for (const [index, kind] of
    (["discover", "attune", "context_0", "context_1", "repair"] as const).entries()) {
    const actionId = `p0.${wordId}.${kind}` as P0LearningActionId;
    expect(target.performP0LearningAction(`${prefix}.p0.${wordId}.${index}`, actionId).accepted, actionId).toBe(true);
  }
  expect(target.performCore120LearningAction(`${prefix}.telo.discover`, "core120.telo.discover").accepted).toBe(true);
  expect(target.performCore120LearningAction(`${prefix}.telo.attune`, "core120.telo.attune").accepted).toBe(true);
};

const globalTrue = (target: PrologueFlowSession, flagId: string): boolean =>
  Object.values(target.snapshot().session.world.flags).some((flag) =>
    flag.scope === "global" && flag.flagId === flagId && flag.value === true
  );

class RecordingCrossSaveCoordinator implements CrossSaveTransactionCoordinator {
  public synchronizeCalls = 0;
  public regionExitCalls = 0;
  private current: GameSession;

  public constructor(session: GameSession) { this.current = session; }
  public readSession(): GameSession { return this.current; }
  public commitOrdinary(batch: SessionProposalBatch): SessionBatchCommitResult {
    const committed = commitSessionProposal(this.current, batch);
    if (committed.committed) this.current = committed.session;
    return committed;
  }
  public synchronizeOrdinarySession(session: GameSession): void {
    this.synchronizeCalls += 1;
    this.current = session;
  }
  public commitDeath(): CrossSaveWalRecord { throw new Error("unused"); }
  public commitProcessing(): CrossSaveWalRecord { throw new Error("unused"); }
  public commitWork(): CrossSaveWalRecord { throw new Error("unused"); }
  public commitConsumption(): CrossSaveWalRecord { throw new Error("unused"); }
  public commitSell(): CrossSaveWalRecord { throw new Error("unused"); }
  public checkpointBarrier(): CrossSaveWalRecovery {
    return { sceneActivationBlocked: false, quarantinedTransactionIds: [], changed: false };
  }
  public regionExitBarrier(): CrossSaveWalRecovery {
    this.regionExitCalls += 1;
    return { sceneActivationBlocked: false, quarantinedTransactionIds: [], changed: false };
  }
  public isSceneActivationReady(): boolean { return true; }
  public toSessionSave(): GameSessionSave { return this.current.toSave(); }
}

class MemoryLocalStorage implements LocalStorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("PrologueFlowSession N07 return-flow integration", () => {
  it("keeps the completed N07 aggregate intact while the underground handoff is unavailable", () => {
    const target = reachCompletedCistern("flow.return.durable-station", (flow) =>
      completeP0AndPrepareTelo(flow, "flow.return.durable-station"));
    const coordinator = BrowserGameSessionWalCoordinator.fresh(
      target.session,
      new LocalStorageDurableJsonStore(new MemoryLocalStorage(), "companion"),
    );
    target.attachCrossSaveTransactionCoordinator(coordinator);
    expect(target.enterReturnFlow("durable-station.entry").accepted).toBe(true);
    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
    for (const [index, actionId] of solution.requiredActions.entries()) {
      expect(target.performReturnFlowAction(`durable-station.action.${index}`, actionId).accepted).toBe(true);
    }
    expect(target.completeReturnFlowSolution("durable-station.complete", solution.id).accepted).toBe(true);
    const before = target.toSave();
    expect(target.returnFlowToSettlement("durable-station.return"))
      .toMatchObject({ accepted: false, result: { reason: "underground_handoff_required" } });
    expect(target.toSave()).toEqual(before);
  }, 15_000);

  it("preserves the completed N07 route and rejects the deferred underground handoff", () => {
    const target = reachCompletedCistern("flow.return.mainline");
    expect(target.enterReturnFlow("flow.return.entry")).toMatchObject({
      accepted: true,
      result: { entryMode: "direct_transition" },
      snapshot: {
        mode: "return_flow",
        runtime: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
        returnFlow: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
        returnFlowProgress: { selectedSolutionId: null, completedActionIds: [] },
        cistern: null,
        killCount: 0,
      },
    });
    expect(globalTrue(target, PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved)).toBe(false);
    expect(target.snapshot().returnFlow?.wawa).toMatchObject({
      discoveryState: "unknown",
      attunementState: "locked",
      learningState: null,
    });

    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
    expect(target.performReturnFlowAction("return.out-of-order", solution.requiredActions[1]!))
      .toMatchObject({ accepted: false, result: { reason: "prerequisite_missing" } });
    for (const [index, actionId] of solution.requiredActions.entries()) {
      const action = target.performReturnFlowAction(`return.action.${index}`, actionId);
      expect(action).toMatchObject({ accepted: true, result: { reason: "committed", solutionId: solution.id } });
      expect(action.snapshot.returnFlowProgress).toEqual({
        selectedSolutionId: solution.id,
        completedActionIds: solution.requiredActions.slice(0, index + 1),
      });
    }
    expect(target.performReturnFlowAction("return.action.0", solution.requiredActions[0]!))
      .toMatchObject({ accepted: true, result: { duplicate: true, reason: "duplicate" } });
    const otherAction = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[1]!.requiredActions[0]!;
    expect(target.performReturnFlowAction("return.mixed", otherAction))
      .toMatchObject({ accepted: false, result: { reason: "transaction_conflict" } });
    expect(Object.keys(target.snapshot().session.receiptIndex).some((id) => id.includes("return-flow-action"))).toBe(false);

    const completed = target.completeReturnFlowSolution("return.complete", solution.id);
    expect(completed).toMatchObject({
      accepted: true,
      result: { reason: "committed" },
      snapshot: {
        returnFlow: { settlementSupplyStable: true, wetMeadowRestored: true, solutionId: solution.id, taskCompleted: true },
        killCount: 0,
      },
    });
    expect(completed.snapshot.returnFlowProgress).toEqual({
      selectedSolutionId: solution.id,
      completedActionIds: solution.requiredActions,
    });
    expect(globalTrue(target, PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved)).toBe(false);
    expect(target.snapshot().returnFlow?.wawa).toMatchObject({
      discoveryState: "unknown",
      attunementState: "locked",
      learningState: null,
    });
    const reloaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(reloaded.snapshot()).toMatchObject({
      mode: "return_flow",
      returnFlow: { solutionId: solution.id, taskCompleted: true },
      returnFlowProgress: { selectedSolutionId: solution.id, completedActionIds: solution.requiredActions },
      killCount: 0,
    });
    expect(globalTrue(reloaded, PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved)).toBe(false);
    const before = reloaded.toSave();
    expect(reloaded.returnFlowToSettlement("return.to-settlement"))
      .toMatchObject({ accepted: false, result: { reason: "underground_handoff_required" } });
    expect(reloaded.toSave()).toEqual(before);
    expect(globalTrue(reloaded, PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved)).toBe(false);
  });

  it("keeps incomplete task-local progress ephemeral across reload and accepted resets", () => {
    const target = reachCompletedCistern("flow.return.ephemeral");
    expect(target.enterReturnFlow("ephemeral.entry").accepted).toBe(true);
    const entryRuntime = target.snapshot().runtime;
    target.advanceTicks(30, { moveX: 1 });
    const movedRuntime = target.snapshot().runtime;
    expect(movedRuntime).toMatchObject({ sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID });
    expect(movedRuntime.tick).toBeGreaterThan(entryRuntime.tick);
    expect(movedRuntime.player.position.x).toBeGreaterThan(entryRuntime.player.position.x);
    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[1]!;
    expect(target.performReturnFlowAction("ephemeral.first", solution.requiredActions[0]!).accepted).toBe(true);
    expect(target.snapshot().runtime.player.position).toEqual(movedRuntime.player.position);
    expect(target.snapshot().returnFlowProgress).toEqual({
      selectedSolutionId: solution.id,
      completedActionIds: [solution.requiredActions[0]],
    });

    const loaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot()).toMatchObject({
      mode: "return_flow",
      runtime: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
      returnFlow: {},
      returnFlowProgress: { selectedSolutionId: null, completedActionIds: [] },
      killCount: 0,
    });
    expect(loaded.snapshot().runtime.player.position).toEqual(loaded.snapshot().session.checkpoint.position);
    expect(loaded.completeReturnFlowSolution("ephemeral.incomplete", solution.id))
      .toMatchObject({ accepted: false, result: { reason: "prerequisite_missing" } });
    expect(loaded.performReturnFlowAction("ephemeral.after-load", solution.requiredActions[0]!).accepted).toBe(true);
    expect(loaded.resetToCheckpoint("ephemeral.reset")).toMatchObject({ accepted: true });
    expect(loaded.snapshot().returnFlowProgress).toEqual({ selectedSolutionId: null, completedActionIds: [] });
    expect(loaded.performReturnFlowAction("ephemeral.after-reset", solution.requiredActions[0]!).accepted).toBe(true);
    expect(loaded.resetArea("ephemeral.softlock")).toMatchObject({ accepted: true });
    expect(loaded.snapshot().returnFlowProgress).toEqual({ selectedSolutionId: null, completedActionIds: [] });
  });

  it("keeps N07 runtime exits isolated until the formal return transaction commits", () => {
    const target = reachCompletedCistern("flow.return.runtime-isolation");
    expect(target.enterReturnFlow("runtime-isolation.entry").accepted).toBe(true);
    target.advanceTicks(900, { moveX: 1 });
    expect(target.snapshot()).toMatchObject({
      mode: "return_flow",
      runtime: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
      returnFlow: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
    });
    expect(globalTrue(target, PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved)).toBe(false);
  });

  it("commits a Core120 world-context witness at the authored N07 target and reloads it", () => {
    const target = reachCompletedCistern("flow.return.core120", (flow) =>
      completeP0AndPrepareTelo(flow, "flow.return.core120"));
    expect(target.enterReturnFlow("flow.return.core120.entry").accepted).toBe(true);
    const word = () => target.core120LearningView().words.find((candidate) => candidate.wordId === "telo");
    for (let tick = 0; tick < 600 && word()?.availableActionId !== "core120.telo.context_0"; tick += 1) {
      target.advanceTicks(1, { moveX: 1 });
    }
    expect(Math.hypot(target.snapshot().runtime.player.position.x - 25 * 16,
      target.snapshot().runtime.player.position.y - 24 * 16)).toBeLessThanOrEqual(16);
    expect({ runtime: target.snapshot().runtime, view: target.core120LearningView(), word: word() }).toMatchObject({
      runtime: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
      view: { mode: "world_context", authorityInRange: true, station: { inRange: false } },
      word: { nextActionId: "core120.telo.context_0", availableActionId: "core120.telo.context_0" },
    });
    expect(target.performCore120LearningAction("flow.return.core120.context", "core120.telo.context_0"))
      .toMatchObject({ accepted: true, result: { accepted: true, reason: "committed" } });
    expect(word()?.completedActionIds).toContain("core120.telo.context_0");
    const loaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().mode).toBe("return_flow");
    expect(loaded.core120LearningView().words.find((candidate) => candidate.wordId === "telo")?.completedActionIds)
      .toContain("core120.telo.context_0");
    expect(loaded.performCore120LearningAction("flow.return.core120.duplicate", "core120.telo.context_0"))
      .toMatchObject({ accepted: true, result: { accepted: true, duplicate: true } });
  }, 15_000);

  it("delegates inert wawa learning without exposing provenance or world facts", () => {
    const target = reachCompletedCistern("flow.return.wawa");
    expect(target.enterReturnFlow("wawa.entry").accepted).toBe(true);
    expect(target.discoverReturnFlowWawa("wawa.discover"))
      .toMatchObject({ accepted: true, result: { evidenceGranted: true } });
    expect(target.attuneReturnFlowWawa("wawa.attune"))
      .toMatchObject({ accepted: true, result: { evidenceGranted: true } });
    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[2]!;
    const attempt = {
      solutionId: solution.id,
      promptLevel: 1 as const,
      predictedForceContrastCorrect: true,
      worldOutcomeContribution: true,
    };
    expect(target.groundReturnFlowWawa("wawa.before", attempt))
      .toMatchObject({ accepted: false, result: { reason: "ineligible_evidence" } });
    solution.requiredActions.forEach((actionId, index) => {
      expect(target.performReturnFlowAction(`wawa.action.${index}`, actionId).accepted).toBe(true);
    });
    expect(target.completeReturnFlowSolution("wawa.complete", solution.id).accepted).toBe(true);
    expect(target.groundReturnFlowWawa("wawa.ground", attempt))
      .toMatchObject({ accepted: true, result: { evidenceGranted: true } });
    const evidence = target.snapshot().session.learning.words.wawa!.evidence.at(-1)!;
    expect(evidence.sourceObjectClass).toBe("inert_return_flow_mechanism");
    expect(evidence.variantHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(target.snapshot().killCount).toBe(0);
  });

  it("synchronizes formal N07 commits without emitting the unavailable underground exit barrier", () => {
    const target = reachCompletedCistern("flow.return.cross-save");
    const coordinator = new RecordingCrossSaveCoordinator(target.session);
    target.attachCrossSaveTransactionCoordinator(coordinator);
    expect(target.enterReturnFlow("cross-save.entry").accepted).toBe(true);
    expect(coordinator.regionExitCalls).toBe(1);
    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
    solution.requiredActions.forEach((actionId, index) => {
      expect(target.performReturnFlowAction(`cross-save.action.${index}`, actionId).accepted).toBe(true);
    });
    const synchronizedBefore = coordinator.synchronizeCalls;
    expect(target.completeReturnFlowSolution("cross-save.complete", solution.id).accepted).toBe(true);
    expect(coordinator.synchronizeCalls).toBeGreaterThan(synchronizedBefore);
    expect(target.returnFlowToSettlement("cross-save.return"))
      .toMatchObject({ accepted: false, result: { reason: "underground_handoff_required" } });
    expect(coordinator.regionExitCalls).toBe(1);
    expect(target.snapshot()).toMatchObject({ mode: "return_flow", killCount: 0 });
  });
});
