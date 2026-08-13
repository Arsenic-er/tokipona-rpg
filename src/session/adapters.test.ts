import { describe, expect, it } from "vitest";
import { CisternDemoController } from "../game/cistern-demo";
import { createWildlifeLifeRecord } from "../game/life-corpse-ledger";
import { SurvivalSystem } from "../game/survival";
import { TradeSystem, createDemoTradeLots } from "../game/trade";
import { CisternLearningSession } from "../learning/cistern-session";
import { readVerifiedCapabilityMilestoneContract } from "./capability-contract";
import { GameSession, adaptTradeSave, type CapabilityMilestoneCommitPayload } from "./game-session";
import {
  adaptRuntimeCheckpoint,
  commitSessionProposal,
  proposeCheckpoint,
  proposeCapabilityMilestone,
  proposeCisternCast,
  proposeCisternRecovery,
  proposeLearningReplacement,
  proposeQuestStage,
  proposeSurvivalTransaction,
  proposeTradeQuoteSequence,
  proposeTradeSale,
  proposeWildlifeDamage,
  proposeWildlifeLifeRegistration,
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
    const trade = new TradeSystem(createDemoTradeLots());
    let session = GameSession.create({
      sessionId: "save.adapter.e2e",
      mp: { currentMp: 24, maxMp: 26, worldVersion: 1 },
      currentSceneId: "scene.n00.arrival",
      economy: adaptTradeSave(trade.toSave()),
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

    const sellable = trade.snapshot().lots.find((lot) => lot.economyEligible && lot.quantity > 0);
    expect(sellable).toBeDefined();
    const merchant: import("../game/trade").MerchantId = sellable?.itemId.includes("meat")
      ? "settlement.butcher"
      : "settlement.tanner";
    const quote = trade.createSellQuote(merchant, sellable!.lotId, 1, 1);
    expect(quote.accepted).toBe(true);
    commit = commitSessionProposal(session, requireBatch(proposeTradeQuoteSequence(session, quote, trade.toSave())));
    expect(commit.committed).toBe(true);
    session = commit.session;
    expect(session.snapshot().economy.quoteSequence).toBe(1);
    const tradeResult = trade.commitSellQuote(quote.quote!.quoteId, "trade.e2e.sale", 1);
    commit = commitSessionProposal(session, requireBatch(proposeTradeSale(session, tradeResult, trade.toSave())));
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

  it("reads the chapter machine projection and atomically proposes the pre-cistern capability milestone", () => {
    const binding = {
      sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
    };
    const projection = {
      sourcePath: binding.sourcePath,
      sourceDigest: `sha256:${"c".repeat(64)}`,
      contractRevision: "0.1.0",
      capacityMilestones: [{
        milestoneId: binding.milestoneId,
        writerEvent: binding.writerEvent,
        resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
      }],
    };
    const contract = readVerifiedCapabilityMilestoneContract(projection, binding);
    const session = GameSession.create({
      sessionId: "save.adapter.capacity",
      mp: { currentMp: 17, maxMp: 24, worldVersion: 9 },
      currentSceneId: "scene.valley.service_channel",
    });
    const committed = commitSessionProposal(
      session,
      proposeCapabilityMilestone("evidence-package.pre-cistern.001", contract),
    );
    expect(committed).toMatchObject({ committed: true, failedDraftId: null, reason: null });
    expect(committed.session.snapshot().capabilities).toMatchObject({
      expressionCapacityWords: 2,
      focusSlots: 2,
      revision: 1,
    });
    expect(committed.session.snapshot().mp).toEqual({ currentMp: 17, maxMp: 26, worldVersion: 10 });
    expect(committed.session.snapshot().capabilities.appliedMilestones.pre_cistern_length_phrase)
      .toMatchObject({ writerEvent: binding.writerEvent, maxMp: 26 });

    const duplicateMilestone = commitSessionProposal(
      committed.session,
      proposeCapabilityMilestone("evidence-package.pre-cistern.002", contract),
    );
    expect(duplicateMilestone).toMatchObject({ committed: false, reason: "duplicate_milestone" });
    expect(duplicateMilestone.session).toBe(committed.session);
  });

  it("fails closed for an unverified capability object or a mismatched task binding", () => {
    const forged = {
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
      sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
      sourceDigest: `sha256:${"d".repeat(64)}`,
      contractRevision: "0.1.0",
      resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
    } as CapabilityMilestoneCommitPayload;
    expect(() => proposeCapabilityMilestone("forged", forged)).toThrow(/verified content reader/);
    expect(() => readVerifiedCapabilityMilestoneContract({
      sourcePath: forged.sourcePath,
      sourceDigest: forged.sourceDigest,
      contractRevision: forged.contractRevision,
      capacityMilestones: [{
        milestoneId: forged.milestoneId,
        writerEvent: "wrong_writer",
        resultingState: forged.resultingState,
      }],
    }, {
      sourcePath: forged.sourcePath,
      milestoneId: forged.milestoneId,
      writerEvent: forged.writerEvent,
    })).toThrow(/writer event/);
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
  it("adapts wildlife registration and lethal damage to single aggregate events", () => {
    let session = GameSession.create({
      sessionId: "save.adapter.wildlife",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.valley.den_bypass",
    });
    const life = createWildlifeLifeRecord({
      lifeInstanceId: "life.adapter.rabbit",
      regionSaveId: "region-save.valley",
      regionId: "valley_prologue",
      entityId: "wildlife.rabbit.valley",
      species: "rabbit",
      ageClass: "adult",
      spawnGeneration: 0,
      spawnSequence: 1,
      harvestProfileId: "harvest.rabbit.v0.1",
      maxHp: 8,
      registeredAtWorldTick: 1,
    });
    let commit = commitSessionProposal(session, proposeWildlifeLifeRegistration("adapter.register", life));
    expect(commit.committed).toBe(true);
    session = commit.session;
    const sameRegistration = commitSessionProposal(
      session,
      proposeWildlifeLifeRegistration("adapter.register.again", life),
    );
    expect(sameRegistration).toMatchObject({
      committed: false,
      reason: "life_already_registered",
    });
    const conflictingLife = { ...life, maxHp: 9, currentHp: 9 };
    const conflictingRegistration = commitSessionProposal(
      session,
      proposeWildlifeLifeRegistration("adapter.register.conflict", conflictingLife),
    );
    expect(conflictingRegistration).toMatchObject({
      committed: false,
      reason: "life_registration_conflict",
    });
    const lethal = proposeWildlifeDamage(session, {
      transactionId: "adapter.death",
      lifeInstanceId: life.lifeInstanceId,
      expectedLifeRevision: 0,
      damage: 8,
      causeClass: "clean_tool",
      worldTick: 2,
      position: { sceneId: "scene.valley.den_bypass", x: 1, y: 2 },
    });
    expect(lethal.drafts).toHaveLength(1);
    expect(lethal.drafts[0]?.type).toBe("wildlife_death_committed");
    commit = commitSessionProposal(session, lethal);
    expect(commit.committed).toBe(true);
    expect(commit.session.lifeCorpseLedgerSnapshot().lives[life.lifeInstanceId]?.state).toBe("dead");
    expect(commit.session.snapshot().world.flags).toEqual({});
  });
});
