import { describe, expect, it } from "vitest";
import { CisternDemoController } from "../game/cistern-demo";
import { createWildlifeLifeRecord } from "../game/life-corpse-ledger";
import { createEmptySessionEconomy } from "../game/economy-state";
import { createSafeRangeRuntimeFramePayload, safeRangeInteractionPointPx } from "../game/safe-range-authority";
import type { WildlifeProcessingAction, WildlifeProcessingWorkOrder } from "../game/wildlife-processing";
import { SurvivalSystem } from "../game/survival";
import { TradeSystem, createDemoTradeLots } from "../game/trade";
import { CisternLearningSession } from "../learning/cistern-session";
import { readVerifiedCapabilityMilestoneContract } from "./capability-contract";
import { GameSession, adaptTradeSave, type CapabilityMilestoneCommitPayload } from "./game-session";
import {
  adaptRuntimeCheckpoint,
  commitSessionProposal,
  nextInventoryConsumptionSequence,
  proposeCheckpoint,
  proposeCapabilityMilestone,
  proposeCisternCast,
  proposeCisternRecovery,
  proposeLearningEvidence,
  proposeSafeRangeMaterialTableCompletion,
  proposeSafeRangeRuntimeFrame,
  proposeSafeRangeTransfer,
  proposeInventoryConsumption,
  proposeQuestStage,
  proposeSurvivalTransaction,
  proposeTradeQuoteSequence,
  proposeTradeSale,
  proposeWildlifeDamage,
  proposeWildlifeLifeRegistration,
  proposeWildlifeProcessing,
  proposeWildlifeProcessingInteraction,
  proposeWildlifeProcessingWork,
} from "./adapters";

const FORGED_SAFE_RANGE_SHA = `sha256:${"0".repeat(64)}` as const;

const requireBatch = (
  proposal: import("./adapters").SessionProposalResult,
): import("./adapters").SessionProposalBatch => {
  expect(proposal.accepted).toBe(true);
  if (!proposal.accepted) throw new Error("proposal was rejected");
  return proposal.batch;
};

describe("GameSession transaction adapters", () => {
  it("keeps every public payload-only safe-range proposal outside the ordinary live commit path", () => {
    const session = GameSession.create({ sessionId: "adapter.safe-range.untrusted",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 }, currentSceneId: "scene.valley.safe_range" });
    const transfer = proposeSafeRangeTransfer({
      transactionId: "untrusted.transfer", writerEvent: "safe_range_transfer_passed",
      targetClass: "wood_dummy", targetId: "wood_dummy", normalizedVariantHash: "forged",
      promptLevel: 0, waterSource: "bound_existing", expectedCurrentMp: 24, expectedMpWorldVersion: 0,
      authorityProof: {
        requestHash: "forged", runtimeRevision: 0,
        frameEventId: "untrusted.frame.transfer", frameHash: FORGED_SAFE_RANGE_SHA,
        manifestDigest: FORGED_SAFE_RANGE_SHA, sessionWorldRevision: 0, mpWorldVersion: 0,
      },
      physicsResult: { paidKineticBudgetEu: 1, transferredKineticEu: 1, damageHp: 0,
        targetHpBefore: 6, targetHpAfter: 6, livingOverlap: false },
    });
    expect(commitSessionProposal(session, transfer)).toMatchObject({ committed: false, reason: "invalid_event" });
    const table = proposeSafeRangeMaterialTableCompletion("untrusted.table",
      {
        requestHash: "forged", runtimeRevision: 0, targetId: "safe_range.material_table",
        frameEventId: "untrusted.frame.table", frameHash: FORGED_SAFE_RANGE_SHA,
        manifestDigest: FORGED_SAFE_RANGE_SHA, sessionWorldRevision: 0, mpWorldVersion: 0,
      });
    expect(commitSessionProposal(session, table)).toMatchObject({ committed: false, reason: "invalid_event" });
    const interactionPoint = safeRangeInteractionPointPx("wood_dummy");
    expect(interactionPoint).not.toBeNull();
    const frame = proposeSafeRangeRuntimeFrame(createSafeRangeRuntimeFramePayload({
      transactionId: "untrusted.frame",
      actionKind: "transfer",
      targetId: "wood_dummy",
      requestHash: "forged",
      sessionWorldRevision: session.snapshot().world.revision,
      mpWorldVersion: session.snapshot().mp.worldVersion,
      runtimeRevision: 0,
      playerPositionPx: { x: interactionPoint!.x - 12, y: interactionPoint!.y - 4 },
    }));
    expect(commitSessionProposal(session, frame)).toMatchObject({ committed: false, reason: "invalid_event" });
  });
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
      proposeLearningEvidence("learning.e2e.telo", discovery.proposedEvents[0]!),
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
      currentSceneId: "scene.valley.waterwheel",
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
  it("derives the next consumption sequence from committed event authority", () => {
    const lot = createDemoTradeLots().find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
    let session = GameSession.create({
      sessionId: "save.adapter.consume.sequence",
      mp: { currentMp: 10, maxMp: 10, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement",
      economy: { ...createEmptySessionEconomy(), lots: [{ ...lot,
        legalOwnerId: "save.adapter.consume.sequence", quantity: 3 }] },
    });
    expect(nextInventoryConsumptionSequence(session)).toBe(1);

    for (const consumptionSequence of [1, 3]) {
      const committed = commitSessionProposal(session, proposeInventoryConsumption(session, {
        playerSaveId: session.sessionId,
        lotId: lot.lotId,
        consumptionSequence,
      }));
      expect(committed.committed).toBe(true);
      session = committed.session;
    }

    expect(session.events().filter((event) => event.type === "inventory_consumption_committed")
      .map((event) => event.payload.action.consumptionSequence)).toEqual([1, 3]);
    expect(nextInventoryConsumptionSequence(session)).toBe(4);
  });
  it("atomically consumes a lineage-verified cooked wildlife lot with survival and inventory CAS", () => {
    const lot = createDemoTradeLots().find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
    let session = GameSession.create({ sessionId: "save.adapter.consume", mp: { currentMp: 10, maxMp: 10, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement", economy: { ...createEmptySessionEconomy(), lots: [{ ...lot, legalOwnerId: "save.adapter.consume" }] } });
    const before = session.snapshot();
    expect(() => proposeInventoryConsumption(session, { playerSaveId: "save.other", lotId: lot.lotId, consumptionSequence: 6 }))
      .toThrow(/authoritative Session/);
    const batch = proposeInventoryConsumption(session, { playerSaveId: "save.adapter.consume", lotId: lot.lotId, consumptionSequence: 7 });
    let committed = commitSessionProposal(session, batch);
    expect(committed.committed).toBe(true); session = committed.session;
    expect(session.snapshot().economy.lots[0]).toMatchObject({ quantity: lot.quantity - 1, ownershipRevision: lot.ownershipRevision + 1 });
    expect(session.snapshot().survival.satiety - before.survival.satiety).toBe(15);
    expect(session.snapshot().survival.hydration).toBe(before.survival.hydration);
    expect(session.snapshot().mp).toEqual(before.mp);
    expect(commitSessionProposal(session, batch)).toMatchObject({ committed: false, reason: "duplicate_event" });
    const retried = proposeInventoryConsumption(session, { playerSaveId: "save.adapter.consume", lotId: lot.lotId, consumptionSequence: 7 });
    expect(retried.transactionId).toBe(batch.transactionId);
    expect(commitSessionProposal(session, retried)).toMatchObject({ committed: false, reason: "duplicate_event" });
    const changedQuantity = proposeInventoryConsumption(session, { playerSaveId: "save.adapter.consume", lotId: lot.lotId, quantity: 2, consumptionSequence: 7 });
    expect(commitSessionProposal(session, changedQuantity)).toMatchObject({ committed: false, reason: "event_payload_conflict" });
    const conflict = structuredClone(batch);
    (conflict.drafts[0]!.payload as any).action.quantity = 2;
    expect(commitSessionProposal(session, conflict)).toMatchObject({ committed: false, reason: "event_payload_conflict" });
    const loaded = GameSession.load(JSON.parse(JSON.stringify(session.toSave())));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.session.snapshot()).toEqual(session.snapshot());
  });

  it("binds harvest and processing work to Session clock authority and survives reset/replay", () => {
    const retainedTradeReceipt = {
      transactionId: "trade.preexisting", quoteId: "quote.preexisting", merchantId: "settlement.butcher" as const,
      lotId: "lot.preexisting", itemId: "food.raw_small_game_meat", quantity: 1, coinDelta: 2, committedWorldTick: 0,
    };
    let session = GameSession.create({
      sessionId: "save.adapter.processing",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: "scene.valley.den_bypass",
      economy: { ...createEmptySessionEconomy(), coin: 11, walletRevision: 3, quoteSequence: 7,
        tradeReceipts: [retainedTradeReceipt] },
    });
    const life = createWildlifeLifeRecord({
      lifeInstanceId: "life.adapter.processing.rabbit", regionSaveId: "region-save.valley", regionId: "valley_prologue",
      entityId: "wildlife.rabbit.valley", species: "rabbit", ageClass: "adult", spawnGeneration: 0,
      spawnSequence: 2, harvestProfileId: "harvest.rabbit.v0.1", maxHp: 8, registeredAtWorldTick: 0,
    });
    let committed = commitSessionProposal(session, proposeWildlifeLifeRegistration("processing.register", life));
    expect(committed.committed).toBe(true); session = committed.session;
    committed = commitSessionProposal(session, proposeWildlifeDamage(session, {
      transactionId: "processing.death", lifeInstanceId: life.lifeInstanceId, expectedLifeRevision: 0, damage: 8,
      causeClass: "clean_tool", worldTick: 0, position: { sceneId: "scene.valley.den_bypass", x: 2, y: 3 },
    }));
    expect(committed.committed).toBe(true); session = committed.session;
    const corpse = Object.values(session.snapshot().lifeCorpseLedger.corpses)[0]!;
    const meat = corpse.tissueSlots.find((slot) => slot.tissueSlotId === "meat")!;
    const untrustedHarvest: WildlifeProcessingAction = {
      action: "harvest", transactionId: "caller.must.not.choose", canonicalIdempotencyKey: "caller.must.not.choose",
      currentWorldTick: 999_999, corpseId: corpse.corpseId, tissueSlotId: "meat", harvestSequence: 0,
      expectedCorpseRevision: corpse.revision, expectedRemainingTissueQuantity: meat.remainingQuantity,
      expectedInventoryRevision: session.snapshot().economy.inventoryRevision, playerSaveId: "save.adapter.processing",
      stationOrToolId: "field_knife",
    };

    const beforeDenied = session.snapshot();
    expect(() => proposeWildlifeProcessing(session, { ...untrustedHarvest, playerSaveId: "save.other" })).toThrow(/authoritative Session/);
    expect(() => proposeWildlifeProcessingInteraction(session, "field_knife", { playerPositionPx: { x: 232, y: 456 }, sceneRevision: session.snapshot().world.revision, runtimeInteractionSequence: 1, operationId: "harvest.meat.0" })).toThrow(/not available/);
    expect(() => proposeWildlifeProcessing(session, untrustedHarvest)).toThrow(/not authorized/);
    expect(session.snapshot()).toEqual(beforeDenied);

    committed = commitSessionProposal(session, {
      transactionId: "processing.enter-settlement",
      drafts: [{ eventId: "processing.enter-settlement", type: "scene_entered",
        payload: { sceneId: "scene.valley.settlement" } }],
    });
    expect(committed.committed).toBe(true); session = committed.session;
    const farInteraction = commitSessionProposal(session, proposeWildlifeProcessingInteraction(session, "field_knife", {
      playerPositionPx: { x: 32, y: 456 }, sceneRevision: session.snapshot().world.revision,
      runtimeInteractionSequence: 2, operationId: "harvest.remote-denied",
    }));
    expect(farInteraction).toMatchObject({ committed: false, reason: "invalid_event" });
    expect(farInteraction.session.snapshot()).toEqual(session.snapshot());
    committed = commitSessionProposal(session, proposeWildlifeProcessingInteraction(session, "field_knife", { playerPositionPx: { x: 232, y: 456 }, sceneRevision: session.snapshot().world.revision, runtimeInteractionSequence: 1, operationId: "harvest.meat.0" }));
    expect(committed.committed).toBe(true); session = committed.session;

    const fieldKnifeReceiptId = Object.keys(session.snapshot().receiptIndex).find((receiptId) =>
      receiptId.startsWith("wildlife-processing-interaction:field_knife:"))!;
    const authorizedHarvest = { ...untrustedHarvest, interactionReceiptId: fieldKnifeReceiptId };
    const harvestBatch = proposeWildlifeProcessing(session, authorizedHarvest);
    const proposedHarvest = harvestBatch.drafts[0]!.payload as { action: WildlifeProcessingAction };
    expect(proposedHarvest.action).toMatchObject({ currentWorldTick: 240 });
    expect(proposedHarvest.action.transactionId).toMatch(/^wal-tx:sha256:[0-9a-f]{64}$/);
    expect(proposedHarvest.action.canonicalIdempotencyKey).not.toBe("caller.must.not.choose");
    const beforeHarvest = session.snapshot();
    committed = commitSessionProposal(session, harvestBatch);
    expect(committed.committed).toBe(true); session = committed.session;
    expect(session.snapshot().survival).toMatchObject({ worldTicks: 240, metabolismTicks: 0,
      satiety: beforeHarvest.survival.satiety, hydration: beforeHarvest.survival.hydration });
    expect(session.snapshot().economy.activeWorldTick).toBe(session.snapshot().survival.worldTicks);
    expect(session.snapshot().economy).toMatchObject({ coin: 11, walletRevision: 3, quoteSequence: 7 });
    expect(session.snapshot().economy.tradeReceipts).toEqual([retainedTradeReceipt]);
    expect(commitSessionProposal(session, harvestBatch)).toMatchObject({ committed: false, reason: "duplicate_event" });
    const conflictRequest = { ...authorizedHarvest, expectedCorpseRevision: corpse.revision + 1 };
    expect(commitSessionProposal(session, proposeWildlifeProcessing(session, conflictRequest))).toMatchObject({
      committed: false, reason: "event_payload_conflict",
    });

    committed = commitSessionProposal(session, proposeWildlifeProcessingInteraction(session, "communal_kitchen", { playerPositionPx: { x: 168, y: 456 }, sceneRevision: session.snapshot().world.revision, runtimeInteractionSequence: 3, operationId: "reserve.cook.0" }));
    expect(committed.committed).toBe(true); session = committed.session;
    const reserveInteractionReceiptId = Object.keys(session.snapshot().receiptIndex).find((receiptId) =>
      receiptId.endsWith(":reserve.cook.0"))!;
    const rawLot = session.snapshot().economy.lots.find((lot) => lot.itemId === "food.raw_small_game_meat")!;
    const reserveRequest: WildlifeProcessingAction = {
      action: "reserve", interactionReceiptId: reserveInteractionReceiptId, transactionId: "caller.reserve", canonicalIdempotencyKey: "caller.reserve", currentWorldTick: 0,
      expectedInventoryRevision: session.snapshot().economy.inventoryRevision, playerSaveId: "save.adapter.processing",
      stationId: "communal_kitchen", recipeId: "cook.game_meat.v0.1", startEventSequence: 0,
      inputs: [{ lotId: rawLot.lotId, quantity: 1, expectedOwnershipRevision: rawLot.ownershipRevision,
        expectedFreshnessRevision: rawLot.freshnessRevision, expectedReservationRevision: 0 }],
    };
    committed = commitSessionProposal(session, proposeWildlifeProcessing(session, reserveRequest));
    expect(committed.committed).toBe(true); session = committed.session;
    const order = session.snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;
    expect(order).toMatchObject({ status: "reserved", startEventSequence: session.snapshot().lastEventSequence - 1 });
    committed = commitSessionProposal(session, proposeWildlifeProcessingInteraction(session, "communal_kitchen", {
      playerPositionPx: { x: 168, y: 456 }, sceneRevision: session.snapshot().world.revision,
      runtimeInteractionSequence: 4, operationId: "work.cook.0",
    }));
    expect(committed.committed).toBe(true); session = committed.session;
    const workInteractionReceiptId = Object.keys(session.snapshot().receiptIndex).find((receiptId) =>
      receiptId.endsWith(":work.cook.0"))!;
    const beforeWork = session.snapshot();
    const workBatch = proposeWildlifeProcessingWork(session, order.workOrderId, workInteractionReceiptId);
    committed = commitSessionProposal(session, workBatch);
    expect(committed.committed).toBe(true); session = committed.session;
    expect(session.snapshot().survival.worldTicks - beforeWork.survival.worldTicks).toBe(180);
    expect(session.snapshot().survival).toMatchObject({ metabolismTicks: beforeWork.survival.metabolismTicks,
      satiety: beforeWork.survival.satiety, hydration: beforeWork.survival.hydration });
    expect(session.snapshot().economy.activeWorldTick).toBe(session.snapshot().survival.worldTicks);
    expect(commitSessionProposal(session, workBatch)).toMatchObject({ committed: false, reason: "duplicate_event" });

    committed = commitSessionProposal(session, proposeWildlifeProcessingInteraction(session, "communal_kitchen", {
      playerPositionPx: { x: 168, y: 456 }, sceneRevision: session.snapshot().world.revision,
      runtimeInteractionSequence: 41, operationId: "work.cook.1",
    }));
    expect(committed.committed).toBe(true); session = committed.session;
    const secondWorkInteractionReceiptId = Object.keys(session.snapshot().receiptIndex).find((receiptId) =>
      receiptId.endsWith(":work.cook.1"))!;
    committed = commitSessionProposal(session, proposeWildlifeProcessingWork(session, order.workOrderId, secondWorkInteractionReceiptId));
    expect(committed.committed).toBe(true); session = committed.session;
    const energyProofs = Object.values(session.snapshot().receiptIndex).filter((receipt) =>
      receipt.receiptId.startsWith(`wildlife-processing-energy:${order.workOrderId}:`));
    expect(energyProofs).toHaveLength(2);
    expect(energyProofs[1]!.recordedAtSequence).toBeGreaterThan(energyProofs[0]!.recordedAtSequence);

    expect(session.apply({ eventId: "processing.area-reset", sequence: session.nextSequence(), type: "area_reset",
      payload: { areaId: "valley_prologue", respawnSceneId: "scene.valley.settlement" } })).toMatchObject({ applied: true });
    expect(session.snapshot().economy.workOrders[0]).toEqual({ ...order, revision: order.revision + 2 });
    const loaded = GameSession.load(JSON.parse(JSON.stringify(session.toSave())));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    expect(loaded.session.events()).toEqual(session.events());

    expect(() => proposeWildlifeProcessingWork(loaded.session, order.workOrderId, workInteractionReceiptId)).toThrow(/not authorized/);
    committed = commitSessionProposal(loaded.session, proposeWildlifeProcessingInteraction(loaded.session, "communal_kitchen", {
      playerPositionPx: { x: 168, y: 456 }, sceneRevision: loaded.session.snapshot().world.revision,
      runtimeInteractionSequence: 5, operationId: "complete.cook.0",
    }));
    expect(committed.committed).toBe(true);
    const reauthorized = committed.session;
    const completeInteractionReceiptId = Object.keys(reauthorized.snapshot().receiptIndex).find((receiptId) =>
      receiptId.endsWith(":complete.cook.0"))!;
    const completeRequest: WildlifeProcessingAction = {
      action: "complete", interactionReceiptId: completeInteractionReceiptId, transactionId: "caller.complete", canonicalIdempotencyKey: "caller.complete",
      currentWorldTick: 0, workOrderId: order.workOrderId,
      expectedWorkOrderRevision: (reauthorized.snapshot().economy.workOrders.find((candidate) => candidate.workOrderId === order.workOrderId) as WildlifeProcessingWorkOrder).revision,
      expectedInventoryRevision: reauthorized.snapshot().economy.inventoryRevision, energyEventId: null,
    };
    committed = commitSessionProposal(reauthorized, proposeWildlifeProcessing(reauthorized, completeRequest));
    expect(committed.committed).toBe(true); session = committed.session;
    const completedOrder = session.snapshot().economy.workOrders.find((candidate) => candidate.workOrderId === order.workOrderId) as WildlifeProcessingWorkOrder;
    expect(completedOrder.status).toBe("completed");
    expect(session.snapshot().economy.lots.filter((lot) => completedOrder.outputLotIds.includes(lot.lotId))
      .every((lot) => lot.legalOwnerId === `station:communal_kitchen`)).toBe(true);

    committed = commitSessionProposal(session, proposeWildlifeProcessingInteraction(session, "communal_kitchen", {
      playerPositionPx: { x: 168, y: 456 }, sceneRevision: session.snapshot().world.revision,
      runtimeInteractionSequence: 6, operationId: "claim.cook.0",
    }));
    expect(committed.committed).toBe(true); session = committed.session;
    const claimInteractionReceiptId = Object.keys(session.snapshot().receiptIndex).find((receiptId) =>
      receiptId.endsWith(":claim.cook.0"))!;
    const claimRequest: WildlifeProcessingAction = {
      action: "claim", interactionReceiptId: claimInteractionReceiptId, transactionId: "caller.claim", canonicalIdempotencyKey: "caller.claim", currentWorldTick: 0,
      workOrderId: completedOrder.workOrderId, expectedWorkOrderRevision: completedOrder.revision,
      expectedInventoryRevision: session.snapshot().economy.inventoryRevision,
      claimantPlayerSaveId: "save.adapter.processing",
    };
    committed = commitSessionProposal(session, proposeWildlifeProcessing(session, claimRequest));
    expect(committed.committed).toBe(true); session = committed.session;
    expect(session.snapshot().economy.workOrders.find((candidate) => candidate.workOrderId === order.workOrderId)?.status)
      .toBe("claimed");
  });

});
