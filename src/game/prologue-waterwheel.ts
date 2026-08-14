import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeSceneManifestIndex,
  type RuntimeSceneEntranceManifest,
  type RuntimeSceneManifest,
} from "../content/runtime-scene-manifest";
import {
  readRuntimeInfrastructureTaskManifestIndex,
  type RuntimeInfrastructureTaskManifest,
  type RuntimeInfrastructureTaskSolutionManifest,
} from "../content/runtime-task-manifest";
import {
  reduceLearningEvidence,
  type LearningEvidenceEvent,
  type PromptLevel,
} from "../learning/progression";
import {
  commitSessionProposal,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionReceiptDomain,
  type WorldFlagValue,
} from "../session/game-session";
import {
  GameSessionRuntimeBridge,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import type { SceneDefinition } from "../runtime/scene";
import {
  WATERWHEEL_STABLE_TICKS_REQUIRED,
  advanceWaterwheelPhysicalProgress,
  serviceSolutionWorldReady,
  waterwheelPhysicsReady,
  waterwheelSolutionWorldReady,
  type ServiceSolutionWorldState,
  type WaterwheelPhysicalObservation,
  type WaterwheelPhysicalProgress,
  type WaterwheelSolutionWorldState,
} from "./infrastructure-predicates";

const SCENE_INDEX = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const TASK_INDEX = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);

const requireOne = <T>(values: readonly T[], predicate: (value: T) => boolean, label: string): T => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) throw new Error(`expected one ${label}, received ${matches.length}`);
  return matches[0]!;
};

const manifestByNode = (regionNodeId: string): RuntimeSceneManifest => requireOne(
  Object.values(SCENE_INDEX.byId),
  (scene) => scene.regionNodeId === regionNodeId,
  `generated scene for ${regionNodeId}`,
);

const WATERWHEEL_SCENE = manifestByNode("valley.waterwheel");
const SERVICE_SCENE = manifestByNode("valley.service_channel");
const WATERWHEEL_ENTRY = requireOne(
  WATERWHEEL_SCENE.entrances,
  (entrance) => entrance.id === WATERWHEEL_SCENE.recovery.entryEntranceId,
  "waterwheel recovery entrance",
);
const SERVICE_ENTRY = requireOne(
  SERVICE_SCENE.entrances,
  (entrance) => entrance.id === SERVICE_SCENE.recovery.entryEntranceId,
  "service-channel recovery entrance",
);
const WATERWHEEL_INBOUND_FROM_SETTLEMENT = requireOne(
  WATERWHEEL_SCENE.inboundRoutes,
  (route) => route.entranceId === WATERWHEEL_ENTRY.id,
  "settlement-to-waterwheel inbound route",
);
const SERVICE_INBOUND_FROM_WATERWHEEL = requireOne(
  SERVICE_SCENE.inboundRoutes,
  (route) => route.entranceId === SERVICE_ENTRY.id,
  "waterwheel-to-service inbound route",
);
const WATERWHEEL_EXIT_TO_SETTLEMENT = requireOne(
  WATERWHEEL_SCENE.exits,
  (exit) => exit.id === "waterwheel.to_settlement" && exit.target.kind === "scene",
  "waterwheel-to-settlement exit",
);
if (WATERWHEEL_EXIT_TO_SETTLEMENT.target.kind !== "scene") {
  throw new Error("waterwheel-to-settlement exit must target a scene");
}
const SETTLEMENT_SCENE = SCENE_INDEX.byId[WATERWHEEL_EXIT_TO_SETTLEMENT.target.sceneId];
if (!SETTLEMENT_SCENE) throw new Error("waterwheel return target scene is absent from generated content");
const SETTLEMENT_RETURN_ENTRANCE = requireOne(
  SETTLEMENT_SCENE.entrances,
  (entrance) => entrance.id === (WATERWHEEL_EXIT_TO_SETTLEMENT.target as Readonly<{ kind: "scene"; sceneId: string; entranceId: string }>).entranceId,
  "settlement return entrance",
);
const toRuntimeScene = (manifest: RuntimeSceneManifest): SceneDefinition => Object.freeze({
  id: manifest.sceneId,
  collisionRows: manifest.collisionRows,
  defaultEntranceId: manifest.recovery.entryEntranceId,
  entrances: Object.freeze(manifest.entrances.map((entrance) => Object.freeze({
    id: entrance.id,
    position: Object.freeze({ ...entrance.spawnPx }),
  }))),
  exits: Object.freeze([]),
});
const INFRASTRUCTURE_RUNTIME_SCENES = Object.freeze(
  Object.values(SCENE_INDEX.byId).map(toRuntimeScene),
);

const taskForScene = (scene: RuntimeSceneManifest): RuntimeInfrastructureTaskManifest => {
  const reference = requireOne(scene.taskRefs, () => true, `${scene.sceneId} task reference`);
  const task = TASK_INDEX.byId[reference.id];
  if (!task || task.sourcePath !== reference.authoritativeTaskSourcePath || task.sceneId !== scene.sceneId ||
      task.regionId !== scene.regionId || task.regionNodeId !== scene.regionNodeId) {
    throw new Error(`${scene.sceneId} generated task reference does not resolve to its authoritative task`);
  }
  return task;
};

const WATERWHEEL_TASK = taskForScene(WATERWHEEL_SCENE);
const SERVICE_TASK = taskForScene(SERVICE_SCENE);

const STOPPED_MODE = requireOne(
  WATERWHEEL_TASK.modes,
  (mode) => !mode.completionValid,
  "stopped waterwheel mode",
);
const TEMPORARY_MODE = requireOne(
  WATERWHEEL_TASK.modes,
  (mode) => mode.completionValid && !mode.persistsAcrossReload,
  "temporary waterwheel mode",
);
const STRUCTURAL_MODE = requireOne(
  WATERWHEEL_TASK.modes,
  (mode) => mode.completionValid && mode.persistsAcrossReload,
  "structural waterwheel mode",
);

const WATERWHEEL_NON_MAGIC_SOLUTIONS = WATERWHEEL_TASK.solutions.filter(
  (solution) => solution.routeKind === "non_magic" && solution.mainline,
);
const SERVICE_NON_MAGIC_SOLUTIONS = SERVICE_TASK.solutions.filter(
  (solution) => solution.routeKind === "non_magic" && solution.mainline,
);
if (WATERWHEEL_NON_MAGIC_SOLUTIONS.length < 4 || SERVICE_NON_MAGIC_SOLUTIONS.length < 2) {
  throw new Error("generated infrastructure content does not provide the required non-magic route diversity");
}
if (WATERWHEEL_TASK.maximumSoftlockRecoverySeconds > 60 ||
    SERVICE_TASK.maximumSoftlockRecoverySeconds > 60) {
  throw new Error("infrastructure recovery must be available within 60 seconds");
}
if (WATERWHEEL_SCENE.sizeTiles.width !== 30 || WATERWHEEL_SCENE.sizeTiles.height !== 32 ||
    SERVICE_SCENE.sizeTiles.width !== 28 || SERVICE_SCENE.sizeTiles.height !== 40) {
  throw new Error("generated N03/N04 dimensions do not match the playable slice contract");
}

const WATERWHEEL_TAWA_EXPOSURE = requireOne(
  WATERWHEEL_TASK.languageExposure,
  (exposure) => exposure.wordId === "word.tawa" && exposure.automaticMasteryForbidden,
  "waterwheel tawa language exposure",
);
const SERVICE_TAWA_EXPOSURE = requireOne(
  SERVICE_TASK.languageExposure,
  (exposure) => exposure.wordId === WATERWHEEL_TAWA_EXPOSURE.wordId && exposure.automaticMasteryForbidden,
  "service-channel tawa language exposure",
);
if (!WATERWHEEL_TAWA_EXPOSURE.toolSolutionStillAllowsObservation ||
    !SERVICE_TAWA_EXPOSURE.toolSolutionStillAllowsObservation) {
  throw new Error("tawa must remain observable on tool routes without granting tool-bypass evidence");
}
const TAWA_WORD_ID = WATERWHEEL_TAWA_EXPOSURE.wordId.replace(/^word\./, "");
const O_CONTACT = requireOne(
  SERVICE_TASK.grammarContacts,
  (contact) => contact.token === "o" && !contact.automaticStateGrant && !contact.masteryEvidenceAllowed,
  "receptive o grammar contact",
);

const WATERWHEEL_MOTION_INTERACTION = requireOne(
  WATERWHEEL_SCENE.interactions,
  (interaction) => interaction.optionalWordId === "word.tawa" && interaction.verb === "observe_motion",
  "waterwheel tawa observation",
);
const SERVICE_MOTION_INTERACTION = requireOne(
  SERVICE_SCENE.interactions,
  (interaction) => interaction.optionalWordId === "word.tawa" && interaction.verb === "observe_motion",
  "service-channel tawa observation",
);
const O_SIGN_INTERACTION = requireOne(
  SERVICE_SCENE.interactions,
  (interaction) => interaction.verb === "read_receptively",
  "service-channel receptive instruction",
);

export const PROLOGUE_WATERWHEEL_SCENE_ID = WATERWHEEL_SCENE.sceneId;
export const PROLOGUE_SERVICE_CHANNEL_SCENE_ID = SERVICE_SCENE.sceneId;
export const PROLOGUE_INFRASTRUCTURE_REGION_ID = WATERWHEEL_SCENE.regionId;
export const PROLOGUE_WATERWHEEL_TASK_ID = WATERWHEEL_TASK.id;
export const PROLOGUE_SERVICE_CHANNEL_TASK_ID = SERVICE_TASK.id;
export const PROLOGUE_WATERWHEEL_SOLUTION_IDS = Object.freeze(
  WATERWHEEL_TASK.solutions.map((solution) => solution.id),
);
export const PROLOGUE_SERVICE_SOLUTION_IDS = Object.freeze(
  SERVICE_TASK.solutions.map((solution) => solution.id),
);

export const PROLOGUE_INFRASTRUCTURE_REGION_FLAGS = Object.freeze({
  waterwheelStable: "waterwheel_stable",
  downstreamSafe: "downstream_safe",
  maintenanceAccessOpen: "maintenance_access_open",
  waterwheelRestored: "waterwheel_restored",
  waterwheelResultMode: "waterwheel_result_mode",
  waterwheelSolutionId: "waterwheel_solution_id",
  serviceChannelEntryCrossed: "service_channel_entry_crossed",
  serviceChannelReached: "service_channel_reached",
  serviceGateOpen: "service_gate_open",
  serviceBypassOpen: "service_bypass_open",
  serviceResultMode: "service_result_mode",
  serviceSolutionId: "service_solution_id",
  grammarOSeen: "grammar_o_seen",
  grammarOReceptiveAccepted: "grammar_o_receptive_accepted",
} as const);

const PHYSICS_AREA_FLAGS = Object.freeze({
  stableTicks: "waterwheel.physics.stable_ticks",
  lastRpm: "waterwheel.physics.last_rpm",
  downstreamSafe: "waterwheel.physics.downstream_safe",
} as const);

export type InfrastructureMode = "waterwheel" | "service_channel";
export type WaterwheelActiveMode = "stopped" | "temporary_driven" | "structurally_restored";
export type InfrastructureActionReason =
  | "committed"
  | "duplicate"
  | "wrong_scene"
  | "wrong_source_scene"
  | "entry_guard_failed"
  | "unknown_solution"
  | "prerequisite_missing"
  | "unstable_physics"
  | "already_completed"
  | "transaction_conflict"
  | "ineligible_evidence"
  | "tool_bypass_no_evidence"
  | "session_rejected";

export interface InfrastructureActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: InfrastructureActionReason;
  readonly snapshot: PrologueWaterwheelSnapshot;
}

export interface InfrastructureLanguageActionResult extends InfrastructureActionResult {
  readonly evidenceGranted: boolean;
}

export interface PrologueWaterwheelEntryResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: InfrastructureActionReason;
  readonly entryMode: "direct_transition" | "adopted_runtime_transition" | null;
  readonly infrastructure: PrologueWaterwheelSession | null;
}

export interface PrologueWaterwheelSettlementReturnResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: InfrastructureActionReason;
  readonly session: GameSession | null;
}

export interface WaterwheelSolutionEvidence {
  readonly completedActionIds: readonly string[];
  readonly world: WaterwheelSolutionWorldState;
}

export interface ServiceSolutionEvidence {
  readonly completedActionIds: readonly string[];
  readonly world: ServiceSolutionWorldState;
}

export interface TawaGroundingAttempt {
  readonly solutionId: string;
  readonly promptLevel: PromptLevel;
  readonly predictedMotionCorrect: boolean;
  readonly worldOutcomeContribution: boolean;
  readonly toolBypass: boolean;
  readonly answerVisible?: boolean;
}

export interface PrologueWaterwheelSnapshot {
  readonly mode: InfrastructureMode;
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly sceneManifestId: string;
  readonly taskId: string;
  readonly waterwheel: Readonly<{
    activeMode: WaterwheelActiveMode;
    persistedResultMode: string | null;
    stableTicks: number;
    requiredStableTicks: typeof WATERWHEEL_STABLE_TICKS_REQUIRED;
    lastAngularVelocityRpm: number;
    downstreamSafe: boolean;
    physicsReady: boolean;
    structurallyRestored: boolean;
    solutionIds: readonly string[];
  }>;
  readonly serviceChannel: Readonly<{
    resultMode: string | null;
    routeOpen: boolean;
    solutionIds: readonly string[];
    nonMagicSolutionIds: readonly string[];
    cisternReady: boolean;
  }>;
  readonly language: Readonly<{
    tawaDiscoveryState: "unknown" | "discovered";
    tawaAttunementState: "locked" | "attuned";
    tawaLearningState: string | null;
    grammarOSeen: boolean;
    grammarOReceptiveAccepted: boolean;
    grammarOMastered: false;
  }>;
  readonly softLockRecovery: Readonly<{
    maximumSeconds: number;
    actions: readonly string[];
  }>;
  readonly killCount: 0;
}

const requiredId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
};

const operationFingerprint = (kind: string, payload: unknown): string =>
  `infrastructure:${kind}:${JSON.stringify(canonicalize(payload))}`;
const operationReceiptId = (sessionId: string, transactionId: string): string =>
  `world:${sessionId}:infrastructure-operation:${transactionId}`;

const classifyOperation = (
  session: GameSession,
  transactionId: string,
  fingerprint: string,
): "absent" | "duplicate" | "conflict" => {
  const prior = session.snapshot().receiptIndex[operationReceiptId(session.sessionId, transactionId)];
  if (!prior) return "absent";
  return prior.domain === "world" && prior.payloadHash === fingerprint ? "duplicate" : "conflict";
};

const receiptDraft = (
  eventId: string,
  receiptId: string,
  domain: SessionReceiptDomain,
  payloadHash: string,
): SessionEventDraft => ({
  eventId,
  type: "receipt_recorded",
  payload: { receiptId, domain, payloadHash },
});

const operationReceiptDraft = (
  sessionId: string,
  transactionId: string,
  fingerprint: string,
): SessionEventDraft => receiptDraft(
  `session.infrastructure.operation.${transactionId}`,
  operationReceiptId(sessionId, transactionId),
  "world",
  fingerprint,
);

const regionFlagDraft = (
  eventId: string,
  flagId: string,
  value: WorldFlagValue,
): SessionEventDraft => ({
  eventId,
  type: "world_flag_set",
  payload: { flagId, value, scope: "region", regionId: PROLOGUE_INFRASTRUCTURE_REGION_ID },
});

const areaFlagDraft = (
  eventId: string,
  areaId: string,
  flagId: string,
  value: WorldFlagValue,
): SessionEventDraft => ({
  eventId,
  type: "world_flag_set",
  payload: { flagId, value, scope: "area", areaId },
});

const regionValue = (state: GameSessionState, flagId: string): WorldFlagValue | undefined =>
  Object.values(state.world.flags).find((flag) =>
    flag.scope === "region" && flag.regionId === PROLOGUE_INFRASTRUCTURE_REGION_ID && flag.flagId === flagId
  )?.value;
const regionTrue = (state: GameSessionState, flagId: string): boolean => regionValue(state, flagId) === true;
const areaValue = (state: GameSessionState, areaId: string, flagId: string): WorldFlagValue | undefined =>
  Object.values(state.world.flags).find((flag) =>
    flag.scope === "area" && flag.areaId === areaId && flag.flagId === flagId
  )?.value;

const currentPhysics = (state: GameSessionState): WaterwheelPhysicalProgress => ({
  stableTicks: Number(areaValue(state, WATERWHEEL_SCENE.sceneId, PHYSICS_AREA_FLAGS.stableTicks) ?? 0),
  lastAngularVelocityRpm: Number(areaValue(state, WATERWHEEL_SCENE.sceneId, PHYSICS_AREA_FLAGS.lastRpm) ?? 0),
  downstreamSafe: areaValue(state, WATERWHEEL_SCENE.sceneId, PHYSICS_AREA_FLAGS.downstreamSafe) === true,
});

const allRequiredActionsPresent = (
  solution: RuntimeInfrastructureTaskSolutionManifest,
  completedActionIds: readonly string[],
): boolean => {
  const completed = new Set(completedActionIds);
  return solution.requiredActions.every((actionId) => completed.has(actionId));
};

const checkpointForEntrance = (
  state: GameSessionState,
  id: string,
  scene: RuntimeSceneManifest,
  entrance: RuntimeSceneEntranceManifest,
) => ({
  id,
  sceneId: scene.sceneId,
  position: { ...entrance.spawnPx },
  revision: state.checkpoint.revision + 1,
});

/**
 * Headless N03/N04 gameplay coordinator. GameSession is the sole persisted
 * aggregate; temporary wheel drive is intentionally ephemeral.
 */
export class PrologueWaterwheelSession {
  private authoritativeSession: GameSession;
  private bridge!: GameSessionRuntimeBridge;
  private temporaryWaterwheelActive = false;

  constructor(session: GameSession) {
    const sceneId = session.snapshot().world.currentSceneId;
    if (sceneId !== WATERWHEEL_SCENE.sceneId && sceneId !== SERVICE_SCENE.sceneId) {
      throw new Error("infrastructure session requires the generated N03 or N04 scene");
    }
    this.authoritativeSession = session;
    this.rebuildBridge();
  }

  static enterFromSettlement(session: GameSession, transactionId: string): PrologueWaterwheelEntryResult {
    return this.commitWaterwheelEntry(session, transactionId, "direct_transition");
  }

  static adoptRuntimeEntry(session: GameSession, transactionId: string): PrologueWaterwheelEntryResult {
    return this.commitWaterwheelEntry(session, transactionId, "adopted_runtime_transition");
  }

  private static commitWaterwheelEntry(
    session: GameSession,
    transactionId: string,
    mode: "direct_transition" | "adopted_runtime_transition",
  ): PrologueWaterwheelEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const fingerprint = operationFingerprint("waterwheel_entry", {
      mode,
      sourceSceneId: WATERWHEEL_INBOUND_FROM_SETTLEMENT.sourceSceneId,
      sourceExitId: WATERWHEEL_INBOUND_FROM_SETTLEMENT.sourceExitId,
      targetSceneId: WATERWHEEL_SCENE.sceneId,
      targetEntranceId: WATERWHEEL_ENTRY.id,
    });
    const prior = classifyOperation(session, id, fingerprint);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") {
      return session.snapshot().world.currentSceneId === WATERWHEEL_SCENE.sceneId
        ? this.entryResult(true, true, "duplicate", mode, new PrologueWaterwheelSession(session))
        : this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    const state = session.snapshot();
    if (!regionTrue(state, "settlement_reached")) {
      return this.entryResult(false, false, "entry_guard_failed", null, null);
    }
    if (mode === "direct_transition" &&
        state.world.currentSceneId !== WATERWHEEL_INBOUND_FROM_SETTLEMENT.sourceSceneId) {
      return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    if (mode === "adopted_runtime_transition") {
      const suffix = `${WATERWHEEL_INBOUND_FROM_SETTLEMENT.sourceSceneId}->${WATERWHEEL_SCENE.sceneId}`;
      const canonicalHandoff = state.world.currentSceneId === WATERWHEEL_SCENE.sceneId &&
        [...session.events()].reverse().some((event) =>
          event.type === "scene_entered" && event.payload.sceneId === WATERWHEEL_SCENE.sceneId &&
          event.eventId.endsWith(suffix)
        );
      if (!canonicalHandoff) return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    const drafts: SessionEventDraft[] = [];
    if (mode === "direct_transition") {
      drafts.push({
        eventId: `session.infrastructure.waterwheel.entry.scene.${id}`,
        type: "scene_entered",
        payload: { sceneId: WATERWHEEL_SCENE.sceneId },
      });
    }
    drafts.push(
      {
        eventId: `session.infrastructure.waterwheel.entry.checkpoint.${id}`,
        type: "checkpoint_set",
        payload: { checkpoint: checkpointForEntrance(
          state,
          "checkpoint.valley.waterwheel.entry",
          WATERWHEEL_SCENE,
          WATERWHEEL_ENTRY,
        ) },
      },
      regionFlagDraft(`session.infrastructure.waterwheel.entry.flag.${id}`, "waterwheel_entry_crossed", true),
      operationReceiptDraft(session.sessionId, id, fingerprint),
    );
    const commit = commitSessionProposal(session, { transactionId: id, drafts });
    if (!commit.committed) return this.entryResult(false, false, "session_rejected", null, null);
    return this.entryResult(
      true,
      false,
      "committed",
      mode,
      new PrologueWaterwheelSession(commit.session),
    );
  }

  private static entryResult(
    accepted: boolean,
    duplicate: boolean,
    reason: InfrastructureActionReason,
    entryMode: PrologueWaterwheelEntryResult["entryMode"],
    infrastructure: PrologueWaterwheelSession | null,
  ): PrologueWaterwheelEntryResult {
    return Object.freeze({ accepted, duplicate, reason, entryMode, infrastructure });
  }

  static fromSave(candidate: unknown): PrologueWaterwheelSession {
    // The ephemeral temporary-driven state is intentionally not reconstructed.
    return new PrologueWaterwheelSession(GameSession.fromSave(candidate));
  }

  get session(): GameSession {
    return this.authoritativeSession;
  }

  toSave(): GameSessionSave {
    return this.authoritativeSession.toSave();
  }

  snapshot(): PrologueWaterwheelSnapshot {
    const session = this.authoritativeSession.snapshot();
    const inWaterwheel = session.world.currentSceneId === WATERWHEEL_SCENE.sceneId;
    const physics = currentPhysics(session);
    const structural = regionTrue(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelRestored);
    const persistedResultMode = regionValue(
      session,
      PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelResultMode,
    );
    const serviceResultMode = regionValue(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceResultMode);
    const serviceOpen = regionTrue(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceGateOpen) ||
      regionTrue(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceBypassOpen);
    const tawa = session.learning.words[TAWA_WORD_ID];
    const scene = inWaterwheel ? WATERWHEEL_SCENE : SERVICE_SCENE;
    const task = inWaterwheel ? WATERWHEEL_TASK : SERVICE_TASK;
    return Object.freeze({
      mode: inWaterwheel ? "waterwheel" : "service_channel",
      session,
      runtime: this.bridge.runtime.snapshot(),
      sceneManifestId: scene.sceneId,
      taskId: task.id,
      waterwheel: Object.freeze({
        activeMode: structural
          ? STRUCTURAL_MODE.id as WaterwheelActiveMode
          : this.temporaryWaterwheelActive
            ? TEMPORARY_MODE.id as WaterwheelActiveMode
            : STOPPED_MODE.id as WaterwheelActiveMode,
        persistedResultMode: typeof persistedResultMode === "string" ? persistedResultMode : null,
        stableTicks: physics.stableTicks,
        requiredStableTicks: WATERWHEEL_STABLE_TICKS_REQUIRED,
        lastAngularVelocityRpm: physics.lastAngularVelocityRpm,
        downstreamSafe: physics.downstreamSafe,
        physicsReady: waterwheelPhysicsReady(physics),
        structurallyRestored: structural,
        solutionIds: PROLOGUE_WATERWHEEL_SOLUTION_IDS,
      }),
      serviceChannel: Object.freeze({
        resultMode: typeof serviceResultMode === "string" ? serviceResultMode : null,
        routeOpen: serviceOpen,
        solutionIds: PROLOGUE_SERVICE_SOLUTION_IDS,
        nonMagicSolutionIds: Object.freeze(SERVICE_NON_MAGIC_SOLUTIONS.map((solution) => solution.id)),
        cisternReady: serviceOpen,
      }),
      language: Object.freeze({
        tawaDiscoveryState: tawa?.discoveryState ?? "unknown",
        tawaAttunementState: tawa?.attunementState ?? "locked",
        tawaLearningState: tawa?.learningState ?? null,
        grammarOSeen: regionTrue(session, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.grammarOSeen),
        grammarOReceptiveAccepted: regionTrue(
          session,
          PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.grammarOReceptiveAccepted,
        ),
        grammarOMastered: false,
      }),
      softLockRecovery: Object.freeze({
        maximumSeconds: task.maximumSoftlockRecoverySeconds,
        actions: task.recoveryActions,
      }),
      killCount: 0,
    });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueWaterwheelSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    this.bridge.advanceTicks(ticks, input);
    this.authoritativeSession = this.bridge.session;
    return this.snapshot();
  }

  observeWaterwheelPhysics(
    transactionId: string,
    observation: WaterwheelPhysicalObservation,
  ): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(WATERWHEEL_SCENE)) return this.result(false, false, "wrong_scene");
    const fingerprint = operationFingerprint("waterwheel_physics", observation);
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const next = advanceWaterwheelPhysicalProgress(
      currentPhysics(this.authoritativeSession.snapshot()),
      observation,
    );
    return this.commit({
      transactionId: id,
      drafts: [
        areaFlagDraft(
          `session.infrastructure.waterwheel.physics.ticks.${id}`,
          WATERWHEEL_SCENE.sceneId,
          PHYSICS_AREA_FLAGS.stableTicks,
          next.stableTicks,
        ),
        areaFlagDraft(
          `session.infrastructure.waterwheel.physics.rpm.${id}`,
          WATERWHEEL_SCENE.sceneId,
          PHYSICS_AREA_FLAGS.lastRpm,
          next.lastAngularVelocityRpm,
        ),
        areaFlagDraft(
          `session.infrastructure.waterwheel.physics.downstream.${id}`,
          WATERWHEEL_SCENE.sceneId,
          PHYSICS_AREA_FLAGS.downstreamSafe,
          next.downstreamSafe,
        ),
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
  }

  completeWaterwheelSolution(
    transactionId: string,
    solutionId: string,
    evidence: WaterwheelSolutionEvidence,
  ): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    const normalizedSolutionId = requiredId(solutionId, "solutionId");
    if (!this.inScene(WATERWHEEL_SCENE)) return this.result(false, false, "wrong_scene");
    const normalizedActions = [...new Set(evidence.completedActionIds)].sort();
    const fingerprint = operationFingerprint("waterwheel_solution", {
      solutionId: normalizedSolutionId,
      completedActionIds: normalizedActions,
      world: evidence.world,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const solution = WATERWHEEL_TASK.solutions.find((candidate) => candidate.id === normalizedSolutionId);
    if (!solution) return this.result(false, false, "unknown_solution");
    if (!allRequiredActionsPresent(solution, normalizedActions) ||
        !waterwheelSolutionWorldReady(solution.id, evidence.world)) {
      return this.result(false, false, "prerequisite_missing");
    }
    const state = this.authoritativeSession.snapshot();
    if (!waterwheelPhysicsReady(currentPhysics(state))) {
      return this.result(false, false, "unstable_physics");
    }
    if (regionTrue(state, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelRestored) &&
        solution.resultMode !== STRUCTURAL_MODE.id) {
      return this.result(true, true, "already_completed");
    }
    const drafts: SessionEventDraft[] = [
      regionFlagDraft(
        `session.infrastructure.waterwheel.stable.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelStable,
        true,
      ),
      regionFlagDraft(
        `session.infrastructure.waterwheel.downstream.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.downstreamSafe,
        true,
      ),
      regionFlagDraft(
        `session.infrastructure.waterwheel.access.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.maintenanceAccessOpen,
        true,
      ),
      regionFlagDraft(
        `session.infrastructure.waterwheel.mode.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelResultMode,
        solution.resultMode,
      ),
      regionFlagDraft(
        `session.infrastructure.waterwheel.solution.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelSolutionId,
        solution.id,
      ),
    ];
    if (solution.resultMode === STRUCTURAL_MODE.id) {
      drafts.push(regionFlagDraft(
        `session.infrastructure.waterwheel.restored.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelRestored,
        true,
      ));
      if (STRUCTURAL_MODE.patchRecordRef) {
        drafts.push(regionFlagDraft(
          `session.infrastructure.waterwheel.patch.${id}`,
          `material_patch:${STRUCTURAL_MODE.patchRecordRef}`,
          true,
        ));
      }
    }
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint));
    const result = this.commit({ transactionId: id, drafts });
    if (result.accepted && !result.duplicate && solution.resultMode === TEMPORARY_MODE.id) {
      this.temporaryWaterwheelActive = true;
    }
    return this.result(result.accepted, result.duplicate, result.reason);
  }

  enterServiceChannel(transactionId: string): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(WATERWHEEL_SCENE)) return this.result(false, false, "wrong_scene");
    const fingerprint = operationFingerprint("service_entry", {
      sourceSceneId: SERVICE_INBOUND_FROM_WATERWHEEL.sourceSceneId,
      sourceExitId: SERVICE_INBOUND_FROM_WATERWHEEL.sourceExitId,
      targetSceneId: SERVICE_SCENE.sceneId,
      targetEntranceId: SERVICE_ENTRY.id,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    const exitReady = regionTrue(state, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelStable) &&
      regionTrue(state, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.downstreamSafe) &&
      (regionTrue(state, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.waterwheelRestored) ||
        regionTrue(state, PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.maintenanceAccessOpen));
    if (!exitReady) return this.result(false, false, "entry_guard_failed");
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.infrastructure.service.entry.scene.${id}`,
          type: "scene_entered",
          payload: { sceneId: SERVICE_SCENE.sceneId },
        },
        {
          eventId: `session.infrastructure.service.entry.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint: checkpointForEntrance(
            state,
            "checkpoint.valley.service_channel.entry",
            SERVICE_SCENE,
            SERVICE_ENTRY,
          ) },
        },
        regionFlagDraft(
          `session.infrastructure.service.entry.flag.${id}`,
          PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceChannelEntryCrossed,
          true,
        ),
        regionFlagDraft(
          `session.infrastructure.service.entry.reached.${id}`,
          PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceChannelReached,
          true,
        ),
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
  }

  returnToWaterwheel(transactionId: string): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(SERVICE_SCENE)) return this.result(false, false, "wrong_scene");
    const entrance = requireOne(
      WATERWHEEL_SCENE.entrances,
      (candidate) => candidate.id === "waterwheel.from_service",
      "waterwheel return entrance",
    );
    const fingerprint = operationFingerprint("waterwheel_return", {
      sourceSceneId: SERVICE_SCENE.sceneId,
      targetSceneId: WATERWHEEL_SCENE.sceneId,
      targetEntranceId: entrance.id,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    const result = this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.infrastructure.waterwheel.return.scene.${id}`,
          type: "scene_entered",
          payload: { sceneId: WATERWHEEL_SCENE.sceneId },
        },
        {
          eventId: `session.infrastructure.waterwheel.return.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint: checkpointForEntrance(
            state,
            "checkpoint.valley.waterwheel.return",
            WATERWHEEL_SCENE,
            entrance,
          ) },
        },
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
    if (result.accepted && !result.duplicate) this.temporaryWaterwheelActive = false;
    return this.result(result.accepted, result.duplicate, result.reason);
  }

  returnToSettlement(transactionId: string): PrologueWaterwheelSettlementReturnResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(WATERWHEEL_SCENE)) {
      return Object.freeze({ accepted: false, duplicate: false, reason: "wrong_scene", session: null });
    }
    const fingerprint = operationFingerprint("settlement_return", {
      sourceSceneId: WATERWHEEL_SCENE.sceneId,
      sourceExitId: WATERWHEEL_EXIT_TO_SETTLEMENT.id,
      targetSceneId: SETTLEMENT_SCENE.sceneId,
      targetEntranceId: SETTLEMENT_RETURN_ENTRANCE.id,
    });
    const prior = classifyOperation(this.authoritativeSession, id, fingerprint);
    if (prior === "conflict") {
      return Object.freeze({ accepted: false, duplicate: false, reason: "transaction_conflict", session: null });
    }
    if (prior === "duplicate") {
      const atSettlement = this.authoritativeSession.snapshot().world.currentSceneId === SETTLEMENT_SCENE.sceneId;
      return Object.freeze({
        accepted: atSettlement,
        duplicate: atSettlement,
        reason: atSettlement ? "duplicate" : "wrong_source_scene",
        session: atSettlement ? this.authoritativeSession : null,
      });
    }
    const state = this.authoritativeSession.snapshot();
    const commit = commitSessionProposal(this.authoritativeSession, {
      transactionId: id,
      drafts: [
        {
          eventId: `session.infrastructure.settlement.return.scene.${id}`,
          type: "scene_entered",
          payload: { sceneId: SETTLEMENT_SCENE.sceneId },
        },
        {
          eventId: `session.infrastructure.settlement.return.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint: checkpointForEntrance(
            state,
            "checkpoint.valley.settlement.return",
            SETTLEMENT_SCENE,
            SETTLEMENT_RETURN_ENTRANCE,
          ) },
        },
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
    if (!commit.committed) {
      return Object.freeze({ accepted: false, duplicate: false, reason: "session_rejected", session: null });
    }
    this.authoritativeSession = commit.session;
    return Object.freeze({ accepted: true, duplicate: false, reason: "committed", session: commit.session });
  }

  completeServiceSolution(
    transactionId: string,
    solutionId: string,
    evidence: ServiceSolutionEvidence,
  ): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    const normalizedSolutionId = requiredId(solutionId, "solutionId");
    if (!this.inScene(SERVICE_SCENE)) return this.result(false, false, "wrong_scene");
    const normalizedActions = [...new Set(evidence.completedActionIds)].sort();
    const fingerprint = operationFingerprint("service_solution", {
      solutionId: normalizedSolutionId,
      completedActionIds: normalizedActions,
      world: evidence.world,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const solution = SERVICE_TASK.solutions.find((candidate) => candidate.id === normalizedSolutionId);
    if (!solution) return this.result(false, false, "unknown_solution");
    if (!allRequiredActionsPresent(solution, normalizedActions) ||
        !serviceSolutionWorldReady(solution.id, evidence.world)) {
      return this.result(false, false, "prerequisite_missing");
    }
    if (this.snapshot().serviceChannel.routeOpen) return this.result(true, true, "already_completed");
    const mode = requireOne(
      SERVICE_TASK.modes,
      (candidate) => candidate.id === solution.resultMode && candidate.completionValid,
      `service result mode ${solution.resultMode}`,
    );
    const routeFlag = solution.resultMode === "service_gate_open"
      ? PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceGateOpen
      : PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceBypassOpen;
    const drafts: SessionEventDraft[] = [
      regionFlagDraft(`session.infrastructure.service.route.${id}`, routeFlag, true),
      regionFlagDraft(
        `session.infrastructure.service.mode.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceResultMode,
        solution.resultMode,
      ),
      regionFlagDraft(
        `session.infrastructure.service.solution.${id}`,
        PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.serviceSolutionId,
        solution.id,
      ),
    ];
    if (mode.patchRecordRef) {
      drafts.push(regionFlagDraft(
        `session.infrastructure.service.patch.${id}`,
        `material_patch:${mode.patchRecordRef}`,
        true,
      ));
    }
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint));
    return this.commit({ transactionId: id, drafts });
  }

  discoverTawa(transactionId: string): InfrastructureLanguageActionResult {
    const id = requiredId(transactionId, "transactionId");
    const scene = this.currentScene();
    const interaction = scene.sceneId === WATERWHEEL_SCENE.sceneId
      ? WATERWHEEL_MOTION_INTERACTION
      : SERVICE_MOTION_INTERACTION;
    const fingerprint = operationFingerprint("tawa_discovery", {
      sceneId: scene.sceneId,
      interactionId: interaction.id,
      targetId: interaction.targetId,
    });
    const preflight = this.languagePreflight(id, fingerprint);
    if (preflight) return preflight;
    const event: LearningEvidenceEvent = {
      eventId: `infrastructure.tawa.discovery.${id}`,
      eventType: "glyph_discovered",
      playerSaveId: this.authoritativeSession.sessionId,
      wordId: TAWA_WORD_ID,
      idempotencyKey: `${this.authoritativeSession.sessionId}:infrastructure:tawa:discovery:${id}`,
      locationId: interaction.targetId,
      recognitionMode: "world_observation",
    };
    return this.commitLearning(id, fingerprint, event);
  }

  attuneTawa(transactionId: string): InfrastructureLanguageActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(WATERWHEEL_SCENE)) return this.languageResult(false, false, "wrong_scene", false);
    const fingerprint = operationFingerprint("tawa_attunement", {
      sceneId: WATERWHEEL_SCENE.sceneId,
      environmentalWitnessId: WATERWHEEL_MOTION_INTERACTION.targetId,
      catalystClass: "common_nontradeable",
    });
    const preflight = this.languagePreflight(id, fingerprint);
    if (preflight) return preflight;
    const event: LearningEvidenceEvent = {
      eventId: `infrastructure.tawa.attunement.${id}`,
      eventType: "glyph_attunement_completed",
      playerSaveId: this.authoritativeSession.sessionId,
      wordId: TAWA_WORD_ID,
      idempotencyKey: `${this.authoritativeSession.sessionId}:infrastructure:tawa:attunement:${id}`,
      catalystClass: "common_nontradeable",
      catalystTradeable: false,
      environmentalWitnessId: WATERWHEEL_MOTION_INTERACTION.targetId,
    };
    return this.commitLearning(id, fingerprint, event);
  }

  groundTawa(
    transactionId: string,
    attempt: TawaGroundingAttempt,
  ): InfrastructureLanguageActionResult {
    const id = requiredId(transactionId, "transactionId");
    const task = this.inScene(WATERWHEEL_SCENE) ? WATERWHEEL_TASK : SERVICE_TASK;
    const solution = task.solutions.find((candidate) => candidate.id === attempt.solutionId);
    const fingerprint = operationFingerprint("tawa_grounding", {
      sceneId: this.currentScene().sceneId,
      taskId: task.id,
      attempt,
    });
    const preflight = this.languagePreflight(id, fingerprint);
    if (preflight) return preflight;
    if (!solution || !attempt.predictedMotionCorrect || attempt.promptLevel > 1 ||
        !attempt.worldOutcomeContribution || attempt.answerVisible === true) {
      return this.languageResult(false, false, "ineligible_evidence", false);
    }
    if (attempt.toolBypass) {
      const result = this.commit({
        transactionId: id,
        drafts: [operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint)],
      });
      return this.languageResult(result.accepted, result.duplicate, "tool_bypass_no_evidence", false);
    }
    const event: LearningEvidenceEvent = {
      eventId: `infrastructure.tawa.grounding.${id}`,
      eventType: "grounding_trial_resolved",
      playerSaveId: this.authoritativeSession.sessionId,
      wordId: TAWA_WORD_ID,
      idempotencyKey: `${this.authoritativeSession.sessionId}:infrastructure:tawa:grounding:${id}`,
      taskId: solution.id,
      taskFamilyId: task.familyId,
      variantHash: `${solution.id}:${id}`,
      normalizedEnvironmentFingerprint: `${task.regionNodeId}:motion:${solution.chapterSolutionFamily}`,
      promptLevel: attempt.promptLevel,
      interpretationStatus: "executed_legal",
      worldOutcomeContribution: true,
      toolBypass: false,
      answerVisible: false,
      fixedSlotOnly: false,
      colorOnlyCue: false,
      semanticFacetsDemonstrated: ["motion", "direction"],
      canonicalAstWordIds: [`word.${TAWA_WORD_ID}`],
    };
    return this.commitLearning(id, fingerprint, event);
  }

  readGrammarOSign(transactionId: string): InfrastructureLanguageActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(SERVICE_SCENE)) return this.languageResult(false, false, "wrong_scene", false);
    const fingerprint = operationFingerprint("grammar_o_seen", {
      token: O_CONTACT.token,
      contactKind: O_CONTACT.contactKind,
      interactionId: O_SIGN_INTERACTION.id,
    });
    const preflight = this.languagePreflight(id, fingerprint);
    if (preflight) return preflight;
    const result = this.commit({
      transactionId: id,
      drafts: [
        regionFlagDraft(
          `session.infrastructure.grammar.o.seen.${id}`,
          PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.grammarOSeen,
          true,
        ),
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
    return this.languageResult(result.accepted, result.duplicate, result.reason, false);
  }

  acceptGrammarOReceptivePrompt(
    transactionId: string,
    understood: boolean,
  ): InfrastructureLanguageActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene(SERVICE_SCENE)) return this.languageResult(false, false, "wrong_scene", false);
    const fingerprint = operationFingerprint("grammar_o_receptive", {
      token: O_CONTACT.token,
      understood,
      productionRequired: O_CONTACT.productionRequired,
    });
    const preflight = this.languagePreflight(id, fingerprint);
    if (preflight) return preflight;
    if (!understood ||
        !regionTrue(this.authoritativeSession.snapshot(), PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.grammarOSeen)) {
      return this.languageResult(false, false, "prerequisite_missing", false);
    }
    const result = this.commit({
      transactionId: id,
      drafts: [
        regionFlagDraft(
          `session.infrastructure.grammar.o.accepted.${id}`,
          PROLOGUE_INFRASTRUCTURE_REGION_FLAGS.grammarOReceptiveAccepted,
          true,
        ),
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
    return this.languageResult(result.accepted, result.duplicate, result.reason, false);
  }

  setCheckpoint(
    transactionId: string,
    checkpointId: string,
    position: Readonly<{ x: number; y: number }>,
  ): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    const normalizedCheckpointId = requiredId(checkpointId, "checkpointId");
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new RangeError("checkpoint position must be finite");
    }
    const scene = this.currentScene();
    const fingerprint = operationFingerprint("checkpoint_set", {
      checkpointId: normalizedCheckpointId,
      sceneId: scene.sceneId,
      position,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.infrastructure.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint: {
            id: normalizedCheckpointId,
            sceneId: scene.sceneId,
            position: { ...position },
            revision: state.checkpoint.revision + 1,
          } },
        },
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
  }

  resetToCheckpoint(transactionId: string): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    const state = this.authoritativeSession.snapshot();
    const fingerprint = operationFingerprint("checkpoint_reset", {
      currentSceneId: state.world.currentSceneId,
      checkpointId: state.checkpoint.id,
      checkpointRevision: state.checkpoint.revision,
      targetSceneId: state.checkpoint.sceneId,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const result = this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.infrastructure.checkpoint.reset.${id}`,
          type: "area_reset",
          payload: { areaId: state.world.currentSceneId, respawnSceneId: state.checkpoint.sceneId },
        },
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
    if (result.accepted && !result.duplicate) this.temporaryWaterwheelActive = false;
    return this.result(result.accepted, result.duplicate, result.reason);
  }

  recoverSoftLock(transactionId: string): InfrastructureActionResult {
    const id = requiredId(transactionId, "transactionId");
    const scene = this.currentScene();
    const task = scene.sceneId === WATERWHEEL_SCENE.sceneId ? WATERWHEEL_TASK : SERVICE_TASK;
    const entrance = scene.sceneId === WATERWHEEL_SCENE.sceneId ? WATERWHEEL_ENTRY : SERVICE_ENTRY;
    const fingerprint = operationFingerprint("softlock_recovery", {
      sceneId: scene.sceneId,
      actions: task.recoveryActions,
      maximumSeconds: task.maximumSoftlockRecoverySeconds,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    const result = this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.infrastructure.recovery.area.${id}`,
          type: "area_reset",
          payload: { areaId: scene.sceneId, respawnSceneId: scene.sceneId },
        },
        {
          eventId: `session.infrastructure.recovery.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint: checkpointForEntrance(
            state,
            `checkpoint.${scene.regionNodeId}.recovery`,
            scene,
            entrance,
          ) },
        },
        regionFlagDraft(
          `session.infrastructure.recovery.marker.${id}`,
          `${scene.regionNodeId}.last_recovery_transaction`,
          id,
        ),
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
    if (result.accepted && !result.duplicate && scene.sceneId === WATERWHEEL_SCENE.sceneId) {
      this.temporaryWaterwheelActive = false;
    }
    return this.result(result.accepted, result.duplicate, result.reason);
  }

  private commitLearning(
    transactionId: string,
    fingerprint: string,
    event: LearningEvidenceEvent,
  ): InfrastructureLanguageActionResult {
    const reduction = reduceLearningEvidence(this.authoritativeSession.snapshot().learning, event);
    if (!reduction.applied) {
      return this.languageResult(
        false,
        reduction.duplicate,
        reduction.reason === "prerequisite_missing" ? "prerequisite_missing" : "ineligible_evidence",
        false,
      );
    }
    const result = this.commit({
      transactionId,
      drafts: [
        {
          eventId: `session.infrastructure.learning.${transactionId}`,
          type: "learning_evidence_committed",
          payload: { evidence: event },
        },
        operationReceiptDraft(this.authoritativeSession.sessionId, transactionId, fingerprint),
      ],
    });
    return this.languageResult(result.accepted, result.duplicate, result.reason, result.accepted);
  }

  private preflight(
    transactionId: string,
    fingerprint: string,
  ): InfrastructureActionResult | null {
    const prior = classifyOperation(this.authoritativeSession, transactionId, fingerprint);
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    return null;
  }

  private languagePreflight(
    transactionId: string,
    fingerprint: string,
  ): InfrastructureLanguageActionResult | null {
    const prior = classifyOperation(this.authoritativeSession, transactionId, fingerprint);
    if (prior === "duplicate") return this.languageResult(true, true, "duplicate", false);
    if (prior === "conflict") return this.languageResult(false, false, "transaction_conflict", false);
    return null;
  }

  private commit(batch: SessionProposalBatch): InfrastructureActionResult {
    const commit = commitSessionProposal(this.authoritativeSession, batch);
    if (!commit.committed) return this.result(false, false, "session_rejected");
    this.authoritativeSession = commit.session;
    this.rebuildBridge();
    return this.result(true, false, "committed");
  }

  private result(
    accepted: boolean,
    duplicate: boolean,
    reason: InfrastructureActionReason,
  ): InfrastructureActionResult {
    return Object.freeze({ accepted, duplicate, reason, snapshot: this.snapshot() });
  }

  private languageResult(
    accepted: boolean,
    duplicate: boolean,
    reason: InfrastructureActionReason,
    evidenceGranted: boolean,
  ): InfrastructureLanguageActionResult {
    return Object.freeze({ accepted, duplicate, reason, evidenceGranted, snapshot: this.snapshot() });
  }

  private inScene(scene: RuntimeSceneManifest): boolean {
    return this.authoritativeSession.snapshot().world.currentSceneId === scene.sceneId;
  }

  private currentScene(): RuntimeSceneManifest {
    return this.inScene(WATERWHEEL_SCENE) ? WATERWHEEL_SCENE : SERVICE_SCENE;
  }

  private rebuildBridge(): void {
    const manifests = Object.values(SCENE_INDEX.byId);
    this.bridge = new GameSessionRuntimeBridge({
      session: this.authoritativeSession,
      scenes: INFRASTRUCTURE_RUNTIME_SCENES,
      sceneAreas: Object.fromEntries(Object.values(SCENE_INDEX.byId).map((scene) => [scene.sceneId, scene.regionId])),
      entranceByScene: Object.fromEntries(
        manifests.map((scene) => [scene.sceneId, scene.recovery.entryEntranceId]),
      ),
      viewportPx: { x: 320, y: 160 },
      fixedHz: 60,
    });
  }
}

export const createPrologueWaterwheelInitialSession = (options: Readonly<{
  sessionId: string;
  currentMp?: number;
  maxMp?: number;
}>): GameSession => {
  const maxMp = options.maxMp ?? 24;
  return GameSession.create({
    sessionId: requiredId(options.sessionId, "sessionId"),
    mp: { currentMp: options.currentMp ?? maxMp, maxMp, worldVersion: 0 },
    currentSceneId: WATERWHEEL_SCENE.sceneId,
    checkpoint: {
      id: "checkpoint.valley.waterwheel.entry",
      sceneId: WATERWHEEL_SCENE.sceneId,
      position: { ...WATERWHEEL_ENTRY.spawnPx },
      revision: 0,
    },
  });
};
