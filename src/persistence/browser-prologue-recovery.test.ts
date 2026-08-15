import { describe, expect, it } from "vitest";
import {
  BROWSER_PROLOGUE_RECOVERY_BUNDLE_SCHEMA,
  clearBrowserPrologueRecoveryStorage,
  createBrowserPrologueRecoveryBundle,
  type BrowserPrologueRecoveryStorage,
} from "./browser-prologue-recovery";

class MemoryStorage implements BrowserPrologueRecoveryStorage {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("browser prologue startup recovery", () => {
  it("exports corrupt raw values without parsing, normalization, or deletion", () => {
    const storage = new MemoryStorage();
    storage.setItem("primary", "{broken-primary");
    storage.setItem("companion", "{broken-companion");

    const bundle = createBrowserPrologueRecoveryBundle(
      storage,
      ["primary", "companion", "telemetry"],
    );

    expect(bundle).toEqual({
      schemaVersion: BROWSER_PROLOGUE_RECOVERY_BUNDLE_SCHEMA,
      entries: [
        { key: "primary", rawValue: "{broken-primary" },
        { key: "companion", rawValue: "{broken-companion" },
        { key: "telemetry", rawValue: null },
      ],
    });
    expect(storage.getItem("primary")).toBe("{broken-primary");
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.entries)).toBe(true);
  });

  it("clears exactly the confirmed recovery key set and rejects ambiguous sets", () => {
    const storage = new MemoryStorage();
    storage.setItem("primary", "save");
    storage.setItem("companion", "wal");
    storage.setItem("unrelated", "keep");

    clearBrowserPrologueRecoveryStorage(storage, ["primary", "companion"]);

    expect(storage.getItem("primary")).toBeNull();
    expect(storage.getItem("companion")).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
    expect(() => createBrowserPrologueRecoveryBundle(storage, [])).toThrow(/keys/);
    expect(() => clearBrowserPrologueRecoveryStorage(storage, ["same", "same"]))
      .toThrow(/keys/);
  });
});
