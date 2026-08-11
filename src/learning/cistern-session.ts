import type { MpRecoveryProposal, MpRecoverySource } from "../spells/cast-plan";
import {
  createLearningProgression,
  reduceLearningEvidence,
  type GlyphAttunementCompletedEvent,
  type GlyphDiscoveredEvent,
  type GroundingTrialResolvedEvent,
  type ActiveRetrievalSubmittedEvent,
  type InterpretationStatus,
  type LearningEvidenceEvent,
  type LearningProgressionSnapshot,
  type LearningReductionResult,
  type PromptLevel,
} from "./progression";

export type CisternWordId = "telo" | "lili" | "suli";
export type CisternStage = "short" | "default" | "long";
export type RecoverySource = MpRecoverySource;
/** @deprecated Recovery is now a proposal applied by CastExecutionLedger. */
export type RecoveryResult = MpRecoveryProposal;

export interface CisternRecoveryConfig {
  readonly naturalMpPerTick: number;
  readonly meditationBaseRestore: number;
  readonly checkpointMinimumRestore: number;
  readonly checkpointMaxMpFraction: number;
  readonly checkpointSoftCapFraction: number;
  readonly checkpointQuantum: number;
}

export const DEFAULT_CISTERN_RECOVERY_CONFIG: CisternRecoveryConfig = Object.freeze({
  naturalMpPerTick: 0.25,
  meditationBaseRestore: 3,
  checkpointMinimumRestore: 3,
  checkpointMaxMpFraction: 0.15,
  checkpointSoftCapFraction: 0.8,
  checkpointQuantum: 0.5,
});

export interface CisternSessionOptions {
  readonly playerSaveId: string;
  /** @deprecated Ignored. CastExecutionLedger is the sole MP authority. */
  readonly currentMp?: number;
  /** @deprecated Ignored. CastExecutionLedger is the sole MP authority. */
  readonly maxMp?: number;
  readonly expressionCapacity: number;
  readonly learningSnapshot?: LearningProgressionSnapshot;
  readonly recoveryConfig?: Partial<CisternRecoveryConfig>;
}

export interface CisternSessionSnapshot {
  readonly expressionCapacity: number;
  readonly learning: LearningProgressionSnapshot;
}

export interface DiscoveryProposalInput {
  readonly wordId: CisternWordId;
  readonly occurrenceId: string;
  readonly locationId: string;
  readonly recognitionMode?: "world_observation" | "recovery_route";
}

export interface AttunementProposalInput {
  readonly wordId: CisternWordId;
  readonly occurrenceId: string;
  readonly environmentalWitnessId: string;
}

export interface ReceiverAttemptInput {
  readonly attemptId: string;
  readonly stage: CisternStage;
  readonly taskId: string;
  readonly taskFamilyId: string;
  readonly variantHash: string;
  readonly normalizedEnvironmentFingerprint: string;
  readonly receiverGoalSatisfied: boolean;
  readonly selectedActionClass: string;
  readonly toolBypass: boolean;
  readonly promptLevel: PromptLevel;
  readonly interpretationStatus: InterpretationStatus;
  readonly answerVisible: boolean;
  readonly fixedSlotOnly: boolean;
  readonly colorOnlyCue: boolean;
  readonly activeRetrieval: boolean;
}

export type EvidenceProposalReason =
  | "proposed"
  | "receiver_goal_false"
  | "tool_bypass"
  | "action_not_eligible"
  | "interpretation_not_eligible"
  | "prompt_not_eligible"
  | "answer_support_not_eligible";

export interface EvidenceProposalResult {
  readonly reason: EvidenceProposalReason;
  readonly proposedEvents: readonly LearningEvidenceEvent[];
  readonly reductions: readonly LearningReductionResult[];
  readonly learning: LearningProgressionSnapshot;
}

export interface NaturalRecoveryInput {
  readonly recoveryId: string;
  readonly ticks: number;
}

export interface MeditationRecoveryInput {
  readonly recoveryId: string;
  readonly answerAccepted: boolean;
  readonly evidenceEligible: boolean;
}

export interface CheckpointRecoveryInput {
  readonly activationId: string;
}

interface StageDefinition {
  readonly expectedActionClass: string;
  readonly wordIds: readonly CisternWordId[];
  readonly canonicalAstWordIds: readonly string[];
  readonly semanticFacets: Readonly<Record<CisternWordId, readonly string[]>>;
}

const STAGES: Readonly<Record<CisternStage, StageDefinition>> = Object.freeze({
  short: {
    expectedActionClass: "short_direct_cast",
    wordIds: ["telo", "lili"],
    canonicalAstWordIds: ["word.telo", "word.lili"],
    semanticFacets: {
      telo: ["water_or_liquid"],
      lili: ["small_or_short"],
      suli: [],
    },
  },
  default: {
    expectedActionClass: "default_single_cast",
    wordIds: ["telo"],
    canonicalAstWordIds: ["word.telo"],
    semanticFacets: {
      telo: ["water_or_liquid", "default_is_unspecified"],
      lili: [],
      suli: [],
    },
  },
  long: {
    expectedActionClass: "long_direct_cast",
    wordIds: ["telo", "suli"],
    canonicalAstWordIds: ["word.telo", "word.suli"],
    semanticFacets: {
      telo: ["water_or_liquid"],
      lili: [],
      suli: ["large_long_or_tall"],
    },
  },
});

const finiteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

const requiredId = (value: string, name: string): void => {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
};

const validateConfig = (config: CisternRecoveryConfig): void => {
  if (
    !finiteNonNegative(config.naturalMpPerTick) ||
    !finiteNonNegative(config.meditationBaseRestore) ||
    !finiteNonNegative(config.checkpointMinimumRestore) ||
    !finiteNonNegative(config.checkpointMaxMpFraction) ||
    config.checkpointMaxMpFraction > 1 ||
    !finiteNonNegative(config.checkpointSoftCapFraction) ||
    !Number.isFinite(config.checkpointQuantum) ||
    config.checkpointQuantum <= 0 ||
    config.checkpointSoftCapFraction > 1
  ) {
    throw new RangeError("recovery configuration is invalid");
  }
};

const eligibleInterpretation = (status: InterpretationStatus): boolean =>
  status === "parsed_grounded" || status === "executed_legal";

export class CisternLearningSession {
  private readonly playerSaveId: string;
  private readonly expressionCapacity: number;
  private readonly recoveryConfig: CisternRecoveryConfig;
  private learning: LearningProgressionSnapshot;

  constructor(options: CisternSessionOptions) {
    requiredId(options.playerSaveId, "playerSaveId");
    if (!Number.isSafeInteger(options.expressionCapacity) || options.expressionCapacity < 1) {
      throw new RangeError("expressionCapacity must be a positive safe integer");
    }

    const recoveryConfig: CisternRecoveryConfig = {
      ...DEFAULT_CISTERN_RECOVERY_CONFIG,
      ...options.recoveryConfig,
    };
    validateConfig(recoveryConfig);

    this.playerSaveId = options.playerSaveId;
    this.expressionCapacity = options.expressionCapacity;
    this.learning = options.learningSnapshot ?? createLearningProgression();
    this.recoveryConfig = recoveryConfig;
  }

  snapshot(): CisternSessionSnapshot {
    return {
      expressionCapacity: this.expressionCapacity,
      learning: this.learning,
    };
  }

  discoverGlyph(input: DiscoveryProposalInput): EvidenceProposalResult {
    requiredId(input.occurrenceId, "occurrenceId");
    requiredId(input.locationId, "locationId");
    const event: GlyphDiscoveredEvent = {
      eventId: `cistern.discovery.${input.occurrenceId}.${input.wordId}`,
      eventType: "glyph_discovered",
      playerSaveId: this.playerSaveId,
      wordId: input.wordId,
      idempotencyKey: `${this.playerSaveId}:cistern:discovery:${input.occurrenceId}:${input.wordId}`,
      locationId: input.locationId,
      recognitionMode: input.recognitionMode ?? "world_observation",
    };
    return this.applyProposals([event]);
  }

  attuneGlyph(input: AttunementProposalInput): EvidenceProposalResult {
    requiredId(input.occurrenceId, "occurrenceId");
    requiredId(input.environmentalWitnessId, "environmentalWitnessId");
    const event: GlyphAttunementCompletedEvent = {
      eventId: `cistern.attunement.${input.occurrenceId}.${input.wordId}`,
      eventType: "glyph_attunement_completed",
      playerSaveId: this.playerSaveId,
      wordId: input.wordId,
      idempotencyKey: `${this.playerSaveId}:cistern:attunement:${input.occurrenceId}:${input.wordId}`,
      catalystClass: "common_nontradeable",
      catalystTradeable: false,
      environmentalWitnessId: input.environmentalWitnessId,
    };
    return this.applyProposals([event]);
  }

  resolveReceiverAttempt(input: ReceiverAttemptInput): EvidenceProposalResult {
    requiredId(input.attemptId, "attemptId");
    requiredId(input.taskId, "taskId");
    requiredId(input.taskFamilyId, "taskFamilyId");
    requiredId(input.variantHash, "variantHash");
    requiredId(input.normalizedEnvironmentFingerprint, "normalizedEnvironmentFingerprint");

    if (!input.receiverGoalSatisfied) return this.noProposal("receiver_goal_false");
    if (input.toolBypass) return this.noProposal("tool_bypass");

    const definition = STAGES[input.stage];
    if (input.selectedActionClass !== definition.expectedActionClass) {
      return this.noProposal("action_not_eligible");
    }
    if (!eligibleInterpretation(input.interpretationStatus)) {
      return this.noProposal("interpretation_not_eligible");
    }
    if (input.promptLevel > 1) return this.noProposal("prompt_not_eligible");
    if (input.answerVisible || input.fixedSlotOnly || input.colorOnlyCue) {
      return this.noProposal("answer_support_not_eligible");
    }

    const events: LearningEvidenceEvent[] = [];
    for (const wordId of definition.wordIds) {
      const base = {
        playerSaveId: this.playerSaveId,
        wordId,
        taskId: input.taskId,
        taskFamilyId: input.taskFamilyId,
        variantHash: `${input.variantHash}:${wordId}`,
        normalizedEnvironmentFingerprint: input.normalizedEnvironmentFingerprint,
        promptLevel: input.promptLevel,
        interpretationStatus: input.interpretationStatus,
        worldOutcomeContribution: true,
        toolBypass: false,
        answerVisible: false,
        fixedSlotOnly: false,
        colorOnlyCue: false,
        semanticFacetsDemonstrated: definition.semanticFacets[wordId],
        canonicalAstWordIds: definition.canonicalAstWordIds,
      } as const;
      const grounding: GroundingTrialResolvedEvent = {
        ...base,
        eventId: `cistern.grounding.${input.attemptId}.${wordId}`,
        eventType: "grounding_trial_resolved",
        idempotencyKey: `${this.playerSaveId}:cistern:grounding:${input.attemptId}:${wordId}`,
      };
      events.push(grounding);

      if (input.activeRetrieval) {
        const retrieval: ActiveRetrievalSubmittedEvent = {
          ...base,
          eventId: `cistern.retrieval.${input.attemptId}.${wordId}`,
          eventType: "active_retrieval_submitted",
          idempotencyKey: `${this.playerSaveId}:cistern:retrieval:${input.attemptId}:${wordId}`,
        };
        events.push(retrieval);
      }
    }
    return this.applyProposals(events);
  }

  proposeNaturalRecovery(input: NaturalRecoveryInput): MpRecoveryProposal {
    requiredId(input.recoveryId, "recoveryId");
    if (!Number.isSafeInteger(input.ticks) || input.ticks <= 0) {
      throw new RangeError("natural recovery ticks must be a positive safe integer");
    }
    return Object.freeze({
      schema: "cistern.mp-recovery.v0.1",
      source: "natural",
      recoveryId: input.recoveryId,
      amountPolicy: Object.freeze({ kind: "fixed", amountMp: Math.round(this.recoveryConfig.naturalMpPerTick * input.ticks * 1_000_000) / 1_000_000 }),
      capPolicy: Object.freeze({ kind: "max_mp" }),
      answerAccepted: null,
      evidenceEligible: null,
    });
  }

  proposeMeditationRecovery(input: MeditationRecoveryInput): MpRecoveryProposal {
    requiredId(input.recoveryId, "recoveryId");
    return Object.freeze({
      schema: "cistern.mp-recovery.v0.1",
      source: "meditation",
      recoveryId: input.recoveryId,
      amountPolicy: Object.freeze({ kind: "fixed", amountMp: this.recoveryConfig.meditationBaseRestore }),
      capPolicy: Object.freeze({ kind: "max_mp" }),
      answerAccepted: input.answerAccepted,
      evidenceEligible: input.evidenceEligible,
    });
  }

  proposeCheckpointRecovery(input: CheckpointRecoveryInput): MpRecoveryProposal {
    requiredId(input.activationId, "activationId");
    return Object.freeze({
      schema: "cistern.mp-recovery.v0.1",
      source: "checkpoint",
      recoveryId: input.activationId,
      amountPolicy: Object.freeze({
        kind: "max_of_fixed_and_max_fraction",
        minimumMp: this.recoveryConfig.checkpointMinimumRestore,
        maxMpFraction: this.recoveryConfig.checkpointMaxMpFraction,
        quantum: this.recoveryConfig.checkpointQuantum,
      }),
      capPolicy: Object.freeze({
        kind: "max_mp_fraction",
        maxMpFraction: this.recoveryConfig.checkpointSoftCapFraction,
        quantum: this.recoveryConfig.checkpointQuantum,
      }),
      answerAccepted: null,
      evidenceEligible: null,
    });
  }

  /** @deprecated Apply the returned proposal through CastExecutionLedger. */
  applyNaturalRecovery(input: NaturalRecoveryInput): RecoveryResult {
    return this.proposeNaturalRecovery(input);
  }

  /** @deprecated Apply the returned proposal through CastExecutionLedger. */
  applyMeditationRecovery(input: MeditationRecoveryInput): RecoveryResult {
    return this.proposeMeditationRecovery(input);
  }

  /** @deprecated Checkpoint wiring waits for persisted recovery receipts. */
  applyCheckpointRecovery(input: CheckpointRecoveryInput): RecoveryResult {
    return this.proposeCheckpointRecovery(input);
  }

  private applyProposals(events: readonly LearningEvidenceEvent[]): EvidenceProposalResult {
    const reductions: LearningReductionResult[] = [];
    for (const event of events) {
      const reduction = reduceLearningEvidence(this.learning, event);
      this.learning = reduction.snapshot;
      reductions.push(reduction);
    }
    return {
      reason: "proposed",
      proposedEvents: events,
      reductions,
      learning: this.learning,
    };
  }

  private noProposal(reason: Exclude<EvidenceProposalReason, "proposed">): EvidenceProposalResult {
    return { reason, proposedEvents: [], reductions: [], learning: this.learning };
  }

}
