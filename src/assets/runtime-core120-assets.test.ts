import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import releaseContract from "./runtime-release-contract.v0.1.json";
import missingPrivateExport from "./runtime-core120-private-export.v0.1.json";
import {
  computeRuntimeCore120CurriculumDigest,
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../content/runtime-core120-curriculum-manifest";
import { computeRuntimeManifestDigest } from "../content/runtime-manifest-digest";
import {
  CORE120_PRIVATE_ASSET_EXPORT_SCHEMA,
  readRuntimeCore120AssetReadiness,
  runtimeCore120AssetReadiness,
} from "./runtime-core120-assets";

const manifest = readRuntimeCore120CurriculumManifest(generated);

function approvedManifest(): RuntimeCore120CurriculumManifest {
  const candidate = structuredClone(generated) as any;
  candidate.core120Curriculum.catalogReviewStatus = "approved";
  candidate.core120Curriculum.catalogRuntimeReady = true;
  const payload = Object.fromEntries(Object.entries(candidate.core120Curriculum).filter(([key]) => key !== "sourceDigest"));
  candidate.core120Curriculum.sourceDigest = computeRuntimeCore120CurriculumDigest(payload);
  return readRuntimeCore120CurriculumManifest(candidate);
}

function approvedRelease(): any {
  const candidate = structuredClone(releaseContract) as any;
  candidate.status = "approved";
  candidate.currentAudits = candidate.currentAudits.map((audit: any) => ({ ...audit, decision: "allow", reasonCodes: [] }));
  return candidate;
}

function privateExport(forManifest: RuntimeCore120CurriculumManifest): any {
  return {
    schemaVersion: CORE120_PRIVATE_ASSET_EXPORT_SCHEMA,
    status: "approved",
    manifestDigest: forManifest.sourceDigest,
    corpusId: "pu-120",
    wordIds: [...forManifest.scope.wordIds],
    glyphAtlas: {
      assetId: "glyph.pu120.atlas.v2",
      publicPath: "assets/magic-glyphs/pu120-atlas.v2.png",
      sha256: computeRuntimeManifestDigest(["glyph-atlas", forManifest.sourceDigest]),
      sourceUrl: "https://assets.example.invalid/toki-pona/pu120-atlas-v2.png",
      licenseSpdx: "CC-BY-4.0",
      redistributionApproved: true,
      sourceReviewApproved: true,
      licenseReviewApproved: true,
      languageReviewApproved: true,
      pixelReviewApproved: true,
      animationReviewApproved: true,
      accessibilityReviewApproved: true,
      communityReviewApproved: true,
      hashReviewApproved: true,
    },
    entries: Object.fromEntries(forManifest.scope.wordIds.map((wordId, index) => {
      const word = forManifest.words[wordId]!;
      return [wordId, {
        pronunciation: {
          assetId: word.assetBindings.pronunciationAssetId,
          publicPath: `assets/pronunciation/${wordId}.ogg`,
          sha256: computeRuntimeManifestDigest(["pronunciation", wordId, index]),
          sourceUrl: `https://assets.example.invalid/toki-pona/pronunciation/${wordId}.ogg`,
          licenseSpdx: "CC-BY-4.0",
          durationMs: 750,
          sampleRateHz: 48_000,
          channels: 1,
          redistributionApproved: true,
          languageReviewApproved: true,
          accessibilityReviewApproved: true,
          communityReviewApproved: true,
          hashReviewApproved: true,
        },
        glyph: { assetId: word.assetBindings.glyphAssetId, atlasFrameId: `pu120.${wordId}`, displayCodepoint: word.displayCodepoint },
      }];
    })),
    privacy: { containsPrivatePaths: false, containsPrivateAssets: false, containsSourceFonts: false, containsReviewMedia: false },
  };
}

describe("core-120 public/private asset boundary", () => {
  it("fails closed for every word while no private export or approvals exist", () => {
    expect(runtimeCore120AssetReadiness).toMatchObject({
      privateAssetExport: "missing",
      pronunciationAudio: "blocked_pending_private_assets",
      glyphVisuals: "blocked_pending_private_approval",
      glyphCatalog: "draft",
      playableContentMayClaimFullAssetAcceptance: false,
      blockingReasons: ["private_asset_export_missing", "glyph_release_blocked", "glyph_catalog_not_approved"],
    });
    expect(Object.keys(runtimeCore120AssetReadiness.wordAssets)).toHaveLength(120);
    expect(Object.values(runtimeCore120AssetReadiness.wordAssets).every((word) => !word.audioReady && word.audioPublicPath === null && !word.glyphReady && word.glyphAtlasPublicPath === null && word.glyphAtlasFrameId === null)).toBe(true);
    expect(JSON.stringify(runtimeCore120AssetReadiness)).not.toMatch(/sourceUrl|licenseSpdx|containsPrivatePaths|[A-Z]:\\|file:\/\//i);
    expect(readRuntimeCore120AssetReadiness(manifest, missingPrivateExport, releaseContract))
      .toEqual(runtimeCore120AssetReadiness);
  });

  it("rejects a poisoned missing-export placeholder instead of treating it as absent", () => {
    const poisoned = structuredClone(missingPrivateExport) as any;
    poisoned.entries.telo = { privatePath: "C:\\review\\telo.wav" };
    expect(() => readRuntimeCore120AssetReadiness(manifest, poisoned, releaseContract))
      .toThrow(/missing private asset export/);
  });

  it("does not let an approved audio export override blocked glyph and catalog gates", () => {
    const readiness = readRuntimeCore120AssetReadiness(manifest, privateExport(manifest), releaseContract);
    expect(readiness).toMatchObject({
      privateAssetExport: "approved",
      pronunciationAudio: "approved",
      glyphVisuals: "blocked_pending_private_approval",
      glyphCatalog: "draft",
      playableContentMayClaimFullAssetAcceptance: false,
      blockingReasons: ["glyph_release_blocked", "glyph_catalog_not_approved"],
    });
    expect(Object.values(readiness.wordAssets).every((word) => word.audioReady && word.audioPublicPath?.endsWith(".ogg") && !word.glyphReady)).toBe(true);
  });

  it("can prove full readiness only when export, catalog, and release are all approved", () => {
    const futureManifest = approvedManifest();
    const readiness = readRuntimeCore120AssetReadiness(futureManifest, privateExport(futureManifest), approvedRelease());
    expect(readiness).toMatchObject({
      privateAssetExport: "approved",
      pronunciationAudio: "approved",
      glyphVisuals: "approved",
      glyphCatalog: "approved",
      playableContentMayClaimFullAssetAcceptance: true,
      blockingReasons: [],
    });
    expect(Object.values(readiness.wordAssets).every((word) => word.audioReady && word.glyphReady && word.audioPublicPath?.startsWith("assets/pronunciation/") && word.glyphAtlasPublicPath === "assets/magic-glyphs/pu120-atlas.v2.png" && word.glyphAtlasFrameId?.startsWith("pu120."))).toBe(true);
  });

  it("rejects missing words, partial approvals, private paths, and unknown metadata", () => {
    const missing = privateExport(manifest);
    delete missing.entries.weka;
    expect(() => readRuntimeCore120AssetReadiness(manifest, missing, releaseContract)).toThrow(/unknown or missing/);

    const partial = privateExport(manifest);
    partial.entries.telo.pronunciation.communityReviewApproved = false;
    expect(() => readRuntimeCore120AssetReadiness(manifest, partial, releaseContract)).toThrow(/telo approval/);

    const privatePath = privateExport(manifest);
    privatePath.entries.tawa.pronunciation.publicPath = "C:\\private\\tawa.wav";
    expect(() => readRuntimeCore120AssetReadiness(manifest, privatePath, releaseContract)).toThrow(/tawa approval/);

    const unknown = privateExport(manifest);
    unknown.entries.a.pronunciation.privateSourcePath = "D:\\review\\a.wav";
    expect(() => readRuntimeCore120AssetReadiness(manifest, unknown, releaseContract)).toThrow(/unknown or missing/);

    const badAtlas = privateExport(manifest);
    badAtlas.glyphAtlas.pixelReviewApproved = false;
    expect(() => readRuntimeCore120AssetReadiness(manifest, badAtlas, releaseContract)).toThrow(/atlas approval/);
  });

  it("rejects re-bound exports and malformed release approvals", () => {
    const mismatch = privateExport(manifest);
    mismatch.manifestDigest = `sha256:${"0".repeat(64)}`;
    expect(() => readRuntimeCore120AssetReadiness(manifest, mismatch, releaseContract)).toThrow(/identity/);

    const deniedApprovedRelease = approvedRelease();
    deniedApprovedRelease.currentAudits[0].decision = "deny";
    deniedApprovedRelease.currentAudits[0].reasonCodes = ["unreviewed"];
    expect(() => readRuntimeCore120AssetReadiness(manifest, null, deniedApprovedRelease)).toThrow(/denied audits/);

    const leakingRelease = structuredClone(releaseContract) as any;
    leakingRelease.privacy.containsPrivatePaths = true;
    expect(() => readRuntimeCore120AssetReadiness(manifest, null, leakingRelease)).toThrow(/leaks private/);

    const missingApproval = structuredClone(releaseContract) as any;
    missingApproval.requiredApprovals = missingApproval.requiredApprovals.slice(0, -1);
    expect(() => readRuntimeCore120AssetReadiness(manifest, null, missingApproval)).toThrow(/identity/);
  });

  it("rejects structural lookalikes instead of trusting TypeScript casts", () => {
    const lookalike = structuredClone(manifest);
    expect(() => readRuntimeCore120AssetReadiness(lookalike, null, releaseContract)).toThrow(/verified curriculum/);
  });
});
