import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json" with { type: "json" };
import {
  PROLOGUE_EXCLUDED_ACTIVITY_KINDS,
  PROLOGUE_INCLUDED_ACTIVITY_KINDS,
  PROLOGUE_TELEMETRY_EVENT_IDS,
  PROLOGUE_TELEMETRY_SEMANTIC_FIELDS,
  readRuntimePrologueAcceptanceManifest,
  type PrologueActivityKind,
  type PrologueIncludedActivityKind,
  type PrologueTelemetryEventId,
} from "../content/runtime-prologue-acceptance-manifest.ts";

const CONTRACT = readRuntimePrologueAcceptanceManifest(generatedRuntimeArtifact);
const ACTIVITY_KINDS = Object.freeze([...PROLOGUE_INCLUDED_ACTIVITY_KINDS, ...PROLOGUE_EXCLUDED_ACTIVITY_KINDS]);
const SEMANTIC_ID = /^[a-z0-9][a-z0-9_.:-]*$/;

export interface PrologueTelemetrySemantic {
  readonly subjectId: string | null;
  readonly outcomeId: string | null;
  readonly practiceFamilyId: string | null;
  readonly promptLevel: 0 | 1 | null;
  readonly count: number | null;
  readonly durationMs: number | null;
}

export interface PrologueTelemetryEvent {
  readonly schemaVersion: "prologue.telemetry.v0.1";
  readonly eventId: PrologueTelemetryEventId;
  readonly sessionId: string;
  readonly sequence: number;
  readonly worldTick: number;
  readonly segmentId: string;
  readonly primaryActivity: PrologueActivityKind;
  readonly contentActiveMs: number;
  readonly semantic: PrologueTelemetrySemantic;
}

export interface ExclusiveActivitySnapshot {
  readonly activeKind: PrologueActivityKind | null;
  readonly observedAtMs: number;
  readonly totalsMs: Readonly<Record<PrologueActivityKind, number>>;
  readonly contentActiveMs: number;
  readonly excludedMs: number;
}

export interface PrologueActivityAcceptanceReport {
  readonly contentActiveMs: number;
  readonly shares: Readonly<Record<PrologueIncludedActivityKind, number>>;
  readonly passes: Readonly<{
    worldPeoplePhysicsMinimum: boolean;
    languageRange: boolean;
    longExplanationMaximum: boolean;
    exclusiveTaxonomy: true;
  }>;
  readonly accepted: boolean;
}

export interface PrologueQualificationTimingSample {
  readonly sessionId: string;
  readonly rangeTrialPermissionContentMs: number | null;
  readonly firstAttackSignatureContentMs: number | null;
}

export interface PrologueQualificationCohortAcceptanceReport {
  readonly sampleSize: number;
  readonly rangeTrialPermissionContentMsP90: number | null;
  readonly formalAttackUnlockByDeadlineProportion: number;
  readonly passes: Readonly<{
    rangeTrialPermissionP90: boolean;
    formalAttackUnlockProportion: boolean;
  }>;
  readonly accepted: boolean;
}

export interface PrologueCadenceAcceptanceReport {
  readonly contentActiveMs: number;
  readonly consequentialChoiceEventCount: number;
  readonly maximumConsequentialChoiceGapMs: number | null;
  readonly activeRetrievalEventCount: number;
  readonly activeRetrievalIntervalGapsMs: readonly number[];
  readonly trailingActiveRetrievalGapMs: number | null;
  readonly maximumConsecutiveSamePracticeFamily: number;
  readonly passes: Readonly<{
    consequentialChoiceMaximumGap: boolean;
    activeRetrievalIntervals: boolean;
    activeRetrievalTrailingWindow: boolean;
    practiceFamilyAlternation: boolean;
  }>;
  readonly accepted: boolean;
}

export class ExclusivePrologueActivityTimer {
  readonly #totals = new Map<PrologueActivityKind, number>(ACTIVITY_KINDS.map((kind) => [kind, 0]));
  #active: PrologueActivityKind | null = null;
  #activeSinceMs = 0;
  #lastBoundaryMs = 0;

  constructor(initialTotals: Partial<Readonly<Record<PrologueActivityKind, number>>> = {}) {
    for (const kind of ACTIVITY_KINDS) {
      const value = initialTotals[kind] ?? 0;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("initial activity totals must be non-negative safe integers");
      this.#totals.set(kind, value);
    }
  }

  start(kind: PrologueActivityKind, atMs: number): void {
    validateActivity(kind);
    validateTimestamp(atMs, this.#lastBoundaryMs);
    if (this.#active !== null) throw new Error("exclusive activity timer already has a primary activity");
    this.#active = kind;
    this.#activeSinceMs = atMs;
    this.#lastBoundaryMs = atMs;
  }

  switchTo(kind: PrologueActivityKind, atMs: number): void {
    validateActivity(kind);
    if (this.#active === null) throw new Error("exclusive activity timer has not started");
    validateTimestamp(atMs, this.#lastBoundaryMs);
    this.#closeActive(atMs);
    this.#active = kind;
    this.#activeSinceMs = atMs;
  }

  stop(atMs: number): void {
    if (this.#active === null) throw new Error("exclusive activity timer has no activity to stop");
    validateTimestamp(atMs, this.#lastBoundaryMs);
    this.#closeActive(atMs);
    this.#active = null;
  }

  snapshot(atMs: number): ExclusiveActivitySnapshot {
    validateTimestamp(atMs, this.#lastBoundaryMs);
    const totals = Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, this.#totals.get(kind) ?? 0])) as Record<PrologueActivityKind, number>;
    if (this.#active !== null) totals[this.#active] += atMs - this.#activeSinceMs;
    const contentActiveMs = PROLOGUE_INCLUDED_ACTIVITY_KINDS.reduce((sum, kind) => sum + totals[kind], 0);
    const excludedMs = PROLOGUE_EXCLUDED_ACTIVITY_KINDS.reduce((sum, kind) => sum + totals[kind], 0);
    return Object.freeze({ activeKind: this.#active, observedAtMs: atMs, totalsMs: Object.freeze(totals), contentActiveMs, excludedMs });
  }

  #closeActive(atMs: number): void {
    const active = this.#active;
    if (active === null) throw new Error("exclusive activity timer invariant failed");
    this.#totals.set(active, (this.#totals.get(active) ?? 0) + atMs - this.#activeSinceMs);
    this.#lastBoundaryMs = atMs;
  }
}

export class PrologueTelemetryRecorder {
  readonly #sessionId: string;
  readonly #timer: ExclusivePrologueActivityTimer;
  readonly #events: PrologueTelemetryEvent[] = [];

  constructor(
    sessionId: string,
    timer: ExclusivePrologueActivityTimer,
    priorEvents: readonly PrologueTelemetryEvent[] = [],
  ) {
    this.#sessionId = semanticId(sessionId, "sessionId");
    this.#timer = timer;
    let priorContentActiveMs = 0;
    priorEvents.forEach((candidate, index) => {
      const event = validateEvent(candidate, this.#sessionId, index + 1, priorContentActiveMs);
      priorContentActiveMs = event.contentActiveMs;
      this.#events.push(event);
    });
  }

  record(input: Readonly<{
    eventId: PrologueTelemetryEventId;
    worldTick: number;
    segmentId: string;
    semantic: PrologueTelemetrySemantic;
    atMs: number;
  }>): PrologueTelemetryEvent {
    if (!PROLOGUE_TELEMETRY_EVENT_IDS.includes(input.eventId)) throw new Error("telemetry eventId is not registered");
    if (!Number.isSafeInteger(input.worldTick) || input.worldTick < 0) throw new Error("telemetry worldTick must be a non-negative safe integer");
    const segmentId = semanticId(input.segmentId, "segmentId");
    const semantic = validateSemantic(input.semantic);
    const timer = this.#timer.snapshot(input.atMs);
    if (timer.activeKind === null) throw new Error("telemetry events require one active primary activity");
    const event = Object.freeze({
      schemaVersion: CONTRACT.telemetry.schemaVersion,
      eventId: input.eventId,
      sessionId: this.#sessionId,
      sequence: this.#events.length + 1,
      worldTick: input.worldTick,
      segmentId,
      primaryActivity: timer.activeKind,
      contentActiveMs: timer.contentActiveMs,
      semantic,
    }) satisfies PrologueTelemetryEvent;
    this.#events.push(event);
    return event;
  }

  events(): readonly PrologueTelemetryEvent[] {
    return Object.freeze([...this.#events]);
  }
}

export function evaluatePrologueActivityAcceptance(snapshot: ExclusiveActivitySnapshot): PrologueActivityAcceptanceReport {
  const total = snapshot.contentActiveMs;
  const shares = Object.freeze(Object.fromEntries(PROLOGUE_INCLUDED_ACTIVITY_KINDS.map((kind) => [kind, total === 0 ? 0 : snapshot.totalsMs[kind] / total])) as Record<PrologueIncludedActivityKind, number>);
  const [languageMinimum, languageMaximum] = CONTRACT.acceptance.playtest.languageActivityTimeShareRange;
  const passes = Object.freeze({
    worldPeoplePhysicsMinimum: shares.world_people_physics >= CONTRACT.acceptance.playtest.worldPeoplePhysicsTimeShareMinimum,
    languageRange: shares.language >= languageMinimum && shares.language <= languageMaximum,
    longExplanationMaximum: shares.long_explanation <= CONTRACT.acceptance.playtest.longExplanationPanelTimeShareMaximum,
    exclusiveTaxonomy: true as const,
  });
  return Object.freeze({ contentActiveMs: total, shares, passes, accepted: total > 0 && Object.values(passes).every(Boolean) });
}

/**
 * Evaluates observed playtest samples. Missing permission/signature timestamps
 * remain failures; callers must not manufacture successful samples from the
 * deterministic acceptance runner.
 */
export function evaluatePrologueQualificationCohort(
  samples: readonly PrologueQualificationTimingSample[],
): PrologueQualificationCohortAcceptanceReport {
  const maximumMs = CONTRACT.acceptance.playtest.rangeTrialPermissionContentMinutesP90Maximum * 60_000;
  const minimumUnlockProportion = CONTRACT.acceptance.playtest.formalAttackUnlockBy180ContentMinutesProportionMinimum;
  const normalized = samples.map((sample) => {
    semanticId(sample.sessionId, "qualification sample sessionId");
    validateOptionalContentTimestamp(sample.rangeTrialPermissionContentMs, "rangeTrialPermissionContentMs");
    validateOptionalContentTimestamp(sample.firstAttackSignatureContentMs, "firstAttackSignatureContentMs");
    if (sample.firstAttackSignatureContentMs !== null &&
        (sample.rangeTrialPermissionContentMs === null ||
          sample.firstAttackSignatureContentMs < sample.rangeTrialPermissionContentMs)) {
      throw new Error("first attack signature must follow range-trial permission");
    }
    return sample;
  });
  const permissionTimes = normalized
    .map((sample) => sample.rangeTrialPermissionContentMs ?? Number.POSITIVE_INFINITY)
    .sort((left, right) => left - right);
  const p90Index = permissionTimes.length === 0 ? -1 : Math.ceil(permissionTimes.length * 0.9) - 1;
  const rawP90 = p90Index < 0 ? Number.POSITIVE_INFINITY : permissionTimes[p90Index]!;
  const permissionP90 = Number.isFinite(rawP90) ? rawP90 : null;
  const unlocksByDeadline = normalized.filter((sample) =>
    sample.firstAttackSignatureContentMs !== null && sample.firstAttackSignatureContentMs <= maximumMs).length;
  const unlockProportion = normalized.length === 0 ? 0 : unlocksByDeadline / normalized.length;
  const passes = Object.freeze({
    rangeTrialPermissionP90: permissionP90 !== null && permissionP90 <= maximumMs,
    formalAttackUnlockProportion: normalized.length > 0 && unlockProportion >= minimumUnlockProportion,
  });
  return Object.freeze({
    sampleSize: normalized.length,
    rangeTrialPermissionContentMsP90: permissionP90,
    formalAttackUnlockByDeadlineProportion: unlockProportion,
    passes,
    accepted: Object.values(passes).every(Boolean),
  });
}

export function evaluatePrologueCadenceAcceptance(
  events: readonly PrologueTelemetryEvent[],
  contentActiveMs: number,
): PrologueCadenceAcceptanceReport {
  if (!Number.isSafeInteger(contentActiveMs) || contentActiveMs <= 0) {
    throw new Error("cadence contentActiveMs must be a positive safe integer");
  }
  let minimumContentActiveMs = 0;
  const sessionId = events[0]?.sessionId ?? "cadence.empty";
  const validated = events.map((event, index) => {
    const candidate = validateEvent(event, sessionId, index + 1, minimumContentActiveMs);
    minimumContentActiveMs = candidate.contentActiveMs;
    if (candidate.contentActiveMs > contentActiveMs) {
      throw new Error("telemetry event exceeds the cadence content window");
    }
    return candidate;
  });
  const choiceEventIds = CONTRACT.telemetry.cadence.consequentialChoiceEventIds as readonly PrologueTelemetryEventId[];
  const retrievalEventIds = CONTRACT.telemetry.cadence.activeRetrievalEventIds as readonly PrologueTelemetryEventId[];
  const choiceTimes = validated.filter((event) => choiceEventIds.includes(event.eventId))
    .map((event) => event.contentActiveMs);
  const choiceBoundaries = [0, ...choiceTimes, contentActiveMs];
  const choiceGaps = choiceBoundaries.slice(1).map((time, index) => time - choiceBoundaries[index]!);
  const maximumChoiceGap = choiceGaps.length === 0 ? null : Math.max(...choiceGaps);

  const retrievals = validated.filter((event) => retrievalEventIds.includes(event.eventId));
  const retrievalFamilies = retrievals.map((event) => {
    if (event.semantic.practiceFamilyId === null) {
      throw new Error("active retrieval telemetry requires practiceFamilyId");
    }
    return event.semantic.practiceFamilyId;
  });
  const retrievalTimes = retrievals.map((event) => event.contentActiveMs);
  const retrievalIntervals = retrievalTimes.map((time, index) => time - (retrievalTimes[index - 1] ?? 0));
  const trailingRetrievalGap = retrievalTimes.length === 0
    ? null
    : contentActiveMs - retrievalTimes[retrievalTimes.length - 1]!;
  let maximumConsecutiveFamily = 0;
  let currentFamily: string | null = null;
  let currentFamilyCount = 0;
  for (const family of retrievalFamilies) {
    if (family === currentFamily) currentFamilyCount += 1;
    else {
      currentFamily = family;
      currentFamilyCount = 1;
    }
    maximumConsecutiveFamily = Math.max(maximumConsecutiveFamily, currentFamilyCount);
  }
  const [minimumRetrievalGapMinutes, maximumRetrievalGapMinutes] =
    CONTRACT.telemetry.cadence.activeRetrievalIntervalMinutes;
  const minimumRetrievalGapMs = minimumRetrievalGapMinutes * 60_000;
  const maximumRetrievalGapMs = maximumRetrievalGapMinutes * 60_000;
  const passes = Object.freeze({
    consequentialChoiceMaximumGap: maximumChoiceGap !== null &&
      maximumChoiceGap <= CONTRACT.telemetry.cadence.consequentialChoiceMaximumGapMinutes * 60_000,
    activeRetrievalIntervals: retrievalIntervals.length > 0 && retrievalIntervals.every((gap) =>
      gap >= minimumRetrievalGapMs && gap <= maximumRetrievalGapMs),
    activeRetrievalTrailingWindow: trailingRetrievalGap !== null && trailingRetrievalGap <= maximumRetrievalGapMs,
    practiceFamilyAlternation: retrievalFamilies.length > 0 &&
      maximumConsecutiveFamily <= CONTRACT.telemetry.cadence.maximumConsecutiveSamePracticeFamily,
  });
  return Object.freeze({
    contentActiveMs,
    consequentialChoiceEventCount: choiceTimes.length,
    maximumConsequentialChoiceGapMs: maximumChoiceGap,
    activeRetrievalEventCount: retrievalTimes.length,
    activeRetrievalIntervalGapsMs: Object.freeze(retrievalIntervals),
    trailingActiveRetrievalGapMs: trailingRetrievalGap,
    maximumConsecutiveSamePracticeFamily: maximumConsecutiveFamily,
    passes,
    accepted: Object.values(passes).every(Boolean),
  });
}

export function emptyPrologueTelemetrySemantic(overrides: Partial<PrologueTelemetrySemantic> = {}): PrologueTelemetrySemantic {
  return validateSemantic({ subjectId: null, outcomeId: null, practiceFamilyId: null, promptLevel: null, count: null, durationMs: null, ...overrides });
}

function validateSemantic(value: unknown): PrologueTelemetrySemantic {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("telemetry semantic must be an object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== PROLOGUE_TELEMETRY_SEMANTIC_FIELDS.length || PROLOGUE_TELEMETRY_SEMANTIC_FIELDS.some((key) => !(key in record))) throw new Error("telemetry semantic contains unknown or missing fields");
  const subjectId = record.subjectId === null ? null : semanticId(record.subjectId, "semantic.subjectId");
  const outcomeId = record.outcomeId === null ? null : semanticId(record.outcomeId, "semantic.outcomeId");
  const practiceFamilyId = record.practiceFamilyId === null ? null : semanticId(record.practiceFamilyId, "semantic.practiceFamilyId");
  if (record.promptLevel !== null && record.promptLevel !== 0 && record.promptLevel !== 1) throw new Error("semantic.promptLevel must be H0, H1, or null");
  const count = nullableNonNegativeSafeInteger(record.count, "semantic.count");
  const durationMs = nullableNonNegativeSafeInteger(record.durationMs, "semantic.durationMs");
  return Object.freeze({ subjectId, outcomeId, practiceFamilyId, promptLevel: record.promptLevel as 0 | 1 | null, count, durationMs });
}

function validateEvent(
  value: unknown,
  sessionId: string,
  expectedSequence: number,
  minimumContentActiveMs: number,
): PrologueTelemetryEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("telemetry event must be an object");
  const record = value as Record<string, unknown>;
  const required = ["schemaVersion", "eventId", "sessionId", "sequence", "worldTick", "segmentId", "primaryActivity", "contentActiveMs", "semantic"] as const;
  if (Object.keys(record).length !== required.length || required.some((key) => !(key in record))) throw new Error("telemetry event contains unknown or missing fields");
  if (record.schemaVersion !== CONTRACT.telemetry.schemaVersion ||
      !PROLOGUE_TELEMETRY_EVENT_IDS.includes(record.eventId as PrologueTelemetryEventId) ||
      record.sessionId !== sessionId || record.sequence !== expectedSequence ||
      !Number.isSafeInteger(record.worldTick) || (record.worldTick as number) < 0 ||
      !Number.isSafeInteger(record.contentActiveMs) || (record.contentActiveMs as number) < minimumContentActiveMs) {
    throw new Error("telemetry event identity or counters are invalid");
  }
  validateActivity(record.primaryActivity as string);
  const event = Object.freeze({
    schemaVersion: CONTRACT.telemetry.schemaVersion,
    eventId: record.eventId as PrologueTelemetryEventId,
    sessionId,
    sequence: expectedSequence,
    worldTick: record.worldTick as number,
    segmentId: semanticId(record.segmentId, "segmentId"),
    primaryActivity: record.primaryActivity as PrologueActivityKind,
    contentActiveMs: record.contentActiveMs as number,
    semantic: validateSemantic(record.semantic),
  }) satisfies PrologueTelemetryEvent;
  return event;
}

function validateActivity(value: string): asserts value is PrologueActivityKind { if (!(ACTIVITY_KINDS as readonly string[]).includes(value)) throw new Error("primary activity is outside the generated taxonomy"); }
function validateTimestamp(value: number, minimum: number): void { if (!Number.isSafeInteger(value) || value < 0 || value < minimum) throw new Error("activity timestamp must be monotonic non-negative milliseconds"); }
function semanticId(value: unknown, label: string): string { if (typeof value !== "string" || !SEMANTIC_ID.test(value)) throw new Error(`${label} must be a semantic identifier`); return value; }
function nullableNonNegativeSafeInteger(value: unknown, label: string): number | null { if (value === null) return null; if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer or null`); return value as number; }
function validateOptionalContentTimestamp(value: number | null, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative safe integer or null`);
  }
}
