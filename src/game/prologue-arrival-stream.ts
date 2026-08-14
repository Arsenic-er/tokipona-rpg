import {
  commitSessionProposal,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionEconomySummary,
} from "../session/game-session";
import {
  GameSessionRuntimeBridge,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import type { SceneDefinition } from "../runtime/scene";
import {
  TELO_ATTUNEMENT_ITEMS,
  TeloLearningSlice,
  type TeloProposalResult,
} from "../learning/telo-slice";

import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeSceneManifestIndex,
  type RuntimeSceneExitManifest,
  type RuntimeSceneManifest,
  type RuntimeSceneRouteManifest,
} from "../content/runtime-scene-manifest";
import { getTeloLengthProfile } from "../spells/content-profiles";
const SCENE_MANIFEST_INDEX = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);

const requiredManifestByRegionNode = (regionNodeId: string): RuntimeSceneManifest => {
  const matches = Object.values(SCENE_MANIFEST_INDEX.byId)
    .filter((scene) => scene.regionNodeId === regionNodeId);
  if (matches.length !== 1) {
    throw new Error(`expected one generated scene for region node ${regionNodeId}, received ${matches.length}`);
  }
  return matches[0]!;
};

const ARRIVAL_MANIFEST = requiredManifestByRegionNode("valley.arrival_shelf");
const STREAM_MANIFEST = requiredManifestByRegionNode("valley.stream_section");
const SETTLEMENT_MANIFEST = requiredManifestByRegionNode("valley.settlement");
const SAFE_RANGE_MANIFEST = requiredManifestByRegionNode("valley.safe_range");
if (ARRIVAL_MANIFEST.regionId !== STREAM_MANIFEST.regionId || STREAM_MANIFEST.regionId !== SETTLEMENT_MANIFEST.regionId ||
    SETTLEMENT_MANIFEST.regionId !== SAFE_RANGE_MANIFEST.regionId) {
  throw new Error("arrival, stream and settlement generated scenes must belong to one runtime area");
}

type SettlementExitManifest = RuntimeSceneExitManifest & Readonly<{
  target: Readonly<{ kind: "scene"; sceneId: string; entranceId: string }>;
  firstTraverseCommit: string;
}>;
const SETTLEMENT_EXIT_CANDIDATE = STREAM_MANIFEST.exits.find((exit) =>
  exit.target.kind === "scene" && exit.target.sceneId === SETTLEMENT_MANIFEST.sceneId
);
if (
  !SETTLEMENT_EXIT_CANDIDATE || SETTLEMENT_EXIT_CANDIDATE.target.kind !== "scene" ||
  !SETTLEMENT_EXIT_CANDIDATE.firstTraverseCommit
) {
  throw new Error("stream scene requires a settlement scene exit with firstTraverseCommit");
}
const SETTLEMENT_EXIT = SETTLEMENT_EXIT_CANDIDATE as SettlementExitManifest;

export const PROLOGUE_ARRIVAL_SCENE_ID = ARRIVAL_MANIFEST.sceneId;
export const PROLOGUE_STREAM_SCENE_ID = STREAM_MANIFEST.sceneId;
export const PROLOGUE_SETTLEMENT_SCENE_ID = SETTLEMENT_MANIFEST.sceneId;
export const PROLOGUE_AREA_ID = ARRIVAL_MANIFEST.regionId;
export const PROLOGUE_SETTLEMENT_ENTRANCE_ID = SETTLEMENT_EXIT.target.entranceId;

const requiredNonMagicRoute = (solutionFamily: string): RuntimeSceneRouteManifest => {
  const route = STREAM_MANIFEST.routes.find((candidate) =>
    candidate.kind === "non_magic" && candidate.solutionFamily === solutionFamily
  );
  if (!route || !STREAM_MANIFEST.nonMagicAlternativeRouteIds.includes(route.id)) {
    throw new Error(`generated stream scene is missing non-magic route family ${solutionFamily}`);
  }
  return route;
};

const TOOL_ROUTE_IDS = Object.freeze({
  looseStone: requiredNonMagicRoute("move_loose_material").id,
  rottenLog: requiredNonMagicRoute("upper_slope_route").id,
  softSoil: requiredNonMagicRoute("shallow_water_route").id,
});
const routeCompletionFlag = (routeId: string): string => `route.completed:${routeId}`;

export const PROLOGUE_ROUTE_FLAGS = Object.freeze({
  looseStonePushed: routeCompletionFlag(TOOL_ROUTE_IDS.looseStone),
  rottenLogPlaced: routeCompletionFlag(TOOL_ROUTE_IDS.rottenLog),
  softSoilDug: routeCompletionFlag(TOOL_ROUTE_IDS.softSoil),
  manifestedWaterSettled: "route.manifested-water-settled",
  crossingDamaged: "route.crossing-damaged",
  crossingRepaired: "route.crossing-repaired",
  settlementReached: SETTLEMENT_EXIT.firstTraverseCommit,
});

const STREAM_WATER_LEFT_PX = Math.floor(STREAM_MANIFEST.sizeTiles.width * 0.375) * STREAM_MANIFEST.tileSizePx;
const STREAM_WATER_RIGHT_PX = Math.floor(STREAM_MANIFEST.sizeTiles.width * 0.6) * STREAM_MANIFEST.tileSizePx;
const STREAM_WATER_SURFACE_Y_PX = (STREAM_MANIFEST.sizeTiles.height - 2) * STREAM_MANIFEST.tileSizePx;
const TELO_MP_COST = getTeloLengthProfile("default").activationMp;
const WATER_GRAVITY_PX_PER_SECOND_SQUARED = 560;
const FIXED_HZ = 60;
const SOFT_LOCK_RECOVERY_TICKS = STREAM_MANIFEST.recovery.maximumSoftlockRecoverySeconds * FIXED_HZ;

const isSceneTargetExit = (
  exit: RuntimeSceneExitManifest,
): exit is RuntimeSceneExitManifest & Readonly<{
  target: Readonly<{ kind: "scene"; sceneId: string; entranceId: string }>;
}> => exit.target.kind === "scene";

const toRuntimeScene = (manifest: RuntimeSceneManifest): SceneDefinition => Object.freeze({
  id: manifest.sceneId,
  collisionRows: manifest.collisionRows,
  defaultEntranceId: manifest.recovery.entryEntranceId,
  entrances: Object.freeze(manifest.entrances.map((entrance) => Object.freeze({
    id: entrance.id,
    position: Object.freeze({ ...entrance.spawnPx }),
  }))),
  exits: Object.freeze(manifest.exits.filter(isSceneTargetExit).map((exit) => Object.freeze({
    id: exit.id,
    bounds: Object.freeze({ ...exit.boundsPx }),
    targetSceneId: exit.target.sceneId,
    targetEntranceId: exit.target.entranceId,
  }))),
});

export const PROLOGUE_ARRIVAL_SCENE: SceneDefinition = toRuntimeScene(ARRIVAL_MANIFEST);
export const PROLOGUE_STREAM_SCENE: SceneDefinition = toRuntimeScene(STREAM_MANIFEST);
export const PROLOGUE_SETTLEMENT_SCENE: SceneDefinition = toRuntimeScene(SETTLEMENT_MANIFEST);
export const PROLOGUE_SAFE_RANGE_RUNTIME_SCENE: SceneDefinition = toRuntimeScene(SAFE_RANGE_MANIFEST);

export const PROLOGUE_ARRIVAL_STREAM_SCENES = Object.freeze([
  PROLOGUE_ARRIVAL_SCENE,
  PROLOGUE_STREAM_SCENE,
  PROLOGUE_SETTLEMENT_SCENE,
  PROLOGUE_SAFE_RANGE_RUNTIME_SCENE,
]);
export type PrologueRoute = "unresolved" | "tools" | "telo";

export interface ManifestedWaterSnapshot {
  readonly id: string;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly velocity: Readonly<{ x: number; y: number }>;
  readonly settled: boolean;
}

export interface PrologueArrivalStreamSnapshot {
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly route: PrologueRoute;
  readonly routeReady: boolean;
  readonly shallowWater: Readonly<{
    leftPx: number;
    rightPx: number;
    surfaceYPx: number;
    playerWading: boolean;
  }>;
  readonly manifestedWater: readonly ManifestedWaterSnapshot[];
  readonly softLock: Readonly<{
    damaged: boolean;
    recoveryTicksRemaining: number | null;
  }>;
  readonly settlementEntranceReached: boolean;
  readonly killCount: 0;
}

export interface PrologueActionResult {
  readonly accepted: boolean;
  readonly reason:
    | "committed"
    | "wrong_scene"
    | "prerequisite_missing"
    | "route_damaged"
    | "route_not_ready"
    | "too_far_from_entrance"
    | "not_attuned"
    | "insufficient_mp"
    | "proposal_rejected"
    | "session_rejected";
  readonly learningProposal: TeloProposalResult | null;
  readonly snapshot: PrologueArrivalStreamSnapshot;
}

interface MutableWaterParticle {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  settled: boolean;
}

const requiredId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const runtimeValueFlagId = (sceneId: string, key: string): string =>
  `runtime.value:${JSON.stringify([sceneId, key])}`;

const runtimeFlag = (state: GameSessionState, key: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "area" && flag.areaId === PROLOGUE_AREA_ID &&
    flag.flagId === runtimeValueFlagId(PROLOGUE_STREAM_SCENE_ID, key) && flag.value === true
  );
const regionFlag = (state: GameSessionState, key: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === PROLOGUE_AREA_ID &&
    flag.flagId === key && flag.value === true
  );

const MANIFESTED_WATER_INSTANCE_PREFIX = "manifested-water.instance:";

const initialEconomy = (): SessionEconomySummary => ({
  coin: 0,
  walletRevision: 0,
  inventoryRevision: 0,
  lots: [
    {
      lotId: "prologue.resonance-pebble",
      itemId: TELO_ATTUNEMENT_ITEMS.commonResonance,
      quantity: 1,
      ownershipRevision: 0,
      freshnessRevision: 0,
    },
    {
      lotId: "prologue.clean-stream-sample",
      itemId: TELO_ATTUNEMENT_ITEMS.waterSample,
      quantity: 1,
      ownershipRevision: 0,
      freshnessRevision: 0,
    },
  ],
});

const receiptDraft = (eventId: string, receiptId: string, payloadHash: string): SessionEventDraft => ({
  eventId,
  type: "receipt_recorded",
  payload: { receiptId, domain: "cast", payloadHash },
});

/**
 * Headless N00 -> N01 vertical slice. The fixed-step runtime owns motion and
 * scene transitions; GameSession owns every durable route, MP and learning
 * result. Environmental props intentionally remain small explicit predicates
 * until their vocabulary is stable enough for a general interaction system.
 */
export class PrologueArrivalStreamSession {
  private authoritativeSession: GameSession;
  private bridge!: GameSessionRuntimeBridge;
  private learning!: TeloLearningSlice;
  private readonly waterParticles = new Map<string, MutableWaterParticle>();
  private damageStartedAtTick: number | null = null;

  constructor(session: GameSession) {
    const state = session.snapshot();
    if (!PROLOGUE_ARRIVAL_STREAM_SCENES.some((scene) => scene.id === state.world.currentSceneId)) {
      throw new Error("arrival-stream session requires an N00 or N01 current scene");
    }
    this.authoritativeSession = session;
    this.rebuildActors();
    if (runtimeFlag(state, PROLOGUE_ROUTE_FLAGS.crossingDamaged)) {
      this.damageStartedAtTick = this.bridge.runtime.snapshot().tick;
    }
  }

  static fromSave(candidate: unknown): PrologueArrivalStreamSession {
    return new PrologueArrivalStreamSession(GameSession.fromSave(candidate));
  }

  get session(): GameSession {
    return this.authoritativeSession;
  }

  get runtime(): GameSessionRuntimeBridge["runtime"] {
    return this.bridge.runtime;
  }

  toSave(): GameSessionSave {
    return this.authoritativeSession.toSave();
  }

  snapshot(): PrologueArrivalStreamSnapshot {
    const session = this.authoritativeSession.snapshot();
    const runtime = this.bridge.runtime.snapshot();
    const toolReady = this.toolRouteReady(session);
    const teloReady = runtimeFlag(session, PROLOGUE_ROUTE_FLAGS.manifestedWaterSettled);
    const damaged = runtimeFlag(session, PROLOGUE_ROUTE_FLAGS.crossingDamaged) &&
      !runtimeFlag(session, PROLOGUE_ROUTE_FLAGS.crossingRepaired);
    const playerCenterX = runtime.player.position.x + runtime.player.body.width / 2;
    return Object.freeze({
      session,
      runtime,
      route: toolReady ? "tools" : teloReady ? "telo" : "unresolved",
      routeReady: (toolReady || teloReady) && !damaged,
      shallowWater: Object.freeze({
        leftPx: STREAM_WATER_LEFT_PX,
        rightPx: STREAM_WATER_RIGHT_PX,
        surfaceYPx: STREAM_WATER_SURFACE_Y_PX,
        playerWading: runtime.sceneId === PROLOGUE_STREAM_SCENE_ID &&
          playerCenterX >= STREAM_WATER_LEFT_PX && playerCenterX <= STREAM_WATER_RIGHT_PX,
      }),
      manifestedWater: Object.freeze([...this.waterParticles.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((particle) => Object.freeze({
          id: particle.id,
          position: Object.freeze({ x: particle.x, y: particle.y }),
          velocity: Object.freeze({ x: particle.velocityX, y: particle.velocityY }),
          settled: particle.settled,
        }))),
      softLock: Object.freeze({
        damaged,
        recoveryTicksRemaining: damaged && this.damageStartedAtTick !== null
          ? Math.max(0, SOFT_LOCK_RECOVERY_TICKS - (runtime.tick - this.damageStartedAtTick))
          : null,
      }),
      settlementEntranceReached: regionFlag(session, PROLOGUE_ROUTE_FLAGS.settlementReached),
      killCount: 0,
    });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueArrivalStreamSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    for (let index = 0; index < ticks; index += 1) {
      const before = this.snapshot();
      this.bridge.advanceTicks(1, input);
      this.authoritativeSession = this.bridge.session;
      const enteredSettlement = before.runtime.sceneId === PROLOGUE_STREAM_SCENE_ID &&
        this.bridge.runtime.snapshot().sceneId === PROLOGUE_SETTLEMENT_SCENE_ID;
      if (enteredSettlement && before.routeReady) {
        this.commitRegionFlag(
          `runtime.scene.${SETTLEMENT_EXIT.firstTraverseCommit}`,
          PROLOGUE_ROUTE_FLAGS.settlementReached,
        );
      } else if (enteredSettlement) {
        this.bridge.resetToCheckpoint(`runtime.scene.blocked.${this.authoritativeSession.nextSequence()}`);
        this.authoritativeSession = this.bridge.session;
      }
      this.advanceWaterOneTick();
      this.recoverSoftLockIfDue();
    }
    return this.snapshot();
  }

  pushLooseStone(transactionId: string): PrologueActionResult {
    if (!this.inStream()) return this.result(false, "wrong_scene");
    return this.commitFlag(transactionId, PROLOGUE_ROUTE_FLAGS.looseStonePushed);
  }

  placeRottenLog(transactionId: string): PrologueActionResult {
    if (!this.inStream()) return this.result(false, "wrong_scene");
    return this.commitFlag(transactionId, PROLOGUE_ROUTE_FLAGS.rottenLogPlaced);
  }

  digSoftSoil(transactionId: string): PrologueActionResult {
    if (!this.inStream()) return this.result(false, "wrong_scene");
    return this.commitFlag(transactionId, PROLOGUE_ROUTE_FLAGS.softSoilDug);
  }

  discoverTelo(occurrenceId: string): PrologueActionResult {
    if (!this.inStream()) return this.result(false, "wrong_scene");
    const proposal = this.learning.proposeDiscovery(this.authoritativeSession.snapshot(), {
      occurrenceId,
      locationId: `${PROLOGUE_STREAM_SCENE_ID}:glyph-wall`,
    });
    return this.commitLearning(proposal);
  }

  attuneTelo(attemptId: string, occurrenceId: string): PrologueActionResult {
    if (!this.inStream()) return this.result(false, "wrong_scene");
    const proposal = this.learning.proposeAttunement(this.authoritativeSession.snapshot(), {
      attemptId,
      occurrenceId,
      environmentalWitnessId: "witness.n01.clean-running-water",
      outcome: "success",
    });
    return this.commitLearning(proposal);
  }

  manifestTelo(transactionId: string): PrologueActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inStream()) return this.result(false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const existingReceipt = state.receiptIndex[id];
    if (existingReceipt) {
      return existingReceipt.domain === "cast" && existingReceipt.payloadHash === `prologue:telo:${TELO_MP_COST}`
        ? this.result(true, "committed")
        : this.result(false, "session_rejected");
    }
    if (state.learning.words.telo?.attunementState !== "attuned") {
      return this.result(false, "not_attuned");
    }
    if (state.mp.currentMp < TELO_MP_COST) return this.result(false, "insufficient_mp");

    const proposal = this.learning.proposeGrounding(state, {
      attemptId: id,
      task: "streamRecognition",
      promptLevel: 0,
      variantHash: "n01.manifest-telo.zero-initial-velocity.v1",
      normalizedEnvironmentFingerprint: "env.n01.shallow-stream",
      interpretationStatus: "executed_legal",
      worldOutcomeContribution: true,
      toolBypass: false,
      answerVisible: false,
      fixedSlotOnly: false,
      colorOnlyCue: false,
    });
    if (!proposal.accepted) return this.result(false, "proposal_rejected", proposal);
    const batch: SessionProposalBatch = {
      transactionId: proposal.batch.transactionId,
      drafts: [
        ...proposal.batch.drafts,
        {
          eventId: `session.prologue.telo.mp.${id}`,
          type: "mp_replaced",
          payload: {
            mp: {
              currentMp: state.mp.currentMp - TELO_MP_COST,
              maxMp: state.mp.maxMp,
              worldVersion: state.mp.worldVersion + 1,
            },
          },
        },
        {
          eventId: `session.prologue.telo.water.${id}`,
          type: "world_flag_set",
          payload: {
            flagId: runtimeValueFlagId(PROLOGUE_STREAM_SCENE_ID, `${MANIFESTED_WATER_INSTANCE_PREFIX}${id}`),
            value: "pending",
            scope: "area",
            areaId: PROLOGUE_AREA_ID,
          },
        },
        receiptDraft(`session.prologue.telo.receipt.${id}`, id, `prologue:telo:${TELO_MP_COST}`),
      ],
    };
    const commit = commitSessionProposal(this.authoritativeSession, batch);
    if (!commit.committed) return this.result(false, "session_rejected", proposal);
    this.authoritativeSession = commit.session;
    this.rebuildActors();

    return this.result(true, "committed", proposal);
  }

  damageCrossing(transactionId: string): PrologueActionResult {
    if (!this.inStream()) return this.result(false, "wrong_scene");
    const result = this.commitFlag(transactionId, PROLOGUE_ROUTE_FLAGS.crossingDamaged);
    if (result.accepted) this.damageStartedAtTick = this.bridge.runtime.snapshot().tick;
    return result;
  }

  repairCrossing(transactionId: string): PrologueActionResult {
    if (!runtimeFlag(this.authoritativeSession.snapshot(), PROLOGUE_ROUTE_FLAGS.crossingDamaged)) {
      return this.result(false, "prerequisite_missing");
    }
    const result = this.commitFlag(transactionId, PROLOGUE_ROUTE_FLAGS.crossingRepaired);
    if (result.accepted) this.damageStartedAtTick = null;
    return result;
  }

  resetArea(transactionId: string): PrologueArrivalStreamSnapshot {
    this.bridge.resetArea(requiredId(transactionId, "transactionId"), PROLOGUE_AREA_ID);
    this.authoritativeSession = this.bridge.session;
    this.waterParticles.clear();
    this.damageStartedAtTick = null;
    return this.snapshot();
  }

  setCheckpoint(transactionId: string, checkpointId: string): PrologueArrivalStreamSnapshot {
    this.bridge.setCheckpoint(
      requiredId(transactionId, "transactionId"),
      requiredId(checkpointId, "checkpointId"),
    );
    this.authoritativeSession = this.bridge.session;
    return this.snapshot();
  }

  resetToCheckpoint(transactionId: string): PrologueArrivalStreamSnapshot {
    this.bridge.resetToCheckpoint(requiredId(transactionId, "transactionId"));
    this.authoritativeSession = this.bridge.session;
    this.restorePersistedWater(this.authoritativeSession.snapshot());
    return this.snapshot();
  }

  enterSettlementSafeEntrance(transactionId: string): PrologueActionResult {
    const snapshot = this.snapshot();
    if (!this.inStream()) return this.result(false, "wrong_scene");
    if (!snapshot.routeReady) {
      return this.result(false, snapshot.softLock.damaged ? "route_damaged" : "route_not_ready");
    }
    if (!this.playerOverlapsSettlementExit(snapshot.runtime)) {
      return this.result(false, "too_far_from_entrance");
    }
    return this.commitRegionFlag(transactionId, PROLOGUE_ROUTE_FLAGS.settlementReached);
  }

  private playerOverlapsSettlementExit(runtime: RuntimeSnapshot): boolean {
    if (runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID) return false;
    const player = {
      x: runtime.player.position.x,
      y: runtime.player.position.y,
      width: runtime.player.body.width,
      height: runtime.player.body.height,
    };
    const exit = SETTLEMENT_EXIT.boundsPx;
    return player.x < exit.x + exit.width && player.x + player.width > exit.x &&
      player.y < exit.y + exit.height && player.y + player.height > exit.y;
  }

  private advanceWaterOneTick(): void {
    const seconds = 1 / FIXED_HZ;
    for (const particle of this.waterParticles.values()) {
      if (particle.settled) continue;
      particle.velocityY += WATER_GRAVITY_PX_PER_SECOND_SQUARED * seconds;
      particle.x += particle.velocityX * seconds;
      particle.y += particle.velocityY * seconds;
      if (particle.y < STREAM_WATER_SURFACE_Y_PX) continue;
      particle.y = STREAM_WATER_SURFACE_Y_PX;
      particle.velocityY = 0;
      particle.settled = true;
      this.bridge.setPersistentValue(
        `event.prologue.telo.water-settled.${particle.id}`,
        PROLOGUE_STREAM_SCENE_ID,
        `${MANIFESTED_WATER_INSTANCE_PREFIX}${particle.id}`,
        "settled",
      );
      this.bridge.setPersistentValue(
        `event.prologue.telo.route-settled.${particle.id}`,
        PROLOGUE_STREAM_SCENE_ID,
        PROLOGUE_ROUTE_FLAGS.manifestedWaterSettled,
        true,
      );
      this.authoritativeSession = this.bridge.session;
    }
  }

  private recoverSoftLockIfDue(): void {
    if (this.damageStartedAtTick === null) return;
    if (this.bridge.runtime.snapshot().tick - this.damageStartedAtTick < SOFT_LOCK_RECOVERY_TICKS) return;
    const sequence = this.authoritativeSession.nextSequence();
    this.commitFlag(`event.prologue.auto-repair.${sequence}`, PROLOGUE_ROUTE_FLAGS.crossingRepaired);
    this.damageStartedAtTick = null;
  }

  private toolRouteReady(state: GameSessionState): boolean {
    return STREAM_MANIFEST.nonMagicAlternativeRouteIds.some((routeId) =>
      runtimeFlag(state, routeCompletionFlag(routeId))
    );
  }

  private inStream(): boolean {
    return this.bridge.runtime.snapshot().sceneId === PROLOGUE_STREAM_SCENE_ID;
  }

  private commitRegionFlag(transactionId: string, flag: string): PrologueActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (regionFlag(this.authoritativeSession.snapshot(), flag)) return this.result(true, "committed");
    const commit = commitSessionProposal(this.authoritativeSession, {
      transactionId: id,
      drafts: [{
        eventId: id,
        type: "world_flag_set",
        payload: {
          flagId: flag,
          value: true,
          scope: "region",
          regionId: PROLOGUE_AREA_ID,
        },
      }],
    });
    if (!commit.committed) return this.result(false, "session_rejected");
    this.authoritativeSession = commit.session;
    this.rebuildActors();
    return this.result(true, "committed");
  }
  private commitFlag(transactionId: string, flag: string): PrologueActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (runtimeFlag(this.authoritativeSession.snapshot(), flag)) {
      return this.result(true, "committed");
    }
    this.bridge.setPersistentValue(
      id,
      PROLOGUE_STREAM_SCENE_ID,
      flag,
      true,
    );
    this.authoritativeSession = this.bridge.session;
    return this.result(true, "committed");
  }

  private commitLearning(proposal: TeloProposalResult): PrologueActionResult {
    if (!proposal.accepted) return this.result(false, "proposal_rejected", proposal);
    const commit = commitSessionProposal(this.authoritativeSession, proposal.batch);
    if (!commit.committed) return this.result(false, "session_rejected", proposal);
    this.authoritativeSession = commit.session;
    this.rebuildActors();
    return this.result(true, "committed", proposal);
  }

  private result(
    accepted: boolean,
    reason: PrologueActionResult["reason"],
    learningProposal: TeloProposalResult | null = null,
  ): PrologueActionResult {
    return { accepted, reason, learningProposal, snapshot: this.snapshot() };
  }

  private restorePersistedWater(state: GameSessionState): void {
    this.waterParticles.clear();
    for (const flag of Object.values(state.world.flags)) {
      if (flag.scope !== "area" || flag.areaId !== PROLOGUE_AREA_ID) continue;
      const marker = flag.flagId.indexOf(MANIFESTED_WATER_INSTANCE_PREFIX);
      if (marker < 0 || (flag.value !== "pending" && flag.value !== "settled")) continue;
      const id = flag.flagId.slice(marker + MANIFESTED_WATER_INSTANCE_PREFIX.length, -2);
      if (!id) continue;
      const settled = flag.value === "settled";
      this.waterParticles.set(id, {
        id,
        x: STREAM_WATER_LEFT_PX,
        y: settled ? STREAM_WATER_SURFACE_Y_PX : 2 * STREAM_MANIFEST.tileSizePx,
        velocityX: 0,
        velocityY: 0,
        settled,
      });
    }
  }
  private rebuildActors(): void {
    this.learning = new TeloLearningSlice(this.authoritativeSession.sessionId);
    this.restorePersistedWater(this.authoritativeSession.snapshot());
    this.bridge = new GameSessionRuntimeBridge({
      session: this.authoritativeSession,
      scenes: PROLOGUE_ARRIVAL_STREAM_SCENES,
      sceneAreas: {
        [PROLOGUE_ARRIVAL_SCENE_ID]: PROLOGUE_AREA_ID,
        [PROLOGUE_STREAM_SCENE_ID]: PROLOGUE_AREA_ID,
        [PROLOGUE_SETTLEMENT_SCENE_ID]: PROLOGUE_AREA_ID,
        [SAFE_RANGE_MANIFEST.sceneId]: PROLOGUE_AREA_ID,
      },
      entranceByScene: {
        [PROLOGUE_ARRIVAL_SCENE_ID]: ARRIVAL_MANIFEST.recovery.entryEntranceId,
        [PROLOGUE_STREAM_SCENE_ID]: STREAM_MANIFEST.recovery.entryEntranceId,
        [PROLOGUE_SETTLEMENT_SCENE_ID]: SETTLEMENT_MANIFEST.recovery.entryEntranceId,
        [SAFE_RANGE_MANIFEST.sceneId]: SAFE_RANGE_MANIFEST.recovery.entryEntranceId,
      },
      viewportPx: { x: 320, y: 128 },
      fixedHz: FIXED_HZ,
    });
  }
}

export const createPrologueArrivalStreamInitialSession = (options: Readonly<{
  sessionId: string;
  currentMp?: number;
  maxMp?: number;
}>): GameSession => {
  const maxMp = options.maxMp ?? 24;
  return GameSession.create({
    sessionId: requiredId(options.sessionId, "sessionId"),
    mp: { currentMp: options.currentMp ?? maxMp, maxMp, worldVersion: 0 },
    currentSceneId: PROLOGUE_ARRIVAL_SCENE_ID,
    checkpoint: {
      id: "checkpoint.prologue.arrival",
      sceneId: PROLOGUE_ARRIVAL_SCENE_ID,
      position: { ...ARRIVAL_MANIFEST.entrances.find((entry) => entry.id === ARRIVAL_MANIFEST.recovery.entryEntranceId)!.spawnPx },
      revision: 0,
    },
    economy: initialEconomy(),
  });
};

export const PROLOGUE_SOFT_LOCK_RECOVERY_TICKS = SOFT_LOCK_RECOVERY_TICKS;
export const PROLOGUE_TELO_MP_COST = TELO_MP_COST;




