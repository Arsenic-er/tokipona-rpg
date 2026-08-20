import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import releaseContract from "./runtime-release-contract.v0.1.json";
import missingPrivateExport from "./runtime-core120-private-export.v0.3.json";
import {
  computeRuntimeCore120CurriculumDigest,
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../content/runtime-core120-curriculum-manifest";
import {
  CORE120_PRIVATE_ASSET_EXPORT_SCHEMA,
  readRuntimeCore120AssetExportCandidate,
  readRuntimeCore120AssetReadiness,
  runtimeCore120AssetReadiness,
} from "./runtime-core120-assets";

const manifest = readRuntimeCore120CurriculumManifest(generated);

function approvedManifest(): RuntimeCore120CurriculumManifest {
  const candidate = structuredClone(generated) as any;
  candidate.core120Curriculum.catalogReviewStatus = "approved";
  candidate.core120Curriculum.catalogRuntimeReady = true;
  const payload = Object.fromEntries(Object.entries(candidate.core120Curriculum)
    .filter(([key]) => key !== "sourceDigest"));
  candidate.core120Curriculum.sourceDigest = computeRuntimeCore120CurriculumDigest(payload);
  return readRuntimeCore120CurriculumManifest(candidate);
}

function approvedRelease(): any {
  const candidate = structuredClone(releaseContract) as any;
  candidate.status = "approved";
  candidate.currentAudits = candidate.currentAudits.map((audit: any) => ({
    ...audit,
    decision: "allow",
    reasonCodes: [],
  }));
  return candidate;
}

function reviewCandidateV3(forManifest: RuntimeCore120CurriculumManifest): any {
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
    schemaVersion: "tokipona.pu120-private-asset-export.v0.3",
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
    entries: Object.fromEntries(forManifest.scope.wordIds.map((wordId, index) => [wordId, {
      glyph: {
        assetId: forManifest.words[wordId]!.assetBindings.glyphAssetId,
        displayCodepoint: forManifest.words[wordId]!.displayCodepoint,
        activationFrames: Array.from({ length: 8 }, (_, frameIndex) => frameFor(index * 8 + frameIndex)),
        rolePattern: glyphFrameFor(index),
        innerEdge: glyphFrameFor(index),
      },
    }])),
    privacy: {
      containsPrivatePaths: false,
      containsPrivateAssets: false,
      containsSourceFonts: false,
      containsReviewMedia: false,
    },
  };
}

function approvedExportV3(forManifest: RuntimeCore120CurriculumManifest): any {
  const candidate = reviewCandidateV3(forManifest);
  candidate.status = "approved";
  candidate.glyphBundle.sourceUrl = "https://assets.example.invalid/glyphs/pu120-v2";
  candidate.glyphBundle.approvals = Object.fromEntries(Object.keys(candidate.glyphBundle.approvals)
    .map((approval) => [approval, "approved"]));
  return candidate;
}

describe("core-120 glyph-only public/private asset boundary", () => {
  it("fails closed without exposing pronunciation readiness", () => {
    expect(CORE120_PRIVATE_ASSET_EXPORT_SCHEMA).toBe("tokipona.pu120-private-asset-export.v0.3");
    expect(runtimeCore120AssetReadiness).toMatchObject({
      privateAssetExport: "missing",
      glyphVisuals: "blocked_pending_private_approval",
      glyphCatalog: "draft",
      playableContentMayClaimFullAssetAcceptance: false,
      blockingReasons: ["private_asset_export_missing", "glyph_release_blocked", "glyph_catalog_not_approved"],
    });
    expect(Object.values(runtimeCore120AssetReadiness.wordAssets).every((word) =>
      !word.glyphReady && word.glyphAtlasPublicPath === null && word.glyphAtlasFrameId === null)).toBe(true);
    expect(JSON.stringify(runtimeCore120AssetReadiness)).not.toMatch(/pronunciation|audioReady|audioPublicPath/i);
    expect(readRuntimeCore120AssetReadiness(manifest, missingPrivateExport, releaseContract))
      .toEqual(runtimeCore120AssetReadiness);
  });

  it("verifies a glyph-only review candidate without making it renderable", () => {
    const candidate = readRuntimeCore120AssetExportCandidate(manifest, reviewCandidateV3(manifest));
    const readiness = readRuntimeCore120AssetReadiness(manifest, reviewCandidateV3(manifest), releaseContract);
    expect(candidate.status).toBe("review_candidate");
    expect(candidate.entries.a).toEqual({ glyph: expect.any(Object) });
    expect(candidate.entries.a?.glyph.activationFrames[0]).toEqual({ page: 0, x: 2, y: 2, w: 32, h: 32 });
    expect(readiness).toMatchObject({
      privateAssetExport: "review_candidate",
      glyphVisuals: "blocked_pending_private_approval",
      playableContentMayClaimFullAssetAcceptance: false,
    });
  });

  it("becomes ready only when export, catalog, and glyph release are approved", () => {
    const futureManifest = approvedManifest();
    const readiness = readRuntimeCore120AssetReadiness(
      futureManifest,
      approvedExportV3(futureManifest),
      approvedRelease(),
    );
    expect(readiness).toMatchObject({
      privateAssetExport: "approved",
      glyphVisuals: "approved",
      glyphCatalog: "approved",
      playableContentMayClaimFullAssetAcceptance: true,
      blockingReasons: [],
    });
    expect(Object.values(readiness.wordAssets).every((word) =>
      word.glyphReady &&
      word.glyphAtlasPublicPath?.startsWith("assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-") &&
      word.glyphAtlasFrameId?.startsWith("pu120."))).toBe(true);
  });

  it("rejects legacy audio fields and the v0.2 handoff schema", () => {
    const entryAudio = reviewCandidateV3(manifest);
    entryAudio.entries.a.pronunciation = null;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, entryAudio)).toThrow(/unknown or missing/);

    const rootAudio = reviewCandidateV3(manifest);
    rootAudio.audioBundle = null;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, rootAudio)).toThrow(/unknown or missing/);

    const legacyV2 = reviewCandidateV3(manifest);
    legacyV2.schemaVersion = "tokipona.pu120-private-asset-export.v0.2";
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, legacyV2)).toThrow(/legacy|schema/);
  });

  it("rejects page drift, overlapping frames, incomplete approvals, and privacy leaks", () => {
    const badPage = reviewCandidateV3(manifest);
    badPage.entries.a.glyph.activationFrames[0].page = 2;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, badPage)).toThrow(/activation frame a/);

    const overlap = reviewCandidateV3(manifest);
    overlap.entries.akesi.glyph.activationFrames[0] = { ...overlap.entries.a.glyph.activationFrames[0] };
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, overlap)).toThrow(/overlaps/);

    const partial = approvedExportV3(manifest);
    partial.glyphBundle.approvals.pixel = "pending";
    expect(() => readRuntimeCore120AssetReadiness(manifest, partial, releaseContract))
      .toThrow(/glyph approvals/);

    const leaking = reviewCandidateV3(manifest);
    leaking.privacy.containsPrivatePaths = true;
    expect(() => readRuntimeCore120AssetExportCandidate(manifest, leaking)).toThrow(/leaks private/);
  });

  it("rejects missing words and unverified curriculum lookalikes", () => {
    const missing = reviewCandidateV3(manifest);
    delete missing.entries.weka;
    expect(() => readRuntimeCore120AssetReadiness(manifest, missing, releaseContract))
      .toThrow(/unknown or missing/);
    expect(() => readRuntimeCore120AssetReadiness(structuredClone(manifest), null, releaseContract))
      .toThrow(/verified curriculum/);
  });
});
