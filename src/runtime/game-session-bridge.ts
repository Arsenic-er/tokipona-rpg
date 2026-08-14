import {
  adaptRuntimeCheckpoint,
  commitSessionProposal,
  proposeCheckpoint,
} from "../session/adapters";
import {
  type GameSession,
  type GameSessionEvent,
  type GameSessionState,
  type SessionApplyResult,
  type SessionCheckpointState,
  type WorldFlagValue,
} from "../session/game-session";
import type { Vec2 } from "./geometry";
import {
  FixedStepRpgRuntime,
  type PersistentSceneDiffSnapshot,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "./runtime";
import type { PlayerBody, SceneDefinition } from "./scene";

const TILE_FLAG_PREFIX = "runtime.tile:";
const VALUE_FLAG_PREFIX = "runtime.value:";

export interface GameSessionRuntimeBridgeOptions {
  readonly session: GameSession;
  readonly scenes: readonly SceneDefinition[];
  readonly sceneAreas: Readonly<Record<string, string>>;
  readonly entranceByScene?: Readonly<Record<string, string>>;
  readonly viewportPx?: Vec2;
  readonly fixedHz?: number;
  readonly playerBody?: PlayerBody;
}

export interface RuntimeBridgeCommitResult {
  readonly event: GameSessionEvent;
  readonly sessionResult: SessionApplyResult;
  readonly runtime: RuntimeSnapshot;
}

export interface RuntimeBridgeTileResult {
  readonly committed: boolean;
  readonly rejectionCode: "out_of_bounds" | "recovery_route_blocked" | null;
  readonly commit: RuntimeBridgeCommitResult | null;
}

interface MutableHydratedDiff {
  readonly values: Record<string, WorldFlagValue>;
  readonly tileSolidity: Record<string, boolean>;
}

const isTuple = (value: unknown, length: number): value is unknown[] =>
  Array.isArray(value) && value.length === length;

const tileFlagId = (sceneId: string, tileX: number, tileY: number): string =>
  `${TILE_FLAG_PREFIX}${JSON.stringify([sceneId, tileX, tileY])}`;

const valueFlagId = (sceneId: string, key: string): string =>
  `${VALUE_FLAG_PREFIX}${JSON.stringify([sceneId, key])}`;

const parseOwnedFlag = (
  flagId: string,
):
  | { readonly kind: "tile"; readonly sceneId: string; readonly tileX: number; readonly tileY: number }
  | { readonly kind: "value"; readonly sceneId: string; readonly key: string }
  | null => {
  if (!flagId.startsWith(TILE_FLAG_PREFIX) && !flagId.startsWith(VALUE_FLAG_PREFIX)) return null;
  const tile = flagId.startsWith(TILE_FLAG_PREFIX);
  const prefix = tile ? TILE_FLAG_PREFIX : VALUE_FLAG_PREFIX;
  let payload: unknown;
  try {
    payload = JSON.parse(flagId.slice(prefix.length));
  } catch {
    throw new Error(`malformed runtime world flag: ${flagId}`);
  }
  if (tile) {
    if (
      !isTuple(payload, 3) || typeof payload[0] !== "string" ||
      !Number.isSafeInteger(payload[1]) || !Number.isSafeInteger(payload[2])
    ) throw new Error(`malformed runtime tile flag: ${flagId}`);
    return { kind: "tile", sceneId: payload[0], tileX: Number(payload[1]), tileY: Number(payload[2]) };
  }
  if (!isTuple(payload, 2) || typeof payload[0] !== "string" || typeof payload[1] !== "string") {
    throw new Error(`malformed runtime value flag: ${flagId}`);
  }
  return { kind: "value", sceneId: payload[0], key: payload[1] };
};

/**
 * Transaction boundary between transient simulation and the persistent aggregate.
 * Learning, economy, survival, quests, MP and receipts are deliberately absent:
 * callers must mutate those domains through GameSession-owned subsystem adapters.
 */
export class GameSessionRuntimeBridge {
  private authoritativeSession: GameSession;
  private readonly options: Omit<GameSessionRuntimeBridgeOptions, "session">;
  private activeRuntime: FixedStepRpgRuntime<null>;

  constructor(options: GameSessionRuntimeBridgeOptions) {
    this.authoritativeSession = options.session;
    this.options = {
      scenes: options.scenes,
      sceneAreas: options.sceneAreas,
      entranceByScene: options.entranceByScene,
      viewportPx: options.viewportPx,
      fixedHz: options.fixedHz,
      playerBody: options.playerBody,
    };
    this.validateBindings();
    this.activeRuntime = this.rebuildFromSession();
  }

  get session(): GameSession {
    return this.authoritativeSession;
  }

  get runtime(): FixedStepRpgRuntime<null> {
    return this.activeRuntime;
  }

  sessionSnapshot(): GameSessionState {
    return this.session.snapshot();
  }

  /** Installs a newer aggregate while preserving the live in-scene simulation. */
  adoptSession(session: GameSession): void {
    if (session.sessionId !== this.authoritativeSession.sessionId) {
      throw new Error("runtime bridge cannot adopt a different session");
    }
    this.authoritativeSession = session;
    if (session.snapshot().world.currentSceneId !== this.activeRuntime.snapshot().sceneId) {
      this.activeRuntime = this.rebuildFromSession();
      return;
    }
    this.hydratePersistentDiffs(session.snapshot());
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): readonly RuntimeBridgeCommitResult[] {
    this.activeRuntime.advanceTicks(ticks, input);
    return this.commitObservedTransitions();
  }

  advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): readonly RuntimeBridgeCommitResult[] {
    this.activeRuntime.advanceFrame(elapsedSeconds, input);
    return this.commitObservedTransitions();
  }

  setCheckpoint(eventId: string, checkpointId: string): RuntimeBridgeCommitResult {
    const local = this.activeRuntime.setCheckpoint(checkpointId);
    const current = this.session.snapshot().checkpoint;
    const checkpoint = adaptRuntimeCheckpoint({
      checkpointId: local.id,
      sceneId: local.sceneId,
      positionPx: local.position,
      revision: current.revision + 1,
    });
    const ledgerLength = this.session.events().length;
    const commit = commitSessionProposal(this.session, proposeCheckpoint(eventId, checkpoint));
    if (!commit.committed) {
      this.activeRuntime = this.rebuildFromSession();
      throw new Error(`checkpoint proposal rejected: ${String(commit.reason)}`);
    }
    this.authoritativeSession = commit.session;
    const event = this.session.events().slice(ledgerLength).find((candidate) =>
      candidate.type === "checkpoint_set"
    );
    if (!event) throw new Error("checkpoint proposal committed without checkpoint event");
    const snapshot = this.session.snapshot();
    const result: SessionApplyResult = {
      applied: true,
      duplicate: false,
      reason: "applied",
      snapshot,
    };
    this.restoreSessionCheckpoint(snapshot.checkpoint);
    return { event, sessionResult: result, runtime: this.activeRuntime.snapshot() };
  }

  resetToCheckpoint(eventId: string): RuntimeBridgeCommitResult {
    const checkpoint = this.session.snapshot().checkpoint;
    const event: GameSessionEvent = {
      eventId,
      sequence: this.session.nextSequence(),
      type: "scene_entered",
      payload: { sceneId: checkpoint.sceneId },
    };
    const result = this.session.apply(event);
    if (!result.applied && !result.duplicate) {
      this.activeRuntime = this.rebuildFromSession();
      throw new Error(`checkpoint reset event rejected: ${result.reason}`);
    }
    if (result.duplicate) {
      this.activeRuntime = this.rebuildFromSession();
      return { event, sessionResult: result, runtime: this.activeRuntime.snapshot() };
    }
    this.restoreSessionCheckpoint(result.snapshot.checkpoint);
    this.activeRuntime.resetToCheckpoint();
    this.activeRuntime.consumeSceneTransitions();
    return { event, sessionResult: result, runtime: this.activeRuntime.snapshot() };
  }

  setPersistentValue(
    eventId: string,
    sceneId: string,
    key: string,
    value: WorldFlagValue,
  ): RuntimeBridgeCommitResult {
    if (!key.trim()) throw new Error("persistent value key must not be empty");
    const areaId = this.areaForScene(sceneId);
    const event: GameSessionEvent = {
      eventId,
      sequence: this.session.nextSequence(),
      type: "world_flag_set",
      payload: { flagId: valueFlagId(sceneId, key), value, scope: "area", areaId },
    };
    const result = this.session.apply(event);
    if (!result.applied && !result.duplicate) {
      this.activeRuntime = this.rebuildFromSession();
      throw new Error(`persistent value event rejected: ${result.reason}`);
    }
    this.hydratePersistentDiffs(result.snapshot);
    return { event, sessionResult: result, runtime: this.activeRuntime.snapshot() };
  }

  setPersistentTileSolid(
    eventId: string,
    sceneId: string,
    tileX: number,
    tileY: number,
    solid: boolean,
  ): RuntimeBridgeTileResult {
    const local = this.activeRuntime.setPersistentTileSolid(sceneId, tileX, tileY, solid);
    if (!local.accepted) return { committed: false, rejectionCode: local.rejectionCode, commit: null };

    const areaId = this.areaForScene(sceneId);
    const event: GameSessionEvent = {
      eventId,
      sequence: this.session.nextSequence(),
      type: "world_flag_set",
      payload: { flagId: tileFlagId(sceneId, tileX, tileY), value: solid, scope: "area", areaId },
    };
    const result = this.session.apply(event);
    if (!result.applied && !result.duplicate) {
      this.activeRuntime = this.rebuildFromSession();
      throw new Error(`persistent tile event rejected: ${result.reason}`);
    }
    this.hydratePersistentDiffs(result.snapshot);
    return {
      committed: true,
      rejectionCode: null,
      commit: { event, sessionResult: result, runtime: this.activeRuntime.snapshot() },
    };
  }

  resetArea(eventId: string, areaId: string): RuntimeBridgeCommitResult {
    if (!areaId.trim() || !Object.values(this.options.sceneAreas).includes(areaId)) {
      throw new Error(`unknown runtime area: ${areaId}`);
    }
    const checkpoint = this.session.snapshot().checkpoint;
    const event: GameSessionEvent = {
      eventId,
      sequence: this.session.nextSequence(),
      type: "area_reset",
      payload: { areaId, respawnSceneId: checkpoint.sceneId },
    };
    const result = this.session.apply(event);
    if (!result.applied && !result.duplicate) {
      this.activeRuntime = this.rebuildFromSession();
      throw new Error(`area reset event rejected: ${result.reason}`);
    }
    if (result.duplicate) {
      this.activeRuntime = this.rebuildFromSession();
      return { event, sessionResult: result, runtime: this.activeRuntime.snapshot() };
    }
    this.activeRuntime = this.rebuildFromSession();
    return { event, sessionResult: result, runtime: this.activeRuntime.snapshot() };
  }

  rebuild(): RuntimeSnapshot {
    this.activeRuntime = this.rebuildFromSession();
    return this.activeRuntime.snapshot();
  }

  private commitObservedTransitions(): readonly RuntimeBridgeCommitResult[] {
    const commits: RuntimeBridgeCommitResult[] = [];
    for (const transition of this.activeRuntime.consumeSceneTransitions()) {
      const sequence = this.session.nextSequence();
      const event: GameSessionEvent = {
        eventId: `runtime.scene.${sequence}.${transition.tick}.${transition.fromSceneId}->${transition.toSceneId}`,
        sequence,
        type: "scene_entered",
        payload: { sceneId: transition.toSceneId },
      };
      const result = this.session.apply(event);
      if (!result.applied && !result.duplicate) {
        this.activeRuntime = this.rebuildFromSession();
        throw new Error(`scene transition event rejected: ${result.reason}`);
      }
      commits.push({ event, sessionResult: result, runtime: this.activeRuntime.snapshot() });
    }
    return Object.freeze(commits);
  }

  private rebuildFromSession(): FixedStepRpgRuntime<null> {
    const state = this.session.snapshot();
    const runtime = new FixedStepRpgRuntime<null>({
      scenes: this.options.scenes,
      initialSceneId: state.world.currentSceneId,
      initialEntranceId: this.options.entranceByScene?.[state.world.currentSceneId],
      globalProgress: null,
      viewportPx: this.options.viewportPx,
      fixedHz: this.options.fixedHz,
      playerBody: this.options.playerBody,
    });
    this.activeRuntime = runtime;
    this.hydratePersistentDiffs(state);
    this.restoreSessionCheckpoint(state.checkpoint);
    if (state.world.currentSceneId === state.checkpoint.sceneId) runtime.resetToCheckpoint();
    runtime.consumeSceneTransitions();
    return runtime;
  }

  private hydratePersistentDiffs(state: GameSessionState): void {
    const hydrated = new Map<string, MutableHydratedDiff>();
    for (const scene of this.options.scenes) {
      hydrated.set(scene.id, { values: {}, tileSolidity: {} });
    }
    for (const flag of Object.values(state.world.flags)) {
      const parsed = parseOwnedFlag(flag.flagId);
      if (!parsed) continue;
      const expectedArea = this.areaForScene(parsed.sceneId);
      if (flag.scope !== "area" || flag.areaId !== expectedArea) {
        throw new Error(`runtime world flag has incorrect area ownership: ${flag.flagId}`);
      }
      const diff = hydrated.get(parsed.sceneId)!;
      if (parsed.kind === "tile") {
        if (typeof flag.value !== "boolean") throw new Error(`runtime tile flag must be boolean: ${flag.flagId}`);
        diff.tileSolidity[`${parsed.tileX},${parsed.tileY}`] = flag.value;
      } else {
        diff.values[parsed.key] = flag.value;
      }
    }
    for (const [sceneId, diff] of hydrated) {
      const snapshot: PersistentSceneDiffSnapshot = {
        sceneId,
        values: diff.values,
        tileSolidity: diff.tileSolidity,
      };
      this.activeRuntime.restorePersistentDiff(snapshot);
    }
  }

  private restoreSessionCheckpoint(checkpoint: SessionCheckpointState): void {
    this.activeRuntime.restoreCheckpoint({
      id: checkpoint.id,
      sceneId: checkpoint.sceneId,
      position: { ...checkpoint.position },
      tick: checkpoint.revision,
    });
  }

  private validateBindings(): void {
    const ids = new Set(this.options.scenes.map((scene) => scene.id));
    for (const scene of this.options.scenes) {
      const areaId = this.options.sceneAreas[scene.id];
      if (typeof areaId !== "string" || !areaId.trim()) {
        throw new Error(`scene ${scene.id} has no runtime area binding`);
      }
    }
    for (const sceneId of Object.keys(this.options.sceneAreas)) {
      if (!ids.has(sceneId)) throw new Error(`area binding references unknown scene: ${sceneId}`);
    }
  }

  private areaForScene(sceneId: string): string {
    const areaId = this.options.sceneAreas[sceneId];
    if (!areaId) throw new Error(`scene ${sceneId} has no runtime area binding`);
    return areaId;
  }
}
