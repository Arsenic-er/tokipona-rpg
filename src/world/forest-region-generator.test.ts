import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import {
  ForestGenerationError,
  generateForestRegion,
  serializeForestRegion,
  type ForestRegion,
} from "./forest-region-generator";

const manifest = readRuntimeForestSpatialManifest(generated);
const FIXED_SEEDS = [
  "forest.seed.00", "forest.seed.01", "forest.seed.02", "forest.seed.03",
  "forest.seed.04", "forest.seed.05", "forest.seed.06", "forest.seed.07",
  "forest.seed.08", "forest.seed.09", "forest.seed.10", "forest.seed.11",
  "forest.seed.12", "forest.seed.13", "forest.seed.14", "forest.seed.15",
  "forest.seed.16", "forest.seed.17", "forest.seed.18", "forest.seed.19",
  "forest.seed.20", "forest.seed.21", "forest.seed.22", "forest.seed.23",
  "forest.seed.24", "forest.seed.25", "forest.seed.26", "forest.seed.27",
  "forest.seed.28", "forest.seed.29", "forest.seed.30", "forest.seed.31",
] as const;

function reachableCellIds(region: ForestRegion, capabilities: readonly string[]): ReadonlySet<string> {
  const available = new Set(capabilities);
  const byCellId = new Map(region.traversableCells.map((cell) => [cell.cellId, cell]));
  const adjacency = new Map<string, string[]>();
  for (const link of region.cellLinks) {
    if (link.capability !== null && !available.has(link.capability)) continue;
    const from = adjacency.get(link.fromCellId) ?? [];
    from.push(link.toCellId);
    adjacency.set(link.fromCellId, from);
    const to = adjacency.get(link.toCellId) ?? [];
    to.push(link.fromCellId);
    adjacency.set(link.toCellId, to);
  }
  const found = new Set<string>([region.anchorCellIds["forest.arrival"]!]);
  const queue = [...found];
  while (queue.length > 0) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (!byCellId.has(next) || found.has(next)) continue;
      found.add(next);
      queue.push(next);
    }
  }
  return found;
}

function intersects(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width &&
    left.y < right.y + right.height && right.y < left.y + left.height;
}

describe("forest region generator", () => {
  it("is byte-stable for a reader-verified manifest and seed", () => {
    const first = generateForestRegion(manifest, "forest.chapter-one.audit");
    const second = generateForestRegion(manifest, "forest.chapter-one.audit");

    expect(serializeForestRegion(first)).toBe(serializeForestRegion(second));
    expect(first.topologyDigest).toBe(second.topologyDigest);
  });

  it.each(FIXED_SEEDS)("keeps the authored topology invariant for %s", (seed) => {
    const region = generateForestRegion(manifest, seed);
    const fullCapabilities = [
      "maintenance_access_open", "den_route_open", "exit_ladder_lowered",
      "settlement_supply_stable", "forest_chapter_epilogue_committed", "range_trial_permission",
    ];
    const mainRouteReachable = reachableCellIds(region, fullCapabilities);
    for (const anchorId of manifest.chapterOneRouteAnchorIds) {
      expect(mainRouteReachable.has(region.anchorCellIds[anchorId]!)).toBe(true);
    }

    const initialReachable = reachableCellIds(region, []);
    const initialRatio = initialReachable.size / region.traversableCells.length;
    expect(initialRatio).toBeGreaterThanOrEqual(0.35);
    expect(initialRatio).toBeLessThanOrEqual(0.4);
    expect(initialReachable.has(region.anchorCellIds["forest.safe_range"]!)).toBe(false);
    expect(initialReachable.has(region.anchorCellIds["forest.old_mine"]!)).toBe(false);
    expect(region.traversableCells.map((cell) => cell.cellId)).toContain(region.anchorCellIds["forest.safe_range"]);
    expect(region.traversableCells.map((cell) => cell.cellId)).toContain(region.anchorCellIds["forest.old_mine"]);

    for (const pocket of region.pockets) {
      for (const protectedZone of region.protectedZones) {
        expect(intersects(pocket.boundsPx, protectedZone.boundsPx)).toBe(false);
      }
    }
    for (const chamber of region.encounterChambers) {
      expect(new Set(chamber.escapeEdgeIds).size).toBe(2);
      for (const edgeId of chamber.escapeEdgeIds) {
        const escape = region.routeCorridors.find((corridor) => corridor.edgeId === edgeId);
        expect(escape).toBeDefined();
        expect([escape!.fromDistrictId, escape!.toDistrictId]).toContain(chamber.districtId);
      }
    }
    for (const surface of region.meadowSurfaces) {
      expect(Math.abs(surface.y - 704)).toBeLessThanOrEqual(16);
    }
    for (const clearance of region.criticalRouteClearances) {
      expect(clearance.width).toBeGreaterThanOrEqual(16);
      expect(clearance.height).toBeGreaterThanOrEqual(18);
    }
  });

  it("unlocks every main-route anchor only in its authored progression phase", () => {
    const region = generateForestRegion(manifest, "forest.phase.audit");
    const phases = [
      { capabilities: [], anchorIds: ["forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch", "forest.waterwheel"] },
      { capabilities: ["maintenance_access_open"], anchorIds: ["forest.cistern"] },
      { capabilities: ["maintenance_access_open", "exit_ladder_lowered"], anchorIds: ["forest.return_channel"] },
      { capabilities: ["maintenance_access_open", "exit_ladder_lowered", "settlement_supply_stable"], anchorIds: ["forest.underground_node"] },
      { capabilities: ["maintenance_access_open", "exit_ladder_lowered", "settlement_supply_stable", "forest_chapter_epilogue_committed"], anchorIds: ["forest.settlement"] },
    ] as const;

    for (const phase of phases) {
      const reachable = reachableCellIds(region, phase.capabilities);
      for (const anchorId of phase.anchorIds) expect(reachable.has(region.anchorCellIds[anchorId]!)).toBe(true);
    }
  });

  it("records target ownership at every corridor midpoint", () => {
    const region = generateForestRegion(manifest, "forest.midpoint.audit");
    for (const corridor of region.routeCorridors) {
      expect(corridor.ownership).toEqual([
        expect.objectContaining({ districtId: corridor.fromDistrictId, fromT: 0, toT: 0.5, includesEnd: false }),
        expect.objectContaining({ districtId: corridor.toDistrictId, fromT: 0.5, toT: 1, includesStart: true }),
      ]);
    }
  });

  it("keeps every authored macro terrain primitive in the generated skeleton", () => {
    const region = generateForestRegion(manifest, "forest.primitives.audit");

    expect(region.terrainPrimitives.map((primitive) => primitive.kind)).toEqual([
      "surface_arrival_ledge",
      "shallow_stream_descent",
      "meadow_settlement_clearing",
      "hermit_side_branch",
      "descending_ravine",
      "waterwheel_protected_mass",
      "upper_cistern_route",
      "return_channel_lower_shortcut",
      "sealed_safe_range_gate",
      "sealed_old_mine_gate",
      "sealed_deep_root_gate",
    ]);
  });

  it("fails closed for an empty seed and an unverified manifest", () => {
    expect(() => generateForestRegion(manifest, "")).toThrow(ForestGenerationError);
    expect(() => generateForestRegion(structuredClone(manifest), "forest.unverified")).toThrow(ForestGenerationError);
  });
});
