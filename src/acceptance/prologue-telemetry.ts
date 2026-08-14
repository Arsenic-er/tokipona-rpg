import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  PROLOGUE_EXCLUDED_ACTIVITY_KINDS,
  PROLOGUE_INCLUDED_ACTIVITY_KINDS,
  PROLOGUE_TELEMETRY_EVENT_IDS,
  PROLOGUE_TELEMETRY_SEMANTIC_FIELDS,
  readRuntimePrologueAcceptanceManifest,
  type PrologueActivityKind,
  type PrologueIncludedActivityKind,
  type PrologueTelemetryEventId,
} from "../content/runtime-prologue-acceptance-manifest";

const CONTRACT = readRuntimePrologueAcceptanceManifest(generatedRuntimeArtifact);
const ACTIVITY_KINDS = Object.freeze([...PROLOGUE_INCLUDED_ACTIVITY_KINDS, ...PROLOGUE_EXCLUDED_ACTIVITY_KINDS]);
const SEMANTIC_ID = /^[a-z0-9][a-z0-9_.:-]*$/;

export interface PrologueTelemetrySemantic {
  readonly subjectId: string | null;
  readonly outcomeId: string | null;
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

export class ExclusivePrologueActivityTimer {
  readonly #totals = new Map<PrologueActivityKind, number>(ACTIVITY_KINDS.map((kind) => [kind, 0]));
  #active: PrologueActivityKind | null = null;
  #activeSinceMs = 0;
  #lastBoundaryMs = 0;

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

  constructor(sessionId: string, timer: ExclusivePrologueActivityTimer) {
    this.#sessionId = semanticId(sessionId, "sessionId");
    this.#timer = timer;
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

export function emptyPrologueTelemetrySemantic(overrides: Partial<PrologueTelemetrySemantic> = {}): PrologueTelemetrySemantic {
  return validateSemantic({ subjectId: null, outcomeId: null, promptLevel: null, count: null, durationMs: null, ...overrides });
}

function validateSemantic(value: unknown): PrologueTelemetrySemantic {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("telemetry semantic must be an object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== PROLOGUE_TELEMETRY_SEMANTIC_FIELDS.length || PROLOGUE_TELEMETRY_SEMANTIC_FIELDS.some((key) => !(key in record))) throw new Error("telemetry semantic contains unknown or missing fields");
  const subjectId = record.subjectId === null ? null : semanticId(record.subjectId, "semantic.subjectId");
  const outcomeId = record.outcomeId === null ? null : semanticId(record.outcomeId, "semantic.outcomeId");
  if (record.promptLevel !== null && record.promptLevel !== 0 && record.promptLevel !== 1) throw new Error("semantic.promptLevel must be H0, H1, or null");
  const count = nullableNonNegativeSafeInteger(record.count, "semantic.count");
  const durationMs = nullableNonNegativeSafeInteger(record.durationMs, "semantic.durationMs");
  return Object.freeze({ subjectId, outcomeId, promptLevel: record.promptLevel as 0 | 1 | null, count, durationMs });
}

function validateActivity(value: string): asserts value is PrologueActivityKind { if (!(ACTIVITY_KINDS as readonly string[]).includes(value)) throw new Error("primary activity is outside the generated taxonomy"); }
function validateTimestamp(value: number, minimum: number): void { if (!Number.isSafeInteger(value) || value < 0 || value < minimum) throw new Error("activity timestamp must be monotonic non-negative milliseconds"); }
function semanticId(value: unknown, label: string): string { if (typeof value !== "string" || !SEMANTIC_ID.test(value)) throw new Error(`${label} must be a semantic identifier`); return value; }
function nullableNonNegativeSafeInteger(value: unknown, label: string): number | null { if (value === null) return null; if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer or null`); return value as number; }
