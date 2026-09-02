import { describe, expect, it } from "vitest";
import { createBrowserOperationNonce } from "./browser-operation-nonce";

describe("browser operation nonce", () => {
  it("uses getRandomValues and does not require secure-context randomUUID", () => {
    const calls: number[] = [];
    const nonce = createBrowserOperationNonce((values) => {
      calls.push(values.length);
      values.set([0, 1, 0x89abcdef, 0xffffffff]);
      return values;
    });

    expect(calls).toEqual([4]);
    expect(nonce).toBe("000000000000000189abcdefffffffff");
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});
