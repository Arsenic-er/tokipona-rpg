import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeEcologyManifest,
  readRuntimeInfrastructureTaskManifestIndex,
  readRuntimeSceneManifestIndex,
  type RuntimeSceneEntranceManifest,
  type RuntimeSceneManifest,
} from "../content";
import { commitSessionProposal, type SessionEventDraft } from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionReceiptDomain,
  type WorldFlagValue,
} from "../session/game-session";
import {
  WildlifeStateMachine,
  type NonlethalWildlifeActionResult,
  type PlayerPhysicalProfile,
  type WildlifeStateMachineSnapshot,
} from "./wildlife-state-machine";

const SCENES = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const TASKS = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const ECOLOGY = readRuntimeEcologyManifest(generatedRuntimeArtifact);

const exactlyOne = <T>(items: readonly T[], test: (item: T) => boolean, label: string): T => {
  const found = items.filter(test);
  if (found.length !== 1) throw new Error(`expected exactly one ${label}; received ${found.length}`);
  return found[0]!;
};
const sceneByNode = (nodeId: string): RuntimeSceneManifest => exactlyOne(
  Object.values(SCENES.byId), (scene) => scene.regionNodeId === nodeId, `scene ${nodeId}`,
);
const DEN_SCENE = sceneByNode("valley.den_bypass");
const SERVICE_SCENE = sceneByNode("valley.waterwheel");
const CISTERN_SCENE = sceneByNode("valley.high_cistern");
const DEN_TASK_REF = exactlyOne(DEN_SCENE.taskRefs, (ref) => ref.id === "ch01_den_bypass", "N06 task ref");
const DEN_TASK = TASKS.byId[DEN_TASK_REF.id];
if (!DEN_TASK || DEN_TASK.sceneId !== DEN_SCENE.sceneId || DEN_TASK.maximumSoftlockRecoverySeconds > 60) {
  throw new Error("generated N06 task/scene contract is inconsistent");
}

const entrance = (scene: RuntimeSceneManifest, id: string): RuntimeSceneEntranceManifest =>
  exactlyOne(scene.entrances, (entry) => entry.id === id, `entrance ${id}`);
const DEN_FROM_SERVICE = entrance(DEN_SCENE, "den.from_waterwheel");
const DEN_FROM_CISTERN = entrance(DEN_SCENE, "den.from_cistern");
const SERVICE_FROM_DEN = entrance(SERVICE_SCENE, "waterwheel.from_settlement");
const CISTERN_FROM_DEN = entrance(CISTERN_SCENE, "cistern.from_den");
const DEN_TO_SERVICE = exactlyOne(DEN_SCENE.exits, (exit) => exit.id === "den.to_waterwheel", "den.to_waterwheel");
const DEN_TO_CISTERN = exactlyOne(DEN_SCENE.exits, (exit) => exit.id === "den.to_cistern", "den.to_cistern");
if (DEN_TO_SERVICE.target.kind !== "scene" || DEN_TO_SERVICE.target.sceneId !== SERVICE_SCENE.sceneId ||
    DEN_TO_SERVICE.target.entranceId !== SERVICE_FROM_DEN.id || DEN_TO_SERVICE.traversalGuardAny.length !== 0 ||
    DEN_TO_CISTERN.target.kind !== "scene" || DEN_TO_CISTERN.target.sceneId !== CISTERN_SCENE.sceneId ||
    DEN_TO_CISTERN.target.entranceId !== CISTERN_FROM_DEN.id || !DEN_TO_CISTERN.traversalGuardAny.includes("den_route_open == true")) {
  throw new Error("generated N06 outbound topology is not canonical");
}

const SOLUTION_IDS = [
  "den.wait_and_observe",
  "den.dig_upper_bypass",
  "den.low_force_noise",
  "den.low_force_staff",
] as const;
export type PrologueWildlifeSolutionId = typeof SOLUTION_IDS[number];
const SOLUTIONS = Object.fromEntries(SOLUTION_IDS.map((id) => [
  id,
  exactlyOne(DEN_TASK.solutions, (solution) => solution.id === id && solution.routeKind === "non_magic", id),
])) as Record<PrologueWildlifeSolutionId, (typeof DEN_TASK.solutions)[number]>;

export const PROLOGUE_WILDLIFE_SCENE_ID = DEN_SCENE.sceneId;
export const PROLOGUE_WILDLIFE_TASK_ID = DEN_TASK.id;
export const PROLOGUE_WILDLIFE_REGION_ID = DEN_SCENE.regionId;
export const PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID = SOLUTION_IDS[0];
export const PROLOGUE_WILDLIFE_DIG_SOLUTION_ID = SOLUTION_IDS[1];
export const PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID = SOLUTION_IDS[2];
export const PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID = SOLUTION_IDS[3];
export const PROLOGUE_WILDLIFE_CHECKPOINT_ID = "checkpoint.valley.den_bypass.entry";
export const PROLOGUE_WILDLIFE_REGION_FLAGS = Object.freeze({
  denRouteOpen: "den_route_open",
  foxDenIntact: "fox_den_intact",
  denEntryCrossed: "den_bypass_entry_crossed",
  routeSolutionId: "den_route_solution_id",
  routePatchApplied: `material_patch:${DEN_TASK.materialPatchRefs[0] ?? "missing"}`,
} as const);

type Point = Readonly<{ x: number; y: number }>;
type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
const BINDING = ECOLOGY.foxSpatialBinding;
const NOISE_POINT = exactlyOne(DEN_SCENE.targets, (target) => target.id === "den.noise_surface" && target.kind === "nonlethal_deterrence_surface" && target.interactionPointTiles !== null, "generated noise point").interactionPointTiles!;
const STAFF_POINT = exactlyOne(DEN_SCENE.targets, (target) => target.id === "den.staff_marker" && target.kind === "low_force_distance_marker" && target.interactionPointTiles !== null, "generated staff marker").interactionPointTiles!;
const LATCH_POINT = exactlyOne(DEN_SCENE.targets, (target) => target.id === "den.old_service_latch" && target.kind === "route_latch" && target.interactionPointTiles !== null, "generated old latch point").interactionPointTiles!;
const DIG_POINT = exactlyOne(DEN_SCENE.targets, (target) => target.id === "den.upper_dig_line" && target.kind === "marked_non_destructive_bypass" && target.interactionPointTiles !== null, "generated upper dig point").interactionPointTiles!;
const INTERACTION_RADIUS_TILES = 0.75;
const RECEIPT_DOMAIN: SessionReceiptDomain = "world";
const ZERO_REWARDS = Object.freeze({
  kills: 0 as const, drops: 0 as const, learning: 0 as const, mp: 0 as const,
  capacity: 0 as const, coin: 0 as const, keyItems: 0 as const,
});

export interface PrologueWildlifeWorldFacts {
  readonly playerRetreating: boolean;
  readonly lineOfSight: boolean;
  readonly localDangerCleared: boolean;
  readonly returnWorldConditionsSatisfied: boolean;
  readonly youngThreatened?: boolean;
  readonly majorHarmOccurred?: boolean;
}
export interface PrologueWildlifeTickInput {
  readonly playerPositionTiles: Point;
  readonly foxPositionTiles: Point;
  readonly playerProfile: PlayerPhysicalProfile;
  readonly world: PrologueWildlifeWorldFacts;
}
export interface PrologueWildlifeVisitEvidence {
  readonly visitId: string;
  readonly warningObservedWithoutHarm: boolean;
  readonly playerHarmOccurred: boolean;
  readonly playerRetreatedAfterWarning: boolean;
  readonly realExitReached: boolean;
  readonly outsideWarningZone: boolean;
  readonly denIntactObserved: boolean;
  readonly oldLatchOpened: boolean;
  readonly lowForceNoiseUsed: boolean;
  readonly lowForceStaffUsed: boolean;
  readonly currentOutsideWarningZone: boolean;
  readonly currentEscapeLaneOpen: boolean;
  readonly currentPlayerRetreating: boolean;
  readonly currentStaffDistanceSafe: boolean;
}
export interface PrologueWildlifeDigProgress { readonly upperLineMarked: boolean; readonly upperBypassClear: boolean; readonly bracesInstalled: boolean; readonly slumpBelowLimit: boolean; }
export type PrologueWildlifeActionReason =
  | "committed" | "duplicate" | "transaction_conflict" | "wrong_scene" | "wrong_source_scene"
  | "entry_guard_failed" | "route_prerequisite_missing" | "route_ready" | "feature_disabled" | "session_rejected";
export interface PrologueWildlifeActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueWildlifeActionReason;
  readonly snapshot: PrologueWildlifeSnapshot;
}
export interface PrologueWildlifeEntryResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueWildlifeActionReason;
  readonly source: "service" | "cistern" | null;
  readonly wildlife: PrologueWildlifeSession | null;
}
export interface PrologueWildlifeHandoffResult extends PrologueWildlifeActionResult {
  readonly ready: boolean;
  readonly targetSceneId: string;
  readonly targetEntranceId: string;
  readonly session: GameSession | null;
}
export interface PrologueWildlifeDeterrenceResult extends PrologueWildlifeActionResult {
  readonly effect: NonlethalWildlifeActionResult | null;
}
export interface PrologueWildlifeDamageResult extends PrologueWildlifeActionResult {
  readonly damageApplied: 0;
  readonly deathCreated: false;
  readonly externalLedgerRequired: true;
}
export interface PrologueWildlifeSnapshot {
  readonly session: GameSessionState;
  readonly sceneManifestId: string;
  readonly taskId: string;
  readonly fox: WildlifeStateMachineSnapshot;
  readonly minimumWarningTicks: number;
  readonly foxPositionTiles: Point;
  readonly spatialBinding: Readonly<{
    warningBoundsTiles: Bounds; escapeBoundsTiles: Bounds; denBoundsTiles: Bounds; defensiveContactTiles: number;
  }>;
  readonly interactionPoints: Readonly<{
    noise: Point;
    staff: Point;
    latch: Point;
    dig: Point;
  }>;
  readonly visitEvidence: PrologueWildlifeVisitEvidence;
  readonly digProgress: PrologueWildlifeDigProgress;
  readonly denRouteOpen: boolean;
  readonly routeSolutionId: string | null;
  readonly foxDenIntact: boolean;
  readonly serviceReturnAlwaysOpen: true;
  readonly highCisternReady: boolean;
  readonly behaviorPersistence: Readonly<{ scope: "transient_compact"; gameSessionTickEvents: 0 }>;
  readonly softLockRecovery: Readonly<{ maximumSeconds: number; actions: readonly string[]; preserves: readonly string[] }>;
  readonly rewards: typeof ZERO_REWARDS;
}

const requiredId = (value: string, label: string): string => {
  const id = value.trim(); if (!id) throw new Error(`${label} is required`); return id;
};
const finitePoint = (point: Point, label: string): Point => {
  if (![point.x, point.y].every(Number.isFinite)) throw new Error(`${label} must be finite`);
  return Object.freeze({ x: point.x, y: point.y });
};
const inside = (point: Point, bounds: Bounds): boolean =>
  point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height;
const distance = (left: Point, right: Point): number => Math.hypot(left.x - right.x, left.y - right.y);
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]));
  }
  return value;
};
const fingerprint = (kind: string, payload: unknown): string => `wildlife:v2:${kind}:${JSON.stringify(canonicalize(payload))}`;
const receiptId = (sessionId: string, transactionId: string): string => `world:${sessionId}:wildlife-operation:${transactionId}`;
const classify = (session: GameSession, transactionId: string, hash: string): "absent" | "duplicate" | "conflict" => {
  const prior = session.snapshot().receiptIndex[receiptId(session.sessionId, transactionId)];
  if (!prior) return "absent";
  return prior.domain === RECEIPT_DOMAIN && prior.payloadHash === hash ? "duplicate" : "conflict";
};
const receiptDraft = (session: GameSession, transactionId: string, hash: string, epoch: number): SessionEventDraft => ({
  eventId: `session.wildlife.e${epoch}.receipt.${transactionId}`,
  type: "receipt_recorded",
  payload: { receiptId: receiptId(session.sessionId, transactionId), domain: RECEIPT_DOMAIN, payloadHash: hash },
});
const regionFlagDraft = (eventId: string, flagId: string, value: WorldFlagValue): SessionEventDraft => ({
  eventId, type: "world_flag_set", payload: { flagId, value, scope: "region", regionId: PROLOGUE_WILDLIFE_REGION_ID },
});
const regionValue = (state: GameSessionState, flagId: string): WorldFlagValue | undefined =>
  Object.values(state.world.flags).find((flag) => flag.scope === "region" && flag.regionId === PROLOGUE_WILDLIFE_REGION_ID && flag.flagId === flagId)?.value;
const regionTrue = (state: GameSessionState, flagId: string): boolean => regionValue(state, flagId) === true;
const epochOf = (session: GameSession): number => session.snapshot().world.areaEpochs[DEN_SCENE.sceneId] ?? 0;
const checkpointFor = (state: GameSessionState, id: string, scene: RuntimeSceneManifest, entry: RuntimeSceneEntranceManifest) => ({
  id, sceneId: scene.sceneId, position: { ...entry.spawnPx }, revision: state.checkpoint.revision + 1,
});
const blankEvidence = (visitId: string, denIntact: boolean): PrologueWildlifeVisitEvidence => Object.freeze({
  visitId, warningObservedWithoutHarm: false, playerHarmOccurred: false, playerRetreatedAfterWarning: false, realExitReached: false, outsideWarningZone: false,
  denIntactObserved: denIntact, oldLatchOpened: false, lowForceNoiseUsed: false, lowForceStaffUsed: false,
  currentOutsideWarningZone: true, currentEscapeLaneOpen: true, currentPlayerRetreating: false, currentStaffDistanceSafe: false,
});

export class PrologueWildlifeSession {
  private authoritativeSession: GameSession;
  private fox: WildlifeStateMachine;
  private foxPosition: Point;
  private evidence: PrologueWildlifeVisitEvidence;
  private lastPlayerPosition: Point | null = null;
  private previousFoxPosition: Point;
  private digProgress: PrologueWildlifeDigProgress = Object.freeze({ upperLineMarked: false, upperBypassClear: false, bracesInstalled: false, slumpBelowLimit: false });

  constructor(session: GameSession) {
    if (session.snapshot().world.currentSceneId !== DEN_SCENE.sceneId) throw new Error("wildlife coordinator requires N06");
    this.authoritativeSession = session;
    this.fox = this.freshFox();
    this.foxPosition = Object.freeze({ x: BINDING.spawnPositionTiles[0], y: BINDING.spawnPositionTiles[1] });
    this.previousFoxPosition = this.foxPosition;
    this.evidence = blankEvidence(this.visitId(), this.foxDenIntact());
  }

  /** Adopts a same-scene authoritative Session update without resetting local encounter state. */
  adoptSession(session: GameSession): void {
    if (session.sessionId !== this.authoritativeSession.sessionId ||
        session.snapshot().world.currentSceneId !== DEN_SCENE.sceneId) {
      throw new Error("wildlife session adoption requires the same N06 session");
    }
    this.authoritativeSession = session;
  }

  static enterFromService(session: GameSession, transactionId: string): PrologueWildlifeEntryResult {
    if (!regionTrue(session.snapshot(), "maintenance_access_open")) return this.entryResult(false, false, "entry_guard_failed", null, null);
    return this.enter(session, transactionId, "service", SERVICE_SCENE, DEN_FROM_SERVICE);
  }

  static enterFromCistern(session: GameSession, transactionId: string): PrologueWildlifeEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const hash = fingerprint("entry", { source: "cistern", sourceSceneId: CISTERN_SCENE.sceneId, targetSceneId: DEN_SCENE.sceneId, entranceId: DEN_FROM_CISTERN.id });
    if (classify(session, id, hash) === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (!regionTrue(session.snapshot(), PROLOGUE_WILDLIFE_REGION_FLAGS.denRouteOpen)) return this.entryResult(false, false, "entry_guard_failed", null, null);
    return this.enter(session, id, "cistern", CISTERN_SCENE, DEN_FROM_CISTERN);
  }

  static adopt(session: GameSession, transactionId: string): PrologueWildlifeEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const state = session.snapshot();
    if (state.world.currentSceneId !== DEN_SCENE.sceneId) return this.entryResult(false, false, "wrong_source_scene", null, null);
    const latestEntry = [...session.events()].reverse().find((event) => event.type === "scene_entered" && event.payload.sceneId === DEN_SCENE.sceneId);
    const source = latestEntry && latestEntry.eventId.endsWith(`${SERVICE_SCENE.sceneId}->${DEN_SCENE.sceneId}`) ? "service"
      : latestEntry && latestEntry.eventId.endsWith(`${CISTERN_SCENE.sceneId}->${DEN_SCENE.sceneId}`) ? "cistern" : null;
    if (!source) return this.entryResult(false, false, "wrong_source_scene", null, null);
    const hash = fingerprint("adopt", { source, target: DEN_SCENE.sceneId });
    const prior = classify(session, id, hash);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") return this.entryResult(true, true, "duplicate", source, new PrologueWildlifeSession(session));
    const adoptedEntry = source === "service" ? DEN_FROM_SERVICE : DEN_FROM_CISTERN;
    const result = commitSessionProposal(session, { transactionId: id, drafts: [
      { eventId: `session.wildlife.e${epochOf(session)}.adopt-checkpoint.${id}`, type: "checkpoint_set", payload: { checkpoint: checkpointFor(state, `checkpoint.valley.den_bypass.adopt-${source}`, DEN_SCENE, adoptedEntry) } },
      receiptDraft(session, id, hash, epochOf(session)),
    ] });
    return result.committed
      ? this.entryResult(true, false, "committed", source, new PrologueWildlifeSession(result.session))
      : this.entryResult(false, false, "session_rejected", null, null);
  }

  static adoptRuntimeEntry(session: GameSession, transactionId: string): PrologueWildlifeEntryResult {
    return this.adopt(session, transactionId);
  }

  private static enter(session: GameSession, transactionId: string, source: "service" | "cistern", sourceScene: RuntimeSceneManifest, entry: RuntimeSceneEntranceManifest): PrologueWildlifeEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const hash = fingerprint("entry", { source, sourceSceneId: sourceScene.sceneId, targetSceneId: DEN_SCENE.sceneId, entranceId: entry.id });
    const prior = classify(session, id, hash);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") {
      return session.snapshot().world.currentSceneId === DEN_SCENE.sceneId
        ? this.entryResult(true, true, "duplicate", source, new PrologueWildlifeSession(session))
        : this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    const state = session.snapshot();
    if (state.world.currentSceneId !== sourceScene.sceneId) return this.entryResult(false, false, "wrong_source_scene", null, null);
    const epoch = epochOf(session);
    const result = commitSessionProposal(session, { transactionId: id, drafts: [
      { eventId: `session.wildlife.e${epoch}.entry.${id}.${sourceScene.sceneId}->${DEN_SCENE.sceneId}`, type: "scene_entered", payload: { sceneId: DEN_SCENE.sceneId } },
      { eventId: `session.wildlife.e${epoch}.checkpoint.${id}`, type: "checkpoint_set", payload: { checkpoint: checkpointFor(state, PROLOGUE_WILDLIFE_CHECKPOINT_ID, DEN_SCENE, entry) } },
      regionFlagDraft(`session.wildlife.e${epoch}.entry-flag.${id}`, PROLOGUE_WILDLIFE_REGION_FLAGS.denEntryCrossed, true),
      receiptDraft(session, id, hash, epoch),
    ] });
    return result.committed
      ? this.entryResult(true, false, "committed", source, new PrologueWildlifeSession(result.session))
      : this.entryResult(false, false, "session_rejected", null, null);
  }

  private static entryResult(accepted: boolean, duplicate: boolean, reason: PrologueWildlifeActionReason, source: "service" | "cistern" | null, wildlife: PrologueWildlifeSession | null): PrologueWildlifeEntryResult {
    return Object.freeze({ accepted, duplicate, reason, source, wildlife });
  }

  static fromSave(candidate: unknown): PrologueWildlifeSession { return new PrologueWildlifeSession(GameSession.fromSave(candidate)); }
  get session(): GameSession { return this.authoritativeSession; }
  toSave(): GameSessionSave { return this.authoritativeSession.toSave(); }

  snapshot(): PrologueWildlifeSnapshot {
    const state = this.authoritativeSession.snapshot();
    return Object.freeze({
      session: state, sceneManifestId: DEN_SCENE.sceneId, taskId: DEN_TASK.id, fox: this.fox.snapshot(), minimumWarningTicks: Math.ceil(ECOLOGY.minimumWarningTelegraphSeconds * 60), foxPositionTiles: this.foxPosition,
      spatialBinding: Object.freeze({ warningBoundsTiles: BINDING.warningBoundsTiles, escapeBoundsTiles: BINDING.escapeBoundsTiles, denBoundsTiles: BINDING.denBoundsTiles, defensiveContactTiles: ECOLOGY.defensiveContactTiles }),
      interactionPoints: Object.freeze({
        noise: Object.freeze({ x: NOISE_POINT[0], y: NOISE_POINT[1] }),
        staff: Object.freeze({ x: STAFF_POINT[0], y: STAFF_POINT[1] }),
        latch: Object.freeze({ x: LATCH_POINT[0], y: LATCH_POINT[1] }),
        dig: Object.freeze({ x: DIG_POINT[0], y: DIG_POINT[1] }),
      }),
      visitEvidence: this.evidence, digProgress: this.digProgress, denRouteOpen: regionTrue(state, PROLOGUE_WILDLIFE_REGION_FLAGS.denRouteOpen),
      routeSolutionId: typeof regionValue(state, PROLOGUE_WILDLIFE_REGION_FLAGS.routeSolutionId) === "string" ? regionValue(state, PROLOGUE_WILDLIFE_REGION_FLAGS.routeSolutionId) as string : null,
      foxDenIntact: this.foxDenIntact(), serviceReturnAlwaysOpen: true,
      highCisternReady: regionTrue(state, PROLOGUE_WILDLIFE_REGION_FLAGS.denRouteOpen),
      behaviorPersistence: Object.freeze({ scope: "transient_compact", gameSessionTickEvents: 0 }),
      softLockRecovery: Object.freeze({ maximumSeconds: DEN_TASK.maximumSoftlockRecoverySeconds, actions: DEN_TASK.recoveryActions, preserves: DEN_TASK.recoveryPreserves }),
      rewards: ZERO_REWARDS,
    });
  }

  advanceTicks(ticks: number, input: PrologueWildlifeTickInput): PrologueWildlifeSnapshot {
    this.requireScene();
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    const player = finitePoint(input.playerPositionTiles, "playerPositionTiles");
    const nextFoxPosition = finitePoint(input.foxPositionTiles, "foxPositionTiles");
    if (player.x < 0 || player.x >= DEN_SCENE.sizeTiles.width || player.y < 0 || player.y >= DEN_SCENE.sizeTiles.height) throw new RangeError("playerPositionTiles must remain inside generated N06 bounds");
    if (ticks === 0) return this.snapshot();
    this.lastPlayerPosition = player;
    const playerInsideWarningZone = inside(player, BINDING.warningBoundsTiles);
    const foxInsideScene = nextFoxPosition.x >= 0 && nextFoxPosition.x < DEN_SCENE.sizeTiles.width && nextFoxPosition.y >= 0 && nextFoxPosition.y < DEN_SCENE.sizeTiles.height;
    if (!foxInsideScene) throw new RangeError("foxPositionTiles must remain inside generated N06 bounds");
    if (distance(this.previousFoxPosition, nextFoxPosition) > Math.max(1, ticks * 0.25)) throw new RangeError("foxPositionTiles movement exceeds the authoritative frame delta");
    const preBehaviorState = this.fox.snapshot().behaviorState;
    this.foxPosition = nextFoxPosition;
    const foxAtEscape = inside(this.foxPosition, BINDING.escapeBoundsTiles);
    const defensiveContact = distance(player, this.foxPosition) <= ECOLOGY.defensiveContactTiles;
    const denIntact = this.foxDenIntact();
    const escapeLaneOpen = !inside(player, BINDING.escapeBoundsTiles) && denIntact;
    const foxAtHomeAnchor = Math.floor(this.foxPosition.x) === Math.floor(BINDING.spawnPositionTiles[0]) && Math.floor(this.foxPosition.y) === Math.floor(BINDING.spawnPositionTiles[1]);
    const result = this.fox.advance({
      playerWithinPerception: distance(player, this.foxPosition) <= ECOLOGY.perceptionTiles,
      playerInsideWarningZone,
      playerBlocksEscape: inside(player, BINDING.escapeBoundsTiles),
      wildlifeCornered: !escapeLaneOpen,
      playerRetreating: input.world.playerRetreating,
      lineOfSight: input.world.lineOfSight,
      localDangerCleared: input.world.localDangerCleared,
      returnWorldConditionsSatisfied: input.world.returnWorldConditionsSatisfied && denIntact,
      realEscapeExitReachable: escapeLaneOpen,
      reachedRealEscapeExit: foxAtEscape,
      defensiveContact,
      atHomeAnchor: foxAtHomeAnchor,
      majorHarmOccurred: input.world.majorHarmOccurred,
      youngThreatened: input.world.youngThreatened,
      playerProfile: input.playerProfile,
    }, ticks);
    this.evidence = Object.freeze({
      ...this.evidence,
      playerHarmOccurred: this.evidence.playerHarmOccurred || input.world.majorHarmOccurred === true,
      playerRetreatedAfterWarning: this.evidence.playerRetreatedAfterWarning || (input.world.playerRetreating && (this.evidence.warningObservedWithoutHarm || result.warningTicks >= Math.ceil(ECOLOGY.minimumWarningTelegraphSeconds * 60))),
      warningObservedWithoutHarm: this.evidence.warningObservedWithoutHarm || (!this.evidence.playerHarmOccurred && input.world.majorHarmOccurred !== true && result.warningTicks >= Math.ceil(ECOLOGY.minimumWarningTelegraphSeconds * 60)),
      realExitReached: this.evidence.realExitReached || (foxAtEscape && (preBehaviorState === "flee" || preBehaviorState === "return")),
      outsideWarningZone: !playerInsideWarningZone,
      denIntactObserved: this.evidence.denIntactObserved && denIntact,
      currentOutsideWarningZone: !playerInsideWarningZone,
      currentEscapeLaneOpen: escapeLaneOpen,
      currentPlayerRetreating: input.world.playerRetreating,
      currentStaffDistanceSafe: !playerInsideWarningZone && escapeLaneOpen && distance(player, { x: STAFF_POINT[0], y: STAFF_POINT[1] }) <= INTERACTION_RADIUS_TILES && distance(player, this.foxPosition) > ECOLOGY.defensiveContactTiles && distance(player, this.foxPosition) <= ECOLOGY.perceptionTiles,
    });
    this.previousFoxPosition = this.foxPosition;
    return this.snapshot();
  }

  openOldServiceLatch(transactionId: string): PrologueWildlifeActionResult {
    if (this.lastPlayerPosition === null || distance(this.lastPlayerPosition, { x: LATCH_POINT[0], y: LATCH_POINT[1] }) > INTERACTION_RADIUS_TILES) return this.result(false, false, "route_prerequisite_missing");
    return this.transientOperation(transactionId, "open_old_service_latch", {}, () => {
      this.evidence = Object.freeze({ ...this.evidence, oldLatchOpened: true });
    });
  }

  makeLowForceNoise(transactionId: string): PrologueWildlifeDeterrenceResult {
    const zeroContact = (): NonlethalWildlifeActionResult => this.fox.applySoundFear(transactionId, ECOLOGY.noiseFear);
    return this.deterrence(transactionId, "noise", zeroContact);
  }

  useWoodStaff(transactionId: string): PrologueWildlifeDeterrenceResult {
    return this.deterrence(transactionId, "staff", () => { const result = this.fox.applyWoodStaffFear(transactionId); if (!result.duplicate && result.fearAdded !== ECOLOGY.staffFear) throw new Error("FSM staff fear drifted from generated ecology"); return result; });
  }

  completeWaitAndObserve(transactionId: string): PrologueWildlifeActionResult { return this.completeRoute(transactionId, "den.wait_and_observe", this.nonDigReady() && this.evidence.playerRetreatedAfterWarning); }
  completeLowForceNoise(transactionId: string): PrologueWildlifeActionResult { return this.completeRoute(transactionId, "den.low_force_noise", this.nonDigReady() && this.evidence.lowForceNoiseUsed); }
  completeLowForceStaff(transactionId: string): PrologueWildlifeActionResult { return this.completeRoute(transactionId, "den.low_force_staff", this.nonDigReady() && this.evidence.lowForceStaffUsed); }
  inspectAndMarkUpperLine(transactionId: string): PrologueWildlifeActionResult {
    if (!this.atGeneratedPoint(DIG_POINT) || !this.foxDenIntact()) return this.result(false, false, "route_prerequisite_missing");
    return this.transientOperation(transactionId, "mark_upper_dig_line", {}, () => { this.digProgress = Object.freeze({ ...this.digProgress, upperLineMarked: true }); });
  }
  digUpperBypass(transactionId: string): PrologueWildlifeActionResult {
    if (!this.atGeneratedPoint(DIG_POINT) || !this.digProgress.upperLineMarked || !this.foxClearOfDen()) return this.result(false, false, "route_prerequisite_missing");
    return this.transientOperation(transactionId, "dig_upper_bypass", {}, () => { this.digProgress = Object.freeze({ ...this.digProgress, upperBypassClear: true }); });
  }
  installUpperBypassBraces(transactionId: string): PrologueWildlifeActionResult {
    if (!this.atGeneratedPoint(DIG_POINT) || !this.digProgress.upperBypassClear || !this.foxClearOfDen()) return this.result(false, false, "route_prerequisite_missing");
    return this.transientOperation(transactionId, "install_upper_bypass_braces", {}, () => { this.digProgress = Object.freeze({ ...this.digProgress, bracesInstalled: true, slumpBelowLimit: true }); });
  }
  completeDigUpperBypass(transactionId: string): PrologueWildlifeActionResult {
    const ready = this.digProgress.upperLineMarked && this.digProgress.upperBypassClear && this.digProgress.bracesInstalled && this.digProgress.slumpBelowLimit && this.foxClearOfDen() && this.evidence.currentEscapeLaneOpen && this.foxDenIntact();
    return this.completeRoute(transactionId, "den.dig_upper_bypass", ready, this.digProgress);
  }

  applyDamage(transactionId: string, target: "fox", requestedDamage: number): PrologueWildlifeDamageResult {
    if (target !== "fox") throw new Error("N06 has exactly one generated wildlife binding: fox");
    if (!Number.isFinite(requestedDamage) || requestedDamage < 0) throw new RangeError("requestedDamage must be finite and non-negative");
    const base = this.featureDisabled(transactionId, "damage", { target, requestedDamage });
    return Object.freeze({ ...base, damageApplied: 0, deathCreated: false, externalLedgerRequired: true });
  }
  attemptDestroyDen(transactionId: string): PrologueWildlifeActionResult { return this.featureDisabled(transactionId, "destroy_den", {}); }

  returnToService(transactionId: string): PrologueWildlifeHandoffResult { return this.handoff(transactionId, "service", SERVICE_SCENE, SERVICE_FROM_DEN, true); }
  handoffToHighCistern(transactionId: string): PrologueWildlifeHandoffResult { return this.handoff(transactionId, "cistern", CISTERN_SCENE, CISTERN_FROM_DEN, this.snapshot().denRouteOpen); }

  resetToCheckpoint(transactionId: string): PrologueWildlifeActionResult { return this.reset(transactionId, "checkpoint_reset", false); }
  recoverSoftLock(transactionId: string): PrologueWildlifeActionResult { return this.reset(transactionId, "softlock_recovery", true); }
  recordSemanticAction(transactionId: string, actionId: "observe" | "retreat" | "wait_exit"): PrologueWildlifeActionResult {
    return this.transientOperation(transactionId, `semantic_${actionId}`, {}, () => undefined);
  }

  private atGeneratedPoint(point: readonly [number, number]): boolean { return this.lastPlayerPosition !== null && distance(this.lastPlayerPosition, { x: point[0], y: point[1] }) <= INTERACTION_RADIUS_TILES; }
  private foxClearOfDen(): boolean { return !inside(this.foxPosition, BINDING.denBoundsTiles); }

  private nonDigReady(): boolean {
    return !this.evidence.playerHarmOccurred && this.evidence.warningObservedWithoutHarm && this.evidence.realExitReached && this.evidence.currentOutsideWarningZone && this.evidence.currentEscapeLaneOpen && this.evidence.denIntactObserved && this.evidence.oldLatchOpened && this.foxDenIntact();
  }

  private completeRoute(transactionId: string, solutionId: PrologueWildlifeSolutionId, ready: boolean, extra: unknown = null): PrologueWildlifeActionResult {
    this.requireScene();
    const solution = SOLUTIONS[solutionId];
    const id = requiredId(transactionId, "transactionId");
    const hash = fingerprint("route", { solutionId, requiredActions: solution.requiredActions, requiredWorldPredicates: solution.requiredWorldPredicates, visitId: this.evidence.visitId, extra });
    const prior = classify(this.authoritativeSession, id, hash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (!ready) return this.result(false, false, "route_prerequisite_missing");
    const epoch = epochOf(this.authoritativeSession);
    const alreadyOpen = this.snapshot().denRouteOpen;
    const drafts: SessionEventDraft[] = [];
    if (!alreadyOpen) drafts.push(
      regionFlagDraft(`session.wildlife.e${epoch}.route.open.${id}`, PROLOGUE_WILDLIFE_REGION_FLAGS.denRouteOpen, true),
      regionFlagDraft(`session.wildlife.e${epoch}.route.solution.${id}`, PROLOGUE_WILDLIFE_REGION_FLAGS.routeSolutionId, solutionId),
      regionFlagDraft(`session.wildlife.e${epoch}.route.patch.${id}`, PROLOGUE_WILDLIFE_REGION_FLAGS.routePatchApplied, true),
    );
    drafts.push(receiptDraft(this.authoritativeSession, id, hash, epoch));
    const commit = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts });
    if (!commit.committed) return this.result(false, false, "session_rejected");
    this.authoritativeSession = commit.session;
    return this.result(true, alreadyOpen, alreadyOpen ? "duplicate" : "committed");
  }

  private deterrence(transactionId: string, kind: "noise" | "staff", apply: () => NonlethalWildlifeActionResult): PrologueWildlifeDeterrenceResult {
    this.requireScene();
    const id = requiredId(transactionId, "transactionId");
    const hash = fingerprint("deterrence", { kind, target: "wildlife.fox.den", visitId: this.evidence.visitId });
    const prior = classify(this.authoritativeSession, id, hash);
    if (prior === "conflict") return Object.freeze({ ...this.result(false, false, "transaction_conflict"), effect: null });
    if (prior === "duplicate") return Object.freeze({ ...this.result(true, true, "duplicate"), effect: null });
    const playerAtNoisePoint = this.lastPlayerPosition !== null && distance(this.lastPlayerPosition, { x: NOISE_POINT[0], y: NOISE_POINT[1] }) <= INTERACTION_RADIUS_TILES;
    const actionReady = kind === "noise" ? playerAtNoisePoint && this.evidence.currentOutsideWarningZone && this.evidence.currentEscapeLaneOpen : this.evidence.currentStaffDistanceSafe && this.evidence.currentPlayerRetreating;
    if (!actionReady) return Object.freeze({ ...this.result(false, false, "route_prerequisite_missing"), effect: null });
    const epoch = epochOf(this.authoritativeSession);
    const commit = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts: [receiptDraft(this.authoritativeSession, id, hash, epoch)] });
    if (!commit.committed) return Object.freeze({ ...this.result(false, false, "session_rejected"), effect: null });
    this.authoritativeSession = commit.session;
    const effect = apply();
    this.evidence = Object.freeze({ ...this.evidence, lowForceNoiseUsed: this.evidence.lowForceNoiseUsed || kind === "noise", lowForceStaffUsed: this.evidence.lowForceStaffUsed || kind === "staff" });
    return Object.freeze({ ...this.result(true, false, "committed"), effect });
  }

  private transientOperation(transactionId: string, kind: string, payload: unknown, apply: () => void): PrologueWildlifeActionResult {
    this.requireScene();
    const id = requiredId(transactionId, "transactionId");
    const hash = fingerprint(kind, { payload, visitId: this.evidence.visitId });
    const prior = classify(this.authoritativeSession, id, hash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    const commit = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts: [receiptDraft(this.authoritativeSession, id, hash, epochOf(this.authoritativeSession))] });
    if (!commit.committed) return this.result(false, false, "session_rejected");
    this.authoritativeSession = commit.session; apply();
    return this.result(true, false, "committed");
  }

  private featureDisabled(_transactionId: string, _kind: string, _payload: unknown): PrologueWildlifeActionResult {
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    return this.result(false, false, "feature_disabled");
  }

  private handoff(transactionId: string, kind: string, target: RuntimeSceneManifest, entry: RuntimeSceneEntranceManifest, ready: boolean): PrologueWildlifeHandoffResult {
    const id = requiredId(transactionId, "transactionId"); const hash = fingerprint(`handoff:${kind}`, { target: target.sceneId, entry: entry.id });
    const prior = classify(this.authoritativeSession, id, hash);
    if (prior === "conflict") return this.handoffResult(false, false, "transaction_conflict", false, target, entry, null);
    if (prior === "duplicate") {
      const atTarget = this.authoritativeSession.snapshot().world.currentSceneId === target.sceneId;
      return this.handoffResult(atTarget, atTarget, atTarget ? "duplicate" : "wrong_source_scene", atTarget, target, entry, atTarget ? this.authoritativeSession : null);
    }
    if (!this.inScene()) return this.handoffResult(false, false, "wrong_scene", false, target, entry, null);
    if (!ready) return this.handoffResult(false, false, "route_prerequisite_missing", false, target, entry, null);
    const state = this.authoritativeSession.snapshot(); const epoch = epochOf(this.authoritativeSession);
    const commit = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts: [
      { eventId: `session.wildlife.e${epoch}.handoff.${id}.${DEN_SCENE.sceneId}->${target.sceneId}`, type: "scene_entered", payload: { sceneId: target.sceneId } },
      { eventId: `session.wildlife.e${epoch}.handoff-checkpoint.${id}`, type: "checkpoint_set", payload: { checkpoint: checkpointFor(state, `checkpoint.${target.regionNodeId}.from-den`, target, entry) } },
      receiptDraft(this.authoritativeSession, id, hash, epoch),
    ] });
    if (!commit.committed) return this.handoffResult(false, false, "session_rejected", false, target, entry, null);
    this.authoritativeSession = commit.session;
    return this.handoffResult(true, false, "route_ready", true, target, entry, commit.session);
  }

  private handoffResult(accepted: boolean, duplicate: boolean, reason: PrologueWildlifeActionReason, ready: boolean, target: RuntimeSceneManifest, entry: RuntimeSceneEntranceManifest, session: GameSession | null): PrologueWildlifeHandoffResult {
    return Object.freeze({ ...this.result(accepted, duplicate, reason), ready, targetSceneId: target.sceneId, targetEntranceId: entry.id, session });
  }

  private reset(transactionId: string, kind: string, recovery: boolean): PrologueWildlifeActionResult {
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    const id = requiredId(transactionId, "transactionId"); const epoch = epochOf(this.authoritativeSession);
    const hash = fingerprint(kind, { epoch, maximumSeconds: recovery ? DEN_TASK.maximumSoftlockRecoverySeconds : null });
    const prior = classify(this.authoritativeSession, id, hash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    const state = this.authoritativeSession.snapshot();
    const drafts: SessionEventDraft[] = [
      { eventId: `session.wildlife.e${epoch}.area-reset.${id}`, type: "area_reset", payload: { areaId: DEN_SCENE.sceneId, respawnSceneId: DEN_SCENE.sceneId } },
      receiptDraft(this.authoritativeSession, id, hash, epoch),
    ];
    if (recovery) drafts.splice(1, 0, { eventId: `session.wildlife.e${epoch}.recovery-checkpoint.${id}`, type: "checkpoint_set", payload: { checkpoint: checkpointFor(state, "checkpoint.valley.den_bypass.recovery", DEN_SCENE, DEN_FROM_SERVICE) } });
    const commit = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts });
    if (!commit.committed) return this.result(false, false, "session_rejected");
    this.authoritativeSession = commit.session;
    this.fox = this.freshFox(); this.foxPosition = Object.freeze({ x: BINDING.spawnPositionTiles[0], y: BINDING.spawnPositionTiles[1] }); this.previousFoxPosition = this.foxPosition;
    this.evidence = blankEvidence(this.visitId(), this.foxDenIntact()); this.lastPlayerPosition = null; this.digProgress = Object.freeze({ upperLineMarked: false, upperBypassClear: false, bracesInstalled: false, slumpBelowLimit: false });
    return this.result(true, false, "committed");
  }

  private freshFox(): WildlifeStateMachine {
    return new WildlifeStateMachine("fox", { regionSaveId: this.authoritativeSession.sessionId, spawnGeneration: epochOf(this.authoritativeSession), spawnSequence: 0 });
  }
  private visitId(): string { return `${DEN_SCENE.sceneId}@${epochOf(this.authoritativeSession)}`; }
  private foxDenIntact(): boolean { return regionValue(this.authoritativeSession.snapshot(), PROLOGUE_WILDLIFE_REGION_FLAGS.foxDenIntact) !== false; }
  private inScene(): boolean { return this.authoritativeSession.snapshot().world.currentSceneId === DEN_SCENE.sceneId; }
  private requireScene(): void { if (!this.inScene()) throw new Error("wildlife action requires N06"); }
  private result(accepted: boolean, duplicate: boolean, reason: PrologueWildlifeActionReason): PrologueWildlifeActionResult { return Object.freeze({ accepted, duplicate, reason, snapshot: this.snapshot() }); }
}

export const createPrologueWildlifeInitialSession = (options: Readonly<{ sessionId: string; currentMp?: number }>): GameSession => {
  const maxMp = 24;
  if (options.currentMp !== undefined && (!Number.isFinite(options.currentMp) || options.currentMp < 0 || options.currentMp > maxMp)) throw new RangeError("currentMp must be within 0..24");
  return GameSession.create({
    sessionId: requiredId(options.sessionId, "sessionId"),
    mp: { currentMp: options.currentMp ?? maxMp, maxMp, worldVersion: 0 },
    currentSceneId: DEN_SCENE.sceneId,
    checkpoint: { id: PROLOGUE_WILDLIFE_CHECKPOINT_ID, sceneId: DEN_SCENE.sceneId, position: { ...DEN_FROM_SERVICE.spawnPx }, revision: 0 },
  });
};
