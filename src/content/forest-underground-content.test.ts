import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileContent, ContentValidationError } from "./compiler";
import type { ContentSource } from "./types";

type Obj = Record<string, unknown>;

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const sources = (): ContentSource[] => Object.entries(raw).map(([path, value]) => ({
  path: path.replace(/^\.\.\/\.\.\//, ""),
  data: path.endsWith(".json") ? JSON.parse(value) : parse(value),
}));

function source(items: ContentSource[], suffix: string): Obj {
  const item = items.find((candidate) => candidate.path.endsWith(suffix));
  if (!item || !item.data || typeof item.data !== "object" || Array.isArray(item.data)) throw new Error(`Missing ${suffix}`);
  return item.data as Obj;
}

function list(root: Obj, key: string): Obj[] {
  if (!Array.isArray(root[key])) throw new Error(`${key} must be an array`);
  return root[key] as Obj[];
}

function object(root: Obj, key: string): Obj {
  const value = root[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object`);
  return value as Obj;
}

function expectIssue(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as ContentValidationError).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  }
}

describe("forest underground order-node contract", () => {
  it("routes the completed creature resolution through the underground allocation before settlement", () => {
    const manifest = compileContent(sources());
    const task = manifest.indexes.tasks.ch01_underground_water_allocation! as Obj;
    const region = manifest.indexes.regions.valley_prologue! as Obj;
    const underground = manifest.indexes.scenes["scene.valley.underground_order_node"]! as Obj;

    expect((task.allocation_modes as Obj[]).map((mode) => mode.mode_id)).toEqual([
      "settlement_priority", "wetland_priority", "road_trade_priority",
    ]);
    expect(task.perfect_initial_balance_forbidden).toBe(true);
    expect(task.later_upgrade_mode).toBe("balanced_upgrade");
    expect(task.required_event_sequence).toEqual([
      "forest_large_creature_resolution_committed",
      "forest_site_synchronized",
      "forest_water_allocation_committed",
      "forest_site_lead_revealed",
      "forest_chapter_epilogue_committed",
    ]);
    expect(list(region, "connections").filter((edge) => edge.from === "valley.return_channel").map((edge) => edge.to)).toEqual(["valley.underground_order_node"]);
    expect(list(region, "connections").filter((edge) => edge.from === "valley.underground_order_node").map((edge) => edge.to)).toEqual(["valley.return_channel", "valley.settlement"]);
    expect(list(underground, "entrances").map((entry) => entry.entrance_id)).toContain("underground.from_return_wetland");
  });

  it("rejects a bypass, an always-open entrance, and a resolution-specific creature branch", () => {
    const bypass = sources();
    const region = source(bypass, "world/regions/valley-prologue.v0.1.yaml");
    list(region, "connections").push({ from: "valley.return_channel", to: "valley.settlement", traversal: { predicate: "settlement_supply_stable == true" } });
    expectIssue(() => compileContent(bypass), "ref.forest_underground_topology");

    const alwaysOpen = sources();
    const openRegion = source(alwaysOpen, "world/regions/valley-prologue.v0.1.yaml");
    const node = list(openRegion, "nodes").find((item) => item.node_id === "valley.underground_order_node")!;
    node.entry_condition = { always: true };
    expectIssue(() => compileContent(alwaysOpen), "ref.forest_underground_topology");

    const killOnly = sources();
    const killRegion = source(killOnly, "world/regions/valley-prologue.v0.1.yaml");
    const killOnlyNode = list(killRegion, "nodes").find((item) => item.node_id === "valley.underground_order_node")!;
    killOnlyNode.entry_condition = { predicate: "forest_large_creature_resolution == killed" };
    expectIssue(() => compileContent(killOnly), "ref.forest_underground_topology");
  });

  it("rejects a perfect initial allocation, omitted cost projection, and an old-mine guard before the epilogue", () => {
    const perfect = sources();
    source(perfect, "tasks/ch01-underground-water-allocation.v0.1.yaml").perfect_initial_balance_forbidden = false;
    expectIssue(() => compileContent(perfect), "task.forest_underground_contract");

    const missingProjection = sources();
    delete list(source(missingProjection, "tasks/ch01-underground-water-allocation.v0.1.yaml"), "allocation_modes")[0]!.cost_projection;
    expectIssue(() => compileContent(missingProjection), "task.forest_underground_contract");

    const oldMine = sources();
    object(list(source(oldMine, "scenes/valley-old-mine-threshold.v0.1.yaml"), "exits")[0]!, "traversal_guard").predicate = "prologue_return_observed == true";
    expectIssue(() => compileContent(oldMine), "scene.old_mine_peaceful_exit");
  });
});
