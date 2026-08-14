import { describe, expect, it } from "vitest";
import pronunciation from "./p0-pronunciation-manifest.v0.1.json";
import release from "./runtime-release-contract.v0.1.json";
import { readRuntimeP0AssetReadiness } from "./runtime-p0-assets";

describe("P0 external asset release gate", () => {
  it("fails closed while private audio and glyph approvals are absent", () => {
    expect(readRuntimeP0AssetReadiness()).toMatchObject({
      pronunciationAudio: "blocked_pending_private_assets",
      approvedGlyphRelease: "blocked_pending_private_approval",
      playableContentMayClaimFullAssetAcceptance: false,
    });
    expect(Object.values(readRuntimeP0AssetReadiness().wordAudioReady)).toEqual(Array(12).fill(false));
  });

  it("rejects partial audio metadata instead of treating it as approved", () => {
    const partial = structuredClone(pronunciation) as any;
    partial.entries.telo.audioAssetId = "audio.telo.unapproved";
    expect(() => readRuntimeP0AssetReadiness(partial, release)).toThrow(/partially approved/);
  });

  it("requires the exact P0 word set and a recognized glyph gate status", () => {
    const missing = structuredClone(pronunciation) as any;
    delete missing.entries.weka;
    expect(() => readRuntimeP0AssetReadiness(missing, release)).toThrow(/exactly 12/);
    const invalidRelease = { ...release, status: "draft" };
    expect(() => readRuntimeP0AssetReadiness(pronunciation, invalidRelease)).toThrow(/glyph release status/);
  });
});
