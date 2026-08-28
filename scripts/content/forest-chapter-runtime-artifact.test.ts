import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileContent } from "../../src/content/compiler.ts";
import type { ContentSource } from "../../src/content/types.ts";
import { projectForestChapterRuntimeManifest } from "./forest-chapter-runtime-artifact.ts";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true, import: "default", query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(raw).map(([path, text]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(text) : parse(text),
  }));
}

describe("forest chapter runtime projection", () => {
  it("projects the canonical chapter as runtime fields without authored predicates", () => {
    const chapter = projectForestChapterRuntimeManifest(compileContent(repositorySources()));

    expect(chapter).toMatchObject({
      chapterFlowId: "ch01_world_literacy_prologue",
      contentVersion: "chapter-01.forest.2",
      workingTitleZh: "水往何处",
      targetMedianMinutes: 180,
      firstPlayRangeMinutes: [150, 240],
      mainSceneIds: [
        "scene.valley.arrival_shelf", "scene.valley.stream_section", "scene.valley.settlement",
        "scene.valley.waterwheel", "scene.valley.high_cistern", "scene.valley.return_channel",
        "scene.valley.underground_order_node",
      ],
      optionalSceneIds: ["scene.valley.den_bypass", "scene.valley.safe_range"],
      postChapterBoundarySceneId: "scene.valley.old_mine_threshold",
      postChapterBoundaryRequiresEpilogue: true,
      activeWordIds: ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"],
      medium: {
        mediumId: "artifact.ancient_medium_frame", shardId: "artifact.fragment.forest_site",
        discoveryEventId: "forest_medium_discovered", initiationEventId: "forest_telo_initiation_committed",
        hermitRouteIds: ["medium.tell_facility_worker", "medium.follow_fragment_markers", "medium.ask_external_trader"],
        automaticWordMasteryForbidden: true, automaticMpIncreaseForbidden: true,
      },
      largeCreature: {
        entityId: "wildlife.valley.large_semiaquatic_nester",
        resolutionEventId: "forest_large_creature_resolution_committed",
        resolutionIds: ["restore_migration_channel", "guide_with_food_and_scent", "wait_and_yield", "install_nonlethal_barrier", "drive_away_by_combat", "kill"],
        mandatoryKill: false, languageEvidenceFromHarm: false,
      },
      allocation: {
        commitEventId: "forest_water_allocation_committed",
        modeIds: ["settlement_priority", "wetland_priority", "road_trade_priority"],
        benefitIdsByMode: {
          settlement_priority: ["resident_water_stable", "crops_stable"],
          wetland_priority: ["wetland_recovery_started", "creature_habitat_stable"],
          road_trade_priority: ["medicine_salt_metal_route_open", "external_news_route_open"],
        },
        costIdsByMode: {
          settlement_priority: ["wetland_decline_continues", "creature_migration_pressure"],
          wetland_priority: ["settlement_rationing", "local_food_price_pressure"],
          road_trade_priority: ["settlement_minimum_supply", "wetland_minimum_supply"],
        },
        perfectInitialBalanceForbidden: true, laterUpgradeMode: "balanced_upgrade",
      },
    });
    expect(chapter.segments).toHaveLength(9);
    expect(chapter.segments.at(-1)?.minuteRange).toEqual([173, 180]);
    expect(JSON.stringify(chapter)).not.toContain("predicate");
    expect(JSON.stringify(chapter)).not.toContain("forest_chapter_epilogue_committed == true");
  });
});
