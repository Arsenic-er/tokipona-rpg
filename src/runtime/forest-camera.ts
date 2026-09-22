import type { RuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { clamp } from "./geometry";
import type { PlayerState } from "./runtime";
import type { CameraState } from "./runtime";

export type ForestCameraFacing = "left" | "right";

export interface ForestCameraState extends CameraState {
  readonly facing: ForestCameraFacing;
}

export type RuntimeForestCameraContract = RuntimeForestSpatialManifest["camera"];
// Camera mechanics are shared by the opening and smaller chapter interiors.
type ForestBounds = Readonly<{ width: number; height: number }>;

export const FOREST_CAMERA_TUNING = Object.freeze({
  horizontalDamping: 9,
  verticalDamping: 7,
  maxHorizontalSpeed: 240,
  maxVerticalSpeed: 180,
});

export function initializeForestCamera(
  contract: RuntimeForestCameraContract,
  player: PlayerState,
  regionBounds: ForestBounds,
): ForestCameraState {
  const width = 640;
  const height = 360;
  const centerX = player.position.x + player.body.width / 2;
  const centerY = player.position.y + player.body.height / 2;
  const previous = {
    x: clamp(centerX - width / 2, 0, regionBounds.width - width),
    y: clamp(centerY - height / 2, 0, regionBounds.height - height),
    width,
    height,
    facing: facingFor(player, "right"),
  } satisfies ForestCameraState;
  return advanceForestCamera(contract, previous, player, regionBounds);
}

export function advanceForestCamera(
  contract: RuntimeForestCameraContract,
  previous: ForestCameraState,
  player: PlayerState,
  regionBounds: ForestBounds,
  fixedSeconds = 1 / 60,
): ForestCameraState {
  if (!Number.isFinite(fixedSeconds) || fixedSeconds <= 0 || fixedSeconds > 1) {
    throw new Error("forest camera fixedSeconds must be finite and between zero and one");
  }
  const facing = facingFor(player, previous.facing);
  const width = 640;
  const height = 360;
  const centerX = player.position.x + player.body.width / 2;
  const centerY = player.position.y + player.body.height / 2;
  const lookAhead = width * contract.movementLookAheadRatio;
  const verticalOffset = player.velocity.y > 0
    ? height * contract.downwardBiasRatio
    : player.velocity.y < 0
      ? height * contract.upwardLagRatio
      : 0;
  const focusX = centerX + (facing === "right" ? lookAhead : -lookAhead);
  const focusY = centerY + verticalOffset;
  const targetX = moveIntoDeadZone(
    previous.x,
    focusX,
    width,
    contract.deadZoneNormalized.left,
    contract.deadZoneNormalized.right,
  );
  const targetY = moveIntoDeadZone(
    previous.y,
    focusY,
    height,
    contract.deadZoneNormalized.top,
    contract.deadZoneNormalized.bottom,
  );
  const x = smoothAxis(
    previous.x,
    clamp(targetX, 0, regionBounds.width - width),
    FOREST_CAMERA_TUNING.horizontalDamping,
    FOREST_CAMERA_TUNING.maxHorizontalSpeed,
    fixedSeconds,
  );
  const y = smoothAxis(
    previous.y,
    clamp(targetY, 0, regionBounds.height - height),
    FOREST_CAMERA_TUNING.verticalDamping,
    FOREST_CAMERA_TUNING.maxVerticalSpeed,
    fixedSeconds,
  );
  return Object.freeze({
    // Keep subpixel pursuit in simulation. Quantize the composed render view,
    // not this accumulator, otherwise slow tracking advances in one-pixel kicks.
    x: clamp(x, 0, regionBounds.width - width),
    y: clamp(y, 0, regionBounds.height - height),
    width,
    height,
    facing,
  });
}

function facingFor(player: PlayerState, fallback: ForestCameraFacing): ForestCameraFacing {
  if (player.velocity.x < 0) return "left";
  if (player.velocity.x > 0) return "right";
  return fallback;
}

function moveIntoDeadZone(
  previousOrigin: number,
  focus: number,
  length: number,
  lower: number,
  upper: number,
): number {
  if (focus >= previousOrigin + length * lower && focus <= previousOrigin + length * upper) {
    return previousOrigin;
  }
  return focus < previousOrigin + length * lower
    ? focus - length * lower
    : focus - length * upper;
}

function smoothAxis(
  previous: number,
  target: number,
  damping: number,
  maximumSpeed: number,
  fixedSeconds: number,
): number {
  const delta = target - previous;
  if (Math.abs(delta) < 1e-9) return target;
  const dampingStep = Math.abs(delta) * (1 - Math.exp(-damping * fixedSeconds));
  const step = Math.sign(delta) * Math.min(Math.abs(delta), dampingStep, maximumSpeed * fixedSeconds);
  return previous + step;
}
