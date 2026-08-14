import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { LEARNING_SAVE_SCHEMA, type LearningProgressionSnapshot, type WordLearningProgress } from "../learning/progression";
import { commitSessionProposal, proposeAttackCapacityCalibration, proposeAttackPermission,
  proposeAttackQualificationEvidence, proposeAttackQualificationInteraction, proposeLearningEvidence,
  proposeReturnObservation } from "../session/adapters";
import { GameSession, type GameSessionEvent } from "../session/game-session";
import { PrologueSettlementSession } from "./prologue-settlement";
import { PrologueReturnFlowSession, PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS } from "./prologue-return-flow";
import { ATTACK_CAPACITY_CALIBRATION_FLAG_ID, FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID,
  RANGE_TRIAL_PERMISSION_FLAG_ID, RUNTIME_ATTACK_QUALIFICATION_CONTRACT,
  evaluateAttackQualification, readRuntimeAttackQualificationContract,
  type AttackQualificationNodeId, type CommittedLearningEvidenceReference,
  type CommittedWorldEventReference } from "./attack-qualification";

const progress = (wordId: string, learningState: WordLearningProgress["learningState"]): WordLearningProgress => ({
  wordId, discoveryState: "discovered", attunementState: "attuned", learningState, evidence: [],
  productionTaskFamilies: [], producedBaselineTaskFamilies: [],
  producedBaselineEnvironmentFingerprints: [], demonstratedSemanticFacets: [],
});

const preparedLearning = (): LearningProgressionSnapshot => ({
  schema: LEARNING_SAVE_SCHEMA, revision: 0,
  words: { telo: progress("telo", "produced"), tawa: progress("tawa", "produced"),
    wawa: progress("wawa", "grounded") },
  processedEventPayloads: {},
});

const createSession = (learning = preparedLearning()): GameSession => GameSession.create({
  sessionId: "qualification.test", mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  currentSceneId: "scene.valley.settlement", learning,
});

const next = (session: GameSession, event: Omit<GameSessionEvent, "sequence">): GameSession => {
  const result = session.apply({ ...event, sequence: session.nextSequence() } as GameSessionEvent);
  expect(result.applied, `${event.type}: ${result.reason}`).toBe(true);
  return session;
};

const commit = (session: GameSession, batch: import("../session/adapters").SessionProposalBatch): GameSession => {
  const result = commitSessionProposal(session, batch);
  expect(result.committed, `${result.failedDraftId}: ${result.reason}`).toBe(true);
  return result.session;
};

const atTable = (session: GameSession): PrologueSettlementSession => {
  const settlement = new PrologueSettlementSession(session);
  for (let tick = 0; tick < 700 && settlement.snapshot().runtime.player.position.x < 576; tick += 1) {
    settlement.advanceTicks(1, { moveX: 1 });
  }
  return settlement;
};
const commitSettlementAction = (
  session: GameSession,
  transactionId: string,
  actionId: import("../session/game-session").AttackQualificationEvidenceActionId,
): GameSession => {
  if (actionId.startsWith("return_flow.")) throw new Error("N07 actions require PrologueReturnFlowSession");
  const settlement = atTable(session);
  const result = settlement.commitAttackQualificationAction(actionId as Exclude<typeof actionId,
    "return_flow.wawa.inert_h0" | "return_flow.wawa.inert_h1">, transactionId);
  expect(result.accepted, `${actionId}: ${result.reason}`).toBe(true);
  return result.session;
};
const returnFacts = {
  settlementSupplyFlowInBand: true, wetMeadowFlowInBand: true, overflowContact: false,
  overflowGateSeated: true, overflowSealIntact: true, overflowConduitClear: true,
  mudMassBelowLimit: true, channelGradeContinuous: true, returnIntakeClear: true,
  oldChannelConnected: true, oldChannelClear: true, oldChannelBankStable: true,
} as const;
const buildQualifiedEvidence = (skip: string | null = null): GameSession => {
  let session = createSession();
  if (skip !== "settlement.telo.h0") session = commitSettlementAction(session, "telo.h0", "settlement.telo.h0");
  if (skip !== "settlement.telo.h1") session = commitSettlementAction(session, "telo.h1", "settlement.telo.h1");
  if (skip !== "settlement.tawa.h0") session = commitSettlementAction(session, "tawa.h0", "settlement.tawa.h0");
  if (skip !== "settlement.tawa.h1") session = commitSettlementAction(session, "tawa.h1", "settlement.tawa.h1");
  session = commit(session, { transactionId: "to.cistern", drafts: [
    { eventId: "scene.cistern", type: "scene_entered", payload: { sceneId: "scene.valley.high_cistern" } },
    { eventId: "ladder.lowered", type: "world_flag_set", payload: {
      flagId: "exit_ladder_lowered", value: true, scope: "region", regionId: "valley_prologue",
    } },
  ] });
  const entered = PrologueReturnFlowSession.enterFromCistern(session, "qualification.return.entry");
  if (!entered.accepted || !entered.returnFlow) throw new Error(`return entry: ${entered.reason}`);
  const flow = entered.returnFlow;
  const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
  expect(flow.completeSolution("qualification.return.complete", solution.id, {
    completedActionIds: solution.requiredActions, world: returnFacts,
  }).accepted).toBe(true);
  if (skip !== "return_flow.wawa.inert_h0") expect(flow.groundWawa("qualification.wawa.h0", {
    solutionId: solution.id, promptLevel: 0, predictedForceContrastCorrect: true,
    worldOutcomeContribution: true,
  }).accepted).toBe(true);
  const returned = flow.returnToSettlement("qualification.return.settlement");
  if (!returned.accepted || !returned.session) throw new Error(`return settlement: ${returned.reason}`);
  session = returned.session;
  if (skip !== "return_flow.wawa.inert_h0") {
    const source = [...session.events()].reverse().find((event) => event.type === "learning_evidence_committed" &&
      event.payload.evidence?.eventType === "grounding_trial_resolved" && event.payload.evidence.wordId === "wawa");
    const binding = [...session.events()].reverse().find((event) => event.type === "learning_evidence_committed" &&
      event.payload.qualificationActionId === "return_flow.wawa.inert_h0");
    expect(source?.type).toBe("learning_evidence_committed");
    expect(binding?.type).toBe("learning_evidence_committed");
    if (source?.type === "learning_evidence_committed" && source.payload.evidence) {
      expect(session.snapshot().receiptIndex[`learning-evidence:${source.payload.evidence.idempotencyKey}`]).toBeDefined();
      expect(session.snapshot().receiptIndex[
        `attack-qualification-evidence-binding:return_flow.wawa.inert_h0:${source.eventId}`]).toBeDefined();
    }
  }
  if (skip !== "settlement.repair.motion_h0") session = commitSettlementAction(session, "repair.h0", "settlement.repair.motion_h0");
  session = commitSettlementAction(session, "unrelated.a", "settlement.calibration.unrelated_delivery_commit");
  session = commitSettlementAction(session, "unrelated.b", "settlement.calibration.unrelated_route_commit");
  if (skip !== "settlement.delayed_retrieval_h0") session = commitSettlementAction(session, "delayed.h0",
    "settlement.delayed_retrieval_h0");
  return session;
};
describe("attack qualification trust boundary", () => {
  it("rejects forged generic protected flags, milestones, and live whole-learning snapshots", () => {
    const flags = ["attack_capacity_calibration_complete", "range_trial_permission",
      "first_attack_signature_available", "first_attack_signature_completed", "prologue_return_observed"];
    for (const flagId of flags) {
      const session = createSession();
      expect(session.apply({ eventId: `forge.${flagId}`, sequence: 1, type: "world_flag_set",
        payload: { flagId, value: true, scope: "global" } })).toMatchObject({ applied: false, reason: "invalid_event" });
    }
    const milestone = createSession();
    expect(milestone.apply({ eventId: "forge.attack.milestone", sequence: 1,
      type: "capability_milestone_committed", payload: {
        milestoneId: "attack_capacity_calibration", writerEvent: "attack_capacity_calibrated",
        sourcePath: RUNTIME_ATTACK_QUALIFICATION_CONTRACT.sourcePath,
        sourceDigest: RUNTIME_ATTACK_QUALIFICATION_CONTRACT.sourceDigest,
        contractRevision: RUNTIME_ATTACK_QUALIFICATION_CONTRACT.contractRevision,
        resultingState: { expressionCapacityWords: 4, focusSlots: 4, maxMp: 30 },
      } })).toMatchObject({ applied: false, reason: "invalid_event" });
    const replacement = createSession();
    expect(replacement.apply({ eventId: "forge.learning", sequence: 1, type: "learning_replaced",
      payload: { learning: preparedLearning() } })).toMatchObject({ applied: false, reason: "invalid_event" });
  });

  it("requires all five reducer-materialized graph nodes and grants 4/4/30 atomically", () => {
    let session = buildQualifiedEvidence();
    const preCalibration = session;
    const isolatedSnapshot = createSession(preCalibration.snapshot().learning);
    const forged = commitSessionProposal(isolatedSnapshot, proposeAttackCapacityCalibration("forged.snapshot"));
    expect(forged).toMatchObject({ committed: false, reason: "invalid_event" });

    const evidenceIds = [...session.events()].filter((event) => event.type === "learning_evidence_committed")
      .map((event) => event.payload.qualificationActionId ?? event.payload.evidence?.eventType);
    expect(evidenceIds).toEqual([
      "settlement.telo.h0", "settlement.telo.h1", "settlement.tawa.h0", "settlement.tawa.h1",
      "grounding_trial_resolved", "return_flow.wawa.inert_h0", "settlement.repair.motion_h0",
      "settlement.calibration.unrelated_delivery_commit", "settlement.calibration.unrelated_route_commit",
      "settlement.delayed_retrieval_h0",
    ]);
    const calibrated = atTable(session).calibrateAttackCapacity("calibration.good");
    expect(calibrated.accepted, calibrated.reason).toBe(true);
    session = calibrated.session;
    expect(session.snapshot().capabilities).toMatchObject({ expressionCapacityWords: 4, focusSlots: 4 });
    expect(session.snapshot().mp.maxMp).toBe(30);
    expect(session.snapshot().world.flags[`global:${ATTACK_CAPACITY_CALIBRATION_FLAG_ID}`]?.value).toBe(true);
    expect(session.snapshot().receiptIndex["attack-calibration:calibration.good"]).toBeDefined();

    const loaded = GameSession.load(session.toSave());
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.session.snapshot()).toEqual(session.snapshot());
  });

  it("fails closed when each required graph node is missing", () => {
    const session = buildQualifiedEvidence();
    const snapshot = session.snapshot();
    const committedWorldEvents = session.events().flatMap((event): CommittedWorldEventReference[] =>
      event.type === "quest_stage_set" || event.type === "world_flag_set" ||
      event.type === "scene_entered" || event.type === "learning_evidence_committed"
        ? [{ eventId: event.eventId, sequence: event.sequence, type: event.type }]
        : []);
    const committedEvidence: CommittedLearningEvidenceReference[] = Object.values(snapshot.learning.words)
      .flatMap((word) => word.evidence.flatMap((entry) => entry.committedAtSessionSequence == null
        ? []
        : [{ evidenceEventId: entry.eventId, sessionSequence: entry.committedAtSessionSequence }]));
    const excludedEventType = {
      telo_active_retrieval: "active_retrieval_submitted",
      noncombat_tawa_ast: "noncombat_action_completed",
      inert_wawa_grounding: "grounding_trial_resolved",
      related_repair: "repair_completed",
      delayed_retrieval: "delayed_retrieval_completed",
    } as const satisfies Readonly<Record<AttackQualificationNodeId, string>>;

    for (const missingNode of Object.keys(excludedEventType) as AttackQualificationNodeId[]) {
      const learning: LearningProgressionSnapshot = {
        ...snapshot.learning,
        words: Object.fromEntries(Object.entries(snapshot.learning.words).map(([wordId, word]) => [
          wordId,
          { ...word, evidence: word.evidence.filter((entry) =>
            entry.eventType !== excludedEventType[missingNode]) },
        ])),
      };
      const evaluation = evaluateAttackQualification(
        RUNTIME_ATTACK_QUALIFICATION_CONTRACT,
        learning,
        committedWorldEvents,
        committedEvidence,
      );
      expect(evaluation.qualified, missingNode).toBe(false);
      expect(evaluation.nodes[missingNode], missingNode).toBe(false);
      expect(evaluation.missingNodes).toEqual([missingNode]);
    }
  });
  it("rejects same-batch prerequisite cycles", () => {
    const session = createSession();
    const evidence = proposeAttackQualificationEvidence("cycle.evidence", "settlement.telo.h0").drafts[0]!;
    const calibration = proposeAttackCapacityCalibration("cycle.calibration").drafts[0]!;
    expect(commitSessionProposal(session, { transactionId: "cycle", drafts: [evidence, calibration] }))
      .toMatchObject({ committed: false, reason: "invalid_event" });
    const permission = proposeAttackPermission("cycle.permission").drafts[0]!;
    const observation = proposeReturnObservation("cycle.observation").drafts[0]!;
    expect(commitSessionProposal(session, { transactionId: "cycle.permission", drafts: [observation, permission] }))
      .toMatchObject({ committed: false, reason: "invalid_event" });
  });
  it("keeps return observation and permission as later separate receipt-backed events", () => {
    let session = buildQualifiedEvidence();
    expect(commitSessionProposal(session, proposeAttackPermission("permission.early")))
      .toMatchObject({ committed: false, reason: "invalid_event" });
    const calibrated = atTable(session).calibrateAttackCapacity("calibration.permission");
    expect(calibrated.accepted, calibrated.reason).toBe(true);
    session = calibrated.session;
    expect(session.snapshot().world.flags["global:prologue_return_observed"]?.value).toBe(true);
    const settlement = atTable(session);
    const permission = settlement.grantAttackRangeTrialPermission("permission.good");
    expect(permission.accepted, permission.reason).toBe(true);
    session = permission.session;
    expect(session.snapshot().world.flags[`global:${RANGE_TRIAL_PERMISSION_FLAG_ID}`]?.value).toBe(true);
    expect(session.snapshot().world.flags[`global:${FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID}`]).toBeUndefined();
  });

  it("rejects far/NaN/stale public interaction claims and executes only through live Settlement authority", () => {
    const far = commitSessionProposal(createSession(), proposeAttackQualificationInteraction("far", { x: 0, y: 0 }, 0));
    expect(far).toMatchObject({ committed: false, reason: "invalid_event" });
    const nan = commitSessionProposal(createSession(), proposeAttackQualificationInteraction("nan", { x: Number.NaN, y: 28 * 16 }, 0));
    expect(nan).toMatchObject({ committed: false, reason: "invalid_event" });
    const stale = commitSessionProposal(createSession(), proposeAttackQualificationInteraction("stale", { x: 36 * 16, y: 28 * 16 }, 99));
    expect(stale).toMatchObject({ committed: false, reason: "invalid_event" });

    const settlement = atTable(createSession());
    expect(settlement.commitAttackQualificationAction("settlement.telo.h0", "once"))
      .toMatchObject({ accepted: true, duplicate: false });
    expect(settlement.commitAttackQualificationAction("settlement.telo.h0", "once"))
      .toMatchObject({ accepted: true, duplicate: true });
    expect(settlement.commitAttackQualificationAction("settlement.tawa.h0", "once"))
      .toMatchObject({ accepted: false, reason: "transaction_conflict" });
  });
  it("rejects missing or wrong N07 subjects and binds H0/H1 to the source prompt", () => {
    let session = createSession();
    session = next(session, { eventId: "quest.return.source.complete", type: "quest_stage_set",
      payload: { questId: "ch01_return_flow", stageId: "completed", stageOrdinal: 1 } });
    session = next(session, { eventId: "scene.return.source", type: "scene_entered",
      payload: { sceneId: "scene.valley.return_channel" } });
    expect(commitSessionProposal(session,
      proposeAttackQualificationEvidence("wawa.missing", "return_flow.wawa.inert_h0")))
      .toMatchObject({ committed: false, reason: "invalid_event" });
    expect(commitSessionProposal(session,
      proposeAttackQualificationEvidence("wawa.wrong", "return_flow.wawa.inert_h0", undefined, undefined,
        "quest.return.source.complete")))
      .toMatchObject({ committed: false, reason: "invalid_event" });

    const sourceTransactionId = "wawa.prompt.source";
    const sourceEventId = `session.learning.evidence.${sourceTransactionId}`;
    session = commit(session, proposeLearningEvidence(sourceTransactionId, {
      eventId: "return-flow.wawa.grounding.prompt", eventType: "grounding_trial_resolved",
      playerSaveId: session.sessionId, wordId: "wawa",
      idempotencyKey: `${session.sessionId}:return-flow:wawa:grounding:prompt`,
      sourceObjectClass: "inert_return_flow_mechanism", taskId: "ch01_return_flow",
      taskFamilyId: "ecology_and_return_flow", variantHash: "wawa-prompt-source-variant",
      normalizedEnvironmentFingerprint: "return-flow-restored", promptLevel: 0,
      interpretationStatus: "executed_legal", worldOutcomeContribution: true, toolBypass: false,
      answerVisible: false, fixedSlotOnly: false, colorOnlyCue: false,
      semanticFacetsDemonstrated: ["intensity", "energy_input", "noncombat_force"],
      canonicalAstWordIds: ["word.wawa"], worldOutcomeKind: "inert_force_observation",
    }));
    expect(commitSessionProposal(session,
      proposeAttackQualificationEvidence("wawa.prompt.mismatch", "return_flow.wawa.inert_h1", undefined,
        undefined, sourceEventId)))
      .toMatchObject({ committed: false, reason: "invalid_event" });
  });
  it("rejects changed generated provenance instead of branding a structurally similar fake", () => {
    const digestFake = structuredClone(generatedRuntimeArtifact) as any;
    digestFake.safeRangeQualification.sourceDigest = `sha256:${"0".repeat(64)}`;
    expect(() => readRuntimeAttackQualificationContract(digestFake)).toThrow(/sourceDigest/);
    const pathFake = structuredClone(generatedRuntimeArtifact) as any;
    pathFake.safeRangeQualification.sourcePath = "data/tasks/fake.yaml";
    expect(() => readRuntimeAttackQualificationContract(pathFake)).toThrow(/identity/);
  });
});
