import type { ForestCameraState } from "../runtime/forest-camera";
import { FOREST_MATERIAL as M, type ForestMaterialChunk } from "../world/forest-chunk-stream";

export interface ForestGroundCover {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly kind: "fern" | "grass" | "litter";
  readonly wet: boolean;
}

const cache = new WeakMap<readonly ForestMaterialChunk[], readonly ForestGroundCover[]>();
const seedAt = (x: number): number => (Math.imul(x ^ 0x281a, 374761393) >>> 0);

/** Small, nonblocking plants only. Their bases come from actual exposed soil,
 * never from a second heightmap or an assumed floor behind missing chunks. */
export function forestGroundCover(chunks: readonly ForestMaterialChunk[]): readonly ForestGroundCover[] {
  const cached = cache.get(chunks);
  if (cached) return cached;
  const byLocation = new Map(chunks.map(chunk => [`${chunk.chunkX},${chunk.chunkY}`, chunk]));
  const at = (x: number, y: number): number | undefined => {
    const cx = Math.floor(x / 16), cy = Math.floor(y / 16);
    return byLocation.get(`${cx},${cy}`)?.materials[(y - cy * 16) * 16 + x - cx * 16];
  };
  const result: ForestGroundCover[] = [];
  for (const chunk of chunks) for (let lx = 0; lx < 16; lx += 1) {
    const x = chunk.chunkX * 16 + lx;
    if (x < 0 || x >= 2496) continue;
    const seed = seedAt(Math.floor(x / 11));
    // Groups with bare leaf-litter gaps, rather than an evenly spaced planted row.
    if (x % 11 !== seed % 7 + 2 || Math.sin(x / 43) + Math.sin(x / 17) < -.1) continue;
    for (let ly = 0; ly < 16; ly += 1) {
      const material = chunk.materials[ly * 16 + lx];
      if (material !== M.soil && material !== M.wet_soil) continue;
      const y = chunk.chunkY * 16 + ly;
      const kind = seed % 5 === 0 ? "litter" : seed % 3 === 0 ? "fern" : "grass";
      const height = kind === "litter" ? 2 : 3 + seed % 5;
      let clear = true;
      for (let dy = 1; dy <= height && clear; dy += 1) for (let dx = -5; dx <= 5; dx += 1) {
        if (at(x + dx, y - dy) !== M.air) { clear = false; break; }
      }
      if (clear) result.push(Object.freeze({ x, y, height, kind, wet: material === M.wet_soil }));
    }
  }
  const cover = Object.freeze(result);
  cache.set(chunks, cover);
  return cover;
}

export function drawForestGroundCover(context: CanvasRenderingContext2D, chunks: readonly ForestMaterialChunk[], camera: ForestCameraState): void {
  const ox = Math.round(camera.x), oy = Math.round(camera.y);
  for (const plant of forestGroundCover(chunks)) {
    const x = plant.x - ox, y = plant.y - oy;
    if (x < -5 || x > camera.width + 5 || y < 0 || y - plant.height > camera.height) continue;
    if (plant.kind === "litter") {
      context.fillStyle = "#766044";
      context.fillRect(x - 4, y - 1, 8, 1);
      context.fillRect(x - 2, y - 2, 2, 1);
      continue;
    }
    context.fillStyle = plant.wet ? "#59694e" : "#6b7148";
    context.fillRect(x, y - plant.height, 1, plant.height);
    for (let h = 1; h < plant.height; h += 2) {
      const spread = plant.kind === "fern" ? Math.ceil((plant.height - h) / 2) : 1;
      context.fillRect(x - spread, y - h - 1, spread, 1);
      context.fillRect(x + 1, y - h, spread, 1);
    }
  }
}
