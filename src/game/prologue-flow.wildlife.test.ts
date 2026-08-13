import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeInfrastructureTaskManifestIndex } from "../content/runtime-task-manifest";
import { PROLOGUE_STREAM_SCENE_ID } from "./prologue-arrival-stream";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "./prologue-settlement";
import { PROLOGUE_CISTERN_SCENE_ID } from "./prologue-cistern";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
} from "./prologue-waterwheel";
import {
  PROLOGUE_WILDLIFE_DIG_SOLUTION_ID,
  PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
  PROLOGUE_WILDLIFE_SCENE_ID,
  PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID,
  PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID,
  type PrologueWildlifeSolutionId,
} from "./prologue-wildlife";
import { PrologueFlowSession } from "./prologue-flow";

const tasks = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
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
  expect(target.observeWaterwheelPhysics(`${prefix}.physics`, {
    angularVelocityRpm: 12,
    elapsedTicks: 600,
    downstreamFlowBand: "safe",
    overflowContact: false,
  }).accepted).toBe(true);
  const wheelSolution = "waterwheel.repair_axle";
  expect(target.completeWaterwheelSolution(`${prefix}.wheel`, wheelSolution, {
    completedActionIds: requiredActions("ch01_waterwheel", wheelSolution),
    world: { axleSupported: true, wheelRotatesFreely: true, downstreamFlowBandSafe: true },
  }).accepted).toBe(true);
  expect(target.enterServiceChannel(`${prefix}.service.entry`).accepted).toBe(true);
  const serviceSolution = "service.open_bypass_valve";
  expect(target.completeServiceSolution(`${prefix}.service`, serviceSolution, {
    completedActionIds: requiredActions("ch01_service_channel", serviceSolution),
    world: { bypassValveOpen: true, bypassRouteClear: true },
  }).accepted).toBe(true);
};

const enterFromService = (id: string): PrologueFlowSession => {
  const target = PrologueFlowSession.fresh({ sessionId: id });
  reachReadyService(target, id);
  expect(target.enterWildlife(`${id}.den`, "service")).toMatchObject({ accepted: true });
  expect(target.snapshot()).toMatchObject({
    mode: "wildlife",
    runtime: { sceneId: PROLOGUE_WILDLIFE_SCENE_ID },
    wildlife: { sceneManifestId: PROLOGUE_WILDLIFE_SCENE_ID, minimumWarningTicks: 42 },
    infrastructure: null,
    cistern: null,
    killCount: 0,
  });
  return target;
};

const prepareNonDig = (target: PrologueFlowSession, prefix: string): void => {
  expect(target.observeWildlife(`${prefix}.observe`).accepted).toBe(true);
  expect(target.retreatWildlife(`${prefix}.retreat`).accepted).toBe(true);
  expect(target.waitForWildlifeExit(`${prefix}.exit`).accepted).toBe(true);
  expect(target.openWildlifeLatch(`${prefix}.latch`).accepted).toBe(true);
  expect(target.retreatWildlife(`${prefix}.outside`).accepted).toBe(true);
};

const completeRoute = (
  target: PrologueFlowSession,
  prefix: string,
  solutionId: PrologueWildlifeSolutionId,
): void => {
  if (solutionId === PROLOGUE_WILDLIFE_DIG_SOLUTION_ID) {
    expect(target.markWildlifeDigLine(`${prefix}.mark`).accepted).toBe(true);
    expect(target.digWildlifeUpperBypass(`${prefix}.dig`).accepted).toBe(true);
    expect(target.installWildlifeBraces(`${prefix}.braces`).accepted).toBe(true);
  } else if (solutionId === PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID) {
    expect(target.observeWildlife(`${prefix}.observe`).accepted).toBe(true);
    expect(target.useWildlifeStaff(`${prefix}.staff`).accepted).toBe(true);
    expect(target.waitForWildlifeExit(`${prefix}.exit`).accepted).toBe(true);
    expect(target.openWildlifeLatch(`${prefix}.latch`).accepted).toBe(true);
    expect(target.retreatWildlife(`${prefix}.outside`).accepted).toBe(true);
  } else {
    prepareNonDig(target, prefix);
    if (solutionId === PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID) expect(target.makeWildlifeNoise(`${prefix}.noise`).accepted).toBe(true);
  }
  expect(target.completeWildlifeRoute(`${prefix}.complete`, solutionId)).toMatchObject({ accepted: true });
};

describe("PrologueFlowSession N06 integration", () => {
  it("round-trips N04 -> N06 -> N04 and preserves authoritative save/reward domains", () => {
    const target = enterFromService("flow.wildlife.service");
    const before = target.snapshot().session;
    const loaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot()).toMatchObject({ mode: "wildlife", runtime: { sceneId: PROLOGUE_WILDLIFE_SCENE_ID } });
    expect(loaded.snapshot().session).toEqual(before);
    expect(loaded.returnWildlifeToService("flow.wildlife.service.return")).toMatchObject({ accepted: true });
    expect(loaded.snapshot()).toMatchObject({
      mode: "infrastructure",
      runtime: { sceneId: PROLOGUE_SERVICE_CHANNEL_SCENE_ID },
      wildlife: null,
      killCount: 0,
    });
    expect(loaded.snapshot().session.mp).toEqual(before.mp);
    expect(loaded.snapshot().session.learning).toEqual(before.learning);
    expect(loaded.snapshot().session.economy).toEqual(before.economy);
  });

  it("round-trips N05 -> N06 -> N05 after a route is open", () => {
    const target = enterFromService("flow.wildlife.cistern");
    completeRoute(target, "flow.wildlife.cistern.dig", PROLOGUE_WILDLIFE_DIG_SOLUTION_ID);
    expect(target.handoffWildlifeToCistern("flow.wildlife.cistern.first")).toMatchObject({ accepted: true });
    expect(target.snapshot()).toMatchObject({ mode: "cistern", runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID } });
    expect(target.enterWildlife("flow.wildlife.cistern.reenter", "cistern")).toMatchObject({ accepted: true });
    expect(target.handoffWildlifeToCistern("flow.wildlife.cistern.return")).toMatchObject({ accepted: true });
    const loaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot()).toMatchObject({ mode: "cistern", runtime: { sceneId: PROLOGUE_CISTERN_SCENE_ID }, killCount: 0 });
  });

  it.each([
    PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID,
    PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
    PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID,
    PROLOGUE_WILDLIFE_DIG_SOLUTION_ID,
  ] as const)("completes %s only through its explicit Flow interactions", (solutionId) => {
    const target = enterFromService(`flow.route.${solutionId}`);
    expect(target.completeWildlifeRoute(`early.${solutionId}`, solutionId)).toMatchObject({ accepted: false });
    expect(target.snapshot().wildlife?.visitEvidence.oldLatchOpened).toBe(false);
    completeRoute(target, `route.${solutionId}`, solutionId);
    expect(target.snapshot()).toMatchObject({
      wildlife: { denRouteOpen: true, routeSolutionId: solutionId, rewards: { kills: 0, drops: 0, learning: 0, mp: 0, capacity: 0, coin: 0, keyItems: 0 } },
      killCount: 0,
    });
  });

  it("makes semantic buttons idempotent, fails closed in wrong mode, and retains optional N04 -> N05 mainline", () => {
    const wrong = PrologueFlowSession.fresh({ sessionId: "flow.wildlife.wrong" });
    expect(wrong.observeWildlife("wrong.observe")).toMatchObject({ accepted: false, reason: "wrong_mode" });
    expect(wrong.enterWildlife("wrong.enter", "service")).toMatchObject({ accepted: false, reason: "wrong_mode" });

    const target = enterFromService("flow.wildlife.semantic");
    const first = target.observeWildlife("same.observe");
    const tick = first.snapshot.runtime.tick;
    expect(target.observeWildlife("same.observe")).toMatchObject({ accepted: true });
    expect(target.snapshot().runtime.tick).toBe(tick);
    expect(target.retreatWildlife("same.observe")).toMatchObject({ accepted: false, reason: "delegate_rejected" });
    expect(target.recoverWildlifeSoftLock("recover")).toMatchObject({ accepted: true });
    expect(target.resetWildlifeCheckpoint("reset")).toMatchObject({ accepted: true });

    const direct = PrologueFlowSession.fresh({ sessionId: "flow.wildlife.optional" });
    reachReadyService(direct, "flow.wildlife.optional");
    expect(direct.enterCistern("flow.wildlife.optional.cistern")).toMatchObject({ accepted: true });
    expect(direct.snapshot()).toMatchObject({ mode: "cistern", wildlife: null, killCount: 0 });
  });
});
