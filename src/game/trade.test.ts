import { describe, expect, it } from "vitest";
import { TradeSystem, createDemoTradeLots, type TradeLot } from "./trade";

const lot = (overrides: Partial<TradeLot> = {}): TradeLot => ({
  lotId: "lot.test.1",
  itemId: "food.cooked_game_meat",
  sourceLotIds: ["lot.source.test"],
  legalOwnerId: "player.test",
  stolenFromId: null,
  processingTransactionId: "process.test",
  quantity: 1,
  originKind: "natural",
  naturalFraction: 1,
  freshness: "fresh",
  qualityMultiplier: 1,
  contaminationMu: 0,
  economyEligible: true,
  reserved: false,
  equipped: false,
  ownershipRevision: 0,
  freshnessRevision: 0,
  ...overrides,
});

describe("TradeSystem", () => {
  it("filters items by profession before pricing", () => {
    const trade = new TradeSystem(createDemoTradeLots());

    expect(trade.getEligibility("settlement.butcher", "lot.cooked-game-meat.1", 1).reason).toBe("eligible");
    expect(trade.getEligibility("settlement.tanner", "lot.cooked-game-meat.1", 1).reason).toBe(
      "category_not_accepted",
    );
    expect(trade.getEligibility("settlement.tanner", "lot.cured-leather.1", 1).reason).toBe("eligible");
  });

  it("rejects invalid save data without granting graybox inventory", () => {
    const invalid = TradeSystem.fromSave({ schema: "tokipona.trade.v0.1", lots: [{ lotId: "bad" }] });

    expect(invalid.snapshot().lots).toEqual([]);
    expect(invalid.snapshot().coin).toBe(0);
  });

  it("keeps first glyph rubbings outside the economy", () => {
    const trade = new TradeSystem(createDemoTradeLots());

    const result = trade.getEligibility("settlement.archivist", "lot.first-glyph-rubbing.1", 1);

    expect(result.reason).toBe("merchant_unavailable");
    expect(trade.getEligibility("settlement.butcher", "lot.first-glyph-rubbing.1", 1).reason).toBe(
      "knowledge_or_quest_bound",
    );
  });

  it("requires raw hides to be processed during the prologue", () => {
    const trade = new TradeSystem(createDemoTradeLots());

    expect(trade.getEligibility("settlement.tanner", "lot.raw-hide.1", 1).reason).toBe("prologue_restriction");
    expect(trade.getEligibility("settlement.butcher", "lot.raw-hide.1", 1).reason).toBe("category_not_accepted");
  });

  it("rejects a zero-coin excess tier, then commits the payable quantity once", () => {
    const trade = new TradeSystem([lot({ quantity: 3 })]);
    const rejected = trade.createSellQuote("settlement.butcher", "lot.test.1", 3, 100);
    const quoted = trade.createSellQuote("settlement.butcher", "lot.test.1", 2, 100);

    expect(rejected.eligibility.reason).toBe("zero_price");
    expect(quoted.quote).toMatchObject({ fullPriceUnits: 2, excessUnits: 0, totalCoin: 4 });
    const committed = trade.commitSellQuote(quoted.quote!.quoteId, "trade.tx.1", 101);
    const duplicate = trade.commitSellQuote(quoted.quote!.quoteId, "trade.tx.1", 102);
    const conflictingPayload = trade.commitSellQuote("another.quote", "trade.tx.1", 103);

    expect(committed.committed).toBe(true);
    expect(committed.snapshot.coin).toBe(4);
    expect(committed.snapshot.lots[0]?.quantity).toBe(1);
    expect(duplicate.duplicate).toBe(true);
    expect(conflictingPayload.reason).toBe("transaction_payload_conflict");
    expect(conflictingPayload.snapshot.coin).toBe(4);
  });

  it("rejects impossible quality and contamination values", () => {
    const trade = new TradeSystem([
      lot({ lotId: "lot.quality", qualityMultiplier: 2 }),
      lot({ lotId: "lot.contamination", contaminationMu: -1 }),
    ]);

    expect(trade.getEligibility("settlement.butcher", "lot.quality", 1).reason).toBe("quality_too_low");
    expect(trade.getEligibility("settlement.butcher", "lot.contamination", 1).reason).toBe("contamination_rejected");
  });

  it("expires unconfirmed quotes after five active minutes", () => {
    const trade = new TradeSystem([lot()]);
    const quoted = trade.createSellQuote("settlement.butcher", "lot.test.1", 1, 20);

    const result = trade.commitSellQuote(quoted.quote!.quoteId, "trade.tx.expired", 321);

    expect(result.reason).toBe("quote_expired");
    expect(result.snapshot.coin).toBe(0);
    expect(result.snapshot.lots[0]?.quantity).toBe(1);
  });

  it("invalidates competing quotes after one changes demand and inventory", () => {
    const trade = new TradeSystem([lot({ quantity: 2 })]);
    const first = trade.createSellQuote("settlement.butcher", "lot.test.1", 1, 0).quote!;
    const second = trade.createSellQuote("settlement.butcher", "lot.test.1", 1, 0).quote!;

    trade.commitSellQuote(first.quoteId, "trade.tx.first", 1);
    const stale = trade.commitSellQuote(second.quoteId, "trade.tx.second", 1);

    expect(stale.reason).toBe("quote_stale");
    expect(stale.snapshot.lots[0]?.quantity).toBe(1);
  });

  it("does not persist pending quotes but does persist committed receipts", () => {
    const trade = new TradeSystem([lot()]);
    const quote = trade.createSellQuote("settlement.butcher", "lot.test.1", 1, 0).quote!;
    trade.commitSellQuote(quote.quoteId, "trade.tx.persisted", 1);

    const restored = TradeSystem.fromSave(JSON.parse(JSON.stringify(trade.toSave())));
    const missingQuote = restored.commitSellQuote(quote.quoteId, "trade.tx.new", 2);
    const duplicate = restored.commitSellQuote(quote.quoteId, "trade.tx.persisted", 2);

    expect(missingQuote.reason).toBe("quote_not_found");
    expect(duplicate.reason).toBe("duplicate_transaction");
    expect(duplicate.snapshot.coin).toBe(2);
  });
});
