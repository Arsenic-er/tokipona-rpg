import { describe, expect, it } from "vitest";
import {
  LEARNING_SAVE_SCHEMA,
  type LearningProgressionSnapshot,
  type WordLearningProgress,
} from "../learning/progression";
import { GameSession } from "../session/game-session";
import { commitSessionProposal } from "../session/adapters";
import { PrologueFlowSession } from "./prologue-flow";
import {
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
  PrologueReturnFlowSession,
} from "./prologue-return-flow";
import { authoritativePostEpilogueSettlement } from "./test-helpers/authoritative-post-epilogue-settlement";

const progress = (wordId: string, learningState: WordLearningProgress["learningState"]): WordLearningProgress => ({
  wordId, discoveryState: "discovered", attunementState: "attuned", learningState, evidence: [],
  productionTaskFamilies: [], producedBaselineTaskFamilies: [], producedBaselineEnvironmentFingerprints: [],
  demonstratedSemanticFacets: [],
});
const preparedLearning = (): LearningProgressionSnapshot => ({
  schema: LEARNING_SAVE_SCHEMA, revision: 0, processedEventPayloads: {},
  words: {
    telo: progress("telo", "produced"),
    tawa: progress("tawa", "produced"),
    wawa: progress("wawa", "grounded"),
  },
});
const settlementFlowAfterRealN07Grounding = (): PrologueFlowSession => {
  const source = GameSession.create({
    sessionId: "flow.attack-qualification.catalog",
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: "scene.valley.high_cistern",
    learning: preparedLearning(),
  });
  const ladder = commitSessionProposal(source, { transactionId: "catalog.ladder", drafts: [{
    eventId: "catalog.ladder", type: "world_flag_set",
    payload: { flagId: "exit_ladder_lowered", value: true, scope: "region", regionId: "valley_prologue" },
  }] });
  if (!ladder.committed) throw new Error(`ladder fixture rejected: ${ladder.reason}`);
  const entered = PrologueReturnFlowSession.enterFromCistern(ladder.session, "catalog.return.entry");
  if (!entered.accepted || !entered.returnFlow) throw new Error(`N07 entry rejected: ${entered.reason}`);
  const returnFlow = entered.returnFlow;
  const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
  expect(returnFlow.completeSolution("catalog.return.complete", solution.id, {
    completedActionIds: solution.requiredActions,
    world: {
      settlementSupplyFlowInBand: true, wetMeadowFlowInBand: true, overflowContact: false,
      overflowGateSeated: true, overflowSealIntact: true, overflowConduitClear: true,
      mudMassBelowLimit: true, channelGradeContinuous: true, returnIntakeClear: true,
      oldChannelConnected: true, oldChannelClear: true, oldChannelBankStable: true,
    },
  }).accepted).toBe(true);
  expect(returnFlow.groundWawa("catalog.return.wawa", {
    solutionId: solution.id, promptLevel: 0, predictedForceContrastCorrect: true,
    worldOutcomeContribution: true,
  }).accepted).toBe(true);
  return PrologueFlowSession.fromSave(authoritativePostEpilogueSettlement(returnFlow.session).toSave());
};
const moveToTable = (flow: PrologueFlowSession): void => {
  for (let tick = 0; tick < 700 && flow.snapshot().runtime.player.position.x < 576; tick += 1) {
    flow.advanceTicks(1, { moveX: 1 });
  }
  expect(Math.abs(flow.snapshot().runtime.player.position.x - 576)).toBeLessThanOrEqual(16);
};

const n02Actions = [
  "settlement.telo.h0",
  "settlement.telo.h1",
  "settlement.tawa.h0",
  "settlement.tawa.h1",
  "settlement.repair.motion_h0",
  "settlement.calibration.unrelated_delivery_commit",
  "settlement.calibration.unrelated_route_commit",
  "settlement.delayed_retrieval_h0",
] as const;

describe("PrologueFlow attack qualification semantic API", () => {
  it("is settlement-only and never accepts runtime authority inputs", () => {
    const arrival = PrologueFlowSession.fresh({ sessionId: "flow.attack-qualification.wrong-mode" });
    expect(arrival.performAttackQualificationAction("wrong-mode", "settlement.telo.h0"))
      .toMatchObject({ accepted: false, reason: "wrong_mode", result: null });
    expect(arrival.calibrateAttackCapacity("wrong-mode.calibrate"))
      .toMatchObject({ accepted: false, reason: "wrong_mode", result: null });
    expect(arrival.grantRangeTrialPermission("wrong-mode.permission"))
      .toMatchObject({ accepted: false, reason: "wrong_mode", result: null });
  });

  it("commits the complete generated N02 catalog through semantic IDs and persists it", () => {
    const flow = settlementFlowAfterRealN07Grounding();
    expect(flow.safeRangeView().qualificationActions.find((action) =>
      action.actionId === "settlement.telo.h0")?.available).toBe(false);
    expect(flow.performAttackQualificationAction("remote", "settlement.telo.h0"))
      .toMatchObject({ accepted: false, result: { reason: "out_of_range" } });
    moveToTable(flow);
    expect(flow.safeRangeView().qualificationActions.find((action) =>
      action.actionId === "settlement.telo.h0")?.available).toBe(true);
    for (const [index, actionId] of n02Actions.entries()) {
      expect(flow.performAttackQualificationAction(`catalog.${index}`, actionId), actionId)
        .toMatchObject({ accepted: true, reason: "delegated", result: { accepted: true, duplicate: false } });
      expect(flow.safeRangeView().qualificationActions.find((action) =>
        action.actionId === actionId)?.completed, actionId).toBe(true);
    }
    expect(flow.performAttackQualificationAction("catalog.0", "settlement.telo.h0"))
      .toMatchObject({ accepted: true, result: { accepted: true, duplicate: true } });
    expect(flow.performAttackQualificationAction("catalog.0", "settlement.tawa.h0"))
      .toMatchObject({ accepted: false, result: { reason: "transaction_conflict" } });
    expect(flow.calibrateAttackCapacity("catalog.calibrate"))
      .toMatchObject({ accepted: true, result: { accepted: true, reason: "committed" } });
    expect(flow.grantRangeTrialPermission("catalog.permission"))
      .toMatchObject({ accepted: true, result: { accepted: true, reason: "committed" } });

    const reloaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    expect(reloaded.snapshot().session.learning.words.telo?.evidence.length).toBeGreaterThanOrEqual(2);
    expect(reloaded.snapshot().session.receiptIndex[
      "attack-qualification-world:settlement.calibration.unrelated_route_commit"
    ]).toBeDefined();
    expect(reloaded.snapshot().session.capabilities).toMatchObject({
      expressionCapacityWords: 4, focusSlots: 4,
    });
    expect(reloaded.snapshot().session.mp.maxMp).toBe(30);
    expect(reloaded.snapshot().session.world.flags["global:range_trial_permission"]?.value).toBe(true);
  });
});
