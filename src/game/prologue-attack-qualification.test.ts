import { describe, expect, it } from "vitest";
import {
  commitSessionProposal,
  proposeAttackCapacityCalibration,
  proposeAttackPermission,
  proposeAttackQualificationEvidence,
  proposeAttackQualificationInteraction,
} from "../session/adapters";
import { GameSession, type GameSessionEvent } from "../session/game-session";
import {
  LEARNING_SAVE_SCHEMA,
  type LearningProgressionSnapshot,
  type WordLearningProgress,
} from "../learning/progression";
import { PrologueSettlementSession, createPrologueSettlementInitialSession } from "./prologue-settlement";

const progress = (wordId: string, learningState: WordLearningProgress["learningState"]): WordLearningProgress => ({
  wordId, discoveryState: "discovered", attunementState: "attuned", learningState, evidence: [],
  productionTaskFamilies: [], producedBaselineTaskFamilies: [], producedBaselineEnvironmentFingerprints: [],
  demonstratedSemanticFacets: [],
});
const preparedLearning = (): LearningProgressionSnapshot => ({
  schema: LEARNING_SAVE_SCHEMA, revision: 0, processedEventPayloads: {},
  words: { telo: progress("telo", "grounded"), tawa: progress("tawa", "produced"), wawa: progress("wawa", "grounded") },
});
const preparedSettlement = (suffix: string): PrologueSettlementSession => new PrologueSettlementSession(GameSession.create({
  sessionId: `qualification.coordinator.${suffix}`,
  mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  currentSceneId: "scene.valley.settlement",
  learning: preparedLearning(),
}));

const atTable = (suffix: string): PrologueSettlementSession => {
  const target = preparedSettlement(suffix);
  for (let tick = 0; tick < 700 && target.snapshot().runtime.player.position.x < 576; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  expect(Math.abs(target.snapshot().runtime.player.position.x - 576)).toBeLessThanOrEqual(16);
  return target;
};

const qualifiedActions = [
  "settlement.telo.h0",
  "settlement.telo.h1",
  "settlement.tawa.h0",
  "settlement.tawa.h1",
  "settlement.repair.motion_h0",
  "settlement.calibration.unrelated_delivery_commit",
  "settlement.calibration.unrelated_route_commit",
  "settlement.delayed_retrieval_h0",
] as const;

describe("PrologueAttackQualificationCoordinator", () => {
  it("rejects every public ordinary live path for protected qualification events", () => {
    const session = createPrologueSettlementInitialSession({ sessionId: "qualification.public.reject" });
    const batches = [
      proposeAttackQualificationInteraction("forge.interaction", { x: 576, y: 448 }, session.snapshot().world.revision),
      proposeAttackQualificationEvidence("forge.evidence", "settlement.telo.h0", undefined,
        "attack-qualification-interaction:forge.interaction"),
      proposeAttackCapacityCalibration("forge.calibration"),
      proposeAttackPermission("forge.permission"),
    ];
    for (const batch of batches) {
      expect(commitSessionProposal(session, batch)).toMatchObject({ committed: false, reason: "invalid_event" });
      const draft = batch.drafts[0]!;
      expect(session.forkForProposal().apply({ ...draft, sequence: 1 } as GameSessionEvent))
        .toMatchObject({ applied: false, reason: "invalid_event" });
    }
  });

  it("derives range and revision from live settlement runtime, consumes interactions, and replays", () => {
    const remote = new PrologueSettlementSession(createPrologueSettlementInitialSession({
      sessionId: "qualification.remote",
    }));
    expect(remote.commitAttackQualificationAction("settlement.telo.h0", "remote"))
      .toMatchObject({ accepted: false, reason: "out_of_range" });

    const target = atTable("actions");
    for (const [index, actionId] of qualifiedActions.entries()) {
      const result = target.commitAttackQualificationAction(actionId, `action.${index}`);
      expect(result, `${index}:${actionId}:${result.reason}`).toMatchObject({
        accepted: true, duplicate: false, reason: "committed",
      });
    }
    expect(target.commitAttackQualificationAction("settlement.telo.h0", "action.0"))
      .toMatchObject({ accepted: true, duplicate: true });
    expect(target.commitAttackQualificationAction("settlement.tawa.h0", "action.0"))
      .toMatchObject({ accepted: false, reason: "transaction_conflict" });
    expect(target.calibrateAttackCapacity("calibrate.without-wawa"))
      .toMatchObject({ accepted: false, reason: "session_rejected" });

    const loaded = GameSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().learning.words.telo?.evidence.length).toBeGreaterThanOrEqual(2);
    expect(loaded.snapshot().learning.words.tawa?.evidence.length).toBeGreaterThanOrEqual(3);
    expect(loaded.events().filter((event) => event.type === "attack_qualification_interaction_committed"))
      .toHaveLength(qualifiedActions.length);
  });
});
