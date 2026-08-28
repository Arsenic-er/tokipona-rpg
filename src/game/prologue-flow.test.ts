import { describe, expect, it } from "vitest";
import {
  PROLOGUE_ARRIVAL_SCENE_ID,
  PROLOGUE_STREAM_SCENE_ID,
} from "./prologue-arrival-stream";
import {
  PROLOGUE_SETTLEMENT_NPC_IDS,
  PROLOGUE_SETTLEMENT_REWARD_COIN,
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS,
  PROLOGUE_SETTLEMENT_TASK_ID,
} from "./prologue-settlement";
import {
  PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX,
  PrologueFlowSession,
} from "./prologue-flow";

const goRightUntil = (
  target: PrologueFlowSession,
  sceneId: string,
  maximumTicks = 900,
): void => {
  for (let tick = 0; tick < maximumTicks && target.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    target.advanceTicks(1, { moveX: 1 });
  }
  expect(target.snapshot().runtime.sceneId).toBe(sceneId);
};

const goLeftUntil = (
  target: PrologueFlowSession,
  sceneId: string,
  maximumTicks = 900,
): void => {
  for (let tick = 0; tick < maximumTicks && target.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    target.advanceTicks(1, { moveX: -1 });
  }
  expect(target.snapshot().runtime.sceneId).toBe(sceneId);
};

const enterStream = (target: PrologueFlowSession): void => {
  goRightUntil(target, PROLOGUE_STREAM_SCENE_ID);
  expect(target.snapshot()).toMatchObject({ mode: "arrival_stream", killCount: 0 });
};

const enterSettlementByTools = (target: PrologueFlowSession): void => {
  enterStream(target);
  expect(target.pushLooseStone("flow.route.stone")).toMatchObject({ accepted: true, reason: "delegated" });
  goRightUntil(target, PROLOGUE_SETTLEMENT_SCENE_ID);
  expect(target.snapshot()).toMatchObject({
    mode: "settlement",
    arrival: null,
    settlement: { killCount: 0 },
    killCount: 0,
  });
};

describe("PrologueFlowSession", () => {
  it("does not expose pre-hermit learning, attunement, MP use, or casting through Flow", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.pre-hermit-closed", currentMp: 13, maxMp: 24 });
    enterStream(target);
    const before = structuredClone(target.toSave());

    expect(target.discoverTelo("flow.pre-hermit.discovery")).toMatchObject({ accepted: false });
    expect(target.attuneTelo("flow.pre-hermit.attune", "flow.pre-hermit.discovery"))
      .toMatchObject({ accepted: false });
    expect(target.manifestTelo("flow.pre-hermit.cast")).toMatchObject({ accepted: false });
    expect(target.toSave()).toEqual(before);
    expect(target.snapshot().session.learning.words.telo).toBeUndefined();
    expect(target.snapshot().session.mp.currentMp).toBe(13);
    expect(target.snapshot().arrival?.manifestedWater).toEqual([]);
  });

  it("uses one GameSession through N00 -> N01 -> N02 -> N01 without replaying entry receipts", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.roundtrip", currentMp: 13, maxMp: 24 });
    expect(target.snapshot()).toMatchObject({
      mode: "arrival_stream",
      runtime: { sceneId: PROLOGUE_ARRIVAL_SCENE_ID },
      settlement: null,
      killCount: 0,
    });
    enterSettlementByTools(target);

    const afterEntry = target.snapshot().session;
    expect(afterEntry.world.flags["region:valley_prologue:settlement_entry_crossed"]?.value).toBe(true);
    expect(afterEntry.world.flags["region:valley_prologue:settlement_reached"]?.value).toBe(true);
    expect(afterEntry.checkpoint).toMatchObject({
      id: "checkpoint.valley.settlement.entry",
      sceneId: PROLOGUE_SETTLEMENT_SCENE_ID,
    });
    const entryReceiptId = `${PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX}:flow.roundtrip`;
    expect(afterEntry.receiptIndex[entryReceiptId]).toMatchObject({
      receiptId: entryReceiptId,
      domain: "other",
    });
    expect(afterEntry.receiptIndex[entryReceiptId]!.payloadHash).toContain("operation=settlement_entry");
    expect(afterEntry.receiptIndex[entryReceiptId]!.payloadHash).toContain("mode=adopted_runtime_transition");
    const revisionAfterEntry = afterEntry.revision;

    // No handoff-side enterFromStream batch is replayed on later settlement ticks.
    target.advanceTicks(10);
    expect(target.snapshot().session.revision).toBe(revisionAfterEntry);

    goLeftUntil(target, PROLOGUE_STREAM_SCENE_ID);
    expect(target.snapshot()).toMatchObject({
      mode: "arrival_stream",
      settlement: null,
      runtime: { sceneId: PROLOGUE_STREAM_SCENE_ID },
      killCount: 0,
    });
    expect(target.snapshot().session.world.flags["region:valley_prologue:settlement_entry_crossed"]?.value).toBe(true);
  });

  it("exposes safe gifted harvest/cook/claim/consume wrappers without raw CAS actions", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.semantic.processing", currentMp: 8, maxMp: 24 });
    enterSettlementByTools(target);
    for (let step = 0; step < 600 && target.snapshot().runtime.player.position.x < 480; step += 1) target.advanceTicks(1, { moveX: 1 });
    expect(target.acceptGiftedRabbitCarcass("flow.semantic.gift")).toMatchObject({ accepted: true, result: { accepted: true } });
    for (let step = 0; step < 600 && target.snapshot().runtime.player.position.x < 192; step += 1) target.advanceTicks(1, { moveX: 1 });
    expect(target.harvestGiftedMeat("flow.semantic.harvest")).toMatchObject({ accepted: true, result: { accepted: true } });
    for (let step = 0; step < 600 && target.snapshot().runtime.player.position.x < 160; step += 1) target.advanceTicks(1, { moveX: 1 });
    expect(target.startCooking("flow.semantic.start")).toMatchObject({ accepted: true });
    for (let step = 0; step < 600 && target.snapshot().runtime.player.position.x < 160; step += 1) target.advanceTicks(1, { moveX: 1 });
    expect(target.workCooking("flow.semantic.work")).toMatchObject({ accepted: true });
    for (let step = 0; step < 600 && target.snapshot().runtime.player.position.x < 160; step += 1) target.advanceTicks(1, { moveX: 1 });
    expect(target.completeCooking("flow.semantic.complete")).toMatchObject({ accepted: true });
    for (let step = 0; step < 600 && target.snapshot().runtime.player.position.x < 160; step += 1) target.advanceTicks(1, { moveX: 1 });
    expect(target.claimCooking("flow.semantic.claim")).toMatchObject({ accepted: true });
    expect(target.consumeCooked(1)).toMatchObject({ accepted: true });
    expect(target.snapshot().session.economy.workOrders[0]).toMatchObject({ status: "claimed" });
  });

  it("round-trips the unified save in both modes with mutually exclusive child snapshots", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.save", currentMp: 8, maxMp: 24 });
    enterStream(target);
    target.digSoftSoil("flow.save.route");
    const arrivalLoad = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(arrivalLoad.snapshot()).toMatchObject({ mode: "arrival_stream", settlement: null, killCount: 0 });
    expect(arrivalLoad.snapshot().session).toEqual(target.snapshot().session);

    goRightUntil(arrivalLoad, PROLOGUE_SETTLEMENT_SCENE_ID);
    const settlementLoad = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(arrivalLoad.toSave())));
    expect(settlementLoad.snapshot()).toMatchObject({ mode: "settlement", arrival: null, killCount: 0 });
    expect(settlementLoad.snapshot().session).toEqual(arrivalLoad.snapshot().session);
  });

  it("preserves relief, meditation, the nonviolent job, wallet, learning and MP on the return trip", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.global", currentMp: 4, maxMp: 24 });
    enterSettlementByTools(target);
    const learningBefore = target.snapshot().session.learning;
    expect(target.usePublicRelief("flow.relief").accepted).toBe(true);
    expect(target.meditate("flow.meditation", false).accepted).toBe(true);
    expect(target.acceptSurveyJob("flow.job.accept").accepted).toBe(true);
    PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.forEach((markerId, index) => {
      expect(target.inspectSurveyMarker(`flow.job.inspect.${index}`, markerId).accepted).toBe(true);
    });
    expect(target.submitSurveyJob("flow.job.submit").accepted).toBe(true);
    expect(target.openTrade("flow.trade.open")).toMatchObject({
      accepted: true,
      result: { tradeEntryId: "settlement.trade.supply_stall" },
    });

    const completed = target.snapshot().session;
    expect(completed.economy.coin).toBe(PROLOGUE_SETTLEMENT_REWARD_COIN);
    expect(completed.mp.currentMp).toBe(7);
    expect(completed.learning).toEqual(learningBefore);
    expect(completed.quests[PROLOGUE_SETTLEMENT_TASK_ID]?.stageId).toBe("completed");
    expect(target.talk(PROLOGUE_SETTLEMENT_NPC_IDS[0]!, "directions")).toMatchObject({ accepted: true });

    goLeftUntil(target, PROLOGUE_STREAM_SCENE_ID);
    expect(target.snapshot().session).toMatchObject({
      mp: completed.mp,
      economy: completed.economy,
      learning: completed.learning,
      quests: completed.quests,
      receiptIndex: completed.receiptIndex,
    });
    expect(target.snapshot().killCount).toBe(0);
  });

  it("keeps global domains through an area reset and rejects actions in the wrong mode", () => {
    const target = PrologueFlowSession.fresh({ sessionId: "flow.reset", currentMp: 5, maxMp: 24 });
    expect(target.usePublicRelief("wrong-mode.relief")).toMatchObject({
      accepted: false,
      reason: "wrong_mode",
      result: null,
    });
    enterSettlementByTools(target);
    target.usePublicRelief("flow.reset.relief");
    target.meditate("flow.reset.meditation", false);
    target.acceptSurveyJob("flow.reset.job.accept");
    PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.forEach((markerId, index) => {
      target.inspectSurveyMarker(`flow.reset.job.inspect.${index}`, markerId);
    });
    target.submitSurveyJob("flow.reset.job.submit");
    const before = target.snapshot().session;

    expect(target.resetArea("flow.reset.area").accepted).toBe(true);
    const after = target.snapshot().session;
    expect(after.world.areaEpochs.valley_prologue).toBe((before.world.areaEpochs.valley_prologue ?? 0) + 1);
    expect(after.economy).toEqual(before.economy);
    expect(after.learning).toEqual(before.learning);
    expect(after.mp).toEqual(before.mp);
    expect(after.quests).toEqual(before.quests);
    for (const [receiptId, receipt] of Object.entries(before.receiptIndex)) {
      expect(after.receiptIndex[receiptId]).toEqual(receipt);
    }
    expect(after.receiptIndex["flow.reset.area"]).toMatchObject({
      receiptId: "flow.reset.area",
      domain: "other",
    });
    expect(after.receiptIndex["flow.reset.area"]!.payloadHash).toContain("operation=area_reset");
    expect(Object.keys(after.receiptIndex)).toHaveLength(Object.keys(before.receiptIndex).length + 1);
    // The adopted N02 checkpoint keeps the reset in settlement mode.
    expect(target.pushLooseStone("wrong-mode.tool")).toMatchObject({
      accepted: false,
      reason: "wrong_mode",
      result: null,
    });
    expect(target.snapshot().killCount).toBe(0);
  });
});

