import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { generateForestRegion } from "./forest-region-generator";
import { FOREST_MATERIAL } from "./forest-chunk-stream";
import { ForestGrayboxRuntime } from "./forest-graybox-runtime";

const manifest = readRuntimeForestSpatialManifest(generated);
const seed = "forest.graybox.test";
const region = generateForestRegion(manifest, seed);

const createRuntime = (initialPosition?: Readonly<{ x: number; y: number }>): ForestGrayboxRuntime =>
  new ForestGrayboxRuntime({ manifest, region, initialPosition });

describe("ForestGrayboxRuntime", () => {
  it("produces identical fixed-tick snapshots under 30 and 60 render-fps accumulator schedules", () => {
    const atThirty = createRuntime();
    const atSixty = createRuntime();

    for (let frame = 0; frame < 30; frame += 1) atThirty.advanceFrame(1 / 30, { moveX: 1 });
    for (let frame = 0; frame < 60; frame += 1) atSixty.advanceFrame(1 / 60, { moveX: 1 });

    expect(atThirty.snapshot()).toEqual(atSixty.snapshot());
    expect(atThirty.snapshot()).toMatchObject({
      tick: 60,
      seed,
      topologyDigest: region.topologyDigest,
      camera: { width: 640, height: 360 },
    });
  });

  it("uses solid terrain, protected waterwheel mass, and sealed gates while leaving water passable", () => {
    const runtime = createRuntime();

    expect(runtime.chunkStream.isSolid({ x: 512, y: 520, width: 1, height: 1 })).toBe(true);
    expect(runtime.chunkStream.isSolid({ x: 4800, y: 2000, width: 1, height: 1 })).toBe(true);
    expect(runtime.chunkStream.isSolid({ x: 3330, y: 180, width: 1, height: 1 })).toBe(true);
    expect(runtime.chunkStream.materialAt(1088, 672)).toBe(FOREST_MATERIAL.water);
    expect(runtime.chunkStream.isSolid({ x: 1088, y: 672, width: 1, height: 1 })).toBe(false);
  });

  it("rejects checkpoints in solid mass or outside the arrival recovery component", () => {
    const solid = createRuntime({ x: 4800, y: 1120 });
    expect(() => solid.setCheckpoint("checkpoint.solid")).toThrow(/safe recovery route/);

    const gatedCell = region.traversableCells.find((cell) => cell.cellId === "forest.edge.settlement.old_mine.8")!;
    const gated = createRuntime(gatedCell.positionPx);
    expect(gated.chunkStream.isSolid({ ...gatedCell.positionPx, width: 12, height: 14 })).toBe(false);
    expect(() => gated.setCheckpoint("checkpoint.gated")).toThrow(/safe recovery route/);
  });

  it("resets to the accepted checkpoint without crossing a capability gate", () => {
    const runtime = createRuntime();
    runtime.advanceTicks(10);
    const checkpoint = runtime.setCheckpoint("checkpoint.arrival");
    runtime.advanceTicks(120, { moveX: 1 });

    const reset = runtime.resetToCheckpoint();

    expect(reset.player.position).toEqual(checkpoint.position);
    expect(reset.player.position.x).toBeLessThan(3_328);
    expect(reset.player.velocity).toEqual({ x: 0, y: 0 });
  });

  it("replays recorded semantic inputs to the same topology, player, and camera digest", () => {
    const inputs = Array.from({ length: 600 }, (_, tick) => ({
      moveX: tick < 240 ? 1 : tick < 360 ? 0 : -1,
      jump: tick === 45 || tick === 270 || tick === 450,
    }));
    const source = createRuntime();
    const replay = createRuntime();

    for (const input of inputs) source.advanceTicks(1, input);
    for (const input of inputs) replay.advanceTicks(1, input);

    expect(replay.snapshot()).toEqual(source.snapshot());
    expect(replay.snapshot().stateDigest).toBe(source.snapshot().stateDigest);
  });

  it("keeps the temporary centered camera fixed-size, deterministic, and clamped", () => {
    const left = createRuntime({ x: 0, y: 0 }).snapshot().camera;
    const right = createRuntime({ x: 10_220, y: 2_850 }).snapshot().camera;

    expect(left).toEqual({ x: 0, y: 0, width: 640, height: 360 });
    expect(right).toEqual({ x: 9_600, y: 2_520, width: 640, height: 360 });
  });
});
