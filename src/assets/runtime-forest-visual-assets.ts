export const FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA =
  "tokipona.forest-visual-private-export.v0.1" as const;

const FOREST_VISUAL_PACK_ID = "forest.waterwheel.visual-benchmark.v001" as const;

const REQUIRED_FILES = Object.freeze({
  background_far: { width: 640, height: 360, extension: ".png" },
  background_mid: { width: 640, height: 360, extension: ".png" },
  waterwheel_landmark: { width: 320, height: 192, extension: ".png" },
  forest_material_atlas: { width: 256, height: 256, extension: ".png" },
  traveler_atlas: { width: 192, height: 96, extension: ".png" },
  time_palette: { width: 0, height: 0, extension: ".json" },
  runtime_manifest: { width: 0, height: 0, extension: ".json" },
} as const);

const PUBLIC_PATH_PATTERN =
  /^assets\/forest-chapter\/waterwheel-benchmark\/v0\.1\/[a-z0-9._-]+\.(?:png|json)$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FORBIDDEN_PUBLIC_FILE_MARKERS = [
  "candidate",
  "concept",
  "contact-sheet",
  "motion-reference",
  "preview",
  "private",
  "review",
  "source",
] as const;

export type RuntimeForestVisualFileRole = keyof typeof REQUIRED_FILES;

export interface RuntimeForestVisualFile {
  readonly role: RuntimeForestVisualFileRole;
  readonly publicPath: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: `sha256:${string}`;
}

export interface RuntimeForestVisualPrivacy {
  readonly containsPrivatePaths: false;
  readonly containsPrivateAssets: false;
  readonly containsConceptAssets: false;
  readonly containsReviewMedia: false;
}

export type RuntimeForestVisualAssetExport =
  | Readonly<{
      schemaVersion: typeof FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA;
      status: "missing";
    }>
  | Readonly<{
      schemaVersion: typeof FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA;
      status: "approved";
      packId: typeof FOREST_VISUAL_PACK_ID;
      manifestDigest: `sha256:${string}`;
      files: readonly RuntimeForestVisualFile[];
      privacy: RuntimeForestVisualPrivacy;
    }>;

export function readRuntimeForestVisualAssetExport(
  candidate: unknown,
): RuntimeForestVisualAssetExport {
  const root = record(candidate, "forest visual export fields are invalid");
  if (root.status === "missing") {
    exactKeys(root, ["schemaVersion", "status"], "forest visual export fields are invalid");
    if (root.schemaVersion !== FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA) {
      throw new Error("forest visual export identity is invalid");
    }
    return Object.freeze({
      schemaVersion: FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA,
      status: "missing",
    });
  }

  exactKeys(root, [
    "schemaVersion",
    "status",
    "packId",
    "manifestDigest",
    "files",
    "privacy",
  ], "forest visual export fields are invalid");
  if (root.schemaVersion !== FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA ||
      root.status !== "approved" ||
      root.packId !== FOREST_VISUAL_PACK_ID ||
      !sha256(root.manifestDigest)) {
    throw new Error("forest visual export identity is invalid");
  }

  const values = array(root.files, "forest visual required files are invalid");
  if (values.length !== Object.keys(REQUIRED_FILES).length) {
    throw new Error("forest visual required files are invalid");
  }
  const observedRoles = new Set<RuntimeForestVisualFileRole>();
  const observedPaths = new Set<string>();
  const files = values.map((value): RuntimeForestVisualFile => {
    const file = record(value, "forest visual file fields are invalid");
    exactKeys(file, ["role", "publicPath", "width", "height", "sha256"],
      "forest visual file fields are invalid");
    if (typeof file.role !== "string" || !(file.role in REQUIRED_FILES)) {
      throw new Error("forest visual required files are invalid");
    }
    const role = file.role as RuntimeForestVisualFileRole;
    if (observedRoles.has(role)) throw new Error("forest visual required files are invalid");
    observedRoles.add(role);

    const publicPath = file.publicPath;
    if (typeof publicPath !== "string" ||
        !PUBLIC_PATH_PATTERN.test(publicPath) ||
        FORBIDDEN_PUBLIC_FILE_MARKERS.some((marker) =>
          publicPath.toLowerCase().includes(marker))) {
      throw new Error("forest visual public path is invalid");
    }
    if (observedPaths.has(publicPath)) {
      throw new Error("forest visual public paths are invalid");
    }
    observedPaths.add(publicPath);

    const required = REQUIRED_FILES[role];
    if (!publicPath.endsWith(required.extension)) {
      throw new Error("forest visual file extension is invalid");
    }
    if (file.width !== required.width || file.height !== required.height) {
      throw new Error("forest visual file dimensions are invalid");
    }
    if (!sha256(file.sha256)) throw new Error("forest visual file hash is invalid");
    return Object.freeze({
      role,
      publicPath,
      width: required.width,
      height: required.height,
      sha256: file.sha256,
    });
  });
  if (observedRoles.size !== Object.keys(REQUIRED_FILES).length) {
    throw new Error("forest visual required files are invalid");
  }

  const privacy = readPrivacy(root.privacy);
  return Object.freeze({
    schemaVersion: FOREST_VISUAL_PRIVATE_EXPORT_SCHEMA,
    status: "approved",
    packId: FOREST_VISUAL_PACK_ID,
    manifestDigest: root.manifestDigest,
    files: Object.freeze(files),
    privacy,
  });
}

function readPrivacy(candidate: unknown): RuntimeForestVisualPrivacy {
  const privacy = record(candidate, "forest visual privacy fields are invalid");
  const fields = [
    "containsPrivatePaths",
    "containsPrivateAssets",
    "containsConceptAssets",
    "containsReviewMedia",
  ] as const;
  exactKeys(privacy, fields, "forest visual privacy fields are invalid");
  if (!fields.every((field) => privacy[field] === false)) {
    throw new Error("forest visual privacy is invalid");
  }
  return Object.freeze({
    containsPrivatePaths: false,
    containsPrivateAssets: false,
    containsConceptAssets: false,
    containsReviewMedia: false,
  });
}

function sha256(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function array(value: unknown, reason: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(reason);
  return value;
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(reason);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  reason: string,
): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || !expected.every((key) => key in value)) {
    throw new Error(reason);
  }
}
