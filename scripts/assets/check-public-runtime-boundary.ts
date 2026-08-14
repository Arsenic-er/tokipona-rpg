import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const release = readJson("src/assets/runtime-release-contract.v0.1.json");
const catalog = readJson("data/language/pu-120-glyph-catalog.v0.2.json");
const pronunciation = readJson("src/assets/p0-pronunciation-manifest.v0.1.json");
const privateExport = readJson("src/assets/runtime-core120-private-export.v0.1.json");

assert(release.schemaVersion === "tokipona.asset-release-gate.v0.1", "release_schema_invalid");
assert(release.status === "blocked", "approved_release_requires_private_export_integration");
assert(release.destinationRoot === "public/assets/magic-glyphs", "release_destination_invalid");
assert(equalStrings(release.requiredApprovals, [
  "source", "license", "language", "pixel", "animation", "accessibility", "community", "hashes",
]), "release_approvals_invalid");
const privacy = record(release.privacy, "release_privacy_invalid");
assert(Object.values(privacy).every((value) => value === false), "release_privacy_not_clean");
const audits = array(release.currentAudits, "release_audits_invalid").map((value) =>
  record(value, "release_audit_invalid"));
assert(audits.length > 0 && audits.some((audit) => audit.decision === "deny"), "blocked_release_missing_denial");

assert(catalog.schemaVersion === "pu120.magic-glyph-catalog.v0.2", "glyph_catalog_schema_invalid");
assert(catalog.reviewStatus === "draft" && catalog.runtimeReady === false, "glyph_catalog_partial_approval");
const scope = record(catalog.canonicalScope, "glyph_catalog_scope_invalid");
assert(scope.glyphCount === 120, "glyph_catalog_count_invalid");

assert(pronunciation.schemaVersion === "tokipona.p0-pronunciation-assets.v0.1",
  "pronunciation_schema_invalid");
assert(pronunciation.status === "blocked_pending_private_assets", "pronunciation_partial_approval");
const wordIds = stringArray(pronunciation.wordIds, "pronunciation_words_invalid");
const entries = record(pronunciation.entries, "pronunciation_entries_invalid");
assert(wordIds.length === 12 && new Set(wordIds).size === 12 &&
  Object.keys(entries).length === 12 && wordIds.every((wordId) => emptyPronunciation(entries[wordId])),
"pronunciation_partial_approval");

assert(privateExport.schemaVersion === "tokipona.pu120-private-asset-export.v0.1" &&
  privateExport.status === "missing" && privateExport.manifestDigest === null &&
  privateExport.corpusId === "pu-120" && equalStrings(privateExport.wordIds, []) &&
  privateExport.glyphAtlas === null && Object.keys(record(privateExport.entries, "private_export_entries_invalid")).length === 0,
"private_export_placeholder_invalid");
const exportPrivacy = record(privateExport.privacy, "private_export_privacy_invalid");
assert(Object.values(exportPrivacy).every((value) => value === false), "private_export_privacy_not_clean");
const glyphFiles = filesBelow("public/assets/magic-glyphs");
assert(glyphFiles.length === 1 && glyphFiles[0] === "README.md", "unapproved_glyph_runtime_present");
assert(filesBelow("public/assets/pronunciation").length === 0, "unapproved_pronunciation_runtime_present");

process.stdout.write(`${JSON.stringify({
  schemaVersion: "tokipona.public-asset-boundary-check.v0.1",
  status: "safe_blocked_pending_external_approval",
  glyphCatalogWordCount: 120,
  pronunciationWordCount: 12,
  publicGlyphFiles: glyphFiles,
  approvedPrivateExportPresent: false,
  missingExportPlaceholderPresent: true,
})}\n`);

function readJson(path: string): Record<string, unknown> {
  return record(JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")), `${path}_invalid`);
}

function filesBelow(path: string): string[] {
  const root = resolve(repositoryRoot, path);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((entry) => statSync(resolve(root, entry)).isFile())
    .map((entry) => relative(root, resolve(root, entry)).replaceAll("\\", "/"))
    .sort();
}

function emptyPronunciation(value: unknown): boolean {
  const entry = record(value, "pronunciation_entry_invalid");
  return entry.audioAssetId === null && entry.publicPath === null && entry.sha256 === null &&
    entry.sourceUrl === null && entry.licenseSpdx === null && entry.redistributionApproved === false &&
    entry.languageReviewApproved === false && entry.communityReviewApproved === false;
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(reason);
  return value as Record<string, unknown>;
}

function array(value: unknown, reason: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(reason);
  return value;
}

function stringArray(value: unknown, reason: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) throw new Error(reason);
  return value;
}

function equalStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function assert(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
