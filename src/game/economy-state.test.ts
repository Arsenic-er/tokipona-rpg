import { describe, expect, it } from "vitest";
import {
  adaptTradeSaveToSessionEconomy,
  createEmptySessionEconomy,
  exportSessionEconomyTradeSave,
  isSessionEconomyState,
  migrateLegacyEconomySummary,
  normalizeSessionEconomy,
} from "./economy-state";
import { TradeSystem, createDemoTradeLots } from "./trade";

describe("session economy v0.2 state", () => {
  it("round-trips every complete TradeSave field without losing provenance or receipts", () => {
    const trade = new TradeSystem(createDemoTradeLots());
    const lot = trade.snapshot().lots.find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
    const quote = trade.createSellQuote("settlement.butcher", lot.lotId, 1, 12);
    expect(quote.accepted).toBe(true);
    expect(trade.commitSellQuote(quote.quote!.quoteId, "trade.roundtrip.001", 13).committed).toBe(true);

    const source = trade.toSave();
    const economy = adaptTradeSaveToSessionEconomy(source);
    const restored = exportSessionEconomyTradeSave(economy);
    expect(restored).toEqual(source);
    expect(restored.quoteSequence).toBe(1);
    expect(restored.merchantStates.find((state) => state.merchantId === "settlement.butcher"))
      .toMatchObject({ demandRevision: 1, soldUnitsSinceRestock: 1 });
    expect(restored.receipts).toEqual(source.receipts);
    expect(restored.lots).toEqual(source.lots);
  });

  it("retains Session-only work and processing ledgers while adapting an executor save", () => {
    const base = createEmptySessionEconomy();
    const retained = {
      workOrders: [{
        workOrderId: "work.order.001",
        recipeId: "recipe.future.hide",
        inputLotIds: ["lot.future.input"],
        status: "queued" as const,
        revision: 0,
      }],
      processingReceipts: [{
        transactionId: "processing.future.001",
        workOrderId: "work.order.001",
        inputLotIds: ["lot.future.input"],
        outputLotIds: ["lot.future.output"],
        committedWorldTick: 80,
      }],
    };
    const adapted = adaptTradeSaveToSessionEconomy(exportSessionEconomyTradeSave(base), retained);
    expect(adapted.workOrders).toEqual(retained.workOrders);
    expect(adapted.processingReceipts).toEqual(retained.processingReceipts);
    expect(isSessionEconomyState(adapted)).toBe(true);
  });

  it("migrates legacy summary lots without rejecting or laundering unknown provenance", () => {
    const legacy = {
      coin: 7,
      walletRevision: 4,
      inventoryRevision: 9,
      lots: [{
        lotId: "legacy.lot.rare.001",
        itemId: "legacy.removed_mod_item",
        quantity: 3,
        ownershipRevision: 12,
        freshnessRevision: 5,
      }],
    };
    const migrated = migrateLegacyEconomySummary(legacy);
    expect(migrated).toMatchObject({ coin: 7, walletRevision: 4, inventoryRevision: 9, quoteSequence: 0 });
    expect(migrated.lots).toEqual([expect.objectContaining({
      lotId: "legacy.lot.rare.001",
      itemId: "legacy.removed_mod_item",
      quantity: 3,
      ownershipRevision: 12,
      freshnessRevision: 5,
      originKind: "legacy_unknown",
      naturalFraction: 0,
      economyEligible: false,
    })]);
    expect(() => exportSessionEconomyTradeSave(migrated)).toThrow(/unknown to TradeSystem/);
    expect(TradeSystem.fromSave({ ...migrated, schema: "tokipona.trade.v0.1", receipts: [] })
      .snapshot().lots).toEqual([]);
  });

  it("rejects corrupt full schemas instead of silently treating them as legacy summaries", () => {
    const corrupt = { ...createEmptySessionEconomy(), schema: "tokipona.session-economy.corrupt" };
    expect(isSessionEconomyState(corrupt)).toBe(false);
    expect(() => normalizeSessionEconomy(corrupt as never)).toThrow(/legacy economy/);
  });
});
