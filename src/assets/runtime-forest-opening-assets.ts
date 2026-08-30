import privateExport from "./runtime-forest-opening-private-export.v0.1.json" with { type: "json" };

export const FOREST_OPENING_PRIVATE_EXPORT_SCHEMA =
  "tokipona.forest-opening-private-export.v0.1" as const;

const PACK_ID = "forest.opening.vertical-slice.v001" as const;
const ROOT = "assets/forest-chapter/opening-slice/v0.1/";
const REQUIRED_FILES = Object.freeze({
  far_parallax_atlas: { width: 640, height: 360, extension: ".png" },
  mid_parallax_atlas: { width: 640, height: 360, extension: ".png" },
  environment_atlas: { width: 256, height: 256, extension: ".png" },
  prop_glyph_atlas: { width: 256, height: 128, extension: ".png" },
  traveler_atlas: { width: 256, height: 256, extension: ".png" },
  creature_atlas: { width: 128, height: 64, extension: ".png" },
  animation_manifest: { width: 0, height: 0, extension: ".json" },
  time_palette: { width: 0, height: 0, extension: ".json" },
  audio_manifest: { width: 0, height: 0, extension: ".json" },
  forest_ambience: { width: 0, height: 0, extension: ".wav" },
  stream_ambience: { width: 0, height: 0, extension: ".wav" },
  foley_bank: { width: 0, height: 0, extension: ".wav" },
  dialogue_blip_bank: { width: 0, height: 0, extension: ".wav" },
} as const);
const APPROVAL_KEYS = ["source", "license", "pixel", "animation", "audio", "accessibility", "hashes"] as const;
const PRIVACY_KEYS = ["containsPrivatePaths", "containsPrivateAssets", "containsConceptAssets", "containsReviewMedia"] as const;
const FORBIDDEN_MARKERS = ["private", "candidate", "concept", "review", "source", "preview"] as const;
const SHA_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type RuntimeForestOpeningAssetRole = keyof typeof REQUIRED_FILES;

export interface RuntimeForestOpeningAssetFile {
  readonly role: RuntimeForestOpeningAssetRole;
  readonly publicPath: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: `sha256:${string}`;
}

export interface RuntimeForestOpeningAssetPack {
  readonly schemaVersion: typeof FOREST_OPENING_PRIVATE_EXPORT_SCHEMA;
  readonly status: "approved";
  readonly packId: typeof PACK_ID;
  readonly manifestDigest: `sha256:${string}`;
  readonly files: readonly RuntimeForestOpeningAssetFile[];
  readonly constraints: Readonly<{
    spriteBinaryAlpha: true;
    maxPaletteColors: 64;
    travelerMaxFrameHeightPx: 20;
    audioPeakDbfsMax: -1;
    audioClippedSamples: 0;
  }>;
  readonly approvals: Readonly<Record<(typeof APPROVAL_KEYS)[number], "approved">>;
  readonly privacy: Readonly<Record<(typeof PRIVACY_KEYS)[number], false>>;
}

export type RuntimeForestOpeningAssetExport = RuntimeForestOpeningAssetPack | Readonly<{
  readonly schemaVersion: typeof FOREST_OPENING_PRIVATE_EXPORT_SCHEMA;
  readonly status: "missing";
}>;

export function readRuntimeForestOpeningAssetExport(
  candidate: unknown,
): RuntimeForestOpeningAssetExport {
  const root = record(candidate, "forest opening asset export must be an object");
  if (root.status === "missing") {
    exactKeys(root, ["schemaVersion", "status"], "forest opening missing export fields are invalid");
    if (root.schemaVersion !== FOREST_OPENING_PRIVATE_EXPORT_SCHEMA) {
      throw new Error("forest opening missing export identity is invalid");
    }
    return Object.freeze({ schemaVersion: FOREST_OPENING_PRIVATE_EXPORT_SCHEMA, status: "missing" });
  }
  exactKeys(root, [
    "schemaVersion", "status", "packId", "manifestDigest", "files", "constraints", "approvals", "privacy",
  ], "forest opening asset export fields are invalid");
  if (root.schemaVersion !== FOREST_OPENING_PRIVATE_EXPORT_SCHEMA || root.status !== "approved" ||
      root.packId !== PACK_ID || !sha(root.manifestDigest)) {
    throw new Error("forest opening asset export identity is invalid");
  }
  const files = readFiles(root.files);
  const constraints = readConstraints(root.constraints);
  const approvals = readApprovals(root.approvals);
  const privacy = readPrivacy(root.privacy);
  return Object.freeze({
    schemaVersion: FOREST_OPENING_PRIVATE_EXPORT_SCHEMA,
    status: "approved",
    packId: PACK_ID,
    manifestDigest: root.manifestDigest,
    files,
    constraints,
    approvals,
    privacy,
  });
}

export const runtimeForestOpeningAssetExport = readRuntimeForestOpeningAssetExport(privateExport);

function readFiles(candidate: unknown): readonly RuntimeForestOpeningAssetFile[] {
  if (!Array.isArray(candidate) || candidate.length !== Object.keys(REQUIRED_FILES).length) {
    throw new Error("forest opening required files and roles are invalid");
  }
  const roles = new Set<RuntimeForestOpeningAssetRole>();
  const paths = new Set<string>();
  const files = candidate.map((value, index): RuntimeForestOpeningAssetFile => {
    const file = record(value, `forest opening file[${index}] is invalid`);
    exactKeys(file, ["role", "publicPath", "width", "height", "sha256"], `forest opening file[${index}] fields are invalid`);
    if (typeof file.role !== "string" || !(file.role in REQUIRED_FILES)) {
      throw new Error("forest opening required files and roles are invalid");
    }
    const role = file.role as RuntimeForestOpeningAssetRole;
    if (roles.has(role)) throw new Error("forest opening required files and roles are invalid");
    roles.add(role);
    const publicPath = file.publicPath;
    if (typeof publicPath !== "string" || !publicPath.startsWith(ROOT) ||
        !/^assets\/[a-z0-9._/-]+$/.test(publicPath) || publicPath.includes("..") ||
        FORBIDDEN_MARKERS.some((marker) => publicPath.toLowerCase().includes(marker))) {
      throw new Error("forest opening public path is invalid");
    }
    if (paths.has(publicPath)) throw new Error("forest opening public paths are invalid");
    paths.add(publicPath);
    const expected = REQUIRED_FILES[role];
    if (!publicPath.endsWith(expected.extension)) throw new Error("forest opening file extension is invalid");
    if (file.width !== expected.width || file.height !== expected.height) {
      throw new Error("forest opening file dimensions are invalid");
    }
    if (!sha(file.sha256)) throw new Error("forest opening file hash is invalid");
    return Object.freeze({ role, publicPath, width: expected.width, height: expected.height, sha256: file.sha256 });
  });
  if (roles.size !== Object.keys(REQUIRED_FILES).length) throw new Error("forest opening required files and roles are invalid");
  return Object.freeze(files);
}

function readConstraints(candidate: unknown): RuntimeForestOpeningAssetPack["constraints"] {
  const raw = record(candidate, "forest opening asset constraints are invalid");
  exactKeys(raw, ["spriteBinaryAlpha", "maxPaletteColors", "travelerMaxFrameHeightPx", "audioPeakDbfsMax", "audioClippedSamples"],
    "forest opening asset constraints are invalid");
  if (raw.spriteBinaryAlpha !== true || raw.maxPaletteColors !== 64 || raw.travelerMaxFrameHeightPx !== 20 ||
      raw.audioPeakDbfsMax !== -1 || raw.audioClippedSamples !== 0) {
    throw new Error("forest opening asset constraints are invalid");
  }
  return Object.freeze({ spriteBinaryAlpha: true, maxPaletteColors: 64, travelerMaxFrameHeightPx: 20,
    audioPeakDbfsMax: -1, audioClippedSamples: 0 });
}

function readApprovals(candidate: unknown): RuntimeForestOpeningAssetPack["approvals"] {
  const raw = record(candidate, "forest opening asset approvals are invalid");
  exactKeys(raw, APPROVAL_KEYS, "forest opening asset approvals are invalid");
  if (!APPROVAL_KEYS.every((key) => raw[key] === "approved")) throw new Error("forest opening asset approval is missing");
  return Object.freeze(Object.fromEntries(APPROVAL_KEYS.map((key) => [key, "approved"])) as unknown as RuntimeForestOpeningAssetPack["approvals"]);
}

function readPrivacy(candidate: unknown): RuntimeForestOpeningAssetPack["privacy"] {
  const raw = record(candidate, "forest opening asset privacy is invalid");
  exactKeys(raw, PRIVACY_KEYS, "forest opening asset privacy is invalid");
  if (!PRIVACY_KEYS.every((key) => raw[key] === false)) throw new Error("forest opening asset privacy is invalid");
  return Object.freeze(Object.fromEntries(PRIVACY_KEYS.map((key) => [key, false])) as unknown as RuntimeForestOpeningAssetPack["privacy"]);
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(reason);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], reason: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key)) ||
      keys.some((key) => !expected.includes(key))) throw new Error(reason);
}

function sha(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && SHA_PATTERN.test(value);
}
