import type { RuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { sha256Canonical, type JsonValue } from "../canonical-json";
import type { Aabb } from "../runtime/geometry";
import type { CameraState } from "../runtime/runtime";
import type { ForestRectPx, ForestRegion } from "./forest-region-generator";

export const FOREST_MATERIAL = Object.freeze({
  air: 0,
  protected_mass: 1,
  soil: 2,
  wet_soil: 3,
  stone: 4,
  wood: 5,
  metal: 6,
  water: 7,
  vegetation: 8,
} as const);

export type ForestMaterial = typeof FOREST_MATERIAL[keyof typeof FOREST_MATERIAL];

export interface ForestMaterialChunk {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly digest: `sha256:${string}`;
  readonly materials: Uint8Array;
}

export interface ForestChunkStreamOptions {
  readonly maxRetainedChunks?: number;
}

const SOLID_MATERIALS: ReadonlySet<ForestMaterial> = new Set([
  FOREST_MATERIAL.protected_mass,
  FOREST_MATERIAL.soil,
  FOREST_MATERIAL.wet_soil,
  FOREST_MATERIAL.stone,
  FOREST_MATERIAL.wood,
  FOREST_MATERIAL.metal,
]);

const EPSILON = 1e-7;

interface ChunkMaterialContext {
  readonly sealedGates: readonly ForestRectPx[];
  readonly clearanceVolumes: readonly ForestRectPx[];
  readonly protectedMasses: readonly Readonly<{ kind: string; boundsPx: ForestRectPx }>[];
  readonly pockets: ForestRegion["pockets"];
}

export class ForestChunkStream {
  readonly chunkWidth = 16 as const;
  readonly chunkHeight = 16 as const;

  private readonly retained = new Map<string, ForestMaterialChunk>();
  private readonly sealedGates: readonly ForestRectPx[];
  private readonly clearanceVolumes: readonly ForestRectPx[];
  private readonly protectedMasses: readonly Readonly<{ kind: string; boundsPx: ForestRectPx }>[];
  private readonly maxRetainedChunks: number;
  private materializedCount = 0;

  public constructor(
    private readonly manifest: RuntimeForestSpatialManifest,
    private readonly region: ForestRegion,
    options: ForestChunkStreamOptions = {},
  ) {
    if (region.seed.trim().length === 0 || region.macroTilePx !== 16) {
      throw new Error("forest chunk stream requires a generated 16px forest region");
    }
    this.sealedGates = Object.freeze(region.terrainPrimitives
      .filter((primitive) => primitive.kind.startsWith("sealed_"))
      .map((primitive) => primitive.boundsPx));
    this.clearanceVolumes = Object.freeze(region.criticalRouteClearances
      .flatMap((clearance) => clearance.volumesPx));
    this.protectedMasses = Object.freeze(region.protectedZones.filter((zone) =>
      zone.kind === "waterwheel_protected_mass" || zone.kind === "settlement_structure"));
    this.maxRetainedChunks = options.maxRetainedChunks ?? 2_048;
    if (!Number.isInteger(this.maxRetainedChunks) || this.maxRetainedChunks <= 0) {
      throw new Error("maxRetainedChunks must be a positive integer");
    }
  }

  public visible(camera: CameraState, marginChunks = 1): readonly ForestMaterialChunk[] {
    if (!isFinitePositiveAabb(camera) || !Number.isInteger(marginChunks) || marginChunks < 0) {
      throw new Error("camera and marginChunks must define a finite visible region");
    }
    const maximumChunkX = this.manifest.regionBoundsPx.width / this.chunkWidth - 1;
    const maximumChunkY = this.manifest.regionBoundsPx.height / this.chunkHeight - 1;
    const left = Math.max(0, Math.floor(camera.x / this.chunkWidth) - marginChunks);
    const right = Math.min(maximumChunkX, Math.ceil((camera.x + camera.width) / this.chunkWidth) - 1 + marginChunks);
    const top = Math.max(0, Math.floor(camera.y / this.chunkHeight) - marginChunks);
    const bottom = Math.min(maximumChunkY, Math.ceil((camera.y + camera.height) / this.chunkHeight) - 1 + marginChunks);
    const chunks: ForestMaterialChunk[] = [];
    if (left > right || top > bottom) return Object.freeze(chunks);
    for (let chunkY = top; chunkY <= bottom; chunkY += 1) {
      for (let chunkX = left; chunkX <= right; chunkX += 1) {
        chunks.push(copyChunk(this.chunkAt(chunkX, chunkY)));
      }
    }
    return Object.freeze(chunks);
  }

  public materialAt(x: number, y: number): ForestMaterial {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !this.inBounds(x, y)) {
      return FOREST_MATERIAL.protected_mass;
    }
    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    const chunkX = Math.floor(pixelX / this.chunkWidth);
    const chunkY = Math.floor(pixelY / this.chunkHeight);
    const localX = pixelX - chunkX * this.chunkWidth;
    const localY = pixelY - chunkY * this.chunkHeight;
    return this.chunkAt(chunkX, chunkY).materials[localY * this.chunkWidth + localX] as ForestMaterial;
  }

  public isSolid(bounds: Aabb): boolean {
    if (!isFinitePositiveAabb(bounds) || !this.boundsInsideRegion(bounds)) return true;
    const left = Math.floor(bounds.x);
    const right = Math.floor(bounds.x + bounds.width - EPSILON);
    const top = Math.floor(bounds.y);
    const bottom = Math.floor(bounds.y + bounds.height - EPSILON);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (SOLID_MATERIALS.has(this.materialForPixel(x, y))) return true;
      }
    }
    return false;
  }

  public cacheStats(): Readonly<{ materialized: number; retained: number }> {
    return Object.freeze({ materialized: this.materializedCount, retained: this.retained.size });
  }

  private chunkAt(chunkX: number, chunkY: number): ForestMaterialChunk {
    const key = `${chunkX},${chunkY}`;
    const cached = this.retained.get(key);
    if (cached) {
      this.retained.delete(key);
      this.retained.set(key, cached);
      return cached;
    }
    const materials = new Uint8Array(this.chunkWidth * this.chunkHeight);
    const originX = chunkX * this.chunkWidth;
    const originY = chunkY * this.chunkHeight;
    const chunkBounds = { x: originX, y: originY, width: this.chunkWidth, height: this.chunkHeight };
    const context: ChunkMaterialContext = {
      sealedGates: this.sealedGates.filter((bounds) => overlaps(bounds, chunkBounds)),
      clearanceVolumes: this.clearanceVolumes.filter((bounds) => overlaps(bounds, chunkBounds)),
      protectedMasses: this.protectedMasses.filter((zone) => overlaps(zone.boundsPx, chunkBounds)),
      pockets: this.region.pockets.filter((pocket) => overlaps(pocket.boundsPx, chunkBounds)),
    };
    for (let localY = 0; localY < this.chunkHeight; localY += 1) {
      for (let localX = 0; localX < this.chunkWidth; localX += 1) {
        materials[localY * this.chunkWidth + localX] = this.materialForPixel(
          originX + localX,
          originY + localY,
          context,
        );
      }
    }
    const chunk = Object.freeze({
      chunkX,
      chunkY,
      digest: sha256Canonical([...materials] as JsonValue),
      materials,
    });
    this.materializedCount += 1;
    this.retained.set(key, chunk);
    while (this.retained.size > this.maxRetainedChunks) {
      this.retained.delete(this.retained.keys().next().value as string);
    }
    return chunk;
  }

  private materialForPixel(x: number, y: number, context?: ChunkMaterialContext): ForestMaterial {
    if (!this.inBounds(x, y)) return FOREST_MATERIAL.protected_mass;

    const sealedGate = (context?.sealedGates ?? this.sealedGates).find((bounds) => contains(bounds, x, y));
    if (sealedGate) return FOREST_MATERIAL.protected_mass;

    const inClearance = (context?.clearanceVolumes ?? this.clearanceVolumes)
      .some((volume) => contains(volume, x, y));
    const protectedMass = (context?.protectedMasses ?? this.protectedMasses)
      .find((zone) => contains(zone.boundsPx, x, y));
    if (protectedMass && !inClearance) return protectedMass.kind === "settlement_structure"
      ? FOREST_MATERIAL.wood
      : FOREST_MATERIAL.protected_mass;

    if (this.isWaterPixel(x, y)) return FOREST_MATERIAL.water;

    const meadow = this.region.meadowSurfaces.find((surface) =>
      x >= surface.left && x < surface.right && y >= surface.y);
    if (meadow) return y < meadow.y + 12 ? FOREST_MATERIAL.soil : FOREST_MATERIAL.stone;

    if (inClearance) return FOREST_MATERIAL.air;

    const pocket = (context?.pockets ?? this.region.pockets)
      .find((candidate) => contains(candidate.boundsPx, x, y));
    if (pocket) {
      if (pocket.kind === "root") return FOREST_MATERIAL.wood;
      if (pocket.kind === "loose_material") return FOREST_MATERIAL.wet_soil;
      if (pocket.kind === "resource_candidate") return FOREST_MATERIAL.metal;
      return FOREST_MATERIAL.stone;
    }

    return FOREST_MATERIAL.stone;
  }

  private isWaterPixel(x: number, y: number): boolean {
    const points = this.manifest.waterCourseControlPointsPx;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const left = Math.min(from[0], to[0]);
      const right = Math.max(from[0], to[0]);
      if (x < left || x > right) continue;
      const t = from[0] === to[0] ? 0 : (x - from[0]) / (to[0] - from[0]);
      const surfaceY = from[1] + (to[1] - from[1]) * t;
      return y >= Math.floor(surfaceY) && y < Math.floor(surfaceY) + 12;
    }
    return false;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.manifest.regionBoundsPx.width && y < this.manifest.regionBoundsPx.height;
  }

  private boundsInsideRegion(bounds: Aabb): boolean {
    return bounds.x >= 0 && bounds.y >= 0 &&
      bounds.x + bounds.width <= this.manifest.regionBoundsPx.width &&
      bounds.y + bounds.height <= this.manifest.regionBoundsPx.height;
  }
}

function contains(rect: ForestRectPx, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

function copyChunk(chunk: ForestMaterialChunk): ForestMaterialChunk {
  return Object.freeze({
    chunkX: chunk.chunkX,
    chunkY: chunk.chunkY,
    digest: chunk.digest,
    materials: chunk.materials.slice(),
  });
}

function overlaps(left: ForestRectPx, right: ForestRectPx): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width &&
    left.y < right.y + right.height && right.y < left.y + left.height;
}

function isFinitePositiveAabb(bounds: Aabb): boolean {
  return Number.isFinite(bounds.x) && Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) && Number.isFinite(bounds.height) &&
    bounds.width > 0 && bounds.height > 0;
}
