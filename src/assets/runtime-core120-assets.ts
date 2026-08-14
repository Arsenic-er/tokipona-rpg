import generated from "../generated/content-runtime.v0.1.json";
import glyphReleaseContract from "./runtime-release-contract.v0.1.json";
import {
  isVerifiedRuntimeCore120CurriculumManifest,
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../content/runtime-core120-curriculum-manifest";

export const CORE120_PRIVATE_ASSET_EXPORT_SCHEMA = "tokipona.pu120-private-asset-export.v0.1" as const;

export interface RuntimeCore120WordAssetReadiness {
  readonly audioReady: boolean;
  readonly audioPublicPath: string | null;
  readonly glyphReady: boolean;
  readonly glyphAtlasPublicPath: string | null;
  readonly glyphAtlasFrameId: string | null;
}

export interface RuntimeCore120AssetReadiness {
  readonly privateAssetExport: "missing" | "approved";
  readonly pronunciationAudio: "blocked_pending_private_assets" | "approved";
  readonly glyphVisuals: "blocked_pending_private_approval" | "approved";
  readonly glyphCatalog: "draft" | "approved";
  readonly playableContentMayClaimFullAssetAcceptance: boolean;
  readonly blockingReasons: readonly ("private_asset_export_missing" | "glyph_release_blocked" | "glyph_catalog_not_approved")[];
  readonly wordAssets: Readonly<Record<string, RuntimeCore120WordAssetReadiness>>;
}

const REQUIRED_GLYPH_APPROVALS = ["source", "license", "language", "pixel", "animation", "accessibility", "community", "hashes"] as const;
const defaultManifest = readRuntimeCore120CurriculumManifest(generated);

export function readRuntimeCore120AssetReadiness(
  manifest: RuntimeCore120CurriculumManifest,
  privateExport: unknown = null,
  glyphRelease: unknown = glyphReleaseContract,
): RuntimeCore120AssetReadiness {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) throw new Error("core120 assets require a verified curriculum manifest");
  const glyphReleaseApproved = readGlyphReleaseApproval(glyphRelease);
  const approvedExport = privateExport === null ? null : readApprovedPrivateExport(manifest, privateExport);
  const catalogApproved = manifest.catalogReviewStatus === "approved" && manifest.catalogRuntimeReady;
  const audioApproved = approvedExport !== null;
  const glyphApproved = approvedExport !== null && glyphReleaseApproved && catalogApproved;
  const wordAssets = Object.fromEntries(manifest.scope.wordIds.map((wordId) => {
    const entry = approvedExport?.entries[wordId];
    return [wordId, Object.freeze({
      audioReady: audioApproved,
      audioPublicPath: entry?.pronunciation.publicPath ?? null,
      glyphReady: glyphApproved,
      glyphAtlasPublicPath: glyphApproved ? approvedExport!.glyphAtlas.publicPath : null,
      glyphAtlasFrameId: glyphApproved ? entry!.glyph.atlasFrameId : null,
    })];
  }));
  const blockingReasons: RuntimeCore120AssetReadiness["blockingReasons"][number][] = [];
  if (approvedExport === null) blockingReasons.push("private_asset_export_missing");
  if (!glyphReleaseApproved) blockingReasons.push("glyph_release_blocked");
  if (!catalogApproved) blockingReasons.push("glyph_catalog_not_approved");
  return deepFreeze({
    privateAssetExport: approvedExport === null ? "missing" : "approved",
    pronunciationAudio: audioApproved ? "approved" : "blocked_pending_private_assets",
    glyphVisuals: glyphApproved ? "approved" : "blocked_pending_private_approval",
    glyphCatalog: catalogApproved ? "approved" : "draft",
    playableContentMayClaimFullAssetAcceptance: audioApproved && glyphApproved,
    blockingReasons,
    wordAssets,
  });
}

interface ApprovedPrivateExport {
  readonly glyphAtlas: Readonly<{ readonly publicPath: string }>;
  readonly entries: Readonly<Record<string, Readonly<{
    readonly pronunciation: Readonly<{ readonly publicPath: string }>;
    readonly glyph: Readonly<{ readonly atlasFrameId: string }>;
  }>>>;
}

function readApprovedPrivateExport(
  manifest: RuntimeCore120CurriculumManifest,
  candidate: unknown,
): ApprovedPrivateExport {
  const root = record(candidate, "core120 private asset export");
  exactKeys(root, ["schemaVersion", "status", "manifestDigest", "corpusId", "wordIds", "glyphAtlas", "entries", "privacy"], "core120 private asset export");
  if (root.schemaVersion !== CORE120_PRIVATE_ASSET_EXPORT_SCHEMA || root.status !== "approved" || root.manifestDigest !== manifest.sourceDigest || root.corpusId !== "pu-120" || !same(root.wordIds, manifest.scope.wordIds)) throw new Error("core120 private asset export identity is invalid");
  const privacy = record(root.privacy, "core120 private export privacy");
  exactKeys(privacy, ["containsPrivatePaths", "containsPrivateAssets", "containsSourceFonts", "containsReviewMedia"], "core120 private export privacy");
  if (privacy.containsPrivatePaths !== false || privacy.containsPrivateAssets !== false || privacy.containsSourceFonts !== false || privacy.containsReviewMedia !== false) throw new Error("core120 private export leaks private material");

  const atlas = record(root.glyphAtlas, "core120 glyph atlas");
  exactKeys(atlas, ["assetId", "publicPath", "sha256", "sourceUrl", "licenseSpdx", "redistributionApproved", "sourceReviewApproved", "licenseReviewApproved", "languageReviewApproved", "pixelReviewApproved", "animationReviewApproved", "accessibilityReviewApproved", "communityReviewApproved", "hashReviewApproved"], "core120 glyph atlas");
  if (atlas.assetId !== "glyph.pu120.atlas.v2" || atlas.publicPath !== "assets/magic-glyphs/pu120-atlas.v2.png" || !sha256(atlas.sha256) || !httpsUrl(atlas.sourceUrl) || !spdx(atlas.licenseSpdx) || !allTrue(atlas, ["redistributionApproved", "sourceReviewApproved", "licenseReviewApproved", "languageReviewApproved", "pixelReviewApproved", "animationReviewApproved", "accessibilityReviewApproved", "communityReviewApproved", "hashReviewApproved"])) throw new Error("core120 glyph atlas approval is invalid");

  const entries = record(root.entries, "core120 private asset entries");
  exactKeys(entries, manifest.scope.wordIds, "core120 private asset entries");
  const audioPaths = new Set<string>();
  const frameIds = new Set<string>();
  const resultEntries: Record<string, { pronunciation: { publicPath: string }; glyph: { atlasFrameId: string } }> = {};
  for (const wordId of manifest.scope.wordIds) {
    const word = manifest.words[wordId]!;
    const entry = record(entries[wordId], `core120 private asset ${wordId}`);
    exactKeys(entry, ["pronunciation", "glyph"], `core120 private asset ${wordId}`);
    const pronunciation = record(entry.pronunciation, `core120 pronunciation ${wordId}`);
    exactKeys(pronunciation, ["assetId", "publicPath", "sha256", "sourceUrl", "licenseSpdx", "durationMs", "sampleRateHz", "channels", "redistributionApproved", "languageReviewApproved", "accessibilityReviewApproved", "communityReviewApproved", "hashReviewApproved"], `core120 pronunciation ${wordId}`);
    const publicPath = `assets/pronunciation/${wordId}.ogg`;
    if (pronunciation.assetId !== word.assetBindings.pronunciationAssetId || pronunciation.publicPath !== publicPath || audioPaths.has(publicPath) || !sha256(pronunciation.sha256) || !httpsUrl(pronunciation.sourceUrl) || !spdx(pronunciation.licenseSpdx) || !positiveIntegerInRange(pronunciation.durationMs, 100, 10_000) || (pronunciation.sampleRateHz !== 44_100 && pronunciation.sampleRateHz !== 48_000) || pronunciation.channels !== 1 || !allTrue(pronunciation, ["redistributionApproved", "languageReviewApproved", "accessibilityReviewApproved", "communityReviewApproved", "hashReviewApproved"])) throw new Error(`core120 pronunciation ${wordId} approval is invalid`);
    audioPaths.add(publicPath);

    const glyph = record(entry.glyph, `core120 glyph ${wordId}`);
    exactKeys(glyph, ["assetId", "atlasFrameId", "displayCodepoint"], `core120 glyph ${wordId}`);
    const atlasFrameId = `pu120.${wordId}`;
    if (glyph.assetId !== word.assetBindings.glyphAssetId || glyph.atlasFrameId !== atlasFrameId || frameIds.has(atlasFrameId) || glyph.displayCodepoint !== word.displayCodepoint) throw new Error(`core120 glyph ${wordId} binding is invalid`);
    frameIds.add(atlasFrameId);
    resultEntries[wordId] = { pronunciation: { publicPath }, glyph: { atlasFrameId } };
  }
  return deepFreeze({ glyphAtlas: { publicPath: atlas.publicPath as string }, entries: resultEntries });
}

function readGlyphReleaseApproval(candidate: unknown): boolean {
  const root = record(candidate, "glyph release contract");
  exactKeys(root, ["schemaVersion", "status", "destinationRoot", "requiredApprovals", "allowedRuntimeRoles", "currentAudits", "privacy"], "glyph release contract");
  if (root.schemaVersion !== "tokipona.asset-release-gate.v0.1" || root.destinationRoot !== "src/assets/runtime/magic-glyphs" || !same(root.requiredApprovals, REQUIRED_GLYPH_APPROVALS) || (root.status !== "blocked" && root.status !== "approved")) throw new Error("glyph release contract identity is invalid");
  const privacy = record(root.privacy, "glyph release privacy");
  exactKeys(privacy, ["containsPrivatePaths", "containsPrivateAssets", "containsSourceFonts", "containsReviewMedia"], "glyph release privacy");
  if (privacy.containsPrivatePaths !== false || privacy.containsPrivateAssets !== false || privacy.containsSourceFonts !== false || privacy.containsReviewMedia !== false) throw new Error("glyph release contract leaks private material");
  const audits = array(root.currentAudits, "glyph release audits").map((value, index) => {
    const audit = record(value, `glyph release audit ${index}`);
    exactKeys(audit, ["assetId", "decision", "reasonCodes"], `glyph release audit ${index}`);
    if (typeof audit.assetId !== "string" || audit.assetId.length === 0 || (audit.decision !== "allow" && audit.decision !== "deny") || !stringArray(audit.reasonCodes)) throw new Error("glyph release audit is invalid");
    return audit;
  });
  const approved = root.status === "approved";
  if (approved && (audits.length === 0 || audits.some((audit) => audit.decision !== "allow" || (audit.reasonCodes as unknown[]).length !== 0))) throw new Error("approved glyph release still contains denied audits");
  if (!approved && !audits.some((audit) => audit.decision === "deny")) throw new Error("blocked glyph release must retain a denial reason");
  return approved;
}

function allTrue(value: Record<string, unknown>, keys: readonly string[]): boolean { return keys.every((key) => value[key] === true); }
function httpsUrl(value: unknown): value is string { return typeof value === "string" && /^https:\/\/[^\s]+$/.test(value); }
function spdx(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(value); }
function sha256(value: unknown): value is string { return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value); }
function positiveIntegerInRange(value: unknown, minimum: number, maximum: number): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function stringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string"); }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function same(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { const keys = Object.keys(value); if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }

export const runtimeCore120AssetReadiness = readRuntimeCore120AssetReadiness(defaultManifest);
