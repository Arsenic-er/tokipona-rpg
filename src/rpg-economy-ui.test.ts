import { describe, expect, it } from "vitest";
import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import { GIFTED_RABBIT_ENTITY_ID } from "./game/gifted-carcass";
import { deriveEconomyUiModel } from "./rpg-economy-ui";

const snapshot = (overrides: Readonly<Record<string, unknown>> = {}): PrologueFlowSnapshot => ({
  mode: "settlement",
  sessionId: "player.economy-ui",
  runtime: { sceneId: "scene.valley.settlement" },
  session: {
    sessionId: "player.economy-ui",
    economy: { coin: 7, lots: [], workOrders: [], processingReceipts: [] },
    survival: { satiety: 61, hydration: 72 },
    lifeCorpseLedger: { corpses: {} },
  },
  settlement: {}, arrival: null, infrastructure: null, cistern: null, wildlife: null, killCount: 0,
  ...overrides,
} as unknown as PrologueFlowSnapshot);

describe("RPG economy UI model", () => {
  it("is visible only in settlement and starts with a gift action", () => {
    expect(deriveEconomyUiModel(snapshot())).toMatchObject({
      panelVisible: true, coin: 7, satiety: 61, hydration: 72,
      canAcceptGift: true, canHarvest: false, zeroLearningReward: true, zeroAttackReward: true,
    });
    expect(deriveEconomyUiModel(snapshot({ mode: "wildlife" })).panelVisible).toBe(false);
  });

  it("derives carcass, meat and processing actions without retaining UI inventory state", () => {
    const active = snapshot({ session: {
      sessionId: "player.economy-ui", economy: {
        coin: 7,
        lots: [{ lotId: "raw.1", itemId: "food.raw_small_game_meat", quantity: 2,
          legalOwnerId: "player.economy-ui", economyEligible: true, reserved: false, equipped: false,
          stolenFromId: null, freshness: "raw", wildlifeProvenance: {} }],
        workOrders: [{ workOrderId: "work.1", recipeId: "cook.game_meat.v0.1", status: "reserved", revision: 1 }],
        processingReceipts: [],
      }, survival: { satiety: 61, hydration: 72 }, lifeCorpseLedger: { corpses: {
        "corpse.1": { entityId: GIFTED_RABBIT_ENTITY_ID, tissueSlots: [
          { tissueSlotId: "meat", remainingQuantity: 1 }, { tissueSlotId: "hide", remainingQuantity: 1 },
        ] },
      } },
    } });
    expect(deriveEconomyUiModel(active)).toMatchObject({
      giftedCarcassPresent: true, harvestableMeat: 1, rawMeat: 2, cookedMeat: 0,
      cookingStatus: "reserved", canAcceptGift: false, canHarvest: true,
      canStartCooking: false, canWorkCooking: true, canCompleteCooking: false,
      canClaimCooking: false, canConsumeCooked: false,
    });
  });

  it("only exposes owned, eligible, unreserved wildlife lots to verified selling", () => {
    const lot = (lotId: string, changes: Readonly<Record<string, unknown>> = {}) => ({
      lotId, itemId: "food.cooked_game_meat", quantity: 1, legalOwnerId: "player.economy-ui",
      economyEligible: true, reserved: false, equipped: false, stolenFromId: null,
      freshness: "fresh", wildlifeProvenance: {}, ...changes,
    });
    const model = deriveEconomyUiModel(snapshot({ session: {
      sessionId: "player.economy-ui", survival: { satiety: 61, hydration: 72 }, lifeCorpseLedger: { corpses: {} },
      economy: { coin: 7, workOrders: [], processingReceipts: [], lots: [lot("ok"), lot("reserved", { reserved: true }),
        lot("unowned", { legalOwnerId: null }), lot("foreign", { legalOwnerId: "player.other" }),
        lot("legacy", { wildlifeProvenance: undefined })] },
    } }));
    expect(model.cookedMeat).toBe(3);
    expect(model.sellableLots).toEqual([{ lotId: "ok", itemId: "food.cooked_game_meat", quantity: 1, freshness: "fresh" }]);
  });
});
