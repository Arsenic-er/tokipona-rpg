import type { RuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { sha256Canonical, type JsonValue } from "../canonical-json";
import type { Aabb } from "../runtime/geometry";
import type { CameraState } from "../runtime/runtime";
import type { ForestRectPx, ForestRegion } from "./forest-region-generator";
import { woodlandOpeningHeights, woodlandOpeningSoilDepth, WOODLAND_EDGE_ROOTS, type ForestSurfaceProfile } from './forest-surface-profile';

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
  ember: 9,
  ash: 10,
} as const);

export type ForestMaterial = typeof FOREST_MATERIAL[keyof typeof FOREST_MATERIAL];

export interface ForestMaterialChunk {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly digest: `sha256:${string}`;
  readonly materials: Uint8Array;
  /** World-space surface per column, used only for depth shading and rooted background dressing. */
  readonly surfaceY?: readonly number[];
  readonly surfaceRoots?: readonly Readonly<{ x: number; y: number }>[];
}

export interface ForestChunkStreamOptions {
  readonly maxRetainedChunks?: number;
  /** Open the authored arrival/stream route to the sky; other districts stay unchanged. */
  readonly openingSurface?: boolean;
  readonly surfaceProfile?: ForestSurfaceProfile;
  readonly materialOverlay?: ForestMaterialOverlay;
}

export interface ForestMaterialOverlay {
  readonly bounds: Aabb;
  readonly revision: number;
  readonly solidRevision: number;
  readonly retireStaticWater?: boolean;
  playerImmersion?(bounds: Aabb): number;
  affectsChunk?(bounds: Aabb): boolean;
  materialAt(x: number, y: number): ForestMaterial | null;
}

const SOLID_MATERIALS: ReadonlySet<ForestMaterial> = new Set([
  FOREST_MATERIAL.protected_mass,
  FOREST_MATERIAL.soil,
  FOREST_MATERIAL.wet_soil,
  FOREST_MATERIAL.stone,
  FOREST_MATERIAL.wood,
  FOREST_MATERIAL.metal,
  FOREST_MATERIAL.ember,
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
  private lastChunk: ForestMaterialChunk | null = null;
  private readonly sealedGates: readonly ForestRectPx[];
  private readonly clearanceVolumes: readonly ForestRectPx[];
  private readonly protectedMasses: readonly Readonly<{ kind: string; boundsPx: ForestRectPx }>[];
  private readonly maxRetainedChunks: number;
  private materializedCount = 0;
  private readonly openingSurface: boolean;
  private readonly surfaceProfile?: ForestSurfaceProfile;
  private readonly openingHeights = new Int16Array(2496);
  private readonly surfaceRoots: readonly Readonly<{ x: number; y: number }>[];
  private readonly overlay?: ForestMaterialOverlay;

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
    this.openingSurface = options.openingSurface === true;
    this.surfaceProfile = options.surfaceProfile;
    if (this.surfaceProfile !== undefined && this.surfaceProfile !== 'woodland-v2') throw new Error('unknown forest surface profile');
    this.overlay = options.materialOverlay;
    const openingFloors = region.routeCorridors
      .filter(({ edgeId }) => edgeId === "arrival.stream" || edgeId === "stream.settlement")
      .flatMap(({ clearanceVolumesPx }) => clearanceVolumesPx);
    if (this.openingSurface) for (let x = 0; x < this.openingHeights.length; x += 1) {
      let floor = openingFloors[0]!.y + openingFloors[0]!.height;
      for (const volume of openingFloors) {
        if (x >= volume.x && x < volume.x + volume.width) floor = Math.max(floor, volume.y + volume.height);
      }
      this.openingHeights[x] = floor;
    }
    if (this.openingSurface) {
      const terraces = this.openingHeights.slice();
      for (let x = 0; x < this.openingHeights.length; x += 1) {
        // Erode the upper corner of descending shelves, never fill old free
        // route cells. Leave the existing quest-obstacle contact band untouched.
        if (x >= 1720) continue;
        let slope = terraces[x]!;
        for (let ahead = 1; ahead <= 28 && x + ahead < terraces.length; ahead += 1) {
          const drop = terraces[x + ahead]! - terraces[x]!;
          if (drop > 0) slope = Math.max(slope, terraces[x]! + Math.floor(drop * (1 - ahead / 29)));
        }
        this.openingHeights[x] = slope + Math.round(1 + Math.sin(x / 17) * 0.6 + Math.sin(x / 5) * 0.4);
      }
    }
    if (this.openingSurface && this.surfaceProfile) this.openingHeights.set(woodlandOpeningHeights(this.openingHeights));
    this.surfaceRoots = Object.freeze(WOODLAND_EDGE_ROOTS.map(x => Object.freeze({ x, y: this.openingHeights[x]! })));
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
        chunks.push(this.overlayChunk(this.chunkAt(chunkX, chunkY)));
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
    const dynamic = this.overlay?.materialAt(pixelX, pixelY);
    if (dynamic !== null && dynamic !== undefined) return dynamic;
    return this.baseMaterialAt(pixelX,pixelY);
  }

  public baseMaterialAt(x:number,y:number): ForestMaterial {
    if(!Number.isFinite(x) || !Number.isFinite(y) || !this.inBounds(x,y)) return FOREST_MATERIAL.protected_mass;
    const pixelX=Math.floor(x), pixelY=Math.floor(y);
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
    if (this.overlay && overlaps(bounds, this.overlay.bounds)) {
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        if (SOLID_MATERIALS.has(this.materialAt(x, y))) return true;
      }
      return false;
    }
    // Collision and visuals read the very same retained material bytes. Avoid
    // regenerating route geology for every probe in the contact solver.
    for (let cy = Math.floor(top / 16); cy <= Math.floor(bottom / 16); cy += 1) {
      for (let cx = Math.floor(left / 16); cx <= Math.floor(right / 16); cx += 1) {
        const materials = this.chunkAt(cx, cy).materials;
        for (let y = Math.max(top, cy * 16); y <= Math.min(bottom, cy * 16 + 15); y += 1) {
          for (let x = Math.max(left, cx * 16); x <= Math.min(right, cx * 16 + 15); x += 1) {
            if (SOLID_MATERIALS.has(materials[(y - cy * 16) * 16 + x - cx * 16] as ForestMaterial)) return true;
          }
        }
      }
    }
    return false;
  }

  public cacheStats(): Readonly<{ materialized: number; retained: number }> {
    return Object.freeze({ materialized: this.materializedCount, retained: this.retained.size });
  }

  public get dynamicRevision(): number { return this.overlay?.revision ?? 0; }
  public playerImmersion(bounds: Aabb): number { return this.overlay?.playerImmersion?.(bounds) ?? 0; }
  public get solidRevision(): number { return this.overlay?.solidRevision ?? 0; }
  public visibleRevision(camera: Aabb): number {
    return this.overlay && overlaps(camera, this.overlay.bounds) ? this.dynamicRevision : 0;
  }

  public hasDynamicRecovery(bounds: Aabb): boolean {
    return !!this.overlay && bounds.x >= this.overlay.bounds.x &&
      bounds.x + bounds.width <= this.overlay.bounds.x + this.overlay.bounds.width &&
      bounds.y >= this.overlay.bounds.y - 160 &&
      bounds.y + bounds.height <= this.overlay.bounds.y + this.overlay.bounds.height && !this.isSolid(bounds);
  }

  private overlayChunk(chunk: ForestMaterialChunk): ForestMaterialChunk {
    const bounds = { x: chunk.chunkX * 16, y: chunk.chunkY * 16, width: 16, height: 16 };
    if (!this.overlay || !overlaps(bounds, this.overlay.bounds) || this.overlay.affectsChunk?.(bounds) === false) return copyChunk(chunk);
    const materials = chunk.materials.slice();
    let changed = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const value = this.overlay.materialAt(bounds.x + x, bounds.y + y);
      if (value !== null && value !== materials[y * 16 + x]) { materials[y * 16 + x] = value; changed = true; }
    }
    if (!changed) return copyChunk(chunk);
    return Object.freeze({ ...chunk, materials, digest: sha256Canonical([...materials] as JsonValue) });
  }

  /** Shared by geology and recovery validation, not a separate visual floor. */
  public openingSurfaceY(x: number): number | null {
    if (!this.openingSurface || x < 0 || x >= 2496) return null;
    return this.openingHeights[Math.floor(x)]!;
  }

  public hasOpeningSurfaceRecovery(bounds: Aabb): boolean {
    const left = this.openingSurfaceY(bounds.x);
    const right = this.openingSurfaceY(bounds.x + bounds.width - EPSILON);
    return left !== null && right !== null && bounds.y >= Math.min(left, right) - 160 &&
      bounds.y + bounds.height <= Math.max(left, right) + EPSILON && !this.isSolid(bounds);
  }

  private chunkAt(chunkX: number, chunkY: number): ForestMaterialChunk {
    // Adjacent pixel probes commonly hit one chunk hundreds of times. It is
    // already most-recently-used; do not churn the LRU map for every pixel.
    if (this.lastChunk?.chunkX === chunkX && this.lastChunk.chunkY === chunkY) return this.lastChunk;
    const key = `${chunkX},${chunkY}`;
    const cached = this.retained.get(key);
    if (cached) {
      this.retained.delete(key);
      this.retained.set(key, cached);
      this.lastChunk = cached;
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
      ...(this.openingSurface && originX < 2496 ? { surfaceY: Object.freeze(Array.from({ length: 16 }, (_, x) => this.openingHeights[originX + x]!)), surfaceRoots: this.surfaceRoots } : {}),
    });
    this.materializedCount += 1;
    this.retained.set(key, chunk);
    this.lastChunk = chunk;
    while (this.retained.size > this.maxRetainedChunks) {
      this.retained.delete(this.retained.keys().next().value as string);
    }
    return chunk;
  }

  private materialForPixel(x: number, y: number, context?: ChunkMaterialContext): ForestMaterial {
    if (!this.inBounds(x, y)) return FOREST_MATERIAL.protected_mass;

    const sealedGate = (context?.sealedGates ?? this.sealedGates).find((bounds) => contains(bounds, x, y));
    if (sealedGate) return FOREST_MATERIAL.protected_mass;

    const protectedMass = (context?.protectedMasses ?? this.protectedMasses)
      .find((zone) => contains(zone.boundsPx, x, y));
    const surfaceY = this.openingSurfaceY(x);
    if (surfaceY !== null && !protectedMass && y < surfaceY) return FOREST_MATERIAL.air;
    const inClearance = (context?.clearanceVolumes ?? this.clearanceVolumes)
      .some((volume) => contains(volume, x, y));
    if (protectedMass && !inClearance) return protectedMass.kind === "settlement_structure"
      ? FOREST_MATERIAL.wood
      : FOREST_MATERIAL.protected_mass;

    if (surfaceY !== null) {
      // Only remove the old corridor ceiling. Existing free cells, floors and
      // story anchors remain valid, so previous opening saves do not need a reset.
      if (y < surfaceY) return FOREST_MATERIAL.air;
      if(this.overlay?.retireStaticWater && embeddedOpeningRoot(x,y,surfaceY)) return FOREST_MATERIAL.wood;
      if (y < surfaceY + (this.surfaceProfile && x < 1712 ? woodlandOpeningSoilDepth(x) : 9)) return FOREST_MATERIAL.soil;
      // This version owns a continuous surface; the old corridor voids must not
      // reappear below it. The separately simulated creek still overlays these bytes.
      if (this.surfaceProfile && x < 1712) return FOREST_MATERIAL.stone;
    }

    if (this.isWaterPixel(x, y) && !(this.openingSurface && this.overlay?.retireStaticWater && x<2496)) return FOREST_MATERIAL.water;

    const meadow = this.region.meadowSurfaces.find((surface) =>
      x >= surface.left && x < surface.right);

    if (inClearance) return FOREST_MATERIAL.air;

    if (meadow) {
      if (y < meadow.y) return FOREST_MATERIAL.air;
      return y < meadow.y + 12 ? FOREST_MATERIAL.soil : FOREST_MATERIAL.stone;
    }

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

/** Roots follow authored banks beneath the contact surface, never add floating platforms. */
function embeddedOpeningRoot(x:number,y:number,surface:number):boolean {
  const depth=y-surface;
  if(depth<3 || depth>58) return false;
  for(const anchor of [1376,1696,2000]) {
    const dx=x-anchor, reach=Math.abs(dx);
    if(reach>112) continue;
    const center=7+reach*0.25+Math.sin(dx/19)*3;
    const thickness=Math.max(1,5-reach/26);
    if(Math.abs(depth-center)<thickness) return true;
    if(reach<72 && Math.abs(depth-(center+reach*0.32+4))<1.5) return true;
  }
  return false;
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
    ...(chunk.surfaceY ? { surfaceY: chunk.surfaceY } : {}),
    ...(chunk.surfaceRoots ? { surfaceRoots: chunk.surfaceRoots } : {}),
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
