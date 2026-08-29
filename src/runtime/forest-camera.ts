import type { RuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { clamp } from "./geometry";
import type { PlayerState } from "./runtime";
import type { CameraState } from "./runtime";

export type ForestCameraFacing = "left" | "right";

export interface ForestCameraState extends CameraState {
  readonly facing: ForestCameraFacing;
}

export type RuntimeForestCameraContract = RuntimeForestSpatialManifest["camera"];
type ForestBounds = RuntimeForestSpatialManifest["regionBoundsPx"];

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
): ForestCameraState {
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
  const x = moveIntoDeadZone(
    previous.x,
    focusX,
    width,
    contract.deadZoneNormalized.left,
    contract.deadZoneNormalized.right,
  );
  const y = moveIntoDeadZone(
    previous.y,
    focusY,
    height,
    contract.deadZoneNormalized.top,
    contract.deadZoneNormalized.bottom,
  );
  return Object.freeze({
    x: snapAndClamp(x, 0, regionBounds.width - width, contract.pixelSnap),
    y: snapAndClamp(y, 0, regionBounds.height - height, contract.pixelSnap),
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
  return focus - length / 2;
}

function snapAndClamp(value: number, minimum: number, maximum: number, pixelSnap: boolean): number {
  const clamped = clamp(value, minimum, maximum);
  return pixelSnap ? Math.round(clamped) : clamped;
}
