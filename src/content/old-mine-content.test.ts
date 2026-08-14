import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileContent } from "./compiler";
import type { ContentSource } from "./types";

type Obj = Record<string, unknown>;
const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;
const repositorySources = (): ContentSource[] => Object.entries(raw).map(([path, value]) => ({
  path: path.replace(/^\.\.\/\.\.\//, ""),
  data: path.endsWith(".json") ? JSON.parse(value) : parse(value),
}));
const source = (items: ReturnType<typeof repositorySources>, path: string): Obj =>
  items.find((item) => item.path.endsWith(path))!.data as Obj;
const list = (value: Obj, key: string): Obj[] => value[key] as Obj[];

describe("old-mine threshold content contract", () => {
  it("projects the reciprocal peaceful N02 threshold route", () => {
    const manifest = compileContent(repositorySources());
    const scene = manifest.indexes.scenes["scene.valley.old_mine_threshold"]! as Obj;
    expect(scene.size_tiles).toEqual({ width: 24, height: 20 });
    expect(list(scene, "routes").map((route) => [route.route_id, route.route_kind, route.solution_family])).toEqual([
      ["old_mine.peaceful_chapter_threshold", "non_magic", "peaceful_chapter_transition"],
    ]);
    expect(list(scene, "exits")[0]).toMatchObject({
      exit_id: "old_mine.to_settlement",
      target_scene_id: "scene.valley.settlement",
      target_entrance_id: "settlement.from_old_mine",
      traversal_guard: { predicate: "prologue_return_observed == true" },
    });
  });

  it("fails closed when the peaceful guard or reciprocal scene edge drifts", () => {
    const wrongGuard = structuredClone(repositorySources());
    const mine = source(wrongGuard, "scenes/valley-old-mine-threshold.v0.1.yaml");
    (list(mine, "exits")[0]!.traversal_guard as Obj).predicate = "first_attack_signature_completed == true";
    expect(() => compileContent(wrongGuard)).toThrow(/scene\.old_mine_peaceful_exit/);

    const missingReturn = structuredClone(repositorySources());
    const settlement = source(missingReturn, "scenes/valley-settlement.v0.1.yaml");
    settlement.exits = list(settlement, "exits").filter((item) => item.exit_id !== "settlement.to_old_mine");
    expect(() => compileContent(missingReturn)).toThrow(/scene\.old_mine_topology/);
  });
});
