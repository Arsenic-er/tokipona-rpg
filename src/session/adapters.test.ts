import { describe, expect, it } from "vitest";
import { CisternDemoController } from "../game/cistern-demo";
import { SurvivalSystem } from "../game/survival";
import { TradeSystem, createDemoTradeLots } from "../game/trade";
import { CisternLearningSession } from "../learning/cistern-session";
import { GameSession } from "./game-session";
import {
  adaptRuntimeCheckpoint,
  commitSessionProposal,
  proposeCheckpoint,
  proposeCisternCast,
  proposeCisternRecovery,
  proposeLearningReplacement,
  proposeQuestStage,
  proposeSurvivalTransaction,
  proposeTradeTransaction,
} from "./adapters";

const requireBatch = (
  proposal: import("./adapters").SessionProposalResult,
): import("./adapters").SessionProposalBatch => {
  expect(proposal.accepted).toBe(true);
  if (!proposal.accepted) throw new Error("proposal was rejected");
  return proposal.batch;
};

describe("GameSession transaction adapters", () => {
  it("persists an end-to-end executor chain once and replays it without duplication", () => {
    let session = GameSession.create({
      sessionId: "save.adapter.e2e",
      mp: { currentMp: 24, maxMp: 26, worldVersion: 1 },
      currentSceneId: "scene.n00.arrival",
    });

    const cistern = new CisternDemoController({ initialMp: 24, maxMp: 26 });
    cistern.setExpression("telo_lili");
    cistern.setDirection("east");
    cistern.targetCurrentReceiver();
    cistern.beginPreview();
    const cast = cistern.confirmPending("cast.e2e.short");
    let commit = commitSessionProposal(session, requireBatch(proposeCisternCast(cast)));
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().mp).toMatchObject({ currentMp: 18, maxMp: 26, worldVersion: 2 });

    const learning = new CisternLearningSession({
      playerSaveId: "save.adapter.e2e",
      expressionCapacity: 2,
    });
    const recovery = cistern.applyMpRecovery(learning.proposeMeditationRecovery({
      recoveryId: "meditation.e2e.wrong",
      answerAccepted: false,
      evidenceEligible: false,
    }));
    commit = commitSessionProposal(session, requireBatch(proposeCisternRecovery(recovery)));
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().mp).toMatchObject({ currentMp: 21, worldVersion: 2 });

    const discovery = learning.discoverGlyph({
      wordId: "telo",
      occurrenceId: "n01.telo.001",
      locationId: "scene.n01.stream",
    });
    commit = commitSessionProposal(
      session,
      requireBatch(proposeLearningReplacement("learning.e2e.telo", discovery)),
    );
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().learning.words.telo?.discoveryState).toBe("discovered");

    const survival = SurvivalSystem.fromSave(session.snapshot().survival);
    const survivalTransactionId = "survival.e2e.ration";
    const ration = survival.consume("food.travel_ration", survivalTransactionId);
    commit = commitSessionProposal(
      session,
      requireBatch(proposeSurvivalTransaction(survivalTransactionId, ration, survival.toSave())),
    );
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().survival.travelRations).toBe(0);

    const trade = new TradeSystem(createDemoTradeLots());
    const sellable = trade.snapshot().lots.find((lot) => lot.economyEligible && lot.quantity > 0);
    expect(sellable).toBeDefined();
    const merchant: import("../game/trade").MerchantId = sellable?.itemId.includes("meat")
      ? "settlement.butcher"
      : "settlement.tanner";
    const quote = trade.createSellQuote(merchant, sellable!.lotId, 1, 1);
    expect(quote.accepted).toBe(true);
    const tradeResult = trade.commitSellQuote(quote.quote!.quoteId, "trade.e2e.sale", 1);
    commit = commitSessionProposal(session, requireBatch(proposeTradeTransaction(tradeResult, trade.toSave())));
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().economy.coin).toBeGreaterThan(0);

    commit = commitSessionProposal(
      session,
      proposeQuestStage("quest.e2e.stage1", "quest.prologue", "return_to_settlement", 1),
    );
    expect(commit.committed).toBe(true);
    session = commit.session;

    const runtimeCheckpoint = adaptRuntimeCheckpoint({
      checkpointId: "checkpoint.n02.square",
      sceneId: "scene.n02.settlement",
      positionPx: { x: 64, y: 96 },
      revision: 1,
    });
    commit = commitSessionProposal(
      session,
      proposeCheckpoint("checkpoint.e2e.n02", runtimeCheckpoint),
    );
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().checkpoint).toEqual(runtimeCheckpoint);

    const save = session.toSave();
    const loaded = GameSession.load(save);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    expect(loaded.session.events()).toEqual(session.events());
    expect(loaded.session.snapshot().receiptIndex).toHaveProperty("cast.e2e.short");
    expect(loaded.session.snapshot().receiptIndex).toHaveProperty("meditation:meditation.e2e.wrong");
    expect(loaded.session.snapshot().receiptIndex).toHaveProperty("survival.e2e.ration");
    expect(loaded.session.snapshot().receiptIndex).toHaveProperty("trade.e2e.sale");

    const duplicateBatch = requireBatch(proposeCisternCast(cast));
    const duplicate = commitSessionProposal(loaded.session, duplicateBatch);
    expect(duplicate).toMatchObject({ committed: false, reason: "duplicate_event" });
    expect(duplicate.session.snapshot()).toEqual(loaded.session.snapshot());
  });

  it("commits batches atomically and rejects checkpoint revision regression", () => {
    const session = GameSession.create({
      sessionId: "save.adapter.atomic",
      mp: { currentMp: 10, maxMp: 10, worldVersion: 0 },
      currentSceneId: "scene.n00",
      checkpoint: { id: "checkpoint.initial", sceneId: "scene.n00", position: { x: 0, y: 0 }, revision: 2 },
    });
    const before = session.snapshot();
    const rejected = commitSessionProposal(session, proposeCheckpoint("checkpoint.old", {
      id: "checkpoint.old",
      sceneId: "scene.n00",
      position: { x: 8, y: 8 },
      revision: 1,
    }));
    expect(rejected).toMatchObject({ committed: false, reason: "state_regression" });
    expect(rejected.session).toBe(session);
    expect(session.snapshot()).toEqual(before);
    expect(session.snapshot().receiptIndex["checkpoint.old"]).toBeUndefined();
  });
});
