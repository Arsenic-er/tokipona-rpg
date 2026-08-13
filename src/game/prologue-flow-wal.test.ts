import { describe, expect, it } from "vitest";
import { BrowserGameSessionWalCoordinator, type DurableJsonStore } from "../persistence/browser-game-session-wal";
import { PROLOGUE_STREAM_SCENE_ID } from "./prologue-arrival-stream";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "./prologue-settlement";
import { PROLOGUE_WATERWHEEL_SCENE_ID } from "./prologue-waterwheel";
import { PrologueFlowSession } from "./prologue-flow";

class MemoryStore implements DurableJsonStore {
  protected value: unknown | null = null;
  public read(): unknown | null { return this.value === null ? null : structuredClone(this.value); }
  public write(value: unknown): void { this.value = structuredClone(value); }
}

class CrashAfterGiftRegistrationStore extends MemoryStore {
  private crashed = false;
  public override write(value: unknown): void {
    super.write(value);
    const companion = value as { authority?: { session?: { state?: { lifeCorpseLedger?: { lives?: Record<string, { state?: string }> } } } };
      durableWalRecords?: readonly { transactionKind?: string }[] };
    const lives = Object.values(companion.authority?.session?.state?.lifeCorpseLedger?.lives ?? {});
    if (!this.crashed && lives.some((life) => life.state === "alive") &&
        !companion.durableWalRecords?.some((record) => record.transactionKind === "death")) {
      this.crashed = true;
      throw new Error("simulated process death after durable life registration");
    }
  }
}

const advanceToScene = (flow: PrologueFlowSession, sceneId: string, moveX: -1 | 1 = 1): void => {
  for (let tick = 0; tick < 1_000 && flow.snapshot().runtime.sceneId !== sceneId; tick += 1) {
    flow.advanceTicks(1, { moveX });
  }
  expect(flow.snapshot().runtime.sceneId).toBe(sceneId);
};

const moveToX = (flow: PrologueFlowSession, x: number): void => {
  for (let tick = 0; tick < 1_000 && Math.abs(flow.snapshot().runtime.player.position.x - x) > 8; tick += 1) {
    flow.advanceTicks(1, { moveX: flow.snapshot().runtime.player.position.x < x ? 1 : -1 });
  }
  expect(Math.abs(flow.snapshot().runtime.player.position.x - x)).toBeLessThanOrEqual(8);
};

const reachSettlement = (flow: PrologueFlowSession): void => {
  advanceToScene(flow, PROLOGUE_STREAM_SCENE_ID);
  expect(flow.pushLooseStone("production.wal.route.stone").accepted).toBe(true);
  advanceToScene(flow, PROLOGUE_SETTLEMENT_SCENE_ID);
};

describe("production WAL wired prologue flow", () => {
  it("runs N00 -> N02 -> gift/death -> harvest -> reload -> N03 through durable WAL barriers", () => {
    const store = new MemoryStore();
    const flow = PrologueFlowSession.fresh({ sessionId: "flow.production.wal", currentMp: 12, maxMp: 24 });
    const coordinator = BrowserGameSessionWalCoordinator.fresh(flow.session, store);
    flow.attachCrossSaveTransactionCoordinator(coordinator);
    reachSettlement(flow);

    moveToX(flow, 488);
    expect(flow.acceptGiftedRabbitCarcass("production.wal.gift")).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: false } });
    moveToX(flow, 200);
    expect(flow.harvestGiftedMeat("production.wal.harvest")).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: false } });
    expect(flow.harvestGiftedMeat("production.wal.harvest")).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: true } });

    const rawLot = flow.snapshot().session.economy.lots.find((lot) => lot.itemId === "food.raw_small_game_meat")!;
    moveToX(flow, 488);
    const issued = flow.issueVerifiedSellQuote({ merchantId: "settlement.butcher", lotId: rawLot.lotId,
      quantity: 1, operationId: "production.wal.sell.quote" });
    expect(issued).toMatchObject({ accepted: true, result: { accepted: true } });
    if (!issued.result?.accepted) throw new Error("verified sell quote was not issued");
    moveToX(flow, 488);
    expect(flow.confirmVerifiedSellQuote(issued.result.quote.quoteId)).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: false } });
    expect(flow.confirmVerifiedSellQuote(issued.result.quote.quoteId)).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: true } });

    moveToX(flow, 168);
    expect(flow.startCooking("production.wal.cook.start")).toMatchObject({ accepted: true, result: { accepted: true } });
    moveToX(flow, 168);
    expect(flow.workCooking("production.wal.cook.work")).toMatchObject({ accepted: true, result: { accepted: true } });
    expect(flow.workCooking("production.wal.cook.work")).toMatchObject({ accepted: true, result: { duplicate: true } });
    moveToX(flow, 168);
    expect(flow.completeCooking("production.wal.cook.complete")).toMatchObject({ accepted: true, result: { accepted: true } });
    moveToX(flow, 168);
    expect(flow.claimCooking("production.wal.cook.claim")).toMatchObject({ accepted: true, result: { accepted: true } });
    const satietyBefore = flow.snapshot().session.survival.satiety;
    expect(flow.consumeCooked(1)).toMatchObject({ accepted: true, result: { accepted: true, duplicate: false } });
    expect(flow.consumeCooked(1)).toMatchObject({ accepted: true, result: { accepted: true, duplicate: true } });
    expect(flow.snapshot().session).toMatchObject({ survival: { satiety: expect.any(Number) },
      economy: { coin: expect.any(Number), workOrders: [expect.objectContaining({ status: "claimed" })] } });
    expect(flow.snapshot().session.survival.satiety).toBeGreaterThan(satietyBefore);
    expect(flow.snapshot().session.economy.coin).toBeGreaterThan(0);
    expect(flow.snapshot().session.economy.lots.find((lot) => lot.itemId === "food.cooked_game_meat"))
      .toMatchObject({ quantity: 0 });

    const records = coordinator.toEnvelope().companion.wal.records;
    expect(records.filter((record) => record.transactionKind === "death")).toHaveLength(1);
    expect(records.filter((record) => record.transactionKind === "harvest")).toHaveLength(1);
    for (const kind of ["sell", "workorder_start", "workorder_work", "workorder_complete", "workorder_claim", "consume"]) {
      expect(records.filter((record) => record.transactionKind === kind), kind).toHaveLength(1);
    }
    expect(records.filter((record) => record.state === "garbage_collectable")).toHaveLength(8);

    const loadedCoordinator = BrowserGameSessionWalCoordinator.load(store);
    const loadedFlow = PrologueFlowSession.fromSave(loadedCoordinator.toSessionSave());
    loadedFlow.attachCrossSaveTransactionCoordinator(loadedCoordinator);
    expect(loadedFlow.snapshot().session.economy).toMatchObject({ coin: flow.snapshot().session.economy.coin,
      workOrders: [expect.objectContaining({ status: "claimed" })] });
    expect(loadedFlow.snapshot().session.survival.satiety).toBe(flow.snapshot().session.survival.satiety);
    expect(loadedFlow.snapshot().session.economy.lots.find((lot) => lot.itemId === "food.cooked_game_meat"))
      .toMatchObject({ quantity: 0, legalOwnerId: "flow.production.wal" });

    expect(loadedFlow.acceptGiftedRabbitCarcass("production.wal.gift")).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: true } });

    expect(loadedFlow.enterWaterwheel("production.wal.enter-waterwheel")).toMatchObject({ accepted: true });
    expect(loadedFlow.snapshot()).toMatchObject({ mode: "infrastructure", runtime: { sceneId: PROLOGUE_WATERWHEEL_SCENE_ID } });
    expect(loadedCoordinator.isSceneActivationReady()).toBe(true);
    expect(loadedCoordinator.toCompanion().wal.records.every((record) => record.state === "garbage_collectable")).toBe(true);
  }, 30_000);

  it("resumes gifted registration after process death before WAL death and writes the marker last", () => {
    const store = new CrashAfterGiftRegistrationStore();
    const flow = PrologueFlowSession.fresh({ sessionId: "flow.production.gift-resume", currentMp: 12, maxMp: 24 });
    const coordinator = BrowserGameSessionWalCoordinator.fresh(flow.session, store);
    flow.attachCrossSaveTransactionCoordinator(coordinator);
    reachSettlement(flow); moveToX(flow, 488);
    expect(flow.acceptGiftedRabbitCarcass("production.wal.gift-resume")).toMatchObject({ accepted: false });

    const loadedCoordinator = BrowserGameSessionWalCoordinator.load(store);
    const loadedFlow = PrologueFlowSession.fromSave(loadedCoordinator.toSessionSave());
    loadedFlow.attachCrossSaveTransactionCoordinator(loadedCoordinator); moveToX(loadedFlow, 488);
    expect(loadedFlow.acceptGiftedRabbitCarcass("production.wal.gift-resume")).toMatchObject({ accepted: true,
      result: { accepted: true, duplicate: false } });
    const state = loadedFlow.snapshot().session;
    expect(Object.values(state.lifeCorpseLedger.lives)).toHaveLength(1);
    expect(Object.values(state.lifeCorpseLedger.lives)[0]).toMatchObject({ state: "dead" });
    expect(Object.values(state.lifeCorpseLedger.corpses)).toHaveLength(1);
    expect(state.receiptIndex["gifted-carcass:flow.production.gift-resume:n02.rabbit.v0.1"]).toBeDefined();
  });
});
