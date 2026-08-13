import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeInfrastructureTaskManifestIndex } from "../content/runtime-task-manifest";
import { GameSession } from "../session/game-session";
import {
  PROLOGUE_INFRASTRUCTURE_REGION_FLAGS,
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_SERVICE_SOLUTION_IDS,
  PROLOGUE_WATERWHEEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SOLUTION_IDS,
  PrologueWaterwheelSession,
  createPrologueWaterwheelInitialSession,
  type ServiceSolutionEvidence,
  type WaterwheelSolutionEvidence,
} from "./prologue-waterwheel";

const TASKS = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const WATERWHEEL_TASK = TASKS.byId.ch01_waterwheel!;
const SERVICE_TASK = TASKS.byId.ch01_service_channel!;

const requiredActions = (taskId: string, solutionId: string): readonly string[] => {
  const task = TASKS.byId[taskId]!;
  return task.solutions.find((solution) => solution.id === solutionId)!.requiredActions;
};

const waterWorldBySolution: Readonly<Record<string, WaterwheelSolutionEvidence["world"]>> = {
  "waterwheel.clear_natural_inflow": {
    naturalInflowReachesWheel: true,
    axleAlignmentSafe: true,
    downstreamFlowBandSafe: true,
  },
  "waterwheel.repair_axle": {
    axleSupported: true,
    wheelRotatesFreely: true,
    downstreamFlowBandSafe: true,
  },
  "waterwheel.move_flume": {
    flumeAlignmentInBand: true,
    flumeLockEngaged: true,
    downstreamFlowBandSafe: true,
  },
  "waterwheel.dig_bypass": {
    bypassFlowReachesWheel: true,
    bankErosionBelowLimit: true,
    downstreamFlowBandSafe: true,
  },
  "waterwheel.manifest_then_lock": {
    temporaryFlowReachesWheel: true,
    mechanicalLockEngaged: true,
    downstreamFlowBandSafe: true,
  },
};

const serviceWorldBySolution: Readonly<Record<string, ServiceSolutionEvidence["world"]>> = {
  "service.open_bypass_valve": { bypassValveOpen: true, bypassRouteClear: true },
  "service.place_wood_platform": { platformSupported: true, platformClearanceSafe: true },
  "service.dig_wet_soil": { gateTrackClear: true, bankSlumpBelowLimit: true },
  "service.move_stone_baffle": { stoneBaffleOffTrack: true, baffleChocked: true },
  "service.external_heat_thin_ice": {
    externalHeatSourcePresent: true,
    thinIceMelted: true,
    woodTemperatureBelowIgnition: true,
  },
  "service.optional_material_magic": { livingOverlapFalse: true, gateTrackClear: true },
};

const fresh = (id: string): PrologueWaterwheelSession => new PrologueWaterwheelSession(
  createPrologueWaterwheelInitialSession({ sessionId: id }),
);

const primePhysics = (session: PrologueWaterwheelSession, id: string): void => {
  const result = session.observeWaterwheelPhysics(id, {
    angularVelocityRpm: 12,
    elapsedTicks: 600,
    downstreamFlowBand: "safe",
    overflowContact: false,
  });
  expect(result.accepted).toBe(true);
  expect(result.snapshot.waterwheel.physicsReady).toBe(true);
};

const finishWaterwheel = (
  session: PrologueWaterwheelSession,
  solutionId: string,
  prefix: string,
): void => {
  primePhysics(session, `${prefix}.physics`);
  const result = session.completeWaterwheelSolution(`${prefix}.solution`, solutionId, {
    completedActionIds: requiredActions(WATERWHEEL_TASK.id, solutionId),
    world: waterWorldBySolution[solutionId]!,
  });
  expect(result.accepted).toBe(true);
  expect(result.snapshot.killCount).toBe(0);
};

const enterService = (session: PrologueWaterwheelSession, prefix: string): void => {
  finishWaterwheel(session, "waterwheel.clear_natural_inflow", `${prefix}.waterwheel`);
  const entry = session.enterServiceChannel(`${prefix}.service.entry`);
  expect(entry.accepted).toBe(true);
  expect(entry.snapshot.mode).toBe("service_channel");
  expect(Object.values(entry.snapshot.session.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === "valley_prologue" &&
    flag.flagId === PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceChannelReached && flag.value === true
  )).toBe(true);
};

const regionFlag = (session: PrologueWaterwheelSession, flagId: string) =>
  Object.values(session.snapshot().session.world.flags).find((flag) =>
    flag.scope === "region" && flag.flagId === flagId
  );

describe("PrologueWaterwheelSession generated N03/N04 slice", () => {
  it("derives the playable scene/task/solution contract from generated content", () => {
    const snapshot = fresh("infra.contract").snapshot();
    expect(snapshot.sceneManifestId).toBe(PROLOGUE_WATERWHEEL_SCENE_ID);
    expect(snapshot.taskId).toBe(WATERWHEEL_TASK.id);
    expect(snapshot.waterwheel.solutionIds).toEqual(PROLOGUE_WATERWHEEL_SOLUTION_IDS);
    expect(PROLOGUE_WATERWHEEL_SOLUTION_IDS).toHaveLength(5);
    expect(PROLOGUE_SERVICE_SOLUTION_IDS).toHaveLength(6);
    expect(snapshot.softLockRecovery.maximumSeconds).toBeLessThanOrEqual(60);
    expect(snapshot.killCount).toBe(0);
  });

  it.each(PROLOGUE_WATERWHEEL_SOLUTION_IDS)(
    "supports authored waterwheel solution %s behind stable typed physics",
    (solutionId) => {
      const session = fresh(`infra.water.${solutionId}`);
      const early = session.completeWaterwheelSolution("too-early", solutionId, {
        completedActionIds: requiredActions(WATERWHEEL_TASK.id, solutionId),
        world: waterWorldBySolution[solutionId]!,
      });
      expect(early.reason).toBe("unstable_physics");

      finishWaterwheel(session, solutionId, "complete");
      const snapshot = session.snapshot();
      expect(regionFlag(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelStable)?.value).toBe(true);
      expect(regionFlag(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.downstreamSafe)?.value).toBe(true);
      expect(regionFlag(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.maintenanceAccessOpen)?.value).toBe(true);
      expect(snapshot.waterwheel.activeMode).toBe(
        WATERWHEEL_TASK.solutions.find((solution) => solution.id === solutionId)!.resultMode,
      );
    },
  );

  it("is idempotent for identical payloads and rejects a reused transaction with another payload", () => {
    const session = fresh("infra.idempotency");
    const sample = {
      angularVelocityRpm: 12,
      elapsedTicks: 600,
      downstreamFlowBand: "safe" as const,
      overflowContact: false,
    };
    expect(session.observeWaterwheelPhysics("same", sample).reason).toBe("committed");
    expect(session.observeWaterwheelPhysics("same", sample).reason).toBe("duplicate");
    expect(session.observeWaterwheelPhysics("same", { ...sample, angularVelocityRpm: 13 }).reason)
      .toBe("transaction_conflict");
  });

  it("drops temporary drive on save/load and revisit while structural repair persists", () => {
    const temporary = fresh("infra.temporary");
    finishWaterwheel(temporary, "waterwheel.manifest_then_lock", "temporary");
    expect(temporary.snapshot().waterwheel.activeMode).toBe("temporary_driven");
    const loadedTemporary = PrologueWaterwheelSession.fromSave(temporary.toSave());
    expect(loadedTemporary.snapshot().waterwheel.activeMode).toBe("stopped");
    expect(loadedTemporary.snapshot().waterwheel.persistedResultMode).toBe("temporary_driven");

    const structural = fresh("infra.structural");
    finishWaterwheel(structural, "waterwheel.repair_axle", "structural");
    const loadedStructural = PrologueWaterwheelSession.fromSave(structural.toSave());
    expect(loadedStructural.snapshot().waterwheel.activeMode).toBe("structurally_restored");
    expect(loadedStructural.snapshot().waterwheel.structurallyRestored).toBe(true);
  });

  it.each(["service.open_bypass_valve", "service.place_wood_platform"])(
    "supports independent non-magic N04 route %s and exposes only readiness for the later cistern handoff",
    (solutionId) => {
      const session = fresh(`infra.service.${solutionId}`);
      enterService(session, "route");
      const completed = session.completeServiceSolution("route.service.solution", solutionId, {
        completedActionIds: requiredActions(SERVICE_TASK.id, solutionId),
        world: serviceWorldBySolution[solutionId]!,
      });
      expect(completed.accepted).toBe(true);
      expect(completed.snapshot.sceneManifestId).toBe(PROLOGUE_SERVICE_CHANNEL_SCENE_ID);
      expect(completed.snapshot.serviceChannel.routeOpen).toBe(true);
      expect(completed.snapshot.serviceChannel.cisternReady).toBe(true);
      expect(completed.snapshot.session.world.currentSceneId).toBe(PROLOGUE_SERVICE_CHANNEL_SCENE_ID);
      expect(completed.snapshot.killCount).toBe(0);
    },
  );

  it("discovers, attunes and grounds tawa at low hint while a tool bypass grants zero evidence", () => {
    const session = fresh("infra.tawa");
    expect(session.discoverTawa("tawa.discover").evidenceGranted).toBe(true);
    expect(session.attuneTawa("tawa.attune").evidenceGranted).toBe(true);
    const beforeBypass = session.snapshot().session.learning.words.tawa!.evidence.length;
    const bypass = session.groundTawa("tawa.bypass", {
      solutionId: "waterwheel.repair_axle",
      promptLevel: 0,
      predictedMotionCorrect: true,
      worldOutcomeContribution: true,
      toolBypass: true,
    });
    expect(bypass.reason).toBe("tool_bypass_no_evidence");
    expect(bypass.evidenceGranted).toBe(false);
    expect(session.snapshot().session.learning.words.tawa!.evidence).toHaveLength(beforeBypass);

    const grounded = session.groundTawa("tawa.grounded", {
      solutionId: "waterwheel.move_flume",
      promptLevel: 1,
      predictedMotionCorrect: true,
      worldOutcomeContribution: true,
      toolBypass: false,
    });
    expect(grounded.evidenceGranted).toBe(true);
    expect(grounded.snapshot.language.tawaLearningState).toBe("grounded");
  });

  it("records o as receptive grammar contact without granting word mastery", () => {
    const session = fresh("infra.grammar-o");
    enterService(session, "grammar");
    expect(session.readGrammarOSign("grammar.o.read").accepted).toBe(true);
    const accepted = session.acceptGrammarOReceptivePrompt("grammar.o.accept", true);
    expect(accepted.accepted).toBe(true);
    expect(accepted.evidenceGranted).toBe(false);
    expect(accepted.snapshot.language.grammarOSeen).toBe(true);
    expect(accepted.snapshot.language.grammarOReceptiveAccepted).toBe(true);
    expect(accepted.snapshot.language.grammarOMastered).toBe(false);
    expect(accepted.snapshot.session.learning.words.o).toBeUndefined();
  });

  it("round-trips the sole GameSession save and resets area state without erasing region progress", () => {
    const session = fresh("infra.save-reset");
    finishWaterwheel(session, "waterwheel.repair_axle", "persist");
    expect(session.setCheckpoint("checkpoint.set", "checkpoint.test", { x: 48, y: 64 }).accepted).toBe(true);
    expect(session.resetToCheckpoint("checkpoint.reset").accepted).toBe(true);
    expect(session.snapshot().waterwheel.stableTicks).toBe(0);
    expect(session.snapshot().waterwheel.structurallyRestored).toBe(true);

    const save = session.toSave();
    const loaded = PrologueWaterwheelSession.fromSave(save);
    expect(loaded.snapshot().session).toEqual(session.snapshot().session);
    expect(loaded.snapshot().waterwheel.structurallyRestored).toBe(true);
    const recovery = loaded.recoverSoftLock("softlock.recover");
    expect(recovery.accepted).toBe(true);
    expect(recovery.snapshot.softLockRecovery.maximumSeconds).toBeLessThanOrEqual(60);
    expect(recovery.snapshot.waterwheel.structurallyRestored).toBe(true);
  });

  it("guards the generated settlement-to-waterwheel entry and supports the canonical transition", () => {
    const source = GameSession.create({
      sessionId: "infra.entry",
      mp: { currentMp: 12, maxMp: 12, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement",
    });
    expect(PrologueWaterwheelSession.enterFromSettlement(source, "entry.denied").reason)
      .toBe("entry_guard_failed");
    expect(source.apply({
      eventId: "test.settlement.reached",
      sequence: source.nextSequence(),
      type: "world_flag_set",
      payload: { flagId: "settlement_reached", value: true, scope: "region", regionId: "valley_prologue" },
    }).applied).toBe(true);
    const entry = PrologueWaterwheelSession.enterFromSettlement(source, "entry.allowed");
    expect(entry.accepted).toBe(true);
    expect(entry.infrastructure?.snapshot().sceneManifestId).toBe(PROLOGUE_WATERWHEEL_SCENE_ID);
    expect(entry.infrastructure?.snapshot().killCount).toBe(0);
  });
});
