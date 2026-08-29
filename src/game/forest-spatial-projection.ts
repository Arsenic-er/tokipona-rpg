import {
  isVerifiedRuntimeForestSpatialManifest,
  type RuntimeForestSpatialManifest,
} from "../content/runtime-forest-spatial-manifest";
import type { Vec2 } from "../runtime/geometry";
import type { ForestGrayboxSnapshot } from "../world/forest-graybox-runtime";
import {
  generateForestRegion,
  type ForestRectPx,
  type ForestRegion,
} from "../world/forest-region-generator";

export const FOREST_NEARBY_ANCHOR_DISTANCE_PX = 320 as const;

export interface ForestSpatialLocation {
  readonly districtId: string;
  readonly sceneId: string;
  readonly position: Vec2;
  readonly tick: number;
  readonly nearbyAnchorIds: readonly string[];
}

export class ForestSpatialProjectionError extends Error {
  public constructor(public readonly reason: string) {
    super(`Forest spatial projection failed: ${reason}`);
    this.name = "ForestSpatialProjectionError";
  }
}

let cachedRegion: Readonly<{
  manifest: RuntimeForestSpatialManifest;
  seed: string;
  region: ForestRegion;
}> | null = null;

/** Projects read-only location facts from a graybox snapshot. */
export function projectForestSpatialLocation(
  manifest: RuntimeForestSpatialManifest,
  runtime: ForestGrayboxSnapshot,
): ForestSpatialLocation {
  if (!isVerifiedRuntimeForestSpatialManifest(manifest)) {
    throw new ForestSpatialProjectionError("reader-verified manifest required");
  }
  validateRuntimeFacts(runtime);
  const region = regionFor(manifest, runtime.seed);
  if (region.seed !== runtime.seed || region.topologyDigest !== runtime.topologyDigest) {
    throw new ForestSpatialProjectionError("runtime topology does not match generated region");
  }

  const position = runtime.player.position;
  const allClearanceVolumes = region.criticalRouteClearances.flatMap((clearance) => clearance.volumesPx);
  if (!allClearanceVolumes.some((volume) => containsInclusive(volume, position))) {
    throw new ForestSpatialProjectionError("position is outside traversable authored route clearance");
  }

  const directDistricts = manifest.districts.filter((district) =>
    containsInclusive(district.boundsPx, position));
  if (directDistricts.length > 1) {
    throw new ForestSpatialProjectionError("position belongs to multiple authored districts");
  }

  const corridorHits = region.routeCorridors
    .filter((corridor) => corridor.clearanceVolumesPx.some((volume) => containsInclusive(volume, position)))
    .map((corridor) => {
      const [from, to] = corridor.pointsPx;
      return { corridor, distanceSquared: squaredDistanceToSegment(position, from!, to!) };
    });
  const closestDistance = Math.min(...corridorHits.map((hit) => hit.distanceSquared));
  const corridorDistrictIds = new Set<string>();
  for (const { corridor, distanceSquared } of corridorHits) {
    if (Math.abs(distanceSquared - closestDistance) > 1e-7) continue;
    const [from, to] = corridor.pointsPx;
    const t = projectedRouteProgress(position, from!, to!);
    corridorDistrictIds.add(t < 0.5 ? corridor.fromDistrictId : corridor.toDistrictId);
  }
  if (corridorDistrictIds.size > 1) {
    throw new ForestSpatialProjectionError("position resolves to multiple route-corridor districts");
  }

  const districtId = corridorDistrictIds.values().next().value ?? directDistricts[0]?.districtId;
  if (typeof districtId !== "string") {
    throw new ForestSpatialProjectionError("position does not resolve to an authored district");
  }
  const district = manifest.districts.find((candidate) => candidate.districtId === districtId);
  if (!district) throw new ForestSpatialProjectionError("route-corridor district is not authored");

  const nearbyAnchorIds = manifest.anchors
    .filter((anchor) => squaredDistance(position, {
      x: anchor.positionPx[0],
      y: anchor.positionPx[1],
    }) <= FOREST_NEARBY_ANCHOR_DISTANCE_PX ** 2)
    .map((anchor) => anchor.anchorId);

  return Object.freeze({
    districtId,
    sceneId: district.sceneId,
    position: Object.freeze({ ...position }),
    tick: runtime.tick,
    nearbyAnchorIds: Object.freeze(nearbyAnchorIds),
  });
}

function regionFor(manifest: RuntimeForestSpatialManifest, seed: string): ForestRegion {
  if (cachedRegion?.manifest === manifest && cachedRegion.seed === seed) return cachedRegion.region;
  const region = generateForestRegion(manifest, seed);
  cachedRegion = Object.freeze({ manifest, seed, region });
  return region;
}

function validateRuntimeFacts(runtime: ForestGrayboxSnapshot): void {
  if (typeof runtime.seed !== "string" || runtime.seed.trim().length === 0 ||
      !/^sha256:[0-9a-f]{64}$/.test(runtime.topologyDigest) ||
      !Number.isSafeInteger(runtime.tick) || runtime.tick < 0 ||
      !Number.isFinite(runtime.player.position.x) || !Number.isFinite(runtime.player.position.y) ||
      !Number.isFinite(runtime.player.body.width) || !Number.isFinite(runtime.player.body.height) ||
      runtime.player.body.width <= 0 || runtime.player.body.height <= 0) {
    throw new ForestSpatialProjectionError("runtime facts are invalid");
  }
}

function projectedRouteProgress(
  point: Vec2,
  from: Vec2,
  to: Vec2,
): number {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) throw new ForestSpatialProjectionError("route corridor has zero length");
  const t = ((point.x - from.x) * deltaX + (point.y - from.y) * deltaY) / lengthSquared;
  return Math.max(0, Math.min(1, t));
}

function squaredDistance(left: Vec2, right: Vec2): number {
  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function squaredDistanceToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  const t = projectedRouteProgress(point, from, to);
  return squaredDistance(point, {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  });
}

function containsInclusive(rect: ForestRectPx, point: Vec2): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
}
