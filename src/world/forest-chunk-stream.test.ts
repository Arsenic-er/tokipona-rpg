import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { generateForestRegion } from "./forest-region-generator";
import { FOREST_MATERIAL, ForestChunkStream } from "./forest-chunk-stream";

const manifest = readRuntimeForestSpatialManifest(generated);
const region = generateForestRegion(manifest, "forest.stream.test");

describe("ForestChunkStream", () => {
  it("materializes exact 16x16 payloads with byte-stable content digests", () => {
    const stream = new ForestChunkStream(manifest, region);

    const chunks = stream.visible({ x: 512, y: 480, width: 1, height: 1 }, 0);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ chunkX: 32, chunkY: 30 });
    expect(chunks[0]!.materials).toHaveLength(256);
    expect([...chunks[0]!.materials]).toEqual(new Array<number>(256).fill(FOREST_MATERIAL.air));
    expect(chunks[0]!.digest).toBe("sha256:2d673de942048a8b5ede075bd8fc7c56c7d9cce7335d5be36ef4b87dbb16cb82");
    expect(new ForestChunkStream(manifest, region).visible({ x: 512, y: 480, width: 1, height: 1 }, 0)[0])
      .toEqual(chunks[0]);
  });

  it("answers material and continuous collision queries at topology boundaries", () => {
    const stream = new ForestChunkStream(manifest, region);

    expect(stream.materialAt(512, 480)).toBe(FOREST_MATERIAL.air);
    expect(stream.materialAt(3000, manifest.meadowGroundBandPx.y)).toBe(FOREST_MATERIAL.soil);
    expect(stream.materialAt(1088, 672)).toBe(FOREST_MATERIAL.water);
    expect(stream.materialAt(4800, 2000)).toBe(FOREST_MATERIAL.protected_mass);
    expect(stream.materialAt(3330, 180)).toBe(FOREST_MATERIAL.protected_mass);
    expect(stream.isSolid({ x: 1088, y: 672, width: 1, height: 1 })).toBe(false);
    expect(stream.isSolid({ x: 4800, y: 2000, width: 1, height: 1 })).toBe(true);
    expect(stream.isSolid({ x: -1, y: 0, width: 1, height: 1 })).toBe(true);
    expect(stream.isSolid({ x: 0, y: -1, width: 1, height: 1 })).toBe(true);
    expect(stream.isSolid({ x: 10_240, y: 0, width: 1, height: 1 })).toBe(true);
    expect(stream.isSolid({ x: 0, y: 2_880, width: 1, height: 1 })).toBe(true);
  });

  it("returns exactly one extra chunk around an interior camera", () => {
    const stream = new ForestChunkStream(manifest, region, { maxRetainedChunks: 2_000 });

    const chunks = stream.visible({ x: 640, y: 360, width: 640, height: 360 }, 1);
    const coordinates = chunks.map((chunk) => `${chunk.chunkX},${chunk.chunkY}`);

    expect(chunks).toHaveLength(42 * 25);
    expect(coordinates[0]).toBe("39,21");
    expect(coordinates.at(-1)).toBe("80,45");
  });

  it("evicts least-recently-used chunks at the configured retention cap", () => {
    const stream = new ForestChunkStream(manifest, region, { maxRetainedChunks: 4 });

    for (let chunkX = 0; chunkX < 6; chunkX += 1) stream.materialAt(chunkX * 16, 0);
    expect(stream.cacheStats()).toEqual({ materialized: 6, retained: 4 });

    stream.materialAt(2 * 16, 0);
    stream.materialAt(0, 0);
    expect(stream.cacheStats()).toEqual({ materialized: 7, retained: 4 });
  });

  it("streams the Chapter 1 route without allocating the full 115,200-chunk region", () => {
    const maxRetainedChunks = 1_280;
    const stream = new ForestChunkStream(manifest, region, { maxRetainedChunks });

    for (const anchorId of manifest.chapterOneRouteAnchorIds) {
      const anchor = manifest.anchors.find((candidate) => candidate.anchorId === anchorId)!;
      stream.visible({
        x: anchor.positionPx[0] - manifest.viewportPx.width / 2,
        y: anchor.positionPx[1] - manifest.viewportPx.height / 2,
        width: manifest.viewportPx.width,
        height: manifest.viewportPx.height,
      }, 1);
    }

    expect(stream.cacheStats().materialized).toBeLessThan(20_000);
    expect(stream.cacheStats().retained).toBeLessThanOrEqual(maxRetainedChunks);
  });
});
