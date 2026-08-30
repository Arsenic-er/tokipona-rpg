import { sha256Canonical, type JsonValue } from "../canonical-json";
import {
  PROLOGUE_FOREST_OPENING_SAVE_SCHEMA,
  PrologueForestOpeningSession,
  type PrologueForestOpeningSave,
} from "../game/prologue-forest-opening";
import type { GameSessionSave } from "../session/game-session";
import type { ForestOpeningRuntimeSave } from "../world/forest-opening-runtime";

export const BROWSER_FOREST_OPENING_SAVE_SCHEMA = "tokipona.browser-forest-opening.v0.1" as const;

export interface BrowserForestOpeningSave {
  readonly schema: typeof BROWSER_FOREST_OPENING_SAVE_SCHEMA;
  readonly savedAtTick: number;
  readonly acceptance: Readonly<{ readonly killCount: 0 }>;
  readonly session: GameSessionSave;
  readonly spatial: ForestOpeningRuntimeSave;
  readonly checksum: `sha256:${string}`;
}

export type ForestOpeningLoadResult =
  | Readonly<{ ok: true; save: BrowserForestOpeningSave }>
  | Readonly<{ ok: false; reason: "missing" | "invalid_json" | "invalid_save" | "incompatible" }>;

export interface ForestOpeningStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PageHideTarget {
  addEventListener(type: "pagehide", listener: () => void): void;
  removeEventListener(type: "pagehide", listener: () => void): void;
}

export interface VisibilityTarget {
  readonly visibilityState: "visible" | "hidden" | "prerender";
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export function createBrowserForestOpeningSave(
  session: PrologueForestOpeningSession,
): BrowserForestOpeningSave {
  const source = session.toSave();
  const snapshot = session.snapshot();
  const body = {
    schema: BROWSER_FOREST_OPENING_SAVE_SCHEMA,
    savedAtTick: source.runtime.spatial.tick,
    acceptance: Object.freeze({ killCount: snapshot.killCount }),
    session: source.session,
    spatial: source.runtime,
  };
  return Object.freeze({ ...body, checksum: sha256Canonical(body as unknown as JsonValue) });
}

export function readBrowserForestOpeningSave(candidate: unknown): BrowserForestOpeningSave {
  const raw = record(candidate, "browser forest opening save");
  exactKeys(raw, ["schema", "savedAtTick", "acceptance", "session", "spatial", "checksum"], "browser forest opening save");
  if (raw.schema !== BROWSER_FOREST_OPENING_SAVE_SCHEMA) throw new Error("browser forest opening save is incompatible");
  if (!Number.isSafeInteger(raw.savedAtTick) || (raw.savedAtTick as number) < 0) {
    throw new Error("browser forest opening saved tick is invalid");
  }
  const acceptance = record(raw.acceptance, "browser forest opening acceptance");
  exactKeys(acceptance, ["killCount"], "browser forest opening acceptance");
  if (acceptance.killCount !== 0) throw new Error("browser forest opening acceptance kill count is invalid");
  const checksum = sha(raw.checksum, "browser forest opening checksum");
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "checksum"));
  if (sha256Canonical(body as JsonValue) !== checksum) throw new Error("browser forest opening checksum mismatch");

  const coordinator = restoreCoordinator(
    structuredClone(raw.session) as GameSessionSave,
    structuredClone(raw.spatial) as ForestOpeningRuntimeSave,
  );
  const canonical = createBrowserForestOpeningSave(coordinator);
  if (canonical.savedAtTick !== raw.savedAtTick) throw new Error("browser forest opening save has a stale tick");
  if (canonical.checksum !== checksum) throw new Error("browser forest opening save is noncanonical");
  return canonical;
}

export class BrowserForestOpeningPersistence {
  private readonly storage: ForestOpeningStorage;
  private readonly key: string;

  public constructor(storage: ForestOpeningStorage, key: string) {
    if (!key.trim()) throw new Error("browser forest opening storage key is required");
    this.storage = storage;
    this.key = key;
  }

  public load(): ForestOpeningLoadResult {
    const bytes = this.storage.getItem(this.key);
    if (bytes === null) return Object.freeze({ ok: false, reason: "missing" });
    let candidate: unknown;
    try {
      candidate = JSON.parse(bytes) as unknown;
    } catch {
      return Object.freeze({ ok: false, reason: "invalid_json" });
    }
    if (!isCurrentSchema(candidate)) return Object.freeze({ ok: false, reason: "incompatible" });
    try {
      return Object.freeze({ ok: true, save: readBrowserForestOpeningSave(candidate) });
    } catch {
      return Object.freeze({ ok: false, reason: "invalid_save" });
    }
  }

  public save(session: PrologueForestOpeningSession): BrowserForestOpeningSave {
    const save = createBrowserForestOpeningSave(session);
    this.storage.setItem(this.key, JSON.stringify(save));
    return save;
  }

  public restore(save: BrowserForestOpeningSave): PrologueForestOpeningSession {
    const verified = readBrowserForestOpeningSave(save);
    return restoreCoordinator(verified.session, verified.spatial);
  }

  public exportBackup(): string | null {
    return this.storage.getItem(this.key);
  }

  /** Returns the recoverable pre-reset bytes; callers decide whether to download them. */
  public reset(): string | null {
    const backup = this.storage.getItem(this.key);
    if (backup !== null) this.storage.removeItem(this.key);
    return backup;
  }

  public bindPagehide(
    target: PageHideTarget,
    current: () => PrologueForestOpeningSession | null,
  ): () => void {
    const listener = (): void => {
      const session = current();
      if (session !== null) this.save(session);
    };
    target.addEventListener("pagehide", listener);
    return (): void => { target.removeEventListener("pagehide", listener); };
  }

  public bindLifecycle(
    page: PageHideTarget,
    visibility: VisibilityTarget,
    current: () => PrologueForestOpeningSession | null,
  ): () => void {
    const flush = (): void => {
      const session = current();
      if (session !== null) this.save(session);
    };
    const hidden = (): void => { if (visibility.visibilityState === "hidden") flush(); };
    page.addEventListener("pagehide", flush);
    visibility.addEventListener("visibilitychange", hidden);
    return (): void => {
      page.removeEventListener("pagehide", flush);
      visibility.removeEventListener("visibilitychange", hidden);
    };
  }
}

function restoreCoordinator(
  session: GameSessionSave,
  runtime: ForestOpeningRuntimeSave,
): PrologueForestOpeningSession {
  const body = {
    schema: PROLOGUE_FOREST_OPENING_SAVE_SCHEMA,
    manifestDigest: runtime.manifestDigest,
    session,
    runtime,
  };
  const save: PrologueForestOpeningSave = Object.freeze({
    ...body,
    checksum: sha256Canonical(body as unknown as JsonValue),
  });
  return PrologueForestOpeningSession.fromSave(save);
}

function isCurrentSchema(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (value as { schema?: unknown }).schema === BROWSER_FOREST_OPENING_SAVE_SCHEMA;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function sha(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${label} is invalid`);
  return value as `sha256:${string}`;
}
