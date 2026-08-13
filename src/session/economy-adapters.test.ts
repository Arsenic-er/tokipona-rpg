import { describe, expect, it } from "vitest";
import { exportSessionEconomyTradeSave } from "../game/economy-state";
import { TradeSystem, createDemoTradeLots } from "../game/trade";
import {
  commitSessionProposal,
  proposeTradeQuoteSequence,
  proposeTradeSale,
  proposeTradeTransaction,
  type SessionProposalBatch,
  type SessionProposalResult,
} from "./adapters";
import { GameSession, adaptTradeSave } from "./game-session";

const batchOf = (proposal: SessionProposalResult): SessionProposalBatch => {
  expect(proposal.accepted).toBe(true);
  if (!proposal.accepted) throw new Error("expected accepted economy proposal");
  return proposal.batch;
};

const setupTrade = () => {
  const trade = new TradeSystem(createDemoTradeLots());
  const session = GameSession.create({
    sessionId: "save.economy.domain",
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: "scene.n02.settlement",
    economy: adaptTradeSave(trade.toSave()),
  });
  const lot = trade.snapshot().lots.find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
  return { trade, session, lot };
};

describe("economy domain transaction adapters", () => {
  it("commits inquiry sequence before sale and never rolls it back after load", () => {
    const { trade, session, lot } = setupTrade();
    const quote = trade.createSellQuote("settlement.butcher", lot.lotId, 1, 20);
    const quoteCommit = commitSessionProposal(session, batchOf(proposeTradeQuoteSequence(session, quote, trade.toSave())));
    expect(quoteCommit.committed).toBe(true);
    expect(quoteCommit.session.snapshot().economy.quoteSequence).toBe(1);

    const loaded = GameSession.fromSave(quoteCommit.session.toSave());
    expect(loaded.snapshot().economy.quoteSequence).toBe(1);
    const restoredTrade = TradeSystem.fromSave(exportSessionEconomyTradeSave(loaded.snapshot().economy));
    const nextQuote = restoredTrade.createSellQuote("settlement.butcher", lot.lotId, 1, 21);
    expect(nextQuote.accepted).toBe(true);
    expect(restoredTrade.snapshot().quoteSequence).toBe(2);
  });

  it("atomically writes both receipts, merchant demand, wallet, and exactly one changed lot", () => {
    const { trade, session: initial, lot } = setupTrade();
    const quote = trade.createSellQuote("settlement.butcher", lot.lotId, 1, 20);
    let commit = commitSessionProposal(initial, batchOf(proposeTradeQuoteSequence(initial, quote, trade.toSave())));
    expect(commit.committed).toBe(true);
    const quoted = commit.session;
    const result = trade.commitSellQuote(quote.quote!.quoteId, "trade.domain.sale.001", 21);
    const saleBatch = batchOf(proposeTradeSale(quoted, result, trade.toSave()));
    expect(saleBatch.drafts).toHaveLength(1);
    expect(saleBatch.drafts[0]?.type).toBe("trade_sale_committed");
    const beforeLots = quoted.snapshot().economy.lots;

    commit = commitSessionProposal(quoted, saleBatch);
    expect(commit.committed).toBe(true);
    const economy = commit.session.snapshot().economy;
    expect(economy.tradeReceipts).toEqual([result.receipt]);
    expect(commit.session.snapshot().receiptIndex["trade.domain.sale.001"]).toMatchObject({ domain: "trade" });
    expect(economy.merchantStates.find((state) => state.merchantId === "settlement.butcher"))
      .toMatchObject({ demandRevision: 1, soldUnitsSinceRestock: 1 });
    expect(economy.lots).toHaveLength(beforeLots.length);
    expect(economy.lots.filter((candidate) => candidate.lotId !== lot.lotId))
      .toEqual(beforeLots.filter((candidate) => candidate.lotId !== lot.lotId));
    expect(economy.lots.find((candidate) => candidate.lotId === lot.lotId)?.quantity).toBe(lot.quantity - 1);

    const loaded = GameSession.fromSave(commit.session.toSave());
    expect(exportSessionEconomyTradeSave(loaded.snapshot().economy)).toEqual(trade.toSave());
  });

  it("deduplicates or conflicts by transaction receipt without partially changing lots", () => {
    const { trade, session: initial, lot } = setupTrade();
    const quote = trade.createSellQuote("settlement.butcher", lot.lotId, 1, 20);
    const quoteCommit = commitSessionProposal(initial, batchOf(proposeTradeQuoteSequence(initial, quote, trade.toSave())));
    const result = trade.commitSellQuote(quote.quote!.quoteId, "trade.domain.sale.duplicate", 21);
    const saleBatch = batchOf(proposeTradeSale(quoteCommit.session, result, trade.toSave()));
    const sold = commitSessionProposal(quoteCommit.session, saleBatch);
    expect(sold.committed).toBe(true);
    const before = sold.session.snapshot().economy;

    const duplicate = structuredClone(saleBatch) as SessionProposalBatch;
    (duplicate.drafts[0] as { eventId: string }).eventId += ".retry";
    const duplicateCommit = commitSessionProposal(sold.session, duplicate);
    expect(duplicateCommit).toMatchObject({ committed: false, reason: "duplicate_receipt" });
    expect(duplicateCommit.session.snapshot().economy).toEqual(before);

    const conflict = structuredClone(duplicate) as SessionProposalBatch;
    (conflict.drafts[0] as { eventId: string }).eventId += ".conflict";
    const payload = (conflict.drafts[0] as unknown as { payload: { tradeReceipt: { coinDelta: number } } }).payload;
    payload.tradeReceipt.coinDelta += 1;
    const conflictCommit = commitSessionProposal(sold.session, conflict);
    expect(conflictCommit).toMatchObject({ committed: false, reason: "receipt_payload_conflict" });
    expect(conflictCommit.session.snapshot().economy).toEqual(before);
  });

  it("rejects stale inventory CAS and keeps every lot and both receipt ledgers unchanged", () => {
    const { trade, session: initial, lot } = setupTrade();
    const quote = trade.createSellQuote("settlement.butcher", lot.lotId, 1, 20);
    const quoteCommit = commitSessionProposal(initial, batchOf(proposeTradeQuoteSequence(initial, quote, trade.toSave())));
    const result = trade.commitSellQuote(quote.quote!.quoteId, "trade.domain.sale.stale", 21);
    const staleSale = batchOf(proposeTradeSale(quoteCommit.session, result, trade.toSave()));
    const currentLot = quoteCommit.session.snapshot().economy.lots.find((candidate) => candidate.lotId === lot.lotId)!;
    const concurrent = commitSessionProposal(quoteCommit.session, {
      transactionId: "inventory.concurrent.touch",
      drafts: [{
        eventId: "session.economy.lot.concurrent.touch",
        type: "economy_lot_changed",
        payload: {
          lotId: currentLot.lotId,
          expectedInventoryRevision: quoteCommit.session.snapshot().economy.inventoryRevision,
          nextInventoryRevision: quoteCommit.session.snapshot().economy.inventoryRevision + 1,
          expectedOwnershipRevision: currentLot.ownershipRevision,
          expectedFreshnessRevision: currentLot.freshnessRevision,
          nextLot: { ...currentLot, ownershipRevision: currentLot.ownershipRevision + 1 },
        },
      }],
    });
    expect(concurrent.committed).toBe(true);
    const before = concurrent.session.snapshot().economy;
    const rejected = commitSessionProposal(concurrent.session, staleSale);
    expect(rejected).toMatchObject({ committed: false, reason: "economy_revision_conflict" });
    expect(rejected.session.snapshot().economy).toEqual(before);
    expect(rejected.session.snapshot().receiptIndex["trade.domain.sale.stale"]).toBeUndefined();
  });

  it("explicitly disables the legacy whole-economy production adapter", () => {
    const { trade } = setupTrade();
    expect(() => proposeTradeTransaction({
      committed: false,
      duplicate: false,
      reason: "quote_not_found",
      messageZh: "disabled",
      snapshot: trade.snapshot(),
    }, trade.toSave())).toThrow(/disabled/);
  });
});
