import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json" with { type: "json" };
import {
  readRuntimePrologueAcceptanceManifest,
  type PrologueIncludedActivityKind,
} from "../content/runtime-prologue-acceptance-manifest.ts";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import {
  readRuntimeWildlifeProcessingManifest,
  requiresWildlifeProvenance,
} from "../content/runtime-wildlife-processing-manifest";
import {
  PROLOGUE_SETTLEMENT_REGION_FLAG_IDS,
  PROLOGUE_SETTLEMENT_REWARD_COIN,
  PROLOGUE_SETTLEMENT_TASK_ID,
} from "../game/prologue-settlement";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import type { GameSessionEvent, GameSessionState } from "../session/game-session";
import type { BrowserTelemetryStorage } from "./browser-prologue-telemetry";
import {
  readProloguePlaytestSessionSample,
  type ProloguePlaytestSessionSample,
} from "./prologue-playtest-cohort.ts";
import type { ExclusiveActivitySnapshot } from "./prologue-telemetry";

export const BROWSER_PROLOGUE_PLAYTEST_SCHEMA = "tokipona.browser-prologue-playtest.v0.1" as const;

const ACCEPTANCE = readRuntimePrologueAcceptanceManifest(generatedRuntimeArtifact);
const SCENES = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;
const WILDLIFE = readRuntimeWildlifeProcessingManifest(generatedRuntimeArtifact);
const INCLUDED_ACTIVITY_KINDS = ACCEPTANCE.telemetry.includedPrimaryActivities;
const SEMANTIC_ID = /^[a-z0-9][a-z0-9_.:-]*$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const MAX_RECOVERY_SAMPLES = 4_096;
const FLUSH_INTERVAL_CONTENT_MS = 5_000;

export interface BrowserProloguePlaytestSave {
  readonly schema: typeof BROWSER_PROLOGUE_PLAYTEST_SCHEMA;
  readonly sessionId: string;
  readonly observationComplete: boolean;
  readonly lastObservedContentActiveMs: number;
  readonly processedEventSequence: number;
  readonly processedLedgerDigest: `sha256:${string}`;
  readonly survivalUiActiveMs: number;
  readonly languageInteractionCount: number;
  readonly needsInterruptedLanguageInteractionCount: number;
  readonly freeFoodWaterDiscoveryMs: number | null;
  readonly softFailureRecoveryDurationsMs: readonly number[];
  readonly openSoftFailureContentMs: number | null;
  readonly rangeTrialPermissionContentMs: number | null;
  readonly firstAttackSignatureContentMs: number | null;
  readonly forcedHuntCount: 0;
  readonly wildlifeHarmEventCount: number;
  readonly huntingIncomeCoin: number;
  readonly huntingActiveMs: number;
  readonly huntingActivityStartedContentMs: number | null;
  readonly nonviolentJobIncomeCoin: number;
  readonly nonviolentJobActiveMs: number;
  readonly nonviolentJobStartedContentMs: number | null;
  readonly duplicateCorpseLotCurrencyCount: number;
  readonly minimumNeedsValueObserved: number | null;
  readonly maximumActiveNewWordsInAnySegment: number;
  readonly checksum: `sha256:${string}`;
}

type SaveBody = Omit<BrowserProloguePlaytestSave, "checksum">;
type MutableObservation = {
  -readonly [Key in keyof SaveBody]: SaveBody[Key] extends readonly number[] ? number[] : SaveBody[Key];
};

export interface BrowserProloguePlaytestFrame {
  readonly activity: ExclusiveActivitySnapshot;
  readonly survivalUiActive: boolean;
  readonly session: GameSessionState;
  readonly events: readonly GameSessionEvent[];
  readonly sceneId: string;
}

/**
 * Non-authoritative, aggregate-only browser observation. It never persists raw
 * GameSession events, save payloads, utterances, player identifiers, or lot IDs.
 */
export class BrowserProloguePlaytest {
  readonly #storage: BrowserTelemetryStorage;
  readonly #key: string;
  readonly #state: MutableObservation;
  #prefixVerified = false;
  #lastFlushedContentActiveMs: number;

  private constructor(storage: BrowserTelemetryStorage, key: string, body: SaveBody) {
    this.#storage = storage;
    this.#key = key;
    this.#state = structuredClone(body) as MutableObservation;
    this.#lastFlushedContentActiveMs = body.lastObservedContentActiveMs;
  }

  static bootstrap(input: Readonly<{
    storage: BrowserTelemetryStorage;
    key: string;
    sessionId: string;
    frame: BrowserProloguePlaytestFrame;
  }>): BrowserProloguePlaytest {
    const sessionId = semanticId(input.sessionId, "playtest sessionId");
    const raw = input.storage.getItem(input.key);
    let saved: BrowserProloguePlaytestSave | null = null;
    let corruptPrior = false;
    if (raw !== null) {
      try {
        saved = readBrowserProloguePlaytestSave(JSON.parse(raw) as unknown);
      } catch {
        corruptPrior = true;
      }
    }
    const body = saved?.sessionId === sessionId
      ? bodyFromSave(saved)
      : freshBody(sessionId, !corruptPrior && input.frame.activity.contentActiveMs === 0 &&
        !hasHistoricalMeasurementEvents(input.frame.events));
    const target = new BrowserProloguePlaytest(input.storage, input.key, body);
    target.observeFrame(input.frame);
    target.flush();
    return target;
  }

  observeFrame(frame: BrowserProloguePlaytestFrame): void {
    validateActivitySnapshot(frame.activity);
    if (frame.session.world.currentSceneId !== frame.sceneId) this.#state.observationComplete = false;
    const priorContentMs = this.#state.lastObservedContentActiveMs;
    if (frame.activity.contentActiveMs < priorContentMs) {
      this.#state.observationComplete = false;
    } else if (frame.survivalUiActive) {
      this.#state.survivalUiActiveMs += frame.activity.contentActiveMs - priorContentMs;
    }
    this.#state.lastObservedContentActiveMs = frame.activity.contentActiveMs;

    const minimumNeeds = Math.floor(Math.min(frame.session.survival.satiety, frame.session.survival.hydration));
    if (!Number.isSafeInteger(minimumNeeds) || minimumNeeds < 0 || minimumNeeds > 100) {
      this.#state.observationComplete = false;
    } else {
      this.#state.minimumNeedsValueObserved = this.#state.minimumNeedsValueObserved === null
        ? minimumNeeds
        : Math.min(this.#state.minimumNeedsValueObserved, minimumNeeds);
    }
    try {
      this.#state.maximumActiveNewWordsInAnySegment = Math.max(
        this.#state.maximumActiveNewWordsInAnySegment,
        prologueActiveNewWordCountForScene(frame.sceneId),
      );
    } catch {
      this.#state.observationComplete = false;
    }
    this.#state.duplicateCorpseLotCurrencyCount = Math.max(
      this.#state.duplicateCorpseLotCurrencyCount,
      duplicateTradeCurrencyCount(frame.session),
    );

    const hadNewEvents = this.#consumeEvents(frame.events, frame.session, frame.activity.contentActiveMs);
    if (hadNewEvents || frame.activity.contentActiveMs - this.#lastFlushedContentActiveMs >= FLUSH_INTERVAL_CONTENT_MS) {
      this.flush();
    }
  }

  beginSoftFailure(activity: ExclusiveActivitySnapshot): void {
    validateActivitySnapshot(activity);
    if (activity.contentActiveMs < this.#state.lastObservedContentActiveMs) {
      this.#state.observationComplete = false;
      return;
    }
    this.#state.openSoftFailureContentMs ??= activity.contentActiveMs;
    this.flush();
  }

  completeSoftFailure(activity: ExclusiveActivitySnapshot): void {
    validateActivitySnapshot(activity);
    const started = this.#state.openSoftFailureContentMs;
    if (started === null) return;
    if (activity.contentActiveMs < started || this.#state.softFailureRecoveryDurationsMs.length >= MAX_RECOVERY_SAMPLES) {
      this.#state.observationComplete = false;
    } else {
      this.#state.softFailureRecoveryDurationsMs.push(activity.contentActiveMs - started);
    }
    this.#state.openSoftFailureContentMs = null;
    this.flush();
  }

  flush(): BrowserProloguePlaytestSave {
    const body = frozenBody(this.#state);
    const save = Object.freeze({
      ...body,
      checksum: sha256Canonical(body as unknown as JsonValue),
    }) satisfies BrowserProloguePlaytestSave;
    this.#storage.setItem(this.#key, JSON.stringify(save));
    this.#lastFlushedContentActiveMs = body.lastObservedContentActiveMs;
    return save;
  }

  snapshot(): BrowserProloguePlaytestSave {
    const body = frozenBody(this.#state);
    return Object.freeze({
      ...body,
      checksum: sha256Canonical(body as unknown as JsonValue),
    });
  }

  toSample(activity: ExclusiveActivitySnapshot): ProloguePlaytestSessionSample {
    validateActivitySnapshot(activity);
    if (!this.#state.observationComplete || activity.contentActiveMs !== this.#state.lastObservedContentActiveMs ||
        this.#state.minimumNeedsValueObserved === null || this.#state.openSoftFailureContentMs !== null) {
      throw new Error("browser playtest observation is incomplete");
    }
    const runningHuntingMs = this.#state.huntingActivityStartedContentMs === null
      ? 0
      : activity.contentActiveMs - this.#state.huntingActivityStartedContentMs;
    const runningNonviolentMs = this.#state.nonviolentJobStartedContentMs === null
      ? 0
      : activity.contentActiveMs - this.#state.nonviolentJobStartedContentMs;
    return readProloguePlaytestSessionSample({
      schemaVersion: ACCEPTANCE.telemetry.playtestSessionSummary.schemaVersion,
      sessionId: this.#state.sessionId,
      contentActiveMs: activity.contentActiveMs,
      worldPeoplePhysicsActiveMs: activity.totalsMs.world_people_physics,
      languageActiveMs: activity.totalsMs.language,
      longExplanationActiveMs: activity.totalsMs.long_explanation,
      survivalUiActiveMs: this.#state.survivalUiActiveMs,
      languageInteractionCount: this.#state.languageInteractionCount,
      needsInterruptedLanguageInteractionCount: this.#state.needsInterruptedLanguageInteractionCount,
      freeFoodWaterDiscoveryMs: this.#state.freeFoodWaterDiscoveryMs,
      softFailureRecoveryDurationsMs: this.#state.softFailureRecoveryDurationsMs,
      rangeTrialPermissionContentMs: this.#state.rangeTrialPermissionContentMs,
      firstAttackSignatureContentMs: this.#state.firstAttackSignatureContentMs,
      forcedHuntCount: this.#state.forcedHuntCount,
      wildlifeHarmEventCount: this.#state.wildlifeHarmEventCount,
      huntingIncomeCoin: this.#state.huntingIncomeCoin,
      huntingActiveMs: this.#state.huntingActiveMs + runningHuntingMs,
      nonviolentJobIncomeCoin: this.#state.nonviolentJobIncomeCoin,
      nonviolentJobActiveMs: this.#state.nonviolentJobActiveMs + runningNonviolentMs,
      duplicateCorpseLotCurrencyCount: this.#state.duplicateCorpseLotCurrencyCount,
      minimumNeedsValueObserved: this.#state.minimumNeedsValueObserved,
      maximumActiveNewWordsInAnySegment: this.#state.maximumActiveNewWordsInAnySegment,
    });
  }

  #consumeEvents(events: readonly GameSessionEvent[], session: GameSessionState, contentActiveMs: number): boolean {
    const contiguous = session.lastEventSequence === events.length && events.every((event, index) => event.sequence === index + 1);
    if (!contiguous || this.#state.processedEventSequence > events.length) {
      this.#state.observationComplete = false;
      return false;
    }
    if (!this.#prefixVerified) {
      const prefix = events.slice(0, this.#state.processedEventSequence);
      if (ledgerDigest(prefix) !== this.#state.processedLedgerDigest) {
        this.#state.observationComplete = false;
        return false;
      }
      this.#prefixVerified = true;
    }
    const next = events.slice(this.#state.processedEventSequence);
    for (const event of next) this.#consumeEvent(event, contentActiveMs);
    if (next.length > 0) {
      this.#state.processedEventSequence = events.length;
      this.#state.processedLedgerDigest = ledgerDigest(events);
    }
    return next.length > 0;
  }

  #consumeEvent(event: GameSessionEvent, contentActiveMs: number): void {
    if (event.type === "learning_evidence_committed" && "evidence" in event.payload && event.payload.evidence !== undefined) {
      this.#state.languageInteractionCount += 1;
    }
    if (event.type === "world_flag_set" && event.payload.value === true &&
        (event.payload.flagId === PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.publicWellUsed ||
          event.payload.flagId === PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.communalPlantMealOffered)) {
      this.#state.freeFoodWaterDiscoveryMs ??= contentActiveMs;
    }
    if (event.type === "attack_prerequisites_verified") {
      this.#state.rangeTrialPermissionContentMs ??= contentActiveMs;
    }
    if (event.type === "safe_range_transfer_passed") {
      this.#state.firstAttackSignatureContentMs ??= contentActiveMs;
    }
    if ((event.type === "wildlife_damage_committed" || event.type === "wildlife_death_committed") &&
        event.payload.damage > 0) {
      this.#state.wildlifeHarmEventCount += 1;
      this.#state.huntingActivityStartedContentMs ??= contentActiveMs;
    }
    if (event.type === "wildlife_processing_committed") {
      this.#state.huntingActivityStartedContentMs ??= contentActiveMs;
    }
    if (event.type === "verified_trade_sale_committed") {
      const itemId = event.payload.quote.lineItems[0]?.itemId;
      if (itemId !== undefined && requiresWildlifeProvenance(WILDLIFE, itemId)) {
        this.#state.huntingIncomeCoin += event.payload.quote.totalCoin;
        const started = this.#state.huntingActivityStartedContentMs ?? contentActiveMs;
        this.#state.huntingActiveMs += contentActiveMs - started;
        this.#state.huntingActivityStartedContentMs = null;
      }
    }
    if (event.type === "quest_stage_set" && event.payload.questId === PROLOGUE_SETTLEMENT_TASK_ID) {
      if (event.payload.stageOrdinal === 1) this.#state.nonviolentJobStartedContentMs ??= contentActiveMs;
      if (event.payload.stageOrdinal === 3) {
        this.#state.nonviolentJobIncomeCoin += PROLOGUE_SETTLEMENT_REWARD_COIN;
        const started = this.#state.nonviolentJobStartedContentMs ?? contentActiveMs;
        this.#state.nonviolentJobActiveMs += contentActiveMs - started;
        this.#state.nonviolentJobStartedContentMs = null;
      }
    }
  }
}

export function prologueActiveNewWordCountForScene(sceneId: string): number {
  const scene = SCENES[semanticId(sceneId, "playtest sceneId")];
  if (!scene) throw new Error("playtest scene is absent from the verified runtime manifest");
  const matches = ACCEPTANCE.telemetry.segmentFocus.filter((segment) => segment.mapNodeIds.includes(scene.regionNodeId));
  if (matches.length === 0) throw new Error("playtest scene has no authored segment focus");
  return Math.max(...matches.map((segment) => segment.activeNewWordIds.length));
}

/** Stable, non-identifying sample identity; the GameSession identifier is never persisted in playtest telemetry. */
export function anonymizedProloguePlaytestSessionId(sessionId: string): string {
  if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error("GameSession identifier is required");
  return `session.sha256.${sha256Canonical(sessionId as unknown as JsonValue).slice(7)}`;
}

export function readBrowserProloguePlaytestSave(candidate: unknown): BrowserProloguePlaytestSave {
  const value = record(candidate, "browser prologue playtest save");
  const keys = [
    "schema", "sessionId", "observationComplete", "lastObservedContentActiveMs", "processedEventSequence",
    "processedLedgerDigest", "survivalUiActiveMs", "languageInteractionCount",
    "needsInterruptedLanguageInteractionCount", "freeFoodWaterDiscoveryMs", "softFailureRecoveryDurationsMs",
    "openSoftFailureContentMs", "rangeTrialPermissionContentMs", "firstAttackSignatureContentMs", "forcedHuntCount",
    "wildlifeHarmEventCount", "huntingIncomeCoin", "huntingActiveMs", "huntingActivityStartedContentMs",
    "nonviolentJobIncomeCoin", "nonviolentJobActiveMs", "nonviolentJobStartedContentMs",
    "duplicateCorpseLotCurrencyCount", "minimumNeedsValueObserved", "maximumActiveNewWordsInAnySegment", "checksum",
  ] as const;
  exactKeys(value, keys, "browser prologue playtest save");
  if (value.schema !== BROWSER_PROLOGUE_PLAYTEST_SCHEMA || typeof value.observationComplete !== "boolean" ||
      typeof value.processedLedgerDigest !== "string" || !HASH.test(value.processedLedgerDigest) ||
      typeof value.checksum !== "string" || !HASH.test(value.checksum) || value.forcedHuntCount !== 0) {
    throw new Error("browser prologue playtest save identity is invalid");
  }
  const lastObservedContentActiveMs = count(value.lastObservedContentActiveMs, "lastObservedContentActiveMs");
  const body = Object.freeze({
    schema: BROWSER_PROLOGUE_PLAYTEST_SCHEMA,
    sessionId: semanticId(value.sessionId, "playtest sessionId"),
    observationComplete: value.observationComplete,
    lastObservedContentActiveMs,
    processedEventSequence: count(value.processedEventSequence, "processedEventSequence"),
    processedLedgerDigest: value.processedLedgerDigest as `sha256:${string}`,
    survivalUiActiveMs: boundedCount(value.survivalUiActiveMs, lastObservedContentActiveMs, "survivalUiActiveMs"),
    languageInteractionCount: count(value.languageInteractionCount, "languageInteractionCount"),
    needsInterruptedLanguageInteractionCount: count(value.needsInterruptedLanguageInteractionCount, "needsInterruptedLanguageInteractionCount"),
    freeFoodWaterDiscoveryMs: optionalTimestamp(value.freeFoodWaterDiscoveryMs, lastObservedContentActiveMs, "freeFoodWaterDiscoveryMs"),
    softFailureRecoveryDurationsMs: recoveryDurations(value.softFailureRecoveryDurationsMs),
    openSoftFailureContentMs: optionalTimestamp(value.openSoftFailureContentMs, lastObservedContentActiveMs, "openSoftFailureContentMs"),
    rangeTrialPermissionContentMs: optionalTimestamp(value.rangeTrialPermissionContentMs, lastObservedContentActiveMs, "rangeTrialPermissionContentMs"),
    firstAttackSignatureContentMs: optionalTimestamp(value.firstAttackSignatureContentMs, lastObservedContentActiveMs, "firstAttackSignatureContentMs"),
    forcedHuntCount: 0 as const,
    wildlifeHarmEventCount: count(value.wildlifeHarmEventCount, "wildlifeHarmEventCount"),
    huntingIncomeCoin: count(value.huntingIncomeCoin, "huntingIncomeCoin"),
    huntingActiveMs: count(value.huntingActiveMs, "huntingActiveMs"),
    huntingActivityStartedContentMs: optionalTimestamp(value.huntingActivityStartedContentMs, lastObservedContentActiveMs, "huntingActivityStartedContentMs"),
    nonviolentJobIncomeCoin: count(value.nonviolentJobIncomeCoin, "nonviolentJobIncomeCoin"),
    nonviolentJobActiveMs: count(value.nonviolentJobActiveMs, "nonviolentJobActiveMs"),
    nonviolentJobStartedContentMs: optionalTimestamp(value.nonviolentJobStartedContentMs, lastObservedContentActiveMs, "nonviolentJobStartedContentMs"),
    duplicateCorpseLotCurrencyCount: count(value.duplicateCorpseLotCurrencyCount, "duplicateCorpseLotCurrencyCount"),
    minimumNeedsValueObserved: optionalBoundedCount(value.minimumNeedsValueObserved, 100, "minimumNeedsValueObserved"),
    maximumActiveNewWordsInAnySegment: boundedCount(value.maximumActiveNewWordsInAnySegment,
      ACCEPTANCE.acceptance.playtest.focusActiveNewWordsPerSegmentMaximum, "maximumActiveNewWordsInAnySegment"),
  }) satisfies SaveBody;
  if (body.needsInterruptedLanguageInteractionCount > body.languageInteractionCount ||
      (body.firstAttackSignatureContentMs !== null &&
        (body.rangeTrialPermissionContentMs === null || body.firstAttackSignatureContentMs < body.rangeTrialPermissionContentMs))) {
    throw new Error("browser prologue playtest counters are inconsistent");
  }
  if (sha256Canonical(body as unknown as JsonValue) !== value.checksum) {
    throw new Error("browser prologue playtest checksum mismatch");
  }
  return Object.freeze({ ...body, checksum: value.checksum as `sha256:${string}` });
}

function freshBody(sessionId: string, observationComplete: boolean): SaveBody {
  return Object.freeze({
    schema: BROWSER_PROLOGUE_PLAYTEST_SCHEMA,
    sessionId,
    observationComplete,
    lastObservedContentActiveMs: 0,
    processedEventSequence: 0,
    processedLedgerDigest: ledgerDigest([]),
    survivalUiActiveMs: 0,
    languageInteractionCount: 0,
    needsInterruptedLanguageInteractionCount: 0,
    freeFoodWaterDiscoveryMs: null,
    softFailureRecoveryDurationsMs: Object.freeze([]),
    openSoftFailureContentMs: null,
    rangeTrialPermissionContentMs: null,
    firstAttackSignatureContentMs: null,
    forcedHuntCount: 0,
    wildlifeHarmEventCount: 0,
    huntingIncomeCoin: 0,
    huntingActiveMs: 0,
    huntingActivityStartedContentMs: null,
    nonviolentJobIncomeCoin: 0,
    nonviolentJobActiveMs: 0,
    nonviolentJobStartedContentMs: null,
    duplicateCorpseLotCurrencyCount: 0,
    minimumNeedsValueObserved: null,
    maximumActiveNewWordsInAnySegment: 0,
  });
}

function bodyFromSave(save: BrowserProloguePlaytestSave): SaveBody {
  const { checksum: _checksum, ...body } = save;
  return body;
}

function frozenBody(value: MutableObservation): SaveBody {
  return Object.freeze({
    ...structuredClone(value),
    softFailureRecoveryDurationsMs: Object.freeze([...value.softFailureRecoveryDurationsMs]),
  });
}

function hasHistoricalMeasurementEvents(events: readonly GameSessionEvent[]): boolean {
  return events.some((event) =>
    event.type === "learning_evidence_committed" || event.type === "wildlife_damage_committed" ||
    event.type === "wildlife_death_committed" || event.type === "wildlife_processing_committed" ||
    event.type === "verified_trade_sale_committed" || event.type === "attack_prerequisites_verified" ||
    event.type === "safe_range_transfer_passed" ||
    (event.type === "quest_stage_set" && event.payload.questId === PROLOGUE_SETTLEMENT_TASK_ID) ||
    (event.type === "world_flag_set" &&
      (event.payload.flagId === PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.publicWellUsed ||
        event.payload.flagId === PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.communalPlantMealOffered)));
}

function duplicateTradeCurrencyCount(session: GameSessionState): number {
  const transactions = new Set<string>();
  const quotes = new Set<string>();
  let duplicates = 0;
  for (const receipt of session.economy.tradeReceipts) {
    if (transactions.has(receipt.transactionId) || quotes.has(receipt.quoteId)) duplicates += 1;
    transactions.add(receipt.transactionId);
    quotes.add(receipt.quoteId);
  }
  return duplicates;
}

function ledgerDigest(events: readonly GameSessionEvent[]): `sha256:${string}` {
  return sha256Canonical(events as unknown as JsonValue);
}

function validateActivitySnapshot(snapshot: ExclusiveActivitySnapshot): void {
  const total = INCLUDED_ACTIVITY_KINDS.reduce((sum, kind) => sum + count(snapshot.totalsMs[kind], `activity.${kind}`), 0);
  if (total !== snapshot.contentActiveMs || !Number.isSafeInteger(snapshot.observedAtMs) || snapshot.observedAtMs < 0) {
    throw new Error("playtest activity snapshot is inconsistent");
  }
  if (snapshot.activeKind !== null && !(ACCEPTANCE.telemetry.includedPrimaryActivities as readonly string[])
    .includes(snapshot.activeKind) && !(ACCEPTANCE.telemetry.excludedActivities as readonly string[]).includes(snapshot.activeKind)) {
    throw new Error("playtest activity kind is noncanonical");
  }
}

function recoveryDurations(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length > MAX_RECOVERY_SAMPLES) throw new Error("recovery durations are invalid");
  return Object.freeze(value.map((entry, index) => count(entry, `recoveryDurations[${index}]`)));
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}

function boundedCount(value: unknown, maximum: number, label: string): number {
  const result = count(value, label);
  if (result > maximum) throw new Error(`${label} exceeds its bound`);
  return result;
}

function optionalTimestamp(value: unknown, maximum: number, label: string): number | null {
  return value === null ? null : boundedCount(value, maximum, label);
}

function optionalBoundedCount(value: unknown, maximum: number, label: string): number | null {
  return value === null ? null : boundedCount(value, maximum, label);
}

function semanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMANTIC_ID.test(value)) throw new Error(`${label} must be a semantic identifier`);
  return value;
}

export type { PrologueIncludedActivityKind };
