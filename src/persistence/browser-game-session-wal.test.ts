import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import {
  computeRuntimeCorpusExpansionRegistryDigest,
  readRuntimeCorpusExpansionRegistry,
} from "../content/runtime-corpus-expansion-registry";
import {
  computeRuntimeLearningCorpusPackageDigest,
  computeRuntimeLearningCorpusSemanticDigest,
  readRuntimeLearningCorpusPackage,
} from "../content/runtime-learning-corpus-package";
import { createEmptySessionEconomy } from "../game/economy-state";
import { createWildlifeLifeRecord } from "../game/life-corpse-ledger";
import { createDemoTradeLots } from "../game/trade";
import { proposeVerifiedTradeQuote, proposeWildlifeLifeRegistration } from "../session/adapters";
import { GameSession } from "../session/game-session";
import { createCrossSaveReceiptId, sha256Canonical, type JsonValue } from "./cross-save-wal";
import { verifyRuntimeLearningCorpusSet } from "../learning/corpus-partition-collection";
import { createBrowserLearningCorpusAdapter } from "./browser-learning-corpus-adapter";
import {
  createExtensionLearningBridge,
  createExtensionLearningSession,
  extensionLearningAuthority,
  extensionLearningEnvironmentFingerprint,
  extensionLearningScenes,
} from "../testing/extension-learning-fixture";
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

const extensionRuntime = () => {
  const wordId = "browserword", actionNamespace = "browserext";
  const actions = [
    ["discover", "glyph_discovered", null],
    ["attune", "glyph_attunement_completed", null],
    ["context_0", "active_retrieval_submitted", 0],
    ["context_1", "active_retrieval_submitted", 1],
    ["repair", "repair_completed", 1],
  ].map(([kind, evidenceType, promptLevel]) => ({
    kind,
    actionId: `${actionNamespace}.${wordId}.${kind}`,
    evidenceType,
    taskFamilyId: kind === "discover" || kind === "attune" ? null : `${actionNamespace}.${kind}.family`,
    environmentFingerprint: kind === "discover" || kind === "attune" ? null :
      extensionLearningEnvironmentFingerprint(kind as "context_0" | "context_1" | "repair"),
    promptLevel,
    semanticFacets: kind === "discover" || kind === "attune" ? [] : ["browser.facet"],
    worldAuthority: extensionLearningAuthority(kind as
      "discover" | "attune" | "context_0" | "context_1" | "repair"),
  }));
  const semantic = {
    schemaVersion: "tokipona.runtime-learning-corpus.v0.2" as const,
    phaseId: "csp-tier1-remainder" as const,
    corpusId: "browser-extension.v1",
    contentVersion: "browser-extension.1",
    actionNamespace,
    savePartitionId: "learning.corpus.browser-extension.v1",
    saveSchemaVersion: "tokipona.learning-corpus-partition.v0.2" as const,
    canonicalWordKey: "latin_word_id" as const,
    wordIds: [wordId],
    words: { [wordId]: { wordId, targetState: "produced", semanticFacets: ["browser.facet"], actions,
      assetBindings: { pronunciationAssetId: "audio.pronunciation.browserword.v1",
        glyphAssetId: "glyph.browserext.browserword.v1" } } },
  };
  const reviewReceiptIds = { semantic: "review.browser.semantic", pronunciation: "review.browser.pronunciation",
    glyph: "review.browser.glyph" };
  const payload = { ...semantic, semanticDigest: computeRuntimeLearningCorpusSemanticDigest(semantic as any),
    reviewReceiptIds };
  const candidate = { ...payload, sourceDigest: computeRuntimeLearningCorpusPackageDigest(payload) };
  const artifact = structuredClone(generated) as any;
  artifact.corpusExpansionRegistry.admittedCorpusIds = [candidate.corpusId];
  artifact.corpusExpansionRegistry.phases[0] = {
    ...artifact.corpusExpansionRegistry.phases[0], status: "admitted", blockedReasons: [],
    admissionContract: {
      schemaVersion: "tokipona.learning-corpus-admission.v0.1", corpusId: candidate.corpusId,
      contentVersion: candidate.contentVersion, actionNamespace: candidate.actionNamespace,
      savePartitionId: candidate.savePartitionId, saveSchemaVersion: candidate.saveSchemaVersion,
      packageDigest: candidate.sourceDigest, semanticDigest: candidate.semanticDigest,
      wordIds: candidate.wordIds, reviewReceiptIds,
    },
  };
  const registryPayload = Object.fromEntries(Object.entries(artifact.corpusExpansionRegistry)
    .filter(([key]) => key !== "sourceDigest"));
  artifact.corpusExpansionRegistry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(registryPayload);
  const registry = readRuntimeCorpusExpansionRegistry(artifact);
  const pkg = readRuntimeLearningCorpusPackage(registry, candidate);
  return verifyRuntimeLearningCorpusSet(registry, [pkg], extensionLearningScenes);
};

const legacyCompanion = (current: ReturnType<BrowserGameSessionWalCoordinator["toCompanion"]>) => {
  const { extensionLearning: _extension, checksum: _checksum, ...currentBody } = current;
  const body = { ...currentBody, schema: "tokipona.browser-game-session-wal.v0.1" as const };
  const checksum = sha256Canonical({
    schema: body.schema,
    authority: { sessionId: body.authority.session.sessionId, integrity: body.authority.session.integrity,
      barriers: body.authority.barriers },
    walChecksum: body.wal.checksum,
    ownerSnapshots: body.ownerSnapshots.map((snapshot) => ({ schema: snapshot.schema,
      saveOwner: snapshot.saveOwner, revision: snapshot.revision, projectionDigest: snapshot.projectionDigest,
      appliedTransactionIds: snapshot.appliedTransactionIds })),
    partitionIntents: body.partitionIntents,
    partitionLocks: body.partitionLocks,
    durableWalRecords: [],
    durableWalIntents: body.durableWalIntents,
    durableWalSnapshotAcks: body.durableWalSnapshotAcks,
    persistenceTail: body.persistenceTail,
  } as unknown as JsonValue);
  return { ...body, checksum };
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

    // The companion checksum binds the independently verified collection
    // integrity, while the collection reader binds its full nested payload.
    const nestedLearningTampered = structuredClone(valid) as any;
    nestedLearningTampered.extensionLearning.partitions = [{}];
    const nestedLearningStore = new MemoryDurableJsonStore(); nestedLearningStore.write(nestedLearningTampered);
    expect(() => BrowserGameSessionWalCoordinator.load(nestedLearningStore)).toThrow(
      /extension learning collection|collection integrity/,
    );
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

  it("durably commits an admitted extension partition and requires its exact package set on reload", () => {
    const adapter = createBrowserLearningCorpusAdapter(extensionRuntime());
    const store = new MemoryDurableJsonStore();
    const session = createExtensionLearningSession("save.browser.extension", "discover");
    const coordinator = BrowserGameSessionWalCoordinator.fresh(session, store, adapter);
    expect(coordinator.readExtensionLearningCollection()).toMatchObject({
      playerSaveId: "save.browser.extension",
      admittedCorpusIds: ["browser-extension.v1"],
    });
    expect(coordinator.commitExtensionLearningAction(
      "browser-extension.v1", "browserext.browserword.discover",
      createExtensionLearningBridge(session)))
      .toMatchObject({ applied: true, duplicate: false, reason: "applied" });

    const reloaded = BrowserGameSessionWalCoordinator.load(store, 0, adapter);
    expect(reloaded.readExtensionLearningCollection().partitions[0]?.learning.words)
      .toHaveProperty("browserword");
    expect(reloaded.commitExtensionLearningAction(
      "browser-extension.v1", "browserext.browserword.discover",
      createExtensionLearningBridge(reloaded.readSession())))
      .toMatchObject({ applied: false, duplicate: true, reason: "duplicate" });
    expect(() => BrowserGameSessionWalCoordinator.load(store, 0)).toThrow(
      /extension learning collection|cannot be reconciled/,
    );
  });

  it("rejects far or non-durable runtime bridges for extension learning", () => {
    const adapter = createBrowserLearningCorpusAdapter(extensionRuntime());
    const farSession = createExtensionLearningSession(
      "save.browser.extension-far", "discover", { x: 0, y: 0 });
    const farCoordinator = BrowserGameSessionWalCoordinator.fresh(
      farSession, new MemoryDurableJsonStore(), adapter);
    expect(() => farCoordinator.commitExtensionLearningAction(
      "browser-extension.v1", "browserext.browserword.discover",
      createExtensionLearningBridge(farSession),
    )).toThrow(/runtime authority rejected/);

    const durableSession = createExtensionLearningSession(
      "save.browser.extension-bound", "discover");
    const boundCoordinator = BrowserGameSessionWalCoordinator.fresh(
      durableSession, new MemoryDurableJsonStore(), adapter);
    const sameIdDifferentState = createExtensionLearningSession(
      "save.browser.extension-bound", "attune");
    expect(() => boundCoordinator.commitExtensionLearningAction(
      "browser-extension.v1", "browserext.browserword.discover",
      createExtensionLearningBridge(sameIdDifferentState),
    )).toThrow(/not bound to the durable GameSession authority/);
  });

  it("migrates a checked v0.1 companion to v0.2 with an explicit empty extension collection", () => {
    const sourceStore = new MemoryDurableJsonStore();
    const source = BrowserGameSessionWalCoordinator.fresh(GameSession.create({
      sessionId: "save.browser.legacy-companion",
      mp: { currentMp: 10, maxMp: 10, worldVersion: 0 },
      currentSceneId: "scene.valley.settlement",
    }), sourceStore);
    const old = legacyCompanion(source.toCompanion());
    expect(readBrowserGameSessionSaveEnvelope({
      schema: "tokipona.browser-game-session-save.v0.1",
      session: old.authority.session,
      companion: old,
    })).toMatchObject({
      schema: BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA,
      companion: { schema: "tokipona.browser-game-session-wal.v0.2" },
    });
    const store = new MemoryDurableJsonStore(); store.write(old);

    const migrated = BrowserGameSessionWalCoordinator.load(store, 0);
    expect(migrated.toCompanion()).toMatchObject({
      schema: "tokipona.browser-game-session-wal.v0.2",
      extensionLearning: {
        schema: "tokipona.learning-corpus-partition-collection.v0.1",
        playerSaveId: "save.browser.legacy-companion",
        admittedCorpusIds: [],
        partitions: [],
      },
    });
    expect(store.read()).toMatchObject({ schema: "tokipona.browser-game-session-wal.v0.2" });
  });
});
