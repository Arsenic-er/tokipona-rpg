import { describe, expect, it } from "vitest";
import {
  CROSS_SAVE_WAL_COORDINATOR_ID,
  CrossSaveWalRuntime,
  InMemoryDurableCrossSaveWalStore,
  createCrossSaveOutputId,
  createCrossSaveTransactionId,
  createInMemoryCrossSaveParticipant,
  isCrossSaveWalSave,
  sha256Canonical,
  type CrossSaveWalContract,
  type DurableCrossSaveWalStore,
  type CrossSaveWalOperationInput,
  type CrossSaveWalParticipant,
} from "./cross-save-wal";

const digest = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as const;
const contract = (owners: readonly string[] = ["inventory", "ledger"]): CrossSaveWalContract => ({
  schemaVersion: "w04.cross-save-wal.v0.1", coordinatorId: CROSS_SAVE_WAL_COORDINATOR_ID,
  sourceDigest: digest, registeredTransactionKinds: { harvest: owners },
});
const operation = (saveOwner: string, revision = 0, lockKey = `lot.${saveOwner}`, receiptKinds: readonly string[] = [`receipt.${saveOwner}`]): CrossSaveWalOperationInput => ({
  saveOwner, deterministicOperation: "move_lot", canonicalPayload: { lotId: lockKey, quantity: 1 },
  redoPayload: { lotId: lockKey, quantity: 1, result: "moved" }, redoPreconditions: { expectedRevision: revision },
  expectedRevision: revision, expectedAfterRevision: revision + 1, lockKey, outputKinds: ["inventory_lot"], receiptKinds,
});
const fixture = (owners: readonly string[] = ["inventory", "ledger"]) => {
  const participants = owners.map((owner) => createInMemoryCrossSaveParticipant(owner));
  const durableStore = new InMemoryDurableCrossSaveWalStore();
  const runtime = new CrossSaveWalRuntime({ contract: contract(owners), participants, durableStore });
  return { runtime, participants, durableStore };
};
const begin = (runtime: CrossSaveWalRuntime, key = "event.1", operations = [operation("inventory"), operation("ledger")]) => runtime.begin({ transactionKind: "harvest", canonicalIdempotencyKey: key, operations, tick: 1 });

describe("cross-save WAL durable protocol", () => {
  it("hashes the canonical bytes and matches the fixed transaction golden vector", () => {
    expect(sha256Canonical([CROSS_SAVE_WAL_COORDINATOR_ID, "harvest", "event.1"])).toBe("sha256:463458bd7034842662b2b93b2fda5bf531898a34ac125871cdeee35dd22ee9cd");
    expect(createCrossSaveTransactionId("harvest", "event.1")).toBe("wal-tx:sha256:463458bd7034842662b2b93b2fda5bf531898a34ac125871cdeee35dd22ee9cd");
  });

  it("requires a durable store and rejects missing or extra participant operations", () => {
    const inventory = createInMemoryCrossSaveParticipant("inventory");
    expect(() => new CrossSaveWalRuntime({ contract: contract(["inventory"]), participants: [inventory], durableStore: undefined as never })).toThrow("durable store");
    const { runtime } = fixture();
    expect(() => begin(runtime, "missing", [operation("inventory")])).toThrow("participants");
    expect(() => begin(runtime, "extra", [operation("inventory"), operation("ledger"), operation("wallet")])).toThrow("participants");
  });

it("fails closed when the durable store cannot persist", () => {
    const failedStore: DurableCrossSaveWalStore = {
      persist: () => { throw new Error("fsync unavailable"); },
      hasDurableIntent: () => false,
      hasDurableSnapshot: () => false,
      reconcileFromSave: () => { throw new Error("fsync unavailable"); },
    };
    const inventory = createInMemoryCrossSaveParticipant("inventory");
    const runtime = new CrossSaveWalRuntime({ contract: contract(["inventory"]), participants: [inventory], durableStore: failedStore });
    expect(() => begin(runtime, "store-down", [operation("inventory")])).toThrow("fsync unavailable");
    expect(runtime.isSceneActivationReady()).toBe(false);
    expect(() => begin(runtime, "retry", [operation("inventory")])).toThrow("not ready");
  });
  it("persists prepare, each ack, commit decision, each apply ack, and applied in order", () => {
    const { runtime, durableStore } = fixture(); const prepared = begin(runtime); runtime.commit(prepared.transactionId, 2);
    expect(durableStore.persistenceLog.map((entry) => entry.phase)).toEqual(["prepared", "prepare_ack", "prepare_ack", "commit_decision", "apply_ack", "apply_ack", "applied"]);
  });

  it("aborts an undecided prepared record after reload, while load blocks begin until recovery", () => {
    const source = fixture(); begin(source.runtime); const save = source.runtime.snapshot();
    const resumed = fixture(); resumed.runtime.load(save);
    expect(resumed.runtime.isSceneActivationReady()).toBe(false);
    expect(() => begin(resumed.runtime, "too-early")).toThrow("not ready");
    expect(resumed.runtime.recover(2)).toMatchObject({ sceneActivationBlocked: false, changed: true });
    expect(resumed.runtime.recordsSnapshot()[0]).toMatchObject({ state: "aborted", durableDecision: "abort" });
  });

it("merges an old checkpoint with a newer authoritative durable commit", () => {
    const inventory = createInMemoryCrossSaveParticipant("inventory"), ledger = createInMemoryCrossSaveParticipant("ledger"), durableStore = new InMemoryDurableCrossSaveWalStore();
    const source = new CrossSaveWalRuntime({ contract: contract(), participants: [inventory, ledger], durableStore });
    const prepared = begin(source, "authoritative"), oldCheckpoint = source.snapshot();
    source.commit(prepared.transactionId, 2);
    const resumed = new CrossSaveWalRuntime({ contract: contract(), participants: [inventory, ledger], durableStore });
    resumed.load(oldCheckpoint);
    expect(resumed.recordsSnapshot()[0]).toMatchObject({ state: "applied", durableDecision: "commit" });
    expect(resumed.recover(3).sceneActivationBlocked).toBe(false);
  });

  it("forward-repairs an applied save loaded with fresh participant revisions", () => {
    const source = fixture(); const record = begin(source.runtime, "fresh-revisions"); source.runtime.commit(record.transactionId, 2); const save = source.runtime.snapshot();
    const inventory = createInMemoryCrossSaveParticipant("inventory"), ledger = createInMemoryCrossSaveParticipant("ledger"), durableStore = new InMemoryDurableCrossSaveWalStore();
    const resumed = new CrossSaveWalRuntime({ contract: contract(), participants: [inventory, ledger], durableStore });
    resumed.load(save);
    expect(resumed.isSceneActivationReady()).toBe(false);
    expect(resumed.recover(3).sceneActivationBlocked).toBe(false);
    expect(inventory.revision()).toBe(1);
    expect(ledger.revision()).toBe(1);
  });
  it("quarantines apply exceptions durably and blocks activation instead of throwing through", () => {
    const inventory = createInMemoryCrossSaveParticipant("inventory"), backing = createInMemoryCrossSaveParticipant("ledger");
    const ledger: CrossSaveWalParticipant = { ...backing, apply: () => { throw new Error("redo failed"); } };
    const store = new InMemoryDurableCrossSaveWalStore(), runtime = new CrossSaveWalRuntime({ contract: contract(), participants: [inventory, ledger], durableStore: store });
    const record = begin(runtime); const result = runtime.commit(record.transactionId, 2);
    expect(result).toMatchObject({ state: "committed", durableDecision: "commit", quarantineReason: "redo failed" });
    expect(store.persistenceLog.at(-1)?.phase).toBe("quarantine");
    expect(runtime.isSceneActivationReady()).toBe(false);
  });

  it("recovers a durably committed partial apply to a fixed point without duplicate outputs", () => {
    const inventory = createInMemoryCrossSaveParticipant("inventory"), ledger = createInMemoryCrossSaveParticipant("ledger");
    const store = new InMemoryDurableCrossSaveWalStore(), source = new CrossSaveWalRuntime({ contract: contract(), participants: [inventory, ledger], durableStore: store });
    const prepared = begin(source), inventoryEnvelope = prepared.operationEnvelopes[0]!, inventoryParticipant = prepared.participants[0]!;
    expect(inventory.apply(inventoryEnvelope, prepared.transactionId)).toBe(inventoryParticipant.afterRevision);
    const committedRecord = { ...prepared, state: "committed" as const, durableDecision: "commit" as const, participantApplyAcks: ["inventory"], participants: prepared.participants.map((participant, index) => index === 0 ? { ...participant, appliedRevision: participant.afterRevision } : participant) };
    const raw = source.snapshot(), body = { ...raw, records: [committedRecord] };
    const crashSave = { ...body, checksum: sha256Canonical({ schema: body.schema, contract: body.contract as never, records: body.records as never, receiptIndex: body.receiptIndex as never, acceptingNewTransactions: body.acceptingNewTransactions }) };
    expect(isCrossSaveWalSave(crashSave)).toBe(true);
    const resumedStore = new InMemoryDurableCrossSaveWalStore(), resumed = new CrossSaveWalRuntime({ contract: contract(), participants: [inventory, ledger], durableStore: resumedStore });
    resumed.load(crashSave);
    expect(resumed.recover(3).sceneActivationBlocked).toBe(false);
    expect(resumed.recordsSnapshot()[0]?.state).toBe("applied");
    expect(inventory.appliedTransactionIds.size).toBe(1);
    expect(ledger.appliedTransactionIds.size).toBe(1);
    expect(resumed.recover(4).changed).toBe(false);
  });

  it("uses transaction-global output indices, forbids duplicate receipt kinds, and deep-clones caller payloads", () => {
    const { runtime } = fixture(); const nested = { lotId: "lot.inventory", nested: { value: 1 } };
    const a = { ...operation("inventory"), canonicalPayload: nested, redoPayload: nested }, b = operation("ledger"); const record = begin(runtime, "ids", [a, b]);
    nested.nested.value = 99;
    expect(record.operationEnvelopes[0]?.canonicalPayload).toEqual({ lotId: "lot.inventory", nested: { value: 1 } });
    expect(record.operationEnvelopes[0]?.deterministicOutputIds[0]).not.toBe(record.operationEnvelopes[1]?.deterministicOutputIds[0]);
    const duplicate = fixture(); expect(() => begin(duplicate.runtime, "duplicate-receipt", [operation("inventory",0,"a",["same"]),operation("ledger",0,"b",["same"])] )).toThrow("unique");
  });

it("allows two inventory_lot outputs in one operation and strictly rejects forged duplicate IDs", () => {
    const source = fixture(["inventory"]);
    const record = begin(source.runtime, "two-inventory-lots", [{
      ...operation("inventory"), outputKinds: ["inventory_lot", "inventory_lot"],
    }]);
    expect(record.operationEnvelopes[0]?.deterministicOutputIds).toEqual([
      createCrossSaveOutputId(record.transactionId, "inventory_lot", 0),
      createCrossSaveOutputId(record.transactionId, "inventory_lot", 1),
    ]);
    source.runtime.commit(record.transactionId, 2);
    const save = source.runtime.snapshot();
    expect(isCrossSaveWalSave(save)).toBe(true);
    const loaded = fixture(["inventory"]);
    expect(() => loaded.runtime.load(save)).not.toThrow();

    const originalEnvelope = save.records[0]!.operationEnvelopes[0]!;
    const forgedBody = {
      ...originalEnvelope,
      deterministicOutputIds: [
        originalEnvelope.deterministicOutputIds[0]!,
        originalEnvelope.deterministicOutputIds[0]!,
      ],
    };
    const { operationHash: _oldHash, ...forgedHashBody } = forgedBody;
    const forgedHash = sha256Canonical(forgedHashBody as never);
    const forgedEnvelope = { ...forgedBody, operationHash: forgedHash };
    const forgedParticipant = {
      ...save.records[0]!.participants[0]!,
      operationHash: forgedHash,
      durableIntentId: `wal-intent:${sha256Canonical([
        save.records[0]!.transactionId, forgedEnvelope.saveOwner, forgedHash,
      ]).slice(7)}`,
    };
    const forgedRecord = {
      ...save.records[0]!,
      participants: [forgedParticipant],
      operationEnvelopes: [forgedEnvelope],
    };
    const forgedBodySave = { ...save, records: [forgedRecord] };
    const forgedSave = {
      ...forgedBodySave,
      checksum: sha256Canonical({
        schema: forgedBodySave.schema,
        contract: forgedBodySave.contract as never,
        records: forgedBodySave.records as never,
        receiptIndex: forgedBodySave.receiptIndex as never,
        acceptingNewTransactions: forgedBodySave.acceptingNewTransactions,
      }),
    };
    expect(isCrossSaveWalSave(forgedSave)).toBe(false);
    expect(() => fixture(["inventory"]).runtime.load(forgedSave)).toThrow("corrupt");
  });
  it("treats same idempotency key with a different payload as a conflict", () => {
    const { runtime } = fixture(); begin(runtime, "key");
    expect(() => begin(runtime, "key", [{ ...operation("inventory"), redoPayload: { changed: true } }, operation("ledger")])).toThrow("conflicts");
  });

  it("rechecks durable intents before commit", () => {
    const { runtime, durableStore } = fixture(); const record = begin(runtime); durableStore.revokeIntent(record.transactionId, record.participants[0]!);
    expect(() => runtime.commit(record.transactionId, 2)).toThrow("durable intents");
  });

  it("requires durable participant snapshot acknowledgements before garbage collection", () => {
    const { runtime, durableStore } = fixture(); const record = begin(runtime); const applied = runtime.commit(record.transactionId, 2);
    expect(() => runtime.garbageCollect(record.transactionId, 3)).toThrow("snapshots");
    for (const participant of applied.participants) { durableStore.acknowledgeDurableSnapshot(record.transactionId, participant.saveOwner, participant.afterRevision); runtime.acknowledgeParticipantSnapshot(record.transactionId, participant.saveOwner, participant.afterRevision, 3); }
    expect(runtime.garbageCollect(record.transactionId, 4).state).toBe("garbage_collectable");
  });

  it("strict reader rejects corrupt checksum, schema, revisions, ids, and illegal acks", () => {
    const { runtime } = fixture(); const record = begin(runtime); runtime.commit(record.transactionId, 2); const good = runtime.snapshot(); expect(isCrossSaveWalSave(good)).toBe(true);
    expect(isCrossSaveWalSave({ ...good, checksum: digest })).toBe(false);
    const corruptTarget = fixture(); expect(() => corruptTarget.runtime.load({ ...good, checksum: digest })).toThrow("corrupt"); expect(corruptTarget.runtime.isSceneActivationReady()).toBe(false); expect(corruptTarget.runtime.recover(3).sceneActivationBlocked).toBe(true);
    const mutations = [
      { ...good.records[0]!, transactionId: "wal-tx:sha256:" + "0".repeat(64) },
      { ...good.records[0]!, participantApplyAcks: [] },
      { ...good.records[0]!, participants: good.records[0]!.participants.map((p, i) => i ? p : { ...p, afterRevision: 999 }) },
      { ...good.records[0]!, operationEnvelopes: good.records[0]!.operationEnvelopes.map((e, i) => i ? e : { ...e, schemaVersion: "wrong" }) },
      { ...good.records[0]!, operationEnvelopes: good.records[0]!.operationEnvelopes.map((e, i) => i ? e : { ...e, deterministicOutputIds: ["wal-output:sha256:" + "0".repeat(64)] }) },
      { ...good.records[0]!, operationEnvelopes: good.records[0]!.operationEnvelopes.map((e, i) => i ? e : { ...e, deterministicReceiptIds: ["wal-receipt:sha256:" + "0".repeat(64)] }) },
      { ...good.records[0]!, participants: good.records[0]!.participants.map((p, i) => i ? p : { ...p, durableIntentId: "wal-intent:" + "0".repeat(64) }) },
    ];
const preparedFixture = fixture(), prepared = begin(preparedFixture.runtime, "strict-prepared"), preparedSave = preparedFixture.runtime.snapshot();
    for (const illegal of [
      { ...prepared, participants: prepared.participants.map((participant, index) => index ? participant : { ...participant, appliedRevision: participant.afterRevision }) },
      { ...prepared, participantApplyAcks: ["inventory"] },
      { ...prepared, participantSnapshotAcks: ["inventory"] },
    ]) {
      const body = { ...preparedSave, records: [illegal] };
      const resigned = { ...body, checksum: sha256Canonical({ schema: body.schema, contract: body.contract as never, records: body.records as never, receiptIndex: body.receiptIndex as never, acceptingNewTransactions: body.acceptingNewTransactions }) };
      expect(isCrossSaveWalSave(resigned)).toBe(false);
    }
    for (const badRecord of mutations) { const body = { ...good, records: [badRecord] }; const bad = { ...body, checksum: sha256Canonical({ schema: body.schema, contract: body.contract as never, records: body.records as never, receiptIndex: body.receiptIndex as never, acceptingNewTransactions: body.acceptingNewTransactions }) }; expect(isCrossSaveWalSave(bad)).toBe(false); }
  });
});
