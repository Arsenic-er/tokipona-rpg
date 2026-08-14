import {
  PROLOGUE_EXCLUDED_ACTIVITY_KINDS,
  PROLOGUE_INCLUDED_ACTIVITY_KINDS,
  type PrologueActivityKind,
} from "../content/runtime-prologue-acceptance-manifest";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  ExclusivePrologueActivityTimer,
  PrologueTelemetryRecorder,
  emptyPrologueTelemetrySemantic,
  type ExclusiveActivitySnapshot,
  type PrologueTelemetryEvent,
} from "./prologue-telemetry";

export const BROWSER_PROLOGUE_TELEMETRY_SCHEMA = "tokipona.browser-prologue-telemetry.v0.1" as const;
const ACTIVITY_KINDS = Object.freeze([...PROLOGUE_INCLUDED_ACTIVITY_KINDS, ...PROLOGUE_EXCLUDED_ACTIVITY_KINDS]);
const MAX_EVENTS = 4_096;

export interface BrowserTelemetryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BrowserPrologueTelemetrySave {
  readonly schema: typeof BROWSER_PROLOGUE_TELEMETRY_SCHEMA;
  readonly sessionId: string;
  readonly totalsMs: Readonly<Record<PrologueActivityKind, number>>;
  readonly events: readonly PrologueTelemetryEvent[];
  readonly lastSceneId: string;
  readonly checksum: `sha256:${string}`;
}

type SaveBody = Omit<BrowserPrologueTelemetrySave, "checksum">;

export class BrowserPrologueTelemetry {
  readonly #storage: BrowserTelemetryStorage;
  readonly #key: string;
  readonly #sessionId: string;
  readonly #timer: ExclusivePrologueActivityTimer;
  readonly #recorder: PrologueTelemetryRecorder;
  #active: PrologueActivityKind;
  #lastSceneId: string;

  private constructor(
    storage: BrowserTelemetryStorage,
    key: string,
    sessionId: string,
    totals: Readonly<Record<PrologueActivityKind, number>>,
    events: readonly PrologueTelemetryEvent[],
    lastSceneId: string,
    active: PrologueActivityKind,
    atMs: number,
  ) {
    this.#storage = storage;
    this.#key = key;
    this.#sessionId = sessionId;
    this.#timer = new ExclusivePrologueActivityTimer(totals);
    this.#recorder = new PrologueTelemetryRecorder(this.#sessionId, this.#timer, events);
    this.#lastSceneId = semanticId(lastSceneId, "lastSceneId");
    this.#active = active;
    this.#timer.start(active, timestamp(atMs));
  }

  static bootstrap(input: Readonly<{
    storage: BrowserTelemetryStorage;
    key: string;
    sessionId: string;
    sceneId: string;
    worldTick: number;
    active: PrologueActivityKind;
    atMs: number;
  }>): BrowserPrologueTelemetry {
    const sessionId = semanticId(input.sessionId, "sessionId");
    const sceneId = semanticId(input.sceneId, "sceneId");
    const raw = input.storage.getItem(input.key);
    let save: BrowserPrologueTelemetrySave | null = null;
    if (raw !== null) {
      try {
        save = readBrowserPrologueTelemetrySave(JSON.parse(raw) as unknown);
      } catch {
        // Telemetry is non-authoritative. A corrupt document is replaced rather than
        // blocking the gameplay save, which is recovered by its own stricter WAL path.
        save = null;
      }
    }
    if (save === null || save.sessionId !== sessionId) {
      const target = new BrowserPrologueTelemetry(
        input.storage,
        input.key,
        sessionId,
        emptyTotals(),
        [],
        sceneId,
        input.active,
        input.atMs,
      );
      target.#recordSegment("prologue_segment_started", sceneId, input.worldTick, input.atMs);
      target.flush(input.atMs);
      return target;
    }
    return new BrowserPrologueTelemetry(
      input.storage,
      input.key,
      sessionId,
      save.totalsMs,
      save.events,
      save.lastSceneId,
      input.active,
      input.atMs,
    );
  }

  observe(input: Readonly<{
    sceneId: string;
    worldTick: number;
    active: PrologueActivityKind;
    atMs: number;
  }>): void {
    const atMs = timestamp(input.atMs);
    this.#switchActivity(input.active, atMs);
    const sceneId = semanticId(input.sceneId, "sceneId");
    if (sceneId === this.#lastSceneId) return;
    this.#recordSegment("prologue_segment_completed", this.#lastSceneId, input.worldTick, atMs);
    this.#lastSceneId = sceneId;
    this.#recordSegment("prologue_segment_started", sceneId, input.worldTick, atMs);
    this.flush(atMs);
  }

  suspend(atMs: number): void {
    this.#switchActivity("idle", timestamp(atMs));
    this.flush(atMs);
  }

  flush(atMs: number): BrowserPrologueTelemetrySave {
    const snapshot = this.#timer.snapshot(timestamp(atMs));
    const body = Object.freeze({
      schema: BROWSER_PROLOGUE_TELEMETRY_SCHEMA,
      sessionId: this.#sessionId,
      totalsMs: snapshot.totalsMs,
      events: this.#recorder.events(),
      lastSceneId: this.#lastSceneId,
    }) satisfies SaveBody;
    const save = Object.freeze({ ...body, checksum: sha256Canonical(body as unknown as JsonValue) });
    this.#storage.setItem(this.#key, JSON.stringify(save));
    return save;
  }

  snapshot(atMs: number): Readonly<{ activity: ExclusiveActivitySnapshot; events: readonly PrologueTelemetryEvent[]; lastSceneId: string }> {
    return Object.freeze({ activity: this.#timer.snapshot(timestamp(atMs)), events: this.#recorder.events(), lastSceneId: this.#lastSceneId });
  }

  #switchActivity(active: PrologueActivityKind, atMs: number): void {
    if (!ACTIVITY_KINDS.includes(active)) throw new Error("browser activity is outside the generated taxonomy");
    if (active === this.#active) return;
    this.#timer.switchTo(active, atMs);
    this.#active = active;
  }

  #recordSegment(eventId: "prologue_segment_started" | "prologue_segment_completed", sceneId: string, worldTick: number, atMs: number): void {
    if (this.#recorder.events().length >= MAX_EVENTS) throw new Error("browser telemetry event capacity exceeded");
    this.#recorder.record({
      eventId,
      worldTick,
      segmentId: sceneId,
      atMs: timestamp(atMs),
      semantic: emptyPrologueTelemetrySemantic({ subjectId: sceneId, outcomeId: eventId === "prologue_segment_started" ? "segment.started" : "segment.completed" }),
    });
  }
}

export function readBrowserPrologueTelemetrySave(value: unknown): BrowserPrologueTelemetrySave {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("browser telemetry save must be an object");
  const record = value as Record<string, unknown>;
  const keys = ["schema", "sessionId", "totalsMs", "events", "lastSceneId", "checksum"] as const;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record)) ||
      record.schema !== BROWSER_PROLOGUE_TELEMETRY_SCHEMA ||
      typeof record.checksum !== "string" || !/^sha256:[0-9a-f]{64}$/.test(record.checksum)) {
    throw new Error("browser telemetry save shape is invalid");
  }
  const sessionId = semanticId(record.sessionId, "sessionId");
  const body = Object.freeze({
    schema: BROWSER_PROLOGUE_TELEMETRY_SCHEMA,
    sessionId,
    totalsMs: readTotals(record.totalsMs),
    events: readEvents(record.events, sessionId),
    lastSceneId: semanticId(record.lastSceneId, "lastSceneId"),
  }) satisfies SaveBody;
  if (sha256Canonical(body as unknown as JsonValue) !== record.checksum) throw new Error("browser telemetry checksum mismatch");
  return Object.freeze({ ...body, checksum: record.checksum as `sha256:${string}` });
}

function emptyTotals(): Readonly<Record<PrologueActivityKind, number>> {
  return Object.freeze(Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, 0])) as Record<PrologueActivityKind, number>);
}

function readTotals(value: unknown): Readonly<Record<PrologueActivityKind, number>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("browser telemetry totals are invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== ACTIVITY_KINDS.length || ACTIVITY_KINDS.some((kind) => !Number.isSafeInteger(record[kind]) || (record[kind] as number) < 0)) throw new Error("browser telemetry totals are invalid");
  return Object.freeze(Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, record[kind] as number])) as Record<PrologueActivityKind, number>);
}

function readEvents(value: unknown, sessionId: string): readonly PrologueTelemetryEvent[] {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) throw new Error("browser telemetry events are invalid");
  // PrologueTelemetryRecorder performs the strict per-event validation and sequencing check.
  const timer = new ExclusivePrologueActivityTimer();
  if (value.length === 0) return Object.freeze([]);
  const recorder = new PrologueTelemetryRecorder(sessionId, timer, value as PrologueTelemetryEvent[]);
  return recorder.events();
}

function timestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("browser telemetry timestamp must be a non-negative safe integer");
  return value;
}

function semanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_.:-]*$/.test(value)) throw new Error(`${label} must be a semantic identifier`);
  return value;
}
