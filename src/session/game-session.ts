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
import type { TradeSnapshot } from "../game/trade";
import type { MpLedgerSnapshot } from "../spells/cast-plan";

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

export interface InventoryLotSummary {
  readonly lotId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly ownershipRevision: number;
  readonly freshnessRevision: number;
}

export interface SessionEconomySummary {
  readonly coin: number;
  readonly walletRevision: number;
  readonly inventoryRevision: number;
  readonly lots: readonly InventoryLotSummary[];
}

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
  readonly world: SessionWorldState;
  readonly checkpoint: SessionCheckpointState;
  readonly learning: LearningProgressionSnapshot;
  readonly survival: SurvivalSave;
  readonly economy: SessionEconomySummary;
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
  | SessionEventBase<"scene_entered", { readonly sceneId: string }>
  | SessionEventBase<"checkpoint_set", { readonly checkpoint: SessionCheckpointState }>
  | SessionEventBase<"world_flag_set", WorldFlagSetPayload>
  | SessionEventBase<"learning_replaced", { readonly learning: LearningProgressionSnapshot }>
  | SessionEventBase<"survival_replaced", { readonly survival: SurvivalSave }>
  | SessionEventBase<"economy_replaced", { readonly economy: SessionEconomySummary }>
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
  | "milestone_payload_conflict";

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
  readonly economy?: SessionEconomySummary;
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
  readonly economy: SessionEconomySummary;
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

const isInventoryLotSummary = (value: unknown): value is InventoryLotSummary => {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.lotId) && isNonEmptyString(value.itemId) &&
    isNonNegativeSafeInteger(value.quantity) && isNonNegativeSafeInteger(value.ownershipRevision) &&
    isNonNegativeSafeInteger(value.freshnessRevision);
};

const isEconomySummary = (value: unknown): value is SessionEconomySummary => {
  if (!isRecord(value) || !isNonNegativeSafeInteger(value.coin) ||
      !isNonNegativeSafeInteger(value.walletRevision) || !isNonNegativeSafeInteger(value.inventoryRevision) ||
      !Array.isArray(value.lots) || !value.lots.every(isInventoryLotSummary)) return false;
  return valuesAreUnique(value.lots.map((lot) => lot.lotId));
};

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
  isCheckpointState(value.checkpoint) && isLearningSnapshot(value.learning) && isSurvivalSave(value.survival) && isEconomySummary(value.economy) &&
  isQuestRecord(value.quests) && isReceiptRecord(value.receiptIndex) &&
  isStringRecord(value.processedEventPayloads) &&
  Object.keys(value.processedEventPayloads).length === value.lastEventSequence;

const isSessionState = (value: unknown): value is GameSessionState => {
  if (!isRecord(value) || !isSessionStateCore(value) || !isCapabilityState(value.capabilities) ||
      !isSessionMpState(value.mp)) return false;
  const maxMp = value.mp.maxMp;
  return Object.values(value.capabilities.appliedMilestones).every((milestone) =>
    milestone.maxMp <= maxMp);
};

const isPreCapabilityV02SessionState = (value: unknown): value is Omit<GameSessionState, "capabilities"> =>
  isRecord(value) && value.capabilities === undefined && isSessionStateCore(value);

const isEventEnvelope = (value: unknown): value is GameSessionEvent => {
  if (!isRecord(value) || !isNonEmptyString(value.eventId) || !isNonNegativeSafeInteger(value.sequence) ||
      value.sequence === 0 || !isNonEmptyString(value.type) || !isRecord(value.payload)) return false;
  return [
    "mp_replaced",
    "capability_milestone_committed",
    "scene_entered",
    "checkpoint_set",
    "world_flag_set",
    "learning_replaced",
    "survival_replaced",
    "economy_replaced",
    "quest_stage_set",
    "receipt_recorded",
    "area_reset",
  ].includes(value.type);
};

const eventPayloadFingerprint = (event: GameSessionEvent): string => fingerprint({
  type: event.type,
  payload: event.payload,
});

const emptyEconomy = (): SessionEconomySummary => ({
  coin: 0,
  walletRevision: 0,
  inventoryRevision: 0,
  lots: [],
});

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

export const adaptTradeSnapshot = (snapshot: TradeSnapshot): SessionEconomySummary => {
  const economy: SessionEconomySummary = {
    coin: snapshot.coin,
    walletRevision: snapshot.walletRevision,
    inventoryRevision: snapshot.inventoryRevision,
    lots: snapshot.lots.map((lot) => ({
      lotId: lot.lotId,
      itemId: lot.itemId,
      quantity: lot.quantity,
      ownershipRevision: lot.ownershipRevision,
      freshnessRevision: lot.freshnessRevision,
    })),
  };
  if (!isEconomySummary(economy)) throw new Error("invalid trade snapshot");
  return clone(economy);
};

const createInitialState = (initial: GameSessionInitialState): GameSessionState => {
  if (!isNonEmptyString(initial.sessionId) || !isSessionMpState(initial.mp) ||
      !isNonEmptyString(initial.currentSceneId)) throw new Error("invalid GameSession initial state");
  const survival = clone(initial.survival ?? new SurvivalSystem().toSave());
  const state: GameSessionState = {
    revision: 0,
    lastEventSequence: 0,
    mp: clone(initial.mp),
    capabilities: clone(INITIAL_SESSION_CAPABILITIES),
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
    economy: clone(initial.economy ?? emptyEconomy()),
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

export class GameSession {
  private state: GameSessionState;
  private readonly origin: GameSessionState;
  private readonly ledger: GameSessionEvent[];

  private constructor(
    readonly sessionId: string,
    origin: GameSessionState,
    state = origin,
    ledger: readonly GameSessionEvent[] = [],
  ) {
    this.origin = clone(origin);
    this.state = clone(state);
    this.ledger = clone([...ledger]);
  }

  static create(initial: GameSessionInitialState): GameSession {
    const origin = createInitialState(initial);
    return new GameSession(initial.sessionId, origin);
  }

  static fromReplayOrigin(sessionId: string, origin: GameSessionState): GameSession {
    return new GameSession(sessionId, origin);
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

  snapshot(): GameSessionState {
    return clone(this.state);
  }

  capabilitySnapshot(): SessionCapabilityState {
    return clone(this.state.capabilities);
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
        return { state: withAppliedEvent(this.state, event, { survival: clone(next) }) };
      }
      case "economy_replaced": {
        if (!isEconomySummary(event.payload.economy)) return { reason: "invalid_event", duplicate: false };
        const next = event.payload.economy;
        if (next.walletRevision < this.state.economy.walletRevision ||
            next.inventoryRevision < this.state.economy.inventoryRevision) {
          return { reason: "state_regression", duplicate: false };
        }
        return { state: withAppliedEvent(this.state, event, { economy: clone(next) }) };
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

type ReplayResult =
  | Readonly<{ ok: true; session: GameSession }>
  | Readonly<{ ok: false; failedEventId: string | null; reason: SessionApplyReason | "invalid_origin" }>;

export const replayGameSession = (
  sessionId: string,
  origin: GameSessionState,
  events: readonly GameSessionEvent[],
): ReplayResult => {
  if (!isNonEmptyString(sessionId) || !isSessionState(origin) || origin.revision !== 0 ||
      origin.lastEventSequence !== 0 || Object.keys(origin.processedEventPayloads).length !== 0) {
    return { ok: false, failedEventId: null, reason: "invalid_origin" };
  }
  const session = GameSession.fromReplayOrigin(sessionId, origin);
  for (const event of events) {
    const result = session.apply(event);
    if (!result.applied) return { ok: false, failedEventId: event.eventId, reason: result.reason };
  }
  return { ok: true, session };
};

const saveDigest = (save: GameSessionSave): string => fingerprint({
  schema: save.schema,
  sessionId: save.sessionId,
  origin: save.origin,
  state: save.state,
  eventLedger: save.eventLedger,
});

const isPreCapabilityV02SaveStructurallyValid = (value: unknown): value is Omit<GameSessionSave, "origin" | "state"> & {
  readonly origin: Omit<GameSessionState, "capabilities">;
  readonly state: Omit<GameSessionState, "capabilities">;
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
    readonly origin: Omit<GameSessionState, "capabilities">;
    readonly state: Omit<GameSessionState, "capabilities">;
  },
): GameSessionSave => {
  const withoutIntegrity: Omit<GameSessionSave, "integrity"> = {
    schema: GAME_SESSION_SAVE_SCHEMA,
    sessionId: save.sessionId,
    origin: { ...clone(save.origin), capabilities: clone(INITIAL_SESSION_CAPABILITIES) },
    state: { ...clone(save.state), capabilities: clone(INITIAL_SESSION_CAPABILITIES) },
    eventLedger: clone(save.eventLedger),
  };
  return {
    ...withoutIntegrity,
    integrity: { algorithm: GAME_SESSION_INTEGRITY_ALGORITHM, digest: fingerprint(withoutIntegrity) },
  };
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
      !isEconomySummary(value.economy) || !isQuestRecord(value.quests)) return false;
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
    world: clone(candidate.world),
    checkpoint: {
      id: "checkpoint.legacy-entry",
      sceneId: candidate.world.currentSceneId,
      position: { x: 0, y: 0 },
      revision: 0,
    },
    learning: clone(candidate.learning),
    survival: clone(candidate.survival),
    economy: clone(candidate.economy),
    quests: clone(candidate.quests),
    receiptIndex: indexInheritedSurvivalReceipts(candidate.survival),
    processedEventPayloads: {},
  };
  if (!isSessionState(migratedOrigin)) return { ok: false, error: "invalid_save" };
  const migrated = GameSession.fromReplayOrigin(candidate.sessionId, migratedOrigin).toSave();
  return { ok: true, save: migrated, migratedFrom: LEGACY_GAME_SESSION_SAVE_SCHEMA };
};
