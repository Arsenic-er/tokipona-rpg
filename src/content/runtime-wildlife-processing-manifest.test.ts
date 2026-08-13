import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { computeRuntimeWildlifeProcessingDigest, readRuntimeWildlifeProcessingManifest } from "./runtime-wildlife-processing-manifest";

describe("runtime wildlife processing machine projection", () => {
  it("projects harvest, decay, recipes and WAL identity from authored machine sources", () => {
    const manifest = readRuntimeWildlifeProcessingManifest(generatedRuntimeArtifact);
    expect(manifest.sourcePath).toBe("data/economy/wildlife-products.v0.1.yaml");
    expect(manifest.wal.sourcePath).toBe("data/persistence/cross-save-wal.v0.1.yaml");
    expect(manifest.harvestProfiles["harvest.rabbit.v0.1"]?.adultFullYield).toEqual([
      { tissueSlotId: "meat", itemId: "food.raw_small_game_meat", quantity: 2 },
      { tissueSlotId: "hide", itemId: "material.raw_small_hide", quantity: 1 },
    ]);
    expect(manifest.harvestProfiles["harvest.fox.v0.1"]?.adultFullYield.map((slot) => slot.quantity)).toEqual([1, 1]);
    expect(Object.keys(manifest.processingRecipes).sort()).toEqual([
      "cook.game_meat.v0.1", "dry.game_meat.v0.1", "process.field_dress.v0.1", "tan.medium_pelt.v0.1", "tan.small_hide.v0.1",
    ]);
    expect(manifest.processingRecipes["dry.game_meat.v0.1"]).toMatchObject({
      requiredDistinctEligibleEvents: 2,
      eligibleEventFilter: ["mainline_world_predicate_commit", "non_replayed_side_task_commit", "region_transition_commit"],
    });
    expect(manifest.processingRecipes["process.field_dress.v0.1"]).toMatchObject({
      transactionKind: "harvest", genericProcessOutputPathForbidden: true, stationOrToolAny: ["butcher_table", "field_knife"],
    });
    expect(manifest.processingRecipes["cook.game_meat.v0.1"]).toMatchObject({
      stationOrToolAny: ["communal_kitchen"], energyRequirement: { kind: "heat_work", eu: 8 },
    });
    expect(manifest.wal.registeredKinds).toEqual(expect.arrayContaining([
      "harvest", "workorder_start", "workorder_complete", "workorder_claim", "workorder_cancel",
    ]));
  });

  it("rejects digest tampering and re-signed threshold, station and WAL set corruption", () => {
    const tampered = structuredClone(generatedRuntimeArtifact) as any;
    tampered.wildlifeProcessing.processingRecipes["cook.game_meat.v0.1"].interactionWorkUnits = 4;
    expect(() => readRuntimeWildlifeProcessingManifest(tampered)).toThrow(/source digest mismatch/);

    const resign = (artifact: any): any => {
      artifact.wildlifeProcessing.sourceDigest = computeRuntimeWildlifeProcessingDigest(artifact.wildlifeProcessing);
      return artifact;
    };
    const thresholds = structuredClone(generatedRuntimeArtifact) as any;
    thresholds.wildlifeProcessing.decayProfiles["raw_meat_temperate"].thresholdsSeconds[1].untilSeconds = 1;
    expect(() => readRuntimeWildlifeProcessingManifest(resign(thresholds))).toThrow(/strictly increase/);
    const stations = structuredClone(generatedRuntimeArtifact) as any;
    delete stations.wildlifeProcessing.stationBindings.communal_kitchen;
    expect(() => readRuntimeWildlifeProcessingManifest(resign(stations))).toThrow(/exactly match/);
    const wal = structuredClone(generatedRuntimeArtifact) as any;
    wal.wildlifeProcessing.wal.registeredKinds.pop();
    expect(() => readRuntimeWildlifeProcessingManifest(resign(wal))).toThrow(/projection mismatch/);
  });

  it("fails closed on a corrupted projection instead of silently using defaults", () => {
    const corrupt = structuredClone(generatedRuntimeArtifact) as unknown as { wildlifeProcessing: { juvenileHarvestOutputs: number } };
    corrupt.wildlifeProcessing.juvenileHarvestOutputs = 1;
    expect(() => readRuntimeWildlifeProcessingManifest(corrupt)).toThrow(/juvenile harvest must be zero/);
  });
});
