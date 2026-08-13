import generatedArtifact from "../generated/content-runtime.v0.1.json";

export type ContentTeloLengthClass = "short" | "default" | "long";

export interface ContentTeloLengthProfile {
  readonly profileVersion: string;
  readonly nominalLengthPx: number;
  readonly minimumRealizedLengthPx: number;
  readonly activationMp: number;
  readonly crossSectionWidthPx: number;
}

interface GeneratedRuntimeArtifact {
  readonly schemaVersion: "tokipona.runtime-content.v0.1";
  readonly sourceDigest: `sha256:${string}`;
  readonly source: {
    readonly path: string;
    readonly schemaVersion: string;
    readonly contentVersion: string;
  };
  readonly telo: {
    readonly pixelsPerTile: number;
    readonly profiles: Readonly<Record<ContentTeloLengthClass, ContentTeloLengthProfile>>;
  };
}

export function parseGeneratedRuntimeArtifact(value: unknown): GeneratedRuntimeArtifact {
  if (!isRecord(value) || value.schemaVersion !== "tokipona.runtime-content.v0.1") {
    throw new Error("Unsupported generated runtime content schema.");
  }
  if (typeof value.sourceDigest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.sourceDigest)) {
    throw new Error("Generated runtime content source digest is invalid.");
  }
  if (!isRecord(value.source) || !isNonEmptyString(value.source.path) ||
      !isNonEmptyString(value.source.schemaVersion) || !isNonEmptyString(value.source.contentVersion)) {
    throw new Error("Generated runtime content source identity is invalid.");
  }
  if (!isRecord(value.telo) || !isPositiveFinite(value.telo.pixelsPerTile) || !isRecord(value.telo.profiles)) {
    throw new Error("Generated telo runtime content is invalid.");
  }

  const profiles = {} as Record<ContentTeloLengthClass, ContentTeloLengthProfile>;
  for (const lengthClass of ["short", "default", "long"] as const) {
    const profile = value.telo.profiles[lengthClass];
    if (!isRecord(profile) || !isNonEmptyString(profile.profileVersion) ||
        !isPositiveFinite(profile.nominalLengthPx) || !isPositiveFinite(profile.minimumRealizedLengthPx) ||
        profile.minimumRealizedLengthPx > profile.nominalLengthPx ||
        !isNonNegativeFinite(profile.activationMp) || !isPositiveFinite(profile.crossSectionWidthPx)) {
      throw new Error(`Generated telo ${lengthClass} profile is invalid.`);
    }
    if (profile.profileVersion !== value.source.schemaVersion) {
      throw new Error(`Generated telo ${lengthClass} profile version does not match its source.`);
    }
    profiles[lengthClass] = Object.freeze({
      profileVersion: profile.profileVersion,
      nominalLengthPx: profile.nominalLengthPx,
      minimumRealizedLengthPx: profile.minimumRealizedLengthPx,
      activationMp: profile.activationMp,
      crossSectionWidthPx: profile.crossSectionWidthPx,
    });
  }

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    sourceDigest: value.sourceDigest as `sha256:${string}`,
    source: Object.freeze({
      path: value.source.path,
      schemaVersion: value.source.schemaVersion,
      contentVersion: value.source.contentVersion,
    }),
    telo: Object.freeze({
      pixelsPerTile: value.telo.pixelsPerTile,
      profiles: Object.freeze(profiles),
    }),
  });
}

export const CONTENT_RUNTIME_ARTIFACT = parseGeneratedRuntimeArtifact(generatedArtifact);
export const CONTENT_RUNTIME_SOURCE_DIGEST = CONTENT_RUNTIME_ARTIFACT.sourceDigest;
export const TELO_CONTENT_PROFILE_VERSION = CONTENT_RUNTIME_ARTIFACT.source.schemaVersion;
export const TELO_LOGICAL_PIXELS_PER_TILE = CONTENT_RUNTIME_ARTIFACT.telo.pixelsPerTile;
export const TELO_LENGTH_PROFILES = CONTENT_RUNTIME_ARTIFACT.telo.profiles;

export function getTeloLengthProfile(lengthClass: ContentTeloLengthClass): ContentTeloLengthProfile {
  return TELO_LENGTH_PROFILES[lengthClass];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
