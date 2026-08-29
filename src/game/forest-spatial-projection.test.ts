import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { ForestGrayboxRuntime } from "../world/forest-graybox-runtime";
import { generateForestRegion } from "../world/forest-region-generator";
import {
  FOREST_NEARBY_ANCHOR_DISTANCE_PX,
  ForestSpatialProjectionError,
  projectForestSpatialLocation,
} from "./forest-spatial-projection";

const manifest = readRuntimeForestSpatialManifest(generated);
const seed = "forest.spatial-projection.test";
const region = generateForestRegion(manifest, seed);

function snapshotAt(position: Readonly<{ x: number; y: number }>) {
  return new ForestGrayboxRuntime({ manifest, region, initialPosition: position }).snapshot();
}

describe("forest spatial projection", () => {
  it.each([
    ["forest.arrival", "scene.valley.arrival_shelf"],
    ["forest.stream", "scene.valley.stream_section"],
    ["forest.settlement", "scene.valley.settlement"],
    ["forest.hermit_branch", "scene.valley.stream_section"],
    ["forest.waterwheel", "scene.valley.waterwheel"],
  ] as const)("maps the authored %s anchor to its existing scene", (anchorId, sceneId) => {
    const anchor = manifest.anchors.find((candidate) => candidate.anchorId === anchorId)!;
    const runtime = snapshotAt({ x: anchor.positionPx[0], y: anchor.positionPx[1] });

    expect(projectForestSpatialLocation(manifest, runtime)).toEqual({
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
      x: from!.x + (to!.x - from!.x) * t,
      y: from!.y + (to!.y - from!.y) * t,
    });

    expect(projectForestSpatialLocation(manifest, at(0.49)).districtId).toBe("forest.settlement");
    expect(projectForestSpatialLocation(manifest, at(0.5)).districtId).toBe("forest.hermit_branch");
  });

  it("fails closed at an overlapping authored boundary and in non-traversable unresolved space", () => {
    expect(() => projectForestSpatialLocation(manifest, snapshotAt({ x: 1_280, y: 620 })))
      .toThrow(ForestSpatialProjectionError);
    expect(() => projectForestSpatialLocation(manifest, snapshotAt({ x: 100, y: 100 })))
      .toThrow(ForestSpatialProjectionError);
  });

  it("derives nearby anchors from authored positions at one fixed distance", () => {
    const runtime = snapshotAt({ x: 512, y: 480 });
    const poisonedRuntime = Object.freeze({
      ...runtime,
      nearbyAnchorIds: ["caller.injected"],
      inventory: ["forbidden"],
    });
    const location = projectForestSpatialLocation(manifest, poisonedRuntime);

    expect(FOREST_NEARBY_ANCHOR_DISTANCE_PX).toBe(320);
    expect(location.nearbyAnchorIds).toEqual(["forest.arrival"]);
    expect(location.nearbyAnchorIds).not.toContain("caller.injected");
  });

  it("returns only immutable spatial facts and no domain or mutation surface", () => {
    const location = projectForestSpatialLocation(manifest, snapshotAt({ x: 512, y: 480 }));

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
    expect(() => projectForestSpatialLocation(structuredClone(manifest), runtime))
      .toThrow(/verified manifest/);
    expect(() => projectForestSpatialLocation(manifest, {
      ...runtime,
      topologyDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    })).toThrow(/topology/);
  });
});
