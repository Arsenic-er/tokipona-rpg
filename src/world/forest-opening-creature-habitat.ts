import type { RuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import type { Vec2 } from "../runtime/geometry";
import type { ForestChunkStream } from "./forest-chunk-stream";
import type { ForestOpeningEcologyPlacement } from "./forest-opening-ecology";

const RABBIT_BODY = Object.freeze({ width: 8, height: 12 });
const BIRD_BODY = Object.freeze({ width: 10, height: 8 });

export function createForestOpeningCreaturePlacement(
  manifest: RuntimeForestSpatialManifest,
  terrain: ForestChunkStream,
): ForestOpeningEcologyPlacement {
  return Object.freeze({
    rabbitGround: createPlacer(manifest, terrain, RABBIT_BODY, true),
    birdGround: createPlacer(manifest, terrain, BIRD_BODY, true),
    birdFlight: createPlacer(manifest, terrain, BIRD_BODY, false),
  });
}

function createPlacer(
  manifest: RuntimeForestSpatialManifest,
  terrain: ForestChunkStream,
  body: Readonly<{ width: number; height: number }>,
  requireSupport: boolean,
): (desired: Vec2) => Vec2 {
  const cache = new Map<string, Vec2>();
  let lastValid: Vec2 | null = null;
  return (desired: Vec2): Vec2 => {
    const key = `${Math.round(desired.x)},${Math.round(desired.y)}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      lastValid = cached;
      return cached;
    }
    const needsBroadSearch = lastValid === null ||
      Math.hypot(desired.x - lastValid.x, desired.y - lastValid.y) > 64;
    const resolved = findNearbyAnchor(
      manifest,
      terrain,
      desired,
      body,
      requireSupport,
      needsBroadSearch ? 256 : 16,
      needsBroadSearch ? (requireSupport ? 32 : 8) : 4,
    );
    if (resolved === null && lastValid === null) {
      throw new Error("forest opening creature has no terrain-valid habitat anchor");
    }
    const result = resolved ?? lastValid!;
    cache.set(key, result);
    lastValid = result;
    return result;
  };
}

function findNearbyAnchor(
  manifest: RuntimeForestSpatialManifest,
  terrain: ForestChunkStream,
  desired: Vec2,
  body: Readonly<{ width: number; height: number }>,
  requireSupport: boolean,
  maximumDistance: number,
  maximumHorizontalSearch: number,
): Vec2 | null {
  const minimumY = body.height;
  const maximumY = manifest.regionBoundsPx.height - 1;
  const preferredY = Math.max(minimumY, Math.min(maximumY, Math.round(desired.y)));
  const preferredX = Math.round(Math.max(body.width / 2, Math.min(
    manifest.regionBoundsPx.width - body.width / 2,
    desired.x,
  )));
  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    for (let horizontalDistance = 0;
      horizontalDistance <= Math.min(maximumHorizontalSearch, distance);
      horizontalDistance += 1) {
      const verticalDistance = distance - horizontalDistance;
      for (const x of horizontalDistance === 0
        ? [preferredX]
        : [preferredX - horizontalDistance, preferredX + horizontalDistance]) {
        if (x < body.width / 2 || x > manifest.regionBoundsPx.width - body.width / 2) continue;
        for (const y of verticalDistance === 0
          ? [preferredY]
          : [preferredY - verticalDistance, preferredY + verticalDistance]) {
          if (y < minimumY || y > maximumY) continue;
          const bodyBounds = { x: x - body.width / 2, y: y - body.height, ...body };
          if (terrain.isSolid(bodyBounds)) continue;
          if (requireSupport && !terrain.isSolid({ x: x - body.width / 2 + 1, y, width: body.width - 2, height: 1 })) {
            continue;
          }
          return Object.freeze({ x, y });
        }
      }
    }
  }
  return null;
}
