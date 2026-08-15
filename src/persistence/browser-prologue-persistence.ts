import { PrologueFlowSession } from "../game/prologue-flow";
import { GameSession } from "../session/game-session";
import {
  BrowserGameSessionWalCoordinator,
  isBrowserGameSessionSaveEnvelopeSchema,
  LocalStorageDurableJsonStore,
  readBrowserGameSessionSaveEnvelope,
  type BrowserExtensionLearningAdapter,
  type BrowserGameSessionSaveEnvelope,
  type LocalStorageLike,
} from "./browser-game-session-wal";

export interface BrowserPrologueStorageKeys {
  readonly checkpointKey: string;
  readonly companionKey: string;
  readonly legacyCheckpointKeys?: readonly string[];
}

export interface BrowserPrologueRuntime {
  readonly flow: PrologueFlowSession;
  readonly coordinator: BrowserGameSessionWalCoordinator;
}

const parsePrimary = (storage: LocalStorageLike, key: string): unknown | null => {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw) as unknown;
};

const findPrimary = (
  storage: LocalStorageLike,
  keys: BrowserPrologueStorageKeys,
): Readonly<{ value: unknown; legacy: boolean }> | null => {
  const current = parsePrimary(storage, keys.checkpointKey);
  if (current !== null) return Object.freeze({ value: current, legacy: false });
  for (const key of keys.legacyCheckpointKeys ?? []) {
    if (key === keys.checkpointKey) continue;
    const legacy = parsePrimary(storage, key);
    if (legacy !== null) return Object.freeze({ value: legacy, legacy: true });
  }
  return null;
};

/**
 * Boot order is intentionally companion-first. It is the crash-recovery truth;
 * the user checkpoint envelope may lag or be absent after a committed command.
 */
export function bootstrapBrowserPrologue(
  storage: LocalStorageLike,
  keys: BrowserPrologueStorageKeys,
  freshSessionId: () => string,
  learningAdapter?: BrowserExtensionLearningAdapter,
): BrowserPrologueRuntime {
  const companionStore = new LocalStorageDurableJsonStore(storage, keys.companionKey);
  if (companionStore.read() !== null) {
    const coordinator = BrowserGameSessionWalCoordinator.load(companionStore, undefined, learningAdapter);
    const flow = PrologueFlowSession.fromSave(coordinator.toSessionSave());
    flow.attachCrossSaveTransactionCoordinator(coordinator);
    return Object.freeze({ flow, coordinator });
  }

  const primary = findPrimary(storage, keys);
  if (primary !== null) {
    if (typeof primary.value === "object" && primary.value !== null &&
        isBrowserGameSessionSaveEnvelopeSchema((primary.value as { schema?: unknown }).schema)) {
      const envelope = readBrowserGameSessionSaveEnvelope(primary.value, learningAdapter);
      companionStore.write(envelope.companion);
      const coordinator = BrowserGameSessionWalCoordinator.load(companionStore, undefined, learningAdapter);
      const flow = PrologueFlowSession.fromSave(coordinator.toSessionSave());
      flow.attachCrossSaveTransactionCoordinator(coordinator);
      if (primary.legacy) storage.setItem(keys.checkpointKey, JSON.stringify(coordinator.toEnvelope()));
      return Object.freeze({ flow, coordinator });
    }
    const legacySession = GameSession.fromSave(primary.value);
    const coordinator = BrowserGameSessionWalCoordinator.fresh(legacySession, companionStore, learningAdapter);
    const flow = PrologueFlowSession.fromSave(legacySession.toSave());
    flow.attachCrossSaveTransactionCoordinator(coordinator);
    if (primary.legacy) storage.setItem(keys.checkpointKey, JSON.stringify(coordinator.toEnvelope()));
    return Object.freeze({ flow, coordinator });
  }

  const flow = PrologueFlowSession.fresh({ sessionId: freshSessionId() });
  const coordinator = BrowserGameSessionWalCoordinator.fresh(flow.session, companionStore, learningAdapter);
  flow.attachCrossSaveTransactionCoordinator(coordinator);
  return Object.freeze({ flow, coordinator });
}

export function persistBrowserPrologueCheckpoint(
  storage: LocalStorageLike,
  keys: BrowserPrologueStorageKeys,
  runtime: BrowserPrologueRuntime,
): BrowserGameSessionSaveEnvelope {
  runtime.coordinator.synchronizeOrdinarySession(runtime.flow.session);
  const envelope = runtime.coordinator.toEnvelope();
  storage.setItem(keys.checkpointKey, JSON.stringify(envelope));
  return envelope;
}
