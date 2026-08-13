import { describe, expect, it } from "vitest";
import {
  P0_WORD_IDS,
  advanceVisualActivation,
  createLearningProgression,
  createVisualActivation,
  reduceLearningEvidence,
  resetVisualActivation,
  type ActiveRetrievalSubmittedEvent,
  type DelayedRetrievalCompletedEvent,
  type GlyphAttunementCompletedEvent,
  type GlyphDiscoveredEvent,
  type GroundingTrialResolvedEvent,
  type LearningEvidenceEvent,
  type LearningProgressionSnapshot,
  type UnseenTransferCompletedEvent,
} from "./progression";

const discover = (wordId = "telo"): GlyphDiscoveredEvent => ({
  eventId: `discover.${wordId}`,
  eventType: "glyph_discovered",
  playerSaveId: "save.test",
  wordId,
  idempotencyKey: `save.test:discover:${wordId}`,
  locationId: "forest.spring",
  recognitionMode: "world_observation",
});

const attune = (wordId = "telo"): GlyphAttunementCompletedEvent => ({
  eventId: `attune.${wordId}`,
  eventType: "glyph_attunement_completed",
  playerSaveId: "save.test",
  wordId,
  idempotencyKey: `save.test:attune:${wordId}`,
  catalystClass: "common_nontradeable",
  catalystTradeable: false,
  environmentalWitnessId: "witness.spring.water",
});

const context = (
  eventType: GroundingTrialResolvedEvent["eventType"] | ActiveRetrievalSubmittedEvent["eventType"],
  family: string,
  variant: string,
  facets: readonly string[] = ["water"],
): GroundingTrialResolvedEvent | ActiveRetrievalSubmittedEvent => ({
  eventId: `${eventType}.${variant}`,
  eventType,
  playerSaveId: "save.test",
  wordId: "telo",
  idempotencyKey: `save.test:${eventType}:${variant}`,
  taskId: `task.${variant}`,
  taskFamilyId: family,
  variantHash: variant,
  normalizedEnvironmentFingerprint: `env.${variant}`,
  promptLevel: 0,
  interpretationStatus: "parsed_grounded",
  worldOutcomeContribution: true,
  toolBypass: false,
  answerVisible: false,
  fixedSlotOnly: false,
  colorOnlyCue: false,
  semanticFacetsDemonstrated: facets,
  canonicalAstWordIds: ["word.telo"],
});

const unseen = (variant: string, family = "family.transfer"): UnseenTransferCompletedEvent => ({
  ...context("active_retrieval_submitted", family, variant, ["liquid_identity"]),
  eventId: `unseen.${variant}`,
  eventType: "unseen_transfer_completed",
  idempotencyKey: `save.test:unseen:${variant}`,
});

const delayed = (variant: string, family = "family.delayed"): DelayedRetrievalCompletedEvent => ({
  ...context("active_retrieval_submitted", family, variant, ["washing_or_drinking"]),
  eventId: `delayed.${variant}`,
  eventType: "delayed_retrieval_completed",
  idempotencyKey: `save.test:delayed:${variant}`,
  unrelatedWorldEventIds: ["world.event.a", "world.event.b"],
});

const apply = (
  snapshot: LearningProgressionSnapshot,
  event: LearningEvidenceEvent,
): LearningProgressionSnapshot => reduceLearningEvidence(snapshot, event).snapshot;

const groundedTelo = (): LearningProgressionSnapshot => {
  let snapshot = createLearningProgression();
  snapshot = apply(snapshot, discover());
  snapshot = apply(snapshot, attune());
  snapshot = apply(snapshot, context("grounding_trial_resolved", "family.ground", "ground.1"));
  return snapshot;
};

const producedTelo = (): LearningProgressionSnapshot => {
  let snapshot = groundedTelo();
  snapshot = apply(snapshot, context("active_retrieval_submitted", "family.channel", "active.1"));
  snapshot = apply(snapshot, context("active_retrieval_submitted", "family.washing", "active.2"));
  return snapshot;
};

describe("learning progression", () => {
  it("defines exactly the twelve P0 glyphs", () => {
    expect(P0_WORD_IDS).toHaveLength(12);
    expect(new Set(P0_WORD_IDS).size).toBe(12);
    expect(P0_WORD_IDS).toContain("telo");
    expect(P0_WORD_IDS).not.toContain("o");
    expect(P0_WORD_IDS).not.toContain("wawa");
  });

  it("keeps temporary visual activation outside permanent progression", () => {
    const snapshot = createLearningProgression();
    let visual = createVisualActivation();
    for (let index = 0; index < 7; index += 1) visual = advanceVisualActivation(visual);

    expect(visual).toEqual({ state: "active", frameIndex: 7 });
    expect(snapshot.words).toEqual({});
    expect(resetVisualActivation()).toEqual({ state: "dormant", frameIndex: 0 });
  });

  it("requires discovery before permanent attunement", () => {
    const early = reduceLearningEvidence(createLearningProgression(), attune());
    const discovered = reduceLearningEvidence(early.snapshot, discover());
    const retriedOldEvent = reduceLearningEvidence(discovered.snapshot, attune());
    const freshAttunement = reduceLearningEvidence(discovered.snapshot, {
      ...attune(),
      eventId: "attune.telo.valid",
      idempotencyKey: "save.test:attune:telo:valid",
    });

    expect(early.reason).toBe("prerequisite_missing");
    expect(retriedOldEvent.reason).toBe("duplicate_event");
    expect(freshAttunement.snapshot.words.telo?.attunementState).toBe("attuned");
    expect(freshAttunement.snapshot.words.telo?.learningState).toBe("discovered");
  });

  it("rejects tradable or non-common activation materials", () => {
    const discovered = apply(createLearningProgression(), discover());
    const rejected = reduceLearningEvidence(discovered, {
      ...attune(),
      catalystClass: "other",
      catalystTradeable: true,
    });

    expect(rejected.reason).toBe("ineligible_evidence");
    expect(rejected.snapshot.words.telo?.attunementState).toBe("locked");
  });

  it("is idempotent and rejects a conflicting payload under the same key", () => {
    const first = reduceLearningEvidence(createLearningProgression(), discover());
    const duplicate = reduceLearningEvidence(first.snapshot, discover());
    const conflict = reduceLearningEvidence(first.snapshot, {
      ...discover(),
      locationId: "another.location",
    });

    expect(duplicate.reason).toBe("duplicate_event");
    expect(duplicate.snapshot).toBe(first.snapshot);
    expect(conflict.reason).toBe("idempotency_conflict");
    expect(conflict.snapshot).toBe(first.snapshot);
  });

  it("persists an optional source object class in evidence without changing legacy eligibility", () => {
    let snapshot = createLearningProgression();
    snapshot = apply(snapshot, discover());
    snapshot = apply(snapshot, attune());
    const event = {
      ...context("grounding_trial_resolved", "family.return-flow", "ground.wawa.inert"),
      sourceObjectClass: "inert_return_flow_mechanism",
    } as GroundingTrialResolvedEvent;
    const result = reduceLearningEvidence(snapshot, event);
    expect(result.applied).toBe(true);
    expect(result.snapshot.words.telo?.evidence.at(-1)?.sourceObjectClass)
      .toBe("inert_return_flow_mechanism");
  });
  it("requires a valid authored grounding intervention", () => {
    let snapshot = apply(createLearningProgression(), discover());
    snapshot = apply(snapshot, attune());
    const bypass = reduceLearningEvidence(snapshot, {
      ...context("grounding_trial_resolved", "family.ground", "ground.bypass"),
      toolBypass: true,
    });
    const answerShown = reduceLearningEvidence(snapshot, {
      ...context("grounding_trial_resolved", "family.ground", "ground.answer"),
      answerVisible: true,
    });
    const valid = reduceLearningEvidence(snapshot, context("grounding_trial_resolved", "family.ground", "ground.ok"));

    expect(bypass.reason).toBe("ineligible_evidence");
    expect(answerShown.reason).toBe("ineligible_evidence");
    expect(valid.snapshot.words.telo?.learningState).toBe("grounded");
  });

  it("requires two low-hint task families for produced", () => {
    let snapshot = groundedTelo();
    snapshot = apply(snapshot, context("active_retrieval_submitted", "family.channel", "active.1"));
    const sameFamily = reduceLearningEvidence(
      snapshot,
      context("active_retrieval_submitted", "family.channel", "active.2"),
    );
    const secondFamily = reduceLearningEvidence(
      sameFamily.snapshot,
      context("active_retrieval_submitted", "family.washing", "active.3"),
    );

    expect(sameFamily.snapshot.words.telo?.learningState).toBe("grounded");
    expect(secondFamily.snapshot.words.telo?.learningState).toBe("produced");
    expect(secondFamily.snapshot.words.telo?.producedBaselineTaskFamilies).toEqual([
      "family.channel",
      "family.washing",
    ]);
    expect(secondFamily.snapshot.words.telo?.producedBaselineEnvironmentFingerprints).toEqual([
      "env.active.1",
      "env.active.2",
      "env.active.3",
    ]);
  });

  it("does not count the same normalized variant twice", () => {
    const snapshot = groundedTelo();
    const first = reduceLearningEvidence(
      snapshot,
      context("active_retrieval_submitted", "family.channel", "active.same"),
    );
    const replay = reduceLearningEvidence(first.snapshot, {
      ...context("active_retrieval_submitted", "family.other", "active.same"),
      eventId: "active.replay",
      idempotencyKey: "save.test:active:replay",
    });

    expect(replay.reason).toBe("duplicate_variant");
    expect(replay.snapshot.words.telo?.productionTaskFamilies).toEqual(["family.channel"]);
  });

  it("stabilizes only after new-family unseen transfer, logical delay, and semantic contrast", () => {
    let snapshot = producedTelo();
    snapshot = apply(snapshot, unseen("transfer.1"));
    const tooSoon = reduceLearningEvidence(snapshot, {
      ...delayed("delay.too-soon"),
      unrelatedWorldEventIds: ["world.event.a"],
    });
    const delayedValid = reduceLearningEvidence(tooSoon.snapshot, delayed("delay.valid"));

    expect(tooSoon.reason).toBe("ineligible_evidence");
    expect(tooSoon.snapshot.words.telo?.learningState).toBe("produced");
    expect(delayedValid.snapshot.words.telo?.learningState).toBe("stabilized");
  });

  it("requires transfer evidence to use environments outside the produced baseline", () => {
    const snapshot = producedTelo();
    const reusedEnvironment = reduceLearningEvidence(snapshot, {
      ...unseen("transfer.baseline"),
      normalizedEnvironmentFingerprint: "env.active.1",
    });

    expect(reusedEnvironment.reason).toBe("ineligible_evidence");
    expect(reusedEnvironment.snapshot.words.telo?.learningState).toBe("produced");
  });

  it("does not let unseen and delayed evidence share an environment or variant", () => {
    let snapshot = producedTelo();
    snapshot = apply(snapshot, unseen("transfer.unique"));
    const sameEnvironment = reduceLearningEvidence(snapshot, {
      ...delayed("delay.same-environment"),
      normalizedEnvironmentFingerprint: "env.transfer.unique",
    });
    const sameVariant = reduceLearningEvidence(snapshot, {
      ...delayed("transfer.unique"),
      normalizedEnvironmentFingerprint: "env.delay.other",
      idempotencyKey: "save.test:delayed:same-variant",
    });

    expect(sameEnvironment.reason).toBe("ineligible_evidence");
    expect(sameVariant.reason).toBe("ineligible_evidence");
    expect(sameVariant.snapshot.words.telo?.learningState).toBe("produced");
  });

  it("uses bare save word IDs but namespaced canonical AST word-node IDs", () => {
    let snapshot = apply(createLearningProgression(), discover());
    snapshot = apply(snapshot, attune());
    const bareAstId = reduceLearningEvidence(snapshot, {
      ...context("grounding_trial_resolved", "family.ground", "ground.bare-ast"),
      canonicalAstWordIds: ["telo"],
    });
    const namespacedSaveId = reduceLearningEvidence(snapshot, {
      ...context("grounding_trial_resolved", "family.ground", "ground.namespaced-save"),
      wordId: "word.telo",
      canonicalAstWordIds: ["word.telo"],
    });

    expect(bareAstId.reason).toBe("invalid_event");
    expect(namespacedSaveId.reason).toBe("invalid_event");
  });

  it("never lets later evidence regress a stabilized word", () => {
    let snapshot = producedTelo();
    snapshot = apply(snapshot, unseen("transfer.1"));
    snapshot = apply(snapshot, delayed("delay.1"));
    const laterGrounding = reduceLearningEvidence(
      snapshot,
      context("grounding_trial_resolved", "family.later", "ground.later"),
    );

    expect(laterGrounding.snapshot.words.telo?.learningState).toBe("stabilized");
  });
});
