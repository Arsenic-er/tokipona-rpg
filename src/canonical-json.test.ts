import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Canonical } from "./canonical-json";

describe("dependency-neutral canonical JSON and SHA-256", () => {
  it("keeps the existing canonical ordering and fixed digest vectors", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(sha256Canonical({ b: 2, a: 1 }))
      .toBe("sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
    expect(sha256Canonical(["cross_save_wal.v0.1", "harvest", "event.1"]))
      .toBe("sha256:463458bd7034842662b2b93b2fda5bf531898a34ac125871cdeee35dd22ee9cd");
  });

  it("preserves strict rejection of non-finite numbers and negative zero", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow("canonical JSON number is invalid");
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow("canonical JSON number is invalid");
    expect(() => canonicalJson(-0)).toThrow("canonical JSON number is invalid");
  });
});
