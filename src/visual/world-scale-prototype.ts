import type { RuntimeSceneManifest } from "../content/runtime-scene-manifest";
import { clamp, WORLD_TILE_SIZE_PX } from "../runtime/geometry";
import { DEFAULT_PLAYER_BODY } from "../runtime/scene";
import type { CameraState, RuntimeSnapshot } from "../runtime/runtime";

export type WorldScaleProfileId = "current" | "medium" | "wide_world";

export interface WorldScaleProfile {
  readonly id: WorldScaleProfileId;
  readonly label: string;
  readonly viewportPx: Readonly<{ width: number; height: number }>;
  readonly macroTilePx: 16;
  readonly materialCellPx: 2;
  readonly particleCellPx: 1;
  readonly focusAnchorNormalized: Readonly<{ x: 0.5; y: 0.62 }>;
}

export type PrototypeCharacterAnimation = "idle" | "run" | "rise" | "fall" | "land";
export type PrototypeCharacterFacing = "left" | "right";

export interface PrototypeCharacterHistory {
  readonly grounded: boolean;
  readonly facing: PrototypeCharacterFacing;
  readonly tick: number;
}

export interface PrototypeCharacterPose extends PrototypeCharacterHistory {
  readonly animation: PrototypeCharacterAnimation;
  readonly gaitFrame: 0 | 1;
}

export interface ProjectedPrototypeCharacter extends PrototypeCharacterPose {
  readonly worldPosition: Readonly<{ x: number; y: number }>;
  readonly screenPosition: Readonly<{ x: number; y: number }>;
  readonly worldBody: Readonly<{ width: 12; height: 14 }>;
}

export interface ProjectedSolidTile {
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly variant: 0 | 1 | 2 | 3;
  readonly exposedTop: boolean;
}

export interface ProjectedMaterialCell {
  readonly worldX: number;
  readonly worldY: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly size: 2;
  readonly tone: 0 | 1 | 2 | 3;
}

export interface WorldScaleFrame {
  readonly sceneId: string;
  readonly tick: number;
  readonly profile: WorldScaleProfile;
  readonly camera: CameraState;
  readonly worldSizePx: Readonly<{ width: number; height: number }>;
  readonly solidTiles: readonly ProjectedSolidTile[];
  readonly materialCells: readonly ProjectedMaterialCell[];
  readonly character: ProjectedPrototypeCharacter;
}

export interface ProjectWorldScaleFrameInput {
  readonly profileId: WorldScaleProfileId;
  readonly scene: RuntimeSceneManifest;
  readonly runtime: RuntimeSnapshot;
  readonly previousCharacter: PrototypeCharacterHistory | null;
}

export const WORLD_SCALE_PROFILE_IDS = Object.freeze([
  "current",
  "medium",
  "wide_world",
] as const satisfies readonly WorldScaleProfileId[]);

const PROFILE_BY_ID: Readonly<Record<WorldScaleProfileId, WorldScaleProfile>> = deepFreeze({
  current: profile("current", "当前尺度", 180, 320),
  medium: profile("medium", "中等世界", 270, 480),
  wide_world: profile("wide_world", "大世界", 360, 640),
});

export function readWorldScaleProfile(id: WorldScaleProfileId): WorldScaleProfile {
  const value = PROFILE_BY_ID[id];
  if (!value) throw new Error(`unknown world scale profile: ${String(id)}`);
  return value;
}

export function derivePrototypeCharacterPose(
  runtime: RuntimeSnapshot,
  previous: PrototypeCharacterHistory | null,
): PrototypeCharacterPose {
  assertRuntime(runtime);
  const velocity = runtime.player.velocity;
  const facing: PrototypeCharacterFacing = velocity.x < -0.01
    ? "left"
    : velocity.x > 0.01
      ? "right"
      : previous?.facing ?? "right";
  const animation: PrototypeCharacterAnimation = runtime.player.grounded && previous?.grounded === false
    ? "land"
    : !runtime.player.grounded && velocity.y < -0.01
      ? "rise"
      : !runtime.player.grounded && velocity.y >= -0.01
        ? "fall"
        : Math.abs(velocity.x) > 1
          ? "run"
          : "idle";
  return Object.freeze({
    animation,
    facing,
    grounded: runtime.player.grounded,
    gaitFrame: (Math.floor(runtime.tick / 6) % 2) as 0 | 1,
    tick: runtime.tick,
  });
}

export function projectWorldScaleFrame(input: ProjectWorldScaleFrameInput): WorldScaleFrame {
  const { scene, runtime } = input;
  const profileValue = readWorldScaleProfile(input.profileId);
  assertSceneAndRuntime(scene, runtime);
  const worldSizePx = Object.freeze({
    width: scene.sizeTiles.width * WORLD_TILE_SIZE_PX,
    height: scene.sizeTiles.height * WORLD_TILE_SIZE_PX,
  });
  const camera = projectScaleCamera(profileValue, runtime, worldSizePx);
  const solidTiles: ProjectedSolidTile[] = [];
  const materialCells: ProjectedMaterialCell[] = [];
  const firstX = clamp(Math.floor(camera.x / WORLD_TILE_SIZE_PX), 0, scene.sizeTiles.width - 1);
  const lastX = clamp(Math.ceil((camera.x + camera.width) / WORLD_TILE_SIZE_PX), 0, scene.sizeTiles.width - 1);
  const firstY = clamp(Math.floor(camera.y / WORLD_TILE_SIZE_PX), 0, scene.sizeTiles.height - 1);
  const lastY = clamp(Math.ceil((camera.y + camera.height) / WORLD_TILE_SIZE_PX), 0, scene.sizeTiles.height - 1);

  for (let tileY = firstY; tileY <= lastY; tileY += 1) {
    for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      if (scene.collisionRows[tileY]?.[tileX] !== "#") continue;
      const worldX = tileX * WORLD_TILE_SIZE_PX;
      const worldY = tileY * WORLD_TILE_SIZE_PX;
      const seed = hash(`${scene.sceneId}:${tileX}:${tileY}`);
      solidTiles.push(Object.freeze({
        tileX,
        tileY,
        worldX,
        worldY,
        screenX: worldX - camera.x,
        screenY: worldY - camera.y,
        variant: (seed % 4) as 0 | 1 | 2 | 3,
        exposedTop: scene.collisionRows[tileY - 1]?.[tileX] !== "#",
      }));
      for (let index = 0; index < 6; index += 1) {
        const cellSeed = mix(seed, index + 1);
        const localX = (cellSeed % 8) * 2;
        const localY = (Math.floor(cellSeed / 8) % 8) * 2;
        materialCells.push(Object.freeze({
          worldX: worldX + localX,
          worldY: worldY + localY,
          screenX: worldX + localX - camera.x,
          screenY: worldY + localY - camera.y,
          size: 2,
          tone: (Math.floor(cellSeed / 64) % 4) as 0 | 1 | 2 | 3,
        }));
      }
    }
  }

  const pose = derivePrototypeCharacterPose(runtime, input.previousCharacter);
  return deepFreeze({
    sceneId: scene.sceneId,
    tick: runtime.tick,
    profile: profileValue,
    camera,
    worldSizePx,
    solidTiles,
    materialCells,
    character: {
      ...pose,
      worldPosition: { ...runtime.player.position },
      screenPosition: {
        x: runtime.player.position.x - camera.x,
        y: runtime.player.position.y - camera.y,
      },
      worldBody: { width: 12, height: 14 },
    },
  });
}

function profile(
  id: WorldScaleProfileId,
  label: string,
  width: number,
  height: number,
): WorldScaleProfile {
  return {
    id,
    label,
    viewportPx: { width, height },
    macroTilePx: 16,
    materialCellPx: 2,
    particleCellPx: 1,
    focusAnchorNormalized: { x: 0.5, y: 0.62 },
  };
}

function projectScaleCamera(
  profileValue: WorldScaleProfile,
  runtime: RuntimeSnapshot,
  worldSize: Readonly<{ width: number; height: number }>,
): CameraState {
  const centerX = runtime.player.position.x + runtime.player.body.width / 2;
  const centerY = runtime.player.position.y + runtime.player.body.height / 2;
  const desiredX = centerX - profileValue.viewportPx.width * profileValue.focusAnchorNormalized.x;
  const desiredY = centerY - profileValue.viewportPx.height * profileValue.focusAnchorNormalized.y;
  const x = profileValue.viewportPx.width >= worldSize.width
    ? (worldSize.width - profileValue.viewportPx.width) / 2
    : clamp(desiredX, 0, worldSize.width - profileValue.viewportPx.width);
  const y = profileValue.viewportPx.height >= worldSize.height
    ? (worldSize.height - profileValue.viewportPx.height) / 2
    : clamp(desiredY, 0, worldSize.height - profileValue.viewportPx.height);
  return Object.freeze({
    x: Math.round(x),
    y: Math.round(y),
    width: profileValue.viewportPx.width,
    height: profileValue.viewportPx.height,
  });
}

function assertSceneAndRuntime(scene: RuntimeSceneManifest, runtime: RuntimeSnapshot): void {
  if (scene.sceneId !== runtime.sceneId) throw new Error("world scale scene identity mismatch");
  if (scene.tileSizePx !== WORLD_TILE_SIZE_PX) throw new Error("world scale macro tile contract changed");
  if (scene.collisionRows.length !== scene.sizeTiles.height ||
      scene.collisionRows.some((row) => row.length !== scene.sizeTiles.width)) {
    throw new Error("world scale scene collision dimensions are invalid");
  }
  assertRuntime(runtime);
  if (runtime.player.body.width !== DEFAULT_PLAYER_BODY.width ||
      runtime.player.body.height !== DEFAULT_PLAYER_BODY.height) {
    throw new Error("world scale prototype requires the unchanged player body");
  }
}

function assertRuntime(runtime: RuntimeSnapshot): void {
  const values = [
    runtime.tick,
    runtime.player.position.x,
    runtime.player.position.y,
    runtime.player.velocity.x,
    runtime.player.velocity.y,
    runtime.player.body.width,
    runtime.player.body.height,
  ];
  if (!values.every(Number.isFinite) || !Number.isSafeInteger(runtime.tick) || runtime.tick < 0) {
    throw new Error("world scale runtime geometry is invalid");
  }
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function mix(seed: number, value: number): number {
  let result = seed ^ Math.imul(value, 0x9e3779b1);
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  return result >>> 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
