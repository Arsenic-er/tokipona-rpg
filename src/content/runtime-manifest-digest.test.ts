import { describe, expect, it } from "vitest";
import { computeRuntimeManifestDigest, sha256Utf8, stableCanonicalJson } from "./runtime-manifest-digest";

describe("runtime manifest canonical digest", () => {
  it("matches standard SHA-256 fixed vectors", () => {
    expect(sha256Utf8("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Utf8("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("canonicalizes object keys without changing array order", () => {
    expect(stableCanonicalJson({ z: [2, 1], a: { d: true, c: null } })).toBe('{"a":{"c":null,"d":true},"z":[2,1]}');
    expect(computeRuntimeManifestDigest({ b: 2, a: 1 })).toBe("sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
  });

  it("rejects values that are not valid canonical JSON", () => {
    expect(() => stableCanonicalJson(undefined)).toThrow(/unsupported/);
    expect(() => stableCanonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });
});
