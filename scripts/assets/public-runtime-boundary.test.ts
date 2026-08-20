import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import generated from "../../src/generated/content-runtime.v0.1.json";
import currentRelease from "../../src/assets/runtime-release-contract.v0.1.json";
import currentPrivateExport from "../../src/assets/runtime-core120-private-export.v0.2.json";
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
      publicGlyphFileCount: 7,
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

  it("rejects a re-hashed public atlas whose coordinates diverge from the approved export", () => {
    const fixture = approvedFixture();
    const atlasPath = join(fixture.root,
      "public/assets/magic-glyphs/pu120-v2/pu120-glyph-atlas.v0.2.json");
    const atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as any;
    atlas.glyphs.a.activationFrames[0].x += 1;
    const changedBytes = Buffer.from(`${JSON.stringify(atlas, null, 2)}\n`);
    writeFileSync(atlasPath, changedBytes);
    const privateExport = structuredClone(fixture.input.privateAssetExport) as any;
    privateExport.glyphBundle.atlasManifest.sha256 = hash(changedBytes);
    expect(() => checkPublicRuntimeAssetBoundary({
      ...fixture.input,
      privateAssetExport: privateExport,
    }))
      .toThrow("runtime_glyph_entry_mismatch");
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
  const runtimeArtifact = approvedRuntimeArtifact();
  const manifest = readRuntimeCore120CurriculumManifest(runtimeArtifact);
  const privateAssetExport = approvedPrivateExport(manifest, root, options.omitWordId);
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
  omitWordId?: string,
): any {
  const glyphRoot = join(root, "public/assets/magic-glyphs/pu120-v2");
  mkdirSync(glyphRoot, { recursive: true });
  const pageFiles = [
    ["pu120-activation-gray.page-0.png", Buffer.from("activation-page-0"), 0],
    ["pu120-activation-gray.page-1.png", Buffer.from("activation-page-1"), 1],
    ["pu120-role-patterns.page-0.png", Buffer.from("role-pattern-page-0"), 0],
    ["pu120-inner-edge.page-0.png", Buffer.from("inner-edge-page-0"), 0],
  ] as const;
  for (const [filename, bytes] of pageFiles) writeFileSync(join(glyphRoot, filename), bytes);
  const frameFor = (cell: number): { page: number; x: number; y: number; w: 32; h: 32 } => ({
    page: Math.floor(cell / 900), x: 2 + (cell % 30) * 34,
    y: 2 + Math.floor((cell % 900) / 30) * 34, w: 32, h: 32,
  });

  const glyphFrameFor = (index: number): { page: 0; x: number; y: number; w: 32; h: 32 } => ({
    page: 0, x: 2 + (index % 30) * 34, y: 2 + Math.floor(index / 30) * 34, w: 32, h: 32,
  });
  const entries = Object.fromEntries(manifest.scope.wordIds.map((wordId, index) => {
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
        approvals: {
          redistribution: "approved",
          language: "approved",
          accessibility: "approved",
          community: "approved",
          hashes: "approved",
        },
      },
      glyph: {
        assetId: word.assetBindings.glyphAssetId,
        displayCodepoint: word.displayCodepoint,
        activationFrames: Array.from({ length: 8 }, (_, frameIndex) => frameFor(index * 8 + frameIndex)),
        rolePattern: glyphFrameFor(index),
        innerEdge: glyphFrameFor(index),
      },
    }];
  }));
  const activationPages = pageFiles.slice(0, 2).map(([filename, bytes, page]) => ({
    page, publicPath: `assets/magic-glyphs/pu120-v2/${filename}`,
    width: 1024, height: 1024, sha256: hash(bytes),
  }));
  const rolePatternPages = [{
    page: 0, publicPath: "assets/magic-glyphs/pu120-v2/pu120-role-patterns.page-0.png",
    width: 1024, height: 1024, sha256: hash(pageFiles[2][1]),
  }];
  const innerEdgePages = [{
    page: 0, publicPath: "assets/magic-glyphs/pu120-v2/pu120-inner-edge.page-0.png",
    width: 1024, height: 1024, sha256: hash(pageFiles[3][1]),
  }];
  const paletteBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: "pu120.magic-glyph-palettes.v0.1", palettes: { G_SYNTAX: { body: "#9AA3AA" } },
  }, null, 2)}\n`);
  writeFileSync(join(glyphRoot, "pu120-glyph-palettes.v0.1.json"), paletteBytes);
  const atlasBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: "pu120.magic-glyph-atlas.runtime.v0.2",
    sourceManifestDigest: manifest.sourceDigest,
    frame: { width: 32, height: 32, count: 8 },
    activationPages,
    rolePatternPages,
    innerEdgePages,
    glyphOrder: [...manifest.scope.wordIds],
    glyphs: Object.fromEntries(manifest.scope.wordIds.map((wordId) => [wordId, entries[wordId].glyph])),
    privacy: { containsPrivatePaths: false, containsPrivateAssets: false, containsSourceFonts: false, containsReviewMedia: false },
  }, null, 2)}\n`);
  writeFileSync(join(glyphRoot, "pu120-glyph-atlas.v0.2.json"), atlasBytes);
  const approved = Object.fromEntries([
    "source", "license", "language", "pixel", "animation", "accessibility", "community", "hashes",
  ].map((approval) => [approval, "approved"]));
  return {
    schemaVersion: "tokipona.pu120-private-asset-export.v0.2",
    status: "approved",
    manifestDigest: manifest.sourceDigest,
    corpusId: "pu-120",
    wordIds: [...manifest.scope.wordIds],
    glyphBundle: {
      assetId: "glyph.pu120.bundle.v2",
      sourceUrl: "https://assets.example.invalid/glyphs/pu120-v2",
      licenseSpdx: "OFL-1.1",
      approvals: approved,
      atlasManifest: { publicPath: "assets/magic-glyphs/pu120-v2/pu120-glyph-atlas.v0.2.json", sha256: hash(atlasBytes) },
      paletteManifest: { publicPath: "assets/magic-glyphs/pu120-v2/pu120-glyph-palettes.v0.1.json", sha256: hash(paletteBytes) },
      activationPages,
      rolePatternPages,
      innerEdgePages,
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
