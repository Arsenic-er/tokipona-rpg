import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import type { ContentSource } from "../../src/content/types";
import { projectForestSpatialRuntimeManifest } from "./forest-spatial-runtime-artifact";

const rawRepositoryContent = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true, import: "default", query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(rawRepositoryContent).map(([path, raw]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
  }));
}

describe("forest spatial runtime artifact projector", () => {
  it("copies the validated canonical forest geometry into a deterministic runtime body", () => {
    const manifest = compileContent(repositorySources());
    const first = projectForestSpatialRuntimeManifest(manifest);
    const second = projectForestSpatialRuntimeManifest(manifest);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      profileId: "forest_side_scroll.v0.1",
      regionBoundsPx: { width: 10240, height: 2880 }, viewportPx: { width: 640, height: 360 },
      storageChunkPx: { width: 16, height: 16 }, visibleMaterialCellPx: 1,
      chapterOneAccessibleRatio: { minimum: 0.35, maximum: 0.40 },
      laterGateAnchorIds: ["forest.safe_range", "forest.old_mine"],
    });
    expect(first.anchors.map((anchor) => anchor.anchorId)).toEqual([
      "forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch",
      "forest.waterwheel", "forest.cistern", "forest.den_bypass", "forest.return_channel",
      "forest.underground_node", "forest.safe_range", "forest.old_mine",
    ]);
    expect(first.routeEdges.map((edge) => edge.edgeId)).toEqual([
      "arrival.stream", "stream.settlement", "settlement.hermit", "hermit.waterwheel",
      "waterwheel.cistern", "waterwheel.den", "den.cistern", "cistern.return",
      "return.underground", "underground.settlement", "settlement.safe_range", "settlement.old_mine",
    ]);
    expect(first.landmarks).toEqual([expect.objectContaining({
      landmarkId: "forest.waterwheel_structure", boundsPx: { x: 4800, y: 1120, width: 1408, height: 1024 },
    })]);
  });
});
