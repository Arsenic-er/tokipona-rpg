import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeInfrastructureTaskManifestIndex } from "../content/runtime-task-manifest";
import {
  PROLOGUE_RETURN_FLOW_FLAGS,
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
} from "../game/prologue-return-flow";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "../game/prologue-settlement";
import {
  PROLOGUE_CISTERN_SCENE_ID,
} from "../game/prologue-cistern";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
  type ServiceSolutionEvidence,
  type WaterwheelSolutionEvidence,
} from "../game/prologue-waterwheel";
import { PROLOGUE_OLD_MINE_SCENE_ID, PROLOGUE_STREAM_SCENE_ID } from "../game/prologue-arrival-stream";
import { PrologueFlowSession } from "../game/prologue-flow";
import type { GameSessionSave } from "../session/game-session";
import {
  ExclusivePrologueActivityTimer,
  PrologueTelemetryRecorder,
  emptyPrologueTelemetrySemantic,
  evaluatePrologueActivityAcceptance,
  type PrologueActivityAcceptanceReport,
  type PrologueTelemetryEvent,
} from "./prologue-telemetry";
import type { PrologueActivityKind, PrologueTelemetryEventId } from "../content/runtime-prologue-acceptance-manifest";

const TASKS = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const MINUTE_MS = 60_000;

const WATER_WORLD: Readonly<Record<string, WaterwheelSolutionEvidence["world"]>> = Object.freeze({
  "waterwheel.clear_natural_inflow": Object.freeze({ naturalInflowReachesWheel: true, axleAlignmentSafe: true, downstreamFlowBandSafe: true }),
  "waterwheel.repair_axle": Object.freeze({ axleSupported: true, wheelRotatesFreely: true, downstreamFlowBandSafe: true }),
});
const SERVICE_WORLD: Readonly<Record<string, ServiceSolutionEvidence["world"]>> = Object.freeze({
  "service.open_bypass_valve": Object.freeze({ bypassValveOpen: true, bypassRouteClear: true }),
  "service.place_wood_platform": Object.freeze({ platformSupported: true, platformClearanceSafe: true }),
});

export type PrologueAcceptanceRouteVariant = "primary" | "alternate";

export interface PrologueThreeHourAcceptanceReport {
  readonly completed: true;
  readonly routeVariant: PrologueAcceptanceRouteVariant;
  readonly routeIds: readonly [string, string, string];
  readonly contentMinutes: 180;
  readonly elapsedMinutesIncludingExcluded: 210;
  readonly activity: PrologueActivityAcceptanceReport;
  readonly telemetryEvents: readonly PrologueTelemetryEvent[];
  readonly reloadCount: number;
  readonly softRecoveryCount: number;
  readonly killCount: 0;
  readonly wildlifeHarmEventCount: 0;
  readonly meaningfulReturnWorldDeltaIds: readonly string[];
  readonly finalSceneId: "scene.valley.settlement";
  readonly oldMineVisited: true;
  readonly peacefulExitReceiptPresent: true;
  readonly finalSave: GameSessionSave;
}

export function runPrologueThreeHourAcceptance(input: Readonly<{
  sessionId: string;
  routeVariant: PrologueAcceptanceRouteVariant;
  injectSoftRecoveries?: boolean;
}>): PrologueThreeHourAcceptanceReport {
  const route = input.routeVariant === "primary"
    ? { water: "waterwheel.repair_axle", service: "service.open_bypass_valve", returnIndex: 0 }
    : { water: "waterwheel.clear_natural_inflow", service: "service.place_wood_platform", returnIndex: 1 };
  const returnSolution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[route.returnIndex]!;
  const timer = new ExclusivePrologueActivityTimer();
  timer.start("world_people_physics", 0);
  const telemetry = new PrologueTelemetryRecorder(input.sessionId, timer);
  let nowMs = 0;
  let reloadCount = 0;
  let softRecoveryCount = 0;
  let flow = PrologueFlowSession.fresh({ sessionId: input.sessionId, currentMp: 12, maxMp: 24 });

  const advanceActivity = (kind: PrologueActivityKind, minutes: number): void => {
    timer.switchTo(kind, nowMs);
    nowMs += minutes * MINUTE_MS;
  };
  const record = (eventId: PrologueTelemetryEventId, segmentId: string, subjectId: string, outcomeId: string): void => {
    telemetry.record({ eventId, segmentId, worldTick: flow.snapshot().session.survival.worldTicks, atMs: nowMs,
      semantic: emptyPrologueTelemetrySemantic({ subjectId, outcomeId }) });
  };
  const reload = (): void => {
    flow = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    reloadCount += 1;
  };

  record("prologue_segment_started", "arrival", "scene.valley.arrival_shelf", "segment.started");
  goRightUntil(flow, PROLOGUE_STREAM_SCENE_ID);
  accepted(flow.pushLooseStone(`${input.sessionId}.arrival.stone`), "arrival loose-stone route");
  goRightUntil(flow, PROLOGUE_SETTLEMENT_SCENE_ID);
  advanceActivity("world_people_physics", 35);
  record("prologue_segment_completed", "arrival", "scene.valley.settlement", "segment.completed");

  advanceActivity("language", 12);
  record("world_literacy_observed", "settlement_orientation", "settlement.public_relief", "non_attack_route.available");
  advanceActivity("long_explanation", 6);
  record("causal_attribution_submitted", "settlement_orientation", "settlement.orientation", "world_state.attributed");
  advanceActivity("pause", 10);

  accepted(flow.enterWaterwheel(`${input.sessionId}.waterwheel.entry`), "waterwheel entry");
  requireScene(flow, PROLOGUE_WATERWHEEL_SCENE_ID);
  accepted(flow.observeWaterwheelPhysics(`${input.sessionId}.waterwheel.physics`, { angularVelocityRpm: 12, elapsedTicks: 600, downstreamFlowBand: "safe", overflowContact: false }), "waterwheel physics observation");
  if (input.injectSoftRecoveries) {
    accepted(flow.resetArea(`${input.sessionId}.waterwheel.recover`), "waterwheel soft recovery");
    softRecoveryCount += 1;
    accepted(flow.observeWaterwheelPhysics(`${input.sessionId}.waterwheel.physics.after-recovery`, { angularVelocityRpm: 12, elapsedTicks: 600, downstreamFlowBand: "safe", overflowContact: false }), "waterwheel physics after recovery");
  }
  accepted(flow.completeWaterwheelSolution(`${input.sessionId}.waterwheel.complete`, route.water, { completedActionIds: requiredActions("ch01_waterwheel", route.water), world: WATER_WORLD[route.water]! }), "waterwheel solution");
  accepted(flow.enterServiceChannel(`${input.sessionId}.service.entry`), "service-channel entry");
  requireScene(flow, PROLOGUE_SERVICE_CHANNEL_SCENE_ID);
  accepted(flow.completeServiceSolution(`${input.sessionId}.service.complete`, route.service, { completedActionIds: requiredActions("ch01_service_channel", route.service), world: SERVICE_WORLD[route.service]! }), "service-channel solution");
  accepted(flow.enterCistern(`${input.sessionId}.cistern.entry`), "cistern entry");
  requireScene(flow, PROLOGUE_CISTERN_SCENE_ID);
  accepted(flow.completeCisternFamilyWithTools(`${input.sessionId}.cistern.family-a`, "cistern.family_a.calibration"), "cistern family A");
  accepted(flow.completeCisternFamilyWithTools(`${input.sessionId}.cistern.family-b`, "cistern.family_b.transfer"), "cistern family B");
  reload();
  advanceActivity("world_people_physics", 35);
  record("prologue_segment_completed", "high_cistern", "scene.valley.high_cistern", "water_flow.restored");
  advanceActivity("language", 12);
  record("active_retrieval_submitted", "high_cistern", "word.telo", "retrieval.non_attack");
  advanceActivity("long_explanation", 6);
  record("alternate_method_used", "service_channel", route.service, "route.non_magic");
  advanceActivity("optional_free_roam", 20);

  accepted(flow.enterReturnFlow(`${input.sessionId}.return.entry`), "return-flow entry");
  if (input.injectSoftRecoveries) {
    accepted(flow.performReturnFlowAction(`${input.sessionId}.return.pre-reset`, returnSolution.requiredActions[0]!), "return-flow first action before reset");
    accepted(flow.resetArea(`${input.sessionId}.return.recover`), "return-flow soft recovery");
    softRecoveryCount += 1;
    if (flow.snapshot().returnFlowProgress?.completedActionIds.length !== 0) throw new Error("return-flow recovery did not clear uncommitted task-local progress");
  }
  for (const [index, actionId] of returnSolution.requiredActions.entries()) {
    accepted(flow.performReturnFlowAction(`${input.sessionId}.return.action.${index}`, actionId), `return-flow action ${actionId}`);
  }
  accepted(flow.completeReturnFlowSolution(`${input.sessionId}.return.complete`, returnSolution.id), "return-flow solution");
  reload();
  accepted(flow.returnFlowToSettlement(`${input.sessionId}.return.settlement`), "return to settlement");
  advanceActivity("world_people_physics", 35);
  record("repair_completed", "den_and_return_flow", returnSolution.id, "return_flow.committed");
  advanceActivity("language", 12);
  record("delayed_retrieval_completed", "den_and_return_flow", "word.wawa", "inert_force.recalled");
  advanceActivity("long_explanation", 6);
  record("prologue_segment_completed", "den_and_return_flow", "scene.valley.return_channel", "segment.completed");

  accepted(flow.enterOldMine(`${input.sessionId}.old-mine.entry`), "old-mine peaceful entry");
  requireScene(flow, PROLOGUE_OLD_MINE_SCENE_ID);
  reload();
  if (!flow.snapshot().oldMine?.chapterComplete) throw new Error("old-mine completion did not survive reload");
  accepted(flow.returnOldMineToSettlement(`${input.sessionId}.old-mine.return`), "old-mine return");
  requireScene(flow, PROLOGUE_SETTLEMENT_SCENE_ID);
  advanceActivity("world_people_physics", 21);
  record("prologue_segment_completed", "return_and_safe_range", "valley.old_mine_threshold", "peaceful_exit.completed");
  timer.stop(nowMs);

  const activity = evaluatePrologueActivityAcceptance(timer.snapshot(nowMs));
  if (!activity.accepted || activity.contentActiveMs !== 180 * MINUTE_MS) throw new Error("three-hour activity-share acceptance failed");
  const final = flow.snapshot();
  const eventTypes = flow.session.events().map((event) => event.type);
  const wildlifeHarmEventCount = eventTypes.filter((type) => type === "wildlife_damage_committed" || type === "wildlife_death_committed").length;
  const acceptedWorldDeltaIds = new Set<string>([
    PROLOGUE_RETURN_FLOW_FLAGS.settlementSupplyStable,
    PROLOGUE_RETURN_FLOW_FLAGS.wetMeadowRestored,
    PROLOGUE_RETURN_FLOW_FLAGS.materialPatchApplied,
  ]);
  const worldDeltaIds = Object.values(final.session.world.flags).filter((flag) => flag.value === true &&
    acceptedWorldDeltaIds.has(flag.flagId)).map((flag) => flag.flagId).sort();
  const peacefulExitReceiptPresent = Object.values(final.session.receiptIndex).some((receipt) => receipt.payloadHash.includes("prologue-peaceful-exit"));
  if (final.killCount !== 0 || wildlifeHarmEventCount !== 0 || worldDeltaIds.length < 3 || !peacefulExitReceiptPresent) throw new Error("three-hour zero-harm peaceful completion invariants failed");
  return Object.freeze({
    completed: true, routeVariant: input.routeVariant, routeIds: Object.freeze([route.water, route.service, returnSolution.id]) as readonly [string, string, string],
    contentMinutes: 180, elapsedMinutesIncludingExcluded: 210, activity, telemetryEvents: telemetry.events(),
    reloadCount, softRecoveryCount, killCount: 0, wildlifeHarmEventCount: 0,
    meaningfulReturnWorldDeltaIds: Object.freeze(worldDeltaIds), finalSceneId: PROLOGUE_SETTLEMENT_SCENE_ID as "scene.valley.settlement",
    oldMineVisited: true, peacefulExitReceiptPresent: true, finalSave: flow.toSave(),
  });
}

function requiredActions(taskId: string, solutionId: string): readonly string[] {
  const solution = TASKS.byId[taskId]?.solutions.find((candidate) => candidate.id === solutionId);
  if (!solution) throw new Error(`missing generated solution ${taskId}/${solutionId}`);
  return solution.requiredActions;
}

function goRightUntil(flow: PrologueFlowSession, sceneId: string, maximumTicks = 1_500): void {
  for (let tick = 0; tick < maximumTicks && flow.snapshot().runtime.sceneId !== sceneId; tick += 1) flow.advanceTicks(1, { moveX: 1 });
  requireScene(flow, sceneId);
}

function requireScene(flow: PrologueFlowSession, sceneId: string): void {
  if (flow.snapshot().runtime.sceneId !== sceneId) throw new Error(`expected scene ${sceneId}, received ${flow.snapshot().runtime.sceneId}`);
}

function accepted(value: Readonly<{ accepted: boolean; reason?: string }>, label: string): void {
  if (!value.accepted) throw new Error(`${label} was rejected${value.reason ? `: ${value.reason}` : ""}`);
}
