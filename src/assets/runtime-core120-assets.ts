import generated from "../generated/content-runtime.v0.1.json" with { type: "json" };
import glyphReleaseContract from "./runtime-release-contract.v0.1.json" with { type: "json" };
import privateAssetExport from "./runtime-core120-private-export.v0.3.json" with { type: "json" };
import {
  isVerifiedRuntimeCore120CurriculumManifest,
  readRuntimeCore120CurriculumManifest,
  type RuntimeCore120CurriculumManifest,
} from "../content/runtime-core120-curriculum-manifest.ts";

export const CORE120_PRIVATE_ASSET_EXPORT_SCHEMA = "tokipona.pu120-private-asset-export.v0.3" as const;

export interface RuntimeCore120WordAssetReadiness {
  readonly glyphReady: boolean;
  readonly glyphAtlasPublicPath: string | null;
  readonly glyphAtlasFrameId: string | null;
}

export interface RuntimeCore120AssetReadiness {
  readonly privateAssetExport: "missing" | "review_candidate" | "approved";
  readonly glyphVisuals: "blocked_pending_private_approval" | "approved";
  readonly glyphCatalog: "draft" | "approved";
  readonly playableContentMayClaimFullAssetAcceptance: boolean;
  readonly blockingReasons: readonly ("private_asset_export_missing" | "private_asset_export_not_approved" | "glyph_release_blocked" | "glyph_catalog_not_approved")[];
  readonly wordAssets: Readonly<Record<string, RuntimeCore120WordAssetReadiness>>;
}

const REQUIRED_GLYPH_APPROVALS = ["source", "license", "language", "pixel", "animation", "accessibility", "community", "hashes"] as const;
const defaultManifest = readRuntimeCore120CurriculumManifest(generated);

export function readRuntimeCore120AssetReadiness(
  manifest: RuntimeCore120CurriculumManifest,
  privateExport: unknown = privateAssetExport,
  glyphRelease: unknown = glyphReleaseContract,
): RuntimeCore120AssetReadiness {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) throw new Error("core120 assets require a verified curriculum manifest");
  const glyphReleaseApproved = readRuntimeGlyphReleaseApproval(glyphRelease);
  const parsedExport = readPrivateExport(manifest, privateExport);
  const approvedExport = parsedExport?.status === "approved" ? parsedExport.approved : null;
  const catalogApproved = manifest.catalogReviewStatus === "approved" && manifest.catalogRuntimeReady;
  const glyphApproved = approvedExport !== null && glyphReleaseApproved && catalogApproved;
  const wordAssets = Object.fromEntries(manifest.scope.wordIds.map((wordId) => {
    const entry = approvedExport?.entries[wordId];
    const activationFrame = entry?.glyph.activationFrames?.[0];
    const activationPage = activationFrame === undefined ? undefined :
      approvedExport?.glyphBundle?.activationPages.find((page) => page.page === activationFrame.page);
    return [wordId, Object.freeze({
      glyphReady: glyphApproved,
      glyphAtlasPublicPath: glyphApproved ? activationPage?.publicPath ?? approvedExport!.glyphAtlas.publicPath : null,
      glyphAtlasFrameId: glyphApproved ? entry!.glyph.atlasFrameId : null,
    })];
  }));
  const blockingReasons: RuntimeCore120AssetReadiness["blockingReasons"][number][] = [];
  if (parsedExport === null) blockingReasons.push("private_asset_export_missing");
  else if (approvedExport === null) blockingReasons.push("private_asset_export_not_approved");
  if (!glyphReleaseApproved) blockingReasons.push("glyph_release_blocked");
  if (!catalogApproved) blockingReasons.push("glyph_catalog_not_approved");
  return deepFreeze({
    privateAssetExport: parsedExport?.status ?? "missing",
    glyphVisuals: glyphApproved ? "approved" : "blocked_pending_private_approval",
    glyphCatalog: catalogApproved ? "approved" : "draft",
    playableContentMayClaimFullAssetAcceptance: glyphApproved,
    blockingReasons,
    wordAssets,
  });
}

export interface RuntimeCore120ApprovedAssetExport {
  readonly glyphAtlas: Readonly<{
    readonly publicPath: string;
    readonly sha256: `sha256:${string}`;
  }>;
  readonly glyphBundle: RuntimeCore120GlyphBundle;
  readonly entries: Readonly<Record<string, Readonly<{
    readonly glyph: Readonly<{
      readonly atlasFrameId: string;
      readonly activationFrames: readonly RuntimeCore120AtlasFrame[] | null;
      readonly rolePattern: RuntimeCore120AtlasFrame | null;
      readonly innerEdge: RuntimeCore120AtlasFrame | null;
    }>;
  }>>>;
}

export interface RuntimeCore120GlyphBundle {
  readonly atlasManifest: RuntimeCore120RuntimeFile;
  readonly paletteManifest: RuntimeCore120RuntimeFile;
  readonly activationPages: readonly RuntimeCore120RuntimePage[];
  readonly rolePatternPages: readonly RuntimeCore120RuntimePage[];
  readonly innerEdgePages: readonly RuntimeCore120RuntimePage[];
}

export interface RuntimeCore120AssetExportCandidate {
  readonly status: "review_candidate" | "approved";
  readonly manifestDigest: string;
  readonly glyphBundle: RuntimeCore120GlyphBundle;
  readonly entries: Readonly<Record<string, Readonly<{
    readonly glyph: Readonly<{
      readonly assetId: string;
      readonly displayCodepoint: string;
      readonly activationFrames: readonly RuntimeCore120AtlasFrame[];
      readonly rolePattern: RuntimeCore120AtlasFrame;
      readonly innerEdge: RuntimeCore120AtlasFrame;
    }>;
  }>>>;
}

export interface RuntimeCore120RuntimeFile {
  readonly publicPath: string;
  readonly sha256: `sha256:${string}`;
}

export interface RuntimeCore120RuntimePage extends RuntimeCore120RuntimeFile {
  readonly page: number;
  readonly width: 1024;
  readonly height: 1024;
}

interface ParsedPrivateExport {
  readonly status: "review_candidate" | "approved";
  readonly approved: RuntimeCore120ApprovedAssetExport | null;
  readonly candidate: RuntimeCore120AssetExportCandidate;
}

export interface RuntimeCore120AtlasFrame {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: 32;
  readonly h: 32;
}

export function readApprovedRuntimeCore120AssetExport(
  manifest: RuntimeCore120CurriculumManifest,
  candidate: unknown,
): RuntimeCore120ApprovedAssetExport {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) {
    throw new Error("core120 assets require a verified curriculum manifest");
  }
  const parsed = readPrivateExport(manifest, candidate);
  if (parsed?.status !== "approved" || parsed.approved === null) {
    throw new Error("core120 private asset export is not approved");
  }
  return parsed.approved;
}

export function readRuntimeCore120AssetExportCandidate(
  manifest: RuntimeCore120CurriculumManifest,
  candidate: unknown,
): RuntimeCore120AssetExportCandidate {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) {
    throw new Error("core120 assets require a verified curriculum manifest");
  }
  const parsed = readPrivateExport(manifest, candidate);
  if (parsed === null) throw new Error("core120 private asset export candidate is missing");
  return parsed.candidate;
}

function readPrivateExport(
  manifest: RuntimeCore120CurriculumManifest,
  candidate: unknown,
): ParsedPrivateExport | null {
  if (candidate === null) return null;
  const root = record(candidate, "core120 private asset export");
  if (root.schemaVersion === CORE120_PRIVATE_ASSET_EXPORT_SCHEMA) {
    return readV3PrivateExport(manifest, root);
  }
  if (root.schemaVersion === "tokipona.pu120-private-asset-export.v0.1" ||
      root.schemaVersion === "tokipona.pu120-private-asset-export.v0.2") {
    throw new Error("core120 legacy private asset export is no longer supported");
  }
  throw new Error("core120 private asset export schema is invalid");
}

function readV3PrivateExport(
  manifest: RuntimeCore120CurriculumManifest,
  root: Record<string, unknown>,
): ParsedPrivateExport | null {
  exactKeys(root, ["schemaVersion", "status", "manifestDigest", "corpusId", "wordIds", "glyphBundle", "entries", "privacy"], "core120 v3 private asset export");
  const privacy = readPrivacy(root.privacy, "core120 v3 private export privacy");
  if (!privacy) throw new Error("core120 v3 private export leaks private material");
  if (root.status === "missing") {
    if (root.manifestDigest !== null || root.corpusId !== "pu-120" || !same(root.wordIds, []) || root.glyphBundle !== null || !same(Object.keys(record(root.entries, "core120 v3 missing entries")), [])) {
      throw new Error("core120 v3 missing private asset export is invalid");
    }
    return null;
  }
  if ((root.status !== "review_candidate" && root.status !== "approved") ||
      root.manifestDigest !== manifest.sourceDigest || root.corpusId !== "pu-120" ||
      !same(root.wordIds, manifest.scope.wordIds)) {
    throw new Error("core120 v3 private asset export identity is invalid");
  }
  const bundle = record(root.glyphBundle, "core120 v2 glyph bundle");
  exactKeys(bundle, ["assetId", "sourceUrl", "licenseSpdx", "approvals", "atlasManifest", "paletteManifest", "activationPages", "rolePatternPages", "innerEdgePages"], "core120 v2 glyph bundle");
  if (bundle.assetId !== "glyph.pu120.bundle.v2" || !spdx(bundle.licenseSpdx) ||
      (bundle.sourceUrl !== null && !httpsUrl(bundle.sourceUrl))) {
    throw new Error("core120 v2 glyph bundle identity is invalid");
  }
  const approvals = record(bundle.approvals, "core120 v2 glyph approvals");
  exactKeys(approvals, REQUIRED_GLYPH_APPROVALS, "core120 v2 glyph approvals");
  const expectedApproval = root.status === "approved" ? "approved" : "pending";
  if (!REQUIRED_GLYPH_APPROVALS.every((approval) => approvals[approval] === expectedApproval)) {
    throw new Error("core120 v2 glyph approvals are invalid");
  }
  if (root.status === "approved" && !httpsUrl(bundle.sourceUrl)) {
    throw new Error("core120 v2 approved glyph source is invalid");
  }

  const atlasManifest = readManifestFile(bundle.atlasManifest, "pu120-glyph-atlas.v0.2.json", "core120 v2 atlas manifest");
  const paletteManifest = readManifestFile(bundle.paletteManifest, "pu120-glyph-palettes.v0.1.json", "core120 v2 palette manifest");
  const activationPages = readAtlasPages(bundle.activationPages, "activation", 2);
  const rolePatternPages = readAtlasPages(bundle.rolePatternPages, "role-patterns", 1);
  const innerEdgePages = readAtlasPages(bundle.innerEdgePages, "inner-edge", 1);
  const activationPageRecords = runtimePages(bundle.activationPages);
  const rolePatternPageRecords = runtimePages(bundle.rolePatternPages);
  const innerEdgePageRecords = runtimePages(bundle.innerEdgePages);
  const glyphBundle: RuntimeCore120GlyphBundle = {
    atlasManifest,
    paletteManifest,
    activationPages: activationPageRecords,
    rolePatternPages: rolePatternPageRecords,
    innerEdgePages: innerEdgePageRecords,
  };

  const entries = record(root.entries, "core120 v2 entries");
  exactKeys(entries, manifest.scope.wordIds, "core120 v2 entries");
  const activationRects = new Set<string>();
  const patternRects = new Set<string>();
  const edgeRects = new Set<string>();
  const resultEntries: Record<string, {
    glyph: { atlasFrameId: string; activationFrames: readonly RuntimeCore120AtlasFrame[]; rolePattern: RuntimeCore120AtlasFrame; innerEdge: RuntimeCore120AtlasFrame };
  }> = {};
  const candidateEntries: Record<string, {
    glyph: { assetId: string; displayCodepoint: string; activationFrames: readonly RuntimeCore120AtlasFrame[]; rolePattern: RuntimeCore120AtlasFrame; innerEdge: RuntimeCore120AtlasFrame };
  }> = {};
  for (const wordId of manifest.scope.wordIds) {
    const word = manifest.words[wordId]!;
    const entry = record(entries[wordId], `core120 v3 entry ${wordId}`);
    exactKeys(entry, ["glyph"], `core120 v3 entry ${wordId}`);
    const glyph = record(entry.glyph, `core120 v2 glyph ${wordId}`);
    exactKeys(glyph, ["assetId", "displayCodepoint", "activationFrames", "rolePattern", "innerEdge"], `core120 v2 glyph ${wordId}`);
    if (glyph.assetId !== word.assetBindings.glyphAssetId || glyph.displayCodepoint !== word.displayCodepoint) {
      throw new Error(`core120 v2 glyph ${wordId} binding is invalid`);
    }
    const frames = array(glyph.activationFrames, `core120 v2 activation frames ${wordId}`);
    if (frames.length !== 8) throw new Error(`core120 v2 activation frames ${wordId} are invalid`);
    const parsedFrames = frames.map((value) => {
      const frame = readFrame(value, activationPages, `core120 v2 activation frame ${wordId}`);
      uniqueFrame(activationRects, frame, `core120 v2 activation frame ${wordId}`);
      return frame;
    });
    const rolePattern = readFrame(glyph.rolePattern, rolePatternPages, `core120 v2 role pattern ${wordId}`);
    const innerEdge = readFrame(glyph.innerEdge, innerEdgePages, `core120 v2 inner edge ${wordId}`);
    uniqueFrame(patternRects, rolePattern, `core120 v2 role pattern ${wordId}`);
    uniqueFrame(edgeRects, innerEdge, `core120 v2 inner edge ${wordId}`);
    candidateEntries[wordId] = {
      glyph: {
        assetId: word.assetBindings.glyphAssetId,
        displayCodepoint: word.displayCodepoint,
        activationFrames: parsedFrames,
        rolePattern,
        innerEdge,
      },
    };
    if (root.status === "approved") {
      resultEntries[wordId] = {
        glyph: { atlasFrameId: `pu120.${wordId}`, activationFrames: parsedFrames, rolePattern, innerEdge },
      };
    }
  }
  const parsedCandidate = deepFreeze({
    status: root.status,
    manifestDigest: manifest.sourceDigest,
    glyphBundle,
    entries: candidateEntries,
  }) as RuntimeCore120AssetExportCandidate;
  if (root.status === "review_candidate") return { status: "review_candidate", approved: null, candidate: parsedCandidate };
  const firstActivationPage = activationPageRecords[0]!;
  return {
    status: "approved",
    approved: deepFreeze({
      glyphAtlas: { publicPath: firstActivationPage.publicPath, sha256: firstActivationPage.sha256 },
      glyphBundle,
      entries: resultEntries,
    }),
    candidate: parsedCandidate,
  };
}

function readPrivacy(value: unknown, label: string): boolean {
  const privacy = record(value, label);
  exactKeys(privacy, ["containsPrivatePaths", "containsPrivateAssets", "containsSourceFonts", "containsReviewMedia"], label);
  return privacy.containsPrivatePaths === false && privacy.containsPrivateAssets === false && privacy.containsSourceFonts === false && privacy.containsReviewMedia === false;
}

function readManifestFile(value: unknown, filename: string, label: string): RuntimeCore120RuntimeFile {
  const file = record(value, label);
  exactKeys(file, ["publicPath", "sha256"], label);
  if (file.publicPath !== `assets/magic-glyphs/pu120-v2/${filename}` || !sha256(file.sha256)) throw new Error(`${label} is invalid`);
  return { publicPath: file.publicPath as string, sha256: file.sha256 as `sha256:${string}` };
}

function runtimePages(value: unknown): readonly RuntimeCore120RuntimePage[] {
  return array(value, "core120 v2 runtime pages").map((candidate) => {
    const page = candidate as Record<string, unknown>;
    return {
      page: page.page as number,
      publicPath: page.publicPath as string,
      width: 1024,
      height: 1024,
      sha256: page.sha256 as `sha256:${string}`,
    };
  });
}

function readAtlasPages(value: unknown, kind: "activation" | "role-patterns" | "inner-edge", count: number): ReadonlyMap<number, Readonly<{ width: number; height: number }>> {
  const pages = array(value, `core120 v2 ${kind} pages`);
  if (pages.length !== count) throw new Error(`core120 v2 ${kind} pages are invalid`);
  const result = new Map<number, { width: number; height: number }>();
  for (let index = 0; index < pages.length; index += 1) {
    const page = record(pages[index], `core120 v2 ${kind} page ${index}`);
    exactKeys(page, ["page", "publicPath", "width", "height", "sha256"], `core120 v2 ${kind} page ${index}`);
    const filename = kind === "activation" ? `pu120-activation-gray.page-${index}.png` : `pu120-${kind}.page-${index}.png`;
    if (page.page !== index || page.publicPath !== `assets/magic-glyphs/pu120-v2/${filename}` ||
        page.width !== 1024 || page.height !== 1024 || !sha256(page.sha256)) {
      throw new Error(`core120 v2 ${kind} page ${index} is invalid`);
    }
    result.set(index, { width: 1024, height: 1024 });
  }
  return result;
}

function readFrame(value: unknown, pages: ReadonlyMap<number, Readonly<{ width: number; height: number }>>, label: string): RuntimeCore120AtlasFrame {
  const frame = record(value, label);
  exactKeys(frame, ["page", "x", "y", "w", "h"], label);
  const page = Number.isSafeInteger(frame.page) ? pages.get(frame.page as number) : undefined;
  if (!page || !Number.isSafeInteger(frame.x) || !Number.isSafeInteger(frame.y) || frame.w !== 32 || frame.h !== 32 ||
      (frame.x as number) < 0 || (frame.y as number) < 0 || (frame.x as number) + 32 > page.width || (frame.y as number) + 32 > page.height) {
    throw new Error(`${label} is invalid`);
  }
  return { page: frame.page as number, x: frame.x as number, y: frame.y as number, w: 32, h: 32 };
}

function uniqueFrame(observed: Set<string>, frame: RuntimeCore120AtlasFrame, label: string): void {
  const key = `${frame.page}:${frame.x}:${frame.y}:${frame.w}:${frame.h}`;
  if (observed.has(key)) throw new Error(`${label} overlaps another glyph frame`);
  observed.add(key);
}

export function readRuntimeGlyphReleaseApproval(candidate: unknown): boolean {
  const root = record(candidate, "glyph release contract");
  exactKeys(root, ["schemaVersion", "status", "destinationRoot", "requiredApprovals", "allowedRuntimeRoles", "currentAudits", "privacy"], "glyph release contract");
  if (root.schemaVersion !== "tokipona.asset-release-gate.v0.1" || root.destinationRoot !== "public/assets/magic-glyphs" || !same(root.requiredApprovals, REQUIRED_GLYPH_APPROVALS) || (root.status !== "blocked" && root.status !== "approved")) throw new Error("glyph release contract identity is invalid");
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

function httpsUrl(value: unknown): value is string { return typeof value === "string" && /^https:\/\/[^\s]+$/.test(value); }
function spdx(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(value); }
function sha256(value: unknown): value is string { return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value); }
function stringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string"); }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function same(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { const keys = Object.keys(value); if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }

export const runtimeCore120AssetReadiness = readRuntimeCore120AssetReadiness(defaultManifest);
