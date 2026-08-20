import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  readApprovedRuntimeCore120AssetExport,
  readRuntimeCore120AssetReadiness,
  type RuntimeCore120ApprovedAssetExport,
} from "../../src/assets/runtime-core120-assets.ts";
import {
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../../src/content/runtime-core120-curriculum-manifest.ts";

export const PUBLIC_RUNTIME_ASSET_BOUNDARY_SCHEMA =
  "tokipona.public-asset-boundary-check.v0.3" as const;

export interface PublicRuntimeAssetBoundaryInput {
  readonly repositoryRoot: string;
  readonly runtimeArtifact: unknown;
  readonly releaseContract: unknown;
  readonly glyphCatalog: unknown;
  readonly privateAssetExport: unknown;
}

export interface PublicRuntimeAssetBoundaryReport {
  readonly schemaVersion: typeof PUBLIC_RUNTIME_ASSET_BOUNDARY_SCHEMA;
  readonly status:
    | "safe_blocked_pending_external_approval"
    | "approved_runtime_assets_verified";
  readonly core120WordCount: 120;
  readonly publicGlyphFileCount: number;
  readonly approvedPrivateExportPresent: boolean;
  readonly missingExportPlaceholderPresent: boolean;
}

export function readRepositoryPublicRuntimeAssetBoundary(
  repositoryRootInput: string,
): PublicRuntimeAssetBoundaryReport {
  const repositoryRoot = resolve(repositoryRootInput);
  const readJson = (logicalPath: string): unknown =>
    JSON.parse(readFileSync(checkedPath(repositoryRoot, logicalPath), "utf8")) as unknown;
  return checkPublicRuntimeAssetBoundary({
    repositoryRoot,
    runtimeArtifact: readJson("src/generated/content-runtime.v0.1.json"),
    releaseContract: readJson("src/assets/runtime-release-contract.v0.1.json"),
    glyphCatalog: readJson("data/language/pu-120-glyph-catalog.v0.2.json"),
    privateAssetExport: readJson("src/assets/runtime-core120-private-export.v0.3.json"),
  });
}

const REQUIRED_BLOCKED_GLYPH_FILES = ["public/assets/magic-glyphs/README.md"] as const;

export function checkPublicRuntimeAssetBoundary(
  input: PublicRuntimeAssetBoundaryInput,
): PublicRuntimeAssetBoundaryReport {
  const repositoryRoot = resolve(input.repositoryRoot);
  const manifest = readRuntimeCore120CurriculumManifest(input.runtimeArtifact);
  const readiness = readRuntimeCore120AssetReadiness(
    manifest,
    input.privateAssetExport,
    input.releaseContract,
  );
  readCatalog(input.glyphCatalog, manifest);
  const publicFiles = readPublicAssetFiles(repositoryRoot);
  assert(publicFiles.nonGlyphFiles.length === 0, "public_non_glyph_runtime_forbidden");

  if (readiness.playableContentMayClaimFullAssetAcceptance) {
    assert(readiness.privateAssetExport === "approved" &&
      readiness.glyphVisuals === "approved" &&
      readiness.glyphCatalog === "approved" &&
      readiness.blockingReasons.length === 0,
    "approved_asset_state_inconsistent");
    const approved = readApprovedRuntimeCore120AssetExport(manifest, input.privateAssetExport);
    const glyphRuntimeFiles = [
      approved.glyphBundle.atlasManifest,
      approved.glyphBundle.paletteManifest,
      ...approved.glyphBundle.activationPages,
      ...approved.glyphBundle.rolePatternPages,
      ...approved.glyphBundle.innerEdgePages,
    ];
    const expectedGlyphFiles = new Set<string>([
      ...REQUIRED_BLOCKED_GLYPH_FILES,
      ...glyphRuntimeFiles.map((file) => repositoryPathForPublicAsset(file.publicPath)),
    ]);
    for (const wordId of manifest.scope.wordIds) {
      assert(approved.entries[wordId]?.glyph !== undefined, "approved_export_word_missing");
    }
    for (const file of glyphRuntimeFiles) {
      assertFileHash(repositoryRoot, repositoryPathForPublicAsset(file.publicPath), file.sha256);
    }
    assertRuntimeAtlasMatches(repositoryRoot, manifest, approved);
    assertSameFileSet(publicFiles.glyphFiles, expectedGlyphFiles, "public_glyph_file_set_invalid");
    return freezeReport({
      status: "approved_runtime_assets_verified",
      publicGlyphFileCount: publicFiles.glyphFiles.length,
      approvedPrivateExportPresent: true,
      missingExportPlaceholderPresent: false,
    });
  }

  assert(readiness.privateAssetExport === "missing" &&
    readiness.glyphVisuals === "blocked_pending_private_approval" &&
    readiness.glyphCatalog === "draft" &&
    same(readiness.blockingReasons, [
      "private_asset_export_missing", "glyph_release_blocked", "glyph_catalog_not_approved",
    ]),
  "partial_asset_approval_state_forbidden");
  assertSameFileSet(publicFiles.glyphFiles, new Set(REQUIRED_BLOCKED_GLYPH_FILES),
    "unapproved_glyph_runtime_present");
  return freezeReport({
    status: "safe_blocked_pending_external_approval",
    publicGlyphFileCount: publicFiles.glyphFiles.length,
    approvedPrivateExportPresent: false,
    missingExportPlaceholderPresent: true,
  });
}

function assertRuntimeAtlasMatches(
  repositoryRoot: string,
  manifest: RuntimeCore120CurriculumManifest,
  approved: RuntimeCore120ApprovedAssetExport,
): void {
  const atlasPath = repositoryPathForPublicAsset(approved.glyphBundle.atlasManifest.publicPath);
  const atlas = record(JSON.parse(readFileSync(checkedPath(repositoryRoot, atlasPath), "utf8")) as unknown,
    "runtime_glyph_atlas_invalid");
  exactKeys(atlas, ["schemaVersion", "sourceManifestDigest", "frame", "activationPages",
    "rolePatternPages", "innerEdgePages", "glyphOrder", "glyphs", "privacy"],
  "runtime_glyph_atlas_fields_invalid");
  assert(atlas.schemaVersion === "pu120.magic-glyph-atlas.runtime.v0.2" &&
    atlas.sourceManifestDigest === manifest.sourceDigest,
  "runtime_glyph_atlas_identity_invalid");
  const frame = record(atlas.frame, "runtime_glyph_atlas_frame_invalid");
  exactKeys(frame, ["width", "height", "count"], "runtime_glyph_atlas_frame_invalid");
  assert(frame.width === 32 && frame.height === 32 && frame.count === 8,
    "runtime_glyph_atlas_frame_invalid");
  assertRuntimePages(atlas.activationPages, approved.glyphBundle.activationPages,
    "runtime_glyph_activation_pages_invalid");
  assertRuntimePages(atlas.rolePatternPages, approved.glyphBundle.rolePatternPages,
    "runtime_glyph_pattern_pages_invalid");
  assertRuntimePages(atlas.innerEdgePages, approved.glyphBundle.innerEdgePages,
    "runtime_glyph_edge_pages_invalid");
  assert(same(atlas.glyphOrder as readonly string[], manifest.scope.wordIds),
    "runtime_glyph_order_invalid");
  const glyphs = record(atlas.glyphs, "runtime_glyph_entries_invalid");
  exactKeys(glyphs, manifest.scope.wordIds, "runtime_glyph_entries_invalid");
  for (const wordId of manifest.scope.wordIds) {
    const expected = approved.entries[wordId]?.glyph;
    const word = manifest.words[wordId];
    assert(expected !== undefined && word !== undefined, "runtime_glyph_entry_missing");
    const glyph = record(glyphs[wordId], "runtime_glyph_entry_invalid");
    exactKeys(glyph, ["assetId", "displayCodepoint", "activationFrames", "rolePattern", "innerEdge"],
      "runtime_glyph_entry_fields_invalid");
    assert(glyph.assetId === word.assetBindings.glyphAssetId &&
      glyph.displayCodepoint === word.displayCodepoint &&
      sameFrames(glyph.activationFrames, expected.activationFrames) &&
      sameFrame(glyph.rolePattern, expected.rolePattern) &&
      sameFrame(glyph.innerEdge, expected.innerEdge),
    "runtime_glyph_entry_mismatch");
  }
  const privacy = record(atlas.privacy, "runtime_glyph_atlas_privacy_invalid");
  exactKeys(privacy, ["containsPrivatePaths", "containsPrivateAssets", "containsSourceFonts",
    "containsReviewMedia"], "runtime_glyph_atlas_privacy_invalid");
  assert(Object.values(privacy).every((value) => value === false),
    "runtime_glyph_atlas_privacy_invalid");
}

function assertRuntimePages(
  candidate: unknown,
  expected: readonly Readonly<{ page: number; publicPath: string; width: 1024; height: 1024;
    sha256: `sha256:${string}` }>[],
  reason: string,
): void {
  const pages = array(candidate, reason);
  assert(pages.length === expected.length, reason);
  for (let index = 0; index < expected.length; index += 1) {
    const page = record(pages[index], reason);
    exactKeys(page, ["page", "publicPath", "width", "height", "sha256"], reason);
    const wanted = expected[index]!;
    assert(page.page === wanted.page && page.publicPath === wanted.publicPath &&
      page.width === wanted.width && page.height === wanted.height && page.sha256 === wanted.sha256,
    reason);
  }
}

function sameFrames(candidate: unknown, expected: readonly unknown[] | null): boolean {
  return expected !== null && Array.isArray(candidate) && candidate.length === expected.length &&
    candidate.every((frame, index) => sameFrame(frame, expected[index]));
}

function sameFrame(candidate: unknown, expected: unknown): boolean {
  if (!isFrame(candidate) || !isFrame(expected)) return false;
  return candidate.page === expected.page && candidate.x === expected.x && candidate.y === expected.y &&
    candidate.w === expected.w && candidate.h === expected.h;
}

function isFrame(value: unknown): value is Readonly<{ page: number; x: number; y: number; w: number; h: number }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const frame = value as Record<string, unknown>;
  return Object.keys(frame).length === 5 && ["page", "x", "y", "w", "h"].every((key) => key in frame) &&
    [frame.page, frame.x, frame.y, frame.w, frame.h].every(Number.isSafeInteger);
}

function readCatalog(candidate: unknown, manifest: RuntimeCore120CurriculumManifest): void {
  const catalog = record(candidate, "glyph_catalog_invalid");
  assert(catalog.schemaVersion === "pu120.magic-glyph-catalog.v0.2" &&
    catalog.contentVersion === manifest.catalogContentVersion &&
    catalog.reviewStatus === manifest.catalogReviewStatus &&
    catalog.runtimeReady === manifest.catalogRuntimeReady,
  "glyph_catalog_identity_invalid");
  const scope = record(catalog.canonicalScope, "glyph_catalog_scope_invalid");
  assert(scope.id === "pu-120" && scope.glyphCount === 120, "glyph_catalog_scope_invalid");
  const glyphs = array(catalog.glyphs, "glyph_catalog_entries_invalid");
  assert(glyphs.length === 120, "glyph_catalog_count_invalid");
  const observed = new Set<string>();
  for (const value of glyphs) {
    const glyph = record(value, "glyph_catalog_entry_invalid");
    const wordId = string(glyph.canonicalWordId, "glyph_catalog_word_invalid");
    const word = manifest.words[wordId];
    assert(word !== undefined && !observed.has(wordId) &&
      glyph.displayCodepoint === word.displayCodepoint &&
      glyph.reviewStatus === manifest.catalogReviewStatus,
    "glyph_catalog_entry_invalid");
    observed.add(wordId);
  }
  assert(sameSet([...observed], manifest.scope.wordIds), "glyph_catalog_word_set_invalid");
}

function readPublicAssetFiles(repositoryRoot: string): Readonly<{
  glyphFiles: readonly string[];
  nonGlyphFiles: readonly string[];
}> {
  const allFiles = filesBelow(repositoryRoot, "public/assets");
  return Object.freeze({
    glyphFiles: allFiles.filter((file) => file.startsWith("public/assets/magic-glyphs/")),
    nonGlyphFiles: allFiles.filter((file) => !file.startsWith("public/assets/magic-glyphs/")),
  });
}

function filesBelow(repositoryRoot: string, logicalRoot: string): readonly string[] {
  const root = checkedPath(repositoryRoot, logicalRoot);
  if (!existsSync(root)) return Object.freeze([]);
  assert(!lstatSync(root).isSymbolicLink() && lstatSync(root).isDirectory(),
    "public_asset_root_invalid");
  const results: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const logical = relative(repositoryRoot, absolute).replaceAll("\\", "/");
      assert(!entry.isSymbolicLink(), "public_asset_symlink_forbidden");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) results.push(logical);
      else throw new Error("public_asset_entry_invalid");
    }
  };
  visit(root);
  return Object.freeze(results.sort(asciiCompare));
}

function assertFileHash(repositoryRoot: string, logicalPath: string,
  expected: `sha256:${string}`): void {
  const absolute = checkedPath(repositoryRoot, logicalPath);
  assert(existsSync(absolute), "approved_public_asset_missing");
  const stat = lstatSync(absolute);
  assert(stat.isFile() && !stat.isSymbolicLink(), "approved_public_asset_invalid");
  const actual = `sha256:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}`;
  assert(actual === expected, "approved_public_asset_hash_mismatch");
}

function repositoryPathForPublicAsset(publicPath: string): string {
  assert(/^assets\/[a-z0-9._/-]+$/.test(publicPath) && !publicPath.includes(".."),
    "public_asset_path_invalid");
  return `public/${publicPath}`;
}

function checkedPath(repositoryRoot: string, logicalPath: string): string {
  assert(!logicalPath.includes("\\") && !logicalPath.split("/").includes(".."),
    "public_asset_path_invalid");
  const absolute = resolve(repositoryRoot, logicalPath);
  const rel = relative(repositoryRoot, absolute);
  assert(rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`),
    "public_asset_path_escape");
  return absolute;
}

function assertSameFileSet(actual: readonly string[], expected: ReadonlySet<string>,
  reason: string): void {
  assert(actual.length === expected.size && actual.every((path) => expected.has(path)), reason);
}

function freezeReport(input: Omit<PublicRuntimeAssetBoundaryReport,
  "schemaVersion" | "core120WordCount">):
  PublicRuntimeAssetBoundaryReport {
  return Object.freeze({
    schemaVersion: PUBLIC_RUNTIME_ASSET_BOUNDARY_SCHEMA,
    core120WordCount: 120,
    ...input,
  });
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(reason);
  return value as Record<string, unknown>;
}
function array(value: unknown, reason: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(reason);
  return value;
}
function string(value: unknown, reason: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(reason);
  return value;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], reason: string): void {
  assert(sameSet(Object.keys(value), expected), reason);
}
function same(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}
function sameSet(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    new Set(value).size === value.length && expected.every((entry) => value.includes(entry));
}
function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function assert(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
