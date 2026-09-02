import type { ForestCameraState } from "../runtime/forest-camera";
import { FOREST_MATERIAL, type ForestMaterialChunk } from "../world/forest-chunk-stream";

const WIDTH = 640;
const HEIGHT = 360;
const surfaces = new WeakMap<object, {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData | null;
  chunks: readonly ForestMaterialChunk[] | null;
  originX: number;
  originY: number;
}>();
const COLORS: Readonly<Record<number, readonly [number, number, number, number]>> = Object.freeze({
  [FOREST_MATERIAL.air]: [0, 0, 0, 0],
  [FOREST_MATERIAL.protected_mass]: [25, 31, 29, 255],
  [FOREST_MATERIAL.soil]: [63, 61, 40, 255],
  [FOREST_MATERIAL.wet_soil]: [38, 52, 47, 255],
  [FOREST_MATERIAL.stone]: [31, 39, 37, 255],
  [FOREST_MATERIAL.wood]: [70, 55, 36, 255],
  [FOREST_MATERIAL.metal]: [80, 87, 77, 255],
  [FOREST_MATERIAL.water]: [35, 82, 88, 214],
  [FOREST_MATERIAL.vegetation]: [73, 91, 61, 255],
});

export function rasterizeForestOpeningTerrain(
  chunks: readonly ForestMaterialChunk[],
  camera: ForestCameraState,
  target = new Uint8ClampedArray(WIDTH * HEIGHT * 4),
): Uint8ClampedArray {
  if (target.length !== WIDTH * HEIGHT * 4) throw new Error("forest opening terrain buffer must be exact 640x360 RGBA");
  rasterize(chunks, camera.x, camera.y, WIDTH, HEIGHT, target);
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
  for (const chunk of chunks) {
    const originX = chunk.chunkX * 16 - cameraX;
    const originY = chunk.chunkY * 16 - cameraY;
    for (let localY = 0; localY < 16; localY += 1) {
      const y = originY + localY;
      if (!Number.isInteger(y) || y < 0 || y >= height) continue;
      for (let localX = 0; localX < 16; localX += 1) {
        const x = originX + localX;
        if (!Number.isInteger(x) || x < 0 || x >= width) continue;
        const color = COLORS[chunk.materials[localY * 16 + localX]!];
        if (!color || color[3] === 0) continue;
        const offset = (y * width + x) * 4;
        target[offset] = color[0];
        target[offset + 1] = color[1];
        target[offset + 2] = color[2];
        target[offset + 3] = color[3];
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
    surface = { canvas, context: target, image: null, chunks: null, originX: 0, originY: 0 };
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
    surface.canvas.width = width;
    surface.canvas.height = height;
    surface.image = surface.context.createImageData(width, height);
    surface.originX = left * 16;
    surface.originY = top * 16;
    surface.chunks = chunks;
    rasterize(chunks, surface.originX, surface.originY, width, height, surface.image.data);
    surface.context.putImageData(surface.image, 0, 0);
  }
  context.drawImage(
    surface.canvas,
    camera.x - surface.originX,
    camera.y - surface.originY,
    WIDTH,
    HEIGHT,
    0,
    0,
    WIDTH,
    HEIGHT,
  );
}
