import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "./compiler";
import type { ContentSource } from "./types";

const CANONICAL_FOREST_SEGMENTS = [
  ["arrival_tools", [0, 30], ["valley.arrival_shelf", "valley.stream_section"], []],
  ["settlement_work", [30, 55], ["valley.settlement"], []],
  ["waterwheel_discovery", [55, 75], ["valley.waterwheel"], []],
  ["hermit_initiation", [75, 95], ["valley.stream_section"], ["telo"]],
  ["cistern_motion", [95, 105], ["valley.high_cistern"], ["tawa"]],
  ["cistern_scale", [105, 120], ["valley.high_cistern"], ["lili", "suli"]],
  ["wetland_crisis", [120, 148], ["valley.return_channel"], ["wawa"]],
  ["underground_node", [148, 173], ["valley.underground_order_node"], []],
  ["allocation_epilogue", [173, 180], ["valley.settlement"], []],
] as const;

const CANONICAL_MAIN_SCENE_IDS = [
  "scene.valley.arrival_shelf", "scene.valley.stream_section", "scene.valley.settlement",
  "scene.valley.waterwheel", "scene.valley.high_cistern", "scene.valley.return_channel",
  "scene.valley.underground_order_node",
] as const;
const CANONICAL_OPTIONAL_SCENE_IDS = ["scene.valley.den_bypass", "scene.valley.safe_range"] as const;

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({
  path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(text) : parse(text),
}));

describe("forest chapter content contract", () => {
  it("projects the approved seven-main-plus-two-optional 180-minute chapter", () => {
    const manifest = compileContent(sources());
    const chapter = manifest.byKind.chapter[0]!;
    expect(chapter.contentVersion).toBe("chapter-01.forest.2");

    const content = chapter.content as Record<string, unknown>;
    const segments = content.segments as Array<Record<string, unknown>>;
    expect(segments.map((segment) => [segment.segment_id, segment.content_budget_minutes, segment.map_nodes, segment.focus_active_new_words]))
      .toEqual(CANONICAL_FOREST_SEGMENTS);
    for (let index = 1; index < segments.length; index += 1) {
      expect((segments[index - 1]!.content_budget_minutes as number[])[1])
        .toBe((segments[index]!.content_budget_minutes as number[])[0]);
    }
    expect(segments.map((segment) => (segment.content_budget_minutes as number[])[0])).toEqual([0, 30, 55, 75, 95, 105, 120, 148, 173]);
    expect((segments.at(-1)!.content_budget_minutes as number[])[1]).toBe(180);
    expect(segments.slice(0, 2).map((segment) => segment.focus_active_new_words)).toEqual([[], []]);
    expect([...new Set(segments.flatMap((segment) => segment.focus_active_new_words as string[]))].sort())
      .toEqual(["lili", "suli", "tawa", "telo", "wawa"]);

    const contract = content.forest_chapter_contract as Record<string, unknown>;
    expect(contract).toMatchObject({
      working_title_zh: "水往何处", target_median_minutes: 180, first_play_range_minutes: [150, 240],
      main_scene_ids: CANONICAL_MAIN_SCENE_IDS, optional_scene_ids: CANONICAL_OPTIONAL_SCENE_IDS,
      post_chapter_boundary_scene_id: "scene.valley.old_mine_threshold", mandatory_kills: 0,
      mandatory_wildlife_products: 0, medium_usable_before_hermit_initiation: false,
    });
  });
});
