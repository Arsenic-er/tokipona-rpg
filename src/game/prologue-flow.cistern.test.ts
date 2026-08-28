import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeInfrastructureTaskManifestIndex } from "../content/runtime-task-manifest";
import { PROLOGUE_STREAM_SCENE_ID } from "./prologue-arrival-stream";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "./prologue-settlement";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
} from "./prologue-waterwheel";
import {
  PROLOGUE_CISTERN_REGION_FLAGS,
  PROLOGUE_CISTERN_SCENE_ID,
} from "./prologue-cistern";
import {
  PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX,
  PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX,
  PrologueFlowSession,
} from "./prologue-flow";

const tasks = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const waterwheelTask = tasks.byId.ch01_waterwheel!;
const serviceTask = tasks.byId.ch01_service_channel!;

const requiredActions = (taskId: string, solutionId: string): readonly string[] =>
  tasks.byId[taskId]!.solutions.find((solution) => solution.id === solutionId)!.requiredActions;

const goRightUntil = (target: PrologueFlowSession, sceneId: string, maximumTicks = 1_200): void => {
  for (let tick = 0; tick < maximumTicks && target.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  expect(target.snapshot().runtime.sceneId).toBe(sceneId);
};

const reachReadyService = (target: PrologueFlowSession, prefix: string): void => {
  goRightUntil(target, PROLOGUE_STREAM_SCENE_ID);
  expect(target.pushLooseStone(`${prefix}.stone`).accepted).toBe(true);
  goRightUntil(target, PROLOGUE_SETTLEMENT_SCENE_ID);
  expect(target.enterWaterwheel(`${prefix}.waterwheel.entry`).accepted).toBe(true);
  expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_WATERWHEEL_SCENE_ID);

  const observation = {
    angularVelocityRpm: 12,
    elapsedTicks: 600,
    downstreamFlowBand: "safe" as const,
    overflowContact: false,
  };
  expect(target.observeWaterwheelPhysics(`${prefix}.physics`, observation).accepted).toBe(true);
  const wheelSolution = "waterwheel.repair_axle";
  expect(target.completeWaterwheelSolution(`${prefix}.wheel`, wheelSolution, {
    completedActionIds: requiredActions(waterwheelTask.id, wheelSolution),
    world: { axleSupported: true, wheelRotatesFreely: true, downstreamFlowBandSafe: true },
  }).accepted).toBe(true);
  expect(target.enterServiceChannel(`${prefix}.service.entry`).accepted).toBe(true);
  expect(target.snapshot().runtime.sceneId).toBe(PROLOGUE_SERVICE_CHANNEL_SCENE_ID);

  const serviceSolution = "service.open_bypass_valve";
  expect(target.completeServiceSolution(`${prefix}.service`, serviceSolution, {
    completedActionIds: requiredActions(serviceTask.id, serviceSolution),
    world: { bypassValveOpen: true, bypassRouteClear: true },
  }).accepted).toBe(true);
  expect(target.snapshot().infrastructure?.serviceChannel.cisternReady).toBe(true);
};

const regionTrue = (target: PrologueFlowSession, flagId: string): boolean =>
  Object.values(target.snapshot().session.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === "valley_prologue" && flag.flagId === flagId && flag.value === true
  );

describe("PrologueFlowSession N05 integration", () => {
  it("hands N04 to N05 explicitly with one verified capacity milestone, save/load, and zero kills", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.cistern.direct" });
    expect(target.previewCisternCast()).toMatchObject({ accepted: false, reason: "wrong_mode", result: null });
    reachReadyService(target, "direct");
    expect(target.snapshot().session.capabilities.expressionCapacityWords).toBe(1);
    expect(target.snapshot().session.mp.maxMp).toBe(24);

    const entry = target.enterCistern("direct.cistern.entry");
    expect(entry).toMatchObject({ accepted: true, reason: "delegated", result: { entryMode: "direct_transition" } });
    expect(target.snapshot()).toMatchObject({
      mode: "cistern",
      runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
      arrival: null,
      settlement: null,
      infrastructure: null,
      cistern: { expressionCapacityWords: 2, killCount: 0 },
      session: {
        mp: { currentMp: 24, maxMp: 26 },
        capabilities: { expressionCapacityWords: 2, focusSlots: 2, revision: 1 },
      },
      killCount: 0,
    });
    const state = target.snapshot().session;
    expect(Object.keys(state.capabilities.appliedMilestones)).toEqual(["pre_cistern_length_phrase"]);
    expect(state.processedEventPayloads[
      `session.capability.first_evidence_package_committed.${PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX}:flow.cistern.direct`
    ]).toBeDefined();

    const loaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().session).toEqual(target.snapshot().session);
    expect(loaded.snapshot()).toMatchObject({ mode: "cistern", cistern: { expressionCapacityWords: 2 }, killCount: 0 });
    const revision = loaded.snapshot().session.revision;
    loaded.advanceTicks(5);
    expect(loaded.snapshot().session.revision).toBe(revision);
  });

  it("charges a legal wrong cast, completes two independent families atomically, and preserves no-evidence tool bypass", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.cistern.contract" });
    reachReadyService(target, "contract");
    expect(target.enterCistern("contract.cistern.entry").accepted).toBe(true);

    const learningBefore = target.snapshot().session.learning;
    target.setCisternExpression("telo");
    target.setCisternDirection("east");
    target.setCisternTargetAnchorPx({ x: 20, y: 20 });
    expect(target.previewCisternCast()).toMatchObject({
      accepted: true,
      result: { reason: "preview_ready", preview: { plan: { canConfirm: true } } },
    });
    expect(target.confirmCisternCast("contract.wrong-short")).toMatchObject({
      accepted: true,
      result: {
        reason: "incorrect_length",
        correctLength: false,
        receiverSatisfied: false,
        evidence: null,
        confirmation: { execution: { mpCharge: 5 } },
      },
      snapshot: { cistern: { stages: { short: false, default: false, long: false } } },
    });
    expect(target.snapshot().session.mp.currentMp).toBe(19);

    const familyA = "cistern.family_a.calibration";
    const familyB = "cistern.family_b.transfer";
    expect(target.completeCisternFamilyWithTools("contract.family-a", familyA)).toMatchObject({
      accepted: true,
      result: { reason: "tool_bypass_no_evidence" },
      snapshot: { cistern: { completed: false } },
    });
    expect(target.snapshot().cistern?.families).toMatchObject({ [familyA]: true, [familyB]: false });
    expect(target.snapshot().session.learning).toEqual(learningBefore);
    expect(regionTrue(target, PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected)).toBe(false);

    const completed = target.completeCisternFamilyWithTools("contract.family-b", familyB);
    expect(completed).toMatchObject({
      accepted: true,
      result: { reason: "tool_bypass_no_evidence" },
      snapshot: { cistern: { completed: true, returnChannelAvailable: true } },
    });
    for (const flagId of [
      PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected,
      PROLOGUE_CISTERN_REGION_FLAGS.upperChannelAvailable,
      PROLOGUE_CISTERN_REGION_FLAGS.exitLadderLowered,
    ]) expect(regionTrue(target, flagId)).toBe(true);
    expect(target.snapshot().session.learning).toEqual(learningBefore);
    expect(target.snapshot().killCount).toBe(0);

    expect(target.completeCisternFamilyWithTools("contract.family-b", familyB)).toMatchObject({
      accepted: true,
      result: { duplicate: true, reason: "duplicate" },
    });
    expect(Object.keys(target.snapshot().session.capabilities.appliedMilestones)).toHaveLength(1);
    const beforeCheckpointSet = target.snapshot().session;
    expect(target.setCheckpoint("contract.unsupported-checkpoint", "checkpoint.cistern.custom")).toMatchObject({
      accepted: false,
      reason: "delegate_rejected",
      result: null,
    });
    expect(target.snapshot().session.mp).toEqual(beforeCheckpointSet.mp);
    expect(target.snapshot().session.checkpoint).toEqual(beforeCheckpointSet.checkpoint);
    expect(target.snapshot().session.receiptIndex["contract.unsupported-checkpoint"]).toBeUndefined();
    expect(target.recoverCisternAtCheckpoint("contract.recover-mp")).toMatchObject({ accepted: true });
    expect(target.snapshot().session.mp.currentMp).toBeGreaterThan(beforeCheckpointSet.mp.currentMp);
    expect(target.resetToCheckpoint("contract.reset")).toMatchObject({ accepted: true });
    expect(target.recoverCisternSoftLock("contract.softlock")).toMatchObject({ accepted: true });
    expect(target.snapshot()).toMatchObject({ mode: "cistern", cistern: { completed: true }, killCount: 0 });
  });

  it("adopts the generated guarded runtime transition once and remains at the N05 safe exit", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.cistern.adopt" });
    reachReadyService(target, "adopt");
    const runtimeSession = target.session;
    expect(runtimeSession.apply({
      eventId: "runtime.scene.reconcile.scene.valley.waterwheel->scene.valley.high_cistern",
      sequence: runtimeSession.nextSequence(),
      type: "scene_entered",
      payload: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
    })).toMatchObject({ applied: true });
    const recovered = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));

    expect(recovered.snapshot()).toMatchObject({
      mode: "cistern",
      cistern: { expressionCapacityWords: 2 },
      killCount: 0,
    });
    expect(Object.keys(recovered.snapshot().session.capabilities.appliedMilestones)).toEqual(["pre_cistern_length_phrase"]);
    const entryReceipt = Object.keys(recovered.snapshot().session.receiptIndex).find((id) =>
      id.includes(`${PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX}:flow.cistern.adopt`)
    );
    expect(entryReceipt).toBeDefined();
    expect(recovered.enterCistern("adopt.second-entry")).toMatchObject({ accepted: false, reason: "wrong_mode" });

    recovered.completeCisternFamilyWithTools("adopt.family-a", "cistern.family_a.calibration");
    recovered.completeCisternFamilyWithTools("adopt.family-b", "cistern.family_b.transfer");
    const revision = recovered.snapshot().session.revision;
    recovered.advanceTicks(60, { moveX: 1 });
    expect(recovered.snapshot()).toMatchObject({
      mode: "cistern",
      runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID },
      cistern: { completed: true, returnChannelAvailable: true },
      killCount: 0,
    });
    expect(recovered.snapshot().session.revision).toBe(revision);
  });
  it("does not leak the capacity milestone when N05 entry rejects on the provisional clone", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.cistern.atomic-failure" });
    reachReadyService(target, "atomic-failure");
    const authority = target.session;
    expect(authority.apply({
      eventId: "test.cistern.entry.conflict",
      sequence: authority.nextSequence(),
      type: "receipt_recorded",
      payload: {
        receiptId: "world:flow.cistern.atomic-failure:cistern-operation:atomic-failure.entry",
        domain: "world",
        payloadHash: "deliberate-conflict",
      },
    })).toMatchObject({ applied: true });
    const before = target.snapshot().session;
    expect(target.enterCistern("atomic-failure.entry")).toMatchObject({
      accepted: false,
      reason: "delegate_rejected",
      result: { reason: "transaction_conflict" },
    });
    expect(target.snapshot()).toMatchObject({
      mode: "infrastructure",
      session: { capabilities: { expressionCapacityWords: 1, revision: 0 }, mp: { maxMp: 24 } },
    });
    expect(target.snapshot().session.capabilities).toEqual(before.capabilities);
    expect(target.snapshot().session.mp).toEqual(before.mp);
  });
});
