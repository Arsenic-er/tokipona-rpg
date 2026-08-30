import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest";
import {
  isVerifiedRuntimeForestSpatialManifest,
  readRuntimeForestSpatialManifest,
} from "./runtime-forest-spatial-manifest";

function candidate(): Record<string, unknown> {
  return structuredClone(generated) as Record<string, unknown>;
}

describe("runtime forest spatial manifest reader", () => {
  it("accepts and brands only the current generated forest projection", () => {
    const result = readRuntimeForestSpatialManifest(candidate());
    expect(isVerifiedRuntimeForestSpatialManifest(result)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.camera)).toBe(true);
  });

  it.each([
    ["bounds", (forest: Record<string, unknown>) => { (forest.regionBoundsPx as Record<string, unknown>).width = 10239; }],
    ["camera", (forest: Record<string, unknown>) => { (forest.camera as Record<string, unknown>).movementLookAheadRatio = 0.19; }],
    ["anchor order", (forest: Record<string, unknown>) => { (forest.anchors as unknown[]).reverse(); }],
    ["scene mapping", (forest: Record<string, unknown>) => { ((forest.anchors as Record<string, unknown>[])[0]!).sceneId = "scene.not_canonical"; }],
    ["route order", (forest: Record<string, unknown>) => { (forest.routeEdges as unknown[]).reverse(); }],
    ["gate list", (forest: Record<string, unknown>) => { (forest.laterGateAnchorIds as string[]).pop(); }],
  ])("rejects changed %s", (_label, mutate) => {
    const artifact = candidate();
    mutate((artifact.forestSpatial as Record<string, unknown>));
    expect(() => readRuntimeForestSpatialManifest(artifact)).toThrow();
  });

  it("rejects forged digests, unknown fields, duplicate IDs, undersized landmarks, and stale artifacts", () => {
    const forged = candidate();
    (forged.forestSpatial as Record<string, unknown>).sourceDigest = `sha256:${"0".repeat(64)}`;
    expect(() => readRuntimeForestSpatialManifest(forged)).toThrow(/digest/i);

    const unknown = candidate();
    (unknown.forestSpatial as Record<string, unknown>).unknown = true;
    expect(() => readRuntimeForestSpatialManifest(unknown)).toThrow(/unknown|missing/i);

    const nestedUnknown = candidate();
    ((nestedUnknown.forestSpatial as Record<string, unknown>).camera as Record<string, unknown>).unknown = true;
    expect(() => readRuntimeForestSpatialManifest(nestedUnknown)).toThrow(/canonical|unknown|missing/i);

    for (const field of ["districts", "routeEdges", "anchors", "landmarks"] as const) {
      const duplicate = candidate();
      const values = (duplicate.forestSpatial as Record<string, unknown>)[field] as unknown[];
      values.push(structuredClone(values[0]));
      expect(() => readRuntimeForestSpatialManifest(duplicate)).toThrow(/canonical|duplicate|invalid/i);
    }

    const undersized = candidate();
    const landmark = ((undersized.forestSpatial as Record<string, unknown>).landmarks as Record<string, unknown>[])[0]!;
    (landmark.boundsPx as Record<string, unknown>).width = 639;
    expect(() => readRuntimeForestSpatialManifest(undersized)).toThrow(/canonical|landmark|digest/i);

    const stale = candidate();
    (stale.forestSpatial as Record<string, unknown>).sourceDigest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(() => readRuntimeForestSpatialManifest(stale)).toThrow(/digest/i);
  });

  it("rejects a re-signed noncanonical district-to-scene mapping", () => {
    const changed = candidate();
    const forest = changed.forestSpatial as Record<string, unknown>;
    const district = (forest.districts as Record<string, unknown>[])[0]!;
    district.sceneId = "scene.valley.waterwheel";
    const payload = Object.fromEntries(
      Object.entries(forest).filter(([key]) => key !== "sourceDigest"),
    );
    forest.sourceDigest = computeRuntimeManifestDigest(payload);

    expect(() => readRuntimeForestSpatialManifest(changed)).toThrow(/district.*mapping/i);
  });
});
