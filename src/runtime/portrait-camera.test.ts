import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimePortraitCameraProfile } from "../content/runtime-camera-profile";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import type { RuntimeSnapshot } from "./runtime";
import { portraitScreenPoint, projectPortraitCamera } from "./portrait-camera";

const profile = readRuntimePortraitCameraProfile(generated);
const scenes = readRuntimeSceneManifestIndex(generated).byId;

function runtime(sceneId: string, x: number, y: number): RuntimeSnapshot {
  return {
    tick: 1,
    sceneId,
    player: { position: { x, y }, velocity: { x: 0, y: 0 }, grounded: true,
      body: { width: 12, height: 14 } },
    camera: { x: 0, y: 0, width: 1, height: 1 },
    checkpoint: { id: "checkpoint", sceneId, position: { x, y }, tick: 0 },
  };
}

describe("verified portrait camera projection", () => {
  it("keeps the N00 spawn and player body inside the 180x320 portrait viewport", () => {
    const scene = scenes["scene.valley.arrival_shelf"]!;
    const state = runtime(scene.sceneId, 48, 50);
    const camera = projectPortraitCamera(profile, state, scene);
    expect(camera).toEqual({ x: 0, y: 0, width: 180, height: 320 });
    expect(portraitScreenPoint(camera, state.player.position)).toEqual({ x: 48, y: 50 });
  });

  it("follows and clamps on both axes in a tall scene", () => {
    const scene = scenes["scene.valley.service_channel"]!;
    const state = runtime(scene.sceneId, 400, 500);
    const camera = projectPortraitCamera(profile, state, scene);
    expect(camera).toEqual({ x: 268, y: 309, width: 180, height: 320 });
    expect(portraitScreenPoint(camera, state.player.position)).toEqual({ x: 132, y: 191 });
  });

  it("rejects a mismatched scene and an unverified profile", () => {
    const scene = scenes["scene.valley.arrival_shelf"]!;
    expect(() => projectPortraitCamera(profile, runtime("scene.valley.stream_section", 0, 0), scene)).toThrow(/scene identity/);
    expect(() => projectPortraitCamera(structuredClone(profile), runtime(scene.sceneId, 0, 0), scene)).toThrow(/verified/);
  });
});
