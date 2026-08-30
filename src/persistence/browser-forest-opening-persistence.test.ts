import { describe, expect, it } from "vitest";
import { sha256Canonical, type JsonValue } from "../canonical-json";
import { PrologueForestOpeningSession } from "../game/prologue-forest-opening";
import {
  BROWSER_FOREST_OPENING_SAVE_SCHEMA,
  BrowserForestOpeningPersistence,
  createBrowserForestOpeningSave,
  readBrowserForestOpeningSave,
  type BrowserForestOpeningSave,
  type ForestOpeningStorage,
  type PageHideTarget,
} from "./browser-forest-opening-persistence";

class MemoryStorage implements ForestOpeningStorage {
  public readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

class MemoryPageHideTarget implements PageHideTarget {
  private readonly listeners = new Set<() => void>();
  public addEventListener(type: "pagehide", listener: () => void): void {
    if (type === "pagehide") this.listeners.add(listener);
  }
  public removeEventListener(type: "pagehide", listener: () => void): void {
    if (type === "pagehide") this.listeners.delete(listener);
  }
  public hide(): void { for (const listener of this.listeners) listener(); }
}

function fresh(suffix = "default"): PrologueForestOpeningSession {
  return PrologueForestOpeningSession.fresh({
    sessionId: `browser.forest.${suffix}`,
    seed: `browser.forest.${suffix}.seed`,
  });
}

function resign(save: BrowserForestOpeningSave): BrowserForestOpeningSave {
  const body = Object.fromEntries(Object.entries(save).filter(([key]) => key !== "checksum"));
  return { ...save, checksum: sha256Canonical(body as JsonValue) };
}

describe("BrowserForestOpeningPersistence", () => {
  it("writes and restores one exact checksummed session + spatial envelope", () => {
    const storage = new MemoryStorage();
    const persistence = new BrowserForestOpeningPersistence(storage, "forest.opening");
    const target = fresh("roundtrip");
    target.advanceTicks(90, { moveX: 1 });

    const written = persistence.save(target);
    const loaded = persistence.load();

    expect(written).toMatchObject({
      schema: BROWSER_FOREST_OPENING_SAVE_SCHEMA,
      savedAtTick: 90,
      session: { sessionId: "browser.forest.roundtrip" },
      spatial: { spatial: { tick: 90 } },
    });
    expect(loaded).toEqual({ ok: true, save: written });
    expect(persistence.restore(written).toSave()).toEqual(target.toSave());
  });

  it("distinguishes missing, invalid JSON, incompatible schema, and invalid save without erasing bytes", () => {
    const storage = new MemoryStorage();
    const persistence = new BrowserForestOpeningPersistence(storage, "forest.opening");
    expect(persistence.load()).toEqual({ ok: false, reason: "missing" });

    storage.setItem("forest.opening", "{not-json");
    expect(persistence.load()).toEqual({ ok: false, reason: "invalid_json" });
    expect(storage.getItem("forest.opening")).toBe("{not-json");

    storage.setItem("forest.opening", JSON.stringify({ schema: "old.save" }));
    expect(persistence.load()).toEqual({ ok: false, reason: "incompatible" });

    const valid = createBrowserForestOpeningSave(fresh("invalid"));
    storage.setItem("forest.opening", JSON.stringify({ ...valid, checksum: `sha256:${"0".repeat(64)}` }));
    expect(persistence.load()).toEqual({ ok: false, reason: "invalid_save" });
    expect(storage.getItem("forest.opening")).not.toBeNull();
  });

  it("rejects unknown keys, nested tampering, stale ticks, and mismatched story/runtime truth", () => {
    const clean = createBrowserForestOpeningSave(fresh("tamper"));
    expect(() => readBrowserForestOpeningSave({ ...clean, unknown: true })).toThrow(/unknown|fields/i);
    expect(() => readBrowserForestOpeningSave(resign({
      ...clean,
      spatial: { ...clean.spatial, worldMinute: clean.spatial.worldMinute + 1 },
    }))).toThrow(/checksum|timeline|save/i);
    expect(() => readBrowserForestOpeningSave(resign({ ...clean, savedAtTick: 999 }))).toThrow(/tick|stale/i);

    const solved = fresh("solved");
    const positionedCoordinator = solved.toSave();
    const positionedRuntime = {
      ...positionedCoordinator.runtime,
      spatial: {
        ...positionedCoordinator.runtime.spatial,
        player: { ...positionedCoordinator.runtime.spatial.player, x: 1_832, y: 702 },
      },
    };
    const runtimeBody = Object.fromEntries(Object.entries(positionedRuntime).filter(([key]) => key !== "checksum"));
    const positioned = PrologueForestOpeningSession.fromSave({
      ...positionedCoordinator,
      runtime: { ...positionedRuntime, checksum: sha256Canonical(runtimeBody as JsonValue) },
      checksum: sha256Canonical({
        schema: positionedCoordinator.schema,
        manifestDigest: positionedCoordinator.manifestDigest,
        session: positionedCoordinator.session,
        runtime: { ...positionedRuntime, checksum: sha256Canonical(runtimeBody as JsonValue) },
      } as unknown as JsonValue),
    });
    positioned.interact("stone.a", { kind: "push_stone", objectId: "stream.stone.a", direction: 1 }, 0);
    positioned.interact("stone.b", { kind: "push_stone", objectId: "stream.stone.b", direction: 1 }, 1);
    const solvedSave = createBrowserForestOpeningSave(positioned);
    const mismatched = resign({ ...clean, session: solvedSave.session });
    expect(() => readBrowserForestOpeningSave(mismatched)).toThrow(/physical|story|solution/i);
  });

  it("is byte-stable for duplicate writes and persists the latest state on pagehide", () => {
    const storage = new MemoryStorage();
    const page = new MemoryPageHideTarget();
    const persistence = new BrowserForestOpeningPersistence(storage, "forest.opening");
    const target = fresh("pagehide");
    const first = persistence.save(target);
    const bytes = storage.getItem("forest.opening");
    expect(persistence.save(target)).toEqual(first);
    expect(storage.getItem("forest.opening")).toBe(bytes);

    const dispose = persistence.bindPagehide(page, () => target);
    target.advanceTicks(17, { moveX: 1 });
    page.hide();
    expect(persistence.load()).toMatchObject({ ok: true, save: { savedAtTick: 17 } });
    dispose();
    target.advanceTicks(1, { moveX: 1 });
    page.hide();
    expect(persistence.load()).toMatchObject({ ok: true, save: { savedAtTick: 17 } });
  });

  it("exports the original backup and resets only through an explicit destructive call", () => {
    const storage = new MemoryStorage();
    const persistence = new BrowserForestOpeningPersistence(storage, "forest.opening");
    persistence.save(fresh("backup"));
    const backup = persistence.exportBackup();

    expect(backup).toBe(storage.getItem("forest.opening"));
    expect(persistence.reset()).toBe(backup);
    expect(storage.getItem("forest.opening")).toBeNull();
    expect(persistence.reset()).toBeNull();
  });
});
