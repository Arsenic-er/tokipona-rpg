import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy } from "./economy-state";
import { createDemoTradeLots } from "./trade";
import { GameSession } from "../session/game-session";
import { VerifiedTradeSession } from "./verified-trade-session";
import { commitSessionProposal, proposeVerifiedTradeQuote, proposeVerifiedTradeSale } from "../session/adapters";

const create = () => {
  const lot = createDemoTradeLots().find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
  return new VerifiedTradeSession(GameSession.create({ sessionId: "save.formal.trade",
    mp: { currentMp: 10, maxMp: 10, worldVersion: 0 }, currentSceneId: "scene.valley.settlement",
    economy: { ...createEmptySessionEconomy(), lots: [{ ...lot, legalOwnerId: "save.formal.trade", quantity: 2 }] } }));
};

const request = { playerSaveId: "save.formal.trade", merchantId: "settlement.butcher",
  lotId: "lot.cooked-game-meat.1", quantity: 1, operationId: "sell.cooked.0", playerPositionPx: { x: 488, y: 456 } };

describe("formal verified trade session", () => {
  it("atomically persists quote sequence before confirm and commits only its remembered quote", () => {
    const trade = create();
    const issued = trade.issue(request);
    expect(issued.accepted).toBe(true);
    if (!issued.accepted) return;
    expect(trade.session.snapshot().economy).toMatchObject({ quoteSequence: 1, inventoryRevision: issued.quote.inventoryRevision });
    expect(trade.confirm(issued.quote.quoteId, { playerPositionPx: request.playerPositionPx, sceneRevision: trade.session.snapshot().world.revision })).toEqual({ accepted: true, duplicate: false });
    expect(trade.session.snapshot().economy).toMatchObject({ coin: 2, walletRevision: 1, quoteSequence: 1 });
    expect(trade.confirm(issued.quote.quoteId, { playerPositionPx: request.playerPositionPx, sceneRevision: trade.session.snapshot().world.revision })).toMatchObject({ accepted: false, reason: "quote_not_issued_in_this_session" });
  });

  it("clears the ephemeral quote registry on reload even when the old quote object remains outside", () => {
    const trade = create();
    const issued = trade.issue(request);
    expect(issued.accepted).toBe(true);
    if (!issued.accepted) return;
    const externallyHeldQuote = issued.quote;
    const loaded = VerifiedTradeSession.fromSave(JSON.parse(JSON.stringify(trade.toSave())));
    expect(loaded.confirm(externallyHeldQuote.quoteId, { playerPositionPx: request.playerPositionPx, sceneRevision: loaded.session.snapshot().world.revision })).toMatchObject({ accepted: false, reason: "quote_not_issued_in_this_session" });
    expect(loaded.session.snapshot().economy).toMatchObject({ coin: 0, quoteSequence: 1 });
    expect(loaded.issue(request)).toMatchObject({ accepted: false, duplicate: false,
      reason: "operation_already_committed_before_this_runtime" });
  });

  it("rejects remote quote issuance without advancing quote or inventory revisions", () => {
    const trade = create(); const before = trade.session.snapshot().economy;
    expect(trade.issue({ ...request, operationId: "sell.remote", playerPositionPx: { x: 32, y: 32 } }))
      .toMatchObject({ accepted: false });
    expect(trade.session.snapshot().economy).toEqual(before);
  });

  it("atomically records lazy-decay evaluation and the resulting inventory revision before confirm", () => {
    const lot = createDemoTradeLots().find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
    const base = GameSession.create({ sessionId: "save.formal.trade.decay.base", mp: { currentMp: 1, maxMp: 1, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement" }).snapshot().survival;
    const trade = new VerifiedTradeSession(GameSession.create({ sessionId: "save.formal.trade.decay",
      mp: { currentMp: 10, maxMp: 10, worldVersion: 0 }, currentSceneId: "scene.valley.settlement",
      survival: { ...base, worldTicks: 60 }, economy: { ...createEmptySessionEconomy(), activeWorldTick: 60,
        lots: [{ ...lot, legalOwnerId: "save.formal.trade.decay", quantity: 2 }] } }));
    const issued = trade.issue({ ...request, playerSaveId: "save.formal.trade.decay", operationId: "sell.decay" });
    expect(issued.accepted).toBe(true);
    if (!issued.accepted) return;
    expect(issued.quote.inventoryRevision).toBe(1);
    expect(trade.session.snapshot().economy.lots[0]!.wildlifeProvenance).toMatchObject({ lastDecayEvalTick: 60 });
  });

  it("requires a non-serialized live issue capability even for a valid externally held sale proposal", () => {
    const trade = create();
    const proposal = proposeVerifiedTradeQuote(trade.session, request, { playerPositionPx: request.playerPositionPx,
      sceneRevision: trade.session.snapshot().world.revision, operationId: "sell.external" });
    expect(proposal.accepted).toBe(true);
    if (!proposal.accepted) return;
    const issued = commitSessionProposal(trade.session, proposal.batch);
    expect(issued.committed).toBe(true);
    const externallyHeldSale = proposeVerifiedTradeSale(issued.session, proposal.quote, proposal.issuedEventId,
      { playerPositionPx: request.playerPositionPx, sceneRevision: issued.session.snapshot().world.revision });
    const reloaded = GameSession.fromSave(JSON.parse(JSON.stringify(issued.session.toSave())));
    expect(commitSessionProposal(reloaded, externallyHeldSale)).toMatchObject({ committed: false, reason: "invalid_event" });
    expect(commitSessionProposal(issued.session, externallyHeldSale)).toMatchObject({ committed: true });
  });

  it("rejects non-finite forged proximity coordinates", () => {
    const trade = create();
    const proposal = proposeVerifiedTradeQuote(trade.session, request, { playerPositionPx: request.playerPositionPx,
      sceneRevision: trade.session.snapshot().world.revision, operationId: "sell.nan" });
    expect(proposal.accepted).toBe(true);
    if (!proposal.accepted) return;
    const draft = proposal.batch.drafts[0]!;
    const payload = draft.payload as Extract<typeof draft.payload, { quote: unknown }>;
    const forged = { ...proposal.batch, drafts: [{ ...draft, payload: { ...payload, playerPositionPx: { x: Number.NaN, y: 456 } } }] };
    expect(commitSessionProposal(trade.session, forged)).toMatchObject({ committed: false, reason: "invalid_event" });
  });
});
