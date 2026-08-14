import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSafeRangeManifest } from "../content/runtime-safe-range-manifest";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import { readRuntimeCore120CurriculumManifest } from "../content/runtime-core120-curriculum-manifest";
import {
  validSafeRangeRuntimeFramePayload,
  type SafeRangeRuntimeFramePayload,
} from "../game/safe-range-authority";
import { isTrustedSafeRangeCommitProof, type SafeRangeCommitProof } from "../game/prologue-safe-range";
import {
  isTrustedReturnFlowQualificationCommitProof,
  type ReturnFlowQualificationCommitProof,
} from "../game/prologue-return-flow";
import {
  isTrustedAttackQualificationCommitProof,
  type AttackQualificationCommitProof,
} from "../game/prologue-attack-qualification";
import { isTrustedP0LearningCommitProof, type P0LearningCommitProof } from "../game/prologue-p0-learning";
import {
  core120LearningActionPayloadHashes,
  core120LearningActionReceiptId,
  core120LearningAuthorityMatchesAction,
  isTrustedCore120LearningCommitProof,
  type Core120LearningAuthority,
  type Core120LearningCommitProof,
} from "../game/prologue-core120-learning";
import {
  materializeP0LearningEvidence,
  p0EvidenceMatches,
  p0TargetReached,
  type P0LearningActionId,
} from "../game/p0-learning-contract";
import {
  core120LearningActionEvidencePresent,
  core120LearningActionPrerequisitesSatisfied,
  core120EvidenceMatches,
  materializeCore120LearningEvidence,
  materializeCore120LearningEvidenceVariants,
  type Core120LearningActionId,
} from "../learning/core120-campaign";
import { createCrossSaveReceiptId, sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  LEARNING_SAVE_SCHEMA,
  createLearningProgression,
  reduceLearningEvidence,
  type LearningEvidenceEvent,
  type LearningProgressionSnapshot,
  type WordLearningProgress,
} from "../learning/progression";
import {
  ATTACK_CALIBRATION_MILESTONE_ID,
  ATTACK_CALIBRATION_WRITER_EVENT,
  ATTACK_CAPACITY_CALIBRATION_FLAG_ID,
  ATTACK_PERMISSION_WRITER_EVENT,
  FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID,
  PROLOGUE_RETURN_OBSERVED_FLAG_ID,
  PROTECTED_ATTACK_WORLD_FLAGS,
  RANGE_TRIAL_PERMISSION_FLAG_ID,
  RUNTIME_ATTACK_QUALIFICATION_CONTRACT,
  evaluateAttackQualification,
  type AttackQualificationContract,
  type CommittedLearningEvidenceReference,
  type CommittedWorldEventReference,
} from "../game/attack-qualification";
import {
  SURVIVAL_RULES,
  SURVIVAL_SAVE_SCHEMA,
  SurvivalSystem,
  type SurvivalSave,
} from "../game/survival";
import type { MerchantState, TradeLot, TradeReceipt, TradeSave, TradeSnapshot } from "../game/trade";
import { commitVerifiedSellQuote, createVerifiedSellQuote, verifiedSellReceiptId, verifiedTradeManifest,
  type VerifiedSellQuote } from "../game/verified-trade";
import {
  adaptTradeSaveToSessionEconomy,
  adaptTradeSnapshotToSessionEconomy,
  createEmptySessionEconomy,
  isLegacySessionEconomySummary,
  isMerchantStateValue,
  isSessionEconomyState,
  isTradeLotState,
  isTradeReceiptValue,
  normalizeSessionEconomy,
  type LegacyInventoryLotSummary,
  type LegacySessionEconomySummary,
  type SessionEconomyState,
} from "../game/economy-state";
import { applyInventoryConsumption, type InventoryConsumptionAction } from "../game/inventory-consumption";
import type { MpLedgerSnapshot } from "../spells/cast-plan";
import {
  createDeterministicCorpseId,
  createDeterministicDeathEventId,
  createEmptyLifeCorpseLedger,
  isSessionLifeCorpseLedger,
  isSessionWildlifeLifeRecord,
  isWildlifeDamageCommitPayload,
  isWildlifeDeathCommitPayload,
  tissueSlotsForLife,
  type SessionLifeCorpseLedger,
  type SessionWildlifeCorpseRecord,
  type WildlifeDamageCommitPayload,
  type WildlifeDeathCommitPayload,
  type WildlifeLifeRegistrationPayload,
} from "../game/life-corpse-ledger";
import {
  applyWildlifeProcessingAction,
  canonicalWildlifeProcessingIdempotencyKey,
  createWildlifeProcessingTransactionId,
  canonicalWildlifeProcessingWorkIdempotencyKey,
  createWildlifeProcessingWorkTransactionId,
  wildlifeProcessingWorkPayloadHash,
  wildlifeProcessingManifest,
  wildlifeProcessingPayloadHash,
  wildlifeProcessingTransactionKind,
  type WildlifeProcessingAction,
  type WildlifeProcessingApplyContext,
  type WildlifeProcessingWorkOrder,
} from "../game/wildlife-processing";

const RUNTIME_SAFE_RANGE_MANIFEST = readRuntimeSafeRangeManifest(generatedRuntimeArtifact);
const RUNTIME_P0_CURRICULUM_MANIFEST = readRuntimeP0CurriculumManifest(generatedRuntimeArtifact);
const RUNTIME_CORE120_CURRICULUM_MANIFEST = readRuntimeCore120CurriculumManifest(generatedRuntimeArtifact);

export const GAME_SESSION_SAVE_SCHEMA = "tokipona.game-session.v0.2" as const;
export const LEGACY_GAME_SESSION_SAVE_SCHEMA = "tokipona.game-session.v0.1" as const;
export const GAME_SESSION_INTEGRITY_ALGORITHM = "fnv1a32-canonical-json" as const;

export interface SessionMpState {
  readonly currentMp: number;
  readonly maxMp: number;
  readonly worldVersion: number;
}

export interface SessionCapabilityMilestoneResult {
  readonly expressionCapacityWords: number;
  readonly focusSlots: number;
  readonly maxMp: number;
}

export interface SessionCapabilityMilestoneRecord extends SessionCapabilityMilestoneResult {
  readonly milestoneId: string;
  readonly writerEvent: string;
  readonly sourcePath: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly contractRevision: string;
  readonly committedByEventId: string;
  readonly committedAtSequence: number;
}

/** Player progression authority for expression length and artifact surfaces. MP maximum stays in mp.maxMp. */
export interface SessionCapabilityState {
  readonly expressionCapacityWords: number;
  readonly focusSlots: number;
  readonly revision: number;
  readonly appliedMilestones: Readonly<Record<string, SessionCapabilityMilestoneRecord>>;
}

export interface CapabilityMilestoneCommitPayload {
  readonly milestoneId: string;
  readonly writerEvent: string;
  readonly sourcePath: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly contractRevision: string;
  readonly resultingState: SessionCapabilityMilestoneResult;
}

export const INITIAL_SESSION_CAPABILITIES: SessionCapabilityState = Object.freeze({
  expressionCapacityWords: 1,
  focusSlots: 1,
  revision: 0,
  appliedMilestones: Object.freeze({}),
});

export type WorldFlagValue = boolean | number | string;
export type WorldFlagScope = "global" | "region" | "area";
export type WorldFlagSetPayload =
  | Readonly<{
      flagId: string;
      value: WorldFlagValue;
      scope: "global";
      areaId?: never;
      regionId?: never;
    }>
  | Readonly<{
      flagId: string;
      value: WorldFlagValue;
      scope: "region";
      regionId: string;
      areaId?: never;
    }>
  | Readonly<{
      flagId: string;
      value: WorldFlagValue;
      scope: "area";
      areaId: string;
      regionId?: never;
    }>;

export interface SessionWorldFlag {
  readonly flagId: string;
  readonly value: WorldFlagValue;
  readonly scope: WorldFlagScope;
  readonly areaId: string | null;
  readonly areaEpoch: number | null;
  /** Present only for region-scoped flags; omitted by legacy-compatible global/area saves. */
  readonly regionId?: string | null;
}

export interface SessionCheckpointState {
  readonly id: string;
  readonly sceneId: string;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly revision: number;
}

export interface SessionWorldState {
  readonly currentSceneId: string;
  readonly revision: number;
  readonly flags: Readonly<Record<string, SessionWorldFlag>>;
  readonly areaEpochs: Readonly<Record<string, number>>;
}

/** @deprecated Legacy v0.1/v0.2 summary accepted only at migration boundaries. */
export type InventoryLotSummary = LegacyInventoryLotSummary;
/** @deprecated Legacy v0.1/v0.2 summary accepted only at migration boundaries. */
export type SessionEconomySummary = LegacySessionEconomySummary;
export type { SessionEconomyState };

export interface SessionQuestProgress {
  readonly questId: string;
  readonly stageId: string;
  /** A quest-specific, monotonically increasing stage ordinal. */
  readonly stageOrdinal: number;
}

export type SessionReceiptDomain =
  | "cast"
  | "mp_recovery"
  | "learning"
  | "survival"
  | "trade"
  | "quest"
  | "world"
  | "wildlife"
  | "other";

export interface SessionReceiptIndexEntry {
  readonly receiptId: string;
  readonly domain: SessionReceiptDomain;
  readonly payloadHash: string;
  readonly recordedByEventId: string;
  readonly recordedAtSequence: number;
}

export interface GameSessionState {
  readonly revision: number;
  readonly lastEventSequence: number;
  readonly mp: SessionMpState;
  readonly capabilities: SessionCapabilityState;
  readonly lifeCorpseLedger: SessionLifeCorpseLedger;
  readonly world: SessionWorldState;
  readonly checkpoint: SessionCheckpointState;
  readonly learning: LearningProgressionSnapshot;
  readonly survival: SurvivalSave;
  readonly economy: SessionEconomyState;
  readonly quests: Readonly<Record<string, SessionQuestProgress>>;
  readonly receiptIndex: Readonly<Record<string, SessionReceiptIndexEntry>>;
  readonly processedEventPayloads: Readonly<Record<string, string>>;
}

interface SessionEventBase<TType extends string, TPayload> {
  readonly eventId: string;
  readonly sequence: number;
  readonly type: TType;
  readonly payload: TPayload;
}

export type AttackQualificationEvidenceActionId =
  | "settlement.telo.h0" | "settlement.telo.h1"
  | "settlement.tawa.h0" | "settlement.tawa.h1"
  | "return_flow.wawa.inert_h0" | "return_flow.wawa.inert_h1"
  | "settlement.repair.motion_h0"
  | "settlement.delayed_retrieval_h0"
  | "settlement.calibration.unrelated_delivery_commit"
  | "settlement.calibration.unrelated_route_commit";
export type GameSessionEvent =
  | SessionEventBase<"mp_replaced", { readonly mp: SessionMpState }>
  | SessionEventBase<"capability_milestone_committed", CapabilityMilestoneCommitPayload>
  | SessionEventBase<"wildlife_life_registered", WildlifeLifeRegistrationPayload>
  | SessionEventBase<"wildlife_damage_committed", WildlifeDamageCommitPayload>
  | SessionEventBase<"wildlife_death_committed", WildlifeDeathCommitPayload>
  | SessionEventBase<"wildlife_processing_interaction_committed", {
      readonly stationId: string;
      readonly sceneId: string;
      readonly targetId: string;
      readonly interactionId: string;
      readonly playerPositionPx: Readonly<{ readonly x: number; readonly y: number }>;
      readonly runtimeSceneRevision: number;
      readonly runtimeInteractionSequence: number;
      readonly operationId: string;
    }>
  | SessionEventBase<"wildlife_processing_work_advanced", {
      readonly transactionId: string;
      readonly canonicalIdempotencyKey: string;
      readonly workOrderId: string;
      readonly expectedWorkOrderRevision: number;
      readonly expectedSurvivalRevision: number;
      readonly expectedWorldTicks: number;
      readonly interactionReceiptId: string;
    }>
  | SessionEventBase<"wildlife_processing_evidence_committed", {
      readonly evidenceId: string;
      readonly workOrderId: string;
      readonly subjectEventId: string;
      readonly subjectEventType: "quest_stage_set" | "world_flag_set" | "scene_entered";
      readonly classification: "mainline_world_predicate_commit" | "non_replayed_side_task_commit" | "region_transition_commit";
    }>
  | SessionEventBase<"wildlife_processing_committed", { readonly action: WildlifeProcessingAction }>
  | SessionEventBase<"inventory_consumption_committed", { readonly action: InventoryConsumptionAction }>
  | SessionEventBase<"verified_trade_quote_issued", {
      readonly quote: VerifiedSellQuote;
      readonly decayedLot: TradeLot;
      readonly sceneId: string;
      readonly targetId: string;
      readonly interactionId: string;
      readonly playerPositionPx: Readonly<{ readonly x: number; readonly y: number }>;
      readonly runtimeSceneRevision: number;
      readonly operationId: string;
    }>
  | SessionEventBase<"verified_trade_sale_committed", {
      readonly quote: VerifiedSellQuote;
      readonly issuedEventId: string;
      readonly quotePayloadHash: string;
      readonly sceneId: string;
      readonly targetId: string;
      readonly interactionId: string;
      readonly playerPositionPx: Readonly<{ readonly x: number; readonly y: number }>;
      readonly runtimeSceneRevision: number;
  }>
  | SessionEventBase<"attack_qualification_interaction_committed", {
      readonly operationId: string;
      readonly sceneId: "scene.valley.settlement";
      readonly targetId: "settlement.attack_calibration_table";
      readonly interactionId: "settlement.open_attack_calibration";
      readonly playerPositionPx: Readonly<{ readonly x: number; readonly y: number }>;
      readonly expectedWorldRevision: number;
    }>  | SessionEventBase<"learning_evidence_committed",
      | { readonly evidence: LearningEvidenceEvent; readonly qualificationActionId?: never;
          readonly p0CurriculumActionId?: never; readonly core120CurriculumActionId?: never }
      | { readonly evidence: LearningEvidenceEvent; readonly p0CurriculumActionId: P0LearningActionId;
          readonly p0EvidenceOrdinal: number; readonly qualificationActionId?: never;
          readonly core120CurriculumActionId?: never }
      | { readonly evidence: LearningEvidenceEvent; readonly core120CurriculumActionId: Core120LearningActionId;
          readonly core120EvidenceOrdinal: number; readonly qualificationActionId?: never;
          readonly p0CurriculumActionId?: never }
      | { readonly qualificationActionId: AttackQualificationEvidenceActionId; readonly transactionId: string;
          readonly unrelatedWorldEventIds?: readonly string[]; readonly interactionReceiptId?: string;
          readonly sourceEvidenceEventId?: string; readonly evidence?: never; readonly p0CurriculumActionId?: never;
          readonly core120CurriculumActionId?: never }>
  | SessionEventBase<"core120_learning_action_committed", {
      readonly actionId: Core120LearningActionId;
      readonly receiptId: string;
      readonly payloadHash: `sha256:${string}`;
      readonly authority?: Core120LearningAuthority;
    }>
  | SessionEventBase<"attack_capacity_calibrated", {
      readonly transactionId: string;
      readonly writerEvent: typeof ATTACK_CALIBRATION_WRITER_EVENT;
      readonly contract: AttackQualificationContract;
    }>
  | SessionEventBase<"prologue_return_observation_committed", {
      readonly transactionId: string;
      readonly writerEvent: "return_observation_committed";
    }>
  | SessionEventBase<"attack_prerequisites_verified", {
      readonly transactionId: string;
      readonly writerEvent: typeof ATTACK_PERMISSION_WRITER_EVENT;
      readonly contractId: AttackQualificationContract["contractId"];
    }>
  | SessionEventBase<"safe_range_runtime_frame_committed", SafeRangeRuntimeFramePayload>
  | SessionEventBase<"safe_range_transfer_passed", {
      readonly transactionId: string;
      readonly writerEvent: "safe_range_transfer_passed";
      readonly targetClass: "wood_dummy" | "sandbag" | "minecart" | "hanging_stone";
      readonly targetId: string;
      readonly normalizedVariantHash: string;
      readonly promptLevel: 0 | 1;
      readonly waterSource: "bound_existing" | "manifest_default";
      readonly expectedCurrentMp: number;
      readonly expectedMpWorldVersion: number;
      readonly authorityProof: Readonly<{
        readonly requestHash: string;
        readonly runtimeRevision: number;
        readonly frameEventId: string;
        readonly frameHash: `sha256:${string}`;
        readonly manifestDigest: `sha256:${string}`;
        readonly sessionWorldRevision: number;
        readonly mpWorldVersion: number;
      }>;
      readonly physicsResult: Readonly<{ paidKineticBudgetEu: number; transferredKineticEu: number;
        damageHp: number; targetHpBefore: number; targetHpAfter: number; livingOverlap: false }>;
    }>
  | SessionEventBase<"safe_range_material_table_completed", {
      readonly transactionId: string;
      readonly writerEvent: "safe_range_material_table_completed";
      readonly authorityProof: Readonly<{
        readonly requestHash: string;
        readonly runtimeRevision: number;
        readonly targetId: string;
        readonly frameEventId: string;
        readonly frameHash: `sha256:${string}`;
        readonly manifestDigest: `sha256:${string}`;
        readonly sessionWorldRevision: number;
        readonly mpWorldVersion: number;
      }>;
    }>
  | SessionEventBase<"scene_entered", { readonly sceneId: string }>
  | SessionEventBase<"checkpoint_set", { readonly checkpoint: SessionCheckpointState }>
  | SessionEventBase<"world_flag_set", WorldFlagSetPayload>
  | SessionEventBase<"learning_replaced", { readonly learning: LearningProgressionSnapshot }>
  | SessionEventBase<"survival_replaced", { readonly survival: SurvivalSave }>
  /** @deprecated Retained for replay of ledgers written before economy v0.2 domain events. */
  | SessionEventBase<"economy_replaced", { readonly economy: SessionEconomySummary | SessionEconomyState }>
  | SessionEventBase<"economy_wallet_changed", {
      readonly expectedWalletRevision: number;
      readonly nextWalletRevision: number;
      readonly coinDelta: number;
      readonly nextCoin: number;
    }>
  | SessionEventBase<"quote_sequence_advanced", {
      readonly expectedQuoteSequence: number;
      readonly nextQuoteSequence: number;
    }>
  | SessionEventBase<"economy_lot_changed", {
      readonly lotId: string;
      readonly expectedInventoryRevision: number;
      readonly nextInventoryRevision: number;
      readonly expectedOwnershipRevision: number | null;
      readonly expectedFreshnessRevision: number | null;
      readonly nextLot: TradeLot | null;
    }>
  | SessionEventBase<"merchant_state_changed", {
      readonly merchantId: MerchantState["merchantId"];
      readonly expectedDemandRevision: number;
      readonly nextState: MerchantState;
    }>
  | SessionEventBase<"trade_sale_committed", {
      readonly expectedWalletRevision: number;
      readonly expectedInventoryRevision: number;
      readonly expectedQuoteSequence: number;
      readonly expectedLotOwnershipRevision: number;
      readonly expectedLotFreshnessRevision: number;
      readonly expectedMerchantDemandRevision: number;
      readonly nextCoin: number;
      readonly nextWalletRevision: number;
      readonly nextInventoryRevision: number;
      readonly nextLot: TradeLot;
      readonly nextMerchantState: MerchantState;
      readonly tradeReceipt: TradeReceipt;
      readonly sessionReceiptPayloadHash: string;
    }>
  | SessionEventBase<"quest_stage_set", {
      readonly questId: string;
      readonly stageId: string;
      readonly stageOrdinal: number;
    }>
  | SessionEventBase<"receipt_recorded", {
      readonly receiptId: string;
      readonly domain: SessionReceiptDomain;
      readonly payloadHash: string;
    }>
  | SessionEventBase<"area_reset", {
      readonly areaId: string;
      readonly respawnSceneId?: string;
    }>;

export type SessionApplyReason =
  | "applied"
  | "duplicate_event"
  | "event_payload_conflict"
  | "event_sequence_gap"
  | "invalid_event"
  | "state_regression"
  | "duplicate_receipt"
  | "receipt_payload_conflict"
  | "duplicate_milestone"
  | "milestone_payload_conflict"
  | "life_already_registered"
  | "life_registration_conflict"
  | "life_not_registered"
  | "life_revision_conflict"
  | "life_already_tombstoned"
  | "economy_revision_conflict";

export interface SessionApplyResult {
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly reason: SessionApplyReason;
  readonly snapshot: GameSessionState;
}

export interface GameSessionInitialState {
  readonly sessionId: string;
  readonly mp: SessionMpState;
  readonly currentSceneId: string;
  /** Defaults to a new-session entry marker at currentSceneId (0,0), revision 0. */
  readonly checkpoint?: SessionCheckpointState;
  readonly learning?: LearningProgressionSnapshot;
  readonly survival?: SurvivalSave;
  readonly economy?: SessionEconomySummary | SessionEconomyState;
  readonly quests?: Readonly<Record<string, SessionQuestProgress>>;
  readonly receiptIndex?: Readonly<Record<string, SessionReceiptIndexEntry>>;
}

export interface GameSessionIntegrity {
  readonly algorithm: typeof GAME_SESSION_INTEGRITY_ALGORITHM;
  readonly digest: string;
}

export interface GameSessionSave {
  readonly schema: typeof GAME_SESSION_SAVE_SCHEMA;
  readonly sessionId: string;
  readonly origin: GameSessionState;
  readonly state: GameSessionState;
  readonly eventLedger: readonly GameSessionEvent[];
  readonly integrity: GameSessionIntegrity;
}

/** v0.1 was a validated snapshot without an event ledger or unified receipt index. */
export interface LegacyGameSessionSaveV1 {
  readonly schema: typeof LEGACY_GAME_SESSION_SAVE_SCHEMA;
  readonly sessionId: string;
  readonly mp: SessionMpState;
  readonly world: SessionWorldState;
  readonly learning: LearningProgressionSnapshot;
  readonly survival: SurvivalSave;
  readonly economy: SessionEconomySummary | SessionEconomyState;
  readonly quests: Readonly<Record<string, SessionQuestProgress>>;
}

export type GameSessionLoadErrorCode =
  | "unsupported_schema"
  | "invalid_save"
  | "integrity_mismatch"
  | "replay_mismatch";

export type GameSessionLoadResult =
  | Readonly<{
      ok: true;
      session: GameSession;
      migratedFrom: typeof LEGACY_GAME_SESSION_SAVE_SCHEMA | null;
    }>
  | Readonly<{
      ok: false;
      error: GameSessionLoadErrorCode;
    }>;

export type GameSessionMigrationResult =
  | Readonly<{
      ok: true;
      save: GameSessionSave;
      migratedFrom: typeof LEGACY_GAME_SESSION_SAVE_SCHEMA | null;
    }>
  | Readonly<{
      ok: false;
      error: "unsupported_schema" | "invalid_save";
    }>;

const RECEIPT_DOMAINS: readonly SessionReceiptDomain[] = [
  "cast",
  "mp_recovery",
  "learning",
  "survival",
  "trade",
  "quest",
  "world",
  "wildlife",
  "other",
];

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const valuesAreUnique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const fingerprint = (value: unknown): string => fnv1a32(canonicalJson(value));

const isStringRecord = (value: unknown): value is Readonly<Record<string, string>> =>
  isRecord(value) && Object.entries(value).every(([key, item]) => isNonEmptyString(key) && typeof item === "string");

const isSessionMpState = (value: unknown): value is SessionMpState => {
  if (!isRecord(value)) return false;
  return isFiniteNonNegative(value.currentMp) && isFiniteNonNegative(value.maxMp) &&
    value.currentMp <= value.maxMp && isNonNegativeSafeInteger(value.worldVersion);
};

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isCapabilityMilestoneResult = (value: unknown): value is SessionCapabilityMilestoneResult =>
  isRecord(value) && isPositiveSafeInteger(value.expressionCapacityWords) &&
  isPositiveSafeInteger(value.focusSlots) && typeof value.maxMp === "number" &&
  Number.isFinite(value.maxMp) && value.maxMp > 0;

const isCapabilityMilestoneRecord = (value: unknown): value is SessionCapabilityMilestoneRecord => {
  if (!isRecord(value) || !isCapabilityMilestoneResult(value)) return false;
  const record = value as Record<string, unknown>;
  return isNonEmptyString(record.milestoneId) && isNonEmptyString(record.writerEvent) &&
    isNonEmptyString(record.sourcePath) && typeof record.sourceDigest === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(record.sourceDigest) && isNonEmptyString(record.contractRevision) &&
    isNonEmptyString(record.committedByEventId) && isNonNegativeSafeInteger(record.committedAtSequence);
};

const isCapabilityState = (value: unknown): value is SessionCapabilityState => {
  if (!isRecord(value) || !isPositiveSafeInteger(value.expressionCapacityWords) ||
      !isPositiveSafeInteger(value.focusSlots) || !isNonNegativeSafeInteger(value.revision) ||
      !isRecord(value.appliedMilestones)) return false;
  const expressionCapacityWords = value.expressionCapacityWords;
  const focusSlots = value.focusSlots;
  const milestones = Object.entries(value.appliedMilestones);
  return milestones.length === value.revision && milestones.every(([milestoneId, milestone]) =>
    isNonEmptyString(milestoneId) && isCapabilityMilestoneRecord(milestone) &&
    milestone.milestoneId === milestoneId && milestone.expressionCapacityWords <= expressionCapacityWords &&
    milestone.focusSlots <= focusSlots);
};

const isWordLearningProgress = (value: unknown): value is WordLearningProgress => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.wordId) &&
    (value.discoveryState === "unknown" || value.discoveryState === "discovered") &&
    (value.attunementState === "locked" || value.attunementState === "attuned") &&
    (value.learningState === null || ["discovered", "grounded", "produced", "stabilized"].includes(String(value.learningState))) &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.productionTaskFamilies) && value.productionTaskFamilies.every(isNonEmptyString) &&
    Array.isArray(value.producedBaselineTaskFamilies) && value.producedBaselineTaskFamilies.every(isNonEmptyString) &&
    Array.isArray(value.producedBaselineEnvironmentFingerprints) &&
    value.producedBaselineEnvironmentFingerprints.every(isNonEmptyString) &&
    Array.isArray(value.demonstratedSemanticFacets) && value.demonstratedSemanticFacets.every(isNonEmptyString);
};

const isLearningSnapshot = (value: unknown): value is LearningProgressionSnapshot => {
  if (!isRecord(value) || value.schema !== LEARNING_SAVE_SCHEMA ||
      !isNonNegativeSafeInteger(value.revision) || !isRecord(value.words) ||
      !isStringRecord(value.processedEventPayloads)) return false;
  return Object.entries(value.words).every(([wordId, progress]) =>
    isNonEmptyString(wordId) && isWordLearningProgress(progress) && progress.wordId === wordId);
};

const isSurvivalSave = (value: unknown): value is SurvivalSave => {
  if (!isRecord(value) || value.schema !== SURVIVAL_SAVE_SCHEMA) return false;
  const receipts = value.receipts;
  return isFiniteNonNegative(value.satiety) && value.satiety <= SURVIVAL_RULES.maximumMeter &&
    isFiniteNonNegative(value.hydration) && value.hydration <= SURVIVAL_RULES.maximumMeter &&
    isNonNegativeSafeInteger(value.worldTicks) && isNonNegativeSafeInteger(value.metabolismTicks) &&
    typeof value.worldTickRemainder === "number" && value.worldTickRemainder >= 0 && value.worldTickRemainder < 1 &&
    typeof value.metabolismTickRemainder === "number" && value.metabolismTickRemainder >= 0 && value.metabolismTickRemainder < 1 &&
    typeof value.prologueFloorActive === "boolean" && typeof value.publicReliefFirstUseClaimed === "boolean" &&
    isNonNegativeSafeInteger(value.canteenCharges) && isNonNegativeSafeInteger(value.travelRations) &&
    isNonNegativeSafeInteger(value.revision) && Array.isArray(receipts) &&
    receipts.every(isNonEmptyString) && valuesAreUnique(receipts);
};

const isEconomySummary = isLegacySessionEconomySummary;

const isQuestProgress = (value: unknown): value is SessionQuestProgress => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.questId) && isNonEmptyString(value.stageId) &&
    isNonNegativeSafeInteger(value.stageOrdinal);
};

const isQuestRecord = (value: unknown): value is Readonly<Record<string, SessionQuestProgress>> =>
  isRecord(value) && Object.entries(value).every(([questId, progress]) =>
    isNonEmptyString(questId) && isQuestProgress(progress) && progress.questId === questId);

const isWorldFlagValue = (value: unknown): value is WorldFlagValue =>
  typeof value === "boolean" || typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value));

const isWorldFlag = (value: unknown): value is SessionWorldFlag => {
  if (!isRecord(value) || !isNonEmptyString(value.flagId) || !isWorldFlagValue(value.value)) return false;
  if (value.scope === "global") {
    return value.areaId === null && value.areaEpoch === null &&
      (value.regionId === undefined || value.regionId === null);
  }
  if (value.scope === "region") {
    return value.areaId === null && value.areaEpoch === null && isNonEmptyString(value.regionId);
  }
  return value.scope === "area" && isNonEmptyString(value.areaId) &&
    isNonNegativeSafeInteger(value.areaEpoch) && (value.regionId === undefined || value.regionId === null);
};

const worldFlagKey = (
  flag: Pick<SessionWorldFlag, "scope" | "areaId" | "regionId" | "flagId">,
): string => {
  if (flag.scope === "global") return `global:${flag.flagId}`;
  if (flag.scope === "region") return `region:${flag.regionId}:${flag.flagId}`;
  return `area:${flag.areaId}:${flag.flagId}`;
};

const isCheckpointState = (value: unknown): value is SessionCheckpointState => {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.sceneId) ||
      !isRecord(value.position) || !isNonNegativeSafeInteger(value.revision)) return false;
  return typeof value.position.x === "number" && Number.isFinite(value.position.x) &&
    typeof value.position.y === "number" && Number.isFinite(value.position.y);
};

const isWorldState = (value: unknown): value is SessionWorldState => {
  if (!isRecord(value) || !isNonEmptyString(value.currentSceneId) ||
      !isNonNegativeSafeInteger(value.revision) || !isRecord(value.flags) || !isRecord(value.areaEpochs)) return false;
  const areaEpochs = value.areaEpochs as Record<string, unknown>;
  const epochsValid = Object.entries(areaEpochs).every(([areaId, epoch]) =>
    isNonEmptyString(areaId) && isNonNegativeSafeInteger(epoch));
  const flagsValid = Object.entries(value.flags).every(([key, flag]) =>
    isWorldFlag(flag) && key === worldFlagKey(flag) &&
    (flag.scope !== "area" || areaEpochs[flag.areaId!] === flag.areaEpoch));
  return epochsValid && flagsValid;
};

const isReceiptEntry = (value: unknown): value is SessionReceiptIndexEntry => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.receiptId) && RECEIPT_DOMAINS.includes(value.domain as SessionReceiptDomain) &&
    isNonEmptyString(value.payloadHash) && isNonEmptyString(value.recordedByEventId) &&
    isNonNegativeSafeInteger(value.recordedAtSequence);
};

const isReceiptRecord = (value: unknown): value is Readonly<Record<string, SessionReceiptIndexEntry>> =>
  isRecord(value) && Object.entries(value).every(([receiptId, receipt]) =>
    isNonEmptyString(receiptId) && isReceiptEntry(receipt) && receipt.receiptId === receiptId);

const isSessionStateCore = (value: Record<string, unknown>): boolean =>
  isNonNegativeSafeInteger(value.revision) && isNonNegativeSafeInteger(value.lastEventSequence) &&
  value.revision === value.lastEventSequence && isSessionMpState(value.mp) && isWorldState(value.world) &&
  isCheckpointState(value.checkpoint) && isLearningSnapshot(value.learning) && isSurvivalSave(value.survival) &&
  isQuestRecord(value.quests) && isReceiptRecord(value.receiptIndex) &&
  isStringRecord(value.processedEventPayloads) &&
  Object.keys(value.processedEventPayloads).length === value.lastEventSequence;

const isSessionState = (value: unknown): value is GameSessionState => {
  if (!isRecord(value) || !isSessionStateCore(value) || !isCapabilityState(value.capabilities) ||
      !isSessionLifeCorpseLedger(value.lifeCorpseLedger) || !isSessionEconomyState(value.economy) ||
      !isSessionMpState(value.mp) || value.economy.activeWorldTick !== (value.survival as SurvivalSave).worldTicks) return false;
  const maxMp = value.mp.maxMp;
  return Object.values(value.capabilities.appliedMilestones).every((milestone) =>
    milestone.maxMp <= maxMp);
};

const stateFlags = (state: unknown): readonly Record<string, unknown>[] => {
  if (!isRecord(state) || !isRecord(state.world) || !isRecord(state.world.flags)) return [];
  return Object.values(state.world.flags).filter(isRecord);
};
const hasStateFlag = (state: unknown, flagId: string): boolean =>
  stateFlags(state).some((flag) => flag.flagId === flagId);
const reachesAttackCapabilityThreshold = (state: unknown): boolean => {
  if (!isRecord(state)) return false;
  const capabilities = isRecord(state.capabilities) ? state.capabilities : null;
  const mp = isRecord(state.mp) ? state.mp : null;
  return (typeof capabilities?.expressionCapacityWords === "number" && capabilities.expressionCapacityWords >= 4) ||
    (typeof capabilities?.focusSlots === "number" && capabilities.focusSlots >= 4) ||
    (typeof mp?.maxMp === "number" && mp.maxMp >= 30);
};
const hasProtectedAttackState = (state: unknown): boolean => {
  const capabilities = isRecord(state) && isRecord(state.capabilities) ? state.capabilities : null;
  const milestones = capabilities && isRecord(capabilities.appliedMilestones) ? capabilities.appliedMilestones : null;
  return stateFlags(state).some((flag) => typeof flag.flagId === "string" &&
    PROTECTED_ATTACK_WORLD_FLAGS.has(flag.flagId)) ||
    milestones?.[ATTACK_CALIBRATION_MILESTONE_ID] !== undefined || reachesAttackCapabilityThreshold(state);
};
const protectedAttackStateHasLedgerAuthority = (
  state: unknown,
  events: readonly GameSessionEvent[],
): boolean => {
  const has = (type: GameSessionEvent["type"]): boolean => events.some((event) => event.type === type);
  const capabilities = isRecord(state) && isRecord(state.capabilities) ? state.capabilities : null;
  const milestones = capabilities && isRecord(capabilities.appliedMilestones) ? capabilities.appliedMilestones : null;
  if ((hasStateFlag(state, ATTACK_CAPACITY_CALIBRATION_FLAG_ID) ||
      milestones?.[ATTACK_CALIBRATION_MILESTONE_ID] !== undefined || reachesAttackCapabilityThreshold(state)) &&
      !has("attack_capacity_calibrated")) return false;
  if (hasStateFlag(state, RANGE_TRIAL_PERMISSION_FLAG_ID) && !has("attack_prerequisites_verified")) return false;
  if (hasStateFlag(state, PROLOGUE_RETURN_OBSERVED_FLAG_ID) && !has("prologue_return_observation_committed")) return false;
  if (hasStateFlag(state, FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID) && !has("safe_range_transfer_passed")) return false;
  if (hasStateFlag(state, "first_attack_signature_completed") && !has("safe_range_material_table_completed")) return false;
  return true;
};
type MigratableEconomy = SessionEconomyState | SessionEconomySummary;
type PreEconomyState = Omit<GameSessionState, "economy"> & { readonly economy: SessionEconomySummary };
type PreLifeLedgerState = Omit<GameSessionState, "lifeCorpseLedger" | "economy"> & { readonly economy: MigratableEconomy };
type PreCapabilityState = Omit<GameSessionState, "capabilities" | "economy"> & { readonly economy: MigratableEconomy };
type PreCapabilityAndLifeLedgerState = Omit<GameSessionState, "capabilities" | "lifeCorpseLedger" | "economy"> & {
  readonly economy: MigratableEconomy;
};

const isMigratableEconomy = (value: unknown): value is MigratableEconomy =>
  isSessionEconomyState(value) || isEconomySummary(value);

const isPreEconomyV02SessionState = (value: unknown): value is PreEconomyState =>
  isRecord(value) && isSessionStateCore(value) && isCapabilityState(value.capabilities) &&
  isSessionLifeCorpseLedger(value.lifeCorpseLedger) && isEconomySummary(value.economy);

const isPreLifeLedgerV02SessionState = (value: unknown): value is PreLifeLedgerState =>
  isRecord(value) && value.lifeCorpseLedger === undefined && isCapabilityState(value.capabilities) &&
  isMigratableEconomy(value.economy) && isSessionStateCore(value);

const isPreCapabilityOnlyV02SessionState = (value: unknown): value is PreCapabilityState =>
  isRecord(value) && value.capabilities === undefined && isSessionLifeCorpseLedger(value.lifeCorpseLedger) &&
  isMigratableEconomy(value.economy) && isSessionStateCore(value);

const isPreCapabilityV02SessionState = (value: unknown): value is PreCapabilityAndLifeLedgerState =>
  isRecord(value) && value.capabilities === undefined && value.lifeCorpseLedger === undefined &&
  isMigratableEconomy(value.economy) && isSessionStateCore(value);

const isEventEnvelope = (value: unknown): value is GameSessionEvent => {
  if (!isRecord(value) || !isNonEmptyString(value.eventId) || !isNonNegativeSafeInteger(value.sequence) ||
      value.sequence === 0 || !isNonEmptyString(value.type) || !isRecord(value.payload)) return false;
  return [
    "mp_replaced",
    "capability_milestone_committed",
    "wildlife_life_registered",
    "wildlife_damage_committed",
    "wildlife_death_committed",
    "wildlife_processing_interaction_committed",
    "wildlife_processing_work_advanced",
    "wildlife_processing_evidence_committed",
    "wildlife_processing_committed",
    "inventory_consumption_committed",
    "verified_trade_quote_issued",
    "verified_trade_sale_committed",
    "attack_qualification_interaction_committed",
    "learning_evidence_committed",
    "core120_learning_action_committed",
    "attack_capacity_calibrated",
    "prologue_return_observation_committed",
    "attack_prerequisites_verified",
    "safe_range_runtime_frame_committed",
    "safe_range_transfer_passed",
    "safe_range_material_table_completed",
    "scene_entered",
    "checkpoint_set",
    "world_flag_set",
    "learning_replaced",
    "survival_replaced",
    "economy_replaced",
    "economy_wallet_changed",
    "quote_sequence_advanced",
    "economy_lot_changed",
    "merchant_state_changed",
    "trade_sale_committed",
    "quest_stage_set",
    "receipt_recorded",
    "area_reset",
  ].includes(value.type);
};

const eventPayloadFingerprint = (event: GameSessionEvent): string => fingerprint({
  type: event.type,
  payload: event.payload,
});

const emptyEconomy = (): SessionEconomyState => createEmptySessionEconomy();

const indexInheritedSurvivalReceipts = (
  survival: SurvivalSave,
): Readonly<Record<string, SessionReceiptIndexEntry>> => Object.fromEntries(
  survival.receipts.map((receiptId) => [
    receiptId,
    {
      receiptId,
      domain: "survival" as const,
      payloadHash: `inherited.${fingerprint({ domain: "survival", receiptId })}`,
      recordedByEventId: `origin.survival.${fingerprint(receiptId)}`,
      recordedAtSequence: 0,
    },
  ]),
);

export const adaptMpLedgerSnapshot = (snapshot: MpLedgerSnapshot): SessionMpState => {
  const adapted: SessionMpState = {
    currentMp: snapshot.currentMp,
    maxMp: snapshot.maxMp,
    worldVersion: snapshot.worldVersion,
  };
  if (!isSessionMpState(adapted)) throw new Error("invalid MP ledger snapshot");
  return clone(adapted);
};

export const adaptLearningSnapshot = (snapshot: LearningProgressionSnapshot): LearningProgressionSnapshot => {
  if (!isLearningSnapshot(snapshot)) throw new Error("invalid learning progression snapshot");
  return clone(snapshot);
};

export const adaptSurvivalSave = (save: SurvivalSave): SurvivalSave => {
  if (!isSurvivalSave(save)) throw new Error("invalid survival save");
  return clone(save);
};

export const adaptTradeSnapshot = (snapshot: TradeSnapshot): SessionEconomyState =>
  adaptTradeSnapshotToSessionEconomy(snapshot);

export const adaptTradeSave = (save: TradeSave): SessionEconomyState => adaptTradeSaveToSessionEconomy(save);

const createInitialState = (initial: GameSessionInitialState): GameSessionState => {
  if (!isNonEmptyString(initial.sessionId) || !isSessionMpState(initial.mp) ||
      !isNonEmptyString(initial.currentSceneId)) throw new Error("invalid GameSession initial state");
  const survival = clone(initial.survival ?? new SurvivalSystem().toSave());
  const state: GameSessionState = {
    revision: 0,
    lastEventSequence: 0,
    mp: clone(initial.mp),
    capabilities: clone(INITIAL_SESSION_CAPABILITIES),
    lifeCorpseLedger: createEmptyLifeCorpseLedger(),
    world: {
      currentSceneId: initial.currentSceneId,
      revision: 0,
      flags: {},
      areaEpochs: {},
    },
    checkpoint: clone(initial.checkpoint ?? {
      id: "checkpoint.session-entry",
      sceneId: initial.currentSceneId,
      position: { x: 0, y: 0 },
      revision: 0,
    }),
    learning: clone(initial.learning ?? createLearningProgression()),
    survival,
    economy: {
      ...(initial.economy === undefined ? emptyEconomy() : normalizeSessionEconomy(initial.economy)),
      // Derived mirror only; survival owns the authoritative active-world clock.
      activeWorldTick: survival.worldTicks,
    },
    quests: clone(initial.quests ?? {}),
    receiptIndex: { ...indexInheritedSurvivalReceipts(survival), ...clone(initial.receiptIndex ?? {}) },
    processedEventPayloads: {},
  };
  if (!isSessionState(state)) throw new Error("invalid GameSession aggregate component");
  return state;
};

const withAppliedEvent = (
  current: GameSessionState,
  event: GameSessionEvent,
  partial: Omit<Partial<GameSessionState>, "revision" | "lastEventSequence" | "processedEventPayloads">,
): GameSessionState => ({
  ...current,
  ...partial,
  revision: current.revision + 1,
  lastEventSequence: event.sequence,
  processedEventPayloads: {
    ...current.processedEventPayloads,
    [event.eventId]: eventPayloadFingerprint(event),
  },
});

const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

type ReplayResult =
  | Readonly<{ ok: true; session: GameSession }>
  | Readonly<{ ok: false; failedEventId: string | null; reason: SessionApplyReason | "invalid_origin" }>;

export class GameSession {
  private state: GameSessionState;
  private readonly origin: GameSessionState;
  private readonly ledger: GameSessionEvent[];
  private readonly legacyEconomyReplacementSequences: ReadonlySet<number>;
  private readonly legacyLearningReplacementSequences: ReadonlySet<number>;
  private readonly legacyProtectedWorldFlagSequences: ReadonlySet<number>;
  private readonly liveVerifiedTradeQuotes: Map<string, string>;
  private replaying = false;

  private constructor(
    readonly sessionId: string,
    origin: GameSessionState,
    state = origin,
    ledger: readonly GameSessionEvent[] = [],
    legacyEconomyReplacementSequences: readonly number[] = [],
    legacyLearningReplacementSequences: readonly number[] = [],
    legacyProtectedWorldFlagSequences: readonly number[] = [],
    liveVerifiedTradeQuotes: readonly (readonly [string, string])[] = [],
  ) {
    this.origin = clone(origin);
    this.state = clone(state);
    this.ledger = clone([...ledger]);
    this.legacyEconomyReplacementSequences = new Set(legacyEconomyReplacementSequences);
    this.legacyLearningReplacementSequences = new Set(legacyLearningReplacementSequences);
    this.legacyProtectedWorldFlagSequences = new Set(legacyProtectedWorldFlagSequences);
    this.liveVerifiedTradeQuotes = new Map(liveVerifiedTradeQuotes);
  }

  static create(initial: GameSessionInitialState): GameSession {
    const origin = createInitialState(initial);
    return new GameSession(initial.sessionId, origin);
  }

  static fromReplayOrigin(sessionId: string, origin: GameSessionState): GameSession {
    if (!isNonEmptyString(sessionId) || !isSessionState(origin) || hasProtectedAttackState(origin)) {
      throw new Error("GameSession replay origin rejected: protected attack state must be ledger-derived");
    }
    return new GameSession(sessionId, origin);
  }

  static replayLedger(
    sessionId: string,
    origin: GameSessionState,
    events: readonly GameSessionEvent[],
  ): ReplayResult {
    if (!isNonEmptyString(sessionId) || !isSessionState(origin) || origin.revision !== 0 ||
        origin.lastEventSequence !== 0 || Object.keys(origin.processedEventPayloads).length !== 0 ||
        hasProtectedAttackState(origin)) {
      return { ok: false, failedEventId: null, reason: "invalid_origin" };
    }
    const economyDomainTypes = new Set<GameSessionEvent["type"]>([
      "economy_wallet_changed", "quote_sequence_advanced", "economy_lot_changed",
      "merchant_state_changed", "trade_sale_committed", "verified_trade_quote_issued", "verified_trade_sale_committed", "wildlife_processing_interaction_committed", "wildlife_processing_evidence_committed", "wildlife_processing_committed", "wildlife_processing_work_advanced", "inventory_consumption_committed",
    ]);
    const legacyEconomyEvents = events.filter((event) => event.type === "economy_replaced");
    if (legacyEconomyEvents.length > 0 && events.some((event) => economyDomainTypes.has(event.type))) {
      return { ok: false, failedEventId: legacyEconomyEvents[0]!.eventId, reason: "invalid_event" };
    }
    const invalidSafeRangeAuthority = events.find((event, index) => {
      if (event.type === "safe_range_runtime_frame_committed") {
        const action = events[index + 1];
        const receipt = events[index + 2];
        const expectedActionType = event.payload.actionKind === "transfer"
          ? "safe_range_transfer_passed" : "safe_range_material_table_completed";
        const authorityProof = action?.type === "safe_range_transfer_passed" ||
          action?.type === "safe_range_material_table_completed"
          ? action.payload.authorityProof : null;
        if (!validSafeRangeRuntimeFramePayload(event.payload) || action?.type !== expectedActionType ||
            !isRecord(authorityProof) ||
            action.sequence !== event.sequence + 1 || action.payload.transactionId !== event.payload.transactionId ||
            authorityProof.frameEventId !== event.eventId ||
            authorityProof.frameHash !== event.payload.frameHash ||
            authorityProof.requestHash !== event.payload.requestHash ||
            authorityProof.manifestDigest !== event.payload.manifestDigest ||
            authorityProof.runtimeRevision !== event.payload.runtimeRevision ||
            authorityProof.sessionWorldRevision !== event.payload.sessionWorldRevision ||
            authorityProof.mpWorldVersion !== event.payload.mpWorldVersion) return true;
        return receipt?.type !== "receipt_recorded" || receipt.sequence !== action.sequence + 1 ||
          receipt.eventId !== `session.safe-range.operation.${event.payload.transactionId}` ||
          receipt.payload.receiptId !== `world:${sessionId}:safe-range-operation:${event.payload.transactionId}` ||
          receipt.payload.domain !== "world" || receipt.payload.payloadHash !== event.payload.requestHash;
      }
      if (event.type !== "safe_range_transfer_passed" && event.type !== "safe_range_material_table_completed") return false;
      if (!isRecord(event.payload.authorityProof)) return true;
      const frame = events[index - 1];
      return frame?.type !== "safe_range_runtime_frame_committed" || frame.sequence + 1 !== event.sequence ||
        frame.payload.transactionId !== event.payload.transactionId ||
        frame.eventId !== event.payload.authorityProof.frameEventId ||
        frame.payload.frameHash !== event.payload.authorityProof.frameHash;
    });
    if (invalidSafeRangeAuthority) {
      return { ok: false, failedEventId: invalidSafeRangeAuthority.eventId, reason: "invalid_event" };
    }
    const learningDomainTypes = new Set<GameSessionEvent["type"]>([
      "attack_qualification_interaction_committed",
    "learning_evidence_committed", "attack_capacity_calibrated", "attack_prerequisites_verified",
      "safe_range_runtime_frame_committed", "safe_range_transfer_passed", "safe_range_material_table_completed",
    ]);
    const firstLearningDomainSequence = events.find((event) => learningDomainTypes.has(event.type))?.sequence ?? Infinity;
    const invalidLateReplacement = events.find((event) =>
      event.type === "learning_replaced" && event.sequence >= firstLearningDomainSequence);
    if (invalidLateReplacement) {
      return { ok: false, failedEventId: invalidLateReplacement.eventId, reason: "invalid_event" };
    }
    const legacyLearningEvents = events.filter((event) =>
      event.type === "learning_replaced" && event.sequence < firstLearningDomainSequence);
    const legacyProtectedWorldFlagSequences = events.flatMap((event, index) => {
      if (event.type !== "world_flag_set" || event.payload.flagId !== PROLOGUE_RETURN_OBSERVED_FLAG_ID ||
          event.payload.value !== true || event.payload.scope !== "global" ||
          event.sequence >= firstLearningDomainSequence) return [];
      const priorScene = events.slice(0, index).reverse().find((candidate) => candidate.type === "scene_entered");
      const priorQuest = events.slice(0, index).reverse().find((candidate) => candidate.type === "quest_stage_set" &&
        candidate.payload.questId === "ch01_return_flow");
      return priorScene?.type === "scene_entered" && priorScene.payload.sceneId === "scene.valley.settlement" &&
        priorQuest?.type === "quest_stage_set" && priorQuest.payload.stageId === "completed" ? [event.sequence] : [];
    });
    const session = new GameSession(
      sessionId, origin, origin, [], legacyEconomyEvents.map((event) => event.sequence),
      legacyLearningEvents.map((event) => event.sequence), legacyProtectedWorldFlagSequences,
    );
    session.replaying = true;
    try {
      for (const event of events) {
        const result = session.apply(event);
        if (!result.applied) return { ok: false, failedEventId: event.eventId, reason: result.reason };
      }
    } finally { session.replaying = false; }
    if (!isSessionState(session.state)) {
      return { ok: false, failedEventId: events.at(-1)?.eventId ?? null, reason: "invalid_event" };
    }
    return { ok: true, session };
  }

  static load(candidate: unknown): GameSessionLoadResult {
    const migration = migrateGameSessionSave(candidate);
    if (!migration.ok) return migration;
    const save = migration.save;
    if (!isCurrentSaveStructurallyValid(save)) return { ok: false, error: "invalid_save" };
    if (save.integrity.digest !== saveDigest(save)) return { ok: false, error: "integrity_mismatch" };

    const replayed = replayGameSession(save.sessionId, save.origin, save.eventLedger);
    if (!replayed.ok || !same(replayed.session.snapshot(), save.state)) {
      return { ok: false, error: "replay_mismatch" };
    }
    return {
      ok: true,
      session: replayed.session,
      migratedFrom: migration.migratedFrom,
    };
  }

  static fromSave(candidate: unknown): GameSession {
    const result = GameSession.load(candidate);
    if (!result.ok) throw new Error(`GameSession save rejected: ${result.error}`);
    return result.session;
  }

  /** Internal transaction clone that preserves non-serialized live command capabilities. */
  forkForProposal(): GameSession {
    return new GameSession(this.sessionId, this.origin, this.state, this.ledger,
      [...this.legacyEconomyReplacementSequences], [...this.legacyLearningReplacementSequences],
      [...this.legacyProtectedWorldFlagSequences], [...this.liveVerifiedTradeQuotes.entries()]);
  }

  snapshot(): GameSessionState {
    return clone(this.state);
  }

  capabilitySnapshot(): SessionCapabilityState {
    return clone(this.state.capabilities);
  }

  lifeCorpseLedgerSnapshot(): SessionLifeCorpseLedger {
    return clone(this.state.lifeCorpseLedger);
  }

  events(): readonly GameSessionEvent[] {
    return clone(this.ledger);
  }

  nextSequence(): number {
    return this.state.lastEventSequence + 1;
  }

  apply(event: GameSessionEvent): SessionApplyResult {
    return this.applyInternal(event, null, null, null, null, null);
  }

  /** Accepts safe-range events only when the coordinator supplies its unforgeable live proof. */
  applyTrustedSafeRangeEvent(event: GameSessionEvent, proof: SafeRangeCommitProof): SessionApplyResult {
    return this.applyInternal(event, proof, null, null, null, null);
  }

  /** Accepts attack qualification events only from the live semantic coordinators. */
  applyTrustedAttackQualificationEvent(event: GameSessionEvent, proof: AttackQualificationCommitProof): SessionApplyResult {
    return this.applyInternal(event, null, proof, null, null, null);
  }

  applyTrustedReturnFlowQualificationEvent(
    event: GameSessionEvent,
    proof: ReturnFlowQualificationCommitProof,
  ): SessionApplyResult {
    return this.applyInternal(event, null, null, proof, null, null);
  }

  /** Accepts P0 curriculum evidence only from the live recovery-station coordinator. */
  applyTrustedP0LearningEvent(event: GameSessionEvent, proof: P0LearningCommitProof): SessionApplyResult {
    return this.applyInternal(event, null, null, null, proof, null);
  }

  /** Accepts core-120 recovery evidence only from the live archive coordinator. */
  applyTrustedCore120LearningEvent(event: GameSessionEvent, proof: Core120LearningCommitProof): SessionApplyResult {
    return this.applyInternal(event, null, null, null, null, proof);
  }

  private applyInternal(event: GameSessionEvent, safeRangeProof: SafeRangeCommitProof | null,
    attackQualificationProof: AttackQualificationCommitProof | null,
    returnFlowQualificationProof: ReturnFlowQualificationCommitProof | null,
    p0LearningProof: P0LearningCommitProof | null,
    core120LearningProof: Core120LearningCommitProof | null): SessionApplyResult {
    if (!isEventEnvelope(event)) return this.result(false, false, "invalid_event");
    const safeRangeProtected = event.type === "safe_range_runtime_frame_committed" ||
      event.type === "safe_range_transfer_passed" || event.type === "safe_range_material_table_completed";
    if (safeRangeProtected && !this.replaying) {
      const proofMatches = safeRangeProof !== null && isTrustedSafeRangeCommitProof(safeRangeProof) &&
        safeRangeProof.batch.drafts.some((draft) => draft.eventId === event.eventId && draft.type === event.type &&
          same(draft.payload, event.payload));
      const authorityMatches = event.type === "safe_range_runtime_frame_committed"
        ? proofMatches && safeRangeProof.requestHash === event.payload.requestHash &&
          safeRangeProof.runtimeRevision === event.payload.runtimeRevision
        : proofMatches && safeRangeProof.requestHash === event.payload.authorityProof.requestHash &&
          safeRangeProof.runtimeRevision === event.payload.authorityProof.runtimeRevision;
      if (!authorityMatches) return this.result(false, false, "invalid_event");
    }
    const qualificationFormEvidence = event.type === "learning_evidence_committed" && event.payload.qualificationActionId !== undefined;
    const attackProtectedEvent = event.type === "attack_qualification_interaction_committed" || qualificationFormEvidence ||
      event.type === "attack_capacity_calibrated" || event.type === "prologue_return_observation_committed" ||
      event.type === "attack_prerequisites_verified";
    const returnFlowProtected = event.type === "prologue_return_observation_committed" ||
      (qualificationFormEvidence && event.payload.qualificationActionId?.startsWith("return_flow.wawa.") === true);
    const expectedAttackKind = event.type === "attack_qualification_interaction_committed" ||
      (qualificationFormEvidence && !returnFlowProtected) ? "settlement_action" :
      event.type === "attack_capacity_calibrated" ? "calibration" :
      event.type === "attack_prerequisites_verified" ? "permission" : null;
    const expectedReturnFlowKind = event.type === "prologue_return_observation_committed" ? "observation" :
      returnFlowProtected ? "grounding" : null;
    const trustedAttack = expectedAttackKind !== null && attackQualificationProof !== null &&
      isTrustedAttackQualificationCommitProof(attackQualificationProof) && attackQualificationProof.kind === expectedAttackKind &&
      attackQualificationProof.batch.drafts.some((draft) => draft.eventId === event.eventId && draft.type === event.type &&
        same(draft.payload, event.payload));
    const trustedReturnFlow = expectedReturnFlowKind !== null && returnFlowQualificationProof !== null &&
      isTrustedReturnFlowQualificationCommitProof(returnFlowQualificationProof) &&
      returnFlowQualificationProof.kind === expectedReturnFlowKind &&
      returnFlowQualificationProof.batch.drafts.some((draft) => draft.eventId === event.eventId && draft.type === event.type &&
        same(draft.payload, event.payload));
    if (attackProtectedEvent && !this.replaying && !trustedAttack && !trustedReturnFlow) {
      return this.result(false, false, "invalid_event");
    }
    const p0Protected = event.type === "learning_evidence_committed" && event.payload.p0CurriculumActionId !== undefined;
    const trustedP0 = p0Protected && p0LearningProof !== null && isTrustedP0LearningCommitProof(p0LearningProof) &&
      p0LearningProof.actionId === event.payload.p0CurriculumActionId &&
      p0LearningProof.batch.drafts.some((draft) => draft.eventId === event.eventId && draft.type === event.type && same(draft.payload, event.payload));
    if (p0Protected && !this.replaying && !trustedP0) return this.result(false, false, "invalid_event");
    const core120Protected = event.type === "core120_learning_action_committed" ||
      (event.type === "learning_evidence_committed" &&
        event.payload.core120CurriculumActionId !== undefined);
    const core120ActionId = event.type === "core120_learning_action_committed"
      ? event.payload.actionId
      : event.type === "learning_evidence_committed"
        ? event.payload.core120CurriculumActionId
        : undefined;
    const trustedCore120 = core120Protected && core120LearningProof !== null &&
      isTrustedCore120LearningCommitProof(core120LearningProof) &&
      core120LearningProof.actionId === core120ActionId &&
      core120LearningProof.batch.drafts.some((draft) => draft.eventId === event.eventId &&
        draft.type === event.type && same(draft.payload, event.payload));
    if (core120Protected && !this.replaying && !trustedCore120) {
      return this.result(false, false, "invalid_event");
    }
    const payloadFingerprint = eventPayloadFingerprint(event);
    const prior = this.state.processedEventPayloads[event.eventId];
    if (prior !== undefined) {
      return prior === payloadFingerprint
        ? this.result(false, true, "duplicate_event")
        : this.result(false, false, "event_payload_conflict");
    }
    if (event.sequence !== this.state.lastEventSequence + 1) {
      return this.result(false, false, "event_sequence_gap");
    }

    const reduced = this.reduceEvent(event);
    if ("reason" in reduced) return this.result(false, reduced.duplicate, reduced.reason);
    // Every reducer validates its own event and changed domain. During replay,
    // validating the entire growing Session after every event makes a complete
    // Core-120 ledger quadratic. replayLedger performs one authoritative full
    // structural validation after the complete causally ordered ledger.
    if (!this.replaying && !isSessionState(reduced.state)) return this.result(false, false, "invalid_event");
    this.state = reduced.state;
    this.ledger.push(clone(event));
    return this.result(true, false, "applied");
  }

  toSave(): GameSessionSave {
    const withoutIntegrity: Omit<GameSessionSave, "integrity"> = {
      schema: GAME_SESSION_SAVE_SCHEMA,
      sessionId: this.sessionId,
      origin: clone(this.origin),
      state: clone(this.state),
      eventLedger: clone(this.ledger),
    };
    return {
      ...withoutIntegrity,
      integrity: {
        algorithm: GAME_SESSION_INTEGRITY_ALGORITHM,
        digest: fingerprint(withoutIntegrity),
      },
    };
  }

  private reduceEvent(event: GameSessionEvent):
    | { readonly state: GameSessionState }
    | { readonly reason: Exclude<SessionApplyReason, "applied">; readonly duplicate: boolean } {
    switch (event.type) {
      case "mp_replaced": {
        if (!isSessionMpState(event.payload.mp)) return { reason: "invalid_event", duplicate: false };
        // Capacity/max-MP progression is atomic and can only be written by a milestone event.
        if (event.payload.mp.maxMp !== this.state.mp.maxMp) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (event.payload.mp.worldVersion < this.state.mp.worldVersion) {
          return { reason: "state_regression", duplicate: false };
        }
        return { state: withAppliedEvent(this.state, event, { mp: clone(event.payload.mp) }) };
      }
      case "capability_milestone_committed": {
        const payload = event.payload;
        if (payload.milestoneId === ATTACK_CALIBRATION_MILESTONE_ID ||
            payload.writerEvent === ATTACK_CALIBRATION_WRITER_EVENT) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (!isNonEmptyString(payload.milestoneId) || !isNonEmptyString(payload.writerEvent) ||
            !isNonEmptyString(payload.sourcePath) || !isNonEmptyString(payload.contractRevision) ||
            typeof payload.sourceDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(payload.sourceDigest) ||
            !isCapabilityMilestoneResult(payload.resultingState)) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (payload.resultingState.expressionCapacityWords >= 4 || payload.resultingState.focusSlots >= 4 ||
            payload.resultingState.maxMp >= 30) return { reason: "invalid_event", duplicate: false };
        const prior = this.state.capabilities.appliedMilestones[payload.milestoneId];
        const comparable = {
          milestoneId: payload.milestoneId,
          writerEvent: payload.writerEvent,
          sourcePath: payload.sourcePath,
          sourceDigest: payload.sourceDigest,
          contractRevision: payload.contractRevision,
          ...payload.resultingState,
        };
        if (prior) {
          const priorComparable = {
            milestoneId: prior.milestoneId,
            writerEvent: prior.writerEvent,
            sourcePath: prior.sourcePath,
            sourceDigest: prior.sourceDigest,
            contractRevision: prior.contractRevision,
            expressionCapacityWords: prior.expressionCapacityWords,
            focusSlots: prior.focusSlots,
            maxMp: prior.maxMp,
          };
          return same(priorComparable, comparable)
            ? { reason: "duplicate_milestone", duplicate: true }
            : { reason: "milestone_payload_conflict", duplicate: false };
        }
        const next = payload.resultingState;
        if (next.expressionCapacityWords < this.state.capabilities.expressionCapacityWords ||
            next.focusSlots < this.state.capabilities.focusSlots || next.maxMp < this.state.mp.maxMp) {
          return { reason: "state_regression", duplicate: false };
        }
        const record: SessionCapabilityMilestoneRecord = {
          ...comparable,
          committedByEventId: event.eventId,
          committedAtSequence: event.sequence,
        };
        return {
          state: withAppliedEvent(this.state, event, {
            mp: {
              currentMp: this.state.mp.currentMp,
              maxMp: next.maxMp,
              worldVersion: this.state.mp.worldVersion + 1,
            },
            capabilities: {
              expressionCapacityWords: next.expressionCapacityWords,
              focusSlots: next.focusSlots,
              revision: this.state.capabilities.revision + 1,
              appliedMilestones: {
                ...this.state.capabilities.appliedMilestones,
                [payload.milestoneId]: record,
              },
            },
          }),
        };
      }
      case "wildlife_life_registered": {
        const life = event.payload.life;
        if (!isSessionWildlifeLifeRecord(life) || life.state !== "alive" || life.lifeRevision !== 0 ||
            life.currentHp !== life.maxHp) return { reason: "invalid_event", duplicate: false };
        const prior = this.state.lifeCorpseLedger.lives[life.lifeInstanceId];
        if (prior) {
          return same(prior, life)
            ? { reason: "life_already_registered", duplicate: true }
            : { reason: "life_registration_conflict", duplicate: false };
        }
        return {
          state: withAppliedEvent(this.state, event, {
            lifeCorpseLedger: {
              ...this.state.lifeCorpseLedger,
              revision: this.state.lifeCorpseLedger.revision + 1,
              lives: { ...this.state.lifeCorpseLedger.lives, [life.lifeInstanceId]: clone(life) },
            },
          }),
        };
      }
      case "wildlife_damage_committed": {
        const payload = event.payload;
        if (!isWildlifeDamageCommitPayload(payload)) return { reason: "invalid_event", duplicate: false };
        const life = this.state.lifeCorpseLedger.lives[payload.lifeInstanceId];
        if (!life) return { reason: "life_not_registered", duplicate: false };
        if (life.state === "dead") return { reason: "life_already_tombstoned", duplicate: true };
        if (payload.expectedLifeRevision !== life.lifeRevision) {
          return { reason: "life_revision_conflict", duplicate: false };
        }
        if (payload.damage >= life.currentHp) return { reason: "invalid_event", duplicate: false };
        const receiptId = "wildlife:" + payload.transactionId;
        const receiptHash = "wildlife-damage:" + life.lifeInstanceId + ":" + payload.expectedLifeRevision + ":" + payload.damage;
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) {
          return priorReceipt.domain === "wildlife" && priorReceipt.payloadHash === receiptHash
            ? { reason: "duplicate_receipt", duplicate: true }
            : { reason: "receipt_payload_conflict", duplicate: false };
        }
        const nextLife = { ...life, currentHp: life.currentHp - payload.damage, lifeRevision: life.lifeRevision + 1 };
        return {
          state: withAppliedEvent(this.state, event, {
            lifeCorpseLedger: {
              ...this.state.lifeCorpseLedger,
              revision: this.state.lifeCorpseLedger.revision + 1,
              lives: { ...this.state.lifeCorpseLedger.lives, [life.lifeInstanceId]: nextLife },
            },
            receiptIndex: {
              ...this.state.receiptIndex,
              [receiptId]: {
                receiptId,
                domain: "wildlife",
                payloadHash: receiptHash,
                recordedByEventId: event.eventId,
                recordedAtSequence: event.sequence,
              },
            },
          }),
        };
      }
      case "wildlife_death_committed": {
        const payload = event.payload;
        if (!isWildlifeDeathCommitPayload(payload)) return { reason: "invalid_event", duplicate: false };
        const life = this.state.lifeCorpseLedger.lives[payload.lifeInstanceId];
        if (!life) return { reason: "life_not_registered", duplicate: false };
        if (life.state === "dead") return { reason: "life_already_tombstoned", duplicate: true };
        if (payload.expectedLifeRevision !== life.lifeRevision) {
          return { reason: "life_revision_conflict", duplicate: false };
        }
        if (payload.damage < life.currentHp || payload.worldTick < life.registeredAtWorldTick ||
            payload.deathEventId !== createDeterministicDeathEventId(life.regionSaveId, life.lifeInstanceId) ||
            payload.corpseId !== createDeterministicCorpseId(payload.economyId, life.lifeInstanceId) ||
            payload.populationDelta.species !== life.species ||
            payload.populationDelta.adultLivingDelta !== (life.ageClass === "adult" ? -1 : 0) ||
            !same(payload.tissueSlots, tissueSlotsForLife(life.species, life.ageClass))) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (this.state.lifeCorpseLedger.corpseIdByLifeId[life.lifeInstanceId] !== undefined ||
            this.state.lifeCorpseLedger.corpses[payload.corpseId] !== undefined) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = createCrossSaveReceiptId(payload.transactionId, "death");
        const receiptHash = "wildlife-death:" + payload.deathEventId + ":" + payload.corpseId;
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) {
          return priorReceipt.domain === "wildlife" && priorReceipt.payloadHash === receiptHash
            ? { reason: "duplicate_receipt", duplicate: true }
            : { reason: "receipt_payload_conflict", duplicate: false };
        }
        const deadLife = {
          ...life,
          state: "dead" as const,
          currentHp: 0,
          lifeRevision: life.lifeRevision + 1,
          deathTransactionId: payload.transactionId,
          deathEventId: payload.deathEventId,
          corpseId: payload.corpseId,
        };
        const corpse: SessionWildlifeCorpseRecord = {
          corpseId: payload.corpseId,
          lifeInstanceId: life.lifeInstanceId,
          regionId: life.regionId,
          entityId: life.entityId,
          species: life.species,
          ageClass: life.ageClass,
          harvestProfileId: life.harvestProfileId,
          deathEventId: payload.deathEventId,
          deathTick: payload.worldTick,
          causeClass: payload.causeClass,
          position: clone(payload.position),
          decayState: "fresh",
          contaminationMu: 0,
          lastDecayEvalTick: payload.worldTick,
          tissueSlots: clone(payload.tissueSlots),
          populationDelta: clone(payload.populationDelta),
          revision: 0,
        };
        return {
          state: withAppliedEvent(this.state, event, {
            lifeCorpseLedger: {
              ...this.state.lifeCorpseLedger,
              revision: this.state.lifeCorpseLedger.revision + 1,
              lives: { ...this.state.lifeCorpseLedger.lives, [life.lifeInstanceId]: deadLife },
              corpses: { ...this.state.lifeCorpseLedger.corpses, [corpse.corpseId]: corpse },
              corpseIdByLifeId: {
                ...this.state.lifeCorpseLedger.corpseIdByLifeId,
                [life.lifeInstanceId]: corpse.corpseId,
              },
            },
            receiptIndex: {
              ...this.state.receiptIndex,
              [receiptId]: {
                receiptId,
                domain: "wildlife",
                payloadHash: receiptHash,
                recordedByEventId: event.eventId,
                recordedAtSequence: event.sequence,
              },
            },
          }),
        };
      }
      case "inventory_consumption_committed": {
        const action = event.payload.action;
        if (!action || typeof action !== "object" || action.playerSaveId !== this.sessionId) {
          return { reason: "invalid_event", duplicate: false };
        }
        const expectedReceiptId = createCrossSaveReceiptId(action.transactionId, "consume");
        const expectedPayloadHash = `consume-request:${sha256Canonical(action as unknown as JsonValue)}`;
        const priorReceipt = this.state.receiptIndex[expectedReceiptId];
        if (priorReceipt) return priorReceipt.payloadHash === expectedPayloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        const applied = applyInventoryConsumption(this.state.economy, this.state.survival, action);
        if (!applied.committed) return {
          reason: applied.reason === "revision_conflict" ? "economy_revision_conflict" : "invalid_event",
          duplicate: false,
        };
        const receipt: SessionReceiptIndexEntry = {
          receiptId: applied.receipt.receiptId,
          domain: "survival",
          payloadHash: expectedPayloadHash,
          recordedByEventId: event.eventId,
          recordedAtSequence: event.sequence,
        };
        return { state: withAppliedEvent(this.state, event, {
          economy: applied.economy,
          survival: applied.survival,
          receiptIndex: { ...this.state.receiptIndex, [receipt.receiptId]: receipt },
        }) };
      }
      case "wildlife_processing_interaction_committed": {
        const payload = event.payload;
        if (!isNonEmptyString(payload.stationId) || !isNonEmptyString(payload.sceneId) ||
            !isNonEmptyString(payload.targetId) || !isNonEmptyString(payload.interactionId) ||
            !isNonNegativeSafeInteger(payload.runtimeSceneRevision) || !isNonNegativeSafeInteger(payload.runtimeInteractionSequence) ||
            !isNonEmptyString(payload.operationId) || !Number.isFinite(payload.playerPositionPx?.x) || !Number.isFinite(payload.playerPositionPx?.y)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const binding = wildlifeProcessingManifest().stationBindings[payload.stationId];
        const dx = payload.playerPositionPx.x - (binding?.interactionPointPx.x ?? Number.POSITIVE_INFINITY);
        const dy = payload.playerPositionPx.y - (binding?.interactionPointPx.y ?? Number.POSITIVE_INFINITY);
        if (!binding || payload.sceneId !== binding.sceneId || payload.targetId !== binding.targetId ||
            payload.interactionId !== binding.interactionId || this.state.world.currentSceneId !== binding.sceneId ||
            payload.runtimeSceneRevision !== this.state.world.revision || Math.hypot(dx, dy) > 16) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = `wildlife-processing-interaction:${payload.stationId}:${payload.runtimeSceneRevision}:${payload.operationId}`;
        const existing = this.state.receiptIndex[receiptId];
        if (existing) return { reason: "duplicate_receipt", duplicate: true };
        const receipt: SessionReceiptIndexEntry = {
          receiptId, domain: "wildlife", payloadHash: `interaction:${payload.stationId}:${payload.sceneId}:${payload.targetId}:${payload.interactionId}:${payload.runtimeSceneRevision}:${payload.runtimeInteractionSequence}:${payload.playerPositionPx.x}:${payload.playerPositionPx.y}`,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence,
        };
        return { state: withAppliedEvent(this.state, event, { receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt } }) };
      }
      case "wildlife_processing_work_advanced": {
        const payload = event.payload;
        if (!isNonEmptyString(payload.transactionId) || !isNonEmptyString(payload.canonicalIdempotencyKey) ||
            !isNonEmptyString(payload.workOrderId) || !isNonNegativeSafeInteger(payload.expectedWorkOrderRevision) ||
            !isNonNegativeSafeInteger(payload.expectedSurvivalRevision) || !isNonNegativeSafeInteger(payload.expectedWorldTicks) ||
            !isNonEmptyString(payload.interactionReceiptId)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const order = this.state.economy.workOrders.find((candidate) => candidate.workOrderId === payload.workOrderId) as
          WildlifeProcessingWorkOrder | undefined;
        if (!order) return { reason: "invalid_event", duplicate: false };
        const workIdentity = { workOrderId: order.workOrderId, expectedWorkOrderRevision: payload.expectedWorkOrderRevision,
          stationInteractionId: payload.interactionReceiptId };
        if (payload.canonicalIdempotencyKey !== canonicalWildlifeProcessingWorkIdempotencyKey(workIdentity) ||
            payload.transactionId !== createWildlifeProcessingWorkTransactionId(workIdentity)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = createCrossSaveReceiptId(payload.transactionId, "workorder_work");
        if (this.state.receiptIndex[receiptId]) return { reason: "duplicate_receipt", duplicate: true };
        if (order.status !== "reserved" || order.revision !== payload.expectedWorkOrderRevision ||
            this.state.survival.revision !== payload.expectedSurvivalRevision ||
            this.state.survival.worldTicks !== payload.expectedWorldTicks ||
            this.state.economy.activeWorldTick !== this.state.survival.worldTicks) {
          return { reason: "economy_revision_conflict", duplicate: false };
        }
        const binding = wildlifeProcessingManifest().stationBindings[order.stationId];
        const interactionReceipt = this.state.receiptIndex[payload.interactionReceiptId];
        const interactionUseId = `wildlife-processing-interaction-use:${payload.interactionReceiptId}`;
        if (!binding || this.state.world.currentSceneId !== binding.sceneId || !interactionReceipt ||
            interactionReceipt.domain !== "wildlife" || !interactionReceipt.payloadHash.startsWith(`interaction:${order.stationId}:${binding.sceneId}:${binding.targetId}:${binding.interactionId}:${this.state.world.revision}:`) ||
            this.state.receiptIndex[interactionUseId]) {
          return { reason: "invalid_event", duplicate: false };
        }
        const recipe = wildlifeProcessingManifest().processingRecipes[order.recipeId];
        if (!recipe || recipe.recipeVersion !== order.recipeVersion || recipe.transactionKind === "harvest" ||
            recipe.genericProcessOutputPathForbidden) return { reason: "invalid_event", duplicate: false };
        const seconds = recipe.interactionWorkUnits * wildlifeProcessingManifest().workUnitActiveSeconds;
        const nextWorldTicks = this.state.survival.worldTicks + seconds;
        if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isSafeInteger(nextWorldTicks)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const workPayloadHash = wildlifeProcessingWorkPayloadHash(workIdentity, seconds);
        const receipt: SessionReceiptIndexEntry = {
          receiptId, domain: "wildlife", payloadHash: workPayloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence,
        };
        const energy = binding.energyProvision;
        if (recipe.energyRequirement && (!energy || energy.kind !== recipe.energyRequirement.kind ||
            energy.euPerWork < recipe.energyRequirement.eu)) return { reason: "invalid_event", duplicate: false };
        const energyReceiptId = recipe.energyRequirement
          ? `wildlife-processing-energy:${order.workOrderId}:${payload.expectedWorkOrderRevision}:${binding.interactionId}` : null;
        if (energyReceiptId && this.state.receiptIndex[energyReceiptId]) return { reason: "duplicate_receipt", duplicate: true };
        const energyReceipt: SessionReceiptIndexEntry | null = energyReceiptId && energy ? {
          receiptId: energyReceiptId, domain: "wildlife",
          payloadHash: `processing-energy:${order.workOrderId}:${binding.interactionId}:${energy.source}:${energy.kind}:${energy.euPerWork}`,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence,
        } : null;
        const nextOrder: WildlifeProcessingWorkOrder = { ...order, revision: order.revision + 1 };
        const economyReceipt = { receiptId, transactionId: payload.transactionId, transactionKind: "workorder_work", action: "work",
          payloadHash: workPayloadHash, workOrderId: order.workOrderId, corpseId: null, tissueSlotId: null,
          inputLotIds: [...order.inputLotIds], outputLotIds: [], zeroYieldReason: null, committedWorldTick: nextWorldTicks };
        return { state: withAppliedEvent(this.state, event, {
          survival: { ...this.state.survival, worldTicks: nextWorldTicks, revision: this.state.survival.revision + 1,
            receipts: [...this.state.survival.receipts, receiptId, ...(energyReceiptId ? [energyReceiptId] : [])] },
          economy: { ...this.state.economy, activeWorldTick: nextWorldTicks,
            workOrders: this.state.economy.workOrders.map((candidate) => candidate.workOrderId === order.workOrderId ? nextOrder : candidate),
            processingReceipts: [...this.state.economy.processingReceipts, economyReceipt] },
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt,
            [interactionUseId]: { receiptId: interactionUseId, domain: "wildlife", payloadHash: `interaction-use:${payload.interactionReceiptId}:${order.workOrderId}`,
              recordedByEventId: event.eventId, recordedAtSequence: event.sequence },
            ...(energyReceipt ? { [energyReceipt.receiptId]: energyReceipt } : {}) },
        }) };
      }
      case "wildlife_processing_evidence_committed": {
        const payload = event.payload;
        if (!isNonEmptyString(payload.evidenceId) || !isNonEmptyString(payload.workOrderId) || !isNonEmptyString(payload.subjectEventId) ||
            !["quest_stage_set", "world_flag_set", "scene_entered"].includes(payload.subjectEventType) ||
            !["mainline_world_predicate_commit", "non_replayed_side_task_commit", "region_transition_commit"].includes(payload.classification)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const order = this.state.economy.workOrders.find((candidate) => candidate.workOrderId === payload.workOrderId) as WildlifeProcessingWorkOrder | undefined;
        const subject = this.ledger.find((candidate) => candidate.eventId === payload.subjectEventId);
        if (!order || order.status !== "reserved" || !subject || subject.sequence <= order.startEventSequence || subject.sequence >= event.sequence ||
            subject.type !== payload.subjectEventType || !order.eligibleEventFilter.includes(payload.classification)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const priorSceneId = subject.type === "scene_entered"
          ? [...this.ledger].filter((candidate): candidate is Extract<GameSessionEvent, { type: "scene_entered" }> =>
              candidate.sequence < subject.sequence && candidate.type === "scene_entered").at(-1)?.payload.sceneId ?? this.origin.world.currentSceneId
          : null;
        const classificationValid = payload.classification === "non_replayed_side_task_commit"
          ? subject.type === "quest_stage_set" && subject.payload.stageOrdinal > 0
          : payload.classification === "mainline_world_predicate_commit"
            ? subject.type === "world_flag_set" && subject.payload.value === true && subject.payload.scope !== "area"
            : subject.type === "scene_entered" && subject.payload.sceneId !== priorSceneId;
        if (!classificationValid) return { reason: "invalid_event", duplicate: false };
        const receiptId = `wildlife-processing-evidence:${payload.evidenceId}`;
        const payloadHash = sha256Canonical({ work_order_id: payload.workOrderId, subject_event_id: payload.subjectEventId,
          subject_event_type: payload.subjectEventType, classification: payload.classification } as JsonValue);
        const prior = this.state.receiptIndex[receiptId];
        if (prior) return prior.payloadHash === payloadHash ? { reason: "duplicate_receipt", duplicate: true } : { reason: "receipt_payload_conflict", duplicate: false };
        const subjectAlreadyUsed = Object.values(this.state.receiptIndex).some((receipt) => {
          if (receipt.domain !== "wildlife") return false;
          const recorder = this.ledger.find((candidate) => candidate.eventId === receipt.recordedByEventId);
          return recorder?.type === "wildlife_processing_evidence_committed" &&
            recorder.payload.workOrderId === payload.workOrderId && recorder.payload.subjectEventId === payload.subjectEventId;
        });
        if (subjectAlreadyUsed) return { reason: "receipt_payload_conflict", duplicate: false };
        return { state: withAppliedEvent(this.state, event, { receiptIndex: { ...this.state.receiptIndex,
          [receiptId]: { receiptId, domain: "wildlife", payloadHash, recordedByEventId: event.eventId, recordedAtSequence: event.sequence },
        } }) };
      }
      case "wildlife_processing_committed": {
        const action = event.payload.action;
        if (!isRecord(action) || !isNonEmptyString(action.action)) return { reason: "invalid_event", duplicate: false };
        try {
          const currentCursor = event.sequence - 1;
          const canonicalKey = canonicalWildlifeProcessingIdempotencyKey(action, {
            requiredEventCursor: currentCursor,
            cancellationSequence: event.sequence,
          });
          const transactionKind = wildlifeProcessingTransactionKind(action);
          if (action.canonicalIdempotencyKey !== canonicalKey ||
              action.transactionId !== createWildlifeProcessingTransactionId(transactionKind, canonicalKey)) {
            return { reason: "invalid_event", duplicate: false };
          }
          const manifest = wildlifeProcessingManifest();
          const fieldDress = manifest.processingRecipes["process.field_dress.v0.1"];
          const workSeconds = action.action === "harvest"
            ? (fieldDress?.interactionWorkUnits ?? 0) * manifest.workUnitActiveSeconds : 0;
          if (action.action === "harvest" && (!fieldDress || fieldDress.transactionKind !== "harvest" || workSeconds <= 0)) {
            return { reason: "invalid_event", duplicate: false };
          }
          const authoritativeTick = this.state.survival.worldTicks + workSeconds;
          if (!Number.isSafeInteger(authoritativeTick) || action.currentWorldTick !== authoritativeTick ||
              this.state.economy.activeWorldTick !== this.state.survival.worldTicks ||
              (action.action === "reserve" && action.startEventSequence !== currentCursor)) {
            return { reason: "invalid_event", duplicate: false };
          }
          const order = action.action === "harvest" ? undefined : this.state.economy.workOrders.find((candidate) =>
            candidate.workOrderId === ("workOrderId" in action ? action.workOrderId : "")) as WildlifeProcessingWorkOrder | undefined;
          const actionPlayerSaveId = action.action === "harvest" || action.action === "reserve" ? action.playerSaveId :
            action.action === "claim" ? action.claimantPlayerSaveId : order?.initiatingPlayerSaveId;
          if (actionPlayerSaveId !== this.sessionId || (order && order.initiatingPlayerSaveId !== this.sessionId)) {
            return { reason: "invalid_event", duplicate: false };
          }
          const stationId = action.action === "harvest" ? action.stationOrToolId : action.action === "reserve" ? action.stationId : order?.stationId;
          const binding = stationId ? manifest.stationBindings[stationId] : undefined;
          const interactionReceiptId = action.interactionReceiptId;
          const interactionReceipt = interactionReceiptId ? this.state.receiptIndex[interactionReceiptId] : undefined;
          const interactionUseId = interactionReceiptId ? `wildlife-processing-interaction-use:${interactionReceiptId}` : null;
          if (!stationId || !binding || !interactionReceiptId || !interactionUseId || this.state.world.currentSceneId !== binding.sceneId ||
              interactionReceipt?.domain !== "wildlife" || !interactionReceipt.payloadHash.startsWith(`interaction:${stationId}:${binding.sceneId}:${binding.targetId}:${binding.interactionId}:${this.state.world.revision}:`) ||
              this.state.receiptIndex[interactionUseId]) {
            return { reason: "invalid_event", duplicate: false };
          }
          const eligibleWorldEvents: WildlifeProcessingApplyContext["eligibleWorldEvents"] = order
            ? Object.values(this.state.receiptIndex).flatMap((receipt) => {
                const recorder = this.ledger.find((candidate) => candidate.eventId === receipt.recordedByEventId);
                if (receipt.domain !== "wildlife" || recorder?.type !== "wildlife_processing_evidence_committed" ||
                    receipt.recordedAtSequence !== recorder.sequence || recorder.sequence > currentCursor ||
                    recorder.payload.workOrderId !== order.workOrderId ||
                    receipt.receiptId !== `wildlife-processing-evidence:${recorder.payload.evidenceId}` ||
                    receipt.payloadHash !== sha256Canonical({ work_order_id: order.workOrderId,
                      subject_event_id: recorder.payload.subjectEventId, subject_event_type: recorder.payload.subjectEventType,
                      classification: recorder.payload.classification } as JsonValue)) return [];
                const subject = this.ledger.find((candidate) => candidate.eventId === recorder.payload.subjectEventId);
                if (!subject || subject.type !== recorder.payload.subjectEventType) return [];
                return [{ eventId: receipt.receiptId, classification: recorder.payload.classification, sequence: subject.sequence }];
              })
            : [];
          const energyReceipts: WildlifeProcessingApplyContext["energyReceipts"] = order ? Object.values(this.state.receiptIndex).flatMap((receipt) => {
            const binding = manifest.stationBindings[order.stationId];
            const recipe = manifest.processingRecipes[order.recipeId];
            const energy = binding?.energyProvision;
            const expectedPrefix = `wildlife-processing-energy:${order.workOrderId}:`;
            const expectedHash = energy ? `processing-energy:${order.workOrderId}:${binding.interactionId}:${energy.source}:${energy.kind}:${energy.euPerWork}` : null;
            if (!recipe?.energyRequirement || !energy || !receipt.receiptId.startsWith(expectedPrefix) ||
                receipt.payloadHash !== expectedHash || receipt.recordedAtSequence <= order.startEventSequence ||
                receipt.recordedAtSequence > currentCursor) return [];
            return [{ eventId: receipt.receiptId, kind: energy.kind, eu: energy.euPerWork,
              sequence: receipt.recordedAtSequence, workOrderId: order.workOrderId }];
          }).sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId)) : [];
          if (action.action === "complete") {
            const proof = energyReceipts.at(-1)?.eventId ?? null;
            if (action.energyEventId !== proof) return { reason: "invalid_event", duplicate: false };
          }
          const applied = applyWildlifeProcessingAction({
            lifeCorpseLedger: this.state.lifeCorpseLedger,
            economy: this.state.economy,
          }, action, {
            currentLastEventSequence: currentCursor,
            currentWorldTick: authoritativeTick,
            eligibleWorldEvents,
            energyReceipts,
          });
          if (!applied.committed) return {
            reason: applied.duplicate ? "duplicate_receipt" :
              applied.reason === "revision_conflict" ? "economy_revision_conflict" : "invalid_event",
            duplicate: applied.duplicate,
          };
          const processingReceipt = applied.receipt;
          if (this.state.receiptIndex[processingReceipt.receiptId]) {
            return { reason: "receipt_payload_conflict", duplicate: false };
          }
          const receipt: SessionReceiptIndexEntry = {
            receiptId: processingReceipt.receiptId, domain: "wildlife",
            payloadHash: wildlifeProcessingPayloadHash(action), recordedByEventId: event.eventId,
            recordedAtSequence: event.sequence,
          };
          const survival = workSeconds === 0 ? this.state.survival : {
            ...this.state.survival, worldTicks: authoritativeTick, revision: this.state.survival.revision + 1,
          };
          return { state: withAppliedEvent(this.state, event, {
            lifeCorpseLedger: applied.aggregate.lifeCorpseLedger,
            economy: applied.aggregate.economy,
            survival,
            receiptIndex: { ...this.state.receiptIndex, [receipt.receiptId]: receipt,
              [interactionUseId!]: { receiptId: interactionUseId!, domain: "wildlife", payloadHash: `interaction-use:${interactionReceiptId}:${action.transactionId}`,
                recordedByEventId: event.eventId, recordedAtSequence: event.sequence } },
          }) };
        } catch {
          return { reason: "invalid_event", duplicate: false };
        }
      }
      case "attack_qualification_interaction_committed": {
        const payload = event.payload;
        const point = RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.interactionPointTiles;
        const expectedPx = { x: point[0] * 16, y: point[1] * 16 };
        const distance = Math.hypot(payload.playerPositionPx.x - expectedPx.x, payload.playerPositionPx.y - expectedPx.y);
        if (!isNonEmptyString(payload.operationId) ||
            payload.sceneId !== RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.authoritySceneId ||
            payload.targetId !== RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.targetId ||
            payload.interactionId !== RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.interactionId ||
            this.state.world.currentSceneId !== payload.sceneId || payload.expectedWorldRevision !== this.state.world.revision ||
            !Number.isFinite(payload.playerPositionPx.x) || !Number.isFinite(payload.playerPositionPx.y) || distance > 16) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = `attack-qualification-interaction:${payload.operationId}`;
        const payloadHash = sha256Canonical(payload as unknown as JsonValue);
        const prior = this.state.receiptIndex[receiptId];
        if (prior) return prior.payloadHash === payloadHash ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "learning", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        return { state: withAppliedEvent(this.state, event, {
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "learning_evidence_committed": {
        let evidence: LearningEvidenceEvent;
        let qualification = false;
        let p0Curriculum = false;
        let core120Curriculum = false;
        if (event.payload.core120CurriculumActionId !== undefined) {
          const payload = event.payload;
          if (this.state.world.currentSceneId !== RUNTIME_CORE120_CURRICULUM_MANIFEST.recoveryStation.sceneId ||
              !Number.isSafeInteger(payload.core120EvidenceOrdinal) || payload.core120EvidenceOrdinal < 0 ||
              !isRecord(payload.evidence) || payload.evidence.committedAtSessionSequence !== undefined) {
            return { reason: "invalid_event", duplicate: false };
          }
          const p0Complete = RUNTIME_P0_CURRICULUM_MANIFEST.scope.wordIds.every((wordId) => {
            const progress = this.state.learning.words[wordId];
            return p0TargetReached(RUNTIME_P0_CURRICULUM_MANIFEST.words[wordId].targetState,
              progress?.learningState ?? null, progress?.attunementState);
          });
          if (!p0Complete) return { reason: "invalid_event", duplicate: false };
          if (!core120LearningActionPrerequisitesSatisfied(
            RUNTIME_CORE120_CURRICULUM_MANIFEST,
            this.state.learning,
            this.sessionId,
            payload.core120CurriculumActionId,
          )) return { reason: "invalid_event", duplicate: false };
          let expected: readonly LearningEvidenceEvent[] | undefined;
          try {
            expected = materializeCore120LearningEvidenceVariants(
              RUNTIME_CORE120_CURRICULUM_MANIFEST, this.sessionId,
              payload.core120CurriculumActionId,
            ).find((variant) => {
              const candidate = variant[payload.core120EvidenceOrdinal];
              return candidate !== undefined && core120EvidenceMatches(candidate, payload.evidence);
            });
          } catch { return { reason: "invalid_event", duplicate: false }; }
          if (expected === undefined) return { reason: "invalid_event", duplicate: false };
          const expectedEvidence = expected[payload.core120EvidenceOrdinal];
          if (!expectedEvidence || expected.length <= payload.core120EvidenceOrdinal ||
              !core120EvidenceMatches(expectedEvidence, payload.evidence)) {
            return { reason: "invalid_event", duplicate: false };
          }
          const observedEvidence = this.state.learning.words[expectedEvidence.wordId]?.evidence ?? [];
          if (expected.slice(0, payload.core120EvidenceOrdinal).some((priorEvidence) =>
            !observedEvidence.some((entry) => entry.eventId === priorEvidence.eventId))) {
            return { reason: "invalid_event", duplicate: false };
          }
          evidence = { ...payload.evidence, committedAtSessionSequence: event.sequence } as LearningEvidenceEvent;
          core120Curriculum = true;
        } else if (event.payload.p0CurriculumActionId !== undefined) {
          const payload = event.payload;
          if (this.state.world.currentSceneId !== RUNTIME_P0_CURRICULUM_MANIFEST.recoveryStation.sceneId ||
              !Number.isSafeInteger(payload.p0EvidenceOrdinal) || payload.p0EvidenceOrdinal < 0 ||
              !isRecord(payload.evidence) || payload.evidence.committedAtSessionSequence !== undefined) {
            return { reason: "invalid_event", duplicate: false };
          }
          let expected: readonly LearningEvidenceEvent[];
          try { expected = materializeP0LearningEvidence(RUNTIME_P0_CURRICULUM_MANIFEST, this.sessionId, payload.p0CurriculumActionId); }
          catch { return { reason: "invalid_event", duplicate: false }; }
          const expectedEvidence = expected[payload.p0EvidenceOrdinal];
          if (!expectedEvidence || expected.length <= payload.p0EvidenceOrdinal ||
              !p0EvidenceMatches(expectedEvidence, payload.evidence)) return { reason: "invalid_event", duplicate: false };
          evidence = { ...payload.evidence, committedAtSessionSequence: event.sequence } as LearningEvidenceEvent;
          p0Curriculum = true;
        } else if (event.payload.qualificationActionId !== undefined) {
          const payload = event.payload;
          if (!isNonEmptyString(payload.transactionId)) return { reason: "invalid_event", duplicate: false };
          const action = RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.actions.find((candidate) =>
            candidate.actionId === payload.qualificationActionId);
          const unrelatedAction = RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.unrelatedSemanticWorldActions.find(
            (candidate) => candidate.actionId === payload.qualificationActionId);
          if (unrelatedAction) {
            if (this.state.world.currentSceneId !== unrelatedAction.authoritySceneId ||
                payload.unrelatedWorldEventIds !== undefined) return { reason: "invalid_event", duplicate: false };
            const interactionReceipt = payload.interactionReceiptId === undefined ? undefined :
              this.state.receiptIndex[payload.interactionReceiptId];
            const interactionEvent = interactionReceipt === undefined ? undefined :
              this.ledger.find((candidate) => candidate.eventId === interactionReceipt.recordedByEventId);
            if (!interactionReceipt || interactionEvent?.type !== "attack_qualification_interaction_committed" ||
                interactionReceipt.recordedAtSequence !== interactionEvent.sequence ||
                this.state.receiptIndex[`attack-qualification-interaction-use:${payload.interactionReceiptId}`]) {
              return { reason: "invalid_event", duplicate: false };
            }
            const receiptId = `attack-qualification-world:${unrelatedAction.actionId}`;
            const payloadHash = sha256Canonical({ actionId: unrelatedAction.actionId,
              taskId: unrelatedAction.authorityTaskId, outcome: unrelatedAction.outcome } as JsonValue);
            const priorReceipt = this.state.receiptIndex[receiptId];
            if (priorReceipt) return priorReceipt.payloadHash === payloadHash
              ? { reason: "duplicate_receipt", duplicate: true }
              : { reason: "receipt_payload_conflict", duplicate: false };
            const receipt: SessionReceiptIndexEntry = { receiptId, domain: "world", payloadHash,
              recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
            const useId = `attack-qualification-interaction-use:${payload.interactionReceiptId}`;
            return { state: withAppliedEvent(this.state, event, {
              receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt,
                [useId]: { receiptId: useId, domain: "learning", payloadHash: `interaction-use:${unrelatedAction.actionId}`,
                  recordedByEventId: event.eventId, recordedAtSequence: event.sequence } },
            }) };
          }
          if (!action || this.state.world.currentSceneId !== action.authoritySceneId) {
            return { reason: "invalid_event", duplicate: false };
          }
           if (action.authoritySceneId === RUNTIME_SAFE_RANGE_MANIFEST.parallelCalibration.authoritySceneId) {
            const interactionReceipt = payload.interactionReceiptId === undefined ? undefined :
              this.state.receiptIndex[payload.interactionReceiptId];
            const interactionEvent = interactionReceipt === undefined ? undefined :
              this.ledger.find((candidate) => candidate.eventId === interactionReceipt.recordedByEventId);
            if (!interactionReceipt || interactionEvent?.type !== "attack_qualification_interaction_committed" ||
                interactionReceipt.recordedAtSequence !== interactionEvent.sequence ||
                this.state.receiptIndex[`attack-qualification-interaction-use:${payload.interactionReceiptId}`]) {
              return { reason: "invalid_event", duplicate: false };
            }
          }
          if (action.existingDomainEventMappingOnly) {
            if (!action.actionId.startsWith("return_flow.wawa.inert_h") ||
                this.state.quests.ch01_return_flow?.stageId !== "completed" ||
                !isNonEmptyString(payload.sourceEvidenceEventId)) return { reason: "invalid_event", duplicate: false };
            const source = this.ledger.find((candidate) => candidate.eventId === payload.sourceEvidenceEventId);
            if (source?.type !== "learning_evidence_committed" || source.payload.evidence === undefined ||
                source.payload.evidence.eventType !== "grounding_trial_resolved" || source.payload.evidence.wordId !== "wawa" ||
                source.payload.evidence.sourceObjectClass !== "inert_return_flow_mechanism" ||
                source.payload.evidence.promptLevel !== (action.actionId.endsWith("_h0") ? 0 : 1)) {
              return { reason: "invalid_event", duplicate: false };
            }
            const sourceReceipt = this.state.receiptIndex[`learning-evidence:${source.payload.evidence.idempotencyKey}`];
            if (sourceReceipt?.recordedByEventId !== source.eventId || sourceReceipt.recordedAtSequence !== source.sequence) {
              return { reason: "invalid_event", duplicate: false };
            }
            const receiptId = `attack-qualification-evidence-binding:${action.actionId}:${source.eventId}`;
            const payloadHash = sha256Canonical({ actionId: action.actionId, sourceEventId: source.eventId,
              sourceReceiptId: sourceReceipt.receiptId } as JsonValue);
            const prior = this.state.receiptIndex[receiptId];
            if (prior) return prior.payloadHash === payloadHash ? { reason: "duplicate_receipt", duplicate: true }
              : { reason: "receipt_payload_conflict", duplicate: false };
            const receipt: SessionReceiptIndexEntry = { receiptId, domain: "learning", payloadHash,
              recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
            return { state: withAppliedEvent(this.state, event, {
              receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
            }) };
          }
          const canonicalAstWordIds = action.canonicalAst === null
            ? action.concept === null ? [] : [action.concept]
            : Object.values(action.canonicalAst).map((token) => token === "o" ? "word.o" : token);
          const wordId = action.concept?.replace(/^word\./, "") ??
            (action.evidenceType === "noncombat_action" || action.evidenceType === "repair" ? "tawa" : "telo");
          const variantHash = sha256Canonical({ sourceDigest: RUNTIME_SAFE_RANGE_MANIFEST.sourceDigest,
            actionId: action.actionId, sceneId: action.authoritySceneId, taskId: action.authorityTaskId,
            taskFamilyId: action.taskFamilyId, canonicalAstWordIds, outcome: action.outcome } as JsonValue);
          let unrelatedWorldEventIds: readonly string[] = [];
          if (action.evidenceType === "delayed_retrieval") {
            const ids = payload.unrelatedWorldEventIds ?? [];
            if (ids.length !== action.requiredUnrelatedActionIds.length) return { reason: "invalid_event", duplicate: false };
            const subjects = ids.map((id) => this.ledger.find((candidate) => candidate.eventId === id));
            if (subjects.some((subject) => subject?.type !== "learning_evidence_committed" ||
                subject.payload.qualificationActionId === undefined)) return { reason: "invalid_event", duplicate: false };
            const subjectActions = subjects.map((subject) =>
              (subject as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>).payload.qualificationActionId);
            if (!same(subjectActions, action.requiredUnrelatedActionIds)) return { reason: "invalid_event", duplicate: false };
            const receiptsValid = subjects.every((subject, index) => {
              const expectedActionId = action.requiredUnrelatedActionIds[index]!;
              const receipt = this.state.receiptIndex[`attack-qualification-world:${expectedActionId}`];
              return receipt?.recordedByEventId === subject!.eventId && receipt.recordedAtSequence === subject!.sequence;
            });
            if (!receiptsValid) return { reason: "invalid_event", duplicate: false };
            unrelatedWorldEventIds = ids;
          } else if (payload.unrelatedWorldEventIds !== undefined) return { reason: "invalid_event", duplicate: false };
          const base = {
            eventId: `attack-qualification.evidence.${action.actionId}.${variantHash}`,
            playerSaveId: this.sessionId, wordId,
            idempotencyKey: `attack-qualification:${this.sessionId}:${action.actionId}:${variantHash}`,
            taskId: action.authorityTaskId, taskFamilyId: action.taskFamilyId, variantHash,
            normalizedEnvironmentFingerprint: `${action.authoritySceneId}:${action.outcome}`,
            promptLevel: action.promptLevel, interpretationStatus: "executed_legal" as const,
            worldOutcomeContribution: true, worldOutcomeKind: action.actionId.startsWith("return_flow.wawa.inert_h")
              ? "inert_force_observation" : action.outcome,
            toolBypass: false, answerVisible: false, fixedSlotOnly: false, colorOnlyCue: false,
            semanticFacetsDemonstrated: [action.prerequisiteNodeId], canonicalAstWordIds,
            ...(action.canonicalAstShape === null ? {} : { canonicalAstShape: action.canonicalAstShape }),
            committedAtSessionSequence: event.sequence,
          };
          evidence = action.evidenceType === "active_retrieval"
            ? { ...base, eventType: "active_retrieval_submitted" }
            : action.evidenceType === "noncombat_action"
              ? { ...base, eventType: "noncombat_action_completed" }
              : action.evidenceType === "noncombat_intensity"
                ? { ...base, wordId: "wawa", eventType: "grounding_trial_resolved",
                    sourceObjectClass: "inert_return_flow_mechanism", canonicalAstWordIds: ["word.wawa"] }
                : action.evidenceType === "repair"
                  ? { ...base, eventType: "repair_completed", promptLevelAfterRepair: action.promptLevel,
                      targetGraphId: RUNTIME_SAFE_RANGE_MANIFEST.prerequisiteGraph.graphId,
                      repairedNodeId: action.eligibleTargetNodeIds[0], canonicalAstWordIds: ["word.tawa"] }
                  : { ...base, eventType: "delayed_retrieval_completed", unrelatedWorldEventIds,
                      targetGraphId: RUNTIME_SAFE_RANGE_MANIFEST.prerequisiteGraph.graphId,
                      retrievalTarget: RUNTIME_SAFE_RANGE_MANIFEST.prerequisiteGraph.nodes.delayed.retrievalTarget };
          qualification = true;
        } else {
          if (!isRecord(event.payload.evidence) || event.payload.evidence.committedAtSessionSequence !== undefined) {
            return { reason: "invalid_event", duplicate: false };
          }
          evidence = { ...event.payload.evidence, committedAtSessionSequence: event.sequence } as LearningEvidenceEvent;
        }
        let reduced;
        try { reduced = reduceLearningEvidence(this.state.learning, evidence); }
        catch { return { reason: "invalid_event", duplicate: false }; }
        const receiptId = `${qualification ? "attack-qualification-evidence" :
          core120Curriculum ? "core120-learning-evidence" :
            p0Curriculum ? "p0-learning-evidence" : "learning-evidence"}:${evidence.idempotencyKey}`;
        const payloadHash = sha256Canonical(evidence as unknown as JsonValue);
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) return priorReceipt.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        if (!reduced.applied) return { reason: reduced.duplicate ? "duplicate_receipt" : "invalid_event",
          duplicate: reduced.duplicate };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "learning", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        const interactionUse = qualification && event.payload.qualificationActionId !== undefined &&
          event.payload.interactionReceiptId !== undefined
          ? { [`attack-qualification-interaction-use:${event.payload.interactionReceiptId}`]: {
              receiptId: `attack-qualification-interaction-use:${event.payload.interactionReceiptId}`,
              domain: "learning" as const, payloadHash: `interaction-use:${event.payload.qualificationActionId}`,
              recordedByEventId: event.eventId, recordedAtSequence: event.sequence } } : {};
        return { state: withAppliedEvent(this.state, event, {
          learning: clone(reduced.snapshot),
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt, ...interactionUse },
        }) };
      }
      case "core120_learning_action_committed": {
        const { actionId, receiptId, payloadHash, authority } = event.payload;
        const legacy = authority === undefined;
        const authorityValid = legacy
          ? this.state.world.currentSceneId === RUNTIME_CORE120_CURRICULUM_MANIFEST.recoveryStation.sceneId &&
            core120LearningActionPayloadHashes(actionId).includes(payloadHash)
          : core120LearningAuthorityMatchesAction(actionId, authority) &&
            authority.sceneId === this.state.world.currentSceneId &&
            authority.expectedWorldRevision === this.state.world.revision &&
            core120LearningActionPayloadHashes(actionId, authority).includes(payloadHash) &&
            (authority.mode !== "recovery_archive" ||
              this.ledger.some((candidate) => candidate.type === "scene_entered" &&
                candidate.payload.sceneId === authority.recoveredSceneId));
        if (!authorityValid || receiptId !== core120LearningActionReceiptId(this.sessionId, actionId)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const prior = this.state.receiptIndex[receiptId];
        if (prior) return prior.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        let learning = this.state.learning;
        const legacyEvidenceAlreadyPresent = core120LearningActionEvidencePresent(
          RUNTIME_CORE120_CURRICULUM_MANIFEST, learning, this.sessionId, actionId,
        );
        if (!legacyEvidenceAlreadyPresent) {
          if (!core120LearningActionPrerequisitesSatisfied(
            RUNTIME_CORE120_CURRICULUM_MANIFEST, learning, this.sessionId, actionId,
          )) return { reason: "invalid_event", duplicate: false };
          let canonicalEvidence: readonly LearningEvidenceEvent[];
          try {
            canonicalEvidence = materializeCore120LearningEvidence(
              RUNTIME_CORE120_CURRICULUM_MANIFEST, this.sessionId, actionId,
            );
          } catch { return { reason: "invalid_event", duplicate: false }; }
          for (const evidenceDraft of canonicalEvidence) {
            const evidence = { ...evidenceDraft, committedAtSessionSequence: event.sequence } as LearningEvidenceEvent;
            const reduced = reduceLearningEvidence(learning, evidence);
            if (reduced.applied) learning = reduced.snapshot;
            else if (!(reduced.duplicate && reduced.reason === "duplicate_event")) {
              return { reason: "invalid_event", duplicate: false };
            }
          }
          if (!core120LearningActionEvidencePresent(
            RUNTIME_CORE120_CURRICULUM_MANIFEST, learning, this.sessionId, actionId,
          )) return { reason: "invalid_event", duplicate: false };
        }
        const receipt: SessionReceiptIndexEntry = {
          receiptId,
          domain: "learning",
          payloadHash,
          recordedByEventId: event.eventId,
          recordedAtSequence: event.sequence,
        };
        return { state: withAppliedEvent(this.state, event, {
          learning: clone(learning),
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "attack_capacity_calibrated": {
        const { transactionId, writerEvent, contract } = event.payload;
        if (!isNonEmptyString(transactionId) || writerEvent !== ATTACK_CALIBRATION_WRITER_EVENT ||
            !same(contract, RUNTIME_ATTACK_QUALIFICATION_CONTRACT)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = `attack-calibration:${transactionId}`;
        const payloadHash = sha256Canonical(event.payload as unknown as JsonValue);
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) return priorReceipt.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        if (this.state.capabilities.appliedMilestones[ATTACK_CALIBRATION_MILESTONE_ID]) {
          return { reason: "milestone_payload_conflict", duplicate: false };
        }
        const worldEvents: CommittedWorldEventReference[] = this.ledger.flatMap((candidate): CommittedWorldEventReference[] => {
          if (candidate.type === "quest_stage_set" || candidate.type === "world_flag_set" ||
              candidate.type === "scene_entered") {
            return [{ eventId: candidate.eventId, sequence: candidate.sequence, type: candidate.type }];
          }
          if (candidate.type === "learning_evidence_committed" &&
              candidate.payload.qualificationActionId?.startsWith("settlement.calibration.unrelated_") === true) {
            const receipt = this.state.receiptIndex[`attack-qualification-world:${candidate.payload.qualificationActionId}`];
            return receipt?.recordedByEventId === candidate.eventId && receipt.recordedAtSequence === candidate.sequence
              ? [{ eventId: candidate.eventId, sequence: candidate.sequence, type: candidate.type }]
              : [];
          }
          return [];
        });
        const committedEvidence: CommittedLearningEvidenceReference[] = this.ledger.flatMap((candidate) => {
          if (candidate.type !== "learning_evidence_committed" ||
              candidate.payload.qualificationActionId === undefined ||
              candidate.payload.qualificationActionId.startsWith("settlement.calibration.unrelated_")) return [];
          if (candidate.payload.qualificationActionId.startsWith("return_flow.wawa.inert_h")) {
            if (!("sourceEvidenceEventId" in candidate.payload) ||
                !isNonEmptyString(candidate.payload.sourceEvidenceEventId)) return [];
            const sourceEvidenceEventId = candidate.payload.sourceEvidenceEventId;
            const source = this.ledger.find((subject) => subject.eventId === sourceEvidenceEventId);
            if (source?.type !== "learning_evidence_committed" || source.payload.evidence === undefined) return [];
            const entry = this.state.learning.words.wawa?.evidence.find((item) =>
              item.eventId === source.payload.evidence!.eventId && item.committedAtSessionSequence === source.sequence);
            const binding = this.state.receiptIndex[
              `attack-qualification-evidence-binding:${candidate.payload.qualificationActionId}:${source.eventId}`];
            return entry && binding?.recordedByEventId === candidate.eventId &&
              binding.recordedAtSequence === candidate.sequence
              ? [{ evidenceEventId: entry.eventId, sessionSequence: source.sequence }] : [];
          }
          const entries = Object.values(this.state.learning.words).flatMap((word) => word.evidence)
            .filter((entry) => entry.committedAtSessionSequence === candidate.sequence);
          return entries.flatMap((entry) => {
            const expectedReceiptId = `attack-qualification-evidence:attack-qualification:${this.sessionId}:${candidate.payload.qualificationActionId}:${entry.variantHash}`;
            const receipt = this.state.receiptIndex[expectedReceiptId];
            return receipt?.recordedByEventId === candidate.eventId && receipt.recordedAtSequence === candidate.sequence
              ? [{ evidenceEventId: entry.eventId, sessionSequence: candidate.sequence }]
              : [];
          });
        });
        const evaluation = evaluateAttackQualification(contract, this.state.learning, worldEvents, committedEvidence);
        if (!evaluation.qualified) return { reason: "invalid_event", duplicate: false };
        const next = contract.resultingState;
        if (next.expressionCapacityWords < this.state.capabilities.expressionCapacityWords ||
            next.focusSlots < this.state.capabilities.focusSlots || next.maxMp < this.state.mp.maxMp) {
          return { reason: "state_regression", duplicate: false };
        }
        const milestone: SessionCapabilityMilestoneRecord = {
          milestoneId: ATTACK_CALIBRATION_MILESTONE_ID,
          writerEvent,
          sourcePath: contract.sourcePath,
          sourceDigest: contract.sourceDigest,
          contractRevision: contract.contractRevision,
          ...next,
          committedByEventId: event.eventId,
          committedAtSequence: event.sequence,
        };
        const flag: SessionWorldFlag = { flagId: ATTACK_CAPACITY_CALIBRATION_FLAG_ID, value: true,
          scope: "global", areaId: null, areaEpoch: null };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "learning", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        return { state: withAppliedEvent(this.state, event, {
          mp: { currentMp: this.state.mp.currentMp, maxMp: next.maxMp,
            worldVersion: this.state.mp.worldVersion + 1 },
          capabilities: { expressionCapacityWords: next.expressionCapacityWords, focusSlots: next.focusSlots,
            revision: this.state.capabilities.revision + 1,
            appliedMilestones: { ...this.state.capabilities.appliedMilestones,
              [ATTACK_CALIBRATION_MILESTONE_ID]: milestone } },
          world: { ...this.state.world, revision: this.state.world.revision + 1,
            flags: { ...this.state.world.flags, [worldFlagKey(flag)]: flag } },
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "prologue_return_observation_committed": {
        const { transactionId, writerEvent } = event.payload;
        if (!isNonEmptyString(transactionId) || writerEvent !== "return_observation_committed" ||
            this.state.world.currentSceneId !== "scene.valley.settlement" ||
            this.state.quests.ch01_return_flow?.stageId !== "completed") {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = `prologue-return-observation:${transactionId}`;
        const payloadHash = sha256Canonical(event.payload as unknown as JsonValue);
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) return priorReceipt.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        const flag: SessionWorldFlag = { flagId: PROLOGUE_RETURN_OBSERVED_FLAG_ID, value: true,
          scope: "global", areaId: null, areaEpoch: null };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "world", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        return { state: withAppliedEvent(this.state, event, {
          world: { ...this.state.world, revision: this.state.world.revision + 1,
            flags: { ...this.state.world.flags, [worldFlagKey(flag)]: flag } },
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "attack_prerequisites_verified": {
        const { transactionId, writerEvent, contractId } = event.payload;
        if (!isNonEmptyString(transactionId) || writerEvent !== ATTACK_PERMISSION_WRITER_EVENT ||
            contractId !== "attack_qualification.v0.1") return { reason: "invalid_event", duplicate: false };
        const calibrationEvent = [...this.ledger].reverse().find((candidate) => candidate.type === "attack_capacity_calibrated");
        const observationEvent = [...this.ledger].reverse().find((candidate) => candidate.type === "prologue_return_observation_committed");
        if (!calibrationEvent || !observationEvent) return { reason: "invalid_event", duplicate: false };
        const calibrationReceipt = this.state.receiptIndex[`attack-calibration:${calibrationEvent.payload.transactionId}`];
        const observationReceipt = this.state.receiptIndex[`prologue-return-observation:${observationEvent.payload.transactionId}`];
        if (calibrationReceipt?.recordedByEventId !== calibrationEvent.eventId ||
            observationReceipt?.recordedByEventId !== observationEvent.eventId ||
            this.state.world.flags[`global:${ATTACK_CAPACITY_CALIBRATION_FLAG_ID}`]?.value !== true ||
            this.state.world.flags[`global:${PROLOGUE_RETURN_OBSERVED_FLAG_ID}`]?.value !== true) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptId = `attack-permission:${transactionId}`;
        const payloadHash = sha256Canonical(event.payload as unknown as JsonValue);
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) return priorReceipt.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        const permission: SessionWorldFlag = { flagId: RANGE_TRIAL_PERMISSION_FLAG_ID, value: true,
          scope: "global", areaId: null, areaEpoch: null };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "world", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        return { state: withAppliedEvent(this.state, event, {
          world: { ...this.state.world, revision: this.state.world.revision + 1,
            flags: { ...this.state.world.flags, [worldFlagKey(permission)]: permission } },
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "safe_range_runtime_frame_committed": {
        const payload = event.payload;
        if (event.eventId !== `session.safe-range.frame.${payload.transactionId}` ||
            this.state.world.currentSceneId !== RUNTIME_SAFE_RANGE_MANIFEST.scene.sceneId ||
            payload.sessionWorldRevision !== this.state.world.revision ||
            payload.mpWorldVersion !== this.state.mp.worldVersion ||
            !validSafeRangeRuntimeFramePayload(payload)) {
          return { reason: "invalid_event", duplicate: false };
        }
        return { state: withAppliedEvent(this.state, event, {}) };
      }
      case "safe_range_transfer_passed": {
        const payload = event.payload;
        const frame = this.ledger.at(-1);
        if (payload.writerEvent !== "safe_range_transfer_passed" || !isNonEmptyString(payload.transactionId) ||
            !isNonEmptyString(payload.targetId) || !isNonEmptyString(payload.normalizedVariantHash) ||
            (payload.promptLevel !== 0 && payload.promptLevel !== 1) ||
            this.state.world.currentSceneId !== RUNTIME_SAFE_RANGE_MANIFEST.scene.sceneId ||
            this.state.world.flags[`global:${RANGE_TRIAL_PERMISSION_FLAG_ID}`]?.value !== true ||
            payload.expectedCurrentMp !== this.state.mp.currentMp ||
            payload.expectedMpWorldVersion !== this.state.mp.worldVersion ||
            !isRecord(payload.authorityProof) || !isNonEmptyString(payload.authorityProof.requestHash) ||
            !isNonNegativeSafeInteger(payload.authorityProof.runtimeRevision) ||
            frame?.type !== "safe_range_runtime_frame_committed" || frame.sequence + 1 !== event.sequence ||
            frame.eventId !== payload.authorityProof.frameEventId ||
            frame.payload.transactionId !== payload.transactionId || frame.payload.actionKind !== "transfer" ||
            frame.payload.targetId !== payload.targetClass ||
            frame.payload.requestHash !== payload.authorityProof.requestHash ||
            frame.payload.frameHash !== payload.authorityProof.frameHash ||
            frame.payload.manifestDigest !== payload.authorityProof.manifestDigest ||
            frame.payload.runtimeRevision !== payload.authorityProof.runtimeRevision ||
            frame.payload.sessionWorldRevision !== payload.authorityProof.sessionWorldRevision ||
            frame.payload.mpWorldVersion !== payload.authorityProof.mpWorldVersion ||
            payload.authorityProof.sessionWorldRevision !== this.state.world.revision ||
            payload.authorityProof.mpWorldVersion !== this.state.mp.worldVersion) {
          return { reason: "invalid_event", duplicate: false };
        }
        const profile = RUNTIME_SAFE_RANGE_MANIFEST.targetPhysics.profiles.find((candidate) =>
          candidate.targetClass === payload.targetClass);
        if (!profile || payload.targetId !== profile.targetClass) return { reason: "invalid_event", duplicate: false };
        const expectedVariantHash = sha256Canonical({
          familyId: RUNTIME_SAFE_RANGE_MANIFEST.familyId,
          targetClass: profile.targetClass,
          targetId: payload.targetId,
          normalizedEnvironmentFingerprint: `${RUNTIME_SAFE_RANGE_MANIFEST.scene.sceneId}:${profile.targetClass}`,
          canonicalAst: RUNTIME_SAFE_RANGE_MANIFEST.canonicalAst,
        } as unknown as JsonValue);
        if (payload.normalizedVariantHash !== expectedVariantHash) return { reason: "invalid_event", duplicate: false };
        const mpCharge = payload.waterSource === "bound_existing"
          ? RUNTIME_SAFE_RANGE_MANIFEST.signature.mp.boundExistingWater
          : payload.waterSource === "manifest_default"
            ? RUNTIME_SAFE_RANGE_MANIFEST.signature.mp.manifestDefaultWater : -1;
        if (mpCharge < 0 || this.state.mp.currentMp < mpCharge) return { reason: "invalid_event", duplicate: false };
        const priorTargetEvent = [...this.ledger].reverse().find((candidate) =>
          candidate.type === "safe_range_transfer_passed" && candidate.payload.targetClass === payload.targetClass);
        const targetHpBefore = priorTargetEvent?.type === "safe_range_transfer_passed"
          ? priorTargetEvent.payload.physicsResult.targetHpAfter : profile.initialHp;
        const paid = RUNTIME_SAFE_RANGE_MANIFEST.signature.output.paidKineticBudgetEu;
        const transferred = Math.min(paid, paid * profile.kineticCouplingRatio);
        const damage = Math.floor(Math.max(0, transferred - profile.targetAbsorptionEu) / 4);
        const expectedPhysics = { paidKineticBudgetEu: paid, transferredKineticEu: transferred,
          damageHp: damage, targetHpBefore, targetHpAfter: Math.max(0, targetHpBefore - damage),
          livingOverlap: false as const };
        if (!same(payload.physicsResult, expectedPhysics)) return { reason: "invalid_event", duplicate: false };
        const receiptId = `safe-range-transfer:${payload.targetClass}:${payload.normalizedVariantHash}`;
        const payloadHash = sha256Canonical(payload as unknown as JsonValue);
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) return priorReceipt.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        const evidence: LearningEvidenceEvent = {
          eventId: `safe-range.learning.${payload.transactionId}`,
          eventType: "grounding_trial_resolved",
          playerSaveId: this.sessionId,
          wordId: "telo",
          idempotencyKey: `safe-range:${payload.transactionId}`,
          taskId: RUNTIME_SAFE_RANGE_MANIFEST.taskId,
          taskFamilyId: RUNTIME_SAFE_RANGE_MANIFEST.familyId,
          variantHash: payload.normalizedVariantHash,
          normalizedEnvironmentFingerprint: `safe-range:${payload.targetClass}`,
          promptLevel: payload.promptLevel,
          interpretationStatus: "executed_legal",
          worldOutcomeContribution: true,
          worldOutcomeKind: "safe_range_inert_transfer",
          toolBypass: false, answerVisible: false, fixedSlotOnly: false, colorOnlyCue: false,
          semanticFacetsDemonstrated: ["controlled_force_transfer"],
          canonicalAstWordIds: ["word.telo", "word.tawa", "word.wawa"],
          canonicalAstShape: "subject_o_predicate",
          committedAtSessionSequence: event.sequence,
        };
        const learning = reduceLearningEvidence(this.state.learning, evidence);
        if (!learning.applied) return { reason: "invalid_event", duplicate: false };
        const available: SessionWorldFlag = { flagId: FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID, value: true,
          scope: "global", areaId: null, areaEpoch: null };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "learning", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        return { state: withAppliedEvent(this.state, event, {
          mp: { currentMp: this.state.mp.currentMp - mpCharge, maxMp: this.state.mp.maxMp,
            worldVersion: this.state.mp.worldVersion + 1 },
          learning: clone(learning.snapshot),
          world: { ...this.state.world, revision: this.state.world.revision + 1,
            flags: { ...this.state.world.flags, [worldFlagKey(available)]: available } },
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "safe_range_material_table_completed": {
        const payload = event.payload;
        const frame = this.ledger.at(-1);
        if (!isNonEmptyString(payload.transactionId) || payload.writerEvent !== "safe_range_material_table_completed" ||
            this.state.world.currentSceneId !== RUNTIME_SAFE_RANGE_MANIFEST.scene.sceneId ||
            !isRecord(payload.authorityProof) || !isNonEmptyString(payload.authorityProof.requestHash) ||
            !isNonNegativeSafeInteger(payload.authorityProof.runtimeRevision) ||
            payload.authorityProof.targetId !== RUNTIME_SAFE_RANGE_MANIFEST.progression.materialTable.tableTargetId ||
            frame?.type !== "safe_range_runtime_frame_committed" || frame.sequence + 1 !== event.sequence ||
            frame.eventId !== payload.authorityProof.frameEventId ||
            frame.payload.transactionId !== payload.transactionId || frame.payload.actionKind !== "material_table" ||
            frame.payload.targetId !== RUNTIME_SAFE_RANGE_MANIFEST.progression.materialTable.tableTargetId ||
            frame.payload.requestHash !== payload.authorityProof.requestHash ||
            frame.payload.frameHash !== payload.authorityProof.frameHash ||
            frame.payload.manifestDigest !== payload.authorityProof.manifestDigest ||
            frame.payload.runtimeRevision !== payload.authorityProof.runtimeRevision ||
            frame.payload.sessionWorldRevision !== payload.authorityProof.sessionWorldRevision ||
            frame.payload.mpWorldVersion !== payload.authorityProof.mpWorldVersion ||
            payload.authorityProof.sessionWorldRevision !== this.state.world.revision ||
            payload.authorityProof.mpWorldVersion !== this.state.mp.worldVersion) {
          return { reason: "invalid_event", duplicate: false };
        }
        const targetClasses = RUNTIME_SAFE_RANGE_MANIFEST.progression.materialTable.targetClasses;
        if (!targetClasses.every((targetClass) => this.ledger.some((subject) => {
          if (subject.type !== "safe_range_transfer_passed" || subject.payload.targetClass !== targetClass) return false;
          const receipt = this.state.receiptIndex[
            `safe-range-transfer:${subject.payload.targetClass}:${subject.payload.normalizedVariantHash}`];
          return receipt?.domain === "learning" && receipt.recordedByEventId === subject.eventId &&
            receipt.recordedAtSequence === subject.sequence &&
            receipt.payloadHash === sha256Canonical(subject.payload as unknown as JsonValue);
        }))) return { reason: "invalid_event", duplicate: false };
        const receiptId = `safe-range-material-table:${payload.transactionId}`;
        const payloadHash = sha256Canonical(payload as unknown as JsonValue);
        const priorReceipt = this.state.receiptIndex[receiptId];
        if (priorReceipt) return priorReceipt.payloadHash === payloadHash
          ? { reason: "duplicate_receipt", duplicate: true }
          : { reason: "receipt_payload_conflict", duplicate: false };
        const completed: SessionWorldFlag = { flagId: "first_attack_signature_completed", value: true,
          scope: "global", areaId: null, areaEpoch: null };
        const receipt: SessionReceiptIndexEntry = { receiptId, domain: "learning", payloadHash,
          recordedByEventId: event.eventId, recordedAtSequence: event.sequence };
        return { state: withAppliedEvent(this.state, event, {
          world: { ...this.state.world, revision: this.state.world.revision + 1,
            flags: { ...this.state.world.flags, [worldFlagKey(completed)]: completed } },
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
        }) };
      }
      case "scene_entered": {
        if (!isNonEmptyString(event.payload.sceneId)) return { reason: "invalid_event", duplicate: false };
        return {
          state: withAppliedEvent(this.state, event, {
            world: {
              ...this.state.world,
              currentSceneId: event.payload.sceneId,
              revision: this.state.world.revision + 1,
            },
          }),
        };
      }
      case "checkpoint_set": {
        if (!isCheckpointState(event.payload.checkpoint)) return { reason: "invalid_event", duplicate: false };
        if (event.payload.checkpoint.revision <= this.state.checkpoint.revision) {
          return { reason: "state_regression", duplicate: false };
        }
        return {
          state: withAppliedEvent(this.state, event, {
            checkpoint: clone(event.payload.checkpoint),
          }),
        };
      }
      case "world_flag_set": {
        const { flagId, value, scope } = event.payload;
        if (PROTECTED_ATTACK_WORLD_FLAGS.has(flagId) &&
            !this.legacyProtectedWorldFlagSequences.has(event.sequence)) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (!isNonEmptyString(flagId) || !isWorldFlagValue(value) ||
            (scope !== "global" && scope !== "region" && scope !== "area")) {
          return { reason: "invalid_event", duplicate: false };
        }
        const areaId = scope === "area" ? event.payload.areaId : undefined;
        const regionId = scope === "region" ? event.payload.regionId : undefined;
        if (scope === "area" && !isNonEmptyString(areaId)) return { reason: "invalid_event", duplicate: false };
        if (scope === "region" && !isNonEmptyString(regionId)) return { reason: "invalid_event", duplicate: false };
        if (scope !== "area" && event.payload.areaId !== undefined) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (scope !== "region" && event.payload.regionId !== undefined) {
          return { reason: "invalid_event", duplicate: false };
        }
        const flag: SessionWorldFlag = {
          flagId,
          value,
          scope,
          areaId: areaId ?? null,
          areaEpoch: areaId === undefined ? null : (this.state.world.areaEpochs[areaId] ?? 0),
          ...(regionId === undefined ? {} : { regionId }),
        };
        const areaEpochs = areaId !== undefined && this.state.world.areaEpochs[areaId] === undefined
          ? { ...this.state.world.areaEpochs, [areaId]: 0 }
          : this.state.world.areaEpochs;
        return {
          state: withAppliedEvent(this.state, event, {
            world: {
              ...this.state.world,
              revision: this.state.world.revision + 1,
              areaEpochs,
              flags: { ...this.state.world.flags, [worldFlagKey(flag)]: flag },
            },
          }),
        };
      }
      case "learning_replaced": {
        if (!this.legacyLearningReplacementSequences.has(event.sequence)) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (!isLearningSnapshot(event.payload.learning)) return { reason: "invalid_event", duplicate: false };
        if (event.payload.learning.revision < this.state.learning.revision) {
          return { reason: "state_regression", duplicate: false };
        }
        return { state: withAppliedEvent(this.state, event, { learning: clone(event.payload.learning) }) };
      }
      case "survival_replaced": {
        if (!isSurvivalSave(event.payload.survival)) return { reason: "invalid_event", duplicate: false };
        const next = event.payload.survival;
        if (next.revision < this.state.survival.revision || next.worldTicks < this.state.survival.worldTicks ||
            next.metabolismTicks < this.state.survival.metabolismTicks) {
          return { reason: "state_regression", duplicate: false };
        }
        return { state: withAppliedEvent(this.state, event, {
          survival: clone(next),
          economy: { ...this.state.economy, activeWorldTick: next.worldTicks },
        }) };
      }
      case "economy_replaced": {
        // Only exact sequences from a verified pre-domain replay are allowed. A live modern apply fails closed.
        if (!this.legacyEconomyReplacementSequences.has(event.sequence)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const candidate = event.payload.economy;
        if (!isSessionEconomyState(candidate) && !isEconomySummary(candidate)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const next = { ...normalizeSessionEconomy(candidate), activeWorldTick: this.state.survival.worldTicks };
        if (next.walletRevision < this.state.economy.walletRevision ||
            next.inventoryRevision < this.state.economy.inventoryRevision ||
            next.quoteSequence < this.state.economy.quoteSequence) {
          return { reason: "state_regression", duplicate: false };
        }
        return { state: withAppliedEvent(this.state, event, { economy: next }) };
      }
      case "economy_wallet_changed": {
        const payload = event.payload;
        if (!isNonNegativeSafeInteger(payload.expectedWalletRevision) ||
            !isNonNegativeSafeInteger(payload.nextWalletRevision) ||
            !Number.isSafeInteger(payload.coinDelta) || !isNonNegativeSafeInteger(payload.nextCoin) ||
            payload.nextWalletRevision !== payload.expectedWalletRevision + 1 ||
            payload.nextCoin !== this.state.economy.coin + payload.coinDelta) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (this.state.economy.walletRevision !== payload.expectedWalletRevision) {
          return { reason: "economy_revision_conflict", duplicate: false };
        }
        return {
          state: withAppliedEvent(this.state, event, {
            economy: {
              ...this.state.economy,
              coin: payload.nextCoin,
              walletRevision: payload.nextWalletRevision,
            },
          }),
        };
      }
      case "quote_sequence_advanced": {
        const { expectedQuoteSequence, nextQuoteSequence } = event.payload;
        if (!isNonNegativeSafeInteger(expectedQuoteSequence) || !isNonNegativeSafeInteger(nextQuoteSequence) ||
            nextQuoteSequence !== expectedQuoteSequence + 1) return { reason: "invalid_event", duplicate: false };
        if (this.state.economy.quoteSequence !== expectedQuoteSequence) {
          return { reason: "economy_revision_conflict", duplicate: false };
        }
        return {
          state: withAppliedEvent(this.state, event, {
            economy: { ...this.state.economy, quoteSequence: nextQuoteSequence },
          }),
        };
      }
      case "economy_lot_changed": {
        const payload = event.payload;
        if (!isNonEmptyString(payload.lotId) || !isNonNegativeSafeInteger(payload.expectedInventoryRevision) ||
            !isNonNegativeSafeInteger(payload.nextInventoryRevision) ||
            payload.nextInventoryRevision !== payload.expectedInventoryRevision + 1 ||
            !(payload.expectedOwnershipRevision === null || isNonNegativeSafeInteger(payload.expectedOwnershipRevision)) ||
            !(payload.expectedFreshnessRevision === null || isNonNegativeSafeInteger(payload.expectedFreshnessRevision)) ||
            !(payload.nextLot === null || (isTradeLotState(payload.nextLot) && payload.nextLot.lotId === payload.lotId))) {
          return { reason: "invalid_event", duplicate: false };
        }
        const current = this.state.economy.lots.find((lot) => lot.lotId === payload.lotId);
        if (this.state.economy.inventoryRevision !== payload.expectedInventoryRevision ||
            (current?.ownershipRevision ?? null) !== payload.expectedOwnershipRevision ||
            (current?.freshnessRevision ?? null) !== payload.expectedFreshnessRevision) {
          return { reason: "economy_revision_conflict", duplicate: false };
        }
        if (current && payload.nextLot &&
            (payload.nextLot.itemId !== current.itemId || !same(payload.nextLot.sourceLotIds, current.sourceLotIds) ||
              payload.nextLot.originKind !== current.originKind ||
              payload.nextLot.naturalFraction !== current.naturalFraction ||
              payload.nextLot.economyEligible !== current.economyEligible ||
              payload.nextLot.processingTransactionId !== current.processingTransactionId)) {
          return { reason: "invalid_event", duplicate: false };
        }
        if (payload.nextLot && payload.expectedOwnershipRevision !== null &&
            (payload.nextLot.ownershipRevision < payload.expectedOwnershipRevision ||
              payload.nextLot.freshnessRevision < payload.expectedFreshnessRevision!)) {
          return { reason: "state_regression", duplicate: false };
        }
        const lots = this.state.economy.lots.filter((lot) => lot.lotId !== payload.lotId);
        if (payload.nextLot) lots.push(clone(payload.nextLot));
        return {
          state: withAppliedEvent(this.state, event, {
            economy: { ...this.state.economy, inventoryRevision: payload.nextInventoryRevision, lots },
          }),
        };
      }
      case "merchant_state_changed": {
        const payload = event.payload;
        if (!isNonEmptyString(payload.merchantId) || !isNonNegativeSafeInteger(payload.expectedDemandRevision) ||
            !isMerchantStateValue(payload.nextState) || payload.nextState.merchantId !== payload.merchantId ||
            payload.nextState.demandRevision !== payload.expectedDemandRevision + 1) {
          return { reason: "invalid_event", duplicate: false };
        }
        const current = this.state.economy.merchantStates.find((state) => state.merchantId === payload.merchantId);
        if (!current || current.demandRevision !== payload.expectedDemandRevision) {
          return { reason: "economy_revision_conflict", duplicate: false };
        }
        return {
          state: withAppliedEvent(this.state, event, {
            economy: {
              ...this.state.economy,
              merchantStates: this.state.economy.merchantStates.map((state) =>
                state.merchantId === payload.merchantId ? clone(payload.nextState) : state),
            },
          }),
        };
      }
      case "trade_sale_committed": {
        const payload = event.payload;
        if (!isNonNegativeSafeInteger(payload.expectedWalletRevision) ||
            !isNonNegativeSafeInteger(payload.expectedInventoryRevision) ||
            !isNonNegativeSafeInteger(payload.expectedQuoteSequence) ||
            !isNonNegativeSafeInteger(payload.expectedLotOwnershipRevision) ||
            !isNonNegativeSafeInteger(payload.expectedLotFreshnessRevision) ||
            !isNonNegativeSafeInteger(payload.expectedMerchantDemandRevision) || !isNonNegativeSafeInteger(payload.nextCoin) ||
            payload.nextWalletRevision !== payload.expectedWalletRevision + 1 ||
            payload.nextInventoryRevision !== payload.expectedInventoryRevision + 1 ||
            !isTradeLotState(payload.nextLot) || !isMerchantStateValue(payload.nextMerchantState) ||
            !isTradeReceiptValue(payload.tradeReceipt) || !isNonEmptyString(payload.sessionReceiptPayloadHash) ||
            payload.tradeReceipt.lotId !== payload.nextLot.lotId ||
            payload.tradeReceipt.merchantId !== payload.nextMerchantState.merchantId ||
            payload.nextMerchantState.demandRevision !== payload.expectedMerchantDemandRevision + 1) {
          return { reason: "invalid_event", duplicate: false };
        }
        const priorTradeReceipt = this.state.economy.tradeReceipts.find((receipt) =>
          receipt.transactionId === payload.tradeReceipt.transactionId);
        const receiptId = payload.tradeReceipt.transactionId;
        const priorSessionReceipt = this.state.receiptIndex[receiptId];
        if (priorTradeReceipt || priorSessionReceipt) {
          return priorTradeReceipt && same(priorTradeReceipt, payload.tradeReceipt) && priorSessionReceipt?.domain === "trade" &&
            priorSessionReceipt.payloadHash === payload.sessionReceiptPayloadHash
            ? { reason: "duplicate_receipt", duplicate: true }
            : { reason: "receipt_payload_conflict", duplicate: false };
        }
        const currentLot = this.state.economy.lots.find((lot) => lot.lotId === payload.nextLot.lotId);
        const currentMerchant = this.state.economy.merchantStates.find((state) =>
          state.merchantId === payload.nextMerchantState.merchantId);
        if (this.state.economy.walletRevision !== payload.expectedWalletRevision ||
            this.state.economy.inventoryRevision !== payload.expectedInventoryRevision ||
            this.state.economy.quoteSequence !== payload.expectedQuoteSequence ||
            currentLot?.ownershipRevision !== payload.expectedLotOwnershipRevision ||
            currentLot.freshnessRevision !== payload.expectedLotFreshnessRevision ||
            currentMerchant?.demandRevision !== payload.expectedMerchantDemandRevision) {
          return { reason: "economy_revision_conflict", duplicate: false };
        }
        const { quantity: _currentQuantity, ownershipRevision: _currentOwnership, ...currentLotStable } = currentLot;
        const { quantity: _nextQuantity, ownershipRevision: _nextOwnership, ...nextLotStable } = payload.nextLot;
        const { demandRevision: _currentDemand, soldUnitsSinceRestock: _currentSold, ...currentMerchantStable } = currentMerchant;
        const { demandRevision: _nextDemand, soldUnitsSinceRestock: _nextSold, ...nextMerchantStable } = payload.nextMerchantState;
        const expectedReceiptHash = `trade:${payload.tradeReceipt.quoteId}:${payload.tradeReceipt.itemId}:` +
          `${payload.tradeReceipt.quantity}:${payload.tradeReceipt.coinDelta}`;
        if (payload.nextLot.ownershipRevision !== payload.expectedLotOwnershipRevision + 1 ||
            payload.nextLot.freshnessRevision !== payload.expectedLotFreshnessRevision ||
            payload.nextLot.quantity + payload.tradeReceipt.quantity !== currentLot.quantity ||
            payload.tradeReceipt.itemId !== currentLot.itemId || !same(currentLotStable, nextLotStable) ||
            !same(currentMerchantStable, nextMerchantStable) ||
            payload.nextMerchantState.soldUnitsSinceRestock !==
              currentMerchant.soldUnitsSinceRestock + payload.tradeReceipt.quantity ||
            payload.nextCoin !== this.state.economy.coin + payload.tradeReceipt.coinDelta ||
            payload.sessionReceiptPayloadHash !== expectedReceiptHash) {
          return { reason: "invalid_event", duplicate: false };
        }
        const receiptEntry: SessionReceiptIndexEntry = {
          receiptId,
          domain: "trade",
          payloadHash: payload.sessionReceiptPayloadHash,
          recordedByEventId: event.eventId,
          recordedAtSequence: event.sequence,
        };
        return {
          state: withAppliedEvent(this.state, event, {
            economy: {
              ...this.state.economy,
              coin: payload.nextCoin,
              walletRevision: payload.nextWalletRevision,
              inventoryRevision: payload.nextInventoryRevision,
              lots: this.state.economy.lots.map((lot) => lot.lotId === payload.nextLot.lotId ? clone(payload.nextLot) : lot),
              merchantStates: this.state.economy.merchantStates.map((state) =>
                state.merchantId === payload.nextMerchantState.merchantId ? clone(payload.nextMerchantState) : state),
              tradeReceipts: [...this.state.economy.tradeReceipts, clone(payload.tradeReceipt)],
            },
            receiptIndex: { ...this.state.receiptIndex, [receiptId]: receiptEntry },
          }),
        };
      }
      case "verified_trade_quote_issued": {
        const payload = event.payload;
        if (!isNonEmptyString(payload.operationId) || payload.quote.playerSaveId !== this.sessionId ||
            payload.runtimeSceneRevision !== this.state.world.revision || payload.sceneId !== this.state.world.currentSceneId ||
            this.state.economy.activeWorldTick !== this.state.survival.worldTicks) return { reason: "invalid_event", duplicate: false };
        const authority = verifiedTradeManifest().stationAuthorities.find((candidate) => candidate.sceneId === payload.sceneId &&
          candidate.targetId === payload.targetId && candidate.interactionId === payload.interactionId &&
          candidate.merchantIds.includes(payload.quote.merchantId));
        if (!authority || !Number.isFinite(payload.playerPositionPx.x) || !Number.isFinite(payload.playerPositionPx.y) ||
            Math.hypot(payload.playerPositionPx.x - authority.interactionPointPx.x,
              payload.playerPositionPx.y - authority.interactionPointPx.y) > 16) return { reason: "invalid_event", duplicate: false };
        const issued = createVerifiedSellQuote(this.state.economy, { playerSaveId: this.sessionId,
          merchantId: payload.quote.merchantId, lotId: payload.quote.lineItems[0]?.lotId ?? "", quantity: payload.quote.lineItems[0]?.quantity ?? 0,
          currentWorldTick: this.state.survival.worldTicks });
        if (!issued.accepted || !same(issued.quote, payload.quote) || !same(issued.decayedLot, payload.decayedLot)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const currentLot = this.state.economy.lots.find((lot) => lot.lotId === payload.decayedLot.lotId);
        if (!currentLot) return { reason: "economy_revision_conflict", duplicate: false };
        const changed = !same(currentLot, payload.decayedLot);
        if (payload.quote.inventoryRevision !== this.state.economy.inventoryRevision + (changed ? 1 : 0) ||
            payload.quote.quoteSequence !== this.state.economy.quoteSequence + 1) return { reason: "invalid_event", duplicate: false };
        if (!this.replaying) this.liveVerifiedTradeQuotes.set(event.eventId, payload.quote.quotePayloadHash);
        return { state: withAppliedEvent(this.state, event, { economy: { ...this.state.economy,
          quoteSequence: payload.quote.quoteSequence, inventoryRevision: payload.quote.inventoryRevision,
          lots: this.state.economy.lots.map((lot) => lot.lotId === payload.decayedLot.lotId ? clone(payload.decayedLot) : lot),
        } }) };
      }
      case "verified_trade_sale_committed": {
        const payload = event.payload;
        const issued = this.ledger.find((candidate) => candidate.eventId === payload.issuedEventId);
        const authority = verifiedTradeManifest().stationAuthorities.find((candidate) => candidate.sceneId === payload.sceneId &&
          candidate.targetId === payload.targetId && candidate.interactionId === payload.interactionId &&
          candidate.merchantIds.includes(payload.quote.merchantId));
        if (!authority || payload.runtimeSceneRevision !== this.state.world.revision || payload.sceneId !== this.state.world.currentSceneId ||
            !Number.isFinite(payload.playerPositionPx.x) || !Number.isFinite(payload.playerPositionPx.y) ||
            Math.hypot(payload.playerPositionPx.x - authority.interactionPointPx.x,
              payload.playerPositionPx.y - authority.interactionPointPx.y) > 16 || issued?.type !== "verified_trade_quote_issued" || !same(issued.payload.quote, payload.quote) ||
            issued.payload.runtimeSceneRevision !== this.state.world.revision || issued.payload.sceneId !== this.state.world.currentSceneId ||
            payload.quote.quotePayloadHash !== payload.quotePayloadHash ||
            (!this.replaying && this.liveVerifiedTradeQuotes.get(payload.issuedEventId) !== payload.quotePayloadHash)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const result = commitVerifiedSellQuote(this.state.economy, payload.quote, this.state.survival.worldTicks);
        if (!result.committed) return { reason: result.duplicate ? "duplicate_receipt" : "invalid_event", duplicate: result.duplicate };
        const receiptId = verifiedSellReceiptId(payload.quote);
        if (this.state.receiptIndex[receiptId]) return { reason: "duplicate_receipt", duplicate: true };
        if (!this.replaying) this.liveVerifiedTradeQuotes.delete(payload.issuedEventId);
        return { state: withAppliedEvent(this.state, event, { economy: result.economy,
          receiptIndex: { ...this.state.receiptIndex, [receiptId]: { receiptId, domain: "trade",
            payloadHash: payload.quotePayloadHash, recordedByEventId: event.eventId, recordedAtSequence: event.sequence } },
        }) };
      }
      case "quest_stage_set": {
        const { questId, stageId, stageOrdinal } = event.payload;
        if (!isNonEmptyString(questId) || !isNonEmptyString(stageId) || !isNonNegativeSafeInteger(stageOrdinal)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const current = this.state.quests[questId];
        if (current && stageOrdinal <= current.stageOrdinal) return { reason: "state_regression", duplicate: false };
        return {
          state: withAppliedEvent(this.state, event, {
            quests: {
              ...this.state.quests,
              [questId]: { questId, stageId, stageOrdinal },
            },
          }),
        };
      }
      case "receipt_recorded": {
        const { receiptId, domain, payloadHash } = event.payload;
        if (!isNonEmptyString(receiptId) || !RECEIPT_DOMAINS.includes(domain) || !isNonEmptyString(payloadHash)) {
          return { reason: "invalid_event", duplicate: false };
        }
        const current = this.state.receiptIndex[receiptId];
        if (current) {
          return current.domain === domain && current.payloadHash === payloadHash
            ? { reason: "duplicate_receipt", duplicate: true }
            : { reason: "receipt_payload_conflict", duplicate: false };
        }
        const receipt: SessionReceiptIndexEntry = {
          receiptId,
          domain,
          payloadHash,
          recordedByEventId: event.eventId,
          recordedAtSequence: event.sequence,
        };
        return {
          state: withAppliedEvent(this.state, event, {
            receiptIndex: { ...this.state.receiptIndex, [receiptId]: receipt },
          }),
        };
      }
      case "area_reset": {
        const { areaId, respawnSceneId } = event.payload;
        if (!isNonEmptyString(areaId) || (respawnSceneId !== undefined && !isNonEmptyString(respawnSceneId))) {
          return { reason: "invalid_event", duplicate: false };
        }
        const nextEpoch = (this.state.world.areaEpochs[areaId] ?? 0) + 1;
        const remainingFlags = Object.fromEntries(
          Object.entries(this.state.world.flags).filter(([, flag]) =>
            flag.scope !== "area" || flag.areaId !== areaId),
        );
        return {
          state: withAppliedEvent(this.state, event, {
            world: {
              ...this.state.world,
              currentSceneId: respawnSceneId ?? this.state.world.currentSceneId,
              revision: this.state.world.revision + 1,
              areaEpochs: { ...this.state.world.areaEpochs, [areaId]: nextEpoch },
              flags: remainingFlags,
            },
          }),
        };
      }
    }
  }

  private result(
    applied: boolean,
    duplicate: boolean,
    reason: SessionApplyReason,
  ): SessionApplyResult {
    return { applied, duplicate, reason, snapshot: this.snapshot() };
  }
}

export const replayGameSession = (
  sessionId: string,
  origin: GameSessionState,
  events: readonly GameSessionEvent[],
): ReplayResult => GameSession.replayLedger(sessionId, origin, events);

const saveDigest = (save: GameSessionSave): string => fingerprint({
  schema: save.schema,
  sessionId: save.sessionId,
  origin: save.origin,
  state: save.state,
  eventLedger: save.eventLedger,
});

const isPreCapabilityOnlyV02SaveStructurallyValid = (value: unknown): value is Omit<GameSessionSave, "origin" | "state"> & {
  readonly origin: PreCapabilityState;
  readonly state: PreCapabilityState;
} => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_SAVE_SCHEMA || !isNonEmptyString(value.sessionId) ||
      !isPreCapabilityOnlyV02SessionState(value.origin) || value.origin.revision !== 0 || value.origin.lastEventSequence !== 0 ||
      Object.keys(value.origin.processedEventPayloads).length !== 0 || !isPreCapabilityOnlyV02SessionState(value.state) ||
      !Array.isArray(value.eventLedger) || !value.eventLedger.every(isEventEnvelope) ||
      hasProtectedAttackState(value.origin) || !protectedAttackStateHasLedgerAuthority(value.state, value.eventLedger) ||
      value.eventLedger.some((event) => event.type === "capability_milestone_committed") ||
      !isRecord(value.integrity) || value.integrity.algorithm !== GAME_SESSION_INTEGRITY_ALGORITHM ||
      typeof value.integrity.digest !== "string" || !/^[0-9a-f]{8}$/.test(value.integrity.digest)) return false;
  return value.eventLedger.length === value.state.lastEventSequence;
};

const upgradePreCapabilityOnlyV02Save = (
  save: Omit<GameSessionSave, "origin" | "state"> & { readonly origin: PreCapabilityState; readonly state: PreCapabilityState },
): GameSessionSave => {
  const withoutIntegrity: Omit<GameSessionSave, "integrity"> = {
    schema: GAME_SESSION_SAVE_SCHEMA,
    sessionId: save.sessionId,
    origin: { ...clone(save.origin), capabilities: clone(INITIAL_SESSION_CAPABILITIES), economy: { ...normalizeSessionEconomy(save.origin.economy), activeWorldTick: save.origin.survival.worldTicks } },
    state: { ...clone(save.state), capabilities: clone(INITIAL_SESSION_CAPABILITIES), economy: { ...normalizeSessionEconomy(save.state.economy), activeWorldTick: save.state.survival.worldTicks } },
    eventLedger: clone(save.eventLedger),
  };
  return { ...withoutIntegrity, integrity: { algorithm: GAME_SESSION_INTEGRITY_ALGORITHM, digest: fingerprint(withoutIntegrity) } };
};

const isPreCapabilityV02SaveStructurallyValid = (value: unknown): value is Omit<GameSessionSave, "origin" | "state"> & {
  readonly origin: PreCapabilityAndLifeLedgerState;
  readonly state: PreCapabilityAndLifeLedgerState;
} => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_SAVE_SCHEMA || !isNonEmptyString(value.sessionId) ||
      !isPreCapabilityV02SessionState(value.origin) || value.origin.revision !== 0 || value.origin.lastEventSequence !== 0 ||
      Object.keys(value.origin.processedEventPayloads).length !== 0 || !isPreCapabilityV02SessionState(value.state) ||
      !Array.isArray(value.eventLedger) || !value.eventLedger.every(isEventEnvelope) ||
      hasProtectedAttackState(value.origin) || !protectedAttackStateHasLedgerAuthority(value.state, value.eventLedger) ||
      value.eventLedger.some((event) => event.type === "capability_milestone_committed") ||
      !isRecord(value.integrity) || value.integrity.algorithm !== GAME_SESSION_INTEGRITY_ALGORITHM ||
      typeof value.integrity.digest !== "string" || !/^[0-9a-f]{8}$/.test(value.integrity.digest)) return false;
  return value.eventLedger.length === value.state.lastEventSequence;
};

const upgradePreCapabilityV02Save = (
  save: Omit<GameSessionSave, "origin" | "state"> & {
    readonly origin: PreCapabilityAndLifeLedgerState;
    readonly state: PreCapabilityAndLifeLedgerState;
  },
): GameSessionSave => {
  const withoutIntegrity: Omit<GameSessionSave, "integrity"> = {
    schema: GAME_SESSION_SAVE_SCHEMA,
    sessionId: save.sessionId,
    origin: { ...clone(save.origin), capabilities: clone(INITIAL_SESSION_CAPABILITIES), lifeCorpseLedger: createEmptyLifeCorpseLedger(), economy: { ...normalizeSessionEconomy(save.origin.economy), activeWorldTick: save.origin.survival.worldTicks } },
    state: { ...clone(save.state), capabilities: clone(INITIAL_SESSION_CAPABILITIES), lifeCorpseLedger: createEmptyLifeCorpseLedger(), economy: { ...normalizeSessionEconomy(save.state.economy), activeWorldTick: save.state.survival.worldTicks } },
    eventLedger: clone(save.eventLedger),
  };
  return {
    ...withoutIntegrity,
    integrity: { algorithm: GAME_SESSION_INTEGRITY_ALGORITHM, digest: fingerprint(withoutIntegrity) },
  };
};

const isPreLifeLedgerV02SaveStructurallyValid = (value: unknown): value is Omit<GameSessionSave, "origin" | "state"> & {
  readonly origin: PreLifeLedgerState;
  readonly state: PreLifeLedgerState;
} => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_SAVE_SCHEMA || !isNonEmptyString(value.sessionId) ||
      !isPreLifeLedgerV02SessionState(value.origin) || value.origin.revision !== 0 || value.origin.lastEventSequence !== 0 ||
      Object.keys(value.origin.processedEventPayloads).length !== 0 || !isPreLifeLedgerV02SessionState(value.state) ||
      !Array.isArray(value.eventLedger) || !value.eventLedger.every(isEventEnvelope) ||
      hasProtectedAttackState(value.origin) || !protectedAttackStateHasLedgerAuthority(value.state, value.eventLedger) ||
      value.eventLedger.some((event) => event.type === "wildlife_life_registered" ||
        event.type === "wildlife_damage_committed" || event.type === "wildlife_death_committed") ||
      !isRecord(value.integrity) || value.integrity.algorithm !== GAME_SESSION_INTEGRITY_ALGORITHM ||
      typeof value.integrity.digest !== "string" || !/^[0-9a-f]{8}$/.test(value.integrity.digest)) return false;
  return value.eventLedger.length === value.state.lastEventSequence;
};

const upgradePreLifeLedgerV02Save = (
  save: Omit<GameSessionSave, "origin" | "state"> & {
    readonly origin: PreLifeLedgerState;
    readonly state: PreLifeLedgerState;
  },
): GameSessionSave => {
  const withoutIntegrity: Omit<GameSessionSave, "integrity"> = {
    schema: GAME_SESSION_SAVE_SCHEMA,
    sessionId: save.sessionId,
    origin: { ...clone(save.origin), lifeCorpseLedger: createEmptyLifeCorpseLedger(), economy: { ...normalizeSessionEconomy(save.origin.economy), activeWorldTick: save.origin.survival.worldTicks } },
    state: { ...clone(save.state), lifeCorpseLedger: createEmptyLifeCorpseLedger(), economy: { ...normalizeSessionEconomy(save.state.economy), activeWorldTick: save.state.survival.worldTicks } },
    eventLedger: clone(save.eventLedger),
  };
  return {
    ...withoutIntegrity,
    integrity: { algorithm: GAME_SESSION_INTEGRITY_ALGORITHM, digest: fingerprint(withoutIntegrity) },
  };
};

const isPreEconomyV02SaveStructurallyValid = (value: unknown): value is Omit<GameSessionSave, "origin" | "state"> & {
  readonly origin: PreEconomyState;
  readonly state: PreEconomyState;
} => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_SAVE_SCHEMA || !isNonEmptyString(value.sessionId) ||
      !isPreEconomyV02SessionState(value.origin) || value.origin.revision !== 0 || value.origin.lastEventSequence !== 0 ||
      Object.keys(value.origin.processedEventPayloads).length !== 0 || !isPreEconomyV02SessionState(value.state) ||
      !Array.isArray(value.eventLedger) || !value.eventLedger.every(isEventEnvelope) ||
      hasProtectedAttackState(value.origin) || !protectedAttackStateHasLedgerAuthority(value.state, value.eventLedger) ||
      value.eventLedger.some((event) => event.type === "economy_wallet_changed" ||
        event.type === "quote_sequence_advanced" ||
        event.type === "economy_lot_changed" || event.type === "merchant_state_changed" ||
        event.type === "trade_sale_committed") ||
      !isRecord(value.integrity) || value.integrity.algorithm !== GAME_SESSION_INTEGRITY_ALGORITHM ||
      typeof value.integrity.digest !== "string" || !/^[0-9a-f]{8}$/.test(value.integrity.digest)) return false;
  return value.eventLedger.length === value.state.lastEventSequence;
};

const upgradePreEconomyV02Save = (
  save: Omit<GameSessionSave, "origin" | "state"> & { readonly origin: PreEconomyState; readonly state: PreEconomyState },
): GameSessionSave => {
  const withoutIntegrity: Omit<GameSessionSave, "integrity"> = {
    schema: GAME_SESSION_SAVE_SCHEMA,
    sessionId: save.sessionId,
    origin: { ...clone(save.origin), economy: { ...normalizeSessionEconomy(save.origin.economy), activeWorldTick: save.origin.survival.worldTicks } },
    state: { ...clone(save.state), economy: { ...normalizeSessionEconomy(save.state.economy), activeWorldTick: save.state.survival.worldTicks } },
    eventLedger: clone(save.eventLedger),
  };
  return { ...withoutIntegrity, integrity: { algorithm: GAME_SESSION_INTEGRITY_ALGORITHM, digest: fingerprint(withoutIntegrity) } };
};

const isCurrentSaveStructurallyValid = (value: unknown): value is GameSessionSave => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_SAVE_SCHEMA || !isNonEmptyString(value.sessionId) ||
      !isSessionState(value.origin) || value.origin.revision !== 0 || value.origin.lastEventSequence !== 0 ||
      Object.keys(value.origin.processedEventPayloads).length !== 0 || !isSessionState(value.state) ||
      !Array.isArray(value.eventLedger) || !value.eventLedger.every(isEventEnvelope) ||
      hasProtectedAttackState(value.origin) || !protectedAttackStateHasLedgerAuthority(value.state, value.eventLedger) ||
      !isRecord(value.integrity) || value.integrity.algorithm !== GAME_SESSION_INTEGRITY_ALGORITHM ||
      typeof value.integrity.digest !== "string" || !/^[0-9a-f]{8}$/.test(value.integrity.digest)) return false;
  return value.eventLedger.length === value.state.lastEventSequence;
};

const isLegacySaveStructurallyValid = (value: unknown): value is LegacyGameSessionSaveV1 => {
  if (!isRecord(value) || value.schema !== LEGACY_GAME_SESSION_SAVE_SCHEMA ||
      !isNonEmptyString(value.sessionId) || !isSessionMpState(value.mp) || !isWorldState(value.world) ||
      !isLearningSnapshot(value.learning) || !isSurvivalSave(value.survival) ||
      !isMigratableEconomy(value.economy) || !isQuestRecord(value.quests)) return false;
  return true;
};

export const migrateGameSessionSave = (candidate: unknown): GameSessionMigrationResult => {
  if (!isRecord(candidate) || !isNonEmptyString(candidate.schema)) {
    return { ok: false, error: "invalid_save" };
  }
  if (candidate.schema === GAME_SESSION_SAVE_SCHEMA) {
    if (isCurrentSaveStructurallyValid(candidate)) {
      return { ok: true, save: clone(candidate), migratedFrom: null };
    }
    if (isPreEconomyV02SaveStructurallyValid(candidate)) {
      if (candidate.integrity.digest !== saveDigest(candidate as unknown as GameSessionSave)) {
        return { ok: false, error: "invalid_save" };
      }
      return { ok: true, save: upgradePreEconomyV02Save(candidate), migratedFrom: null };
    }
    if (isPreCapabilityOnlyV02SaveStructurallyValid(candidate)) {
      if (candidate.integrity.digest !== saveDigest(candidate as unknown as GameSessionSave)) {
        return { ok: false, error: "invalid_save" };
      }
      return { ok: true, save: upgradePreCapabilityOnlyV02Save(candidate), migratedFrom: null };
    }
    if (isPreLifeLedgerV02SaveStructurallyValid(candidate)) {
      if (candidate.integrity.digest !== saveDigest(candidate as unknown as GameSessionSave)) {
        return { ok: false, error: "invalid_save" };
      }
      return { ok: true, save: upgradePreLifeLedgerV02Save(candidate), migratedFrom: null };
    }
    if (!isPreCapabilityV02SaveStructurallyValid(candidate)) return { ok: false, error: "invalid_save" };
    if (candidate.integrity.digest !== saveDigest(candidate as unknown as GameSessionSave)) {
      return { ok: false, error: "invalid_save" };
    }
    return { ok: true, save: upgradePreCapabilityV02Save(candidate), migratedFrom: null };
  }
  if (candidate.schema !== LEGACY_GAME_SESSION_SAVE_SCHEMA) {
    return { ok: false, error: "unsupported_schema" };
  }
  if (!isLegacySaveStructurallyValid(candidate)) return { ok: false, error: "invalid_save" };

  const migratedOrigin: GameSessionState = {
    revision: 0,
    lastEventSequence: 0,
    mp: clone(candidate.mp),
    capabilities: clone(INITIAL_SESSION_CAPABILITIES),
    lifeCorpseLedger: createEmptyLifeCorpseLedger(),
    world: clone(candidate.world),
    checkpoint: {
      id: "checkpoint.legacy-entry",
      sceneId: candidate.world.currentSceneId,
      position: { x: 0, y: 0 },
      revision: 0,
    },
    learning: clone(candidate.learning),
    survival: clone(candidate.survival),
    economy: { ...normalizeSessionEconomy(candidate.economy), activeWorldTick: candidate.survival.worldTicks },
    quests: clone(candidate.quests),
    receiptIndex: indexInheritedSurvivalReceipts(candidate.survival),
    processedEventPayloads: {},
  };
  if (!isSessionState(migratedOrigin) || hasProtectedAttackState(migratedOrigin)) {
    return { ok: false, error: "invalid_save" };
  }
  const migrated = GameSession.fromReplayOrigin(candidate.sessionId, migratedOrigin).toSave();
  return { ok: true, save: migrated, migratedFrom: LEGACY_GAME_SESSION_SAVE_SCHEMA };
};
