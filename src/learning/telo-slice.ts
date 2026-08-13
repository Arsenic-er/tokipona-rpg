import {
  advanceVisualActivation,
  createVisualActivation,
  reduceLearningEvidence,
  type ActiveRetrievalSubmittedEvent,
  type DelayedRetrievalCompletedEvent,
  type GlyphAttunementCompletedEvent,
  type GlyphDiscoveredEvent,
  type GroundingTrialResolvedEvent,
  type InterpretationStatus,
  type LearningEvidenceEvent,
  type LearningReductionResult,
  type PromptLevel,
  type UnseenTransferCompletedEvent,
  type VisualActivationFrame,
} from "./progression";
import type {
  GameSessionState,
  SessionEconomySummary,
} from "../session/game-session";
import type {
  SessionEventDraft,
  SessionProposalBatch,
} from "../session/adapters";

export const TELO_WORD_ID = "telo" as const;
export const TELO_CANONICAL_AST_WORD_ID = "word.telo" as const;
export const TELO_ACTIVATION_FRAME_COUNT = 8;

export const TELO_ATTUNEMENT_ITEMS = Object.freeze({
  commonResonance: "material.resonance_common",
  waterSample: "sample.water_common",
});

export const TELO_ATTUNEMENT_RESOURCE_POLICY = Object.freeze({
  [TELO_ATTUNEMENT_ITEMS.commonResonance]: Object.freeze({
    quantity: 1,
    sourcePolicy: "replenishable_common" as const,
    tradeable: false,
  }),
  [TELO_ATTUNEMENT_ITEMS.waterSample]: Object.freeze({
    quantity: 1,
    sourcePolicy: "refillable_clean_water" as const,
    tradeable: false,
  }),
});

export const TELO_GROUNDING_TASKS = Object.freeze({
  streamRecognition: Object.freeze({
    taskId: "telo.grounding.stream-recognition",
    taskFamilyId: "telo.grounding.liquid-recognition",
    semanticFacets: Object.freeze(["water_or_liquid"]),
  }),
  washingUse: Object.freeze({
    taskId: "telo.grounding.washing-use",
    taskFamilyId: "telo.grounding.practical-use",
    semanticFacets: Object.freeze(["washing_or_wetting"]),
  }),
});

export const TELO_PRODUCTION_TASKS = Object.freeze({
  channelWaterH0: Object.freeze({
    taskId: "telo.production.channel-water.h0",
    taskFamilyId: "telo.production.channel",
    promptLevel: 0 as const,
    semanticFacets: Object.freeze(["water_or_liquid", "directed_water_use"]),
  }),
  washSootH1: Object.freeze({
    taskId: "telo.production.wash-soot.h1",
    taskFamilyId: "telo.production.washing",
    promptLevel: 1 as const,
    semanticFacets: Object.freeze(["water_or_liquid", "washing_or_wetting"]),
  }),
});

export const TELO_STABILIZATION_TASKS = Object.freeze({
  unseenTransfer: Object.freeze({
    taskId: "telo.transfer.unseen-liquid-source",
    taskFamilyId: "telo.transfer.unseen-source",
    semanticFacets: Object.freeze(["liquid_identity"]),
  }),
  delayedRetrieval: Object.freeze({
    taskId: "telo.transfer.delayed-camp-use",
    taskFamilyId: "telo.transfer.delayed-use",
    semanticFacets: Object.freeze(["drinking_or_washing"]),
  }),
});

type TeloGroundingTaskId = keyof typeof TELO_GROUNDING_TASKS;
type TeloProductionTaskId = keyof typeof TELO_PRODUCTION_TASKS;

export type TeloProposalReason =
  | "proposed"
  | "attempt_cancelled"
  | "attempt_failed"
  | "missing_materials"
  | "duplicate_event"
  | "idempotency_conflict"
  | "prerequisite_missing"
  | "ineligible_evidence"
  | "duplicate_variant"
  | "invalid_event";

export interface TeloAcceptedProposal {
  readonly accepted: true;
  readonly reason: "proposed";
  readonly event: LearningEvidenceEvent;
  readonly reduction: LearningReductionResult;
  readonly batch: SessionProposalBatch;
  readonly consumedItems: Readonly<Record<string, number>>;
}

export interface TeloRejectedProposal {
  readonly accepted: false;
  readonly reason: Exclude<TeloProposalReason, "proposed">;
  readonly event: LearningEvidenceEvent | null;
  readonly reduction: LearningReductionResult | null;
  readonly batch: null;
  readonly consumedItems: Readonly<Record<string, number>>;
}

export type TeloProposalResult = TeloAcceptedProposal | TeloRejectedProposal;

export interface TeloDiscoveryInput {
  readonly occurrenceId: string;
  readonly locationId: string;
  readonly recognitionMode?: "world_observation" | "recovery_route";
}

export interface TeloAttunementInput {
  readonly attemptId: string;
  readonly occurrenceId: string;
  readonly environmentalWitnessId: string;
  readonly outcome: "success" | "failed" | "cancelled";
}

interface ContextualAttemptInput {
  readonly attemptId: string;
  readonly variantHash: string;
  readonly normalizedEnvironmentFingerprint: string;
  readonly interpretationStatus: InterpretationStatus;
  readonly worldOutcomeContribution: boolean;
  readonly toolBypass: boolean;
  readonly answerVisible: boolean;
  readonly fixedSlotOnly: boolean;
  readonly colorOnlyCue: boolean;
}

export interface TeloGroundingInput extends ContextualAttemptInput {
  readonly task: TeloGroundingTaskId;
  readonly promptLevel: PromptLevel;
}

export interface TeloProductionInput extends ContextualAttemptInput {
  readonly task: TeloProductionTaskId;
}

export interface TeloUnseenTransferInput extends ContextualAttemptInput {
  readonly promptLevel: 0 | 1;
}

export interface TeloDelayedRetrievalInput extends ContextualAttemptInput {
  readonly promptLevel: 0 | 1;
  readonly unrelatedWorldEventIds: readonly string[];
}

const requiredId = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} is required`);
  return normalized;
};

const receiptDraft = (
  transactionId: string,
  event: LearningEvidenceEvent,
): SessionEventDraft => ({
  eventId: `session.receipt.learning.${transactionId}`,
  type: "receipt_recorded",
  payload: {
    receiptId: transactionId,
    domain: "learning",
    payloadHash: `telo:${event.eventType}:${event.eventId}`,
  },
});

const learningDraft = (
  transactionId: string,
  reduction: LearningReductionResult,
): SessionEventDraft => ({
  eventId: `session.learning.telo.${transactionId}`,
  type: "learning_replaced",
  payload: { learning: reduction.snapshot },
});

const reject = (
  reason: Exclude<TeloProposalReason, "proposed">,
  event: LearningEvidenceEvent | null = null,
  reduction: LearningReductionResult | null = null,
): TeloRejectedProposal => ({
  accepted: false,
  reason,
  event,
  reduction,
  batch: null,
  consumedItems: {},
});

const reductionFailureReason = (
  reduction: LearningReductionResult,
): Exclude<TeloProposalReason, "proposed" | "attempt_cancelled" | "attempt_failed" | "missing_materials"> => {
  switch (reduction.reason) {
    case "duplicate_event":
    case "idempotency_conflict":
    case "prerequisite_missing":
    case "ineligible_evidence":
    case "duplicate_variant":
    case "invalid_event":
      return reduction.reason;
    case "state_advanced":
    case "evidence_recorded":
      throw new Error("an applied reduction cannot be mapped to a rejection");
  }
};

const proposeLearningEvent = (
  state: GameSessionState,
  transactionId: string,
  event: LearningEvidenceEvent,
  extraDrafts: readonly SessionEventDraft[] = [],
  consumedItems: Readonly<Record<string, number>> = {},
): TeloProposalResult => {
  const reduction = reduceLearningEvidence(state.learning, event);
  if (!reduction.applied) {
    return reject(reductionFailureReason(reduction), event, reduction);
  }
  return {
    accepted: true,
    reason: "proposed",
    event,
    reduction,
    batch: {
      transactionId,
      drafts: [
        ...extraDrafts,
        learningDraft(transactionId, reduction),
        receiptDraft(transactionId, event),
      ],
    },
    consumedItems,
  };
};

interface ConsumptionResult {
  readonly economy: SessionEconomySummary;
  readonly consumedItems: Readonly<Record<string, number>>;
}

const consumeAttunementItems = (economy: SessionEconomySummary): ConsumptionResult | null => {
  const costs = Object.entries(TELO_ATTUNEMENT_RESOURCE_POLICY).map(([itemId, policy]) => ({
    itemId,
    quantity: policy.quantity,
  }));
  for (const cost of costs) {
    const available = economy.lots
      .filter((lot) => lot.itemId === cost.itemId)
      .reduce((total, lot) => total + lot.quantity, 0);
    if (available < cost.quantity) return null;
  }

  const nextRevision = economy.inventoryRevision + 1;
  const remainingByItem = new Map<string, number>(costs.map((cost) => [cost.itemId, cost.quantity]));
  const lots = [...economy.lots]
    .sort((left, right) => left.lotId.localeCompare(right.lotId))
    .map((lot) => {
      const remaining = remainingByItem.get(lot.itemId) ?? 0;
      if (remaining === 0) return lot;
      const deducted = Math.min(remaining, lot.quantity);
      remainingByItem.set(lot.itemId, remaining - deducted);
      return {
        ...lot,
        quantity: lot.quantity - deducted,
        ownershipRevision: nextRevision,
      };
    });

  return {
    economy: {
      ...economy,
      inventoryRevision: nextRevision,
      lots,
    },
    consumedItems: Object.fromEntries(costs.map((cost) => [cost.itemId, cost.quantity])),
  };
};

const contextualBase = (
  playerSaveId: string,
  input: ContextualAttemptInput,
  task: {
    readonly taskId: string;
    readonly taskFamilyId: string;
    readonly semanticFacets: readonly string[];
  },
  promptLevel: PromptLevel,
) => ({
  playerSaveId,
  wordId: TELO_WORD_ID,
  taskId: task.taskId,
  taskFamilyId: task.taskFamilyId,
  variantHash: requiredId(input.variantHash, "variantHash"),
  normalizedEnvironmentFingerprint: requiredId(
    input.normalizedEnvironmentFingerprint,
    "normalizedEnvironmentFingerprint",
  ),
  promptLevel,
  interpretationStatus: input.interpretationStatus,
  worldOutcomeContribution: input.worldOutcomeContribution,
  toolBypass: input.toolBypass,
  answerVisible: input.answerVisible,
  fixedSlotOnly: input.fixedSlotOnly,
  colorOnlyCue: input.colorOnlyCue,
  semanticFacetsDemonstrated: task.semanticFacets,
  canonicalAstWordIds: [TELO_CANONICAL_AST_WORD_ID],
});

export class TeloLearningSlice {
  private readonly playerSaveId: string;

  constructor(playerSaveId: string) {
    this.playerSaveId = requiredId(playerSaveId, "playerSaveId");
  }

  proposeDiscovery(state: GameSessionState, input: TeloDiscoveryInput): TeloProposalResult {
    const occurrenceId = requiredId(input.occurrenceId, "occurrenceId");
    const event: GlyphDiscoveredEvent = {
      eventId: `telo.discovery.${occurrenceId}`,
      eventType: "glyph_discovered",
      playerSaveId: this.playerSaveId,
      wordId: TELO_WORD_ID,
      idempotencyKey: `${this.playerSaveId}:telo:discovery:${occurrenceId}`,
      locationId: requiredId(input.locationId, "locationId"),
      recognitionMode: input.recognitionMode ?? "world_observation",
    };
    return proposeLearningEvent(state, event.idempotencyKey, event);
  }

  proposeAttunement(state: GameSessionState, input: TeloAttunementInput): TeloProposalResult {
    if (input.outcome === "cancelled") return reject("attempt_cancelled");
    if (input.outcome === "failed") return reject("attempt_failed");

    const attemptId = requiredId(input.attemptId, "attemptId");
    const occurrenceId = requiredId(input.occurrenceId, "occurrenceId");
    const event: GlyphAttunementCompletedEvent = {
      eventId: `telo.attunement.${attemptId}`,
      eventType: "glyph_attunement_completed",
      playerSaveId: this.playerSaveId,
      wordId: TELO_WORD_ID,
      idempotencyKey: `${this.playerSaveId}:telo:attunement:${attemptId}`,
      catalystClass: "common_nontradeable",
      catalystTradeable: false,
      environmentalWitnessId: `${requiredId(input.environmentalWitnessId, "environmentalWitnessId")}:${occurrenceId}`,
    };

    const reduction = reduceLearningEvidence(state.learning, event);
    if (!reduction.applied) return reject(reductionFailureReason(reduction), event, reduction);

    const consumption = consumeAttunementItems(state.economy);
    if (consumption === null) return reject("missing_materials", event, reduction);
    const economyDraft: SessionEventDraft = {
      eventId: `session.economy.telo.${event.idempotencyKey}`,
      type: "economy_replaced",
      payload: { economy: consumption.economy },
    };
    return proposeLearningEvent(
      state,
      event.idempotencyKey,
      event,
      [economyDraft],
      consumption.consumedItems,
    );
  }

  proposeGrounding(state: GameSessionState, input: TeloGroundingInput): TeloProposalResult {
    const task = TELO_GROUNDING_TASKS[input.task];
    const attemptId = requiredId(input.attemptId, "attemptId");
    const event: GroundingTrialResolvedEvent = {
      ...contextualBase(this.playerSaveId, input, task, input.promptLevel),
      eventId: `telo.grounding.${attemptId}`,
      eventType: "grounding_trial_resolved",
      idempotencyKey: `${this.playerSaveId}:telo:grounding:${attemptId}`,
    };
    return proposeLearningEvent(state, event.idempotencyKey, event);
  }

  proposeProduction(state: GameSessionState, input: TeloProductionInput): TeloProposalResult {
    const task = TELO_PRODUCTION_TASKS[input.task];
    const attemptId = requiredId(input.attemptId, "attemptId");
    const event: ActiveRetrievalSubmittedEvent = {
      ...contextualBase(this.playerSaveId, input, task, task.promptLevel),
      eventId: `telo.production.${attemptId}`,
      eventType: "active_retrieval_submitted",
      idempotencyKey: `${this.playerSaveId}:telo:production:${attemptId}`,
    };
    return proposeLearningEvent(state, event.idempotencyKey, event);
  }

  proposeUnseenTransfer(state: GameSessionState, input: TeloUnseenTransferInput): TeloProposalResult {
    const task = TELO_STABILIZATION_TASKS.unseenTransfer;
    const attemptId = requiredId(input.attemptId, "attemptId");
    const event: UnseenTransferCompletedEvent = {
      ...contextualBase(this.playerSaveId, input, task, input.promptLevel),
      eventId: `telo.unseen.${attemptId}`,
      eventType: "unseen_transfer_completed",
      idempotencyKey: `${this.playerSaveId}:telo:unseen:${attemptId}`,
    };
    return proposeLearningEvent(state, event.idempotencyKey, event);
  }

  proposeDelayedRetrieval(
    state: GameSessionState,
    input: TeloDelayedRetrievalInput,
  ): TeloProposalResult {
    const task = TELO_STABILIZATION_TASKS.delayedRetrieval;
    const attemptId = requiredId(input.attemptId, "attemptId");
    const event: DelayedRetrievalCompletedEvent = {
      ...contextualBase(this.playerSaveId, input, task, input.promptLevel),
      eventId: `telo.delayed.${attemptId}`,
      eventType: "delayed_retrieval_completed",
      idempotencyKey: `${this.playerSaveId}:telo:delayed:${attemptId}`,
      unrelatedWorldEventIds: input.unrelatedWorldEventIds.map((eventId) => requiredId(eventId, "worldEventId")),
    };
    return proposeLearningEvent(state, event.idempotencyKey, event);
  }
}

export const createTeloVisualActivationFrames = (): readonly VisualActivationFrame[] => {
  const frames: VisualActivationFrame[] = [];
  let current = createVisualActivation();
  frames.push(current);
  for (let index = 1; index < TELO_ACTIVATION_FRAME_COUNT; index += 1) {
    current = advanceVisualActivation(current);
    frames.push(current);
  }
  return frames;
};
