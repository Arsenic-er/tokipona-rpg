import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeWildlifeProcessingManifest } from "../content/runtime-wildlife-processing-manifest";
import type { WildlifeDamageRequest } from "../game/life-corpse-ledger";
import { canonicalVerifiedSellKey, type VerifiedSellQuote } from "../game/verified-trade";
import {
  type WildlifeProcessingAction,
} from "../game/wildlife-processing";
import {
  commitSessionProposal,
  proposeInventoryConsumption,
  proposeVerifiedTradeSale,
  proposeWildlifeDamage,
  proposeWildlifeProcessing,
  proposeWildlifeProcessingWork,
  type SessionProposalBatch,
} from "../session/adapters";
import { GameSession, type GameSessionSave } from "../session/game-session";
import {
  CROSS_SAVE_WAL_COORDINATOR_ID,
  CrossSaveWalRuntime,
  canonicalJson,
  createCrossSaveOutputId,
  createCrossSaveReceiptId,
  createCrossSaveTransactionId,
  sha256Canonical,
  type CrossSaveWalContract,
  type CrossSaveWalOperationEnvelope,
  type CrossSaveWalOperationInput,
  type CrossSaveWalParticipant,
  type CrossSaveWalParticipantRecord,
  type CrossSaveWalRecord,
  type CrossSaveWalRecovery,
  type CrossSaveWalSave,
  type DurableCrossSaveWalStore,
  type JsonValue,
} from "./cross-save-wal";

export const GAME_SESSION_WAL_BRIDGE_SCHEMA = "tokipona.game-session-wal-bridge.v0.2" as const;
export const GAME_SESSION_OWNER_SNAPSHOT_SCHEMA = "tokipona.game-session-owner-snapshot.v0.1" as const;

export type GameSessionWalTransactionKind =
  | "death" | "harvest" | "consume" | "workorder_start" | "workorder_work"
  | "workorder_complete" | "workorder_claim" | "workorder_cancel" | "sell";

export type SupportedGameSessionWalTransactionKind = GameSessionWalTransactionKind;

export type GameSessionWalSaveOwner =
  | "world_clock_save" | "player_survival_save" | "valley_ecology_save"
  | "valley_resource_save" | "player_inventory_save" | "player_wallet_save"
  | "settlement_workorder_save" | "economy_ledger_save";

const SUPPORTED_KINDS = Object.freeze([
  "death", "harvest", "consume", "workorder_start", "workorder_work", "workorder_complete", "workorder_claim", "workorder_cancel", "sell",
] as const satisfies readonly SupportedGameSessionWalTransactionKind[]);

const ALL_OWNERS = Object.freeze([
  "world_clock_save", "player_survival_save", "valley_ecology_save", "valley_resource_save",
  "player_inventory_save", "player_wallet_save", "settlement_workorder_save", "economy_ledger_save",
] as const satisfies readonly GameSessionWalSaveOwner[]);

/** Exact durable owner set used by production companion stores. */
export const GAME_SESSION_WAL_SAVE_OWNERS: readonly GameSessionWalSaveOwner[] = ALL_OWNERS;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const counter = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const jsonDigest = (value: unknown): `sha256:${string}` => sha256Canonical(asJson(value));

/** Reads the generated W04 map exactly. No hard-coded owner fallback is permitted. */
export function readGameSessionProcessingWalContract(candidate: unknown = generatedRuntimeArtifact): CrossSaveWalContract {
  const root = readRuntimeWildlifeProcessingManifest(candidate) as unknown as Record<string, unknown>;
  const wal = isRecord(root.wal) ? root.wal : (() => { throw new Error("processing manifest WAL is missing"); })();
  if (wal.coordinatorId !== CROSS_SAVE_WAL_COORDINATOR_ID || !nonEmpty(wal.sourceDigest) ||
      !/^sha256:[0-9a-f]{64}$/.test(wal.sourceDigest) || !Array.isArray(wal.registeredKinds) ||
      !(wal.registeredKinds as unknown[]).every(nonEmpty) || !isRecord(wal.registeredTransactions)) {
    throw new Error("processing WAL identity is invalid");
  }
  const registeredKinds = wal.registeredKinds as string[];
  const transactions = wal.registeredTransactions;
  const result: Record<string, readonly string[]> = {};
  for (const kind of SUPPORTED_KINDS) {
    const entry = transactions[kind];
    if (!registeredKinds.includes(kind) || !isRecord(entry) || entry.kind !== kind || !Array.isArray(entry.participants) ||
        !(entry.participants as unknown[]).every(nonEmpty) || entry.participants.length === 0 ||
        new Set(entry.participants as string[]).size !== entry.participants.length ||
        !(entry.participants as string[]).every((owner) => ALL_OWNERS.includes(owner as GameSessionWalSaveOwner))) {
      throw new Error(`processing WAL participants for ${kind} are invalid`);
    }
    result[kind] = Object.freeze([...(entry.participants as string[])]);
  }
  return Object.freeze({
    schemaVersion: "w04.cross-save-wal.v0.1",
    coordinatorId: CROSS_SAVE_WAL_COORDINATOR_ID,
    sourceDigest: wal.sourceDigest as `sha256:${string}`,
    registeredTransactionKinds: Object.freeze(result),
  });
}

/** Production implementations must durably fence non-WAL writers before returning from acquireWalBarrier. */
export interface GameSessionAuthorityStore {
  read(): GameSession;
  save(): GameSessionSave;
  compareAndSwap(expectedSessionRevision: number, next: GameSession): boolean;
  installCheckpoint(save: GameSessionSave): void;
  acquireWalBarrier(transactionId: string, expectedSessionRevision: number): boolean;
  releaseWalBarrier(transactionId: string): void;
  publishWalMaterialization(
    transactionId: string,
    expectedSessionRevision: number,
    afterSave: GameSessionSave,
    beforeDigest: `sha256:${string}`,
    afterDigest: `sha256:${string}`,
  ): boolean;
}

/** Test-only authority. A production adapter must persist the barrier and successful publish before returning. */
export class InMemoryGameSessionAuthorityStore implements GameSessionAuthorityStore {
  private current: GameSession;
  private readonly barriers = new Map<string, number>();
  public constructor(session: GameSession) { this.current = session.forkForProposal(); }
  public read(): GameSession { return this.current.forkForProposal(); }
  public save(): GameSessionSave { return this.current.toSave(); }
  public compareAndSwap(expectedSessionRevision: number, next: GameSession): boolean {
    if (this.barriers.size > 0 || this.current.snapshot().revision !== expectedSessionRevision) return false;
    this.current = next.forkForProposal();
    return true;
  }
  public installCheckpoint(save: GameSessionSave): void {
    if (this.barriers.size > 0) {
      if (jsonDigest(this.current.toSave()) === jsonDigest(save)) return;
      throw new Error("cannot regress authority checkpoint while a WAL barrier is active");
    }
    if (save.state.revision < this.current.snapshot().revision) throw new Error("authority checkpoint revision regression");
    this.current = GameSession.fromSave(save);
  }
  public acquireWalBarrier(transactionId: string, expectedSessionRevision: number): boolean {
    const existing = this.barriers.get(transactionId);
    if (existing !== undefined) return existing === expectedSessionRevision;
    if (this.current.snapshot().revision !== expectedSessionRevision) return false;
    this.barriers.set(transactionId, expectedSessionRevision);
    return true;
  }
  public releaseWalBarrier(transactionId: string): void { this.barriers.delete(transactionId); }
  public publishWalMaterialization(
    transactionId: string,
    expectedSessionRevision: number,
    afterSave: GameSessionSave,
    beforeDigest: `sha256:${string}`,
    afterDigest: `sha256:${string}`,
  ): boolean {
    if (this.barriers.get(transactionId) !== expectedSessionRevision || jsonDigest(afterSave) !== afterDigest) return false;
    const currentDigest = jsonDigest(this.current.toSave());
    if (currentDigest !== beforeDigest && currentDigest !== afterDigest) return false;
    if (currentDigest === afterDigest) return true;
    if (this.current.snapshot().revision !== expectedSessionRevision) return false;
    this.current = GameSession.fromSave(afterSave);
    return jsonDigest(this.current.toSave()) === afterDigest;
  }
}

export interface GameSessionOwnerSnapshot {
  readonly schema: typeof GAME_SESSION_OWNER_SNAPSHOT_SCHEMA;
  readonly saveOwner: GameSessionWalSaveOwner;
  readonly revision: number;
  readonly projection: JsonValue;
  readonly projectionDigest: `sha256:${string}`;
  readonly appliedTransactionIds: readonly string[];
}

/** Every method is a durable boundary. Locks and intents must survive process restart. */
export interface GameSessionPartitionStore {
  read(saveOwner: GameSessionWalSaveOwner): GameSessionOwnerSnapshot;
  prepare(intent: CrossSaveWalParticipantRecord, envelope: CrossSaveWalOperationEnvelope): boolean;
  apply(envelope: CrossSaveWalOperationEnvelope, transactionId: string): number;
  release(intent: CrossSaveWalParticipantRecord): void;
  installCheckpoint(save: GameSessionSave, owners: readonly GameSessionWalSaveOwner[]): void;
}

const projectionForOwner = (save: GameSessionSave, owner: GameSessionWalSaveOwner): JsonValue => {
  const state = save.state;
  switch (owner) {
    case "world_clock_save": return asJson({ worldTicks: state.survival.worldTicks, activeWorldTick: state.economy.activeWorldTick });
    case "player_survival_save": return asJson(state.survival);
    case "valley_ecology_save": return asJson({ lives: state.lifeCorpseLedger.lives });
    case "valley_resource_save": return asJson({ corpses: state.lifeCorpseLedger.corpses,
      corpseIdByLifeId: state.lifeCorpseLedger.corpseIdByLifeId,
      deathReceipts: Object.fromEntries(Object.entries(state.receiptIndex).filter(([id]) => id.startsWith("wal-receipt:") &&
        Object.values(state.lifeCorpseLedger.lives).some((life) => life.deathTransactionId && id === createCrossSaveReceiptId(life.deathTransactionId, "death")))) });
    case "player_inventory_save": return asJson({ inventoryRevision: state.economy.inventoryRevision, lots: state.economy.lots });
    case "player_wallet_save": return asJson({ walletRevision: state.economy.walletRevision, coin: state.economy.coin });
    case "settlement_workorder_save": return asJson(state.economy.workOrders);
    case "economy_ledger_save": return asJson({ processingReceipts: state.economy.processingReceipts,
      tradeReceipts: state.economy.tradeReceipts, merchantStates: state.economy.merchantStates,
      businessReceiptIndex: Object.fromEntries(Object.entries(state.receiptIndex).filter(([id]) =>
        state.economy.processingReceipts.some((receipt) => receipt.receiptId === id) ||
        state.economy.tradeReceipts.some((receipt) => id === createCrossSaveReceiptId(receipt.transactionId, "sell")) ||
        state.survival.receipts.includes(id))) });
  }
};

/** Canonical owner projection. Persistence adapters must never invent a second projection model. */
export const projectGameSessionWalOwner = projectionForOwner;

const validSnapshot = (value: unknown, owner: GameSessionWalSaveOwner): value is GameSessionOwnerSnapshot => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_OWNER_SNAPSHOT_SCHEMA || value.saveOwner !== owner ||
      !counter(value.revision) || !("projection" in value) || !nonEmpty(value.projectionDigest) ||
      !/^sha256:[0-9a-f]{64}$/.test(value.projectionDigest) || !Array.isArray(value.appliedTransactionIds) ||
      !(value.appliedTransactionIds as unknown[]).every(nonEmpty) ||
      new Set(value.appliedTransactionIds as string[]).size !== value.appliedTransactionIds.length) return false;
  try { return sha256Canonical(value.projection as JsonValue) === value.projectionDigest; } catch { return false; }
};

export const isGameSessionOwnerSnapshot = validSnapshot;

interface OwnerRedoPayload {
  readonly schema: typeof GAME_SESSION_WAL_BRIDGE_SCHEMA;
  readonly transactionId: string;
  readonly transactionKind: SupportedGameSessionWalTransactionKind;
  readonly saveOwner: GameSessionWalSaveOwner;
  readonly beforeProjectionDigest: `sha256:${string}`;
  readonly afterProjection: JsonValue;
  readonly afterProjectionDigest: `sha256:${string}`;
  readonly fixedPoint: readonly { readonly saveOwner: GameSessionWalSaveOwner; readonly revision: number; readonly projectionDigest: `sha256:${string}` }[];
  readonly publisher: boolean;
  readonly authorityBeforeRevision: number;
  readonly authorityBeforeDigest: `sha256:${string}`;
  readonly afterSave: GameSessionSave | null;
  readonly afterSaveDigest: `sha256:${string}`;
}

const readRedo = (value: JsonValue): OwnerRedoPayload => {
  if (!isRecord(value) || value.schema !== GAME_SESSION_WAL_BRIDGE_SCHEMA || !nonEmpty(value.transactionId) ||
      !SUPPORTED_KINDS.includes(value.transactionKind as SupportedGameSessionWalTransactionKind) ||
      !ALL_OWNERS.includes(value.saveOwner as GameSessionWalSaveOwner) || !nonEmpty(value.beforeProjectionDigest) ||
      !("afterProjection" in value) || !nonEmpty(value.afterProjectionDigest) ||
      sha256Canonical(value.afterProjection as JsonValue) !== value.afterProjectionDigest || !Array.isArray(value.fixedPoint) ||
      !(value.fixedPoint as unknown[]).every((entry) => isRecord(entry) && ALL_OWNERS.includes(entry.saveOwner as GameSessionWalSaveOwner) &&
        counter(entry.revision) && nonEmpty(entry.projectionDigest)) || typeof value.publisher !== "boolean" ||
      !counter(value.authorityBeforeRevision) || !nonEmpty(value.authorityBeforeDigest) || !nonEmpty(value.afterSaveDigest) ||
      (value.publisher ? !isRecord(value.afterSave) : value.afterSave !== null)) {
    throw new Error("GameSession owner redo payload is invalid");
  }
  if (value.publisher && jsonDigest(value.afterSave) !== value.afterSaveDigest) throw new Error("GameSession materialization digest mismatch");
  return value as unknown as OwnerRedoPayload;
};

/** Test-only durable partition model. Production must persist snapshots, intents, and locks atomically. */
export class InMemoryGameSessionPartitionStore implements GameSessionPartitionStore {
  private readonly snapshots = new Map<GameSessionWalSaveOwner, GameSessionOwnerSnapshot>();
  private readonly intents = new Map<string, { readonly owner: GameSessionWalSaveOwner; readonly lockKey: string; readonly lockId: string }>();
  private readonly locks = new Map<string, string>();
  public constructor(save: GameSessionSave, owners: readonly GameSessionWalSaveOwner[] = ALL_OWNERS) {
    this.installCheckpoint(save, owners);
  }
  public read(owner: GameSessionWalSaveOwner): GameSessionOwnerSnapshot {
    const snapshot = this.snapshots.get(owner);
    if (!validSnapshot(snapshot, owner)) throw new Error(`${owner} durable snapshot is missing or corrupt`);
    return Object.freeze({ ...snapshot, projection: asJson(snapshot.projection), appliedTransactionIds: Object.freeze([...snapshot.appliedTransactionIds]) });
  }
  public prepare(intent: CrossSaveWalParticipantRecord, envelope: CrossSaveWalOperationEnvelope): boolean {
    const owner = envelope.saveOwner as GameSessionWalSaveOwner;
    if (intent.saveOwner !== owner || !ALL_OWNERS.includes(owner) || this.read(owner).revision !== intent.expectedRevision) return false;
    const existingIntent = this.intents.get(intent.durableIntentId);
    if (existingIntent) return existingIntent.owner === owner && existingIntent.lockKey === envelope.lockKey &&
      existingIntent.lockId === intent.reservationOrLockId;
    const holder = this.locks.get(envelope.lockKey);
    if (holder && holder !== intent.durableIntentId) return false;
    this.intents.set(intent.durableIntentId, { owner, lockKey: envelope.lockKey, lockId: intent.reservationOrLockId });
    this.locks.set(envelope.lockKey, intent.durableIntentId);
    return true;
  }
  public apply(envelope: CrossSaveWalOperationEnvelope, transactionId: string): number {
    const owner = envelope.saveOwner as GameSessionWalSaveOwner;
    const redo = readRedo(envelope.redoPayload);
    if (redo.transactionId !== transactionId || redo.saveOwner !== owner || redo.publisher ||
        envelope.expectedAfterRevision !== envelope.beforeRevision + 1) throw new Error(`${owner} owner redo identity mismatch`);
    const expectedIntent = `wal-intent:${sha256Canonical([transactionId, owner, envelope.operationHash]).slice(7)}`;
    if (!this.intents.has(expectedIntent)) throw new Error(`${owner} durable intent is missing`);
    const current = this.read(owner);
    if (current.appliedTransactionIds.includes(transactionId)) {
      if (current.revision !== envelope.expectedAfterRevision || current.projectionDigest !== redo.afterProjectionDigest) {
        throw new Error(`${owner} idempotent apply diverged`);
      }
      return current.revision;
    }
    if (current.revision !== envelope.beforeRevision || current.projectionDigest !== redo.beforeProjectionDigest) {
      throw new Error(`${owner} partition CAS conflict`);
    }
    this.snapshots.set(owner, Object.freeze({ schema: GAME_SESSION_OWNER_SNAPSHOT_SCHEMA, saveOwner: owner,
      revision: envelope.expectedAfterRevision, projection: asJson(redo.afterProjection), projectionDigest: redo.afterProjectionDigest,
      appliedTransactionIds: Object.freeze([...current.appliedTransactionIds, transactionId]) }));
    return envelope.expectedAfterRevision;
  }
  public release(intent: CrossSaveWalParticipantRecord): void {
    const stored = this.intents.get(intent.durableIntentId);
    if (!stored || stored.lockId !== intent.reservationOrLockId) return;
    if (this.locks.get(stored.lockKey) === intent.durableIntentId) this.locks.delete(stored.lockKey);
    this.intents.delete(intent.durableIntentId);
  }
  public installCheckpoint(save: GameSessionSave, owners: readonly GameSessionWalSaveOwner[]): void {
    if (this.snapshots.size > 0 || this.intents.size > 0 || this.locks.size > 0) {
      throw new Error("partition checkpoint bootstrap cannot overwrite durable owner state");
    }
    for (const owner of owners) {
      const projection = projectionForOwner(save, owner);
      this.snapshots.set(owner, Object.freeze({ schema: GAME_SESSION_OWNER_SNAPSHOT_SCHEMA, saveOwner: owner,
        revision: 0, projection, projectionDigest: sha256Canonical(projection), appliedTransactionIds: Object.freeze([]) }));
    }
  }
  public removeOwnerForTest(owner: GameSessionWalSaveOwner): void { this.snapshots.delete(owner); }
  public corruptOwnerForTest(owner: GameSessionWalSaveOwner): void {
    const value = this.snapshots.get(owner); if (value) this.snapshots.set(owner, { ...value, projectionDigest: `sha256:${"0".repeat(64)}` });
  }
}

class OwnerCommitCoordinator {
  public constructor(
    private readonly authority: GameSessionAuthorityStore,
    private readonly partitions: GameSessionPartitionStore,
  ) {}
  public revision(owner: GameSessionWalSaveOwner): number {
    try { return this.partitions.read(owner).revision; } catch { return -1; }
  }
  public prepare(intent: CrossSaveWalParticipantRecord, envelope: CrossSaveWalOperationEnvelope): boolean {
    try { return this.partitions.prepare(intent, envelope); } catch { return false; }
  }
  public apply(owner: GameSessionWalSaveOwner, envelope: CrossSaveWalOperationEnvelope, transactionId: string): number {
    const redo = readRedo(envelope.redoPayload);
    if (redo.saveOwner !== owner || redo.publisher !== (redo.fixedPoint.at(-1)?.saveOwner === owner)) {
      throw new Error(`${owner} publisher order mismatch`);
    }
    const nonPublisherRedo: OwnerRedoPayload = redo.publisher ? { ...redo, publisher: false, afterSave: null } : redo;
    const revision = this.partitions.apply({ ...envelope, redoPayload: nonPublisherRedo as unknown as JsonValue }, transactionId);
    if (!redo.publisher) return revision;
    for (const expected of redo.fixedPoint) {
      const snapshot = this.partitions.read(expected.saveOwner);
      if (snapshot.revision !== expected.revision || snapshot.projectionDigest !== expected.projectionDigest ||
          !snapshot.appliedTransactionIds.includes(transactionId)) throw new Error("owner projections have not reached a fixed point");
    }
    if (!redo.afterSave || !this.authority.publishWalMaterialization(transactionId, redo.authorityBeforeRevision,
      redo.afterSave, redo.authorityBeforeDigest, redo.afterSaveDigest)) throw new Error("GameSession WAL materialization publish conflict");
    return revision;
  }
}

const createParticipant = (
  owner: GameSessionWalSaveOwner,
  coordinator: OwnerCommitCoordinator,
  partitions: GameSessionPartitionStore,
): CrossSaveWalParticipant => Object.freeze({
  saveOwner: owner,
  revision: () => coordinator.revision(owner),
  prepare: (intent: CrossSaveWalParticipantRecord, envelope: CrossSaveWalOperationEnvelope) => coordinator.prepare(intent, envelope),
  apply: (envelope: CrossSaveWalOperationEnvelope, transactionId: string) => coordinator.apply(owner, envelope, transactionId),
  release: (intent: CrossSaveWalParticipantRecord) => { partitions.release(intent); },
});

export interface PrepareGameSessionWalProposal {
  readonly transactionKind: GameSessionWalTransactionKind;
  readonly canonicalIdempotencyKey: string;
  readonly batch: SessionProposalBatch;
  readonly tick: number;
}

const changedIds = <T>(before: readonly T[], after: readonly T[], id: (value: T) => string): readonly string[] => {
  const prior = new Map(before.map((value) => [id(value), jsonDigest(value)]));
  const next = new Map(after.map((value) => [id(value), jsonDigest(value)]));
  return Object.freeze([...new Set([...prior.keys(), ...next.keys()])].filter((key) => prior.get(key) !== next.get(key)).sort());
};

const ownerLockKey = (owner: GameSessionWalSaveOwner, before: GameSessionSave, after: GameSessionSave,
  batch: SessionProposalBatch, first: boolean): string => {
  if (first) return `game-session:${before.sessionId}`;
  let subjects: readonly string[] = [];
  if (owner === "valley_ecology_save") subjects = changedIds(Object.values(before.state.lifeCorpseLedger.lives), Object.values(after.state.lifeCorpseLedger.lives), (v) => v.lifeInstanceId);
  else if (owner === "valley_resource_save") subjects = changedIds(Object.values(before.state.lifeCorpseLedger.corpses), Object.values(after.state.lifeCorpseLedger.corpses), (v) => v.corpseId);
  else if (owner === "player_inventory_save") subjects = changedIds(before.state.economy.lots, after.state.economy.lots, (v) => v.lotId);
  else if (owner === "settlement_workorder_save") subjects = changedIds(before.state.economy.workOrders, after.state.economy.workOrders, (v) => v.workOrderId);
  if (subjects.length === 0) subjects = batch.drafts.map((draft) => draft.eventId).sort();
  return `${owner}:${subjects.join(",")}`;
};

export class GameSessionProcessingWalBridge {
  private readonly runtime: CrossSaveWalRuntime;
  private readonly owners: readonly GameSessionWalSaveOwner[];
  private checkpointBarrierActive = false;
  private healthFailure: string | null = null;
  public readonly contract: CrossSaveWalContract;
  public constructor(
    private readonly authority: GameSessionAuthorityStore,
    durableStore: DurableCrossSaveWalStore,
    private readonly partitions: GameSessionPartitionStore,
    manifest: unknown = generatedRuntimeArtifact,
  ) {
    this.contract = readGameSessionProcessingWalContract(manifest);
    this.owners = Object.freeze([...new Set(Object.values(this.contract.registeredTransactionKinds).flat())] as GameSessionWalSaveOwner[]);
    const coordinator = new OwnerCommitCoordinator(authority, partitions);
    this.runtime = new CrossSaveWalRuntime({ contract: this.contract, durableStore,
      participants: this.owners.map((owner) => createParticipant(owner, coordinator, partitions)) });
    this.auditPartitions();
  }

  public prepareDeath(request: WildlifeDamageRequest, tick = request.worldTick): CrossSaveWalRecord {
    const state = this.authority.read().snapshot();
    const life = state.lifeCorpseLedger.lives[request.lifeInstanceId];
    if (!life || request.damage < life.currentHp) throw new Error("death WAL requires a registered lethal hit");
    const key = canonicalJson({ life_instance_id: life.lifeInstanceId, region_save_id: life.regionSaveId });
    const transactionId = createCrossSaveTransactionId("death", key);
    return this.prepareProposal({ transactionKind: "death", canonicalIdempotencyKey: key,
      batch: proposeWildlifeDamage(this.authority.read(), { ...request, transactionId }), tick });
  }

  public prepareProcessing(request: WildlifeProcessingAction, tick?: number): CrossSaveWalRecord {
    const batch = proposeWildlifeProcessing(this.authority.read(), request);
    const draft = batch.drafts[0];
    const payload: unknown = draft?.payload;
    if (!draft || draft.type !== "wildlife_processing_committed" || !isRecord(payload) || !isRecord(payload.action)) {
      throw new Error("processing proposal did not contain its materialized action");
    }
    const action = payload.action as unknown as WildlifeProcessingAction;
    const kind: SupportedGameSessionWalTransactionKind = action.action === "harvest" ? "harvest" :
      action.action === "reserve" ? "workorder_start" : action.action === "complete" ? "workorder_complete" :
        action.action === "claim" ? "workorder_claim" : action.action === "cancel" ? "workorder_cancel" :
          (() => { throw new Error("unsupported processing WAL action"); })();
    return this.prepareProposal({ transactionKind: kind, canonicalIdempotencyKey: action.canonicalIdempotencyKey,
      batch, tick: tick ?? action.currentWorldTick });
  }

  public prepareWork(workOrderId: string, interactionReceiptId: string, tick?: number): CrossSaveWalRecord {
    const proposed = proposeWildlifeProcessingWork(this.authority.read(), workOrderId, interactionReceiptId);
    const draft = proposed.drafts[0];
    const payload: unknown = draft?.payload;
    if (!draft || draft.type !== "wildlife_processing_work_advanced" || !isRecord(payload) ||
        !counter(payload.expectedWorkOrderRevision) || !nonEmpty(payload.transactionId) ||
        !nonEmpty(payload.canonicalIdempotencyKey) || proposed.transactionId !== payload.transactionId ||
        payload.transactionId !== createCrossSaveTransactionId("workorder_work", payload.canonicalIdempotencyKey)) {
      throw new Error("work proposal evidence is invalid");
    }
    return this.prepareProposal({ transactionKind: "workorder_work",
      canonicalIdempotencyKey: payload.canonicalIdempotencyKey, batch: proposed,
      tick: tick ?? this.authority.read().snapshot().survival.worldTicks });
  }

  public prepareConsumption(
    request: Readonly<{ playerSaveId: string; lotId: string; quantity?: number; consumptionSequence: number }>,
    tick?: number,
  ): CrossSaveWalRecord {
    const proposed = proposeInventoryConsumption(this.authority.read(), request);
    const draft = proposed.drafts[0];
    const payload: unknown = draft?.payload;
    if (!draft || draft.type !== "inventory_consumption_committed" || !isRecord(payload) || !isRecord(payload.action) ||
        !nonEmpty(payload.action.transactionId) || !nonEmpty(payload.action.canonicalIdempotencyKey) ||
        proposed.transactionId !== payload.action.transactionId ||
        payload.action.transactionId !== createCrossSaveTransactionId("consume", payload.action.canonicalIdempotencyKey)) {
      throw new Error("consumption proposal evidence is invalid");
    }
    return this.prepareProposal({ transactionKind: "consume",
      canonicalIdempotencyKey: payload.action.canonicalIdempotencyKey, batch: proposed,
      tick: tick ?? this.authority.read().snapshot().survival.worldTicks });
  }

  public prepareSell(quote: VerifiedSellQuote, issuedEventId: string,
    runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number }>,
    tick?: number,
  ): CrossSaveWalRecord {
    if (!nonEmpty(issuedEventId)) throw new Error("verified sell issuedEventId is required");
    const proposed = proposeVerifiedTradeSale(this.authority.read(), quote, issuedEventId, runtime);
    const canonicalIdempotencyKey = canonicalVerifiedSellKey(quote);
    if (proposed.transactionId !== createCrossSaveTransactionId("sell", canonicalIdempotencyKey)) {
      throw new Error("verified sell proposal identity is invalid");
    }
    return this.prepareProposal({ transactionKind: "sell", canonicalIdempotencyKey, batch: proposed,
      tick: tick ?? this.authority.read().snapshot().survival.worldTicks });
  }

  public prepareProposal(input: PrepareGameSessionWalProposal): CrossSaveWalRecord {
    if (this.checkpointBarrierActive || this.healthFailure) throw new Error(this.healthFailure ?? "GameSession WAL barrier is active");
    if (!SUPPORTED_KINDS.includes(input.transactionKind as SupportedGameSessionWalTransactionKind)) {
      throw new Error(`${input.transactionKind} WAL proposal is fail-closed until its verified domain proposal is installed`);
    }
    if (!counter(input.tick) || !nonEmpty(input.canonicalIdempotencyKey) ||
        input.batch.transactionId !== createCrossSaveTransactionId(input.transactionKind, input.canonicalIdempotencyKey)) {
      throw new Error("GameSession WAL proposal identity is invalid");
    }
    const transactionId = input.batch.transactionId;
    const proposalDigest = jsonDigest(input.batch);
    const existing = this.runtime.recordsSnapshot().find((record) => record.transactionId === transactionId);
    if (existing) {
      const payload = existing.operationEnvelopes[0]?.canonicalPayload;
      if (!isRecord(payload) || payload.proposalDigest !== proposalDigest || existing.transactionKind !== input.transactionKind ||
          existing.canonicalIdempotencyKey !== input.canonicalIdempotencyKey) {
        throw new Error("idempotency key conflicts with different GameSession proposal");
      }
      return existing;
    }
    const beforeSession = this.authority.read();
    const before = beforeSession.toSave();
    const dryRun = commitSessionProposal(beforeSession, input.batch);
    if (!dryRun.committed) throw new Error(`GameSession WAL proposal rejected: ${dryRun.reason ?? "unknown"}`);
    const after = dryRun.session.toSave();
    const authorityBeforeDigest = jsonDigest(before);
    if (!this.authority.acquireWalBarrier(transactionId, before.state.revision)) throw new Error("GameSession authority WAL barrier conflict");
    try {
      const ownerNames = this.contract.registeredTransactionKinds[input.transactionKind] as readonly GameSessionWalSaveOwner[];
      const fixedPoint = ownerNames.map((owner) => {
        const current = this.partitions.read(owner);
        const beforeProjection = projectionForOwner(before, owner);
        if (current.projectionDigest !== sha256Canonical(beforeProjection)) throw new Error(`${owner} is not synchronized with GameSession authority`);
        const afterProjection = projectionForOwner(after, owner);
        const afterProjectionDigest = sha256Canonical(afterProjection);
        if (afterProjectionDigest === current.projectionDigest) throw new Error(`${owner} has no authoritative material effect in ${input.transactionKind}`);
        return Object.freeze({ saveOwner: owner, revision: current.revision + 1, projectionDigest: afterProjectionDigest });
      });
      const newLots = after.state.economy.lots.filter((lot) => before.state.economy.lots.every((prior) => prior.lotId !== lot.lotId) &&
        lot.processingTransactionId === transactionId);
      const newOrders = after.state.economy.workOrders.filter((order) => before.state.economy.workOrders.every((prior) => prior.workOrderId !== order.workOrderId));
      const receiptKind = input.transactionKind;
      const authoritativeReceiptId = createCrossSaveReceiptId(transactionId, receiptKind);
      const addedReceiptIds = Object.keys(after.state.receiptIndex).filter((id) => before.state.receiptIndex[id] === undefined);
      const addedProcessingReceiptIds = after.state.economy.processingReceipts
        .filter((candidate) => before.state.economy.processingReceipts.every((prior) => prior.transactionId !== candidate.transactionId))
        .map((candidate) => candidate.receiptId);
      const hasAuthoritativeBusinessReceipt = input.transactionKind === "death" ? true :
        input.transactionKind === "sell" ? after.state.economy.tradeReceipts.some((candidate) =>
          candidate.transactionId === transactionId && before.state.economy.tradeReceipts.every((prior) => prior.transactionId !== transactionId)) :
          input.transactionKind === "consume" ? after.state.survival.receipts.includes(authoritativeReceiptId) &&
            !before.state.survival.receipts.includes(authoritativeReceiptId) : addedProcessingReceiptIds.includes(authoritativeReceiptId);
      if (!addedReceiptIds.includes(authoritativeReceiptId) || !hasAuthoritativeBusinessReceipt) {
        throw new Error(`${input.transactionKind} authoritative business receipt does not match the WAL receipt formula`);
      }
      const outputOwner = input.transactionKind === "workorder_start" ? "settlement_workorder_save" : "player_inventory_save";
      const receiptOwner = ownerNames.includes("economy_ledger_save") ? "economy_ledger_save" : ownerNames.at(-1)!;
      const afterSaveDigest = jsonDigest(after);
      const operations: CrossSaveWalOperationInput[] = ownerNames.map((owner, index) => {
        const current = this.partitions.read(owner);
        const afterProjection = projectionForOwner(after, owner);
        const publisher = index === ownerNames.length - 1;
        const redo: OwnerRedoPayload = { schema: GAME_SESSION_WAL_BRIDGE_SCHEMA, transactionId,
          transactionKind: input.transactionKind as SupportedGameSessionWalTransactionKind, saveOwner: owner,
          beforeProjectionDigest: current.projectionDigest, afterProjection, afterProjectionDigest: sha256Canonical(afterProjection),
          fixedPoint, publisher, authorityBeforeRevision: before.state.revision, authorityBeforeDigest, afterSave: publisher ? after : null, afterSaveDigest };
        return { saveOwner: owner, deterministicOperation: `game_session.${input.transactionKind}.${owner}`,
          canonicalPayload: asJson({ transactionId, transactionKind: input.transactionKind, saveOwner: owner, proposalDigest }),
          redoPayload: redo as unknown as JsonValue, expectedRevision: current.revision, expectedAfterRevision: current.revision + 1,
          lockKey: ownerLockKey(owner, before, after, input.batch, index === 0),
          outputKinds: owner === outputOwner ? (input.transactionKind === "workorder_start" ? newOrders.map(() => "work_order") : newLots.map(() => "inventory_lot")) : [],
          receiptKinds: owner === receiptOwner ? [receiptKind] : [],
          redoPreconditions: asJson({ expectedSessionRevision: before.state.revision, expectedSessionDigest: authorityBeforeDigest, expectedProjectionDigest: current.projectionDigest }) };
      });
      const actualOutputIds = input.transactionKind === "workorder_start" ? newOrders.map((order) => order.workOrderId) : newLots.map((lot) => lot.lotId);
      const expectedOutputIds = actualOutputIds.map((_, index) => createCrossSaveOutputId(transactionId,
        input.transactionKind === "workorder_start" ? "work_order" : "inventory_lot", index));
      if (canonicalJson(asJson(actualOutputIds)) !== canonicalJson(asJson(expectedOutputIds))) {
        throw new Error("GameSession proposal output IDs disagree with the WAL formula");
      }
      const record = this.runtime.begin({ transactionKind: input.transactionKind,
        canonicalIdempotencyKey: input.canonicalIdempotencyKey, operations, tick: input.tick });
      if (record.state === "aborted") this.authority.releaseWalBarrier(transactionId);
      return record;
    } catch (error) {
      this.authority.releaseWalBarrier(transactionId);
      throw error;
    }
  }

  public commit(transactionId: string, tick: number): CrossSaveWalRecord {
    const result = this.runtime.commit(transactionId, tick);
    if (result.state === "applied" || result.state === "aborted") this.authority.releaseWalBarrier(transactionId);
    return result;
  }
  public recover(tick: number): CrossSaveWalRecovery {
    this.restorePendingBarriers();
    try {
      const result = this.runtime.recover(tick);
      for (const record of this.runtime.recordsSnapshot()) if (record.state === "applied" || record.state === "aborted") {
        this.authority.releaseWalBarrier(record.transactionId);
      }
      this.auditPartitions();
      return this.healthFailure ? Object.freeze({ ...result, sceneActivationBlocked: true }) : result;
    } catch (error) {
      this.healthFailure = error instanceof Error ? error.message : "owner partition recovery failed";
      return Object.freeze({ sceneActivationBlocked: true, quarantinedTransactionIds: Object.freeze([]), changed: false });
    }
  }
  public walSave(): CrossSaveWalSave { return this.runtime.snapshot(); }
  public acknowledgeParticipantSnapshot(transactionId: string, saveOwner: string, revision: number, tick: number): CrossSaveWalRecord {
    return this.runtime.acknowledgeParticipantSnapshot(transactionId, saveOwner, revision, tick);
  }
  public garbageCollect(transactionId: string, tick: number): CrossSaveWalRecord {
    return this.runtime.garbageCollect(transactionId, tick);
  }
  public loadWal(save: unknown): void { this.checkpointBarrierActive = true; this.runtime.load(save); this.restorePendingBarriers(); }
  public loadCheckpoint(sessionSave: GameSessionSave, walSave: unknown, tick: number): CrossSaveWalRecovery {
    this.authority.installCheckpoint(sessionSave);
    this.loadWal(walSave);
    return this.recover(tick);
  }
  public checkpointBarrier(tick: number): CrossSaveWalRecovery {
    this.checkpointBarrierActive = true;
    const result = this.runtime.checkpointBarrier(tick);
    for (const record of this.runtime.recordsSnapshot()) if (record.state === "applied" || record.state === "aborted") {
      this.authority.releaseWalBarrier(record.transactionId);
    }
    this.auditPartitions();
    return this.healthFailure ? Object.freeze({ ...result, sceneActivationBlocked: true }) : result;
  }
  public regionExitBarrier(tick: number): CrossSaveWalRecovery { return this.checkpointBarrier(tick); }
  public endBarrier(): void {
    if (this.healthFailure) throw new Error(this.healthFailure);
    this.runtime.endBarrier(); this.checkpointBarrierActive = false;
  }
  public isSceneActivationReady(): boolean {
    this.auditPartitions();
    return !this.checkpointBarrierActive && this.healthFailure === null && this.runtime.isSceneActivationReady();
  }

  private auditPartitions(): void {
    try {
      const authoritySave = this.authority.save();
      const authorityDigest = jsonDigest(authoritySave);
      const pending = this.runtime.recordsSnapshot().filter((record) =>
        record.state === "prepared" || record.state === "committed");
      if (pending.length > 1) throw new Error("multiple pending GameSession WAL transactions violate the authority fence");
      if (pending.length === 0) {
        for (const owner of this.owners) {
          const snapshot = this.partitions.read(owner);
          if (snapshot.projectionDigest !== sha256Canonical(projectionForOwner(authoritySave, owner))) {
            throw new Error(`${owner} is not at the authoritative GameSession fixed point`);
          }
        }
      } else {
        const record = pending[0]!;
        const envelopeByOwner = new Map(record.operationEnvelopes.map((envelope) => [envelope.saveOwner, envelope]));
        const publisherRedo = readRedo(record.operationEnvelopes.at(-1)!.redoPayload);
        const authorityIsBefore = authorityDigest === publisherRedo.authorityBeforeDigest;
        const authorityIsAfter = authorityDigest === publisherRedo.afterSaveDigest;
        if (!authorityIsBefore && !authorityIsAfter) {
          throw new Error("GameSession authority is neither the pending transaction before nor after state");
        }
        for (const owner of this.owners) {
          const snapshot = this.partitions.read(owner);
          const envelope = envelopeByOwner.get(owner);
          if (!envelope) {
            if (snapshot.projectionDigest !== sha256Canonical(projectionForOwner(authoritySave, owner))) {
              throw new Error(`${owner} nonparticipant projection diverged from GameSession authority`);
            }
            continue;
          }
          const redo = readRedo(envelope.redoPayload);
          const isBefore = snapshot.revision === envelope.beforeRevision &&
            snapshot.projectionDigest === redo.beforeProjectionDigest &&
            !snapshot.appliedTransactionIds.includes(record.transactionId);
          const isAfter = snapshot.revision === envelope.expectedAfterRevision &&
            snapshot.projectionDigest === redo.afterProjectionDigest &&
            snapshot.appliedTransactionIds.includes(record.transactionId);
          if ((!isBefore && !isAfter) || (authorityIsAfter && !isAfter)) {
            throw new Error(`${owner} is outside the pending GameSession WAL before/after fixed points`);
          }
        }
      }
      if (!this.healthFailure?.startsWith("authority WAL barrier")) this.healthFailure = null;
    }
    catch (error) { this.healthFailure = error instanceof Error ? error.message : "owner partition is unavailable"; }
  }
  private restorePendingBarriers(): void {
    for (const record of this.runtime.recordsSnapshot()) {
      if ((record.state === "prepared" || record.state === "committed") &&
          !this.authority.acquireWalBarrier(record.transactionId,
            (record.operationEnvelopes[0]?.redoPreconditions as { readonly expectedSessionRevision?: number } | null)?.expectedSessionRevision ?? -1)) {
        this.healthFailure = `authority WAL barrier could not be restored for ${record.transactionId}`;
      }
    }
  }
}
