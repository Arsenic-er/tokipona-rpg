import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import type { PlayerState } from "./runtime";
import {
  FOREST_CAMERA_TUNING,
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

  it("moves only toward the nearest dead-zone edge and caps one-tick pursuit", () => {
    const previous = camera(1_000, 1_000);
    const result = advanceForestCamera(contract, previous, player(1_594, 1_173, 88), bounds);

    expect(result.x).toBeGreaterThan(previous.x);
    expect(result.x - previous.x).toBeLessThanOrEqual(
      Math.ceil(FOREST_CAMERA_TUNING.maxHorizontalSpeed / 60),
    );
    expect(result.x).toBeLessThan(1_100);
    expect(result.y).toBe(previous.y);
  });

  it("smooths a facing reversal instead of jumping the look-ahead across the player", () => {
    const previous = camera(1_395, 1_000, "right");
    const result = advanceForestCamera(contract, previous, player(1_709, 1_173, -88), bounds);

    expect(result.facing).toBe("left");
    expect(result.x).toBeLessThan(previous.x);
    expect(previous.x - result.x).toBeLessThanOrEqual(
      Math.ceil(FOREST_CAMERA_TUNING.maxHorizontalSpeed / 60),
    );
  });

  it("settles monotonically without overshooting a sustained target", () => {
    const target = player(1_594, 1_173, 88);
    let current = camera(1_000, 1_000);
    const samples: number[] = [];
    for (let tick = 0; tick < 180; tick += 1) {
      current = advanceForestCamera(contract, current, target, bounds);
      samples.push(current.x);
    }

    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1]!)).toBe(true);
    expect(current.x).toBeGreaterThan(1_300);
    expect(current.x).toBeLessThanOrEqual(1_320);
  });

  it("uses slower vertical damping for descending pursuit", () => {
    const previous = camera(1_000, 1_000);
    const result = advanceForestCamera(contract, previous, player(1_178.8, 1_594, 0, 240), bounds);

    expect(result.y).toBeGreaterThan(previous.y);
    expect(result.y - previous.y).toBeLessThanOrEqual(
      Math.ceil(FOREST_CAMERA_TUNING.maxVerticalSpeed / 60),
    );
    expect(result.y).toBeLessThan(1_100);
  });

  it("pixel-snaps and clamps both axes to the authored 10240 by 2880 region", () => {
    let topLeft = camera(100, 100, "left");
    let bottomRight = camera(9_000, 2_000);
    for (let tick = 0; tick < 4_000; tick += 1) {
      topLeft = advanceForestCamera(contract, topLeft, player(-1_000, -1_000, -1, -1), bounds);
      bottomRight = advanceForestCamera(contract, bottomRight, player(20_000, 20_000, 1, 1), bounds);
    }

    expect(topLeft).toEqual(camera(0, 0, "left"));
    expect(bottomRight).toEqual(camera(9_600, 2_520, "right"));
    expect(Number.isInteger(bottomRight.x)).toBe(true);
    expect(Number.isInteger(bottomRight.y)).toBe(true);
  });
});
