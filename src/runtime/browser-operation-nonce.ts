export type BrowserOperationEntropy = (
  values: Uint32Array<ArrayBuffer>,
) => Uint32Array<ArrayBuffer>;

/**
 * Produces a reload-unique operation identity without requiring a secure context.
 * `crypto.randomUUID()` is unavailable on plain-HTTP Tailscale/LAN origins, while
 * `crypto.getRandomValues()` remains available there.
 */
export function createBrowserOperationNonce(
  fill: BrowserOperationEntropy = (values) => globalThis.crypto.getRandomValues(values),
): string {
  const values = fill(new Uint32Array(4));
  if (values.length !== 4) throw new Error("browser operation entropy source returned the wrong length");
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}
