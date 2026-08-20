import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import releaseContract from "./runtime-release-contract.v0.1.json";
import missingPrivateExport from "./runtime-core120-private-export.v0.1.json";
import currentPrivateExport from "./runtime-core120-private-export.v0.2.json";
import {
  computeRuntimeCore120CurriculumDigest,
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../content/runtime-core120-curriculum-manifest";
import { computeRuntimeManifestDigest } from "../content/runtime-manifest-digest";
import {
  CORE120_PRIVATE_ASSET_EXPORT_SCHEMA_V1,
  readRuntimeCore120AssetExportCandidate,
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
    schemaVersion: CORE120_PRIVATE_ASSET_EXPORT_SCHEMA_V1,
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

function reviewCandidateV2(forManifest: RuntimeCore120CurriculumManifest): any {
  const frameFor = (cell: number): { page: number; x: number; y: number; w: 32; h: 32 } => ({
    page: Math.floor(cell / 900),
    x: 2 + (cell % 30) * 34,
    y: 2 + Math.floor((cell % 900) / 30) * 34,
    w: 32,
    h: 32,
  });
  const glyphFrameFor = (index: number): { page: 0; x: number; y: number; w: 32; h: 32 } => ({
    page: 0,
    x: 2 + (index % 30) * 34,
    y: 2 + Math.floor(index / 30) * 34,
    w: 32,
    h: 32,
  });
  const pendingApprovals = Object.fromEntries([
    "source", "license", "language", "pixel", "animation", "accessibility", "community", "hashes",
  ].map((approval) => [approval, "pending"]));
  return {
    schemaVersion: "tokipona.pu120-private-asset-export.v0.2",
    status: "review_candidate",
    manifestDigest: forManifest.sourceDigest,
    corpusId: "pu-120",
    wordIds: [...forManifest.scope.wordIds],
    glyphBundle: {
      assetId: "glyph.pu120.bundle.v2",
      sourceUrl: null,
      licenseSpdx: "OFL-1.1",
      approvals: pendingApprovals,
      atlasManifest: {
        publicPath: "assets/magic-glyphs/pu120-v2/pu120-glyph-atlas.v0.2.json",
        sha256: `sha256:${"1".repeat(64)}`,
      },
      paletteManifest: {
        publicPath: "assets/magic-glyphs/pu120-v2/pu120-glyph-palettes.v0.1.json",
        sha256: `sha256:${"2".repeat(64)}`,
      },
      activationPages: [
        { page: 0, publicPath: "assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-0.png", width: 1024, height: 1024, sha256: `sha256:${"3".repeat(64)}` },
        { page: 1, publicPath: "assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-1.png", width: 1024, height: 1024, sha256: `sha256:${"4".repeat(64)}` },
      ],
      rolePatternPages: [
        { page: 0, publicPath: "assets/magic-glyphs/pu120-v2/pu120-role-patterns.page-0.png", width: 1024, height: 1024, sha256: `sha256:${"5".repeat(64)}` },
      ],
      innerEdgePages: [
        { page: 0, publicPath: "assets/magic-glyphs/pu120-v2/pu120-inner-edge.page-0.png", width: 1024, height: 1024, sha256: `sha256:${"6".repeat(64)}` },
      ],
    },
    entries: Object.fromEntries(forManifest.scope.wordIds.map((wordId, index) => {
      const word = forManifest.words[wordId]!;
      return [wordId, {
        pronunciation: null,
        glyph: {
          assetId: word.assetBindings.glyphAssetId,
          displayCodepoint: word.displayCodepoint,
          activationFrames: Array.from({ length: 8 }, (_, frameIndex) => frameFor(index * 8 + frameIndex)),
          rolePattern: glyphFrameFor(index),
          innerEdge: glyphFrameFor(index),
        },
      }];
    })),
    privacy: {
      containsPrivatePaths: false,
      containsPrivateAssets: false,
      containsSourceFonts: false,
      containsReviewMedia: false,
    },
  };
}

function approvedExportV2(forManifest: RuntimeCore120CurriculumManifest): any {
  const candidate = reviewCandidateV2(forManifest);
  candidate.status = "approved";
  candidate.glyphBundle.sourceUrl = "https://assets.example.invalid/glyphs/pu120-v2";
  candidate.glyphBundle.approvals = Object.fromEntries(Object.keys(candidate.glyphBundle.approvals)
    .map((approval) => [approval, "approved"]));
  for (const [index, wordId] of forManifest.scope.wordIds.entries()) {
    const word = forManifest.words[wordId]!;
    candidate.entries[wordId].pronunciation = {
      assetId: word.assetBindings.pronunciationAssetId,
      publicPath: `assets/pronunciation/${wordId}.ogg`,
      sha256: computeRuntimeManifestDigest(["pronunciation", wordId, index]),
      sourceUrl: `https://assets.example.invalid/pronunciation/${wordId}.ogg`,
      licenseSpdx: "CC-BY-4.0",
      durationMs: 750,
      sampleRateHz: 48_000,
      channels: 1,
      approvals: {
        redistribution: "approved",
        language: "approved",
        accessibility: "approved",
        community: "approved",
        hashes: "approved",
      },
    };
  }
  return candidate;
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
    const readiness = readRuntimeCore120AssetReadiness(manifest, approvedExportV2(manifest), releaseContract);
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

  it("validates a complete multi-page review candidate without making it renderable", () => {
    const readiness = readRuntimeCore120AssetReadiness(manifest, reviewCandidateV2(manifest), releaseContract);
    expect(readiness).toMatchObject({
      privateAssetExport: "review_candidate",
      pronunciationAudio: "blocked_pending_private_assets",
      glyphVisuals: "blocked_pending_private_approval",
      playableContentMayClaimFullAssetAcceptance: false,
      blockingReasons: [
        "private_asset_export_not_approved",
        "glyph_release_blocked",
        "glyph_catalog_not_approved",
      ],
    });
    expect(Object.values(readiness.wordAssets).every((word) =>
      !word.audioReady && !word.glyphReady && word.glyphAtlasPublicPath === null)).toBe(true);
  });

  it("projects exact multi-page coordinates for a separately reviewed candidate", () => {
    const candidate = readRuntimeCore120AssetExportCandidate(manifest, reviewCandidateV2(manifest));
    expect(candidate.status).toBe("review_candidate");
    expect(candidate.glyphBundle.activationPages.map((page) => page.publicPath)).toEqual([
      "assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-0.png",
      "assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-1.png",
    ]);
    expect(candidate.entries.a?.glyph.activationFrames[0]).toEqual({ page: 0, x: 2, y: 2, w: 32, h: 32 });
    expect(candidate.entries.weka?.glyph.activationFrames).toHaveLength(8);
  });

  it("rejects invalid page references, overlapping frames, candidate audio, and leaked privacy", () => {
    const badPage = reviewCandidateV2(manifest);
    badPage.entries.a.glyph.activationFrames[0].page = 2;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, badPage)).toThrow(/activation frame a/);

    const overlap = reviewCandidateV2(manifest);
    overlap.entries.akesi.glyph.activationFrames[0] = { ...overlap.entries.a.glyph.activationFrames[0] };
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, overlap)).toThrow(/overlaps/);

    const candidateAudio = reviewCandidateV2(manifest);
    candidateAudio.entries.a.pronunciation = approvedExportV2(manifest).entries.a.pronunciation;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, candidateAudio)).toThrow(/must be absent/);

    const leaking = reviewCandidateV2(manifest);
    leaking.privacy.containsPrivatePaths = true;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, leaking)).toThrow(/leaks private/);
  });

  it("can prove full readiness only when export, catalog, and release are all approved", () => {
    const futureManifest = approvedManifest();
    const readiness = readRuntimeCore120AssetReadiness(futureManifest, approvedExportV2(futureManifest), approvedRelease());
    expect(readiness).toMatchObject({
      privateAssetExport: "approved",
      pronunciationAudio: "approved",
      glyphVisuals: "approved",
      glyphCatalog: "approved",
      playableContentMayClaimFullAssetAcceptance: true,
      blockingReasons: [],
    });
    expect(Object.values(readiness.wordAssets).every((word) => word.audioReady && word.glyphReady && word.audioPublicPath?.startsWith("assets/pronunciation/") && word.glyphAtlasPublicPath?.startsWith("assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-") && word.glyphAtlasFrameId?.startsWith("pu120."))).toBe(true);
  });

  it("rejects missing words, partial approvals, private paths, and unknown metadata", () => {
    const missing = approvedExportV2(manifest);
    delete missing.entries.weka;
    expect(() => readRuntimeCore120AssetReadiness(manifest, missing, releaseContract)).toThrow(/unknown or missing/);

    const partial = approvedExportV2(manifest);
    partial.entries.telo.pronunciation.approvals.community = "pending";
    expect(() => readRuntimeCore120AssetReadiness(manifest, partial, releaseContract)).toThrow(/telo approval/);

    const privatePath = approvedExportV2(manifest);
    privatePath.entries.tawa.pronunciation.publicPath = "C:\\private\\tawa.wav";
    expect(() => readRuntimeCore120AssetReadiness(manifest, privatePath, releaseContract)).toThrow(/tawa approval/);

    const unknown = approvedExportV2(manifest);
    unknown.entries.a.pronunciation.privateSourcePath = "D:\\review\\a.wav";
    expect(() => readRuntimeCore120AssetReadiness(manifest, unknown, releaseContract)).toThrow(/unknown or missing/);

    const badAtlas = approvedExportV2(manifest);
    badAtlas.glyphBundle.approvals.pixel = "pending";
    expect(() => readRuntimeCore120AssetReadiness(manifest, badAtlas, releaseContract)).toThrow(/glyph approvals/);
  });

  it("rejects re-bound exports and malformed release approvals", () => {
    const mismatch = approvedExportV2(manifest);
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

  it("keeps the legacy missing placeholder readable but rejects its fictional approved atlas", () => {
    expect(readRuntimeCore120AssetReadiness(manifest, missingPrivateExport, releaseContract))
      .toEqual(runtimeCore120AssetReadiness);
    expect(readRuntimeCore120AssetReadiness(manifest, currentPrivateExport, releaseContract))
      .toEqual(runtimeCore120AssetReadiness);
    expect(() => readRuntimeCore120AssetReadiness(manifest, privateExport(manifest), releaseContract))
      .toThrow(/legacy approved export/);
  });

  it("rejects structural lookalikes instead of trusting TypeScript casts", () => {
    const lookalike = structuredClone(manifest);
    expect(() => readRuntimeCore120AssetReadiness(lookalike, null, releaseContract)).toThrow(/verified curriculum/);
  });
});
