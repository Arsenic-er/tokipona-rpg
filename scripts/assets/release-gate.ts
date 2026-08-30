import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parse } from "yaml";

export const ASSET_RELEASE_SCHEMA_VERSION = "tokipona.asset-release-gate.v0.1" as const;
export const PUBLIC_RUNTIME_ROOT = "public/assets/magic-glyphs" as const;
export const PUBLIC_FOREST_VISUAL_ROOT = "public/assets/forest-chapter" as const;

export const REQUIRED_APPROVALS = [
  "source",
  "license",
  "language",
  "pixel",
  "animation",
  "accessibility",
  "community",
  "hashes",
] as const;

export type RequiredApproval = (typeof REQUIRED_APPROVALS)[number];
export type ReleaseDecision = "allow" | "deny";

export interface ReleaseGateCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly reasonCode: string;
}

export interface AssetReleaseAudit {
  readonly schemaVersion: typeof ASSET_RELEASE_SCHEMA_VERSION;
  readonly assetId: string;
  readonly decision: ReleaseDecision;
  readonly runtimeReady: boolean;
  readonly publicExportDeclared: boolean;
  readonly fileCount: number;
  readonly checks: readonly ReleaseGateCheck[];
}

export interface AuditAssetReleaseOptions {
  readonly manifestPath: string;
  readonly assetRoot: string;
  readonly publicRepositoryRoot: string;
}

export interface ExportAssetReleaseOptions extends AuditAssetReleaseOptions {
  readonly dryRun?: boolean;
}

export interface AssetReleaseExportResult {
  readonly audit: AssetReleaseAudit;
  readonly dryRun: boolean;
  readonly exported: boolean;
  readonly publicDestination?: string;
}

interface ReleaseFile {
  readonly source: string;
  readonly target: string;
  readonly sha256: string;
  readonly role: RuntimeFileRole;
}

interface ParsedRelease {
  readonly manifest: UnknownRecord;
  readonly assetId: string;
  readonly runtimeReady: boolean;
  readonly publicExport: UnknownRecord | undefined;
  readonly destinationRoot: RuntimeRootId;
  readonly destination: string | undefined;
  readonly files: readonly ReleaseFile[];
  readonly licenseRecordPath: string | undefined;
}

type UnknownRecord = Record<string, unknown>;
type RuntimeFileRole = keyof typeof ROLE_EXTENSIONS;
type RuntimeRootId = keyof typeof RUNTIME_ROOTS;

const RUNTIME_ROOTS = {
  magic_glyphs: PUBLIC_RUNTIME_ROOT,
  forest_chapter_visuals: PUBLIC_FOREST_VISUAL_ROOT,
  forest_chapter_opening: PUBLIC_FOREST_VISUAL_ROOT,
} as const;

const FOREST_VISUAL_REQUIRED_APPROVALS = [
  "source",
  "license",
  "pixel",
  "animation",
  "accessibility",
  "hashes",
] as const;

const FOREST_OPENING_REQUIRED_APPROVALS = [
  "source",
  "license",
  "pixel",
  "animation",
  "audio",
  "accessibility",
  "hashes",
] as const;

const ROLE_EXTENSIONS = {
  runtime_layer: [".png"],
  runtime_atlas: [".png"],
  runtime_mask: [".png"],
  runtime_animation: [".apng"],
  runtime_palette: [".json"],
  runtime_manifest: [".json"],
  runtime_audio: [".ogg", ".wav"],
} as const;

const ROOT_ROLES = {
  magic_glyphs: new Set<RuntimeFileRole>([
    "runtime_atlas",
    "runtime_mask",
    "runtime_animation",
    "runtime_palette",
    "runtime_manifest",
  ]),
  forest_chapter_visuals: new Set<RuntimeFileRole>([
    "runtime_layer",
    "runtime_atlas",
    "runtime_palette",
    "runtime_manifest",
  ]),
  forest_chapter_opening: new Set<RuntimeFileRole>([
    "runtime_layer",
    "runtime_atlas",
    "runtime_palette",
    "runtime_manifest",
    "runtime_audio",
  ]),
} as const;

const FORBIDDEN_PATH_SEGMENTS = new Set([
  "fonts",
  "legal",
  "manifests",
  "previews",
  "review",
  "scripts",
  "sheets",
  "source",
]);

const FORBIDDEN_FILE_MARKERS = [
  "contact-sheet",
  "motion-reference",
  "preview",
  "review",
];

const FOREST_VISUAL_FORBIDDEN_PATH_MARKERS = [
  ...FORBIDDEN_FILE_MARKERS,
  "candidate",
  "concept",
  "private",
  "source",
] as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export function auditAssetRelease(options: AuditAssetReleaseOptions): AssetReleaseAudit {
  const checks: ReleaseGateCheck[] = [];
  const deny = (id: string, reasonCode: string): void => {
    checks.push({ id, passed: false, reasonCode });
  };
  const pass = (id: string): void => {
    checks.push({ id, passed: true, reasonCode: "ok" });
  };

  let parsed: ParsedRelease;
  try {
    parsed = parseRelease(options);
    pass("manifest_parse");
  } catch (error) {
    deny("manifest_parse", errorCode(error, "manifest_invalid"));
    return createAudit("unknown", false, false, 0, checks);
  }

  if (parsed.runtimeReady) pass("runtime_ready");
  else deny("runtime_ready", "runtime_not_ready");

  if (parsed.publicExport) pass("public_export_declared");
  else deny("public_export_declared", "public_export_missing");

  const releaseStatus = stringValue(parsed.publicExport?.release_status);
  if (releaseStatus === "approved") pass("release_status");
  else deny("release_status", "release_status_not_approved");

  auditApprovals(parsed.publicExport, parsed.destinationRoot, checks);
  auditLicenseRecord(parsed, options, checks);
  auditDestination(parsed, options, checks);
  auditFiles(parsed, options, checks);

  return createAudit(
    parsed.assetId,
    parsed.runtimeReady,
    parsed.publicExport !== undefined,
    parsed.files.length,
    checks,
  );
}

export function exportApprovedAssetRelease(options: ExportAssetReleaseOptions): AssetReleaseExportResult {
  const audit = auditAssetRelease(options);
  if (audit.decision === "deny") {
    return { audit, dryRun: options.dryRun === true, exported: false };
  }

  const parsed = parseRelease(options);
  if (!parsed.destination) throw new Error("destination_missing");
  const publicRuntimeRoot = resolve(
    options.publicRepositoryRoot,
    RUNTIME_ROOTS[parsed.destinationRoot],
  );
  const destination = resolve(publicRuntimeRoot, parsed.destination);
  const publicDestination = toPublicPath(options.publicRepositoryRoot, destination);

  if (options.dryRun === true) {
    return { audit, dryRun: true, exported: false, publicDestination };
  }

  if (existsSync(destination)) {
    return {
      audit: appendDeniedCheck(audit, "destination_available", "destination_exists"),
      dryRun: false,
      exported: false,
    };
  }

  assertNoSymlinkComponents(options.publicRepositoryRoot, dirname(destination));
  mkdirSync(dirname(destination), { recursive: true });
  assertNoSymlinkComponents(options.publicRepositoryRoot, dirname(destination));

  const staging = `${destination}.staging-${randomUUID()}`;
  mkdirSync(staging, { recursive: false });
  try {
    const assetRoot = realpathSync(options.assetRoot);
    for (const file of parsed.files) {
      const source = resolveSafeExistingFile(assetRoot, file.source, "source_path_escape");
      const target = resolveSafeTarget(staging, file.target, "target_path_escape");
      mkdirSync(dirname(target), { recursive: true });
      assertNoSymlinkComponents(staging, dirname(target));
      copyFileSync(source, target);
      if (sha256File(target) !== file.sha256) throw new Error("copied_hash_mismatch");
    }
    renameSync(staging, destination);
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  return { audit, dryRun: false, exported: true, publicDestination };
}

export function serializePublicAudit(audit: AssetReleaseAudit): string {
  return `${JSON.stringify(audit, null, 2)}\n`;
}

function parseRelease(options: AuditAssetReleaseOptions): ParsedRelease {
  const assetRoot = realpathSync(options.assetRoot);
  const manifestPath = resolveSafeExistingFile(assetRoot, options.manifestPath, "manifest_path_escape");
  const parsed = parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("manifest_not_object");

  const assetId = safePublicIdentifier(parsed.asset_id) ?? "unknown";
  const outputs = recordValue(parsed.outputs);
  const publicExport = recordValue(parsed.public_export) ?? recordValue(outputs?.public_export);
  const rawFiles = Array.isArray(publicExport?.files) ? publicExport.files : [];
  const files = rawFiles.map(parseReleaseFile).filter((file): file is ReleaseFile => file !== undefined);
  const sourceFont = recordValue(parsed.source_font);
  const destinationRoot = parseRuntimeRoot(publicExport?.destination_root);

  return {
    manifest: parsed,
    assetId,
    runtimeReady: parsed.runtime_ready === true,
    publicExport,
    destinationRoot,
    destination: stringValue(publicExport?.destination),
    files,
    licenseRecordPath:
      stringValue(publicExport?.license_record) ?? stringValue(sourceFont?.license_record),
  };
}

function parseRuntimeRoot(value: unknown): RuntimeRootId {
  if (value === undefined || value === null) return "magic_glyphs";
  const root = stringValue(value);
  if (root === "magic_glyphs" || root === "forest_chapter_visuals" || root === "forest_chapter_opening") return root;
  throw new Error("destination_root_invalid");
}

function parseReleaseFile(value: unknown): ReleaseFile | undefined {
  if (!isRecord(value)) return undefined;
  const role = stringValue(value.role);
  if (!(role && role in ROLE_EXTENSIONS)) return undefined;
  const source = stringValue(value.source);
  const target = stringValue(value.target);
  const sha256 = stringValue(value.sha256)?.toLowerCase();
  if (!(source && target && sha256)) return undefined;
  return { source, target, sha256, role: role as RuntimeFileRole };
}

function auditApprovals(
  publicExport: UnknownRecord | undefined,
  destinationRoot: RuntimeRootId,
  checks: ReleaseGateCheck[],
): void {
  const approvals = recordValue(publicExport?.approvals);
  const requiredApprovals = destinationRoot === "forest_chapter_visuals"
    ? FOREST_VISUAL_REQUIRED_APPROVALS
    : destinationRoot === "forest_chapter_opening"
      ? FOREST_OPENING_REQUIRED_APPROVALS
      : REQUIRED_APPROVALS;
  for (const approval of requiredApprovals) {
    const passed = approvals?.[approval] === "approved";
    checks.push({
      id: `approval_${approval}`,
      passed,
      reasonCode: passed ? "ok" : `${approval}_approval_missing`,
    });
  }
}

function auditLicenseRecord(
  parsed: ParsedRelease,
  options: AuditAssetReleaseOptions,
  checks: ReleaseGateCheck[],
): void {
  const check = (id: string, passed: boolean, reasonCode: string): void => {
    checks.push({ id, passed, reasonCode: passed ? "ok" : reasonCode });
  };
  if (!parsed.licenseRecordPath) {
    check("license_record", false, "license_record_missing");
    return;
  }

  try {
    const assetRoot = realpathSync(options.assetRoot);
    const licenseRecordPath = resolveSafeExistingFile(
      assetRoot,
      parsed.licenseRecordPath,
      "license_record_path_escape",
    );
    const licenseRecord = parse(readFileSync(licenseRecordPath, "utf8"));
    if (!isRecord(licenseRecord)) throw new Error("license_record_invalid");
    check("license_record", true, "license_record_invalid");
    check("license_status", licenseRecord.status === "approved", "license_status_not_approved");
    check(
      "license_source",
      licenseRecord.source_url_status === "verified" && Boolean(stringValue(licenseRecord.source_url)),
      "license_source_unverified",
    );
    check(
      "license_redistribution",
      licenseRecord.redistribution_status === "approved",
      "license_redistribution_not_approved",
    );
    check("license_spdx", Boolean(stringValue(licenseRecord.license_spdx)), "license_spdx_missing");
    auditLicenseFileHashes(assetRoot, licenseRecord, checks);
  } catch (error) {
    check("license_record", false, errorCode(error, "license_record_invalid"));
  }
}

function auditLicenseFileHashes(
  assetRoot: string,
  licenseRecord: UnknownRecord,
  checks: ReleaseGateCheck[],
): void {
  const files = recordValue(licenseRecord.files);
  if (!files || Object.keys(files).length === 0) {
    checks.push({ id: "license_file_hashes", passed: false, reasonCode: "license_files_missing" });
    return;
  }
  let passed = true;
  let reasonCode = "ok";
  for (const value of Object.values(files)) {
    const file = recordValue(value);
    const path = stringValue(file?.path);
    const sha256 = stringValue(file?.sha256)?.toLowerCase();
    if (!(path && sha256 && SHA256_PATTERN.test(sha256))) {
      passed = false;
      reasonCode = "license_file_hash_missing";
      break;
    }
    try {
      const absolutePath = resolveSafeExistingFile(assetRoot, path, "license_file_path_escape");
      if (sha256LicenseEvidence(absolutePath) !== sha256) {
        passed = false;
        reasonCode = "license_file_hash_mismatch";
        break;
      }
    } catch (error) {
      passed = false;
      reasonCode = errorCode(error, "license_file_unavailable");
      break;
    }
  }
  checks.push({ id: "license_file_hashes", passed, reasonCode });
}

function auditDestination(
  parsed: ParsedRelease,
  options: AuditAssetReleaseOptions,
  checks: ReleaseGateCheck[],
): void {
  if (!parsed.destination) {
    checks.push({ id: "destination", passed: false, reasonCode: "destination_missing" });
    return;
  }
  try {
    if (parsed.destinationRoot === "magic_glyphs" && parsed.destination === ".") {
      throw new Error("glyph_root_replacement_forbidden");
    }
    const root = resolve(options.publicRepositoryRoot, RUNTIME_ROOTS[parsed.destinationRoot]);
    resolveSafeTarget(root, parsed.destination, "destination_path_escape");
    checks.push({ id: "destination", passed: true, reasonCode: "ok" });
  } catch (error) {
    checks.push({ id: "destination", passed: false, reasonCode: errorCode(error, "destination_invalid") });
  }
}

function auditFiles(
  parsed: ParsedRelease,
  options: AuditAssetReleaseOptions,
  checks: ReleaseGateCheck[],
): void {
  const publicExport = parsed.publicExport;
  const declaredFiles = Array.isArray(publicExport?.files) ? publicExport.files : [];
  if (declaredFiles.length === 0) {
    checks.push({ id: "runtime_files", passed: false, reasonCode: "runtime_files_missing" });
    return;
  }
  if (parsed.files.length !== declaredFiles.length) {
    checks.push({ id: "runtime_files", passed: false, reasonCode: "runtime_file_entry_invalid" });
    return;
  }

  const targetSet = new Set<string>();
  let passed = true;
  let reasonCode = "ok";
  try {
    const assetRoot = realpathSync(options.assetRoot);
    for (const file of parsed.files) {
      if (!ROOT_ROLES[parsed.destinationRoot].has(file.role)) {
        throw new Error("runtime_role_root_mismatch");
      }
      validateRuntimeFilePath(file.source, file.role, parsed.destinationRoot);
      validateRuntimeFilePath(file.target, file.role, parsed.destinationRoot);
      resolveSafeTarget(assetRoot, file.source, "source_path_escape");
      resolveSafeTarget(assetRoot, file.target, "target_path_escape");
      if (!SHA256_PATTERN.test(file.sha256)) throw new Error("runtime_file_hash_missing");
      if (targetSet.has(file.target.toLowerCase())) throw new Error("duplicate_runtime_target");
      targetSet.add(file.target.toLowerCase());
      const source = resolveSafeExistingFile(assetRoot, file.source, "source_path_escape");
      if (sha256File(source) !== file.sha256) throw new Error("runtime_file_hash_mismatch");
    }
  } catch (error) {
    passed = false;
    reasonCode = errorCode(error, "runtime_file_invalid");
  }
  checks.push({ id: "runtime_files", passed, reasonCode });
}

function validateRuntimeFilePath(
  path: string,
  role: RuntimeFileRole,
  destinationRoot: RuntimeRootId,
): void {
  if (!path || isAbsolute(path)) throw new Error("absolute_runtime_path_forbidden");
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("runtime_path_traversal");
  }
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment.toLowerCase()))) {
    throw new Error("private_asset_class_forbidden");
  }
  const filename = basename(normalized).toLowerCase();
  if (filename.startsWith(".")) throw new Error("hidden_runtime_file_forbidden");
  if (FORBIDDEN_FILE_MARKERS.some((marker) => filename.includes(marker))) {
    throw new Error("review_or_engineering_file_forbidden");
  }
  if ((destinationRoot === "forest_chapter_visuals" || destinationRoot === "forest_chapter_opening") &&
      segments.some((segment) =>
    FOREST_VISUAL_FORBIDDEN_PATH_MARKERS.some((marker) =>
      segment.toLowerCase().includes(marker)))) {
    throw new Error("private_asset_class_forbidden");
  }
  const extension = extname(filename);
  const allowedExtensions = ROLE_EXTENSIONS[role] as readonly string[];
  if (!allowedExtensions.includes(extension)) throw new Error("runtime_extension_forbidden");
}

function createAudit(
  assetId: string,
  runtimeReady: boolean,
  publicExportDeclared: boolean,
  fileCount: number,
  checks: readonly ReleaseGateCheck[],
): AssetReleaseAudit {
  return {
    schemaVersion: ASSET_RELEASE_SCHEMA_VERSION,
    assetId,
    decision: checks.every((check) => check.passed) ? "allow" : "deny",
    runtimeReady,
    publicExportDeclared,
    fileCount,
    checks,
  };
}

function appendDeniedCheck(audit: AssetReleaseAudit, id: string, reasonCode: string): AssetReleaseAudit {
  return {
    ...audit,
    decision: "deny",
    checks: [...audit.checks, { id, passed: false, reasonCode }],
  };
}

function resolveSafeExistingFile(root: string, path: string, reasonCode: string): string {
  const candidate = resolveSafeTarget(root, path, reasonCode);
  if (!existsSync(candidate) || !lstatSync(candidate).isFile()) throw new Error("file_unavailable");
  const canonical = realpathSync(candidate);
  assertContained(root, canonical, reasonCode);
  return canonical;
}

function resolveSafeTarget(root: string, path: string, reasonCode: string): string {
  if (!path || isAbsolute(path)) throw new Error(reasonCode);
  const candidate = resolve(root, path);
  assertContained(root, candidate, reasonCode);
  return candidate;
}

function assertContained(root: string, candidate: string, reasonCode: string): void {
  const difference = relative(resolve(root), resolve(candidate));
  if (difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference))) {
    return;
  }
  throw new Error(reasonCode);
}

function assertNoSymlinkComponents(root: string, target: string): void {
  const canonicalRoot = realpathSync(root);
  assertContained(canonicalRoot, target, "target_path_escape");
  const difference = relative(canonicalRoot, target);
  let cursor = canonicalRoot;
  for (const part of difference.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("target_symlink_forbidden");
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256LicenseEvidence(path: string): string {
  const extension = extname(path).toLowerCase();
  if (![".json", ".md", ".txt", ".yaml", ".yml"].includes(extension)) return sha256File(path);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  if (text.includes("\uFFFD")) throw new Error("license_text_encoding_invalid");
  const canonical = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function recordValue(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safePublicIdentifier(value: unknown): string | undefined {
  const identifier = stringValue(value);
  return identifier && /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(identifier) ? identifier : undefined;
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^[a-z0-9_]+$/i.test(error.message) ? error.message : fallback;
}

function toPublicPath(repositoryRoot: string, path: string): string {
  return relative(resolve(repositoryRoot), path).split(sep).join("/");
}
