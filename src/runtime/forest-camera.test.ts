import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import type { PlayerState } from "./runtime";
import {
  advanceForestCamera,
  initializeForestCamera,
  type ForestCameraState,
} from "./forest-camera";

const manifest = readRuntimeForestSpatialManifest(generated);
const contract = manifest.camera;
const bounds = manifest.regionBoundsPx;
const body = Object.freeze({ width: 12, height: 14 });

function player(x: number, y: number, velocityX = 0, velocityY = 0): PlayerState {
  return Object.freeze({
    position: Object.freeze({ x, y }),
    velocity: Object.freeze({ x: velocityX, y: velocityY }),
    grounded: false,
    body,
  });
}

function camera(x: number, y: number, facing: "left" | "right" = "right"): ForestCameraState {
  return Object.freeze({ x, y, width: 640, height: 360, facing });
}

describe("continuous forest camera", () => {
  it("keeps the fixed 640 by 360 crop at every player position", () => {
    const positions = [player(0, 0), player(5_000, 1_440), player(10_228, 2_866)];

    for (const position of positions) {
      const result = initializeForestCamera(contract, position, bounds);
      expect(result.width).toBe(640);
      expect(result.height).toBe(360);
    }
  });

  it("does not move while the directed focus remains in the dead zone", () => {
    const previous = camera(1_000, 1_000);

    const result = advanceForestCamera(contract, previous, player(1_178.8, 1_173), bounds);

    expect(result).toEqual(previous);
  });

  it("centers sustained right pursuit on the 115.2 pixel look-ahead before snapping", () => {
    const result = advanceForestCamera(contract, camera(1_000, 1_000), player(1_594, 1_173, 88), bounds);

    expect(result).toEqual(camera(1_395, 1_000, "right"));
  });

  it("changes look-ahead through facing state without changing the crop size", () => {
    const previous = camera(1_395, 1_000, "right");

    const result = advanceForestCamera(contract, previous, player(1_709, 1_173, -88), bounds);

    expect(result).toEqual(camera(1_280, 1_000, "left"));
    expect(result.width).toBe(previous.width);
    expect(result.height).toBe(previous.height);
  });

  it("biases descending pursuit down by 50.4 pixels before snapping", () => {
    const result = advanceForestCamera(contract, camera(1_000, 1_000), player(1_178.8, 1_594, 0, 240), bounds);

    expect(result).toEqual(camera(1_000, 1_471));
  });

  it("keeps upward pursuit 28.8 pixels below the player before snapping", () => {
    const result = advanceForestCamera(contract, camera(1_000, 1_000), player(1_178.8, 1_594, 0, -190), bounds);

    expect(result).toEqual(camera(1_000, 1_450));
  });

  it("pixel-snaps and clamps both axes to the authored 10240 by 2880 region", () => {
    const topLeft = advanceForestCamera(contract, camera(100, 100, "left"), player(-1_000, -1_000, -1, -1), bounds);
    const bottomRight = advanceForestCamera(contract, camera(9_000, 2_000), player(20_000, 20_000, 1, 1), bounds);

    expect(topLeft).toEqual(camera(0, 0, "left"));
    expect(bottomRight).toEqual(camera(9_600, 2_520, "right"));
    expect(Number.isInteger(bottomRight.x)).toBe(true);
    expect(Number.isInteger(bottomRight.y)).toBe(true);
  });
});
