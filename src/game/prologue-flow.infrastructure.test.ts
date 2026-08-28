import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeInfrastructureTaskManifestIndex } from "../content/runtime-task-manifest";
import { PROLOGUE_STREAM_SCENE_ID } from "./prologue-arrival-stream";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "./prologue-settlement";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
} from "./prologue-waterwheel";
import { PrologueFlowSession } from "./prologue-flow";

const tasks = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const waterwheelTask = tasks.byId.ch01_waterwheel!;
const serviceTask = tasks.byId.ch01_service_channel!;

const requiredActions = (taskId: string, solutionId: string): readonly string[] =>
  tasks.byId[taskId]!.solutions.find((solution) => solution.id === solutionId)!.requiredActions;

const goRightUntil = (target: PrologueFlowSession, sceneId: string, maximumTicks = 900): void => {
  for (let tick = 0; tick < maximumTicks && target.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  expect(target.snapshot().runtime.sceneId).toBe(sceneId);
};

const enterSettlement = (target: PrologueFlowSession, prefix: string): void => {
  goRightUntil(target, PROLOGUE_STREAM_SCENE_ID);
  expect(target.pushLooseStone(`${prefix}.stone`).accepted).toBe(true);
  goRightUntil(target, PROLOGUE_SETTLEMENT_SCENE_ID);
  expect(target.snapshot()).toMatchObject({ mode: "settlement", infrastructure: null, killCount: 0 });
};

const enterWaterwheel = (target: PrologueFlowSession, prefix: string): void => {
  enterSettlement(target, prefix);
  const entry = target.enterWaterwheel(`${prefix}.waterwheel.entry`);
  expect(entry).toMatchObject({ accepted: true, reason: "delegated" });
  expect(target.snapshot()).toMatchObject({
    mode: "infrastructure",
    runtime: { sceneId: PROLOGUE_WATERWHEEL_SCENE_ID },
    arrival: null,
    settlement: null,
    infrastructure: { sceneManifestId: PROLOGUE_WATERWHEEL_SCENE_ID, killCount: 0 },
    killCount: 0,
  });
};

const primeWaterwheel = (target: PrologueFlowSession, prefix: string): void => {
  const observation = {
    angularVelocityRpm: 12,
    elapsedTicks: 600,
    downstreamFlowBand: "safe" as const,
    overflowContact: false,
  };
  expect(target.observeWaterwheelPhysics(`${prefix}.physics`, observation)).toMatchObject({
    accepted: true,
    reason: "delegated",
  });
};

const repairWaterwheel = (target: PrologueFlowSession, prefix: string): void => {
  primeWaterwheel(target, prefix);
  const solutionId = "waterwheel.repair_axle";
  expect(target.completeWaterwheelSolution(`${prefix}.solution`, solutionId, {
    completedActionIds: requiredActions(waterwheelTask.id, solutionId),
    world: {
      axleSupported: true,
      wheelRotatesFreely: true,
      downstreamFlowBandSafe: true,
    },
  })).toMatchObject({ accepted: true, reason: "delegated" });
};

describe("PrologueFlowSession N03/N04 integration", () => {
  it("coordinates N02 -> N03 -> N04 -> N03 -> N02 on one zero-kill ledger", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.infrastructure.roundtrip" });
    enterWaterwheel(target, "roundtrip");
    const afterEntry = target.snapshot().session;
    expect(afterEntry.checkpoint).toMatchObject({
      id: "checkpoint.valley.waterwheel.entry",
      sceneId: PROLOGUE_WATERWHEEL_SCENE_ID,
    });
    expect(Object.values(afterEntry.receiptIndex).some((receipt) =>
      receipt.payloadHash.includes("infrastructure:waterwheel_entry")
    )).toBe(true);

    repairWaterwheel(target, "roundtrip.waterwheel");
    expect(target.enterServiceChannel("roundtrip.service.entry")).toMatchObject({ accepted: true });
    expect(target.snapshot()).toMatchObject({
      mode: "infrastructure",
      runtime: { sceneId: PROLOGUE_SERVICE_CHANNEL_SCENE_ID },
      infrastructure: { mode: "service_channel" },
      killCount: 0,
    });

    const serviceSolutionId = "service.open_bypass_valve";
    expect(target.completeServiceSolution("roundtrip.service.solution", serviceSolutionId, {
      completedActionIds: requiredActions(serviceTask.id, serviceSolutionId),
      world: { bypassValveOpen: true, bypassRouteClear: true },
    })).toMatchObject({ accepted: true });
    expect(target.snapshot().infrastructure?.serviceChannel.cisternReady).toBe(true);
    expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_SERVICE_CHANNEL_SCENE_ID);

    expect(target.returnToWaterwheel("roundtrip.waterwheel.return")).toMatchObject({ accepted: true });
    expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_WATERWHEEL_SCENE_ID);
    expect(target.returnToSettlement("roundtrip.settlement.return")).toMatchObject({ accepted: true });
    expect(target.snapshot()).toMatchObject({
      mode: "settlement",
      runtime: { sceneId: PROLOGUE_SETTLEMENT_SCENE_ID },
      infrastructure: null,
      killCount: 0,
    });
    expect(Object.values(target.snapshot().session.receiptIndex).some((receipt) =>
      receipt.payloadHash.includes("infrastructure:settlement_return")
    )).toBe(true);
  });

  it("keeps structural repair across save/load and drops temporary drive", () => {
    const structural = PrologueFlowSession.fresh({ sessionId: "flow.infrastructure.structural" });
    enterWaterwheel(structural, "structural");
    repairWaterwheel(structural, "structural.complete");
    const structuralLoad = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(structural.toSave())));
    expect(structuralLoad.snapshot()).toMatchObject({
      mode: "infrastructure",
      infrastructure: { waterwheel: { activeMode: "structurally_restored", structurallyRestored: true } },
      killCount: 0,
    });

    const temporary = PrologueFlowSession.fresh({ sessionId: "flow.infrastructure.temporary" });
    enterWaterwheel(temporary, "temporary");
    primeWaterwheel(temporary, "temporary.complete");
    const solutionId = "waterwheel.manifest_then_lock";
    expect(temporary.completeWaterwheelSolution("temporary.complete.solution", solutionId, {
      completedActionIds: requiredActions(waterwheelTask.id, solutionId),
      world: {
        temporaryFlowReachesWheel: true,
        mechanicalLockEngaged: true,
        downstreamFlowBandSafe: true,
      },
    })).toMatchObject({ accepted: true });
    expect(temporary.snapshot().infrastructure?.waterwheel.activeMode).toBe("temporary_driven");
    const temporaryLoad = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(temporary.toSave())));
    expect(temporaryLoad.snapshot().infrastructure?.waterwheel).toMatchObject({
      activeMode: "stopped",
      persistedResultMode: "temporary_driven",
    });
  });

  it("restores the durable Waterwheel lower-maintenance context through flow save/load", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.infrastructure.lower-maintenance" });
    enterWaterwheel(target, "lower-maintenance");
    repairWaterwheel(target, "lower-maintenance.waterwheel");
    expect(target.enterServiceChannel("lower-maintenance.enter")).toMatchObject({ accepted: true });

    const loaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot()).toMatchObject({
      mode: "infrastructure",
      infrastructure: {
        mode: "service_channel",
        taskId: serviceTask.id,
        session: { checkpoint: { id: "checkpoint.valley.waterwheel.lower_maintenance.entry" } },
      },
    });
    expect(loaded.readGrammarOSign("lower-maintenance.o")).toMatchObject({ accepted: true });
    expect(loaded.completeServiceSolution("lower-maintenance.solution", "service.open_bypass_valve", {
      completedActionIds: requiredActions(serviceTask.id, "service.open_bypass_valve"),
      world: { bypassValveOpen: true, bypassRouteClear: true },
    })).toMatchObject({ accepted: true });
  });

  it("wraps tawa/o, checkpoint/recovery, idempotency and fail-closed mode guards", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.infrastructure.contract" });
    expect(target.discoverTawa("wrong-mode.tawa")).toMatchObject({
      accepted: false,
      reason: "wrong_mode",
      result: null,
    });
    enterWaterwheel(target, "contract");
    expect(target.discoverTawa("contract.tawa.discover")).toMatchObject({ accepted: true });
    expect(target.attuneTawa("contract.tawa.attune")).toMatchObject({ accepted: true });
    expect(target.groundTawa("contract.tawa.ground", {
      solutionId: "waterwheel.move_flume",
      promptLevel: 1,
      predictedMotionCorrect: true,
      worldOutcomeContribution: true,
      toolBypass: false,
    })).toMatchObject({ accepted: true, result: { evidenceGranted: true } });

    const observation = {
      angularVelocityRpm: 12,
      elapsedTicks: 600,
      downstreamFlowBand: "safe" as const,
      overflowContact: false,
    };
    expect(target.observeWaterwheelPhysics("contract.physics", observation).result?.reason).toBe("committed");
    expect(target.observeWaterwheelPhysics("contract.physics", observation).result?.reason).toBe("duplicate");
    expect(target.setCheckpoint("contract.checkpoint", "checkpoint.contract")).toMatchObject({ accepted: true });
    expect(target.resetToCheckpoint("contract.reset")).toMatchObject({ accepted: true });
    expect(target.recoverInfrastructureSoftLock("contract.recover")).toMatchObject({ accepted: true });

    repairWaterwheel(target, "contract.repair");
    expect(target.enterServiceChannel("contract.service.entry")).toMatchObject({ accepted: true });
    expect(target.readGrammarOSign("contract.o.read")).toMatchObject({ accepted: true });
    expect(target.acceptGrammarOReceptivePrompt("contract.o.accept", true)).toMatchObject({
      accepted: true,
      result: { evidenceGranted: false },
    });
    expect(target.snapshot().infrastructure?.language).toMatchObject({
      grammarOSeen: true,
      grammarOReceptiveAccepted: true,
      grammarOMastered: false,
    });
    expect(target.usePublicRelief("wrong-mode.relief")).toMatchObject({
      accepted: false,
      reason: "wrong_mode",
      result: null,
    });
    expect(target.snapshot().killCount).toBe(0);
  });
});
