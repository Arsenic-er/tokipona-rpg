import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "./compiler";
import type { ContentObject, ContentSource } from "./types";

const rawRepositoryContent = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(rawRepositoryContent).map(([path, raw]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
  }));
}

function object(value: unknown, label: string): ContentObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as ContentObject;
}

function objects(value: unknown, label: string): ContentObject[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => object(entry, `${label}[${index}]`));
}

describe("continuous forest map source contract", () => {
  it("compiles the authored forest dimensions, camera, anchors, route, and spatial escape contracts", () => {
    const manifest = compileContent(repositorySources());
    const region = manifest.indexes.regions.valley_prologue;
    if (!region) throw new Error("canonical valley region is unavailable");
    const contract = object(region.continuous_map_contract, "continuous_map_contract");
    const bounds = object(contract.region_bounds_px, "region bounds");
    const viewport = object(contract.viewport_px, "viewport");
    const envelope = object(contract.viewport_envelope, "viewport envelope");
    expect(bounds).toEqual({ width: 10240, height: 2880 });
    expect(viewport).toEqual({ width: 640, height: 360 });
    expect(envelope).toEqual({ columns: 16, rows: 8 });
    expect(Number(bounds.width)).toBe(Number(viewport.width) * Number(envelope.columns));
    expect(Number(bounds.height)).toBe(Number(viewport.height) * Number(envelope.rows));
    expect(contract.visible_material_cell_px).toBe(1);
    expect(contract.storage_chunk_px).toEqual({ width: 16, height: 16 });

    expect(contract.camera).toEqual({
      profile_id: "forest_side_scroll.v0.1", fixed_zoom: true, movement_look_ahead_ratio: 0.18,
      dead_zone_normalized: { left: 0.38, right: 0.62, top: 0.35, bottom: 0.67 },
      downward_bias_ratio: 0.14, upward_lag_ratio: 0.08, pixel_snap: true,
    });

    const sceneIds = new Set(objects(region.nodes, "region nodes").map((node) => node.scene_id));
    const anchors = objects(contract.anchors, "anchors");
    expect(new Set(anchors.map((anchor) => anchor.anchor_id)).size).toBe(anchors.length);
    for (const anchor of anchors) {
      const position = anchor.position_px;
      expect(Array.isArray(position) && position.length === 2).toBe(true);
      const [x, y] = position as number[];
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(Number(bounds.width));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(Number(bounds.height));
      expect(sceneIds.has(anchor.scene_id as string)).toBe(true);
    }
    expect(contract.chapter_one_route_anchor_ids).toEqual([
      "forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch",
      "forest.waterwheel", "forest.cistern", "forest.return_channel",
      "forest.underground_node", "forest.settlement",
    ]);
    const initiallyAccessible = new Set(["forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch", "forest.waterwheel"]);
    for (const gate of contract.later_gate_anchor_ids as string[]) expect(initiallyAccessible.has(gate)).toBe(false);

    const meadow = object(contract.meadow_ground_band_px, "meadow band");
    const settlement = anchors.find((anchor) => anchor.anchor_id === "forest.settlement");
    expect(settlement?.position_px).toEqual([3072, 672]);
    expect(Number((settlement?.position_px as number[])[0])).toBeGreaterThanOrEqual(Number(meadow.left));
    expect(Number((settlement?.position_px as number[])[0])).toBeLessThan(Number(meadow.right));
    // The anchor is the player body's standing reference, 32 px above the authored meadow floor.
    expect(Number(meadow.y) - Number((settlement?.position_px as number[])[1])).toBe(32);

    const landmark = objects(contract.landmarks, "landmarks").find((entry) => entry.landmark_id === "forest.waterwheel_structure");
    expect(landmark?.bounds_px).toEqual([4800, 1120, 1408, 1024]);
    const [, , landmarkWidth, landmarkHeight] = landmark?.bounds_px as number[];
    expect(landmarkWidth).toBeGreaterThan(Number(viewport.width));
    expect(landmarkHeight).toBeGreaterThan(Number(viewport.height));
    expect(Math.ceil(landmarkWidth / Number(viewport.width)) * Math.ceil(landmarkHeight / Number(viewport.height))).toBeGreaterThanOrEqual(2);

    const routeEdges = new Set(objects(contract.route_edges, "route edges").map((edge) => edge.edge_id));
    for (const chamber of objects(contract.encounter_chambers, "encounter chambers")) {
      const escapeEdges = chamber.escape_edge_ids as string[];
      expect(new Set(escapeEdges).size).toBeGreaterThanOrEqual(2);
      expect(escapeEdges.every((edge) => routeEdges.has(edge))).toBe(true);
    }
  });
});
