import { describe, expect, it } from "vitest";
import { readRuntimeForestVisualAssetExport } from "./runtime-forest-visual-assets";

const SCHEMA = "tokipona.forest-visual-private-export.v0.1" as const;
const ROOT = "assets/forest-chapter/waterwheel-benchmark/v0.1";

function approvedFixture(): any {
  return {
    schemaVersion: SCHEMA,
    status: "approved",
    packId: "forest.waterwheel.visual-benchmark.v001",
    manifestDigest: `sha256:${"a".repeat(64)}`,
    files: [
      runtimeFile("background_far", "background-far.png", 640, 360, "1"),
      runtimeFile("background_mid", "background-mid.png", 640, 360, "2"),
      runtimeFile("waterwheel_landmark", "waterwheel-landmark.png", 320, 192, "3"),
      runtimeFile("forest_material_atlas", "forest-material-atlas.png", 256, 256, "4"),
      runtimeFile("traveler_atlas", "traveler-atlas.png", 192, 96, "5"),
      runtimeFile("time_palette", "time-palette.json", 0, 0, "6"),
      runtimeFile("runtime_manifest", "runtime-manifest.json", 0, 0, "7"),
    ],
    privacy: {
      containsPrivatePaths: false,
      containsPrivateAssets: false,
      containsConceptAssets: false,
      containsReviewMedia: false,
    },
  };
}

function runtimeFile(
  role: string,
  filename: string,
  width: number,
  height: number,
  digest: string,
): any {
  return {
    role,
    publicPath: `${ROOT}/${filename}`,
    width,
    height,
    sha256: `sha256:${digest.repeat(64)}`,
  };
}

describe("forest visual runtime asset export", () => {
  it("accepts only the exact missing authority form", () => {
    expect(readRuntimeForestVisualAssetExport({
      schemaVersion: SCHEMA,
      status: "missing",
    })).toEqual({
      schemaVersion: SCHEMA,
      status: "missing",
    });

    expect(() => readRuntimeForestVisualAssetExport({
      schemaVersion: SCHEMA,
      status: "missing",
      files: [],
    })).toThrow("forest visual export fields are invalid");
  });

  it("accepts a complete approved runtime-only fixture", () => {
    expect(readRuntimeForestVisualAssetExport(approvedFixture())).toEqual(approvedFixture());
  });

  it("rejects unknown root, file, and privacy fields", () => {
    expect(() => readRuntimeForestVisualAssetExport({
      ...approvedFixture(),
      sourcePath: "C:/private/source.png",
    })).toThrow("forest visual export fields are invalid");

    const fileField = approvedFixture();
    fileField.files[0].sourcePath = "private/background-far.psd";
    expect(() => readRuntimeForestVisualAssetExport(fileField))
      .toThrow("forest visual file fields are invalid");

    const privacyField = approvedFixture();
    privacyField.privacy.reviewNotes = [];
    expect(() => readRuntimeForestVisualAssetExport(privacyField))
      .toThrow("forest visual privacy fields are invalid");
  });

  it("rejects missing roles, duplicate roles, and duplicate public paths", () => {
    const missingRole = approvedFixture();
    missingRole.files.pop();
    expect(() => readRuntimeForestVisualAssetExport(missingRole))
      .toThrow("forest visual required files are invalid");

    const duplicateRole = approvedFixture();
    duplicateRole.files[1].role = "background_far";
    expect(() => readRuntimeForestVisualAssetExport(duplicateRole))
      .toThrow("forest visual required files are invalid");

    const duplicatePath = approvedFixture();
    duplicatePath.files[1].publicPath = duplicatePath.files[0].publicPath;
    expect(() => readRuntimeForestVisualAssetExport(duplicatePath))
      .toThrow("forest visual public paths are invalid");
  });

  it("rejects malformed manifest and file SHA-256 values", () => {
    const badManifest = approvedFixture();
    badManifest.manifestDigest = `sha256:${"A".repeat(64)}`;
    expect(() => readRuntimeForestVisualAssetExport(badManifest))
      .toThrow("forest visual export identity is invalid");

    const badFile = approvedFixture();
    badFile.files[0].sha256 = "sha256:1234";
    expect(() => readRuntimeForestVisualAssetExport(badFile))
      .toThrow("forest visual file hash is invalid");
  });

  it("rejects absolute, private, candidate, concept, and review paths", () => {
    expect(() => readRuntimeForestVisualAssetExport({
      ...approvedFixture(),
      status: "review_candidate",
    })).toThrow("forest visual export identity is invalid");

    for (const publicPath of [
      "C:/private/background-far.png",
      `${ROOT}/private-background.png`,
      `${ROOT}/candidate-background.png`,
      `${ROOT}/concept-background.png`,
      `${ROOT}/review-background.png`,
      `${ROOT}/preview-background.png`,
    ]) {
      const candidate = approvedFixture();
      candidate.files[0].publicPath = publicPath;
      expect(() => readRuntimeForestVisualAssetExport(candidate))
        .toThrow("forest visual public path is invalid");
    }
  });

  it("rejects wrong dimensions and extensions for every required role", () => {
    const wrongDimensions = approvedFixture();
    wrongDimensions.files[2].width = 321;
    expect(() => readRuntimeForestVisualAssetExport(wrongDimensions))
      .toThrow("forest visual file dimensions are invalid");

    const wrongImageExtension = approvedFixture();
    wrongImageExtension.files[0].publicPath = `${ROOT}/background-far.json`;
    expect(() => readRuntimeForestVisualAssetExport(wrongImageExtension))
      .toThrow("forest visual file extension is invalid");

    const wrongJsonExtension = approvedFixture();
    wrongJsonExtension.files[5].publicPath = `${ROOT}/time-palette.png`;
    expect(() => readRuntimeForestVisualAssetExport(wrongJsonExtension))
      .toThrow("forest visual file extension is invalid");
  });

  it("rejects every privacy flag unless it is exactly false", () => {
    for (const key of Object.keys(approvedFixture().privacy)) {
      const candidate = approvedFixture();
      candidate.privacy[key] = key === "containsPrivatePaths" ? true : null;
      expect(() => readRuntimeForestVisualAssetExport(candidate))
        .toThrow("forest visual privacy is invalid");
    }
  });
});
