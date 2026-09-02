import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { ForestChunkStream } from "./forest-chunk-stream";
import { createForestOpeningCreaturePlacement } from "./forest-opening-creature-habitat";
import { generateForestRegion } from "./forest-region-generator";

const manifest = readRuntimeForestSpatialManifest(generated);

describe("forest opening creature habitat", () => {
  it("moves legacy authored wildlife anchors out of generated solid terrain", () => {
    const terrain = new ForestChunkStream(
      manifest,
      generateForestRegion(manifest, "forest.chapter-one.opening"),
    );
    const placement = createForestOpeningCreaturePlacement(manifest, terrain);
    const rabbit = placement.rabbitGround({ x: 768, y: 480 });
    const rabbitRefuge = placement.rabbitGround({ x: 960, y: 480 });
    const bird = placement.birdGround({ x: 1488, y: 672 });
    const birdExit = placement.birdFlight({ x: 1664, y: 544 });

    expect(terrain.isSolid({ x: 764, y: 468, width: 8, height: 12 })).toBe(true);
    for (const anchor of [rabbit, rabbitRefuge]) {
      expect(terrain.isSolid({ x: anchor.x - 4, y: anchor.y - 12, width: 8, height: 12 })).toBe(false);
      expect(terrain.isSolid({ x: anchor.x - 3, y: anchor.y, width: 6, height: 1 })).toBe(true);
    }
    expect(terrain.isSolid({ x: bird.x - 5, y: bird.y - 8, width: 10, height: 8 })).toBe(false);
    expect(terrain.isSolid({ x: bird.x - 4, y: bird.y, width: 8, height: 1 })).toBe(true);
    expect(terrain.isSolid({ x: birdExit.x - 5, y: birdExit.y - 8, width: 10, height: 8 })).toBe(false);

    let rabbitStep = rabbit;
    let birdStep = bird;
    for (let step = 0; step < 120; step += 1) {
      rabbitStep = placement.rabbitGround(moveToward(rabbitStep, rabbitRefuge, 2));
      birdStep = placement.birdFlight(moveToward(birdStep, birdExit, 3));
      expect(terrain.isSolid({ x: rabbitStep.x - 4, y: rabbitStep.y - 12, width: 8, height: 12 })).toBe(false);
      expect(terrain.isSolid({ x: birdStep.x - 5, y: birdStep.y - 8, width: 10, height: 8 })).toBe(false);
    }
    expect(birdStep).toEqual(birdExit);
  });
});

function moveToward(from: Readonly<{ x: number; y: number }>, to: Readonly<{ x: number; y: number }>, speed: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= speed) return to;
  return { x: from.x + dx / distance * speed, y: from.y + dy / distance * speed };
}
