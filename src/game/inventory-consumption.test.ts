import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy } from "./economy-state";
import type { TradeLot } from "./trade";
import { SurvivalSystem } from "./survival";
import { applyInventoryConsumption, materializeInventoryConsumptionAction } from "./inventory-consumption";

const cooked = (): TradeLot => ({
  lotId: "lot.consume.cooked", itemId: "food.cooked_game_meat", sourceLotIds: ["lot.consume.raw"],
  legalOwnerId: "player.consume", stolenFromId: null, processingTransactionId: "process.consume.cook", quantity: 2,
  originKind: "natural", naturalFraction: 1, freshness: "fresh", qualityMultiplier: 1, contaminationMu: 0,
  economyEligible: true, reserved: false, equipped: false, ownershipRevision: 0, freshnessRevision: 0,
  wildlifeProvenance: { lifeInstanceId: "life.consume", deathEventId: "death.consume", harvestEventId: "harvest.consume",
    parentLotIds: ["lot.consume.raw"], transformEventId: "process.consume.cook", matterOrigin: "natural",
    freshnessCreatedTick: 0, preservationProfileId: "cooked_meat_temperate", lastDecayEvalTick: 0,
    remainingFreshnessSeconds: 3600, reservationRevision: 0, reservedByWorkOrderId: null },
});
const setup = (lot: TradeLot = cooked()) => {
  const survival = SurvivalSystem.fromSave({ ...new SurvivalSystem().toSave(), satiety: 50, hydration: 60 });
  const economy = { ...createEmptySessionEconomy(), lots: [lot] };
  const action = materializeInventoryConsumptionAction({ playerSaveId: "player.consume", lotId: lot.lotId, quantity: 1,
    consumptionSequence: 1, currentWorldTick: 0, expectedInventoryRevision: 0, expectedLotOwnershipRevision: 0,
    expectedLotFreshnessRevision: 0, expectedSurvivalRevision: survival.toSave().revision });
  return { economy, survival: survival.toSave(), action };
};

describe("inventory consumption transaction", () => {
  it("atomically consumes authored cooked meat and applies exactly satiety +35", () => {
    const { economy, survival, action } = setup();
    const result = applyInventoryConsumption(economy, survival, action);
    expect(result).toMatchObject({ committed: true, receipt: { satietyDelta: 35, hydrationDelta: 0, quantity: 1 } });
    if (!result.committed) return;
    expect(result.economy.lots[0]).toMatchObject({ quantity: 1, ownershipRevision: 1 });
    expect(result.survival).toMatchObject({ satiety: 85, hydration: 60, revision: 1 });
  });

  it("rejects raw, dried, spoiled, contaminated, missing-lineage and stale CAS without mutation", () => {
    const raw = setup({ ...cooked(), lotId: "lot.raw", itemId: "food.raw_small_game_meat", freshness: "raw" });
    expect(applyInventoryConsumption(raw.economy, raw.survival, raw.action)).toMatchObject({ committed: false, reason: "feature_unavailable" });
    const dried = setup({ ...cooked(), lotId: "lot.dried", itemId: "food.dried_game_meat", freshness: "cured" });
    expect(applyInventoryConsumption(dried.economy, dried.survival, dried.action)).toMatchObject({ committed: false, reason: "feature_unavailable" });
    const spoiled = setup({ ...cooked(), freshness: "spoiled" });
    expect(applyInventoryConsumption(spoiled.economy, spoiled.survival, spoiled.action)).toMatchObject({ committed: false, reason: "spoiled" });
    const contaminated = setup({ ...cooked(), contaminationMu: 1 });
    expect(applyInventoryConsumption(contaminated.economy, contaminated.survival, contaminated.action)).toMatchObject({ committed: false, reason: "ineligible_input" });
    const missing = cooked(); delete (missing as TradeLot & { wildlifeProvenance?: unknown }).wildlifeProvenance;
    const noLineage = setup(missing);
    expect(applyInventoryConsumption(noLineage.economy, noLineage.survival, noLineage.action)).toMatchObject({ committed: false, reason: "ineligible_input" });
    const stale = setup();
    expect(applyInventoryConsumption(stale.economy, stale.survival, { ...stale.action, expectedInventoryRevision: 1 }))
      .toMatchObject({ committed: false, reason: "revision_conflict" });
  });
});
