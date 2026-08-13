import { createCrossSaveReceiptId, sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  LEARNING_SAVE_SCHEMA,
  createLearningProgression,
  type LearningProgressionSnapshot,
  type WordLearningProgress,
} from "../learning/progression";
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
  private readonly liveVerifiedTradeQuotes: Map<string, string>;
  private replaying = false;

  private constructor(
    readonly sessionId: string,
    origin: GameSessionState,
    state = origin,
    ledger: readonly GameSessionEvent[] = [],
    legacyEconomyReplacementSequences: readonly number[] = [],
    liveVerifiedTradeQuotes: readonly (readonly [string, string])[] = [],
  ) {
    this.origin = clone(origin);
    this.state = clone(state);
    this.ledger = clone([...ledger]);
    this.legacyEconomyReplacementSequences = new Set(legacyEconomyReplacementSequences);
    this.liveVerifiedTradeQuotes = new Map(liveVerifiedTradeQuotes);
  }

  static create(initial: GameSessionInitialState): GameSession {
    const origin = createInitialState(initial);
    return new GameSession(initial.sessionId, origin);
  }

  static fromReplayOrigin(sessionId: string, origin: GameSessionState): GameSession {
    return new GameSession(sessionId, origin);
  }

  static replayLedger(
    sessionId: string,
    origin: GameSessionState,
    events: readonly GameSessionEvent[],
  ): ReplayResult {
    if (!isNonEmptyString(sessionId) || !isSessionState(origin) || origin.revision !== 0 ||
        origin.lastEventSequence !== 0 || Object.keys(origin.processedEventPayloads).length !== 0) {
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
    const session = new GameSession(
      sessionId, origin, origin, [], legacyEconomyEvents.map((event) => event.sequence),
    );
    session.replaying = true;
    try {
      for (const event of events) {
        const result = session.apply(event);
        if (!result.applied) return { ok: false, failedEventId: event.eventId, reason: result.reason };
      }
    } finally { session.replaying = false; }
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
      [...this.legacyEconomyReplacementSequences], [...this.liveVerifiedTradeQuotes.entries()]);
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
    if (!isEventEnvelope(event)) return this.result(false, false, "invalid_event");
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
    if (!isSessionState(reduced.state)) return this.result(false, false, "invalid_event");
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
        if (!isNonEmptyString(payload.milestoneId) || !isNonEmptyString(payload.writerEvent) ||
            !isNonEmptyString(payload.sourcePath) || !isNonEmptyString(payload.contractRevision) ||
            typeof payload.sourceDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(payload.sourceDigest) ||
            !isCapabilityMilestoneResult(payload.resultingState)) {
          return { reason: "invalid_event", duplicate: false };
        }
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
      }      case "wildlife_processing_work_advanced": {
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
        }        const recipe = wildlifeProcessingManifest().processingRecipes[order.recipeId];
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
      }      case "scene_entered": {
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
  if (!isSessionState(migratedOrigin)) return { ok: false, error: "invalid_save" };
  const migrated = GameSession.fromReplayOrigin(candidate.sessionId, migratedOrigin).toSave();
  return { ok: true, save: migrated, migratedFrom: LEGACY_GAME_SESSION_SAVE_SCHEMA };
};
