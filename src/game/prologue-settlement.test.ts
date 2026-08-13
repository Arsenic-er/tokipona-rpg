import { describe, expect, it } from "vitest";
import { migrateLegacyEconomySummary, type SessionEconomyState } from "./economy-state";
import { GameSession, type SessionEconomySummary } from "../session/game-session";
import {
  PROLOGUE_SETTLEMENT_AREA_ID,
  PROLOGUE_SETTLEMENT_INTERACTIONS,
  PROLOGUE_SETTLEMENT_JOB_BOARD_ID,
  PROLOGUE_SETTLEMENT_NPC_IDS,
  PROLOGUE_SETTLEMENT_REGION_FLAG_IDS,
  PROLOGUE_SETTLEMENT_REPAIR_CONTRACTOR_ID,
  PROLOGUE_SETTLEMENT_REWARD_COIN,
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PROLOGUE_SETTLEMENT_SUPPLY_STALL_ID,
  PROLOGUE_SETTLEMENT_SUPPLY_TRADER_ID,
  PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS,
  PROLOGUE_SETTLEMENT_TASK_ID,
  PrologueSettlementSession,
  createPrologueSettlementInitialSession,
  settlementReached,
} from "./prologue-settlement";

const regionFlagKey = (flagId: string): string =>
  `region:${PROLOGUE_SETTLEMENT_AREA_ID}:${flagId}`;

const economyWithExistingLots = (): SessionEconomySummary => ({
  coin: 7,
  walletRevision: 3,
  inventoryRevision: 5,
  lots: [
    {
      lotId: "lot.keep.hide",
      itemId: "material.hide.small_game",
      quantity: 2,
      ownershipRevision: 4,
      freshnessRevision: 1,
    },
    {
      lotId: "lot.keep.root",
      itemId: "food.root",
      quantity: 3,
      ownershipRevision: 5,
      freshnessRevision: 2,
    },
  ],
});

const fullEconomyWithLedgers = (): SessionEconomyState => {
  const base = migrateLegacyEconomySummary(economyWithExistingLots());
  return {
    ...base,
    quoteSequence: 7,
    merchantStates: base.merchantStates.map((state, index) => index === 0
      ? { ...state, demandRevision: 3, soldUnitsSinceRestock: 2 }
      : state),
    workOrders: [{
      workOrderId: "work.preserve.001",
      recipeId: "recipe.future.001",
      inputLotIds: [base.lots[0]!.lotId],
      status: "queued" as const,
      revision: 2,
    }],
    tradeReceipts: [{
      transactionId: "trade.preserve.001",
      quoteId: "quote.preserve.001",
      merchantId: "settlement.butcher" as const,
      lotId: base.lots[0]!.lotId,
      itemId: base.lots[0]!.itemId,
      quantity: 1,
      coinDelta: 2,
      committedWorldTick: 10,
    }],
    processingReceipts: [{
      transactionId: "process.preserve.001",
      workOrderId: "work.preserve.001",
      inputLotIds: [base.lots[0]!.lotId],
      outputLotIds: ["lot.future.output"],
      committedWorldTick: 11,
    }],
  };
};

const createSettlement = (suffix: string, currentMp = 12, maxMp = 24): PrologueSettlementSession =>
  new PrologueSettlementSession(createPrologueSettlementInitialSession({
    sessionId: `save.settlement.${suffix}`,
    currentMp,
    maxMp,
    economy: economyWithExistingLots(),
  }));

const sourceAtStream = (sessionId: string): GameSession => GameSession.create({
  sessionId,
  mp: { currentMp: 18, maxMp: 24, worldVersion: 2 },
  currentSceneId: "scene.valley.stream_section",
  checkpoint: {
    id: "checkpoint.stream",
    sceneId: "scene.valley.stream_section",
    position: { x: 432, y: 82 },
    revision: 4,
  },
  economy: economyWithExistingLots(),
});

const completeSurvey = (target: PrologueSettlementSession, prefix: string): void => {
  expect(target.acceptSurveyJob(`${prefix}.accept`)).toMatchObject({ accepted: true, duplicate: false });
  PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.forEach((markerId, index) => {
    expect(target.inspectSurveyMarkerAt(`${prefix}.marker.${index}`, markerId, {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.inspectSurveyMarker,
    })).toMatchObject({ accepted: true, duplicate: false });
  });
  expect(target.snapshot().orientationTask).toMatchObject({
    stage: "surveyed",
    requiredSurveyMarkerCount: 3,
  });
};

describe("PrologueSettlementSession", () => {
  it("enters N02 only from the canonical source and fingerprints direct versus adopted entry", () => {
    const result = PrologueSettlementSession.enterFromStream(sourceAtStream("save.settlement.entry"), "entry.n02.001");
    expect(result).toMatchObject({
      accepted: true,
      duplicate: false,
      reason: "committed",
      entryMode: "direct_transition",
    });
    const target = result.settlement!;
    const snapshot = target.snapshot();
    expect(snapshot.session.world.currentSceneId).toBe(PROLOGUE_SETTLEMENT_SCENE_ID);
    expect(snapshot.session.checkpoint).toMatchObject({
      id: "checkpoint.valley.settlement.entry",
      sceneId: PROLOGUE_SETTLEMENT_SCENE_ID,
      revision: 5,
    });
    expect(settlementReached(snapshot.session)).toBe(true);
    expect(snapshot.session.revision).toBe(4);
    expect(snapshot.killCount).toBe(0);

    expect(PrologueSettlementSession.enterFromStream(target.session, "entry.n02.fresh")).toMatchObject({
      accepted: false,
      reason: "wrong_source_scene",
      settlement: null,
    });
    const duplicate = PrologueSettlementSession.enterFromStream(target.session, "entry.n02.001");
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });
    expect(duplicate.settlement!.snapshot().session).toEqual(snapshot.session);
    expect(PrologueSettlementSession.adoptRuntimeEntry(target.session, "entry.n02.001")).toMatchObject({
      accepted: false,
      reason: "transaction_conflict",
    });
  });

  it("adopts only a canonical transition already committed by the runtime bridge", () => {
    const transitioned = sourceAtStream("save.settlement.adopt");
    expect(transitioned.apply({
      eventId: "arrival.entry.crossed",
      sequence: transitioned.nextSequence(),
      type: "world_flag_set",
      payload: {
        flagId: "settlement_entry_crossed",
        value: true,
        scope: "region",
        regionId: PROLOGUE_SETTLEMENT_AREA_ID,
      },
    }).applied).toBe(true);
    expect(transitioned.apply({
      eventId: "runtime.scene.2.1.scene.valley.stream_section->scene.valley.settlement",
      sequence: transitioned.nextSequence(),
      type: "scene_entered",
      payload: { sceneId: PROLOGUE_SETTLEMENT_SCENE_ID },
    }).applied).toBe(true);

    const adopted = PrologueSettlementSession.adoptRuntimeEntry(transitioned, "entry.runtime.001");
    expect(adopted).toMatchObject({
      accepted: true,
      duplicate: false,
      reason: "committed",
      entryMode: "adopted_runtime_transition",
    });
    expect(settlementReached(adopted.settlement!.snapshot().session)).toBe(true);
    expect(PrologueSettlementSession.adoptRuntimeEntry(
      adopted.settlement!.session,
      "entry.runtime.001",
    )).toMatchObject({ accepted: true, duplicate: true, reason: "duplicate" });

    const forged = createPrologueSettlementInitialSession({ sessionId: "save.settlement.forged" });
    expect(PrologueSettlementSession.adoptRuntimeEntry(forged, "entry.runtime.forged")).toMatchObject({
      accepted: false,
      reason: "wrong_source_scene",
    });
  });

  it("serves three structured NPC dialogues and clarification without mutating session truth", () => {
    const target = createSettlement("dialogue");
    expect(PROLOGUE_SETTLEMENT_NPC_IDS).toHaveLength(3);
    for (const npcId of PROLOGUE_SETTLEMENT_NPC_IDS) {
      const before = target.snapshot().session;
      const role = target.talk(npcId, "role");
      expect(role).toMatchObject({ accepted: true, reason: "read_only", node: { npcId, topic: "role" } });
      expect(role.node!.facts.length).toBeGreaterThan(1);
      expect(target.clarify(npcId, "directions")).toMatchObject({ accepted: true, reason: "read_only" });
      expect(target.snapshot().session).toEqual(before);
    }
    expect(target.talk("settlement.npc.missing")).toMatchObject({ accepted: false, reason: "unknown_npc" });
    expect(target.talk("settlement.npc.facility_manager", "trade")).toMatchObject({
      accepted: false,
      reason: "unsupported_topic",
    });
  });

  it("authorizes public relief from the exact manifest facilities and keeps it free", () => {
    const target = createSettlement("relief");
    const before = target.snapshot();
    expect(target.usePublicReliefAt("relief.unauthorized", {
      wellInteractionId: PROLOGUE_SETTLEMENT_INTERACTIONS.publicMeal,
      mealInteractionId: PROLOGUE_SETTLEMENT_INTERACTIONS.publicWell,
    })).toMatchObject({ accepted: false, reason: "unauthorized_interaction" });
    const first = target.usePublicRelief("relief.n02.001");
    expect(first).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(first.snapshot.session.survival.publicReliefFirstUseClaimed).toBe(true);
    expect(first.snapshot.session.economy).toEqual(before.session.economy);
    expect(first.snapshot.session.world.flags[
      regionFlagKey(PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.publicWellUsed)
    ]?.value).toBe(true);
    expect(first.snapshot.session.world.flags[
      regionFlagKey(PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.communalPlantMealOffered)
    ]?.value).toBe(true);
    const after = target.snapshot().session;
    expect(target.usePublicRelief("relief.n02.001")).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "duplicate",
    });
    expect(target.snapshot().session).toEqual(after);
  });

  it("uses one exact caller receipt across relief, meditation, checkpoint and recovery operations", () => {
    const target = createSettlement("fingerprint", 5, 24);
    expect(target.meditate("operation.same", false)).toMatchObject({ accepted: true, duplicate: false });
    const afterMeditation = target.snapshot().session;
    expect(target.meditate("operation.same", false)).toMatchObject({ accepted: true, duplicate: true });
    expect(target.meditate("operation.same", true)).toMatchObject({
      accepted: false,
      reason: "transaction_conflict",
    });
    expect(target.usePublicRelief("operation.same")).toMatchObject({
      accepted: false,
      reason: "transaction_conflict",
    });
    expect(target.snapshot().session).toEqual(afterMeditation);

    expect(target.setCheckpoint("checkpoint.same", "checkpoint.square.a")).toMatchObject({ accepted: true });
    expect(target.setCheckpoint("checkpoint.same", "checkpoint.square.b")).toMatchObject({
      accepted: false,
      reason: "transaction_conflict",
    });
    expect(target.resetToCheckpoint("reset.same")).toMatchObject({ accepted: true, duplicate: false });
    expect(target.resetToCheckpoint("reset.same")).toMatchObject({ accepted: true, duplicate: true });
    expect(target.resetArea("reset.same")).toMatchObject({
      accepted: false,
      reason: "transaction_conflict",
    });
  });

  it("recovers MP after an incorrect meditation answer while writing zero learning evidence", () => {
    const target = createSettlement("meditation", 5, 24);
    const before = target.snapshot().session;
    const wrong = target.meditate("meditation.n02.wrong", false);
    expect(wrong).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(wrong.snapshot.session.mp).toMatchObject({ currentMp: 8, maxMp: 24, worldVersion: 0 });
    expect(wrong.snapshot.session.learning).toEqual(before.learning);
    expect(wrong.snapshot.session.world.flags[
      regionFlagKey(PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.meditationCourtActivated)
    ]?.value).toBe(true);
    expect(wrong.snapshot.session.receiptIndex["meditation:settlement:meditation.n02.wrong"]?.payloadHash)
      .toContain(":false");
    expect(wrong.snapshot.session.receiptIndex["meditation.n02.wrong"]?.payloadHash)
      .toContain("answerAccepted=false");
  });

  it("requires three distinct canonical markers, persists them, and pays the nonviolent job once", () => {
    const target = createSettlement("job");
    const before = target.snapshot().session;
    expect(PROLOGUE_SETTLEMENT_REWARD_COIN).toBe(10);
    expect(target.submitSurveyJob("job.submit.early")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
    });
    expect(target.acceptSurveyJob("job.accept.001")).toMatchObject({ accepted: true });
    const firstMarker = PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS[0];
    expect(target.inspectSurveyMarkers("job.marker.001", firstMarker)).toMatchObject({ accepted: true });
    expect(target.inspectSurveyMarkers("job.marker.duplicate", firstMarker)).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "duplicate",
    });
    expect(target.snapshot().orientationTask).toMatchObject({
      stage: "accepted",
      surveyedMarkerIds: [firstMarker],
    });
    expect(target.submitSurveyJob("job.submit.two-short")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
    });

    expect(target.inspectSurveyMarkers("job.marker.002", PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS[1]))
      .toMatchObject({ accepted: true, duplicate: false });
    const loaded = PrologueSettlementSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().orientationTask.surveyedMarkerIds).toEqual(
      PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.slice(0, 2),
    );
    expect(loaded.inspectSurveyMarkers("job.marker.003", PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS[2]))
      .toMatchObject({ accepted: true, duplicate: false, snapshot: { orientationTask: { stage: "surveyed" } } });
    const completion = loaded.submitSurveyJob("job.submit.001");
    expect(completion).toMatchObject({
      accepted: true,
      duplicate: false,
      snapshot: {
        orientationTask: {
          taskId: PROLOGUE_SETTLEMENT_TASK_ID,
          stage: "completed",
          surveyedMarkerIds: PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS,
          rewardCoin: 10,
          nonviolent: true,
          magicRequired: false,
        },
        killCount: 0,
      },
    });
    expect(completion.snapshot.session.economy.coin).toBe(before.economy.coin + 10);
    expect(completion.snapshot.session.economy.lots).toEqual(before.economy.lots);
    expect(completion.snapshot.session.economy.inventoryRevision).toBe(before.economy.inventoryRevision);
    expect(completion.snapshot.session.economy.walletRevision).toBe(before.economy.walletRevision + 1);
    const after = loaded.snapshot().session;
    expect(loaded.submitSurveyJob("job.submit.replay")).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "already_completed",
    });
    expect(loaded.snapshot().session).toEqual(after);
  });

  it("requires repair contractor/board tokens and returns only the supply-stall merchant allowlist", () => {
    const target = createSettlement("authorization");
    expect(target.acceptSurveyJobAt("job.auth.bad", {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.acceptSurvey,
      npcId: PROLOGUE_SETTLEMENT_SUPPLY_TRADER_ID,
      facilityId: PROLOGUE_SETTLEMENT_JOB_BOARD_ID,
    })).toMatchObject({ accepted: false, reason: "unauthorized_interaction" });
    expect(target.acceptSurveyJobAt("job.auth.good", {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.acceptSurvey,
      npcId: PROLOGUE_SETTLEMENT_REPAIR_CONTRACTOR_ID,
      facilityId: PROLOGUE_SETTLEMENT_JOB_BOARD_ID,
    })).toMatchObject({ accepted: true });
    expect(target.openTradeAt("trade.auth.bad", {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.openSupplyTrade,
      npcId: PROLOGUE_SETTLEMENT_REPAIR_CONTRACTOR_ID,
      facilityId: PROLOGUE_SETTLEMENT_SUPPLY_STALL_ID,
    })).toMatchObject({ accepted: false, reason: "unauthorized_interaction", merchantIds: [] });
    expect(target.openTrade("trade.auth.good")).toMatchObject({
      accepted: true,
      duplicate: false,
      tradeEntryId: "settlement.trade.supply_stall",
      merchantIds: ["settlement.grocer"],
    });
    expect(target.openTrade("trade.auth.good")).toMatchObject({ accepted: true, duplicate: true });
  });

  it("fails closed when completed quest and reward receipt disagree", () => {
    const session = createPrologueSettlementInitialSession({
      sessionId: "save.settlement.reward-inconsistent",
      economy: economyWithExistingLots(),
    });
    expect(session.apply({
      eventId: "corrupt.quest.completed",
      sequence: session.nextSequence(),
      type: "quest_stage_set",
      payload: { questId: PROLOGUE_SETTLEMENT_TASK_ID, stageId: "completed", stageOrdinal: 3 },
    }).applied).toBe(true);
    const target = new PrologueSettlementSession(session);
    const before = target.snapshot().session;
    expect(target.submitSurveyJob("job.reward.inconsistent")).toMatchObject({
      accepted: false,
      duplicate: false,
      reason: "reward_inconsistent",
    });
    expect(target.snapshot().session).toEqual(before);
  });

  it("round-trips, restores N02 survey tools without money, and preserves region progress across area reset", () => {
    const target = createSettlement("save-reset", 6, 24);
    target.usePublicRelief("relief.persist");
    target.meditate("meditation.persist", false);
    completeSurvey(target, "job.persist");
    target.submitSurveyJob("job.persist.submit");
    target.setCheckpoint("checkpoint.persist", "checkpoint.valley.settlement.square");
    const before = target.snapshot().session;
    const loaded = PrologueSettlementSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().session).toEqual(before);
    expect(loaded.snapshot()).toMatchObject({ killCount: 0, orientationTask: { stage: "completed" } });

    const recovered = loaded.recoverSoftLock("recover.persist.001");
    expect(recovered).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(recovered.snapshot.session.economy).toEqual(before.economy);
    expect(recovered.snapshot.orientationTask.surveyedMarkerIds).toEqual(PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS);
    expect(recovered.snapshot.session.world.flags[
      regionFlagKey("settlement.survey_slate_available")
    ]?.value).toBe(true);
    expect(recovered.snapshot.session.world.flags[
      regionFlagKey("settlement.local_marker_tools_restored_by")
    ]?.value).toBe("recover.persist.001");
    expect(loaded.recoverSoftLock("recover.persist.001")).toMatchObject({ accepted: true, duplicate: true });
    expect(loaded.recoverSoftLock("recover.persist.002").snapshot.session.economy).toEqual(before.economy);

    const reset = loaded.resetArea("reset.settlement.001");
    expect(reset.accepted).toBe(true);
    expect(reset.snapshot.session.quests[PROLOGUE_SETTLEMENT_TASK_ID]?.stageId).toBe("completed");
    expect(reset.snapshot.session.economy).toEqual(before.economy);
    expect(reset.snapshot.orientationTask.surveyedMarkerIds).toEqual(PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS);
    expect(reset.snapshot.session.world.flags[
      regionFlagKey(PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.publicWellUsed)
    ]?.value).toBe(true);
    expect(reset.snapshot.session.world.flags[
      regionFlagKey(PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.communalPlantMealOffered)
    ]?.value).toBe(true);
    expect(reset.snapshot.session.world.flags[
      regionFlagKey(PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.meditationCourtActivated)
    ]?.value).toBe(true);
    expect(reset.snapshot.killCount).toBe(0);
  });

  it("adds the survey reward through wallet CAS without replacing any other economy ledger", () => {
    const economy = fullEconomyWithLedgers();
    const target = new PrologueSettlementSession(createPrologueSettlementInitialSession({
      sessionId: "save.settlement.full-economy",
      economy,
    }));
    completeSurvey(target, "full-economy");
    const before = target.snapshot().session.economy;
    expect(target.submitSurveyJob("full-economy.submit")).toMatchObject({ accepted: true, reason: "committed" });
    const after = target.snapshot().session.economy;
    expect(after).toMatchObject({
      schema: economy.schema,
      coin: before.coin + PROLOGUE_SETTLEMENT_REWARD_COIN,
      walletRevision: before.walletRevision + 1,
      inventoryRevision: before.inventoryRevision,
      quoteSequence: before.quoteSequence,
    });
    expect(after.lots).toEqual(before.lots);
    expect(after.merchantStates).toEqual(before.merchantStates);
    expect(after.workOrders).toEqual(before.workOrders);
    expect(after.tradeReceipts).toEqual(before.tradeReceipts);
    expect(after.processingReceipts).toEqual(before.processingReceipts);
    expect(target.toSave().eventLedger.some((event) => event.type === "economy_replaced")).toBe(false);
  });
});
