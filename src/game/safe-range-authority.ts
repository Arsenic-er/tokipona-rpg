import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSafeRangeManifest } from "../content/runtime-safe-range-manifest";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import { DEFAULT_PLAYER_BODY } from "../runtime/scene";
import type { SafeRangeTargetClass } from "./safe-range-physics";

export type SafeRangeAuthorityActionKind = "transfer" | "material_table";
export interface SafeRangeAuthorityPointPx { readonly x: number; readonly y: number }
export interface SafeRangeAuthorityRectPx extends SafeRangeAuthorityPointPx {
  readonly width: number;
  readonly height: number;
}

export interface SafeRangeRuntimeFramePayload {
  readonly transactionId: string;
  readonly writerEvent: "safe_range_runtime_frame_committed";
  readonly actionKind: SafeRangeAuthorityActionKind;
  readonly targetId: SafeRangeTargetClass | "material_collision_table";
  readonly requestHash: string;
  readonly manifestDigest: `sha256:${string}`;
  readonly sessionWorldRevision: number;
  readonly mpWorldVersion: number;
  readonly runtimeRevision: number;
  readonly playerPositionPx: SafeRangeAuthorityPointPx;
  readonly actorSetHash: `sha256:${string}`;
  readonly frameHash: `sha256:${string}`;
}

const safeRangeManifest = readRuntimeSafeRangeManifest(generatedRuntimeArtifact);
const sceneIndex = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const safeRangeScene = sceneIndex.byId[safeRangeManifest.scene.sceneId];
if (!safeRangeScene) throw new Error("generated safe-range scene is missing");
if (safeRangeManifest.scene.livingTargetCount !== 0 || safeRangeScene.npcs.length !== 0) {
  throw new Error("safe-range authored living actor set must remain empty");
}

export const SAFE_RANGE_AUTHORITY_MANIFEST_DIGEST = sha256Canonical({
  safeRange: safeRangeManifest.sourceDigest,
  scenes: sceneIndex.sourceDigest,
} as JsonValue);
export const SAFE_RANGE_AUTHORITY_ACTOR_SET_HASH = sha256Canonical({ actors: [] } as JsonValue);
const COLLISION_EDGE_EPSILON = 1e-7;

const finitePoint = (point: SafeRangeAuthorityPointPx): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const targetId = (value: unknown): value is SafeRangeRuntimeFramePayload["targetId"] =>
  value === "wood_dummy" || value === "sandbag" || value === "minecart" ||
  value === "hanging_stone" || value === "material_collision_table";

/** Converts authored bottom-left tile coordinates to runtime top-left pixel coordinates. */
export const safeRangeInteractionPointPx = (
  targetId: SafeRangeTargetClass | "material_collision_table",
): SafeRangeAuthorityPointPx | null => {
  const target = safeRangeScene.targets.find((candidate) => candidate.id === targetId);
  if (!target?.interactionPointTiles) return null;
  return Object.freeze({
    x: target.interactionPointTiles[0] * safeRangeScene.tileSizePx,
    y: (safeRangeScene.sizeTiles.height - 1 - target.interactionPointTiles[1]) * safeRangeScene.tileSizePx,
  });
};

export const safeRangeTargetBoundsPx = (targetId: SafeRangeTargetClass): SafeRangeAuthorityRectPx | null => {
  const profile = safeRangeManifest.targetPhysics.profiles.find((candidate) => candidate.targetClass === targetId);
  if (!profile) return null;
  const bounds = profile.collisionBoundsTiles;
  return Object.freeze({
    x: bounds.x * safeRangeScene.tileSizePx,
    y: (safeRangeScene.sizeTiles.height - bounds.y - bounds.height) * safeRangeScene.tileSizePx,
    width: bounds.width * safeRangeScene.tileSizePx,
    height: bounds.height * safeRangeScene.tileSizePx,
  });
};

const overlapsSolidTile = (position: SafeRangeAuthorityPointPx): boolean => {
  const body = DEFAULT_PLAYER_BODY;
  const sceneWidthPx = safeRangeScene.sizeTiles.width * safeRangeScene.tileSizePx;
  const sceneHeightPx = safeRangeScene.sizeTiles.height * safeRangeScene.tileSizePx;
  if (!finitePoint(position) || position.x < 0 || position.y < 0 ||
      position.x + body.width > sceneWidthPx || position.y + body.height > sceneHeightPx) return true;
  const left = Math.floor(position.x / safeRangeScene.tileSizePx);
  const right = Math.floor((position.x + body.width - COLLISION_EDGE_EPSILON) / safeRangeScene.tileSizePx);
  const top = Math.floor(position.y / safeRangeScene.tileSizePx);
  const bottom = Math.floor((position.y + body.height - COLLISION_EDGE_EPSILON) / safeRangeScene.tileSizePx);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (safeRangeScene.collisionRows[y]?.[x] === "#") return true;
    }
  }
  return false;
};

export const safeRangeFrameGeometryValid = (payload: Pick<SafeRangeRuntimeFramePayload,
  "actionKind" | "targetId" | "playerPositionPx">): boolean => {
  if (overlapsSolidTile(payload.playerPositionPx)) return false;
  const expectedTarget = payload.actionKind === "material_table" ? "material_collision_table" : payload.targetId;
  if (payload.actionKind === "material_table" && payload.targetId !== "material_collision_table") return false;
  if (payload.actionKind === "transfer" && payload.targetId === "material_collision_table") return false;
  const point = safeRangeInteractionPointPx(expectedTarget);
  return point !== null && Math.hypot(
    payload.playerPositionPx.x - point.x,
    payload.playerPositionPx.y - point.y,
  ) <= safeRangeScene.tileSizePx;
};

const frameHashMaterial = (payload: Omit<SafeRangeRuntimeFramePayload, "frameHash">): JsonValue => ({
  kind: "safe_range_runtime_frame",
  transactionId: payload.transactionId,
  writerEvent: payload.writerEvent,
  actionKind: payload.actionKind,
  targetId: payload.targetId,
  requestHash: payload.requestHash,
  manifestDigest: payload.manifestDigest,
  sessionWorldRevision: payload.sessionWorldRevision,
  mpWorldVersion: payload.mpWorldVersion,
  runtimeRevision: payload.runtimeRevision,
  playerPositionPx: { ...payload.playerPositionPx },
  actorSetHash: payload.actorSetHash,
});

export const safeRangeRuntimeFrameHash = (
  payload: Omit<SafeRangeRuntimeFramePayload, "frameHash">,
): `sha256:${string}` => sha256Canonical(frameHashMaterial(payload));

export const createSafeRangeRuntimeFramePayload = (input: Readonly<{
  transactionId: string;
  actionKind: SafeRangeAuthorityActionKind;
  targetId: SafeRangeTargetClass | "material_collision_table";
  requestHash: string;
  sessionWorldRevision: number;
  mpWorldVersion: number;
  runtimeRevision: number;
  playerPositionPx: SafeRangeAuthorityPointPx;
}>): SafeRangeRuntimeFramePayload => {
  const base: Omit<SafeRangeRuntimeFramePayload, "frameHash"> = Object.freeze({
    transactionId: input.transactionId,
    writerEvent: "safe_range_runtime_frame_committed",
    actionKind: input.actionKind,
    targetId: input.targetId,
    requestHash: input.requestHash,
    manifestDigest: SAFE_RANGE_AUTHORITY_MANIFEST_DIGEST,
    sessionWorldRevision: input.sessionWorldRevision,
    mpWorldVersion: input.mpWorldVersion,
    runtimeRevision: input.runtimeRevision,
    playerPositionPx: Object.freeze({ ...input.playerPositionPx }),
    actorSetHash: SAFE_RANGE_AUTHORITY_ACTOR_SET_HASH,
  });
  return Object.freeze({ ...base, frameHash: safeRangeRuntimeFrameHash(base) });
};

export const validSafeRangeRuntimeFramePayload = (value: unknown): value is SafeRangeRuntimeFramePayload => {
  if (!record(value) || !nonEmpty(value.transactionId) || !nonEmpty(value.requestHash) ||
      value.writerEvent !== "safe_range_runtime_frame_committed" ||
      (value.actionKind !== "transfer" && value.actionKind !== "material_table") || !targetId(value.targetId) ||
      value.manifestDigest !== SAFE_RANGE_AUTHORITY_MANIFEST_DIGEST ||
      value.actorSetHash !== SAFE_RANGE_AUTHORITY_ACTOR_SET_HASH || !record(value.playerPositionPx) ||
      !Number.isFinite(value.playerPositionPx.x) || !Number.isFinite(value.playerPositionPx.y) ||
      !Number.isSafeInteger(value.sessionWorldRevision) || (value.sessionWorldRevision as number) < 0 ||
      !Number.isSafeInteger(value.mpWorldVersion) || (value.mpWorldVersion as number) < 0 ||
      !Number.isSafeInteger(value.runtimeRevision) || (value.runtimeRevision as number) < 0 ||
      typeof value.frameHash !== "string") return false;
  const payload = value as unknown as SafeRangeRuntimeFramePayload;
  return safeRangeFrameGeometryValid(payload) && payload.frameHash === safeRangeRuntimeFrameHash({
    transactionId: payload.transactionId,
    writerEvent: payload.writerEvent,
    actionKind: payload.actionKind,
    targetId: payload.targetId,
    requestHash: payload.requestHash,
    manifestDigest: payload.manifestDigest,
    sessionWorldRevision: payload.sessionWorldRevision,
    mpWorldVersion: payload.mpWorldVersion,
    runtimeRevision: payload.runtimeRevision,
    playerPositionPx: payload.playerPositionPx,
    actorSetHash: payload.actorSetHash,
  });
};
