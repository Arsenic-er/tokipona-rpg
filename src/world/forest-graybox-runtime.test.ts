import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { generateForestRegion } from "./forest-region-generator";
import type { ForestRegion } from "./forest-region-generator";
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

  it("rejects isolated carved air even when it is near an abstract reachable cell", () => {
    const arrivalVolume = region.routeCorridors.find((corridor) => corridor.edgeId === "arrival.stream")!
      .clearanceVolumesPx[0]!;
    const isolatedVolumes = [
      Object.freeze({ x: 512, y: 560, width: 64, height: 64 }),
      Object.freeze({ x: arrivalVolume.x - 64, y: arrivalVolume.y - 64, width: 64, height: 64 }),
    ];

    for (const [index, isolated] of isolatedVolumes.entries()) {
      const isolatedRegion = Object.freeze({
        ...region,
        routeCorridors: Object.freeze(region.routeCorridors.map((corridor) =>
          corridor.edgeId === "arrival.stream"
            ? Object.freeze({
              ...corridor,
              clearanceVolumesPx: Object.freeze([...corridor.clearanceVolumesPx, isolated]),
            })
            : corridor)),
        criticalRouteClearances: Object.freeze(region.criticalRouteClearances.map((clearance) =>
          clearance.edgeId === "arrival.stream"
            ? Object.freeze({
              ...clearance,
              volumesPx: Object.freeze([...clearance.volumesPx, isolated]),
            })
            : clearance)),
      }) as ForestRegion;
      const position = { x: isolated.x + 8, y: isolated.y + 8 };
      const runtime = new ForestGrayboxRuntime({ manifest, region: isolatedRegion, initialPosition: position });

      expect(runtime.chunkStream.isSolid({ ...position, width: 12, height: 14 })).toBe(false);
      expect(() => runtime.setCheckpoint(`checkpoint.isolated-air.${index}`)).toThrow(/safe recovery route/);
    }
  });

  it("accepts a collision-safe position inside the sparse arrival-connected corridor geometry", () => {
    const corridor = region.routeCorridors.find((candidate) => candidate.edgeId === "hermit.waterwheel")!;
    const volume = corridor.clearanceVolumesPx[Math.floor(corridor.clearanceVolumesPx.length / 2)]!;
    const position = {
      x: volume.x + (volume.width - 12) / 2,
      y: volume.y + (volume.height - 14) / 2,
    };
    const runtime = createRuntime(position);

    expect(runtime.chunkStream.isSolid({ ...position, width: 12, height: 14 })).toBe(false);
    expect(runtime.setCheckpoint("checkpoint.sparse-corridor").position).toEqual(position);
  });

  it("accepts settlement meadow recovery and rejects restored players outside authored recovery space", () => {
    const meadow = createRuntime({ x: 2_500, y: 690 });
    expect(meadow.setCheckpoint("checkpoint.forest.settlement_perimeter")).toMatchObject({
      position: { x: 2_500, y: 690 },
    });

    const source = createRuntime().save();
    const forged = { ...source, player: { ...source.player, x: 2_400, y: 100 } };
    expect(() => ForestGrayboxRuntime.fromSave({ manifest, region }, forged)).toThrow(/save state/i);
    const unreachable = { ...source, player: { ...source.player, x: source.player.x + 100 } };
    expect(() => ForestGrayboxRuntime.fromSave({ manifest, region }, unreachable)).toThrow(/save state/i);
    const futureCheckpoint = {
      ...source,
      checkpoint: { ...source.checkpoint, tick: source.tick + 1 },
    };
    expect(() => ForestGrayboxRuntime.fromSave({ manifest, region }, futureCheckpoint)).toThrow(/save state/i);

    const detachedCamera = {
      ...source,
      camera: { ...source.camera, x: manifest.regionBoundsPx.width - manifest.viewportPx.width },
    };
    expect(() => ForestGrayboxRuntime.fromSave({ manifest, region }, detachedCamera)).toThrow(/save state/i);
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
    expect(reset.player.position.x).toBeGreaterThanOrEqual(reset.camera.x);
    expect(reset.player.position.x + reset.player.body.width).toBeLessThanOrEqual(reset.camera.x + reset.camera.width);
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

  it("physically traverses arrival, settlement east egress, hermit branch, and waterwheel approach", () => {
    const runtime = createRuntime();
    const reached = new Set<string>(["forest.arrival"]);
    let furthestX = runtime.snapshot().player.position.x;
    let stagnantSamples = 0;

    // Advance every fixed tick, but inspect only every 32 ticks so this
    // integration path stays stable under the full-suite worker load.
    for (let sample = 0; sample < 225 && furthestX < 5_000; sample += 1) {
      const jump = stagnantSamples >= 4;
      runtime.advanceTicks(32, { moveX: 1, jump });
      const player = runtime.snapshot().player.position;
      if (player.x > furthestX + 0.25) {
        furthestX = player.x;
        stagnantSamples = 0;
      } else {
        stagnantSamples = jump ? 0 : stagnantSamples + 1;
      }
      if (player.x >= 1_280) reached.add("forest.stream");
      if (player.x >= 2_496) reached.add("forest.settlement");
      if (player.x >= 3_776) reached.add("forest.hermit_branch");
      if (player.x >= 5_000) reached.add("forest.waterwheel.approach");
    }

    expect(furthestX).toBeGreaterThanOrEqual(5_000);
    expect([...reached]).toEqual([
      "forest.arrival",
      "forest.stream",
      "forest.settlement",
      "forest.hermit_branch",
      "forest.waterwheel.approach",
    ]);
  }, 10_000);

  it("keeps the final fixed-zoom camera deterministic and clamped", () => {
    const left = createRuntime({ x: 0, y: 0 }).snapshot().camera;
    const right = createRuntime({ x: 10_220, y: 2_850 }).snapshot().camera;

    expect(left).toEqual({ x: 0, y: 0, width: 640, height: 360, facing: "right" });
    expect(right).toEqual({ x: 9_600, y: 2_520, width: 640, height: 360, facing: "right" });
  });

  it("restores player and stateful camera data without a first-tick camera jump", () => {
    const source = createRuntime();
    source.advanceTicks(180, { moveX: 1 });
    const save = source.save();
    const restored = ForestGrayboxRuntime.fromSave({ manifest, region }, save);

    expect(restored.snapshot()).toEqual(source.snapshot());
    expect(restored.snapshot().camera.facing).toBe("right");

    restored.advanceTicks(1);
    source.advanceTicks(1);
    expect(restored.snapshot().camera).toEqual(source.snapshot().camera);
  });
});
