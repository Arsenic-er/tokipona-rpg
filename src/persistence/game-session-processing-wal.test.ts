import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { createWildlifeLifeRecord } from "../game/life-corpse-ledger";
import { createEmptySessionEconomy } from "../game/economy-state";
import { wildlifeProcessingManifest, type WildlifeProcessingAction, type WildlifeProcessingWorkOrder } from "../game/wildlife-processing";
import {
  commitSessionProposal,
  proposeWildlifeDamage,
  proposeVerifiedTradeQuote,
  proposeWildlifeLifeRegistration,
  proposeWildlifeProcessing,
  proposeWildlifeProcessingInteraction,
} from "../session/adapters";
import { GameSession } from "../session/game-session";
import {
  InMemoryDurableCrossSaveWalStore,
  createCrossSaveReceiptId,
  createCrossSaveTransactionId,
  sha256Canonical,
  type CrossSaveWalOperationEnvelope,
  type CrossSaveWalRecord,
  type CrossSaveWalSave,
  type JsonValue,
} from "./cross-save-wal";
import {
  GameSessionProcessingWalBridge,
  InMemoryGameSessionAuthorityStore,
  InMemoryGameSessionPartitionStore,
  readGameSessionProcessingWalContract,
  type GameSessionWalSaveOwner,
} from "./game-session-processing-wal";

const commit = (session: GameSession, batch: Parameters<typeof commitSessionProposal>[1]): GameSession => {
  const result = commitSessionProposal(session, batch);
  if (!result.committed) throw new Error(`fixture commit failed: ${result.reason}`);
  return result.session;
};

const harvestSession = (): GameSession => {
  let session = GameSession.create({ sessionId: "save.wal.harvest", mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: "scene.valley.den_bypass", economy: createEmptySessionEconomy() });
  const life = createWildlifeLifeRecord({ lifeInstanceId: "life.wal.rabbit", regionSaveId: "region-save.valley",
    regionId: "valley_prologue", entityId: "wildlife.rabbit.valley", species: "rabbit", ageClass: "adult",
    spawnGeneration: 0, spawnSequence: 1, harvestProfileId: "harvest.rabbit.v0.1", maxHp: 8, registeredAtWorldTick: 0 });
  session = commit(session, proposeWildlifeLifeRegistration("wal.register", life));
  session = commit(session, proposeWildlifeDamage(session, { transactionId: "fixture.death", lifeInstanceId: life.lifeInstanceId,
    expectedLifeRevision: 0, damage: 8, causeClass: "clean_tool", worldTick: 0,
    position: { sceneId: "scene.valley.den_bypass", x: 2, y: 3 } }));
  session = commit(session, { transactionId: "wal.enter.settlement", drafts: [{ eventId: "wal.enter.settlement",
    type: "scene_entered", payload: { sceneId: "scene.valley.settlement" } }] });
  session = commit(session, proposeWildlifeProcessingInteraction(session, "field_knife", {
    playerPositionPx: { x: 232, y: 456 }, sceneRevision: session.snapshot().world.revision,
    runtimeInteractionSequence: 1, operationId: "wal-field-knife",
  }));
  return session;
};

const commitAuthority = (authority: InMemoryGameSessionAuthorityStore, batch: Parameters<typeof commitSessionProposal>[1]): void => {
  const before = authority.read();
  const result = commitSessionProposal(before, batch);
  if (!result.committed || !authority.compareAndSwap(before.snapshot().revision, result.session)) {
    throw new Error(`authority fixture commit failed: ${result.reason ?? "CAS"}`);
  }
};

let interactionSequence = 10;
const authorize = (authority: InMemoryGameSessionAuthorityStore, stationId: string, operationId: string): string => {
  const beforeIds = new Set(Object.keys(authority.read().snapshot().receiptIndex));
  const binding = wildlifeProcessingManifest().stationBindings[stationId]!;
  const current = authority.read();
  commitAuthority(authority, proposeWildlifeProcessingInteraction(current, stationId, {
    playerPositionPx: binding.interactionPointPx, sceneRevision: current.snapshot().world.revision,
    runtimeInteractionSequence: interactionSequence++, operationId,
  }));
  return Object.keys(authority.read().snapshot().receiptIndex).find((id) => !beforeIds.has(id) &&
    id.startsWith(`wildlife-processing-interaction:${stationId}:`))!;
};
const harvestRequest = (session: GameSession, harvestSequence = 0): WildlifeProcessingAction => {
  const corpse = Object.values(session.snapshot().lifeCorpseLedger.corpses)[0]!;
  const slot = corpse.tissueSlots.find((candidate) => candidate.tissueSlotId === "meat")!;
  return { action: "harvest", transactionId: "caller-untrusted", canonicalIdempotencyKey: "caller-untrusted",
    currentWorldTick: 999, corpseId: corpse.corpseId, tissueSlotId: slot.tissueSlotId, harvestSequence,
    expectedCorpseRevision: corpse.revision, expectedRemainingTissueQuantity: slot.remainingQuantity,
    expectedInventoryRevision: session.snapshot().economy.inventoryRevision,
    playerSaveId: "save.wal.harvest", stationOrToolId: "field_knife",
    interactionReceiptId: Object.keys(session.snapshot().receiptIndex).find((id) => id.startsWith("wildlife-processing-interaction:field_knife:"))! };
};

const fixture = () => {
  const session = harvestSession();
  const authority = new InMemoryGameSessionAuthorityStore(session);
  const partitions = new InMemoryGameSessionPartitionStore(session.toSave());
  const walStore = new InMemoryDurableCrossSaveWalStore();
  const bridge = new GameSessionProcessingWalBridge(authority, walStore, partitions);
  return { session, authority, partitions, walStore, bridge };
};

const committedCrashSave = (base: CrossSaveWalSave, prepared: CrossSaveWalRecord, acknowledged: number): CrossSaveWalSave => {
  const participantApplyAcks = prepared.participants.slice(0, acknowledged).map((participant) => participant.saveOwner);
  const record: CrossSaveWalRecord = { ...prepared, state: "committed", durableDecision: "commit",
    participantApplyAcks, participants: prepared.participants.map((participant, index) =>
      index < acknowledged ? { ...participant, appliedRevision: participant.afterRevision } : participant) };
  const body = { ...base, records: base.records.map((candidate) => candidate.transactionId === prepared.transactionId ? record : candidate) };
  return { ...body, checksum: sha256Canonical({ schema: body.schema, contract: body.contract as unknown as JsonValue,
    records: body.records as unknown as JsonValue, receiptIndex: body.receiptIndex as unknown as JsonValue,
    acceptingNewTransactions: body.acceptingNewTransactions }) };
};

const applyPartitionOnly = (
  partitions: InMemoryGameSessionPartitionStore,
  envelope: CrossSaveWalOperationEnvelope,
  transactionId: string,
): void => {
  const redo = envelope.redoPayload as unknown as Record<string, unknown>;
  partitions.apply({ ...envelope, redoPayload: { ...redo, publisher: false, afterSave: null } as unknown as JsonValue }, transactionId);
};

const cookedFixture = () => {
  const built = fixture();
  const harvest = built.bridge.prepareProcessing(harvestRequest(built.authority.read()));
  built.bridge.commit(harvest.transactionId, 300);
  const reserveReceipt = authorize(built.authority, "communal_kitchen", "consume-reserve");
  const raw = built.authority.read().snapshot().economy.lots.find((lot) => lot.itemId === "food.raw_small_game_meat")!;
  const reserve = built.bridge.prepareProcessing({ action: "reserve", transactionId: "caller", canonicalIdempotencyKey: "caller",
    currentWorldTick: 0, expectedInventoryRevision: built.authority.read().snapshot().economy.inventoryRevision,
    playerSaveId: "save.wal.harvest", stationId: "communal_kitchen", recipeId: "cook.game_meat.v0.1", startEventSequence: 0,
    interactionReceiptId: reserveReceipt, inputs: [{ lotId: raw.lotId, quantity: 1, expectedOwnershipRevision: raw.ownershipRevision,
      expectedFreshnessRevision: raw.freshnessRevision, expectedReservationRevision: raw.wildlifeProvenance!.reservationRevision }] });
  built.bridge.commit(reserve.transactionId, 301);
  let order = built.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;
  const workReceipt = authorize(built.authority, "communal_kitchen", "consume-work");
  const work = built.bridge.prepareWork(order.workOrderId, workReceipt, 302);
  built.bridge.commit(work.transactionId, 302);
  order = built.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;
  const completeReceipt = authorize(built.authority, "communal_kitchen", "consume-complete");
  const complete = built.bridge.prepareProcessing({ action: "complete", transactionId: "caller", canonicalIdempotencyKey: "caller",
    currentWorldTick: 0, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
    expectedInventoryRevision: built.authority.read().snapshot().economy.inventoryRevision, energyEventId: null,
    interactionReceiptId: completeReceipt });
  built.bridge.commit(complete.transactionId, 303);
  order = built.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;
  const claimReceipt = authorize(built.authority, "communal_kitchen", "consume-claim");
  const claim = built.bridge.prepareProcessing({ action: "claim", transactionId: "caller", canonicalIdempotencyKey: "caller",
    currentWorldTick: 0, workOrderId: order.workOrderId, expectedWorkOrderRevision: order.revision,
    expectedInventoryRevision: built.authority.read().snapshot().economy.inventoryRevision,
    claimantPlayerSaveId: "save.wal.harvest", interactionReceiptId: claimReceipt });
  built.bridge.commit(claim.transactionId, 304);
  const cookedLot = built.authority.read().snapshot().economy.lots.find((lot) => lot.itemId === "food.cooked_game_meat")!;
  return { ...built, cookedLot };
};

const sellFixture = () => {
  const built = fixture();
  const harvest = built.bridge.prepareProcessing(harvestRequest(built.authority.read()));
  built.bridge.commit(harvest.transactionId, 300);
  const current = built.authority.read();
  const lot = current.snapshot().economy.lots.find((candidate) => candidate.itemId === "food.raw_small_game_meat")!;
  const runtime = { playerPositionPx: { x: 488, y: 456 }, sceneRevision: current.snapshot().world.revision };
  const issued = proposeVerifiedTradeQuote(current, { playerSaveId: "save.wal.harvest", merchantId: "settlement.butcher",
    lotId: lot.lotId, quantity: 1 }, { ...runtime, operationId: "wal-sell-issue" });
  if (!issued.accepted) throw new Error(`quote fixture failed: ${issued.reason}`);
  commitAuthority(built.authority, issued.batch);
  return { ...built, quote: issued.quote, issuedEventId: issued.issuedEventId, runtime };
};
describe("GameSession owner-specific production WAL bridge", () => {
  it("uses the exact generated kind-to-owner projection with no fallback", () => {
    const manifest = wildlifeProcessingManifest();
    const contract = readGameSessionProcessingWalContract(generatedRuntimeArtifact);
    for (const kind of Object.keys(contract.registeredTransactionKinds)) {
      expect(contract.registeredTransactionKinds[kind]).toEqual(manifest.wal.registeredTransactions[kind]?.participants);
    }
    const forged = structuredClone(generatedRuntimeArtifact) as unknown as Record<string, unknown>;
    const projected = forged.wildlifeProcessing as Record<string, unknown>;
    const wal = projected.wal as Record<string, unknown>;
    const txs = wal.registeredTransactions as Record<string, { kind: string; participants: string[] }>;
    txs.harvest.participants = ["player_inventory_save"];
    expect(() => readGameSessionProcessingWalContract(forged)).toThrow("source digest mismatch");
  });

  it("rejects a registered owner whose authoritative before/after projection is identical", () => {
    const built = fixture();
    const key = "no-owner-effect";
    const transactionId = createCrossSaveTransactionId("death", key);
    expect(() => built.bridge.prepareProposal({ transactionKind: "death", canonicalIdempotencyKey: key, tick: 1,
      batch: { transactionId, drafts: [{ eventId: `scene-only:${transactionId}`, type: "scene_entered",
        payload: { sceneId: "scene.valley.settlement" } }] } })).toThrow("no authoritative material effect");
  });

  it("is not ready when valid owner snapshots come from a different authority fixed point", () => {
    const base = harvestSession();
    const partitions = new InMemoryGameSessionPartitionStore(base.toSave());
    const otherLife = createWildlifeLifeRecord({ lifeInstanceId: "life.wal.mismatched", regionSaveId: "region-save.valley",
      regionId: "valley_prologue", entityId: "wildlife.rabbit.valley", species: "rabbit", ageClass: "adult",
      spawnGeneration: 1, spawnSequence: 9, harvestProfileId: "harvest.rabbit.v0.1", maxHp: 8, registeredAtWorldTick: 0 });
    const changed = commit(base, proposeWildlifeLifeRegistration("wal.mismatched.register", otherLife));
    const bridge = new GameSessionProcessingWalBridge(new InMemoryGameSessionAuthorityStore(changed),
      new InMemoryDurableCrossSaveWalStore(), partitions);
    expect(bridge.isSceneActivationReady()).toBe(false);
  });
  it("makes each harvest owner partial observable, recovers every crash cut to one fixed point, then no-ops", () => {
    const ownerCount = readGameSessionProcessingWalContract().registeredTransactionKinds.harvest!.length;
    for (let appliedCount = 0; appliedCount <= ownerCount; appliedCount += 1) {
      const { authority, partitions, bridge } = fixture();
      const before = authority.save();
      const prepared = bridge.prepareProcessing(harvestRequest(authority.read()));
      for (let index = 0; index < appliedCount; index += 1) {
        applyPartitionOnly(partitions, prepared.operationEnvelopes[index]!, prepared.transactionId);
      }
      for (let index = 0; index < ownerCount; index += 1) {
        const owner = prepared.participants[index]!.saveOwner as GameSessionWalSaveOwner;
        expect(partitions.read(owner).appliedTransactionIds.includes(prepared.transactionId)).toBe(index < appliedCount);
      }
      expect(authority.save()).toEqual(before);
      const acknowledged = Math.min(appliedCount, ownerCount - 1);
      const crashSave = committedCrashSave(bridge.walSave(), prepared, acknowledged);
      const resumed = new GameSessionProcessingWalBridge(authority, new InMemoryDurableCrossSaveWalStore(), partitions);
      resumed.loadWal(crashSave);
      expect(resumed.recover(300)).toMatchObject({ sceneActivationBlocked: false, changed: true });
      resumed.endBarrier();
      expect(resumed.isSceneActivationReady()).toBe(true);
      expect(authority.read().snapshot().economy.lots.some((lot) => lot.processingTransactionId === prepared.transactionId)).toBe(true);
      for (const participant of prepared.participants) {
        const snapshot = partitions.read(participant.saveOwner as GameSessionWalSaveOwner);
        expect(snapshot.appliedTransactionIds.filter((id) => id === prepared.transactionId)).toHaveLength(1);
      }
      expect(resumed.recover(301)).toMatchObject({ sceneActivationBlocked: false, changed: false });
    }
  });

  it("aborts a second same-corpse harvest at precommit while the first durable lock is held", () => {
    const { authority, bridge } = fixture();
    const first = bridge.prepareProcessing(harvestRequest(authority.read(), 0));
    expect(first).toMatchObject({ state: "prepared", durableDecision: "undecided" });
    const second = bridge.prepareProcessing(harvestRequest(authority.read(), 1));
    expect(second).toMatchObject({ state: "aborted", durableDecision: "abort", participantPrepareAcks: [] });
    expect(authority.read().snapshot().economy.lots).toHaveLength(0);
  });

  it("serializes different-subject proposals at the global precommit lock", () => {
    const { authority, bridge } = fixture();
    const first = bridge.prepareProcessing(harvestRequest(authority.read(), 0));
    const corpse = Object.values(authority.read().snapshot().lifeCorpseLedger.corpses)[0]!;
    const hide = corpse.tissueSlots.find((slot) => slot.tissueSlotId === "hide")!;
    const secondRequest = harvestRequest(authority.read(), 1) as Extract<WildlifeProcessingAction, { action: "harvest" }>;
    const second = bridge.prepareProcessing({ ...secondRequest, tissueSlotId: "hide",
      expectedRemainingTissueQuantity: hide.remainingQuantity });
    expect(first.state).toBe("prepared");
    expect(second).toMatchObject({ state: "aborted", durableDecision: "abort", participantPrepareAcks: [] });
    expect(authority.read().snapshot().economy.lots).toHaveLength(0);
  });

  it("recovers when the publisher partition is durable but authority publish did not happen", () => {
    const { authority, partitions, bridge } = fixture();
    const before = authority.save();
    const prepared = bridge.prepareProcessing(harvestRequest(authority.read()));
    for (const envelope of prepared.operationEnvelopes) applyPartitionOnly(partitions, envelope, prepared.transactionId);
    expect(authority.save()).toEqual(before);
    const crashSave = committedCrashSave(bridge.walSave(), prepared, prepared.participants.length - 1);
    const resumed = new GameSessionProcessingWalBridge(authority, new InMemoryDurableCrossSaveWalStore(), partitions);
    resumed.loadWal(crashSave);
    expect(resumed.recover(400)).toMatchObject({ sceneActivationBlocked: false, changed: true });
    expect(authority.read().snapshot().economy.lots.some((lot) => lot.processingTransactionId === prepared.transactionId)).toBe(true);
    expect(resumed.recover(401).changed).toBe(false);
  });

  it("does not regress durable partial owners when loading an older GameSession checkpoint", () => {
    const { authority, partitions, bridge } = fixture();
    const checkpoint = authority.save();
    const prepared = bridge.prepareProcessing(harvestRequest(authority.read()));
    applyPartitionOnly(partitions, prepared.operationEnvelopes[0]!, prepared.transactionId);
    const firstOwner = prepared.participants[0]!.saveOwner as GameSessionWalSaveOwner;
    const partialRevision = partitions.read(firstOwner).revision;
    const crashSave = committedCrashSave(bridge.walSave(), prepared, 1);
    const resumed = new GameSessionProcessingWalBridge(authority, new InMemoryDurableCrossSaveWalStore(), partitions);
    expect(resumed.loadCheckpoint(checkpoint, crashSave, 450)).toMatchObject({ sceneActivationBlocked: false });
    expect(partitions.read(firstOwner).revision).toBe(partialRevision);
    expect(authority.read().snapshot().economy.lots.some((lot) => lot.processingTransactionId === prepared.transactionId)).toBe(true);
  });

  it("recovers after authority publish when the publisher apply_ack was not persisted", () => {
    const built = fixture();
    const before = built.authority.save();
    const prepared = built.bridge.prepareProcessing(harvestRequest(built.authority.read()));
    for (const envelope of prepared.operationEnvelopes) applyPartitionOnly(built.partitions, envelope, prepared.transactionId);
    const publisherRedo = prepared.operationEnvelopes.at(-1)!.redoPayload as unknown as Record<string, unknown>;
    expect(built.authority.publishWalMaterialization(prepared.transactionId, before.state.revision,
      publisherRedo.afterSave as typeof before, publisherRedo.authorityBeforeDigest as `sha256:${string}`,
      publisherRedo.afterSaveDigest as `sha256:${string}`)).toBe(true);
    const crashSave = committedCrashSave(built.bridge.walSave(), prepared, prepared.participants.length - 1);
    const resumed = new GameSessionProcessingWalBridge(built.authority, new InMemoryDurableCrossSaveWalStore(), built.partitions);
    resumed.loadWal(crashSave);
    expect(resumed.recover(475)).toMatchObject({ sceneActivationBlocked: false, changed: true });
    const receiptId = createCrossSaveReceiptId(prepared.transactionId, "harvest");
    expect(Object.keys(built.authority.read().snapshot().receiptIndex).filter((id) => id === receiptId)).toHaveLength(1);
    expect(built.authority.read().snapshot().economy.lots.filter((lot) => lot.processingTransactionId === prepared.transactionId)).toHaveLength(1);
    expect(resumed.recover(476).changed).toBe(false);
  });

  it("region-exit barrier durably resolves a prepared record before allowing activation", () => {
    const built = fixture();
    const prepared = built.bridge.prepareProcessing(harvestRequest(built.authority.read()));
    expect(built.bridge.regionExitBarrier(490)).toMatchObject({ sceneActivationBlocked: false, changed: true });
    expect(built.bridge.walSave().records.find((record) => record.transactionId === prepared.transactionId))
      .toMatchObject({ state: "aborted", durableDecision: "abort" });
    expect(built.bridge.isSceneActivationReady()).toBe(false);
    built.bridge.endBarrier();
    expect(built.bridge.isSceneActivationReady()).toBe(true);
  });
  it("checkpoint barrier aborts undecided records, forwards committed records, and permits ack/GC only after snapshots", () => {
    const undecided = fixture();
    const prepared = undecided.bridge.prepareProcessing(harvestRequest(undecided.authority.read()));
    expect(undecided.bridge.checkpointBarrier(500)).toMatchObject({ sceneActivationBlocked: false, changed: true });
    expect(undecided.bridge.walSave().records.find((record) => record.transactionId === prepared.transactionId)?.state).toBe("aborted");
    undecided.bridge.endBarrier();

    const committed = fixture();
    const record = committed.bridge.prepareProcessing(harvestRequest(committed.authority.read()));
    const crashSave = committedCrashSave(committed.bridge.walSave(), record, 0);
    const resumedStore = new InMemoryDurableCrossSaveWalStore();
    const resumed = new GameSessionProcessingWalBridge(committed.authority, resumedStore, committed.partitions);
    resumed.loadWal(crashSave);
    expect(resumed.checkpointBarrier(510)).toMatchObject({ sceneActivationBlocked: false, changed: true });
    const applied = resumed.walSave().records[0]!;
    expect(applied.state).toBe("applied");
    expect(() => resumed.garbageCollect(applied.transactionId, 511)).toThrow("snapshots");
    for (const participant of applied.participants) {
      resumedStore.acknowledgeDurableSnapshot(applied.transactionId, participant.saveOwner, participant.afterRevision);
      resumed.acknowledgeParticipantSnapshot(applied.transactionId, participant.saveOwner, participant.afterRevision, 511);
    }
    expect(resumed.garbageCollect(applied.transactionId, 512).state).toBe("garbage_collectable");
  });
  it("does not let an old checkpoint overwrite a durable partial owner snapshot", () => {
    const { authority, partitions, bridge } = fixture();
    const oldCheckpoint = authority.save();
    const prepared = bridge.prepareProcessing(harvestRequest(authority.read()));
    applyPartitionOnly(partitions, prepared.operationEnvelopes[0]!, prepared.transactionId);
    const owner = prepared.participants[0]!.saveOwner as GameSessionWalSaveOwner;
    const durableRevision = partitions.read(owner).revision;
    expect(() => partitions.installCheckpoint(oldCheckpoint, [owner])).toThrow("cannot overwrite");
    expect(partitions.read(owner).revision).toBe(durableRevision);
  });

  it("blocks activation when every owner snapshot is valid but belongs to a different authority fixed point", () => {
    const authoritySession = harvestSession();
    const survival = authoritySession.snapshot().survival;
    const divergent = commit(GameSession.fromSave(authoritySession.toSave()), {
      transactionId: "wal.fixture.divergent-survival",
      drafts: [{ eventId: "wal.fixture.divergent-survival", type: "survival_replaced", payload: { survival: {
        ...survival,
        revision: survival.revision + 1,
        worldTicks: survival.worldTicks + 1,
      } } }],
    });
    const bridge = new GameSessionProcessingWalBridge(
      new InMemoryGameSessionAuthorityStore(authoritySession),
      new InMemoryDurableCrossSaveWalStore(),
      new InMemoryGameSessionPartitionStore(divergent.toSave()),
    );
    expect(bridge.isSceneActivationReady()).toBe(false);
  });
  it("blocks activation for a missing owner and quarantines a corrupt owner during committed recovery", () => {
    const missing = fixture();
    missing.partitions.removeOwnerForTest("player_inventory_save");
    expect(missing.bridge.isSceneActivationReady()).toBe(false);

    const corrupt = fixture();
    const prepared = corrupt.bridge.prepareProcessing(harvestRequest(corrupt.authority.read()));
    corrupt.partitions.corruptOwnerForTest("world_clock_save");
    const result = corrupt.bridge.commit(prepared.transactionId, 300);
    expect(result.quarantineReason).toMatch(/corrupt|conflict/);
    expect(corrupt.bridge.isSceneActivationReady()).toBe(false);
  });

  it("commits a live-issued verified sell with exact owners, canonical receipt, duplicate identity, and every crash cut", () => {
    const expectedOwners = readGameSessionProcessingWalContract().registeredTransactionKinds.sell!;
    for (let appliedCount = 0; appliedCount <= expectedOwners.length; appliedCount += 1) {
      const built = sellFixture();
      const prepared = built.bridge.prepareSell(built.quote, built.issuedEventId, built.runtime);
      expect(prepared.participants.map((participant) => participant.saveOwner)).toEqual(expectedOwners);
      expect(prepared.operationEnvelopes.flatMap((envelope) => envelope.deterministicReceiptIds))
        .toEqual([createCrossSaveReceiptId(prepared.transactionId, "sell")]);
      expect(built.bridge.prepareSell(built.quote, built.issuedEventId, built.runtime)).toEqual(prepared);
      expect(() => built.bridge.prepareSell({ ...built.quote, totalCoin: built.quote.totalCoin + 1 }, built.issuedEventId, built.runtime))
        .toThrow("idempotency key conflicts");
      for (let index = 0; index < appliedCount; index += 1) {
        applyPartitionOnly(built.partitions, prepared.operationEnvelopes[index]!, prepared.transactionId);
      }
      const crashSave = committedCrashSave(built.bridge.walSave(), prepared,
        Math.min(appliedCount, expectedOwners.length - 1));
      const resumed = new GameSessionProcessingWalBridge(built.authority, new InMemoryDurableCrossSaveWalStore(), built.partitions);
      resumed.loadWal(crashSave);
      expect(resumed.recover(600)).toMatchObject({ sceneActivationBlocked: false, changed: true });
      resumed.endBarrier();
      const snapshot = built.authority.read().snapshot();
      expect(snapshot.economy.tradeReceipts.filter((receipt) => receipt.transactionId === prepared.transactionId)).toHaveLength(1);
      expect(snapshot.receiptIndex[createCrossSaveReceiptId(prepared.transactionId, "sell")]).toBeDefined();
      expect(resumed.recover(601).changed).toBe(false);
    }
  });

  it("invalidates a verified sell capability after a real save/load boundary", () => {
    const built = sellFixture();
    const loadedSession = GameSession.fromSave(built.authority.save());
    const loadedAuthority = new InMemoryGameSessionAuthorityStore(loadedSession);
    const loadedBridge = new GameSessionProcessingWalBridge(loadedAuthority, new InMemoryDurableCrossSaveWalStore(),
      new InMemoryGameSessionPartitionStore(loadedSession.toSave()));
    expect(() => loadedBridge.prepareSell(built.quote, built.issuedEventId, built.runtime)).toThrow("rejected");
  });

  it("commits canonical inventory consumption through all exact owners and recovers every crash cut once", () => {
    const expectedOwners = readGameSessionProcessingWalContract().registeredTransactionKinds.consume!;
    for (let appliedCount = 0; appliedCount <= expectedOwners.length; appliedCount += 1) {
      const built = cookedFixture();
      const prepared = built.bridge.prepareConsumption({ playerSaveId: "save.wal.harvest", lotId: built.cookedLot.lotId,
        quantity: 1, consumptionSequence: 1 });
      expect(prepared.participants.map((participant) => participant.saveOwner)).toEqual(expectedOwners);
      const receiptId = createCrossSaveReceiptId(prepared.transactionId, "consume");
      expect(prepared.operationEnvelopes.flatMap((envelope) => envelope.deterministicReceiptIds)).toEqual([receiptId]);
      expect(built.bridge.prepareConsumption({ playerSaveId: "save.wal.harvest", lotId: built.cookedLot.lotId,
        quantity: 1, consumptionSequence: 1 })).toEqual(prepared);
      expect(() => built.bridge.prepareConsumption({ playerSaveId: "save.wal.harvest", lotId: built.cookedLot.lotId,
        quantity: 2, consumptionSequence: 1 })).toThrow("idempotency key conflicts");
      for (let index = 0; index < appliedCount; index += 1) {
        applyPartitionOnly(built.partitions, prepared.operationEnvelopes[index]!, prepared.transactionId);
      }
      const crashSave = committedCrashSave(built.bridge.walSave(), prepared,
        Math.min(appliedCount, expectedOwners.length - 1));
      const resumed = new GameSessionProcessingWalBridge(built.authority, new InMemoryDurableCrossSaveWalStore(), built.partitions);
      resumed.loadWal(crashSave);
      expect(resumed.recover(700)).toMatchObject({ sceneActivationBlocked: false, changed: true });
      resumed.endBarrier();
      const snapshot = built.authority.read().snapshot();
      expect(snapshot.survival.receipts.filter((candidate) => candidate === receiptId)).toHaveLength(1);
      expect(snapshot.receiptIndex[receiptId]).toBeDefined();
      expect(resumed.recover(701).changed).toBe(false);
    }
  });

  it("commits death through two independent owner snapshots before publishing the corpse", () => {
    let session = GameSession.create({ sessionId: "save.wal.death", mp: { currentMp: 8, maxMp: 8, worldVersion: 0 },
      currentSceneId: "scene.valley.den_bypass" });
    const life = createWildlifeLifeRecord({ lifeInstanceId: "life.wal.death", regionSaveId: "region-save.valley",
      regionId: "valley_prologue", entityId: "wildlife.rabbit.valley", species: "rabbit", ageClass: "adult",
      spawnGeneration: 0, spawnSequence: 4, harvestProfileId: "harvest.rabbit.v0.1", maxHp: 8, registeredAtWorldTick: 0 });
    session = commit(session, proposeWildlifeLifeRegistration("wal.death.register", life));
    const authority = new InMemoryGameSessionAuthorityStore(session);
    const partitions = new InMemoryGameSessionPartitionStore(session.toSave());
    const bridge = new GameSessionProcessingWalBridge(authority, new InMemoryDurableCrossSaveWalStore(), partitions);
    const prepared = bridge.prepareDeath({ transactionId: "caller", lifeInstanceId: life.lifeInstanceId,
      expectedLifeRevision: 0, damage: 8, causeClass: "clean_tool", worldTick: 2,
      position: { sceneId: "scene.valley.den_bypass", x: 1, y: 2 } });
    const deathReceiptId = createCrossSaveReceiptId(prepared.transactionId, "death");
    expect(prepared.operationEnvelopes.flatMap((envelope) => envelope.deterministicReceiptIds)).toEqual([deathReceiptId]);
    expect(authority.read().snapshot().lifeCorpseLedger.corpses).toEqual({});
    expect(bridge.commit(prepared.transactionId, 2).state).toBe("applied");
    expect(authority.read().snapshot().receiptIndex[deathReceiptId]).toBeDefined();
    expect(Object.keys(authority.read().snapshot().lifeCorpseLedger.corpses)).toHaveLength(1);
    for (const owner of ["valley_ecology_save", "valley_resource_save"] as const) {
      expect(partitions.read(owner)).toMatchObject({ revision: 1, appliedTransactionIds: [prepared.transactionId] });
    }
  });

  it("routes start, work, complete, claim, and cancel through their exact owner sets", () => {
    const built = fixture();
    const harvest = built.bridge.prepareProcessing(harvestRequest(built.authority.read()));
    expect(built.bridge.commit(harvest.transactionId, 300).state).toBe("applied");

    const kitchenReserveReceipt = authorize(built.authority, "communal_kitchen", "reserve-cook");
    const raw = built.authority.read().snapshot().economy.lots.find((lot) => lot.itemId === "food.raw_small_game_meat")!;
    const reserve: WildlifeProcessingAction = { action: "reserve", transactionId: "caller", canonicalIdempotencyKey: "caller",
      currentWorldTick: 0, expectedInventoryRevision: built.authority.read().snapshot().economy.inventoryRevision,
      playerSaveId: "save.wal.harvest", stationId: "communal_kitchen", recipeId: "cook.game_meat.v0.1",
      startEventSequence: 0, interactionReceiptId: kitchenReserveReceipt,
      inputs: [{ lotId: raw.lotId, quantity: 1, expectedOwnershipRevision: raw.ownershipRevision,
        expectedFreshnessRevision: raw.freshnessRevision, expectedReservationRevision: raw.wildlifeProvenance!.reservationRevision }] };
    const started = built.bridge.prepareProcessing(reserve);
    expect(started.participants.map((p) => p.saveOwner)).toEqual(built.bridge.contract.registeredTransactionKinds.workorder_start);
    expect(built.bridge.commit(started.transactionId, 301).state).toBe("applied");
    const order = built.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;

    const workReceipt = authorize(built.authority, "communal_kitchen", "work-cook");
    const worked = built.bridge.prepareWork(order.workOrderId, workReceipt, 302);
    expect(worked.participants.map((p) => p.saveOwner)).toEqual(built.bridge.contract.registeredTransactionKinds.workorder_work);
    const workBusinessReceiptId = createCrossSaveReceiptId(worked.transactionId, "workorder_work");
    expect(worked.operationEnvelopes.flatMap((envelope) => envelope.deterministicReceiptIds)).toEqual([workBusinessReceiptId]);
    expect(built.bridge.commit(worked.transactionId, 302).state).toBe("applied");
    expect(built.authority.read().snapshot().receiptIndex[workBusinessReceiptId]).toBeDefined();
    expect(built.authority.read().snapshot().economy.processingReceipts.some((receipt) =>
      receipt.receiptId === workBusinessReceiptId && receipt.transactionKind === "workorder_work")).toBe(true);
    expect(built.authority.read().snapshot().survival.worldTicks).toBeGreaterThan(240);

    const completeReceipt = authorize(built.authority, "communal_kitchen", "complete-cook");
    const beforeComplete = built.authority.read().snapshot();
    const workedOrder = beforeComplete.economy.workOrders[0] as WildlifeProcessingWorkOrder;
    const complete: WildlifeProcessingAction = { action: "complete", transactionId: "caller", canonicalIdempotencyKey: "caller",
      currentWorldTick: 0, workOrderId: workedOrder.workOrderId, expectedWorkOrderRevision: workedOrder.revision,
      expectedInventoryRevision: beforeComplete.economy.inventoryRevision, energyEventId: null,
      interactionReceiptId: completeReceipt };
    const completed = built.bridge.prepareProcessing(complete);
    expect(built.bridge.commit(completed.transactionId, 303).state).toBe("applied");
    const completedOrder = built.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;
    expect(completedOrder.status).toBe("completed");

    const claimReceipt = authorize(built.authority, "communal_kitchen", "claim-cook");
    const claim: WildlifeProcessingAction = { action: "claim", transactionId: "caller", canonicalIdempotencyKey: "caller",
      currentWorldTick: 0, workOrderId: completedOrder.workOrderId, expectedWorkOrderRevision: completedOrder.revision,
      expectedInventoryRevision: built.authority.read().snapshot().economy.inventoryRevision,
      claimantPlayerSaveId: "save.wal.harvest", interactionReceiptId: claimReceipt };
    const claimed = built.bridge.prepareProcessing(claim);
    expect(built.bridge.commit(claimed.transactionId, 304).state).toBe("applied");
    expect((built.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder).status).toBe("claimed");

    const cancelBuilt = fixture();
    const cancelHarvest = cancelBuilt.bridge.prepareProcessing(harvestRequest(cancelBuilt.authority.read()));
    cancelBuilt.bridge.commit(cancelHarvest.transactionId, 300);
    const reserveReceipt = authorize(cancelBuilt.authority, "communal_kitchen", "reserve-cancel");
    const cancelRaw = cancelBuilt.authority.read().snapshot().economy.lots.find((lot) => lot.itemId === "food.raw_small_game_meat")!;
    const cancelReserve = cancelBuilt.bridge.prepareProcessing({ ...reserve, interactionReceiptId: reserveReceipt,
      expectedInventoryRevision: cancelBuilt.authority.read().snapshot().economy.inventoryRevision,
      inputs: [{ lotId: cancelRaw.lotId, quantity: 1, expectedOwnershipRevision: cancelRaw.ownershipRevision,
        expectedFreshnessRevision: cancelRaw.freshnessRevision, expectedReservationRevision: cancelRaw.wildlifeProvenance!.reservationRevision }] });
    cancelBuilt.bridge.commit(cancelReserve.transactionId, 301);
    const cancelOrder = cancelBuilt.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder;
    const cancelReceipt = authorize(cancelBuilt.authority, "communal_kitchen", "cancel-cook");
    const cancelled = cancelBuilt.bridge.prepareProcessing({ action: "cancel", transactionId: "caller", canonicalIdempotencyKey: "caller",
      currentWorldTick: 0, workOrderId: cancelOrder.workOrderId, expectedWorkOrderRevision: cancelOrder.revision,
      expectedInventoryRevision: cancelBuilt.authority.read().snapshot().economy.inventoryRevision,
      interactionReceiptId: cancelReceipt });
    expect(cancelBuilt.bridge.commit(cancelled.transactionId, 302).state).toBe("applied");
    expect((cancelBuilt.authority.read().snapshot().economy.workOrders[0] as WildlifeProcessingWorkOrder).status).toBe("cancelled");
  });
  it("returns an existing prepared proposal before dry-running its already-materialized event", () => {
    const { authority, bridge } = fixture();
    const request = harvestRequest(authority.read());
    const materialized = proposeWildlifeProcessing(authority.read(), request);
    const action = (materialized.drafts[0]!.payload as { action: WildlifeProcessingAction }).action;
    const first = bridge.prepareProposal({ transactionKind: "harvest", canonicalIdempotencyKey: action.canonicalIdempotencyKey,
      batch: materialized, tick: action.currentWorldTick });
    expect(bridge.prepareProposal({ transactionKind: "harvest", canonicalIdempotencyKey: action.canonicalIdempotencyKey,
      batch: materialized, tick: action.currentWorldTick })).toEqual(first);
  });
});
