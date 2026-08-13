import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { computeRuntimeSurvivalConsumptionDigest, readRuntimeSurvivalConsumptionManifest } from "./runtime-survival-consumption-manifest";

describe("runtime survival consumption projection", () => {
  it("reads the authored cooked-meat profile and raw-meat rejection", () => {
    const manifest = readRuntimeSurvivalConsumptionManifest(generated);
    expect(manifest.wildlifeInventoryConsumableIds).toEqual(["food.cooked_game_meat"]);
    expect(manifest.profiles["food.cooked_game_meat"]).toEqual({
      consumableId: "food.cooked_game_meat", hydrationDelta: 0, satietyDelta: 35,
      requirements: ["cooked", "not_spoiled"],
    });
    expect(manifest.categoryRejections.raw_meat).toEqual({ category: "raw_meat", rejectionCode: "cook_before_eating" });
  });

  it("rejects tampering even if an invalid contract is re-signed", () => {
    const tampered = structuredClone(generated) as any;
    tampered.survivalConsumption.profiles["food.cooked_game_meat"].satietyDelta = 99;
    expect(() => readRuntimeSurvivalConsumptionManifest(tampered)).toThrow(/digest mismatch/);
    tampered.survivalConsumption.sourceDigest = computeRuntimeSurvivalConsumptionDigest(tampered.survivalConsumption);
    expect(() => readRuntimeSurvivalConsumptionManifest(tampered)).toThrow(/contract mismatch/);
  });
});
