export const LEARNING_SAVE_SCHEMA = "tokipona.learning-progression.v0.2";
export const VISUAL_ACTIVATION_FRAME_COUNT = 8;

export const P0_WORD_IDS = [
  "awen",
  "kasi",
  "kiwen",
  "kon",
  "lili",
  "lukin",
  "seli",
  "soweli",
  "suli",
  "tawa",
  "telo",
  "weka",
] as const;

export type P0WordId = (typeof P0_WORD_IDS)[number];
export type DiscoveryState = "unknown" | "discovered";
export type AttunementState = "locked" | "attuned";
export type LearningState = "discovered" | "grounded" | "produced" | "stabilized";
export type VisualActivationState = "dormant" | "activating" | "active";
export type PromptLevel = 0 | 1 | 2 | 3;
export type InterpretationStatus =
  | "parsed_grounded"
  | "executed_legal"
  | "parsed_ambiguous"
  | "parsed_out_of_scope"
  | "unparseable"
  | "system_unknown";

export type LearningEvidenceType =
  | "glyph_discovered"
  | "glyph_attunement_completed"
  | "grounding_trial_resolved"
  | "active_retrieval_submitted"
  | "noncombat_action_completed"
  | "repair_completed"
  | "unseen_transfer_completed"
  | "delayed_retrieval_completed";

interface EvidenceBase {
  readonly eventId: string;
  readonly eventType: LearningEvidenceType;
  readonly playerSaveId: string;
  readonly wordId: string;
  readonly idempotencyKey: string;
  /** Optional authored provenance. Legacy evidence omits it. */
  readonly sourceObjectClass?: string;
}

export interface GlyphDiscoveredEvent extends EvidenceBase {
  readonly eventType: "glyph_discovered";
  readonly locationId: string;
  readonly recognitionMode: "world_observation" | "recovery_route";
}

export interface GlyphAttunementCompletedEvent extends EvidenceBase {
  readonly eventType: "glyph_attunement_completed";
  readonly catalystClass: "common_nontradeable" | "other";
  readonly catalystTradeable: boolean;
  readonly environmentalWitnessId: string;
}

interface ContextualEvidenceBase extends EvidenceBase {
  readonly taskId: string;
  readonly taskFamilyId: string;
  readonly variantHash: string;
  readonly normalizedEnvironmentFingerprint: string;
  readonly promptLevel: PromptLevel;
  readonly interpretationStatus: InterpretationStatus;
  readonly worldOutcomeContribution: boolean;
  readonly toolBypass: boolean;
  readonly answerVisible: boolean;
  readonly fixedSlotOnly: boolean;
  readonly colorOnlyCue: boolean;
  readonly semanticFacetsDemonstrated: readonly string[];
  readonly canonicalAstWordIds: readonly string[];
  /** Canonical parser shape. Optional only for evidence written before qualification v0.1. */
  readonly canonicalAstShape?: string;
  /** Semantic outcome class, never a free-form player utterance. */
  readonly worldOutcomeKind?: string;
  readonly targetGraphId?: string;
  readonly repairedNodeId?: string;
  readonly retrievalTarget?: string;
  /** Set by GameSession; callers cannot choose the authoritative ordering. */
  readonly committedAtSessionSequence?: number;
}

export interface GroundingTrialResolvedEvent extends ContextualEvidenceBase {
  readonly eventType: "grounding_trial_resolved";
}

export interface ActiveRetrievalSubmittedEvent extends ContextualEvidenceBase {
  readonly eventType: "active_retrieval_submitted";
}

export interface NoncombatActionCompletedEvent extends ContextualEvidenceBase {
  readonly eventType: "noncombat_action_completed";
}

export interface RepairCompletedEvent extends ContextualEvidenceBase {
  readonly eventType: "repair_completed";
  readonly promptLevelAfterRepair: PromptLevel;
}

export interface UnseenTransferCompletedEvent extends ContextualEvidenceBase {
  readonly eventType: "unseen_transfer_completed";
}

export interface DelayedRetrievalCompletedEvent extends ContextualEvidenceBase {
  readonly eventType: "delayed_retrieval_completed";
  readonly unrelatedWorldEventIds: readonly string[];
}

export type LearningEvidenceEvent =
  | GlyphDiscoveredEvent
  | GlyphAttunementCompletedEvent
  | GroundingTrialResolvedEvent
  | ActiveRetrievalSubmittedEvent
  | NoncombatActionCompletedEvent
  | RepairCompletedEvent
  | UnseenTransferCompletedEvent
  | DelayedRetrievalCompletedEvent;

export interface EvidenceLedgerEntry {
  readonly eventId: string;
  readonly eventType: LearningEvidenceType;
  /** Normalized to null for legacy evidence without provenance. */
  readonly sourceObjectClass: string | null;
  /** Null denotes legacy evidence that cannot satisfy strict qualification nodes. */
  readonly taskId: string | null;
  readonly taskFamilyId: string | null;
  readonly variantHash: string | null;
  readonly environmentFingerprint: string | null;
  readonly promptLevel: PromptLevel | null;
  readonly canonicalAstWordIds: readonly string[];
  readonly canonicalAstShape: string | null;
  readonly interpretationStatus: InterpretationStatus | null;
  readonly worldOutcomeContribution: boolean | null;
  readonly worldOutcomeKind: string | null;
  readonly toolBypass: boolean | null;
  readonly answerVisible: boolean | null;
  readonly fixedSlotOnly: boolean | null;
  readonly colorOnlyCue: boolean | null;
  readonly promptLevelAfterRepair: PromptLevel | null;
  readonly unrelatedWorldEventIds: readonly string[];
  readonly targetGraphId: string | null;
  readonly repairedNodeId: string | null;
  readonly retrievalTarget: string | null;
  readonly committedAtSessionSequence: number | null;
  readonly semanticFacetsDemonstrated: readonly string[];
}

export interface WordLearningProgress {
  readonly wordId: string;
  readonly discoveryState: DiscoveryState;
  readonly attunementState: AttunementState;
  readonly learningState: LearningState | null;
  readonly evidence: readonly EvidenceLedgerEntry[];
  readonly productionTaskFamilies: readonly string[];
  readonly producedBaselineTaskFamilies: readonly string[];
  readonly producedBaselineEnvironmentFingerprints: readonly string[];
  readonly demonstratedSemanticFacets: readonly string[];
}

export interface LearningProgressionSnapshot {
  readonly schema: typeof LEARNING_SAVE_SCHEMA;
  readonly revision: number;
  readonly words: Readonly<Record<string, WordLearningProgress>>;
  readonly processedEventPayloads: Readonly<Record<string, string>>;
}

export type ReductionReason =
  | "state_advanced"
  | "evidence_recorded"
  | "duplicate_event"
  | "idempotency_conflict"
  | "duplicate_variant"
  | "prerequisite_missing"
  | "ineligible_evidence"
  | "invalid_event";

export interface LearningTransition {
  readonly axis: "discovery" | "attunement" | "learning";
  readonly from: string | null;
  readonly to: string;
}

export interface LearningReductionResult {
  readonly snapshot: LearningProgressionSnapshot;
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly reason: ReductionReason;
  readonly transitions: readonly LearningTransition[];
}

export interface VisualActivationFrame {
  readonly state: VisualActivationState;
  readonly frameIndex: number;
}

const EMPTY_VISUAL_ACTIVATION: VisualActivationFrame = Object.freeze({
  state: "dormant",
  frameIndex: 0,
});

export const createVisualActivation = (): VisualActivationFrame => EMPTY_VISUAL_ACTIVATION;

export const advanceVisualActivation = (current: VisualActivationFrame): VisualActivationFrame => {
  const nextFrame = Math.min(VISUAL_ACTIVATION_FRAME_COUNT - 1, current.frameIndex + 1);
  return {
    state: nextFrame === VISUAL_ACTIVATION_FRAME_COUNT - 1 ? "active" : "activating",
    frameIndex: nextFrame,
  };
};

export const resetVisualActivation = (): VisualActivationFrame => EMPTY_VISUAL_ACTIVATION;

export const createLearningProgression = (): LearningProgressionSnapshot => ({
  schema: LEARNING_SAVE_SCHEMA,
  revision: 0,
  words: {},
  processedEventPayloads: {},
});

const emptyWordProgress = (wordId: string): WordLearningProgress => ({
  wordId,
  discoveryState: "unknown",
  attunementState: "locked",
  learningState: null,
  evidence: [],
  productionTaskFamilies: [],
  producedBaselineTaskFamilies: [],
  producedBaselineEnvironmentFingerprints: [],
  demonstratedSemanticFacets: [],
});

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
};

const eventPayloadHash = (event: LearningEvidenceEvent): string => {
  const { committedAtSessionSequence: _sessionSequence, ...semanticEvent } = event as LearningEvidenceEvent &
    { readonly committedAtSessionSequence?: number };
  return JSON.stringify(canonicalize(semanticEvent));
};

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort();

const isNonEmpty = (value: string): boolean => value.trim().length > 0;

const isCanonicalBareWordId = (value: string): boolean => /^[a-z]+$/.test(value);

const canonicalAstWordNodeId = (wordId: string): string => `word.${wordId}`;

const validatesBase = (event: LearningEvidenceEvent): boolean =>
  isNonEmpty(event.eventId) &&
  isNonEmpty(event.playerSaveId) &&
  isCanonicalBareWordId(event.wordId) &&
  isNonEmpty(event.idempotencyKey) &&
  (event.sourceObjectClass === undefined || isNonEmpty(event.sourceObjectClass));

const isContextual = (
  event: LearningEvidenceEvent,
): event is
  | GroundingTrialResolvedEvent
  | ActiveRetrievalSubmittedEvent
  | NoncombatActionCompletedEvent
  | RepairCompletedEvent
  | UnseenTransferCompletedEvent
  | DelayedRetrievalCompletedEvent =>
  event.eventType === "grounding_trial_resolved" ||
  event.eventType === "active_retrieval_submitted" ||
  event.eventType === "noncombat_action_completed" ||
  event.eventType === "repair_completed" ||
  event.eventType === "unseen_transfer_completed" ||
  event.eventType === "delayed_retrieval_completed";

const contextualFieldsValid = (event: ContextualEvidenceBase): boolean =>
  isNonEmpty(event.taskId) &&
  isNonEmpty(event.taskFamilyId) &&
  isNonEmpty(event.variantHash) &&
  isNonEmpty(event.normalizedEnvironmentFingerprint) &&
  event.canonicalAstWordIds.includes(canonicalAstWordNodeId(event.wordId));

const isLowHintGroundedAction = (event: ContextualEvidenceBase): boolean =>
  contextualFieldsValid(event) &&
  event.promptLevel <= 1 &&
  (event.interpretationStatus === "parsed_grounded" || event.interpretationStatus === "executed_legal") &&
  event.worldOutcomeContribution &&
  !event.toolBypass &&
  !event.answerVisible &&
  !event.fixedSlotOnly &&
  !event.colorOnlyCue;

const toLedgerEntry = (event: LearningEvidenceEvent): EvidenceLedgerEntry => {
  if (!isContextual(event)) {
    return {
      eventId: event.eventId,
      eventType: event.eventType,
      sourceObjectClass: event.sourceObjectClass ?? null,
      taskId: null,
      taskFamilyId: null,
      variantHash: null,
      environmentFingerprint: null,
      promptLevel: null,
      canonicalAstWordIds: [],
      canonicalAstShape: null,
      interpretationStatus: null,
      worldOutcomeContribution: null,
      worldOutcomeKind: null,
      toolBypass: null,
      answerVisible: null,
      fixedSlotOnly: null,
      colorOnlyCue: null,
      promptLevelAfterRepair: null,
      unrelatedWorldEventIds: [],
      targetGraphId: null,
      repairedNodeId: null,
      retrievalTarget: null,
      committedAtSessionSequence: null,
      semanticFacetsDemonstrated: [],
    };
  }
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    sourceObjectClass: event.sourceObjectClass ?? null,
    taskId: event.taskId,
    taskFamilyId: event.taskFamilyId,
    variantHash: event.variantHash,
    environmentFingerprint: event.normalizedEnvironmentFingerprint,
    promptLevel: event.promptLevel,
    canonicalAstWordIds: [...event.canonicalAstWordIds],
    canonicalAstShape: event.canonicalAstShape ?? null,
    interpretationStatus: event.interpretationStatus,
    worldOutcomeContribution: event.worldOutcomeContribution,
    worldOutcomeKind: event.worldOutcomeKind ?? null,
    toolBypass: event.toolBypass,
    answerVisible: event.answerVisible,
    fixedSlotOnly: event.fixedSlotOnly,
    colorOnlyCue: event.colorOnlyCue,
    promptLevelAfterRepair: event.eventType === "repair_completed" ? event.promptLevelAfterRepair : null,
    unrelatedWorldEventIds: event.eventType === "delayed_retrieval_completed"
      ? unique(event.unrelatedWorldEventIds)
      : [],
    targetGraphId: event.targetGraphId ?? null,
    repairedNodeId: event.repairedNodeId ?? null,
    retrievalTarget: event.retrievalTarget ?? null,
    committedAtSessionSequence: event.committedAtSessionSequence ?? null,
    semanticFacetsDemonstrated: unique(event.semanticFacetsDemonstrated),
  };
};

const isAtLeast = (state: LearningState | null, minimum: LearningState): boolean => {
  const rank: Readonly<Record<LearningState, number>> = {
    discovered: 0,
    grounded: 1,
    produced: 2,
    stabilized: 3,
  };
  return state !== null && rank[state] >= rank[minimum];
};

const hasEvidenceVariant = (progress: WordLearningProgress, event: ContextualEvidenceBase): boolean =>
  progress.evidence.some(
    (entry) => entry.eventType === event.eventType && entry.variantHash === event.variantHash,
  );

const withEvidence = (
  progress: WordLearningProgress,
  event: LearningEvidenceEvent,
): WordLearningProgress => {
  const facets = isContextual(event) ? event.semanticFacetsDemonstrated : [];
  return {
    ...progress,
    evidence: [...progress.evidence, toLedgerEntry(event)],
    demonstratedSemanticFacets: unique([...progress.demonstratedSemanticFacets, ...facets]),
  };
};

const recordProcessedEvent = (
  snapshot: LearningProgressionSnapshot,
  event: LearningEvidenceEvent,
  payloadHash: string,
  wordProgress?: WordLearningProgress,
): LearningProgressionSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  words: wordProgress
    ? {
        ...snapshot.words,
        [event.wordId]: wordProgress,
      }
    : snapshot.words,
  processedEventPayloads: {
    ...snapshot.processedEventPayloads,
    [event.idempotencyKey]: payloadHash,
  },
});

const result = (
  snapshot: LearningProgressionSnapshot,
  applied: boolean,
  duplicate: boolean,
  reason: ReductionReason,
  transitions: readonly LearningTransition[] = [],
): LearningReductionResult => ({ snapshot, applied, duplicate, reason, transitions });

export const reduceLearningEvidence = (
  snapshot: LearningProgressionSnapshot,
  event: LearningEvidenceEvent,
): LearningReductionResult => {
  if (!validatesBase(event)) {
    return result(snapshot, false, false, "invalid_event");
  }

  const payloadHash = eventPayloadHash(event);
  const existingPayload = snapshot.processedEventPayloads[event.idempotencyKey];
  if (existingPayload !== undefined) {
    return existingPayload === payloadHash
      ? result(snapshot, false, true, "duplicate_event")
      : result(snapshot, false, false, "idempotency_conflict");
  }

  let progress = snapshot.words[event.wordId] ?? emptyWordProgress(event.wordId);
  const transitions: LearningTransition[] = [];

  if (isContextual(event) && !contextualFieldsValid(event)) {
    return result(
      recordProcessedEvent(snapshot, event, payloadHash),
      false,
      false,
      "invalid_event",
    );
  }

  switch (event.eventType) {
    case "glyph_discovered": {
      if (!isNonEmpty(event.locationId)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, false, "invalid_event");
      }
      progress = withEvidence(progress, event);
      if (progress.discoveryState === "unknown") {
        transitions.push({ axis: "discovery", from: "unknown", to: "discovered" });
        transitions.push({ axis: "learning", from: null, to: "discovered" });
        progress = { ...progress, discoveryState: "discovered", learningState: "discovered" };
      }
      break;
    }
    case "glyph_attunement_completed": {
      if (progress.discoveryState !== "discovered") {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "prerequisite_missing",
        );
      }
      if (
        event.catalystClass !== "common_nontradeable" ||
        event.catalystTradeable ||
        !isNonEmpty(event.environmentalWitnessId)
      ) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "ineligible_evidence",
        );
      }
      progress = withEvidence(progress, event);
      if (progress.attunementState === "locked") {
        transitions.push({ axis: "attunement", from: "locked", to: "attuned" });
        progress = { ...progress, attunementState: "attuned" };
      }
      break;
    }
    case "grounding_trial_resolved": {
      if (progress.attunementState !== "attuned") {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "prerequisite_missing",
        );
      }
      if (!isLowHintGroundedAction(event)) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "ineligible_evidence",
        );
      }
      if (hasEvidenceVariant(progress, event)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, true, "duplicate_variant");
      }
      progress = withEvidence(progress, event);
      if (!isAtLeast(progress.learningState, "grounded")) {
        transitions.push({ axis: "learning", from: progress.learningState, to: "grounded" });
        progress = { ...progress, learningState: "grounded" };
      }
      break;
    }
    case "active_retrieval_submitted": {
      if (!isAtLeast(progress.learningState, "grounded")) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "prerequisite_missing",
        );
      }
      if (!isLowHintGroundedAction(event)) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "ineligible_evidence",
        );
      }
      if (hasEvidenceVariant(progress, event)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, true, "duplicate_variant");
      }
      progress = withEvidence(progress, event);
      const taskFamilies = unique([...progress.productionTaskFamilies, event.taskFamilyId]);
      progress = { ...progress, productionTaskFamilies: taskFamilies };
      if (!isAtLeast(progress.learningState, "produced") && taskFamilies.length >= 2) {
        const productionEnvironmentFingerprints = unique(
          progress.evidence
            .filter((entry) => entry.eventType === "active_retrieval_submitted")
            .flatMap((entry) =>
              entry.environmentFingerprint === null ? [] : [entry.environmentFingerprint],
            ),
        );
        transitions.push({ axis: "learning", from: progress.learningState, to: "produced" });
        progress = {
          ...progress,
          learningState: "produced",
          producedBaselineTaskFamilies: taskFamilies,
          producedBaselineEnvironmentFingerprints: productionEnvironmentFingerprints,
        };
      }
      break;
    }
    case "noncombat_action_completed": {
      if (!isAtLeast(progress.learningState, "grounded")) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, false, "prerequisite_missing");
      }
      if (!isLowHintGroundedAction(event)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, false, "ineligible_evidence");
      }
      if (hasEvidenceVariant(progress, event)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, true, "duplicate_variant");
      }
      progress = withEvidence(progress, event);
      break;
    }
    case "repair_completed": {
      if (!isAtLeast(progress.learningState, "grounded")) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "prerequisite_missing",
        );
      }
      if (!isLowHintGroundedAction(event) || event.promptLevelAfterRepair > 1) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "ineligible_evidence",
        );
      }
      if (hasEvidenceVariant(progress, event)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, true, "duplicate_variant");
      }
      progress = withEvidence(progress, event);
      break;
    }
    case "unseen_transfer_completed":
    case "delayed_retrieval_completed": {
      if (!isAtLeast(progress.learningState, "produced")) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "prerequisite_missing",
        );
      }
      const isNewFamily = !progress.producedBaselineTaskFamilies.includes(event.taskFamilyId);
      const isNewEnvironment = !progress.producedBaselineEnvironmentFingerprints.includes(
        event.normalizedEnvironmentFingerprint,
      );
      const otherTransferEvidence = progress.evidence.filter(
        (entry) =>
          (entry.eventType === "unseen_transfer_completed" ||
            entry.eventType === "delayed_retrieval_completed") &&
          entry.eventType !== event.eventType,
      );
      const isDistinctFromOtherTransfer = otherTransferEvidence.every(
        (entry) =>
          entry.environmentFingerprint !== event.normalizedEnvironmentFingerprint &&
          entry.variantHash !== event.variantHash,
      );
      const hasLogicalDelay =
        event.eventType !== "delayed_retrieval_completed" ||
        unique(event.unrelatedWorldEventIds).length >= 2;
      if (
        !isLowHintGroundedAction(event) ||
        !isNewFamily ||
        !isNewEnvironment ||
        !isDistinctFromOtherTransfer ||
        !hasLogicalDelay
      ) {
        return result(
          recordProcessedEvent(snapshot, event, payloadHash),
          false,
          false,
          "ineligible_evidence",
        );
      }
      if (hasEvidenceVariant(progress, event)) {
        return result(recordProcessedEvent(snapshot, event, payloadHash), false, true, "duplicate_variant");
      }
      progress = withEvidence(progress, event);

      const unseenEvidence = progress.evidence.some(
        (entry) => entry.eventType === "unseen_transfer_completed",
      );
      const delayedEvidence = progress.evidence.some(
        (entry) => entry.eventType === "delayed_retrieval_completed",
      );
      if (
        progress.learningState !== "stabilized" &&
        unseenEvidence &&
        delayedEvidence &&
        progress.demonstratedSemanticFacets.length >= 2
      ) {
        transitions.push({ axis: "learning", from: progress.learningState, to: "stabilized" });
        progress = { ...progress, learningState: "stabilized" };
      }
      break;
    }
  }

  const nextSnapshot = recordProcessedEvent(snapshot, event, payloadHash, progress);
  return result(
    nextSnapshot,
    true,
    false,
    transitions.length > 0 ? "state_advanced" : "evidence_recorded",
    transitions,
  );
};
