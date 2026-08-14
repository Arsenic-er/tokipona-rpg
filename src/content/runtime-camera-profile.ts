import { computeRuntimeManifestDigest } from "./runtime-manifest-digest";

export interface RuntimePortraitCameraProfile {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/world/regions/valley-prologue.v0.1.yaml";
  readonly profileId: "portrait_scroll.v0.1";
  readonly viewportPx: Readonly<{ width: 180; height: 320 }>;
  readonly focusAnchorNormalized: Readonly<{ x: 0.5; y: 0.62 }>;
  readonly clampToSceneBounds: true;
  readonly pixelSnap: true;
  readonly sceneSizeIndependentFromCamera: true;
}

const verified = new WeakSet<object>();

export function computeRuntimePortraitCameraDigest(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedRuntimePortraitCameraProfile(
  value: unknown,
): value is RuntimePortraitCameraProfile {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimePortraitCameraProfile(candidate: unknown): RuntimePortraitCameraProfile {
  const artifact = record(candidate, "runtime content artifact");
  const profile = record(artifact.cameraProfile, "artifact.cameraProfile");
  exactKeys(profile, [
    "sourceDigest", "sourcePath", "profileId", "viewportPx", "focusAnchorNormalized",
    "clampToSceneBounds", "pixelSnap", "sceneSizeIndependentFromCamera",
  ], "camera profile");
  const digest = string(profile.sourceDigest, "cameraProfile.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("camera profile digest must be sha256");
  const payload = Object.fromEntries(Object.entries(profile).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimePortraitCameraDigest(payload) !== digest) throw new Error("camera profile digest mismatch");
  if (profile.sourcePath !== "data/world/regions/valley-prologue.v0.1.yaml" ||
      profile.profileId !== "portrait_scroll.v0.1" || profile.clampToSceneBounds !== true ||
      profile.pixelSnap !== true || profile.sceneSizeIndependentFromCamera !== true) {
    throw new Error("camera profile identity is noncanonical");
  }
  const viewport = record(profile.viewportPx, "cameraProfile.viewportPx");
  const anchor = record(profile.focusAnchorNormalized, "cameraProfile.focusAnchorNormalized");
  exactKeys(viewport, ["width", "height"], "camera viewport");
  exactKeys(anchor, ["x", "y"], "camera focus anchor");
  if (viewport.width !== 180 || viewport.height !== 320 || anchor.x !== 0.5 || anchor.y !== 0.62) {
    throw new Error("camera profile geometry is noncanonical");
  }
  const result = deepFreeze(structuredClone(profile)) as unknown as RuntimePortraitCameraProfile;
  verified.add(result);
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
