import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent, ContentValidationError } from "./compiler";
import type { ContentSource } from "./types";

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

function mutableScene(sources: ContentSource[], suffix: string): Record<string, unknown> {
  const source = sources.find((candidate) => candidate.path.endsWith(suffix));
  if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) {
    throw new Error(`Missing scene fixture ${suffix}`);
  }
  return source.data as Record<string, unknown>;
}

function objectArray(object: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = object[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value as Array<Record<string, unknown>>;
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

describe("canonical N02 settlement content", () => {
  it("publishes NPCs, public facilities, one receipt-backed nonviolent job, and a trade-authority reference", () => {
    const manifest = compileContent(repositorySources());
    const settlement = manifest.indexes.scenes["scene.valley.settlement"]!;
    const npcs = objectArray(settlement as Record<string, unknown>, "npcs");
    const facilities = objectArray(settlement as Record<string, unknown>, "facilities");
    const tasks = objectArray(settlement as Record<string, unknown>, "tasks");
    const trade = objectArray(settlement as Record<string, unknown>, "trade_entries");

    expect(npcs.map((npc) => npc.profession_id)).toEqual([
      "settlement.facility_manager",
      "settlement.repair_contractor",
      "settlement.supply_trader",
    ]);
    expect(facilities.map((facility) => facility.facility_kind)).toEqual(expect.arrayContaining([
      "public_well",
      "communal_plant_meal",
      "public_meditation_court",
    ]));
    expect(facilities.filter((facility) => facility.public_relief)).toHaveLength(2);
    expect(facilities.filter((facility) => facility.public_relief).every((facility) => facility.economy_eligible === false)).toBe(true);
    expect(tasks).toEqual([
      expect.objectContaining({
        task_id: "ch01_settlement_orientation",
        nonviolent: true,
        magic_required: false,
        reward: { currency: "coin", amount: 10, claim_once: true, receipt_required: true },
      }),
    ]);
    expect(trade).toEqual([
      expect.objectContaining({
        authoritative_economy_ref: "../economy/settlement-trade.v0.1.yaml",
        merchant_ids: ["settlement.grocer"],
        scene_defines_catalog_or_prices: false,
      }),
    ]);
  });

  it("keeps two non-magic orientation routes and explicit soft-failure recovery", () => {
    const settlement = compileContent(repositorySources()).indexes.scenes["scene.valley.settlement"]!;
    const routes = objectArray(settlement as Record<string, unknown>, "routes");
    const recoveries = objectArray(settlement as Record<string, unknown>, "soft_failure_recoveries");
    expect(routes.filter((route) => route.route_kind === "non_magic").map((route) => route.solution_family)).toEqual([
      "ask_facility_people",
      "survey_public_infrastructure",
    ]);
    expect(recoveries.map((recovery) => recovery.action)).toEqual(expect.arrayContaining([
      "reissue_nontradeable_survey_slate",
      "restore_checkpoint_local_markers",
      "keep_people_guided_orientation_available",
      "keep_public_services_free",
    ]));
  });

  it("rejects an unsupported entrance and an exit disconnected from all entrances", () => {
    const unsupportedSources = repositorySources();
    objectArray(mutableScene(unsupportedSources, "scenes/valley-arrival-shelf.v0.1.yaml"), "entrances")[0]!.spawn_tile = [0, 17];
    expectIssue(() => compileContent(unsupportedSources), "scene.entrance_unsupported");

    const unreachableSources = repositorySources();
    const settlement = mutableScene(unreachableSources, "scenes/valley-settlement.v0.1.yaml");
    const rows = settlement.collision_rows_top_down as string[];
    for (let row = 23; row <= 29; row += 1) rows[row] = `${rows[row]!.slice(0, 38)}##`;
    expectIssue(() => compileContent(unreachableSources), "scene.exit_unreachable");
  });

  it("rejects trading public relief, a non-receipted reward, and an unknown authoritative merchant", () => {
    const reliefSources = repositorySources();
    objectArray(mutableScene(reliefSources, "scenes/valley-settlement.v0.1.yaml"), "facilities")[0]!.economy_eligible = true;
    expectIssue(() => compileContent(reliefSources), "scene.public_relief_trade_forbidden");

    const rewardSources = repositorySources();
    const task = objectArray(mutableScene(rewardSources, "scenes/valley-settlement.v0.1.yaml"), "tasks")[0]!;
    (task.reward as Record<string, unknown>).receipt_required = false;
    expectIssue(() => compileContent(rewardSources), "scene.reward_receipt_required");

    const merchantSources = repositorySources();
    objectArray(mutableScene(merchantSources, "scenes/valley-settlement.v0.1.yaml"), "trade_entries")[0]!.merchant_ids = ["settlement.not_real"];
    expectIssue(() => compileContent(merchantSources), "ref.missing");
  });
});
