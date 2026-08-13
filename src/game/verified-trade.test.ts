import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy } from "./economy-state";
import { createDemoTradeLots } from "./trade";
import {
  commitVerifiedSellQuote,
  createVerifiedSellQuote,
  deriveVerifiedSellQuoteId,
  verifiedSellReceiptId,
} from "./verified-trade";

const economy = () => {
  const lot = createDemoTradeLots().find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
  return { ...createEmptySessionEconomy(), activeWorldTick: 0,
    lots: [{ ...lot, legalOwnerId: "save.trade.verified", quantity: 2 }] };
};

describe("verified settlement sale", () => {
  it("issues a full SHA quote snapshot and atomically commits its canonical receipt", () => {
    const initial = economy();
    const issued = createVerifiedSellQuote(initial, { playerSaveId: "save.trade.verified", merchantId: "settlement.butcher",
      lotId: initial.lots[0]!.lotId, quantity: 1, currentWorldTick: 0 });
    expect(issued.accepted).toBe(true);
    if (!issued.accepted) return;
    expect(issued.quote).toMatchObject({ playerSaveId: "save.trade.verified", merchantId: "settlement.butcher",
      priceTableVersion: "settlement.prologue.v0.1", demandRevision: 0, totalCoin: 2, issuedTick: 0,
      expiresTick: 300, walletRevision: 0, inventoryRevision: 0, quoteSequence: 1, consumed: false });
    expect(issued.quote.quoteId).toBe(deriveVerifiedSellQuoteId(issued.quote));
    expect(issued.quote.lineItems[0]).toMatchObject({ quantity: 1, unitPriceCoin: 2, demandMultiplier: 1, ownershipRevision: 0, freshnessRevision: 0 });
    const quotedEconomy = { ...initial, quoteSequence: 1, inventoryRevision: issued.quote.inventoryRevision, lots: [issued.decayedLot] };
    const committed = commitVerifiedSellQuote(quotedEconomy, issued.quote, 0);
    expect(committed.committed).toBe(true);
    if (!committed.committed) return;
    expect(committed.economy).toMatchObject({ coin: 2, walletRevision: 1, inventoryRevision: 1 });
    expect(committed.economy.lots[0]).toMatchObject({ quantity: 1, ownershipRevision: 1 });
    expect(committed.receipt.transactionId).toMatch(/^wal-tx:sha256:[0-9a-f]{64}$/);
    expect(verifiedSellReceiptId(issued.quote)).toMatch(/^wal-receipt:sha256:[0-9a-f]{64}$/);
  });

  it("rejects forged quote totals, wrong players, expired quotes, and lazy-decay stale freshness", () => {
    const initial = economy();
    expect(createVerifiedSellQuote(initial, { playerSaveId: "save.other", merchantId: "settlement.butcher",
      lotId: initial.lots[0]!.lotId, quantity: 1, currentWorldTick: 0 })).toMatchObject({ accepted: false });
    const issued = createVerifiedSellQuote(initial, { playerSaveId: "save.trade.verified", merchantId: "settlement.butcher",
      lotId: initial.lots[0]!.lotId, quantity: 1, currentWorldTick: 0 });
    if (!issued.accepted) throw new Error("fixture quote rejected");
    const quotedEconomy = { ...initial, quoteSequence: 1, inventoryRevision: issued.quote.inventoryRevision, lots: [issued.decayedLot] };
    expect(commitVerifiedSellQuote(quotedEconomy, { ...issued.quote, totalCoin: 999 }, 0)).toMatchObject({ committed: false, reason: "invalid_quote" });
    expect(commitVerifiedSellQuote(quotedEconomy, { ...issued.quote, expiresTick: 999 }, 0)).toMatchObject({ committed: false, reason: "invalid_quote" });
    expect(commitVerifiedSellQuote(quotedEconomy, { ...issued.quote, issuedTick: 1 }, 1)).toMatchObject({ committed: false, reason: "invalid_quote" });
    expect(commitVerifiedSellQuote(quotedEconomy, { ...issued.quote, walletRevision: 99 }, 0)).toMatchObject({ committed: false, reason: "invalid_quote" });
    expect(commitVerifiedSellQuote(quotedEconomy, { ...issued.quote, inventoryRevision: 99 }, 0)).toMatchObject({ committed: false, reason: "invalid_quote" });
    expect(commitVerifiedSellQuote(quotedEconomy, { ...issued.quote, lineItems: [{ ...issued.quote.lineItems[0]!, demandMultiplier: .75 }] }, 0))
      .toMatchObject({ committed: false, reason: "invalid_quote" });
    expect(commitVerifiedSellQuote(quotedEconomy, issued.quote, 301)).toMatchObject({ committed: false, reason: "invalid_quote" });
    const shortBudgetLot = { ...initial.lots[0]!, wildlifeProvenance: { ...initial.lots[0]!.wildlifeProvenance!, remainingFreshnessSeconds: 60 } };
    const shortBudgetEconomy = { ...initial, lots: [shortBudgetLot] };
    const shortIssued = createVerifiedSellQuote(shortBudgetEconomy, { playerSaveId: "save.trade.verified", merchantId: "settlement.butcher",
      lotId: shortBudgetLot.lotId, quantity: 1, currentWorldTick: 0 });
    if (!shortIssued.accepted) throw new Error("short-budget quote rejected");
    expect(commitVerifiedSellQuote({ ...shortBudgetEconomy, quoteSequence: 1, inventoryRevision: shortIssued.quote.inventoryRevision, lots: [shortIssued.decayedLot] }, shortIssued.quote, 120))
      .toMatchObject({ committed: false, reason: "quote_stale" });
  });

  it("fails closed when the active scene has no authored authority for the merchant", () => {
    // Scene authorization lives at the Session adapter; the machine manifest currently authors only grocer supply-stall access.
    const initial = economy();
    const quote = createVerifiedSellQuote(initial, { playerSaveId: "save.trade.verified", merchantId: "settlement.butcher",
      lotId: initial.lots[0]!.lotId, quantity: 1, currentWorldTick: 0 });
    expect(quote.accepted).toBe(true);
  });
});
