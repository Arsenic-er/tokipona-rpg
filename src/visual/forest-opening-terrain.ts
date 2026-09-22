import type { ForestCameraState } from "../runtime/forest-camera";
import { FOREST_MATERIAL, type ForestMaterialChunk } from "../world/forest-chunk-stream";
import { drawForestGroundCover } from "./forest-ground-cover";
import { forestMaterialColor } from "./forest-material-texture";
import { forestBuriedColor } from './forest-earth-profile';
import { drawForestEdgeDressing, OPENING_TREE_ROOTS } from './forest-edge-dressing';
export { drawForestOpeningBackdrop } from "./forest-opening-backdrop";
export { renderForestOpeningView } from "./forest-opening-renderer";
export { ForestOpeningJourney } from "./forest-opening-journey";
export { ForestMap } from "./forest-map";
export { ForestMouseCamera, bindForestMouseCamera } from "./forest-mouse-camera";

const surfaces = new WeakMap<object, {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  tiles: Map<string, ImageData>;
  drawn: Map<string, string>;
  chunks: readonly ForestMaterialChunk[] | null;
  originX: number;
  originY: number;
  roots: Map<number, number>;
}>();

export function rasterizeForestOpeningTerrain(
  chunks: readonly ForestMaterialChunk[],
  camera: ForestCameraState,
  target = new Uint8ClampedArray(camera.width * camera.height * 4),
): Uint8ClampedArray {
  if (target.length !== camera.width * camera.height * 4) throw new Error("forest opening terrain buffer must match the camera RGBA dimensions");
  rasterize(chunks, Math.round(camera.x), Math.round(camera.y), camera.width, camera.height, target);
  return target;
}

function rasterize(
  chunks: readonly ForestMaterialChunk[],
  cameraX: number,
  cameraY: number,
  width: number,
  height: number,
  target: Uint8ClampedArray,
): void {
  target.fill(0);
  const halo = 4;
  const maskWidth = width + halo * 2;
  // Unloaded neighbors must not masquerade as exposed air at a tile seam.
  const mask = new Uint8Array(maskWidth * (height + halo * 2)).fill(255);
  for (const chunk of chunks) {
    for (let ly = 0; ly < 16; ly += 1) for (let lx = 0; lx < 16; lx += 1) {
      const x = chunk.chunkX * 16 + lx - cameraX + halo;
      const y = chunk.chunkY * 16 + ly - cameraY + halo;
      if (x >= 0 && x < maskWidth && y >= 0 && y < height + halo * 2) mask[y * maskWidth + x] = chunk.materials[ly * 16 + lx]!;
    }
  }
  for (const chunk of chunks) {
    const originX = chunk.chunkX * 16 - cameraX;
    const originY = chunk.chunkY * 16 - cameraY;
    for (let localY = 0; localY < 16; localY += 1) {
      const y = originY + localY;
      if (!Number.isInteger(y) || y < 0 || y >= height) continue;
      for (let localX = 0; localX < 16; localX += 1) {
        const x = originX + localX;
        if (!Number.isInteger(x) || x < 0 || x >= width) continue;
        const material = chunk.materials[localY * 16 + localX]!;
        if (material === FOREST_MATERIAL.air) continue;
        const offset = (y * width + x) * 4;
        const worldX = chunk.chunkX * 16 + localX;
        const worldY = chunk.chunkY * 16 + localY;
        const center = (y + halo) * maskWidth + x + halo;
        let top = 0;
        for (let d = 1; d <= halo; d++) {
          const above = mask[center - d * maskWidth]!;
          if (above === FOREST_MATERIAL.air) { top = d; break; }
          if (above !== material) break;
        }
        const exposure = {
          top,
          side: mask[center - 1] === FOREST_MATERIAL.air || mask[center + 1] === FOREST_MATERIAL.air,
          bottom: mask[center + maskWidth] === FOREST_MATERIAL.air,
        };
        const floor = chunk.surfaceY?.[localX];
        const color = floor === undefined ? forestMaterialColor(material, worldX, worldY, exposure)
          : forestBuriedColor(material, worldX, worldY, worldY - floor, exposure);
        target[offset] = color[0];
        target[offset + 1] = color[1];
        target[offset + 2] = color[2];
        target[offset + 3] = material === FOREST_MATERIAL.water ? 214 : 255;
      }
    }
  }
}

export function drawForestOpeningTerrain(
  context: CanvasRenderingContext2D,
  chunks: readonly ForestMaterialChunk[],
  camera: ForestCameraState,
): void {
  if (chunks.length === 0) return;
  let surface = surfaces.get(context);
  if (!surface) {
    const canvas = context.canvas.ownerDocument.createElement("canvas");
    const target = canvas.getContext("2d", { alpha: true });
    if (!target) throw new Error("forest opening terrain surface is unavailable");
    surface = { canvas, context: target, tiles: new Map(), drawn: new Map(), chunks: null, originX: 0, originY: 0, roots: new Map() };
    surfaces.set(context, surface);
  }
  if (surface.chunks !== chunks) {
    let left = chunks[0]!.chunkX;
    let right = left;
    let top = chunks[0]!.chunkY;
    let bottom = top;
    for (const { chunkX, chunkY } of chunks) {
      left = Math.min(left, chunkX);
      right = Math.max(right, chunkX);
      top = Math.min(top, chunkY);
      bottom = Math.max(bottom, chunkY);
    }
    const width = (right - left + 1) * 16;
    const height = (bottom - top + 1) * 16;
    // Water can change each material tick. Keep the backing canvas and upload
    // only dirty tiles; resizing it would clear and upload every static tile.
    if (surface.canvas.width !== width || surface.canvas.height !== height ||
        surface.originX !== left * 16 || surface.originY !== top * 16) {
      surface.canvas.width = width;
      surface.canvas.height = height;
      surface.drawn.clear();
    }
    surface.originX = left * 16;
    surface.originY = top * 16;
    surface.chunks = chunks;
    surface.roots = new Map((chunks.find(c => c.surfaceRoots)?.surfaceRoots ?? []).map(p => [p.x, p.y]));
    const byLocation = new Map(chunks.map((chunk) => [`${chunk.chunkX},${chunk.chunkY}`, chunk]));
    for (const chunk of chunks) {
      // Every sampled edge must be part of the cache key: otherwise excavation
      // or moving water could leave stale highlights at chunk boundaries.
      const neighborhood: ForestMaterialChunk[] = [];
      const digests: string[] = [];
      for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
        const neighbor = byLocation.get(`${chunk.chunkX + dx},${chunk.chunkY + dy}`);
        if (neighbor) neighborhood.push(neighbor);
        digests.push(neighbor?.digest ?? "missing");
      }
      const key = `${chunk.chunkX},${chunk.chunkY}:${digests.join(":")}:${chunk.surfaceY?.join(',') ?? ''}`;
      const location = `${chunk.chunkX},${chunk.chunkY}`;
      if (surface.drawn.get(location) === key) continue;
      let tile = surface.tiles.get(key);
      if (!tile) {
        tile = surface.context.createImageData(16, 16);
        rasterize(neighborhood, chunk.chunkX * 16, chunk.chunkY * 16, 16, 16, tile.data);
        surface.tiles.set(key, tile);
      }
      surface.context.putImageData(tile, (chunk.chunkX - left) * 16, (chunk.chunkY - top) * 16);
      surface.drawn.set(location, key);
    }
    for (const location of surface.drawn.keys()) if (!byLocation.has(location)) {
      const [x,y] = location.split(',').map(Number);
      surface.context.clearRect(x! * 16 - surface.originX, y! * 16 - surface.originY, 16, 16);
      surface.drawn.delete(location);
    }
    while (surface.tiles.size > 2048) surface.tiles.delete(surface.tiles.keys().next().value!);
  }
  drawForestEdgeDressing(context, camera, OPENING_TREE_ROOTS, x => surface.roots.get(x) ?? null);
  context.drawImage(
    surface.canvas,
    Math.round(camera.x) - surface.originX,
    Math.round(camera.y) - surface.originY,
    camera.width,
    camera.height,
    0,
    0,
    camera.width,
    camera.height,
  );
  drawForestGroundCover(context, chunks, camera);
}
