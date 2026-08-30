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

  it("keeps authored meadow water non-solid instead of replacing it with meadow terrain", () => {
    const stream = new ForestChunkStream(manifest, region);

    expect(stream.materialAt(3000, 762)).toBe(FOREST_MATERIAL.water);
    expect(stream.isSolid({ x: 3000, y: 762, width: 1, height: 1 })).toBe(false);
  });

  it("keeps authored meadow air open and carves a body-safe settlement east egress", () => {
    const stream = new ForestChunkStream(manifest, region);
    const meadow = region.meadowSurfaces[0]!;
    const meadowProbeX = meadow.right - 32;

    expect(stream.materialAt(meadowProbeX, meadow.y - 1)).toBe(FOREST_MATERIAL.air);
    expect(stream.materialAt(meadowProbeX, meadow.y)).toBe(FOREST_MATERIAL.soil);
    expect(stream.materialAt(meadowProbeX, meadow.y + 11)).toBe(FOREST_MATERIAL.soil);
    expect(stream.materialAt(meadowProbeX, meadow.y + 12)).toBe(FOREST_MATERIAL.stone);

    const egress = region.routeCorridors.find((corridor) => corridor.edgeId === "settlement.hermit")!;
    for (const cellId of egress.cellIds) {
      const position = region.traversableCells.find((cell) => cell.cellId === cellId)!.positionPx;
      expect(stream.isSolid({ ...position, width: 12, height: 14 }), cellId).toBe(false);
    }

    expect(stream.materialAt(3330, 180)).toBe(FOREST_MATERIAL.protected_mass);
  });

  it("does not expose cached material payloads to caller mutation", () => {
    const stream = new ForestChunkStream(manifest, region);
    const camera = { x: 512, y: 480, width: 1, height: 1 };
    const first = stream.visible(camera, 0)[0]!;
    const digest = first.digest;

    first.materials[0] = FOREST_MATERIAL.protected_mass;
    const second = stream.visible(camera, 0)[0]!;

    expect(second.materials[0]).toBe(FOREST_MATERIAL.air);
    expect(second.digest).toBe(digest);
    expect(stream.materialAt(512, 480)).toBe(FOREST_MATERIAL.air);
    expect(stream.isSolid({ x: 512, y: 480, width: 1, height: 1 })).toBe(false);
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

  it("keeps retention bounded across repeated long-distance traversal", () => {
    const maxRetainedChunks = 64;
    const stream = new ForestChunkStream(manifest, region, { maxRetainedChunks });

    for (let pass = 0; pass < 3; pass += 1) {
      for (let x = 0; x < manifest.regionBoundsPx.width; x += 320) {
        stream.visible({ x, y: 1_200 + pass * 160, width: 64, height: 64 }, 1);
      }
    }

    expect(stream.cacheStats().materialized).toBeGreaterThan(maxRetainedChunks);
    expect(stream.cacheStats()).toMatchObject({ retained: maxRetainedChunks });
  });
});
