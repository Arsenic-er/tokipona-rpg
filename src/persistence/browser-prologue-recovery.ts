export const BROWSER_PROLOGUE_RECOVERY_BUNDLE_SCHEMA =
  "tokipona.browser-prologue-recovery-bundle.v0.1" as const;

export interface BrowserPrologueRecoveryStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface BrowserPrologueRecoveryBundle {
  readonly schemaVersion: typeof BROWSER_PROLOGUE_RECOVERY_BUNDLE_SCHEMA;
  readonly entries: readonly Readonly<{
    readonly key: string;
    readonly rawValue: string | null;
  }>[];
}

/**
 * Captures the original strings without parsing or normalizing them. A corrupt
 * companion must remain exportable for support instead of being silently
 * replaced by an older checkpoint.
 */
export function createBrowserPrologueRecoveryBundle(
  storage: Pick<BrowserPrologueRecoveryStorage, "getItem">,
  keys: readonly string[],
): BrowserPrologueRecoveryBundle {
  const normalized = recoveryKeys(keys);
  return deepFreeze({
    schemaVersion: BROWSER_PROLOGUE_RECOVERY_BUNDLE_SCHEMA,
    entries: normalized.map((key) => ({ key, rawValue: storage.getItem(key) })),
  });
}

/** Destructive only when called from an explicit, confirmed user action. */
export function clearBrowserPrologueRecoveryStorage(
  storage: Pick<BrowserPrologueRecoveryStorage, "removeItem">,
  keys: readonly string[],
): void {
  for (const key of recoveryKeys(keys)) storage.removeItem(key);
}

function recoveryKeys(keys: readonly string[]): readonly string[] {
  if (keys.length === 0 || keys.some((key) => typeof key !== "string" || key.trim().length === 0) ||
      new Set(keys).size !== keys.length) {
    throw new Error("browser prologue recovery keys must be unique nonempty strings");
  }
  return Object.freeze([...keys]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
