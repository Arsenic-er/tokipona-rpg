import type { CrossSaveTransactionCoordinator } from "../game/cross-save-transaction-coordinator";
import type { WildlifeDamageRequest } from "../game/life-corpse-ledger";
import type { VerifiedSellQuote } from "../game/verified-trade";
import type { WildlifeProcessingAction } from "../game/wildlife-processing";
import { commitSessionProposal, type SessionBatchCommitResult, type SessionProposalBatch } from "../session/adapters";
import { GameSession, type GameSessionSave } from "../session/game-session";
import {
  CROSS_SAVE_WAL_SCHEMA,
  isCrossSaveWalSave,
  sha256Canonical,
  type CrossSaveWalParticipantRecord,
  type CrossSaveWalPersistPhase,
  type CrossSaveWalRecord,
  type CrossSaveWalRecovery,
  type CrossSaveWalSave,
  type CrossSaveWalState,
  type DurableCrossSaveWalStore,
  type JsonValue,
  type CrossSaveWalOperationEnvelope,
} from "./cross-save-wal";
import {
  GAME_SESSION_OWNER_SNAPSHOT_SCHEMA,
  GAME_SESSION_WAL_SAVE_OWNERS,
  GameSessionProcessingWalBridge,
  isGameSessionOwnerSnapshot,
  projectGameSessionWalOwner,
  readGameSessionProcessingWalContract,
  type GameSessionAuthorityStore,
  type GameSessionOwnerSnapshot,
  type GameSessionPartitionStore,
  type GameSessionWalSaveOwner,
} from "./game-session-processing-wal";

export const BROWSER_GAME_SESSION_WAL_COMPANION_SCHEMA = "tokipona.browser-game-session-wal.v0.1" as const;
export const BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA = "tokipona.browser-game-session-save.v0.1" as const;

interface DurablePartitionIntent {
  readonly durableIntentId: string;
  readonly saveOwner: GameSessionWalSaveOwner;
  readonly lockKey: string;
  readonly reservationOrLockId: string;
}

interface DurableWalSnapshotAck {
  readonly transactionId: string;
  readonly saveOwner: string;
  readonly revision: number;
}

interface DurableWalPhase {
  readonly transactionId: string;
  readonly phase: CrossSaveWalPersistPhase;
}

export interface BrowserGameSessionWalCompanion {
  readonly schema: typeof BROWSER_GAME_SESSION_WAL_COMPANION_SCHEMA;
  readonly authority: Readonly<{
    session: GameSessionSave;
    barriers: readonly Readonly<{ transactionId: string; expectedSessionRevision: number }>[];
  }>;
  readonly wal: CrossSaveWalSave;
  readonly ownerSnapshots: readonly GameSessionOwnerSnapshot[];
  readonly partitionIntents: readonly DurablePartitionIntent[];
  readonly partitionLocks: readonly Readonly<{ lockKey: string; durableIntentId: string }>[];
  readonly durableWalRecords: readonly CrossSaveWalRecord[];
  readonly durableWalIntents: readonly string[];
  readonly durableWalSnapshotAcks: readonly DurableWalSnapshotAck[];
  readonly persistenceTail: readonly DurableWalPhase[];
  readonly checksum: `sha256:${string}`;
}

export interface BrowserGameSessionSaveEnvelope {
  readonly schema: typeof BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA;
  readonly session: GameSessionSave;
  readonly companion: BrowserGameSessionWalCompanion;
}

/** A synchronous write is the durability boundary required by CrossSaveWalRuntime. */
export interface DurableJsonStore {
  read(): unknown | null;
  write(value: unknown): void;
}

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalStorageDurableJsonStore implements DurableJsonStore {
  public constructor(private readonly storage: LocalStorageLike, private readonly key: string) {
    if (!key.trim()) throw new Error("durable localStorage key is required");
  }
  public read(): unknown | null {
    const raw = this.storage.getItem(this.key);
    return raw === null ? null : JSON.parse(raw) as unknown;
  }
  public write(value: unknown): void { this.storage.setItem(this.key, JSON.stringify(value)); }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const counter = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// All callers pass already-serialized domain snapshots. Canonical hashing is
// read-only, so cloning here only repeated the largest JSON traversal on every
// durable phase.
const asJson = (value: unknown): JsonValue => value as JsonValue;
const digest = (value: unknown): `sha256:${string}` => sha256Canonical(asJson(value));
const intentKey = (transactionId: string, participant: CrossSaveWalParticipantRecord): string =>
  `${transactionId}|${participant.durableIntentId}|${participant.reservationOrLockId}`;
const snapshotAckKey = (transactionId: string, saveOwner: string, revision: number): string =>
  `${transactionId}|${saveOwner}|${revision}`;

type CompanionBody = Omit<BrowserGameSessionWalCompanion, "checksum">;
type MutableCompanionBody = { -readonly [K in keyof CompanionBody]: CompanionBody[K] };

const durableRecordChecksumMaterial = (record: CrossSaveWalRecord): JsonValue => ({
  transactionId: record.transactionId,
  transactionKind: record.transactionKind,
  canonicalIdempotencyKey: record.canonicalIdempotencyKey,
  participants: record.participants.map((participant) => ({ ...participant })),
  operationHashes: record.operationEnvelopes.map((envelope) => envelope.operationHash),
  state: record.state,
  durableDecision: record.durableDecision,
  participantPrepareAcks: record.participantPrepareAcks,
  participantApplyAcks: record.participantApplyAcks,
  participantSnapshotAcks: record.participantSnapshotAcks,
  createdTick: record.createdTick,
  updatedTick: record.updatedTick,
  quarantineReason: record.quarantineReason,
});

/**
 * The nested documents are validated before this checksum is accepted. Bind
 * their verified digests here instead of recursively hashing the same large
 * Session, WAL redo payloads, and eight owner projections on every phase.
 */
const companionChecksum = (body: CompanionBody): `sha256:${string}` => sha256Canonical({
  schema: body.schema,
  authority: {
    sessionId: body.authority.session.sessionId,
    integrity: body.authority.session.integrity,
    barriers: body.authority.barriers,
  },
  walChecksum: body.wal.checksum,
  ownerSnapshots: body.ownerSnapshots.map((snapshot) => ({
    schema: snapshot.schema,
    saveOwner: snapshot.saveOwner,
    revision: snapshot.revision,
    projectionDigest: snapshot.projectionDigest,
    appliedTransactionIds: snapshot.appliedTransactionIds,
  })),
  partitionIntents: body.partitionIntents,
  partitionLocks: body.partitionLocks,
  durableWalRecords: body.durableWalRecords.map(durableRecordChecksumMaterial),
  durableWalIntents: body.durableWalIntents,
  durableWalSnapshotAcks: body.durableWalSnapshotAcks,
  persistenceTail: body.persistenceTail,
} as unknown as JsonValue);
const sealCompanion = (body: CompanionBody): BrowserGameSessionWalCompanion =>
  Object.freeze({ ...body, checksum: companionChecksum(body) });

const emptyWalSave = (): CrossSaveWalSave => {
  const base = {
    schema: CROSS_SAVE_WAL_SCHEMA,
    contract: readGameSessionProcessingWalContract(),
    records: Object.freeze([]),
    receiptIndex: Object.freeze([]),
    acceptingNewTransactions: true,
  } as const;
  return Object.freeze({ ...base, checksum: sha256Canonical(asJson(base)) });
};

const ownerSnapshot = (save: GameSessionSave, saveOwner: GameSessionWalSaveOwner): GameSessionOwnerSnapshot => {
  const projection = projectGameSessionWalOwner(save, saveOwner);
  return Object.freeze({ schema: GAME_SESSION_OWNER_SNAPSHOT_SCHEMA, saveOwner, revision: 0,
    projection, projectionDigest: sha256Canonical(projection), appliedTransactionIds: Object.freeze([]) });
};

const freshCompanion = (save: GameSessionSave): BrowserGameSessionWalCompanion => sealCompanion({
  schema: BROWSER_GAME_SESSION_WAL_COMPANION_SCHEMA,
  authority: { session: clone(save), barriers: [] },
  wal: emptyWalSave(),
  ownerSnapshots: GAME_SESSION_WAL_SAVE_OWNERS.map((owner) => ownerSnapshot(save, owner)),
  partitionIntents: [], partitionLocks: [], durableWalRecords: [], durableWalIntents: [],
  durableWalSnapshotAcks: [], persistenceTail: [],
});

const validateCompanion = (value: unknown): BrowserGameSessionWalCompanion => {
  if (!isRecord(value) || value.schema !== BROWSER_GAME_SESSION_WAL_COMPANION_SCHEMA ||
      !isRecord(value.authority) || !Array.isArray(value.authority.barriers) || !isCrossSaveWalSave(value.wal) ||
      !Array.isArray(value.ownerSnapshots) || !Array.isArray(value.partitionIntents) ||
      !Array.isArray(value.partitionLocks) || !Array.isArray(value.durableWalRecords) ||
      !Array.isArray(value.durableWalIntents) || !Array.isArray(value.durableWalSnapshotAcks) ||
      !Array.isArray(value.persistenceTail) || !nonEmpty(value.checksum)) throw new Error("browser WAL companion is malformed");
  GameSession.fromSave(value.authority.session);
  const owners = value.ownerSnapshots as unknown[];
  if (owners.length !== GAME_SESSION_WAL_SAVE_OWNERS.length || !GAME_SESSION_WAL_SAVE_OWNERS.every((owner) =>
    owners.filter((candidate) => isGameSessionOwnerSnapshot(candidate, owner)).length === 1)) {
    throw new Error("browser WAL companion owner snapshots are incomplete or corrupt");
  }
  const typed = value as unknown as BrowserGameSessionWalCompanion;
  const { checksum, ...body } = typed;
  if (companionChecksum(body) !== checksum) throw new Error("browser WAL companion checksum mismatch");
  if (!typed.authority.barriers.every((barrier) => nonEmpty(barrier.transactionId) && counter(barrier.expectedSessionRevision)) ||
      !typed.partitionIntents.every((entry) => nonEmpty(entry.durableIntentId) &&
        GAME_SESSION_WAL_SAVE_OWNERS.includes(entry.saveOwner) && nonEmpty(entry.lockKey) && nonEmpty(entry.reservationOrLockId)) ||
      !typed.partitionLocks.every((entry) => nonEmpty(entry.lockKey) && nonEmpty(entry.durableIntentId)) ||
      !typed.durableWalIntents.every(nonEmpty) || !typed.durableWalSnapshotAcks.every((entry) =>
        nonEmpty(entry.transactionId) && nonEmpty(entry.saveOwner) && counter(entry.revision))) {
    throw new Error("browser WAL companion durable metadata is invalid");
  }
  return clone(typed);
};

export const readBrowserGameSessionSaveEnvelope = (value: unknown): BrowserGameSessionSaveEnvelope => {
  if (!isRecord(value) || value.schema !== BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA) {
    throw new Error("browser GameSession save envelope is malformed");
  }
  const companion = validateCompanion(value.companion);
  const session = GameSession.fromSave(value.session).toSave();
  if (digest(session) !== digest(companion.authority.session)) throw new Error("browser save authority mismatch");
  return Object.freeze({ schema: BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA, session, companion });
};

class CompanionBacking {
  private document: BrowserGameSessionWalCompanion;
  public constructor(private readonly store: DurableJsonStore, document: BrowserGameSessionWalCompanion, writeInitial: boolean) {
    this.document = validateCompanion(document);
    if (writeInitial) this.store.write(this.document);
  }
  public read(): BrowserGameSessionWalCompanion { return clone(this.document); }
  public peek(): BrowserGameSessionWalCompanion { return this.document; }
  public update(mutator: (draft: MutableCompanionBody) => void): void {
    const current = this.document;
    // Mutators replace top-level fields (and never modify nested values in
    // place), so a shallow copy preserves the immutable published document.
    const { checksum: _checksum, ...body } = current;
    mutator(body as MutableCompanionBody);
    const next = sealCompanion(body);
    this.store.write(next);
    this.document = next;
  }
}

class DurableBrowserAuthorityStore implements GameSessionAuthorityStore {
  private current: GameSession;
  public constructor(private readonly backing: CompanionBacking) {
    // Only a real process load clears ephemeral command capabilities.
    this.current = GameSession.fromSave(backing.read().authority.session);
  }
  public read(): GameSession { return this.current.forkForProposal(); }
  public save(): GameSessionSave { return this.current.toSave(); }
  public adoptDurablyInstalledLiveSession(next: GameSession): void {
    if (digest(this.backing.peek().authority.session) !== digest(next.toSave())) {
      throw new Error("live authority adoption requires the same durable Session");
    }
    this.current = next.forkForProposal();
  }
  public compareAndSwap(expectedSessionRevision: number, next: GameSession): boolean {
    const current = this.backing.peek();
    if (current.authority.barriers.length > 0 || this.current.snapshot().revision !== expectedSessionRevision) return false;
    this.backing.update((draft) => { draft.authority = { ...draft.authority, session: next.toSave() }; });
    this.current = next.forkForProposal();
    return true;
  }
  public installCheckpoint(save: GameSessionSave): void {
    const current = this.backing.peek();
    if (digest(this.current.toSave()) === digest(save)) return;
    if (current.authority.barriers.length > 0 || save.state.revision < this.current.snapshot().revision) {
      throw new Error("authority checkpoint cannot overwrite durable WAL state");
    }
    const loaded = GameSession.fromSave(save);
    this.backing.update((draft) => { draft.authority = { ...draft.authority, session: clone(save) }; });
    this.current = loaded;
  }
  public acquireWalBarrier(transactionId: string, expectedSessionRevision: number): boolean {
    const current = this.backing.peek();
    const prior = current.authority.barriers.find((entry) => entry.transactionId === transactionId);
    if (prior) return prior.expectedSessionRevision === expectedSessionRevision;
    if (this.current.snapshot().revision !== expectedSessionRevision || current.authority.barriers.length > 0) return false;
    this.backing.update((draft) => { draft.authority = { ...draft.authority,
      barriers: [...draft.authority.barriers, { transactionId, expectedSessionRevision }] }; });
    return true;
  }
  public releaseWalBarrier(transactionId: string): void {
    const current = this.backing.peek();
    if (!current.authority.barriers.some((entry) => entry.transactionId === transactionId)) return;
    this.backing.update((draft) => { draft.authority = { ...draft.authority,
      barriers: draft.authority.barriers.filter((entry) => entry.transactionId !== transactionId) }; });
  }
  public publishWalMaterialization(transactionId: string, expectedSessionRevision: number, afterSave: GameSessionSave,
    beforeDigest: `sha256:${string}`, afterDigest: `sha256:${string}`): boolean {
    const current = this.backing.peek();
    const barrier = current.authority.barriers.find((entry) => entry.transactionId === transactionId);
    const currentDigest = digest(this.current.toSave());
    if (!barrier || barrier.expectedSessionRevision !== expectedSessionRevision || digest(afterSave) !== afterDigest ||
        (currentDigest !== beforeDigest && currentDigest !== afterDigest)) return false;
    if (currentDigest === afterDigest) return true;
    if (this.current.snapshot().revision !== expectedSessionRevision) return false;
    const materialized = GameSession.fromSave(afterSave);
    this.backing.update((draft) => { draft.authority = { ...draft.authority, session: clone(afterSave) }; });
    this.current = materialized;
    return digest(this.current.toSave()) === afterDigest;
  }
}

const redoProjection = (envelope: CrossSaveWalOperationEnvelope, transactionId: string, owner: GameSessionWalSaveOwner) => {
  const redo = envelope.redoPayload;
  if (!isRecord(redo) || redo.transactionId !== transactionId || redo.saveOwner !== owner ||
      !counter(redo.authorityBeforeRevision) || !nonEmpty(redo.beforeProjectionDigest) ||
      !("afterProjection" in redo) || !nonEmpty(redo.afterProjectionDigest) ||
      sha256Canonical(redo.afterProjection as JsonValue) !== redo.afterProjectionDigest) {
    throw new Error(`${owner} durable redo payload is invalid`);
  }
  return redo as Readonly<{ beforeProjectionDigest: `sha256:${string}`; afterProjection: JsonValue;
    afterProjectionDigest: `sha256:${string}` }>;
};

class DurableBrowserPartitionStore implements GameSessionPartitionStore {
  public constructor(private readonly backing: CompanionBacking) {}
  public read(saveOwner: GameSessionWalSaveOwner): GameSessionOwnerSnapshot {
    const found = this.backing.peek().ownerSnapshots.find((entry) => entry.saveOwner === saveOwner);
    if (!isGameSessionOwnerSnapshot(found, saveOwner)) throw new Error(`${saveOwner} durable snapshot is missing or corrupt`);
    return clone(found);
  }
  public prepare(intent: CrossSaveWalParticipantRecord, envelope: CrossSaveWalOperationEnvelope): boolean {
    const owner = envelope.saveOwner as GameSessionWalSaveOwner;
    if (!GAME_SESSION_WAL_SAVE_OWNERS.includes(owner) || intent.saveOwner !== owner || this.read(owner).revision !== intent.expectedRevision) return false;
    const current = this.backing.peek();
    const prior = current.partitionIntents.find((entry) => entry.durableIntentId === intent.durableIntentId);
    if (prior) return prior.saveOwner === owner && prior.lockKey === envelope.lockKey &&
      prior.reservationOrLockId === intent.reservationOrLockId;
    const holder = current.partitionLocks.find((entry) => entry.lockKey === envelope.lockKey);
    if (holder && holder.durableIntentId !== intent.durableIntentId) return false;
    this.backing.update((draft) => {
      draft.partitionIntents = [...draft.partitionIntents, { durableIntentId: intent.durableIntentId,
        saveOwner: owner, lockKey: envelope.lockKey, reservationOrLockId: intent.reservationOrLockId }];
      draft.partitionLocks = [...draft.partitionLocks.filter((entry) => entry.lockKey !== envelope.lockKey),
        { lockKey: envelope.lockKey, durableIntentId: intent.durableIntentId }];
    });
    return true;
  }
  public apply(envelope: CrossSaveWalOperationEnvelope, transactionId: string): number {
    const owner = envelope.saveOwner as GameSessionWalSaveOwner;
    const redo = redoProjection(envelope, transactionId, owner);
    const current = this.read(owner);
    if (current.appliedTransactionIds.includes(transactionId)) {
      if (current.revision !== envelope.expectedAfterRevision || current.projectionDigest !== redo.afterProjectionDigest) {
        throw new Error(`${owner} idempotent durable apply diverged`);
      }
      return current.revision;
    }
    const intent = this.backing.peek().partitionIntents.find((entry) => entry.saveOwner === owner &&
      entry.lockKey === envelope.lockKey);
    if (!intent || current.revision !== envelope.beforeRevision || current.projectionDigest !== redo.beforeProjectionDigest ||
        envelope.expectedAfterRevision !== envelope.beforeRevision + 1) throw new Error(`${owner} durable partition CAS conflict`);
    const next: GameSessionOwnerSnapshot = { schema: GAME_SESSION_OWNER_SNAPSHOT_SCHEMA, saveOwner: owner,
      revision: envelope.expectedAfterRevision, projection: clone(redo.afterProjection),
      projectionDigest: redo.afterProjectionDigest,
      appliedTransactionIds: [...current.appliedTransactionIds, transactionId] };
    this.backing.update((draft) => { draft.ownerSnapshots = draft.ownerSnapshots.map((entry) =>
      entry.saveOwner === owner ? next : entry); });
    return next.revision;
  }
  public release(intent: CrossSaveWalParticipantRecord): void {
    const current = this.backing.peek();
    const stored = current.partitionIntents.find((entry) => entry.durableIntentId === intent.durableIntentId &&
      entry.reservationOrLockId === intent.reservationOrLockId);
    if (!stored) return;
    this.backing.update((draft) => {
      draft.partitionIntents = draft.partitionIntents.filter((entry) => entry.durableIntentId !== intent.durableIntentId);
      draft.partitionLocks = draft.partitionLocks.filter((entry) =>
        !(entry.lockKey === stored.lockKey && entry.durableIntentId === intent.durableIntentId));
    });
  }
  public installCheckpoint(save: GameSessionSave, owners: readonly GameSessionWalSaveOwner[]): void {
    const current = this.backing.peek();
    if (current.partitionIntents.length > 0 || current.partitionLocks.length > 0 ||
        owners.some((owner) => current.ownerSnapshots.some((entry) => entry.saveOwner === owner))) {
      throw new Error("durable partition checkpoint bootstrap cannot overwrite owner state");
    }
    this.backing.update((draft) => { draft.ownerSnapshots = owners.map((owner) => ownerSnapshot(save, owner)); });
  }
}

const recordScore = (record: CrossSaveWalRecord): number => {
  const rank: Record<CrossSaveWalState, number> = { prepared: 1, aborted: 2, committed: 3, applied: 4, garbage_collectable: 5 };
  return rank[record.state] * 1_000_000 + record.participantApplyAcks.length * 10_000 +
    record.participantSnapshotAcks.length * 100 + record.participantPrepareAcks.length;
};

class DurableBrowserWalStore implements DurableCrossSaveWalStore {
  public constructor(private readonly backing: CompanionBacking) {}
  public persist(record: CrossSaveWalRecord, phase: CrossSaveWalPersistPhase): void {
    this.backing.update((draft) => {
      draft.durableWalRecords = [...draft.durableWalRecords.filter((entry) => entry.transactionId !== record.transactionId), clone(record)];
      const intents = new Set(draft.durableWalIntents);
      if (phase === "prepare_ack") for (const participant of record.participants.filter((candidate) =>
        record.participantPrepareAcks.includes(candidate.saveOwner) && !record.participantApplyAcks.includes(candidate.saveOwner))) {
        intents.add(intentKey(record.transactionId, participant));
      }
      if (phase === "apply_ack") for (const participant of record.participants.filter((candidate) =>
        record.participantApplyAcks.includes(candidate.saveOwner))) intents.delete(intentKey(record.transactionId, participant));
      if (phase === "abort_decision" || phase === "applied" || phase === "garbage_collectable") {
        for (const participant of record.participants) intents.delete(intentKey(record.transactionId, participant));
      }
      draft.durableWalIntents = [...intents].sort();
      draft.persistenceTail = [...draft.persistenceTail, { transactionId: record.transactionId, phase }].slice(-256);
    });
  }
  public hasDurableIntent(transactionId: string, participant: CrossSaveWalParticipantRecord): boolean {
    return this.backing.peek().durableWalIntents.includes(intentKey(transactionId, participant));
  }
  public hasDurableSnapshot(transactionId: string, saveOwner: string, revision: number): boolean {
    const key = snapshotAckKey(transactionId, saveOwner, revision);
    return this.backing.peek().durableWalSnapshotAcks.some((entry) =>
      snapshotAckKey(entry.transactionId, entry.saveOwner, entry.revision) === key);
  }
  public acknowledgeSnapshot(transactionId: string, saveOwner: string, revision: number): void {
    if (this.hasDurableSnapshot(transactionId, saveOwner, revision)) return;
    this.backing.update((draft) => { draft.durableWalSnapshotAcks = [...draft.durableWalSnapshotAcks,
      { transactionId, saveOwner, revision }]; });
  }
  public reconcileFromSave(checkpointRecords: readonly CrossSaveWalRecord[], collectedTransactionIds: readonly string[] = []): readonly CrossSaveWalRecord[] {
    const collected = new Set(collectedTransactionIds);
    const merged = new Map(this.backing.peek().durableWalRecords.map((record) => [record.transactionId, record]));
    for (const transactionId of collected) merged.delete(transactionId);
    for (const checkpoint of checkpointRecords) {
      if (collected.has(checkpoint.transactionId)) continue;
      const durable = merged.get(checkpoint.transactionId);
      if (!durable || recordScore(checkpoint) > recordScore(durable)) merged.set(checkpoint.transactionId, checkpoint);
    }
    const records = [...merged.values()];
    this.backing.update((draft) => {
      // The checkpoint WAL already owns records at or above its durable rank.
      // Keep only phase-ahead records written before the next atomic WAL snapshot flush.
      draft.durableWalRecords = draft.durableWalRecords.filter((record) => {
        if (collected.has(record.transactionId)) return false;
        const checkpoint = checkpointRecords.find((candidate) => candidate.transactionId === record.transactionId);
        return !checkpoint || recordScore(record) > recordScore(checkpoint);
      });
      draft.durableWalIntents = records.flatMap((record) =>
        record.state === "prepared" || record.state === "committed" ? record.participants
          .filter((participant) => record.participantPrepareAcks.includes(participant.saveOwner) &&
            !record.participantApplyAcks.includes(participant.saveOwner))
          .map((participant) => intentKey(record.transactionId, participant)) : []).sort();
    });
    return Object.freeze(clone(records));
  }
}

export class BrowserGameSessionWalCoordinator implements CrossSaveTransactionCoordinator {
  private readonly backing: CompanionBacking;
  private readonly authority: DurableBrowserAuthorityStore;
  private readonly partitions: DurableBrowserPartitionStore;
  private readonly walStore: DurableBrowserWalStore;
  private readonly bridge: GameSessionProcessingWalBridge;

  private constructor(store: DurableJsonStore, companion: BrowserGameSessionWalCompanion, writeInitial: boolean) {
    this.backing = new CompanionBacking(store, companion, writeInitial);
    this.authority = new DurableBrowserAuthorityStore(this.backing);
    this.partitions = new DurableBrowserPartitionStore(this.backing);
    this.walStore = new DurableBrowserWalStore(this.backing);
    this.bridge = new GameSessionProcessingWalBridge(this.authority, this.walStore, this.partitions);
  }

  public static fresh(session: GameSession, store: DurableJsonStore): BrowserGameSessionWalCoordinator {
    return new BrowserGameSessionWalCoordinator(store, freshCompanion(session.toSave()), true);
  }

  public static load(store: DurableJsonStore, tick?: number): BrowserGameSessionWalCoordinator {
    const raw = store.read();
    const envelope = isRecord(raw) && raw.schema === BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA
      ? readBrowserGameSessionSaveEnvelope(raw) : null;
    const companion = envelope?.companion ?? validateCompanion(raw);
    const coordinator = new BrowserGameSessionWalCoordinator(store, companion, false);
    const recovery = coordinator.bridge.loadCheckpoint(companion.authority.session, companion.wal,
      tick ?? companion.authority.session.state.survival.worldTicks);
    if (recovery.sceneActivationBlocked) throw new Error(`cross-save WAL recovery blocks scene activation: ${JSON.stringify(recovery)}`);
    coordinator.bridge.endBarrier();
    coordinator.flushWal();
    return coordinator;
  }

  public readSession(): GameSession { return this.authority.read(); }
  public toSessionSave(): GameSessionSave { return this.authority.save(); }

  public synchronizeOrdinarySession(session: GameSession): void {
    const current = this.authority.read();
    const before = current.toSave(), after = session.toSave();
    if (before.sessionId !== after.sessionId) throw new Error("ordinary Session synchronization cannot change player save");
    if (digest(before) === digest(after)) return;
    if (after.eventLedger.length < before.eventLedger.length || before.eventLedger.some((event, index) =>
      digest(event) !== digest(after.eventLedger[index]))) {
      throw new Error("ordinary Session synchronization must extend the durable event ledger");
    }
    const tick = after.state.survival.worldTicks;
    const recovery = this.bridge.checkpointBarrier(tick);
    if (recovery.sceneActivationBlocked) throw new Error("ordinary Session synchronization is blocked by WAL recovery");
    this.durablyAcknowledgeAppliedSnapshots(tick);
    this.backing.update((draft) => {
      draft.authority = { session: clone(after), barriers: [] };
      draft.ownerSnapshots = draft.ownerSnapshots.map((snapshot) => {
        const projection = projectGameSessionWalOwner(after, snapshot.saveOwner);
        return { ...snapshot, projection, projectionDigest: sha256Canonical(projection) };
      });
      draft.wal = clone(this.bridge.walSave());
    });
    this.authority.adoptDurablyInstalledLiveSession(session);
    this.bridge.endBarrier();
    if (!this.bridge.isSceneActivationReady()) throw new Error("ordinary Session synchronization left WAL owners divergent");
    this.flushWal();
  }

  public commitOrdinary(batch: SessionProposalBatch): SessionBatchCommitResult {
    const before = this.authority.read();
    const barrier = this.bridge.checkpointBarrier(before.snapshot().survival.worldTicks);
    if (barrier.sceneActivationBlocked) return { committed: false, failedDraftId: null,
      reason: null, session: before };
    const committed = commitSessionProposal(before, batch);
    if (!committed.committed) { this.bridge.endBarrier(); this.flushWal(); return committed; }
    const save = committed.session.toSave();
    this.backing.update((draft) => {
      draft.authority = { session: clone(save), barriers: [] };
      draft.ownerSnapshots = draft.ownerSnapshots.map((snapshot) => {
        const projection = projectGameSessionWalOwner(save, snapshot.saveOwner);
        return { ...snapshot, projection, projectionDigest: sha256Canonical(projection) };
      });
    });
    this.authority.adoptDurablyInstalledLiveSession(committed.session);
    this.bridge.endBarrier();
    if (!this.bridge.isSceneActivationReady()) throw new Error("ordinary Session commit left WAL owners divergent");
    this.flushWal();
    return { ...committed, session: this.authority.read() };
  }

  public commitDeath(request: WildlifeDamageRequest, tick = request.worldTick): CrossSaveWalRecord {
    return this.commitPrepared(this.bridge.prepareDeath(request, tick), tick);
  }
  public commitProcessing(request: WildlifeProcessingAction, tick = request.currentWorldTick): CrossSaveWalRecord {
    return this.commitPrepared(this.bridge.prepareProcessing(request, tick), tick);
  }
  public commitWork(workOrderId: string, interactionReceiptId: string,
    tick = this.authority.read().snapshot().survival.worldTicks): CrossSaveWalRecord {
    return this.commitPrepared(this.bridge.prepareWork(workOrderId, interactionReceiptId, tick), tick);
  }
  public commitConsumption(request: Readonly<{ playerSaveId: string; lotId: string; quantity?: number; consumptionSequence: number }>,
    tick = this.authority.read().snapshot().survival.worldTicks): CrossSaveWalRecord {
    return this.commitPrepared(this.bridge.prepareConsumption(request, tick), tick);
  }
  public commitSell(quote: VerifiedSellQuote, issuedEventId: string,
    runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number }>,
    tick = this.authority.read().snapshot().survival.worldTicks): CrossSaveWalRecord {
    return this.commitPrepared(this.bridge.prepareSell(quote, issuedEventId, runtime, tick), tick);
  }

  public checkpointBarrier(tick = this.authority.read().snapshot().survival.worldTicks): CrossSaveWalRecovery {
    const recovery = this.bridge.checkpointBarrier(tick);
    if (!recovery.sceneActivationBlocked) this.durablyAcknowledgeAppliedSnapshots(tick);
    this.flushWal();
    if (!recovery.sceneActivationBlocked) { this.bridge.endBarrier(); this.flushWal(); }
    return recovery;
  }
  public regionExitBarrier(tick = this.authority.read().snapshot().survival.worldTicks): CrossSaveWalRecovery {
    const recovery = this.bridge.regionExitBarrier(tick);
    if (!recovery.sceneActivationBlocked) this.durablyAcknowledgeAppliedSnapshots(tick);
    this.flushWal();
    if (!recovery.sceneActivationBlocked) { this.bridge.endBarrier(); this.flushWal(); }
    return recovery;
  }
  public isSceneActivationReady(): boolean { return this.bridge.isSceneActivationReady(); }

  public toCompanion(): BrowserGameSessionWalCompanion {
    const recovery = this.checkpointBarrier();
    if (recovery.sceneActivationBlocked) throw new Error("cannot save while cross-save WAL recovery is blocked");
    return this.backing.read();
  }
  public toEnvelope(): BrowserGameSessionSaveEnvelope {
    const companion = this.toCompanion();
    return Object.freeze({ schema: BROWSER_GAME_SESSION_SAVE_ENVELOPE_SCHEMA,
      session: clone(companion.authority.session), companion });
  }

  private durablyAcknowledgeAppliedSnapshots(tick: number): void {
    for (const record of this.bridge.walSave().records) {
      if (record.state !== "applied") continue;
      let current = record;
      for (const participant of record.participants) {
        this.walStore.acknowledgeSnapshot(record.transactionId, participant.saveOwner, participant.afterRevision);
        if (!current.participantSnapshotAcks.includes(participant.saveOwner)) {
          current = this.bridge.acknowledgeParticipantSnapshot(record.transactionId, participant.saveOwner,
            participant.afterRevision, tick);
        }
      }
      if (current.state === "applied" && current.participantSnapshotAcks.length === current.participants.length) {
        this.bridge.garbageCollect(record.transactionId, tick);
        this.backing.update((draft) => {
          draft.ownerSnapshots = draft.ownerSnapshots.map((snapshot) => ({ ...snapshot,
            appliedTransactionIds: snapshot.appliedTransactionIds.filter((transactionId) => transactionId !== record.transactionId) }));
          draft.durableWalSnapshotAcks = draft.durableWalSnapshotAcks.filter((entry) => entry.transactionId !== record.transactionId);
        });
      }
    }
  }

  private commitPrepared(prepared: CrossSaveWalRecord, tick: number): CrossSaveWalRecord {
    const committed = this.bridge.commit(prepared.transactionId, tick);
    this.flushWal();
    if (committed.state !== "applied" || !this.bridge.isSceneActivationReady()) {
      throw new Error(`cross-save transaction did not reach an applied fixed point: ${committed.state}`);
    }
    return committed;
  }
  private flushWal(): void {
    const wal = this.bridge.walSave();
    this.backing.update((draft) => {
      draft.wal = clone(wal);
      // One companion write atomically promotes phase-ahead durable records into
      // the checked WAL checkpoint, eliminating the otherwise quadratic duplicate.
      draft.durableWalRecords = [];
    });
  }
}
