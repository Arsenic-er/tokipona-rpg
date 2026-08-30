import { describe, expect, it } from "vitest";
import missing from "./runtime-forest-opening-private-export.v0.1.json";
import {
  FOREST_OPENING_PRIVATE_EXPORT_SCHEMA,
  readRuntimeForestOpeningAssetExport,
  runtimeForestOpeningAssetExport,
} from "./runtime-forest-opening-assets";

const ROOT = "assets/forest-chapter/opening-slice/v0.1";
const ROLES = [
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

function approvedFixture(): any {
  return {
    schemaVersion: FOREST_OPENING_PRIVATE_EXPORT_SCHEMA,
    status: "approved",
    packId: "forest.opening.vertical-slice.v001",
    manifestDigest: `sha256:${"a".repeat(64)}`,
    files: ROLES.map(([role, filename, width, height], index) => ({
      role,
      publicPath: `${ROOT}/${filename}`,
      width,
      height,
      sha256: `sha256:${String((index % 9) + 1).repeat(64)}`,
    })),
    constraints: {
      spriteBinaryAlpha: true,
      maxPaletteColors: 64,
      travelerMaxFrameHeightPx: 20,
      audioPeakDbfsMax: -1,
      audioClippedSamples: 0,
    },
    approvals: {
      source: "approved",
      license: "approved",
      pixel: "approved",
      animation: "approved",
      audio: "approved",
      accessibility: "approved",
      hashes: "approved",
    },
    privacy: {
      containsPrivatePaths: false,
      containsPrivateAssets: false,
      containsConceptAssets: false,
      containsReviewMedia: false,
    },
  };
}

describe("forest opening runtime asset export", () => {
  it("keeps the checked-in authority at the exact fail-closed missing form", () => {
    expect(runtimeForestOpeningAssetExport).toEqual(missing);
    expect(readRuntimeForestOpeningAssetExport(missing)).toEqual({
      schemaVersion: FOREST_OPENING_PRIVATE_EXPORT_SCHEMA,
      status: "missing",
    });
    expect(() => readRuntimeForestOpeningAssetExport({ ...missing, files: [] }))
      .toThrow(/fields|missing/i);
  });

  it("accepts only a complete future approved runtime fixture", () => {
    expect(readRuntimeForestOpeningAssetExport(approvedFixture())).toEqual(approvedFixture());
  });

  it("rejects missing, extra, duplicate roles and duplicate paths", () => {
    const missingRole = approvedFixture();
    missingRole.files.pop();
    expect(() => readRuntimeForestOpeningAssetExport(missingRole)).toThrow(/roles|files/i);

    const duplicateRole = approvedFixture();
    duplicateRole.files[1].role = duplicateRole.files[0].role;
    expect(() => readRuntimeForestOpeningAssetExport(duplicateRole)).toThrow(/roles|files/i);

    const duplicatePath = approvedFixture();
    duplicatePath.files[1].publicPath = duplicatePath.files[0].publicPath;
    expect(() => readRuntimeForestOpeningAssetExport(duplicatePath)).toThrow(/paths/i);

    expect(() => readRuntimeForestOpeningAssetExport({ ...approvedFixture(), sourceRoot: "C:/private" }))
      .toThrow(/fields/i);
  });

  it("rejects wrong hashes, dimensions, extensions, and private review markers", () => {
    const badHash = approvedFixture();
    badHash.files[0].sha256 = "sha256:1234";
    expect(() => readRuntimeForestOpeningAssetExport(badHash)).toThrow(/hash/i);

    const badDimensions = approvedFixture();
    badDimensions.files[4].height = 257;
    expect(() => readRuntimeForestOpeningAssetExport(badDimensions)).toThrow(/dimensions/i);

    const badExtension = approvedFixture();
    badExtension.files[9].publicPath = `${ROOT}/forest-ambience.ogg`;
    expect(() => readRuntimeForestOpeningAssetExport(badExtension)).toThrow(/extension|path/i);

    for (const marker of ["private", "candidate", "concept", "review", "source", "preview"]) {
      const candidate = approvedFixture();
      candidate.files[0].publicPath = `${ROOT}/${marker}-far.png`;
      expect(() => readRuntimeForestOpeningAssetExport(candidate)).toThrow(/path/i);
    }
  });

  it("rejects unapproved legal, visual, audio, accessibility, or hash status", () => {
    for (const key of Object.keys(approvedFixture().approvals)) {
      const candidate = approvedFixture();
      candidate.approvals[key] = "pending";
      expect(() => readRuntimeForestOpeningAssetExport(candidate)).toThrow(/approval/i);
    }
  });

  it("locks sprite, palette, traveler, and audio safety constraints", () => {
    for (const [key, value] of [
      ["spriteBinaryAlpha", false],
      ["maxPaletteColors", 65],
      ["travelerMaxFrameHeightPx", 21],
      ["audioPeakDbfsMax", 0],
      ["audioClippedSamples", 1],
    ] as const) {
      const candidate = approvedFixture();
      candidate.constraints[key] = value;
      expect(() => readRuntimeForestOpeningAssetExport(candidate)).toThrow(/constraints/i);
    }
  });

  it("rejects any privacy claim except exact false", () => {
    for (const key of Object.keys(approvedFixture().privacy)) {
      const candidate = approvedFixture();
      candidate.privacy[key] = true;
      expect(() => readRuntimeForestOpeningAssetExport(candidate)).toThrow(/privacy/i);
    }
  });
});
