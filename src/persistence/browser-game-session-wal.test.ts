import { describe, expect, it } from "vitest";
import { createEmptySessionEconomy } from "../game/economy-state";
import { createWildlifeLifeRecord } from "../game/life-corpse-ledger";
import { createDemoTradeLots } from "../game/trade";
import { proposeVerifiedTradeQuote, proposeWildlifeLifeRegistration } from "../session/adapters";
import { GameSession } from "../session/game-session";
import { createCrossSaveReceiptId } from "./cross-save-wal";
import {
  BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA,
  BrowserGameSessionWalCoordinator,
  readBrowserGameSessionSaveEnvelope,
  type DurableJsonStore,
} from "./browser-game-session-wal";

class MemoryDurableJsonStore implements DurableJsonStore {
  private value: unknown | null = null;
  private writes = 0;
  private failWrite: number | null = null;
  public get writeCount(): number { return this.writes; }
  public read(): unknown | null { return this.value === null ? null : structuredClone(this.value); }
  public write(value: unknown): void {
    this.writes += 1;
    if (this.failWrite !== null && this.writes >= this.failWrite) throw new Error("simulated durable write crash");
    this.value = structuredClone(value);
  }
  public crashAfterAdditionalWrites(count: number): void { this.failWrite = this.writes + count; }
  public clearFailure(): void { this.failWrite = null; }
}

const life = () => createWildlifeLifeRecord({ lifeInstanceId: "life.browser.wal.rabbit", regionSaveId: "save.browser.wal",
  regionId: "valley_prologue", entityId: "wildlife.rabbit.valley", species: "rabbit", ageClass: "adult",
  spawnGeneration: 0, spawnSequence: 1, harvestProfileId: "harvest.rabbit.v0.1", maxHp: 8, registeredAtWorldTick: 0 });

const deathCoordinator = (store = new MemoryDurableJsonStore()) => {
  const coordinator = BrowserGameSessionWalCoordinator.fresh(GameSession.create({ sessionId: "save.browser.wal",
    mp: { currentMp: 10, maxMp: 10, worldVersion: 0 }, currentSceneId: "scene.valley.settlement" }), store);
  expect(coordinator.commitOrdinary(proposeWildlifeLifeRegistration("browser.wal.register", life())).committed).toBe(true);
  return { coordinator, store };
};

const deathRequest = () => ({ transactionId: "caller-untrusted", lifeInstanceId: life().lifeInstanceId,
  expectedLifeRevision: 0, damage: 8, causeClass: "clean_tool" as const, worldTick: 1,
  position: { sceneId: "scene.valley.settlement", x: 488, y: 456 } });

const tradeCoordinator = (store = new MemoryDurableJsonStore()) => {
  const lot = createDemoTradeLots().find((candidate) => candidate.itemId === "food.cooked_game_meat")!;
  const session = GameSession.create({ sessionId: "save.browser.trade",
    mp: { currentMp: 10, maxMp: 10, worldVersion: 0 }, currentSceneId: "scene.valley.settlement",
    economy: { ...createEmptySessionEconomy(), lots: [{ ...lot, legalOwnerId: "save.browser.trade", quantity: 2 }] } });
  return { coordinator: BrowserGameSessionWalCoordinator.fresh(session, store), store, lot };
};

describe("production browser GameSession WAL companion", () => {
  it("persists an exact eight-owner envelope and compacts only after durable snapshot acknowledgement", () => {
    const { coordinator, store } = deathCoordinator();
    const applied = coordinator.commitDeath(deathRequest());
    expect(applied.state).toBe("applied");
    const beforeBarrier = store.read() as { wal: { records: readonly { state: string; participantSnapshotAcks: readonly string[] }[] } };
    expect(beforeBarrier.wal.records[0]).toMatchObject({ state: "applied", participantSnapshotAcks: [] });

    const envelope = coordinator.toEnvelope();
    expect(envelope.schema).toBe(BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA);
    expect(envelope.companion.ownerSnapshots).toHaveLength(8);
    expect(envelope.companion.wal.records).toEqual([]);
    expect(envelope.companion.wal.compactReceipts).toEqual([expect.objectContaining({
      transactionKind: "death", canonicalIdempotencyKey: expect.any(String), collectedTick: expect.any(Number),
    })]);
    expect(envelope.companion.ownerSnapshots.every((snapshot) => snapshot.appliedTransactionIds.length === 0)).toBe(true);
    expect(envelope.companion.durableWalSnapshotAcks).toEqual([]);
    expect(readBrowserGameSessionSaveEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);

    const reloaded = BrowserGameSessionWalCoordinator.load(store, 2);
    expect(reloaded.isSceneActivationReady()).toBe(true);
    expect(reloaded.toSessionSave().state.lifeCorpseLedger.corpses).toHaveProperty(
      reloaded.toSessionSave().state.lifeCorpseLedger.corpseIdByLifeId[life().lifeInstanceId]!,
    );
    expect(reloaded.toCompanion().wal).toMatchObject({ records: [], compactReceipts: [expect.objectContaining({ transactionKind: "death" })] });
  });

  it("recovers every actual durable write cut to an unambiguous before or committed death fixed point", () => {
    const baseline = deathCoordinator();
    const beforeWrites = baseline.store.writeCount;
    baseline.coordinator.commitDeath(deathRequest());
    const transactionWrites = baseline.store.writeCount - beforeWrites;
    const outcomes = new Set<string>();
    for (let cut = 1; cut <= transactionWrites + 1; cut += 1) {
      const { coordinator, store } = deathCoordinator();
      store.crashAfterAdditionalWrites(cut);
      try { coordinator.commitDeath(deathRequest()); } catch { /* simulated process death */ }
      store.clearFailure();
      const raw = store.read() as { durableWalRecords?: readonly { transactionKind: string; durableDecision: string; state: string }[];
        wal?: { records?: readonly { transactionKind: string; durableDecision: string; state: string }[] } };
      const durableDeath = raw.durableWalRecords?.find((record) => record.transactionKind === "death") ??
        raw.wal?.records?.find((record) => record.transactionKind === "death");
      const reloaded = BrowserGameSessionWalCoordinator.load(store, 3);
      expect(reloaded.isSceneActivationReady()).toBe(true);
      const save = reloaded.toSessionSave();
      const corpseId = save.state.lifeCorpseLedger.corpseIdByLifeId[life().lifeInstanceId];
      if (durableDeath?.durableDecision === "commit") {
        outcomes.add("committed");
        expect(corpseId).toBeDefined();
        const receipt = reloaded.toCompanion().wal.compactReceipts?.find((candidate) => candidate.transactionKind === "death")!;
        expect(save.state.receiptIndex[createCrossSaveReceiptId(receipt.transactionId, "death")]).toBeDefined();
      } else {
        outcomes.add("before");
        expect(durableDeath?.state === "aborted" || durableDeath?.durableDecision === "undecided" || !durableDeath).toBe(true);
        expect(corpseId).toBeUndefined();
        expect(save.state.lifeCorpseLedger.lives[life().lifeInstanceId]!.state).toBe("alive");
      }
    }
    expect(transactionWrites).toBeGreaterThan(1);
    expect(outcomes).toEqual(new Set(["before", "committed"]));
  });

  it("fail-closes corrupt checksums and missing or forged owner snapshots", () => {
    const valid = deathCoordinator().coordinator.toCompanion();
    const checksumForged = { ...valid, checksum: `sha256:${"0".repeat(64)}` };
    const checksumStore = new MemoryDurableJsonStore(); checksumStore.write(checksumForged);
    expect(() => BrowserGameSessionWalCoordinator.load(checksumStore)).toThrow(/checksum/);

    const authorityTampered = structuredClone(valid) as unknown as {
      authority: { session: { state: { economy: { coin: number } } } };
    };
    authorityTampered.authority.session.state.economy.coin += 1;
    const authorityStore = new MemoryDurableJsonStore(); authorityStore.write(authorityTampered);
    expect(() => BrowserGameSessionWalCoordinator.load(authorityStore)).toThrow(/integrity/);

    const walTampered = structuredClone(valid) as unknown as { wal: { acceptingNewTransactions: boolean } };
    walTampered.wal.acceptingNewTransactions = !walTampered.wal.acceptingNewTransactions;
    const walStore = new MemoryDurableJsonStore(); walStore.write(walTampered);
    expect(() => BrowserGameSessionWalCoordinator.load(walStore)).toThrow(/malformed/);

    const metadataTampered = { ...valid, persistenceTail: [...valid.persistenceTail,
      { transactionId: "forged", phase: "prepared" as const }] };
    const metadataStore = new MemoryDurableJsonStore(); metadataStore.write(metadataTampered);
    expect(() => BrowserGameSessionWalCoordinator.load(metadataStore)).toThrow(/checksum/);
    const alternate = BrowserGameSessionWalCoordinator.fresh(GameSession.create({
      sessionId: "save.browser.wal.alternate",
      mp: { currentMp: 4, maxMp: 12, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement",
    }), new MemoryDurableJsonStore()).toCompanion();

    // Every nested replacement is independently well-formed and signed; the
    // stale top-level checksum must still bind the exact companion composition.
    const resignedAuthority = { ...valid, authority: { ...valid.authority, session: alternate.authority.session } };
    const resignedAuthorityStore = new MemoryDurableJsonStore(); resignedAuthorityStore.write(resignedAuthority);
    expect(() => BrowserGameSessionWalCoordinator.load(resignedAuthorityStore)).toThrow(/checksum/);

    const withRecord = deathCoordinator();
    withRecord.coordinator.commitDeath(deathRequest());
    const fullRecord = (withRecord.store.read() as ReturnType<typeof withRecord.coordinator.toCompanion>).wal.records[0]!;
    const recorded = withRecord.coordinator.toCompanion();
    const resignedWal = { ...valid, wal: recorded.wal };
    const resignedWalStore = new MemoryDurableJsonStore(); resignedWalStore.write(resignedWal);
    expect(() => BrowserGameSessionWalCoordinator.load(resignedWalStore)).toThrow(/checksum/);

    const validPhaseAheadRecord = { ...valid, durableWalRecords: [fullRecord] };
    const phaseAheadStore = new MemoryDurableJsonStore(); phaseAheadStore.write(validPhaseAheadRecord);
    expect(() => BrowserGameSessionWalCoordinator.load(phaseAheadStore)).toThrow(/checksum/);

    const replacementOwnerIndex = valid.ownerSnapshots.findIndex((snapshot, index) =>
      snapshot.projectionDigest !== alternate.ownerSnapshots[index]!.projectionDigest);
    expect(replacementOwnerIndex).toBeGreaterThanOrEqual(0);
    const resignedOwner = { ...valid, ownerSnapshots: valid.ownerSnapshots.map((snapshot, index) =>
      index === replacementOwnerIndex ? alternate.ownerSnapshots[index]! : snapshot) };
    const resignedOwnerStore = new MemoryDurableJsonStore(); resignedOwnerStore.write(resignedOwner);
    expect(() => BrowserGameSessionWalCoordinator.load(resignedOwnerStore)).toThrow(/checksum/);
    const ownerMissing = { ...valid, ownerSnapshots: valid.ownerSnapshots.slice(1) };
    const missingStore = new MemoryDurableJsonStore(); missingStore.write(ownerMissing);
    expect(() => BrowserGameSessionWalCoordinator.load(missingStore)).toThrow(/owner snapshots/);

    const ownerForged = { ...valid, ownerSnapshots: valid.ownerSnapshots.map((snapshot, index) =>
      index === 0 ? { ...snapshot, projectionDigest: `sha256:${"f".repeat(64)}` } : snapshot) };
    const forgedStore = new MemoryDurableJsonStore(); forgedStore.write(ownerForged);
    expect(() => BrowserGameSessionWalCoordinator.load(forgedStore)).toThrow(/owner snapshots/);
  });

  it("preserves a live quote through ordinary durable commit, then invalidates it on a real reload", () => {
    const live = tradeCoordinator();
    const runtime = { playerPositionPx: { x: 488, y: 456 }, sceneRevision: 0, operationId: "browser.trade.quote.1" };
    const issued = proposeVerifiedTradeQuote(live.coordinator.readSession(), { playerSaveId: "save.browser.trade",
      merchantId: "settlement.butcher", lotId: live.lot.lotId, quantity: 1 }, runtime);
    expect(issued.accepted).toBe(true);
    if (!issued.accepted) return;
    expect(live.coordinator.commitOrdinary(issued.batch).committed).toBe(true);
    expect(live.coordinator.commitSell(issued.quote, issued.issuedEventId, runtime).state).toBe("applied");
    expect(live.coordinator.toSessionSave().state.economy.coin).toBeGreaterThan(0);

    const held = tradeCoordinator();
    const heldIssued = proposeVerifiedTradeQuote(held.coordinator.readSession(), { playerSaveId: "save.browser.trade",
      merchantId: "settlement.butcher", lotId: held.lot.lotId, quantity: 1 }, runtime);
    expect(heldIssued.accepted).toBe(true);
    if (!heldIssued.accepted) return;
    expect(held.coordinator.commitOrdinary(heldIssued.batch).committed).toBe(true);
    const restarted = BrowserGameSessionWalCoordinator.load(held.store, 0);
    expect(() => restarted.commitSell(heldIssued.quote, heldIssued.issuedEventId, runtime)).toThrow(/rejected/);
  });
});
