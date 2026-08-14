import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import generated from "../../src/generated/content-runtime.v0.1.json";
import currentRelease from "../../src/assets/runtime-release-contract.v0.1.json";
import currentPrivateExport from "../../src/assets/runtime-core120-private-export.v0.1.json";
import currentPronunciation from "../../src/assets/p0-pronunciation-manifest.v0.1.json";
import currentCatalog from "../../data/language/pu-120-glyph-catalog.v0.2.json";
import {
  computeRuntimeCore120CurriculumDigest,
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../../src/content/runtime-core120-curriculum-manifest";
import { checkPublicRuntimeAssetBoundary } from "./public-runtime-boundary";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("public runtime asset boundary", () => {
  it("keeps the checked-in repository safely blocked while external approvals are absent", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    expect(checkPublicRuntimeAssetBoundary({
      repositoryRoot,
      runtimeArtifact: generated,
      releaseContract: currentRelease,
      glyphCatalog: currentCatalog,
      p0PronunciationManifest: currentPronunciation,
      privateAssetExport: currentPrivateExport,
    })).toEqual({
      schemaVersion: "tokipona.public-asset-boundary-check.v0.2",
      status: "safe_blocked_pending_external_approval",
      core120WordCount: 120,
      p0PronunciationWordCount: 12,
      publicGlyphFileCount: 1,
      publicPronunciationFileCount: 0,
      approvedPrivateExportPresent: false,
      missingExportPlaceholderPresent: true,
    });
  });

  it("accepts a complete future approval only after every declared public file matches its hash", () => {
    const fixture = approvedFixture();
    expect(checkPublicRuntimeAssetBoundary(fixture.input)).toEqual({
      schemaVersion: "tokipona.public-asset-boundary-check.v0.2",
      status: "approved_runtime_assets_verified",
      core120WordCount: 120,
      p0PronunciationWordCount: 12,
      publicGlyphFileCount: 2,
      publicPronunciationFileCount: 120,
      approvedPrivateExportPresent: true,
      missingExportPlaceholderPresent: false,
    });
  });

  it("rejects missing, changed, and undeclared runtime files", () => {
    const changed = approvedFixture();
    writeFileSync(join(changed.root, "public/assets/pronunciation/telo.ogg"), "changed");
    expect(() => checkPublicRuntimeAssetBoundary(changed.input))
      .toThrow("approved_public_asset_hash_mismatch");

    const missing = approvedFixture({ omitWordId: "weka" });
    expect(() => checkPublicRuntimeAssetBoundary(missing.input))
      .toThrow("approved_public_asset_missing");

    const extra = approvedFixture();
    writeFileSync(join(extra.root, "public/assets/magic-glyphs/private-review.png"), "private");
    expect(() => checkPublicRuntimeAssetBoundary(extra.input))
      .toThrow("public_glyph_file_set_invalid");
  });

  it("rejects partial approval states and P0 metadata that diverges from the core-120 export", () => {
    const partial = approvedFixture();
    const blockedRelease = structuredClone(currentRelease);
    expect(() => checkPublicRuntimeAssetBoundary({ ...partial.input, releaseContract: blockedRelease }))
      .toThrow("partial_asset_approval_state_forbidden");

    const mismatch = approvedFixture();
    const pronunciation = structuredClone(mismatch.input.p0PronunciationManifest) as any;
    pronunciation.entries.telo.sha256 = `sha256:${"0".repeat(64)}`;
    expect(() => checkPublicRuntimeAssetBoundary({
      ...mismatch.input,
      p0PronunciationManifest: pronunciation,
    })).toThrow("p0_core120_pronunciation_mismatch");
  });

  it("rejects catalog approval claims that are not complete for every glyph", () => {
    const fixture = approvedFixture();
    const catalog = structuredClone(fixture.input.glyphCatalog) as any;
    catalog.glyphs[0].reviewStatus = "draft";
    expect(() => checkPublicRuntimeAssetBoundary({ ...fixture.input, glyphCatalog: catalog }))
      .toThrow("glyph_catalog_entry_invalid");
  });
});

function approvedFixture(options: { readonly omitWordId?: string } = {}): Readonly<{
  root: string;
  input: Parameters<typeof checkPublicRuntimeAssetBoundary>[0];
}> {
  const root = mkdtempSync(join(tmpdir(), "tokipona-public-assets-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "public/assets/magic-glyphs"), { recursive: true });
  mkdirSync(join(root, "public/assets/pronunciation"), { recursive: true });
  writeFileSync(join(root, "public/assets/magic-glyphs/README.md"), "approved runtime assets\n");
  const atlasBytes = Buffer.from("approved-pu120-atlas-v2");
  writeFileSync(join(root, "public/assets/magic-glyphs/pu120-atlas.v2.png"), atlasBytes);

  const runtimeArtifact = approvedRuntimeArtifact();
  const manifest = readRuntimeCore120CurriculumManifest(runtimeArtifact);
  const privateAssetExport = approvedPrivateExport(manifest, root, atlasBytes, options.omitWordId);
  const releaseContract = approvedRelease();
  const glyphCatalog = approvedCatalog();
  const p0PronunciationManifest = approvedP0Pronunciation(manifest, privateAssetExport);
  return Object.freeze({
    root,
    input: {
      repositoryRoot: root,
      runtimeArtifact,
      releaseContract,
      glyphCatalog,
      p0PronunciationManifest,
      privateAssetExport,
    },
  });
}

function approvedRuntimeArtifact(): any {
  const candidate = structuredClone(generated) as any;
  candidate.core120Curriculum.catalogReviewStatus = "approved";
  candidate.core120Curriculum.catalogRuntimeReady = true;
  const payload = Object.fromEntries(Object.entries(candidate.core120Curriculum)
    .filter(([key]) => key !== "sourceDigest"));
  candidate.core120Curriculum.sourceDigest = computeRuntimeCore120CurriculumDigest(payload);
  return candidate;
}

function approvedRelease(): any {
  const candidate = structuredClone(currentRelease) as any;
  candidate.status = "approved";
  candidate.currentAudits = candidate.currentAudits.map((audit: any) => ({
    ...audit,
    decision: "allow",
    reasonCodes: [],
  }));
  return candidate;
}

function approvedCatalog(): any {
  const candidate = structuredClone(currentCatalog) as any;
  candidate.reviewStatus = "approved";
  candidate.runtimeReady = true;
  candidate.glyphs = candidate.glyphs.map((glyph: any) => ({ ...glyph, reviewStatus: "approved" }));
  return candidate;
}

function approvedPrivateExport(
  manifest: RuntimeCore120CurriculumManifest,
  root: string,
  atlasBytes: Uint8Array,
  omitWordId?: string,
): any {
  const entries = Object.fromEntries(manifest.scope.wordIds.map((wordId) => {
    const bytes = Buffer.from(`approved-pronunciation-${wordId}`);
    if (wordId !== omitWordId) {
      writeFileSync(join(root, `public/assets/pronunciation/${wordId}.ogg`), bytes);
    }
    const word = manifest.words[wordId]!;
    return [wordId, {
      pronunciation: {
        assetId: word.assetBindings.pronunciationAssetId,
        publicPath: `assets/pronunciation/${wordId}.ogg`,
        sha256: hash(bytes),
        sourceUrl: `https://assets.example.invalid/pronunciation/${wordId}.ogg`,
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
      glyph: {
        assetId: word.assetBindings.glyphAssetId,
        atlasFrameId: `pu120.${wordId}`,
        displayCodepoint: word.displayCodepoint,
      },
    }];
  }));
  return {
    schemaVersion: "tokipona.pu120-private-asset-export.v0.1",
    status: "approved",
    manifestDigest: manifest.sourceDigest,
    corpusId: "pu-120",
    wordIds: [...manifest.scope.wordIds],
    glyphAtlas: {
      assetId: "glyph.pu120.atlas.v2",
      publicPath: "assets/magic-glyphs/pu120-atlas.v2.png",
      sha256: hash(atlasBytes),
      sourceUrl: "https://assets.example.invalid/glyphs/pu120-atlas.v2.png",
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
    entries,
    privacy: {
      containsPrivatePaths: false,
      containsPrivateAssets: false,
      containsSourceFonts: false,
      containsReviewMedia: false,
    },
  };
}

function approvedP0Pronunciation(
  manifest: RuntimeCore120CurriculumManifest,
  privateAssetExport: any,
): any {
  const wordIds = manifest.scope.wordIds
    .filter((wordId) => manifest.words[wordId]?.curriculumBand === "P0")
    .sort();
  return {
    schemaVersion: "tokipona.p0-pronunciation-assets.v0.1",
    status: "approved",
    wordIds,
    entries: Object.fromEntries(wordIds.map((wordId) => {
      const pronunciation = privateAssetExport.entries[wordId].pronunciation;
      return [wordId, {
        audioAssetId: pronunciation.assetId,
        publicPath: pronunciation.publicPath,
        sha256: pronunciation.sha256,
        sourceUrl: pronunciation.sourceUrl,
        licenseSpdx: pronunciation.licenseSpdx,
        redistributionApproved: true,
        languageReviewApproved: true,
        communityReviewApproved: true,
      }];
    })),
  };
}

function hash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
