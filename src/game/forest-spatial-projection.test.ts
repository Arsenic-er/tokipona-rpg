import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { ForestGrayboxRuntime } from "../world/forest-graybox-runtime";
import { ForestChunkStream } from "../world/forest-chunk-stream";
import { generateForestRegion } from "../world/forest-region-generator";
import {
  FOREST_NEARBY_ANCHOR_DISTANCE_PX,
  ForestSpatialProjectionError,
  projectForestSpatialLocation,
} from "./forest-spatial-projection";

const manifest = readRuntimeForestSpatialManifest(generated);
const seed = "forest.spatial-projection.test";
const region = generateForestRegion(manifest, seed);
const stream = new ForestChunkStream(manifest, region);

function snapshotAt(position: Readonly<{ x: number; y: number }>) {
  return new ForestGrayboxRuntime({ manifest, region, initialPosition: position }).snapshot();
}

const authoritativeIsSolid = (bounds: Parameters<ForestChunkStream["isSolid"]>[0]) =>
  stream.isSolid(bounds);

describe("forest spatial projection", () => {
  it.each([
    ["forest.arrival", "scene.valley.arrival_shelf"],
    ["forest.stream", "scene.valley.stream_section"],
    ["forest.settlement", "scene.valley.settlement"],
    ["forest.hermit_branch", "scene.valley.stream_section"],
    ["forest.waterwheel", "scene.valley.waterwheel"],
  ] as const)("maps the authored %s anchor to its existing scene", (anchorId, sceneId) => {
    const anchor = manifest.anchors.find((candidate) => candidate.anchorId === anchorId)!;
    const runtime = snapshotAt({ x: anchor.positionPx[0], y: anchor.positionPx[1] - 6 });

    expect(projectForestSpatialLocation(manifest, runtime, authoritativeIsSolid)).toEqual({
      districtId: anchorId,
      sceneId,
      position: runtime.player.position,
      tick: runtime.tick,
      nearbyAnchorIds: [anchorId],
    });
  });

  it("assigns corridor ownership to the source before midpoint and target at midpoint", () => {
    const corridor = region.routeCorridors.find((candidate) => candidate.edgeId === "settlement.hermit")!;
    const [from, to] = corridor.pointsPx;
    const at = (t: number) => snapshotAt({
      x: from!.x + (to!.x - from!.x) * t + 2,
      y: from!.y + (to!.y - from!.y) * t - 6,
    });

    expect(projectForestSpatialLocation(manifest, at(0.49), authoritativeIsSolid).districtId)
      .toBe("forest.settlement");
    expect(projectForestSpatialLocation(manifest, at(0.5), authoritativeIsSolid).districtId)
      .toBe("forest.hermit_branch");
  });

  it("rejects a corridor position whose complete 12×14 body intersects solid material", () => {
    const corridor = region.routeCorridors.find((candidate) => candidate.edgeId === "arrival.stream")!;
    const volume = corridor.clearanceVolumesPx[0]!;
    const position = { x: volume.x, y: volume.y + volume.height - 1 };
    const runtime = snapshotAt(position);

    expect(stream.isSolid({ ...position, width: 12, height: 14 })).toBe(true);
    expect(() => projectForestSpatialLocation(manifest, runtime, authoritativeIsSolid))
      .toThrow(/solid material/);
  });

  it("accepts valid complete 12×14 bodies on a route corridor and in meadow air", () => {
    const corridorRuntime = snapshotAt({ x: 512, y: 480 });
    const meadowRuntime = snapshotAt({ x: 3_744, y: 690 });

    expect(stream.isSolid({ ...corridorRuntime.player.position, width: 12, height: 14 })).toBe(false);
    expect(stream.isSolid({ ...meadowRuntime.player.position, width: 12, height: 14 })).toBe(false);
    expect(projectForestSpatialLocation(manifest, corridorRuntime, authoritativeIsSolid).districtId)
      .toBe("forest.arrival");
    expect(projectForestSpatialLocation(manifest, meadowRuntime, authoritativeIsSolid).districtId)
      .toBe("forest.settlement");
  });

  it.each([
    { width: 11, height: 14 },
    { width: 13, height: 14 },
    { width: 12, height: 13 },
    { width: 12, height: 15 },
  ])("rejects non-authoritative $width×$height collision bodies", (body) => {
    const runtime = snapshotAt({ x: 512, y: 480 });
    const changed = {
      ...runtime,
      player: { ...runtime.player, body },
    };

    expect(() => projectForestSpatialLocation(manifest, changed, authoritativeIsSolid))
      .toThrow(/12×14/);
  });

  it("projects collision-safe authored meadow space beyond the narrow route clearance", () => {
    const runtime = snapshotAt({ x: 3_744, y: 690 });

    expect(projectForestSpatialLocation(manifest, runtime, (bounds) => stream.isSolid(bounds))).toMatchObject({
      districtId: "forest.settlement",
      sceneId: "scene.valley.settlement",
      position: runtime.player.position,
    });
  });

  it("fails closed at an overlapping boundary, solid meadow floor, and non-traversable unresolved space", () => {
    expect(() => projectForestSpatialLocation(
      manifest,
      snapshotAt({ x: 1_280, y: 620 }),
      authoritativeIsSolid,
    ))
      .toThrow(ForestSpatialProjectionError);
    expect(() => projectForestSpatialLocation(
      manifest,
      snapshotAt({ x: 3_744, y: 704 }),
      (bounds) => stream.isSolid(bounds),
    ))
      .toThrow(ForestSpatialProjectionError);
    expect(() => projectForestSpatialLocation(
      manifest,
      snapshotAt({ x: 100, y: 100 }),
      authoritativeIsSolid,
    ))
      .toThrow(ForestSpatialProjectionError);
  });

  it("derives nearby anchors from authored positions at one fixed distance and rejects injected facts", () => {
    const runtime = snapshotAt({ x: 512, y: 480 });
    const location = projectForestSpatialLocation(manifest, runtime, authoritativeIsSolid);

    expect(FOREST_NEARBY_ANCHOR_DISTANCE_PX).toBe(320);
    expect(location.nearbyAnchorIds).toEqual(["forest.arrival"]);
    for (const field of [
      "nearbyAnchorIds",
      "flags",
      "learning",
      "mp",
      "inventory",
      "damage",
      "prices",
      "receipts",
      "mutation",
      "unknown",
    ] as const) {
      const poisonedRuntime = Object.freeze({ ...runtime, [field]: "caller.injected" });
      expect(() => projectForestSpatialLocation(
        manifest,
        poisonedRuntime,
        authoritativeIsSolid,
      ), field)
        .toThrow(/unknown runtime fields/);
    }
  });

  it("returns only immutable spatial facts and no domain or mutation surface", () => {
    const location = projectForestSpatialLocation(
      manifest,
      snapshotAt({ x: 512, y: 480 }),
      authoritativeIsSolid,
    );

    expect(Object.keys(location)).toEqual([
      "districtId",
      "sceneId",
      "position",
      "tick",
      "nearbyAnchorIds",
    ]);
    expect(Object.keys(location)).not.toEqual(expect.arrayContaining([
      "flags", "learning", "mp", "inventory", "damage", "prices", "receipts", "mutation",
    ]));
    expect(Object.isFrozen(location)).toBe(true);
    expect(Object.isFrozen(location.position)).toBe(true);
    expect(Object.isFrozen(location.nearbyAnchorIds)).toBe(true);
  });

  it("rejects unverified manifests and runtime/region identity mismatches", () => {
    const runtime = snapshotAt({ x: 512, y: 480 });
    expect(() => projectForestSpatialLocation(
      structuredClone(manifest),
      runtime,
      authoritativeIsSolid,
    ))
      .toThrow(/verified manifest/);
    expect(() => projectForestSpatialLocation(manifest, {
      ...runtime,
      topologyDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    }, authoritativeIsSolid)).toThrow(/topology/);
  });
});
