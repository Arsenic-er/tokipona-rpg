import { describe, expect, it } from "vitest";
import pronunciation from "./p0-pronunciation-manifest.v0.1.json";
import release from "./runtime-release-contract.v0.1.json";
import {
  readApprovedRuntimeP0PronunciationAssets,
  readRuntimeP0AssetReadiness,
} from "./runtime-p0-assets";

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
    expect(() => readRuntimeP0AssetReadiness(pronunciation, invalidRelease)).toThrow(/glyph release contract identity/);
  });

  it("accepts only a complete canonical approved pronunciation subset", () => {
    const approved = approvedPronunciation();
    const approvedRelease = structuredClone(release) as any;
    approvedRelease.status = "approved";
    approvedRelease.currentAudits = approvedRelease.currentAudits.map((audit: any) => ({
      ...audit,
      decision: "allow",
      reasonCodes: [],
    }));
    expect(readRuntimeP0AssetReadiness(approved, approvedRelease)).toMatchObject({
      pronunciationAudio: "approved",
      approvedGlyphRelease: "approved",
      playableContentMayClaimFullAssetAcceptance: true,
    });
    expect(readApprovedRuntimeP0PronunciationAssets(approved).entries.telo).toEqual({
      assetId: "audio.pronunciation.telo.v1",
      publicPath: "assets/pronunciation/telo.ogg",
      sha256: `sha256:${"a".repeat(64)}`,
    });

    const rebound = structuredClone(approved) as any;
    rebound.entries.telo.publicPath = "assets/pronunciation/tawa.ogg";
    expect(() => readApprovedRuntimeP0PronunciationAssets(rebound)).toThrow(/partially approved/);

    const unknown = structuredClone(approved) as any;
    unknown.entries.telo.privateReviewPath = "C:\\review\\telo.wav";
    expect(() => readApprovedRuntimeP0PronunciationAssets(unknown)).toThrow(/unknown or missing/);
  });
});

function approvedPronunciation(): any {
  const approved = structuredClone(pronunciation) as any;
  approved.status = "approved";
  for (const wordId of approved.wordIds) {
    approved.entries[wordId] = {
      audioAssetId: `audio.pronunciation.${wordId}.v1`,
      publicPath: `assets/pronunciation/${wordId}.ogg`,
      sha256: `sha256:${"a".repeat(64)}`,
      sourceUrl: `https://assets.example.invalid/pronunciation/${wordId}.ogg`,
      licenseSpdx: "CC-BY-4.0",
      redistributionApproved: true,
      languageReviewApproved: true,
      communityReviewApproved: true,
    };
  }
  return approved;
}
