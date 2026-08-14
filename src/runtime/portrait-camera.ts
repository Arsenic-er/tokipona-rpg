import {
  isVerifiedRuntimePortraitCameraProfile,
  type RuntimePortraitCameraProfile,
} from "../content/runtime-camera-profile";
import type { RuntimeSceneManifest } from "../content/runtime-scene-manifest";
import { clamp, type Vec2 } from "./geometry";
import type { CameraState, RuntimeSnapshot } from "./runtime";

export function projectPortraitCamera(
  profile: RuntimePortraitCameraProfile,
  runtime: RuntimeSnapshot,
  scene: RuntimeSceneManifest,
): CameraState {
  if (!isVerifiedRuntimePortraitCameraProfile(profile)) throw new Error("portrait camera requires a verified runtime profile");
  if (runtime.sceneId !== scene.sceneId) throw new Error("portrait camera scene identity mismatch");
  const numbers = [runtime.player.position.x, runtime.player.position.y, runtime.player.body.width, runtime.player.body.height];
  if (!numbers.every(Number.isFinite) || runtime.player.body.width <= 0 || runtime.player.body.height <= 0) {
    throw new Error("portrait camera player geometry is invalid");
  }
  const worldWidth = scene.sizeTiles.width * scene.tileSizePx;
  const worldHeight = scene.sizeTiles.height * scene.tileSizePx;
  const centerX = runtime.player.position.x + runtime.player.body.width / 2;
  const centerY = runtime.player.position.y + runtime.player.body.height / 2;
  const rawX = centerX - profile.viewportPx.width * profile.focusAnchorNormalized.x;
  const rawY = centerY - profile.viewportPx.height * profile.focusAnchorNormalized.y;
  const x = clamp(rawX, 0, Math.max(0, worldWidth - profile.viewportPx.width));
  const y = clamp(rawY, 0, Math.max(0, worldHeight - profile.viewportPx.height));
  return Object.freeze({
    x: profile.pixelSnap ? Math.round(x) : x,
    y: profile.pixelSnap ? Math.round(y) : y,
    width: profile.viewportPx.width,
    height: profile.viewportPx.height,
  });
}

export function portraitScreenPoint(camera: CameraState, worldPoint: Vec2): Vec2 {
  if (![camera.x, camera.y, worldPoint.x, worldPoint.y].every(Number.isFinite)) {
    throw new Error("portrait camera transform requires finite coordinates");
  }
  return Object.freeze({ x: worldPoint.x - camera.x, y: worldPoint.y - camera.y });
}
