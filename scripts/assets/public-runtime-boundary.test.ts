import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import generated from "../../src/generated/content-runtime.v0.1.json";
import currentRelease from "../../src/assets/runtime-release-contract.v0.1.json";
import currentPrivateExport from "../../src/assets/runtime-core120-private-export.v0.3.json";
import currentForestVisualExport from "../../src/assets/runtime-forest-visual-private-export.v0.1.json";
import currentForestOpeningExport from "../../src/assets/runtime-forest-opening-private-export.v0.1.json";
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
      privateAssetExport: currentPrivateExport,
      forestVisualAssetExport: currentForestVisualExport,
      forestOpeningAssetExport: currentForestOpeningExport,
    })).toEqual({
      schemaVersion: "tokipona.public-asset-boundary-check.v0.3",
      status: "safe_blocked_pending_external_approval",
      core120WordCount: 120,
      publicGlyphFileCount: 1,
      approvedPrivateExportPresent: false,
      missingExportPlaceholderPresent: true,
    });
  });

  it("accepts a complete future approval only after every declared public file matches its hash", () => {
    const fixture = approvedFixture();
    expect(checkPublicRuntimeAssetBoundary(fixture.input)).toEqual({
      schemaVersion: "tokipona.public-asset-boundary-check.v0.3",
      status: "approved_runtime_assets_verified",
      core120WordCount: 120,
      publicGlyphFileCount: 7,
      approvedPrivateExportPresent: true,
      missingExportPlaceholderPresent: false,
    });
  });

  it("does not claim full approval while the opening-slice export is still missing", () => {
    const fixture = approvedFixture();
    rmSync(join(fixture.root, "public/assets/forest-chapter/opening-slice"), { recursive: true });
    expect(checkPublicRuntimeAssetBoundary({
      ...fixture.input,
      forestOpeningAssetExport: currentForestOpeningExport,
    } as any).status).toBe("safe_blocked_pending_external_approval");
  });

  it("rejects missing, changed, and undeclared runtime files", () => {
    const changed = approvedFixture();
    writeFileSync(join(changed.root,
      "public/assets/magic-glyphs/pu120-v2/pu120-activation-gray.page-0.png"), "changed");
    expect(() => checkPublicRuntimeAssetBoundary(changed.input))
      .toThrow("approved_public_asset_hash_mismatch");

    const missing = approvedFixture();
    rmSync(join(missing.root,
      "public/assets/magic-glyphs/pu120-v2/pu120-inner-edge.page-0.png"));
    expect(() => checkPublicRuntimeAssetBoundary(missing.input))
      .toThrow("approved_public_asset_missing");

    const extra = approvedFixture();
    writeFileSync(join(extra.root, "public/assets/magic-glyphs/private-review.png"), "private");
    expect(() => checkPublicRuntimeAssetBoundary(extra.input))
      .toThrow("public_glyph_file_set_invalid");

    const retiredAudio = approvedFixture();
    mkdirSync(join(retiredAudio.root, "public/assets/pronunciation"), { recursive: true });
    writeFileSync(join(retiredAudio.root, "public/assets/pronunciation/telo.ogg"), "retired");
    expect(() => checkPublicRuntimeAssetBoundary(retiredAudio.input))
      .toThrow("public_non_glyph_runtime_forbidden");
  });

  it("rejects changed and undeclared forest runtime files", () => {
    const changed = approvedFixture();
    writeFileSync(join(changed.root,
      "public/assets/forest-chapter/waterwheel-benchmark/v0.1/background-far.png"), "changed");
    expect(() => checkPublicRuntimeAssetBoundary(changed.input))
      .toThrow("approved_public_asset_hash_mismatch");

    const undeclared = approvedFixture();
    writeFileSync(join(undeclared.root,
      "public/assets/forest-chapter/waterwheel-benchmark/v0.1/undeclared.png"), "undeclared");
    expect(() => checkPublicRuntimeAssetBoundary(undeclared.input))
      .toThrow("public_forest_file_set_invalid");
  });

  it("rejects partial approval states", () => {
    const partial = approvedFixture();
    const blockedRelease = structuredClone(currentRelease);
    expect(() => checkPublicRuntimeAssetBoundary({ ...partial.input, releaseContract: blockedRelease }))
      .toThrow("partial_asset_approval_state_forbidden");
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

function approvedFixture(): Readonly<{
  root: string;
  input: Parameters<typeof checkPublicRuntimeAssetBoundary>[0];
}> {
  const root = mkdtempSync(join(tmpdir(), "tokipona-public-assets-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "public/assets/magic-glyphs"), { recursive: true });
  writeFileSync(join(root, "public/assets/magic-glyphs/README.md"), "approved runtime assets\n");
  const runtimeArtifact = approvedRuntimeArtifact();
  const manifest = readRuntimeCore120CurriculumManifest(runtimeArtifact);
  const privateAssetExport = approvedPrivateExport(manifest, root);
  const forestVisualAssetExport = approvedForestVisualExport(root);
  const forestOpeningAssetExport = approvedForestOpeningExport(root);
  const releaseContract = approvedRelease();
  const glyphCatalog = approvedCatalog();
  return Object.freeze({
    root,
    input: {
      repositoryRoot: root,
      runtimeArtifact,
      releaseContract,
      glyphCatalog,
      privateAssetExport,
      forestVisualAssetExport,
      forestOpeningAssetExport,
    },
  });
}

function approvedForestOpeningExport(root: string): any {
  const openingRoot = join(root, "public/assets/forest-chapter/opening-slice/v0.1");
  mkdirSync(openingRoot, { recursive: true });
  const specs = [
    ["far_parallax_atlas", "far-parallax.png", 640, 360],
    ["mid_parallax_atlas", "mid-parallax.png", 640, 360],
    ["environment_atlas", "environment-atlas.png", 256, 256],
    ["prop_glyph_atlas", "prop-glyph-atlas.png", 256, 128],
    ["traveler_atlas", "traveler-atlas.png", 256, 256],
    ["creature_atlas", "creature-atlas.png", 128, 64],
    ["animation_manifest", "animation-manifest.json", 0, 0],
    ["time_palette", "time-palette.json", 0, 0],
    ["audio_manifest", "audio-manifest.json", 0, 0],
    ["forest_ambience", "forest-ambience.wav", 0, 0],
    ["stream_ambience", "stream-ambience.wav", 0, 0],
    ["foley_bank", "foley-bank.wav", 0, 0],
    ["dialogue_blip_bank", "dialogue-blip-bank.wav", 0, 0],
  ] as const;
  const files = specs.map(([role, filename, width, height]) =>
    forestOpeningRuntimeFile(openingRoot, role, filename, width, height));
  return {
    schemaVersion: "tokipona.forest-opening-private-export.v0.1",
    status: "approved",
    packId: "forest.opening.vertical-slice.v001",
    manifestDigest: hash(Buffer.from("forest-opening-runtime-manifest")),
    files,
    constraints: { spriteBinaryAlpha: true, maxPaletteColors: 64,
      travelerMaxFrameHeightPx: 20, audioPeakDbfsMax: -1, audioClippedSamples: 0 },
    approvals: { source: "approved", license: "approved", pixel: "approved",
      animation: "approved", audio: "approved", accessibility: "approved", hashes: "approved" },
    privacy: { containsPrivatePaths: false, containsPrivateAssets: false,
      containsConceptAssets: false, containsReviewMedia: false },
  };
}

function forestOpeningRuntimeFile(
  root: string,
  role: string,
  filename: string,
  width: number,
  height: number,
): any {
  const bytes = Buffer.from(`opening:${role}`);
  writeFileSync(join(root, filename), bytes);
  return { role, publicPath: `assets/forest-chapter/opening-slice/v0.1/${filename}`,
    width, height, sha256: hash(bytes) };
}

function approvedForestVisualExport(root: string): any {
  const forestRoot = join(root, "public/assets/forest-chapter/waterwheel-benchmark/v0.1");
  mkdirSync(forestRoot, { recursive: true });
  const files = [
    forestRuntimeFile(forestRoot, "background_far", "background-far.png", 640, 360, "background-far"),
    forestRuntimeFile(forestRoot, "background_mid", "background-mid.png", 640, 360, "background-mid"),
    forestRuntimeFile(forestRoot, "waterwheel_landmark", "waterwheel-landmark.png", 320, 192, "waterwheel"),
    forestRuntimeFile(forestRoot, "forest_material_atlas", "forest-material-atlas.png", 256, 256, "materials"),
    forestRuntimeFile(forestRoot, "traveler_atlas", "traveler-atlas.png", 192, 96, "traveler"),
    forestRuntimeFile(forestRoot, "time_palette", "time-palette.json", 0, 0, "palette"),
    forestRuntimeFile(forestRoot, "runtime_manifest", "runtime-manifest.json", 0, 0, "manifest"),
  ];
  return {
    schemaVersion: "tokipona.forest-visual-private-export.v0.1",
    status: "approved",
    packId: "forest.waterwheel.visual-benchmark.v001",
    manifestDigest: hash(Buffer.from("forest-runtime-manifest")),
    files,
    privacy: {
      containsPrivatePaths: false,
      containsPrivateAssets: false,
      containsConceptAssets: false,
      containsReviewMedia: false,
    },
  };
}

function forestRuntimeFile(
  forestRoot: string,
  role: string,
  filename: string,
  width: number,
  height: number,
  content: string,
): any {
  const bytes = Buffer.from(content);
  writeFileSync(join(forestRoot, filename), bytes);
  return {
    role,
    publicPath: `assets/forest-chapter/waterwheel-benchmark/v0.1/${filename}`,
    width,
    height,
    sha256: hash(bytes),
  };
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
    const word = manifest.words[wordId]!;
    return [wordId, {
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
    schemaVersion: "tokipona.pu120-private-asset-export.v0.3",
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

function hash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
