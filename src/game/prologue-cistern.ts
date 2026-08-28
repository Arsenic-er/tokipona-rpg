import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeCisternTaskManifest,
  readRuntimeInfrastructureTaskManifestIndex,
  readRuntimeSceneManifestIndex,
  type RuntimeCisternFamilyManifest,
  type RuntimeCisternLengthClass,
  type RuntimeCisternStageManifest,
  type RuntimeSceneEntranceManifest,
  type RuntimeSceneManifest,
} from "../content";
import {
  CisternLearningSession,
  type CisternWordId,
  type EvidenceProposalResult,
} from "../learning/cistern-session";
import {
  commitSessionProposal,
  proposeCisternRecovery,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionApplyReason,
  type SessionReceiptDomain,
  type WorldFlagValue,
} from "../session/game-session";
import {
  GameSessionRuntimeBridge,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import type { SceneDefinition } from "../runtime/scene";
import type {
  ExtensionLearningActionResult,
  ExtensionLearningRuntimePort,
  ExtensionLearningRuntimeView,
} from "../learning/extension-learning-runtime";
import type { LivingSafetyZone, MpRecoveryProposal, PointPx } from "../spells/cast-plan";
import { Material } from "../sim/materials";
import {
  CisternDemoController,
  createDefaultCisternStages,
  type CisternConfirmResult,
  type CisternDemoSnapshot,
  type CisternDirectionId,
  type CisternExpressionId,
  type CisternPreviewResult,
  type CisternReceiverStageSpec,
} from "./cistern-demo";
import type { WorldMaterialEdit } from "./length-cistern-slice";

const SCENE_INDEX = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const TASK_INDEX = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const CISTERN_CONTRACT = readRuntimeCisternTaskManifest(generatedRuntimeArtifact);

const requireOne = <T>(values: readonly T[], predicate: (value: T) => boolean, label: string): T => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) throw new Error(`expected one ${label}, received ${matches.length}`);
  return matches[0]!;
};

const CISTERN_SCENE = requireOne(
  Object.values(SCENE_INDEX.byId),
  (scene) => scene.regionNodeId === "valley.high_cistern",
  "generated high-cistern scene",
);
const CISTERN_TASK = TASK_INDEX.byId.ch01_length_cistern;
if (!CISTERN_TASK || CISTERN_TASK.sceneId !== CISTERN_SCENE.sceneId ||
    CISTERN_TASK.regionId !== CISTERN_SCENE.regionId || !CISTERN_TASK.cistern) {
  throw new Error("generated high-cistern scene and task contracts are inconsistent");
}
if (CISTERN_SCENE.sizeTiles.width !== 30 || CISTERN_SCENE.sizeTiles.height !== 48) {
  throw new Error("generated high-cistern scene must remain 30x48 tiles");
}
const ENTRY = requireOne(
  CISTERN_SCENE.entrances,
  (entrance) => entrance.id === CISTERN_SCENE.recovery.entryEntranceId,
  "high-cistern recovery entrance",
);
const INBOUND = requireOne(
  CISTERN_SCENE.inboundRoutes,
  (route) => route.entranceId === ENTRY.id,
  "waterwheel lower-maintenance to high-cistern inbound route",
);
const SERVICE_SCENE = SCENE_INDEX.byId[INBOUND.sourceSceneId];
if (!SERVICE_SCENE) throw new Error("generated waterwheel source scene is missing");
const TASK_REFERENCE = requireOne(
  CISTERN_SCENE.taskRefs,
  (reference) => reference.id === CISTERN_TASK.id,
  "high-cistern authoritative task reference",
);
if (TASK_REFERENCE.authoritativeTaskSourcePath !== CISTERN_TASK.sourcePath) {
  throw new Error("high-cistern task reference does not resolve to its authoritative source");
}

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
const RUNTIME_SCENES = Object.freeze(Object.values(SCENE_INDEX.byId).map(toRuntimeScene));

export const PROLOGUE_CISTERN_SCENE_ID = CISTERN_SCENE.sceneId;
export const PROLOGUE_CISTERN_REGION_ID = CISTERN_SCENE.regionId;
export const PROLOGUE_CISTERN_TASK_ID = CISTERN_TASK.id;
export const PROLOGUE_CISTERN_ENTRY_CHECKPOINT_ID = "checkpoint.valley.high_cistern.entry";
export const PROLOGUE_CISTERN_STAGE_CONTRACTS = CISTERN_CONTRACT.stages;
export const PROLOGUE_CISTERN_FAMILY_CONTRACTS = CISTERN_CONTRACT.families;
export const PROLOGUE_CISTERN_CAPACITY_MILESTONE_REF = CISTERN_CONTRACT.capacityMilestoneRef;

export const PROLOGUE_CISTERN_REGION_FLAGS = Object.freeze({
  entryCrossed: "high_cistern_entry_crossed",
  shortSatisfied: "receiver_short_calibrated",
  defaultSatisfied: "receiver_default_calibrated",
  longSatisfied: "receiver_long_transfer_complete",
  calibrationFamilyComplete: "cistern_family_a_calibration_complete",
  transferFamilyComplete: "cistern_family_b_transfer_complete",
  highCisternReconnected: "high_cistern_reconnected",
  upperChannelAvailable: "upper_channel_available",
  exitLadderLowered: "exit_ladder_lowered",
  materialPatchApplied: `material_patch:${CISTERN_TASK.materialPatchRefs[0] ?? "missing"}`,
} as const);

const STAGE_FLAG: Readonly<Record<RuntimeCisternLengthClass, string>> = Object.freeze({
  short: PROLOGUE_CISTERN_REGION_FLAGS.shortSatisfied,
  default: PROLOGUE_CISTERN_REGION_FLAGS.defaultSatisfied,
  long: PROLOGUE_CISTERN_REGION_FLAGS.longSatisfied,
});
const FAMILY_FLAG: Readonly<Record<string, string>> = Object.freeze({
  "cistern.family_a.calibration": PROLOGUE_CISTERN_REGION_FLAGS.calibrationFamilyComplete,
  "cistern.family_b.transfer": PROLOGUE_CISTERN_REGION_FLAGS.transferFamilyComplete,
});
const STAGE_EXPRESSION: Readonly<Record<RuntimeCisternLengthClass, CisternExpressionId>> = Object.freeze({
  short: "telo_lili",
  default: "telo",
  long: "telo_suli",
});
const STAGE_ACTION: Readonly<Record<RuntimeCisternLengthClass, string>> = Object.freeze({
  short: "short_direct_cast",
  default: "default_single_cast",
  long: "long_direct_cast",
});
const STAGE_TOKEN_COUNT: Readonly<Record<CisternExpressionId, number>> = Object.freeze({
  telo_lili: 2,
  telo: 1,
  telo_suli: 2,
});
const EXECUTOR_WIDTH_CELLS = 100;
const EXECUTOR_HEIGHT_CELLS = 40;

export type PrologueCisternActionReason =
  | "committed"
  | "duplicate"
  | "transaction_conflict"
  | "wrong_scene"
  | "wrong_source_scene"
  | "entry_guard_failed"
  | "capacity_insufficient"
  | "no_pending_preview"
  | "cast_rejected"
  | "incorrect_length"
  | "receiver_predicate_false"
  | "unknown_family"
  | "already_completed"
  | "prerequisite_missing"
  | "ineligible_evidence"
  | "tool_bypass_no_evidence"
  | "session_rejected";

export interface PrologueCisternActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueCisternActionReason;
  readonly sessionReason: SessionApplyReason | null;
  readonly snapshot: PrologueCisternSnapshot;
}

export interface PrologueCisternEntryResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueCisternActionReason;
  readonly entryMode: "direct_transition" | "adopted_runtime_transition" | null;
  readonly cistern: PrologueCisternSession | null;
}

export interface PrologueCisternPreviewOutcome {
  readonly accepted: boolean;
  readonly reason: "preview_ready" | "capacity_insufficient" | "pending_preview_exists";
  readonly preview: CisternPreviewResult | null;
  readonly snapshot: PrologueCisternSnapshot;
}

export interface PrologueCisternConfirmOutcome extends PrologueCisternActionResult {
  readonly confirmation: CisternConfirmResult | null;
  readonly stage: RuntimeCisternLengthClass | null;
  readonly expression: CisternExpressionId | null;
  readonly correctLength: boolean;
  readonly receiverSatisfied: boolean;
  readonly evidence: EvidenceProposalResult | null;
}

export interface PrologueCisternLearningResult extends PrologueCisternActionResult {
  readonly evidenceGranted: boolean;
}

export interface PrologueCisternSnapshot {
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly cistern: CisternDemoSnapshot;
  readonly sceneManifestId: string;
  readonly taskId: string;
  readonly expressionCapacityWords: number;
  readonly stages: Readonly<Record<RuntimeCisternLengthClass, boolean>>;
  readonly families: Readonly<Record<string, boolean>>;
  readonly completed: boolean;
  readonly returnChannelAvailable: boolean;
  readonly softLockRecovery: Readonly<{
    maximumSeconds: number;
    actions: readonly string[];
    preserves: readonly string[];
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
  `cistern:${kind}:${JSON.stringify(canonicalize(payload))}`;
const operationReceiptId = (sessionId: string, transactionId: string): string =>
  `world:${sessionId}:cistern-operation:${transactionId}`;

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
  `session.cistern.operation.${transactionId}`,
  operationReceiptId(sessionId, transactionId),
  "world",
  fingerprint,
);
const regionFlagDraft = (eventId: string, flagId: string, value: WorldFlagValue): SessionEventDraft => ({
  eventId,
  type: "world_flag_set",
  payload: { flagId, value, scope: "region", regionId: PROLOGUE_CISTERN_REGION_ID },
});
const regionValue = (state: GameSessionState, flagId: string): WorldFlagValue | undefined =>
  Object.values(state.world.flags).find((flag) =>
    flag.scope === "region" && flag.regionId === PROLOGUE_CISTERN_REGION_ID && flag.flagId === flagId
  )?.value;
const regionTrue = (state: GameSessionState, flagId: string): boolean => regionValue(state, flagId) === true;

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

const createRoomEdits = (
  stages: readonly CisternReceiverStageSpec[],
  state: GameSessionState,
): readonly WorldMaterialEdit[] => {
  const edits = new Map<string, WorldMaterialEdit>();
  const set = (cellX: number, cellY: number, material: Material): void => {
    if (cellX < 0 || cellY < 0 || cellX >= EXECUTOR_WIDTH_CELLS || cellY >= EXECUTOR_HEIGHT_CELLS) return;
    edits.set(`${cellX}:${cellY}`, Object.freeze({ cellX, cellY, material }));
  };
  for (let cellX = 0; cellX < EXECUTOR_WIDTH_CELLS; cellX += 1) {
    set(cellX, EXECUTOR_HEIGHT_CELLS - 1, Material.Rock);
  }
  for (const stage of stages) {
    const { x, y, width, height } = stage.boundsCells;
    for (let cellY = y - 1; cellY <= y + height; cellY += 1) {
      set(x - 1, cellY, Material.Rock);
      set(x + width, cellY, Material.Rock);
    }
    for (let cellX = x - 1; cellX <= x + width; cellX += 1) set(cellX, y + height, Material.Rock);
    if (!regionTrue(state, STAGE_FLAG[stage.stageId])) continue;
    for (let cellY = y; cellY < y + height; cellY += 1) {
      for (let cellX = x; cellX < x + width; cellX += 1) set(cellX, cellY, Material.Water);
    }
  }
  return Object.freeze([...edits.values()]);
};

const familyCompleteAfter = (
  family: RuntimeCisternFamilyManifest,
  state: GameSessionState,
  newlyCompletedStage: RuntimeCisternLengthClass | null,
): boolean => family.stageIds.every((stageId) =>
  stageId === newlyCompletedStage || regionTrue(state, STAGE_FLAG[stageId])
);

/**
 * Formal N05 coordinator. GameSession is the only persisted aggregate. The
 * material and learning executors are rebuilt from it after every transaction,
 * failure, reset, and load, so their local ledgers can never mint MP, water, or
 * evidence.
 */
export class PrologueCisternSession {
  private authoritativeSession: GameSession;
  private bridge!: GameSessionRuntimeBridge;

  readExtensionLearning(port: ExtensionLearningRuntimePort): ExtensionLearningRuntimeView {
    return port.read(this.bridge, this.bridge.runtime.snapshot().sceneId);
  }

  commitExtensionLearning(port: ExtensionLearningRuntimePort, corpusId: string,
    actionId: string): ExtensionLearningActionResult {
    return port.commit(corpusId, actionId, this.bridge);
  }
  private controller!: CisternDemoController;
  private learning!: CisternLearningSession;

  constructor(session: GameSession) {
    if (session.snapshot().world.currentSceneId !== CISTERN_SCENE.sceneId) {
      throw new Error("cistern session requires the generated high-cistern scene");
    }
    this.authoritativeSession = session;
    this.rebuildExecutors();
  }

  static enterFromServiceChannel(session: GameSession, transactionId: string): PrologueCisternEntryResult {
    return this.commitEntry(session, transactionId, "direct_transition");
  }

  static adoptRuntimeEntry(session: GameSession, transactionId: string): PrologueCisternEntryResult {
    return this.commitEntry(session, transactionId, "adopted_runtime_transition");
  }

  private static commitEntry(
    session: GameSession,
    transactionId: string,
    mode: "direct_transition" | "adopted_runtime_transition",
  ): PrologueCisternEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const fingerprint = operationFingerprint("entry", {
      mode,
      sourceSceneId: INBOUND.sourceSceneId,
      sourceExitId: INBOUND.sourceExitId,
      targetSceneId: CISTERN_SCENE.sceneId,
      targetEntranceId: ENTRY.id,
    });
    const prior = classifyOperation(session, id, fingerprint);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") {
      const arrived = session.snapshot().world.currentSceneId === CISTERN_SCENE.sceneId;
      return this.entryResult(
        arrived,
        arrived,
        arrived ? "duplicate" : "wrong_source_scene",
        arrived ? mode : null,
        arrived ? new PrologueCisternSession(session) : null,
      );
    }
    const state = session.snapshot();
    const guardReady = CISTERN_TASK.entryGuardAny.some((guard) => {
      const flagId = guard.split("==")[0]?.trim() ?? "";
      return flagId.length > 0 && regionTrue(state, flagId);
    });
    if (!guardReady) return this.entryResult(false, false, "entry_guard_failed", null, null);
    if (mode === "direct_transition" && state.world.currentSceneId !== INBOUND.sourceSceneId) {
      return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    if (mode === "adopted_runtime_transition") {
      const suffix = `${INBOUND.sourceSceneId}->${CISTERN_SCENE.sceneId}`;
      const canonicalHandoff = state.world.currentSceneId === CISTERN_SCENE.sceneId &&
        [...session.events()].reverse().some((event) =>
          event.type === "scene_entered" && event.payload.sceneId === CISTERN_SCENE.sceneId &&
          event.eventId.endsWith(suffix)
        );
      if (!canonicalHandoff) return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    const drafts: SessionEventDraft[] = [];
    if (mode === "direct_transition") {
      drafts.push({
        eventId: `session.cistern.entry.scene.${id}`,
        type: "scene_entered",
        payload: { sceneId: CISTERN_SCENE.sceneId },
      });
    }
    drafts.push(
      {
        eventId: `session.cistern.entry.checkpoint.${id}`,
        type: "checkpoint_set",
        payload: { checkpoint: checkpointForEntrance(
          state,
          PROLOGUE_CISTERN_ENTRY_CHECKPOINT_ID,
          CISTERN_SCENE,
          ENTRY,
        ) },
      },
      regionFlagDraft(`session.cistern.entry.flag.${id}`, PROLOGUE_CISTERN_REGION_FLAGS.entryCrossed, true),
      operationReceiptDraft(session.sessionId, id, fingerprint),
    );
    const commit = commitSessionProposal(session, { transactionId: id, drafts });
    if (!commit.committed) return this.entryResult(false, false, "session_rejected", null, null);
    return this.entryResult(true, false, "committed", mode, new PrologueCisternSession(commit.session));
  }

  private static entryResult(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueCisternActionReason,
    entryMode: PrologueCisternEntryResult["entryMode"],
    cistern: PrologueCisternSession | null,
  ): PrologueCisternEntryResult {
    return Object.freeze({ accepted, duplicate, reason, entryMode, cistern });
  }

  static fromSave(candidate: unknown): PrologueCisternSession {
    return new PrologueCisternSession(GameSession.fromSave(candidate));
  }

  get session(): GameSession {
    return this.authoritativeSession;
  }

  toSave(): GameSessionSave {
    return this.authoritativeSession.toSave();
  }

  snapshot(): PrologueCisternSnapshot {
    const session = this.authoritativeSession.snapshot();
    const stages = Object.freeze({
      short: regionTrue(session, STAGE_FLAG.short),
      default: regionTrue(session, STAGE_FLAG.default),
      long: regionTrue(session, STAGE_FLAG.long),
    });
    const families = Object.freeze(Object.fromEntries(CISTERN_CONTRACT.families.map((family) => [
      family.id,
      regionTrue(session, FAMILY_FLAG[family.id]!),
    ])));
    const completed = CISTERN_CONTRACT.completionFlags.every((flagId) => regionTrue(session, flagId));
    return Object.freeze({
      session,
      runtime: this.bridge.runtime.snapshot(),
      cistern: this.controller.snapshot(),
      sceneManifestId: CISTERN_SCENE.sceneId,
      taskId: CISTERN_TASK.id,
      expressionCapacityWords: session.capabilities.expressionCapacityWords,
      stages,
      families,
      completed,
      returnChannelAvailable: regionTrue(session, PROLOGUE_CISTERN_REGION_FLAGS.exitLadderLowered),
      softLockRecovery: Object.freeze({
        maximumSeconds: Math.min(CISTERN_SCENE.recovery.maximumSoftlockRecoverySeconds, CISTERN_CONTRACT.maximumSoftlockRecoverySeconds),
        actions: CISTERN_SCENE.recovery.actions,
        preserves: CISTERN_SCENE.recovery.preserves,
      }),
      killCount: 0,
    });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueCisternSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    this.bridge.advanceTicks(ticks, input);
    this.authoritativeSession = this.bridge.session;
    return this.snapshot();
  }

  setExpression(expression: CisternExpressionId): PrologueCisternSnapshot {
    this.controller.setExpression(expression);
    return this.snapshot();
  }

  setDirection(direction: CisternDirectionId): PrologueCisternSnapshot {
    this.controller.setDirection(direction);
    return this.snapshot();
  }

  targetCurrentReceiver(): PrologueCisternSnapshot {
    this.controller.targetCurrentReceiver();
    return this.snapshot();
  }

  setTargetAnchorPx(anchorPx: PointPx): PrologueCisternSnapshot {
    this.controller.setTargetAnchorPx(anchorPx);
    return this.snapshot();
  }

  beginPreview(livingSafetyZones: readonly LivingSafetyZone[] = []): PrologueCisternPreviewOutcome {
    const selected = this.controller.snapshot().selectedExpression;
    if (STAGE_TOKEN_COUNT[selected] > this.authoritativeSession.snapshot().capabilities.expressionCapacityWords) {
      return Object.freeze({
        accepted: false,
        reason: "capacity_insufficient",
        preview: null,
        snapshot: this.snapshot(),
      });
    }
    const preview = this.controller.beginPreview(livingSafetyZones);
    return Object.freeze({
      accepted: preview.accepted,
      reason: preview.accepted ? "preview_ready" : "pending_preview_exists",
      preview,
      snapshot: this.snapshot(),
    });
  }

  cancelPending(): PrologueCisternSnapshot {
    this.controller.cancelPending();
    return this.snapshot();
  }

  confirmPending(
    transactionId: string,
    currentLivingSafetyZones: readonly LivingSafetyZone[] = [],
  ): PrologueCisternConfirmOutcome {
    const id = requiredId(transactionId, "transactionId");
    const beforeController = this.controller.snapshot();
    const stage = beforeController.stage === "completed" ? null : beforeController.stage;
    const expression = beforeController.pendingPlan ? beforeController.selectedExpression : null;
    if (!stage || !expression || !beforeController.pendingPlan) {
      this.rebuildExecutors();
      return this.confirmResult(false, false, "no_pending_preview", null, null, null, false, false, null);
    }
    const fingerprint = operationFingerprint("cast", {
      stage,
      expression,
      planId: beforeController.pendingPlan.planId,
    });
    const prior = classifyOperation(this.authoritativeSession, id, fingerprint);
    if (prior !== "absent") {
      this.rebuildExecutors();
      return this.confirmResult(
        prior === "duplicate",
        prior === "duplicate",
        prior === "duplicate" ? "duplicate" : "transaction_conflict",
        null,
        stage,
        expression,
        expression === STAGE_EXPRESSION[stage],
        false,
        null,
      );
    }
    const confirmation = this.controller.confirmPending(id, currentLivingSafetyZones);
    if (!confirmation.accepted || !confirmation.execution?.committed) {
      this.rebuildExecutors();
      return this.confirmResult(false, false, "cast_rejected", confirmation, stage, expression, false, false, null);
    }
    const correctLength = expression === STAGE_EXPRESSION[stage];
    const receiverSatisfied = correctLength && confirmation.snapshot.stage !== stage;
    const state = this.authoritativeSession.snapshot();
    const nextWorldVersion = state.mp.worldVersion + 1;
    const drafts: SessionEventDraft[] = [
      {
        eventId: `session.cistern.cast.mp.${id}`,
        type: "mp_replaced",
        payload: { mp: {
          currentMp: confirmation.execution.snapshot.mp,
          maxMp: state.mp.maxMp,
          worldVersion: nextWorldVersion,
        } },
      },
      receiptDraft(
        `session.cistern.cast.receipt.${id}`,
        `cast:${this.authoritativeSession.sessionId}:${id}`,
        "cast",
        `cistern:${stage}:${expression}:${confirmation.execution.planId}:charge:${confirmation.execution.mpCharge}`,
      ),
    ];
    let evidence: EvidenceProposalResult | null = null;
    if (receiverSatisfied) {
      drafts.push(regionFlagDraft(`session.cistern.stage.${stage}.${id}`, STAGE_FLAG[stage], true));
      evidence = this.learning.resolveReceiverAttempt({
        attemptId: id,
        stage,
        taskId: CISTERN_TASK.id,
        taskFamilyId: requireStage(stage).familyId,
        variantHash: `prologue-cistern.${stage}.receiver-v1`,
        normalizedEnvironmentFingerprint: `${CISTERN_TASK.regionNodeId}:${stage}:receiver-v1`,
        receiverGoalSatisfied: true,
        selectedActionClass: STAGE_ACTION[stage],
        toolBypass: false,
        promptLevel: 0,
        interpretationStatus: "executed_legal",
        answerVisible: false,
        fixedSlotOnly: false,
        colorOnlyCue: false,
        activeRetrieval: true,
      });
      this.appendAppliedEvidenceDrafts(drafts, id, evidence);
      const family = requireFamily(requireStage(stage).familyId);
      if (familyCompleteAfter(family, state, stage)) {
        drafts.push(regionFlagDraft(
          `session.cistern.family.${family.id}.${id}`,
          FAMILY_FLAG[family.id]!,
          true,
        ));
      }
      this.appendAtomicCompletionDrafts(drafts, id, state, family.id);
    }
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint));
    const commit = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts });
    if (!commit.committed) {
      this.rebuildExecutors();
      return this.confirmResult(false, false, "session_rejected", confirmation, stage, expression, correctLength, receiverSatisfied, evidence, commit.reason);
    }
    this.authoritativeSession = commit.session;
    this.rebuildExecutors();
    const reason = !correctLength
      ? "incorrect_length"
      : !receiverSatisfied
        ? "receiver_predicate_false"
        : "committed";
    return this.confirmResult(true, false, reason, confirmation, stage, expression, correctLength, receiverSatisfied, evidence);
  }

  discoverLengthWord(transactionId: string, wordId: "lili" | "suli"): PrologueCisternLearningResult {
    const id = requiredId(transactionId, "transactionId");
    const fingerprint = operationFingerprint("discover", { wordId, sceneId: CISTERN_SCENE.sceneId });
    const preflight = this.learningPreflight(id, fingerprint);
    if (preflight) return preflight;
    const proposal = this.learning.discoverGlyph({
      wordId,
      occurrenceId: id,
      locationId: `cistern.${wordId}.receiver`,
      recognitionMode: "world_observation",
    });
    return this.commitLearningProposal(id, fingerprint, proposal);
  }

  attuneLengthWord(transactionId: string, wordId: "lili" | "suli"): PrologueCisternLearningResult {
    const id = requiredId(transactionId, "transactionId");
    const fingerprint = operationFingerprint("attune", { wordId, sceneId: CISTERN_SCENE.sceneId });
    const preflight = this.learningPreflight(id, fingerprint);
    if (preflight) return preflight;
    const proposal = this.learning.attuneGlyph({
      wordId,
      occurrenceId: id,
      environmentalWitnessId: `cistern.${wordId}.receiver.witness`,
    });
    return this.commitLearningProposal(id, fingerprint, proposal);
  }

  completeFamilyWithTools(
    transactionId: string,
    familyId: string,
  ): PrologueCisternActionResult {
    const id = requiredId(transactionId, "transactionId");
    const normalizedFamily = requiredId(familyId, "familyId");
    const fingerprint = operationFingerprint("tool_family", { familyId: normalizedFamily });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const family = CISTERN_CONTRACT.families.find((candidate) => candidate.id === normalizedFamily);
    if (!family) return this.result(false, false, "unknown_family");
    const state = this.authoritativeSession.snapshot();
    if (regionTrue(state, FAMILY_FLAG[family.id]!)) return this.result(true, true, "already_completed");
    const solution = CISTERN_TASK.solutions.find((candidate) => candidate.id === family.toolBypassSolutionId);
    if (!solution || solution.routeKind !== "non_magic" || !solution.mainline || family.languageEvidenceFromToolBypass !== false) {
      return this.result(false, false, "prerequisite_missing");
    }
    const drafts: SessionEventDraft[] = [];
    for (const stageId of family.stageIds) {
      if (!regionTrue(state, STAGE_FLAG[stageId])) {
        drafts.push(regionFlagDraft(`session.cistern.tool.stage.${stageId}.${id}`, STAGE_FLAG[stageId], true));
      }
    }
    drafts.push(regionFlagDraft(`session.cistern.tool.family.${family.id}.${id}`, FAMILY_FLAG[family.id]!, true));
    this.appendAtomicCompletionDrafts(drafts, id, state, family.id);
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint));
    const committed = this.commit({ transactionId: id, drafts });
    return this.result(
      committed.accepted,
      committed.duplicate,
      committed.accepted ? "tool_bypass_no_evidence" : committed.reason,
      committed.sessionReason,
    );
  }

  applyNaturalRecovery(transactionId: string, ticks: number): PrologueCisternActionResult {
    const id = requiredId(transactionId, "transactionId");
    return this.applyRecovery(id, this.learning.proposeNaturalRecovery({ recoveryId: id, ticks }));
  }

  meditate(
    transactionId: string,
    answerAccepted: boolean,
    evidenceEligible: boolean,
  ): PrologueCisternActionResult {
    const id = requiredId(transactionId, "transactionId");
    return this.applyRecovery(id, this.learning.proposeMeditationRecovery({
      recoveryId: id,
      answerAccepted,
      evidenceEligible,
    }));
  }

  recoverAtCheckpoint(transactionId: string): PrologueCisternActionResult {
    const id = requiredId(transactionId, "transactionId");
    return this.applyRecovery(id, this.learning.proposeCheckpointRecovery({
      activationId: `${this.authoritativeSession.snapshot().checkpoint.id}:${id}`,
    }));
  }

  resetToCheckpoint(transactionId: string): PrologueCisternActionResult {
    const id = requiredId(transactionId, "transactionId");
    const state = this.authoritativeSession.snapshot();
    const fingerprint = operationFingerprint("checkpoint_reset", {
      sceneId: state.world.currentSceneId,
      checkpointId: state.checkpoint.id,
      checkpointRevision: state.checkpoint.revision,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.cistern.checkpoint.reset.${id}`,
          type: "area_reset",
          payload: { areaId: CISTERN_SCENE.sceneId, respawnSceneId: state.checkpoint.sceneId },
        },
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
  }

  recoverSoftLock(transactionId: string): PrologueCisternActionResult {
    const id = requiredId(transactionId, "transactionId");
    const fingerprint = operationFingerprint("softlock_recovery", {
      sceneId: CISTERN_SCENE.sceneId,
      maximumSeconds: CISTERN_CONTRACT.maximumSoftlockRecoverySeconds,
      actions: CISTERN_TASK.recoveryActions,
    });
    const preflight = this.preflight(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.cistern.recovery.area.${id}`,
          type: "area_reset",
          payload: { areaId: CISTERN_SCENE.sceneId, respawnSceneId: CISTERN_SCENE.sceneId },
        },
        {
          eventId: `session.cistern.recovery.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint: checkpointForEntrance(
            state,
            `checkpoint.${CISTERN_SCENE.regionNodeId}.recovery`,
            CISTERN_SCENE,
            ENTRY,
          ) },
        },
        regionFlagDraft(
          `session.cistern.recovery.marker.${id}`,
          `${CISTERN_SCENE.regionNodeId}.last_recovery_transaction`,
          id,
        ),
        operationReceiptDraft(this.authoritativeSession.sessionId, id, fingerprint),
      ],
    });
  }

  private applyRecovery(transactionId: string, proposal: MpRecoveryProposal): PrologueCisternActionResult {
    const fingerprint = operationFingerprint("mp_recovery", proposal);
    const preflight = this.preflight(transactionId, fingerprint);
    if (preflight) return preflight;
    const recovery = this.controller.applyMpRecovery(proposal);
    const proposed = proposeCisternRecovery(recovery);
    if (!proposed.accepted) {
      this.rebuildExecutors();
      return this.result(false, false, "session_rejected");
    }
    const drafts = [
      ...proposed.batch.drafts,
      operationReceiptDraft(this.authoritativeSession.sessionId, transactionId, fingerprint),
    ];
    const result = this.commit({ transactionId, drafts });
    if (!result.accepted) this.rebuildExecutors();
    return result;
  }

  private commitLearningProposal(
    transactionId: string,
    fingerprint: string,
    proposal: EvidenceProposalResult,
  ): PrologueCisternLearningResult {
    const drafts: SessionEventDraft[] = [];
    this.appendAppliedEvidenceDrafts(drafts, transactionId, proposal);
    if (!drafts.length) {
      this.rebuildExecutors();
      return this.learningResult(false, false, "ineligible_evidence", false);
    }
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, transactionId, fingerprint));
    const result = this.commit({ transactionId, drafts });
    return this.learningResult(result.accepted, result.duplicate, result.reason, result.accepted, result.sessionReason);
  }

  private appendAppliedEvidenceDrafts(
    drafts: SessionEventDraft[],
    transactionId: string,
    proposal: EvidenceProposalResult,
  ): void {
    const appliedEvents = proposal.proposedEvents.filter((_, index) => proposal.reductions[index]?.applied);
    if (!appliedEvents.length) return;
    for (const event of appliedEvents) {
      drafts.push({
        eventId: `session.cistern.learning.${transactionId}.${event.eventId}`,
        type: "learning_evidence_committed",
        payload: { evidence: event },
      });
    }
  }

  private appendAtomicCompletionDrafts(
    drafts: SessionEventDraft[],
    transactionId: string,
    state: GameSessionState,
    newlyCompletedFamilyId: string,
  ): void {
    const allFamiliesComplete = CISTERN_CONTRACT.families.every((family) =>
      family.id === newlyCompletedFamilyId || regionTrue(state, FAMILY_FLAG[family.id]!)
    );
    if (!allFamiliesComplete || CISTERN_CONTRACT.completionFlags.every((flag) => regionTrue(state, flag))) return;
    for (const flagId of CISTERN_CONTRACT.completionFlags) {
      drafts.push(regionFlagDraft(`session.cistern.complete.${flagId}.${transactionId}`, flagId, true));
    }
    if (CISTERN_TASK.materialPatchRefs[0]) {
      drafts.push(regionFlagDraft(
        `session.cistern.complete.patch.${transactionId}`,
        PROLOGUE_CISTERN_REGION_FLAGS.materialPatchApplied,
        true,
      ));
    }
  }

  private confirmResult(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueCisternActionReason,
    confirmation: CisternConfirmResult | null,
    stage: RuntimeCisternLengthClass | null,
    expression: CisternExpressionId | null,
    correctLength: boolean,
    receiverSatisfied: boolean,
    evidence: EvidenceProposalResult | null,
    sessionReason: SessionApplyReason | null = null,
  ): PrologueCisternConfirmOutcome {
    return Object.freeze({
      accepted,
      duplicate,
      reason,
      confirmation,
      stage,
      expression,
      correctLength,
      receiverSatisfied,
      evidence,
      sessionReason,
      snapshot: this.snapshot(),
    });
  }

  private preflight(transactionId: string, fingerprint: string): PrologueCisternActionResult | null {
    const prior = classifyOperation(this.authoritativeSession, transactionId, fingerprint);
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    return null;
  }

  private learningPreflight(
    transactionId: string,
    fingerprint: string,
  ): PrologueCisternLearningResult | null {
    const prior = classifyOperation(this.authoritativeSession, transactionId, fingerprint);
    if (prior === "duplicate") return this.learningResult(true, true, "duplicate", false);
    if (prior === "conflict") return this.learningResult(false, false, "transaction_conflict", false);
    return null;
  }

  private commit(batch: SessionProposalBatch): PrologueCisternActionResult {
    const commit = commitSessionProposal(this.authoritativeSession, batch);
    if (!commit.committed) {
      this.rebuildExecutors();
      return this.result(false, false, "session_rejected", commit.reason);
    }
    this.authoritativeSession = commit.session;
    this.rebuildExecutors();
    return this.result(true, false, "committed");
  }

  private result(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueCisternActionReason,
    sessionReason: SessionApplyReason | null = null,
  ): PrologueCisternActionResult {
    return Object.freeze({ accepted, duplicate, reason, sessionReason, snapshot: this.snapshot() });
  }

  private learningResult(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueCisternActionReason,
    evidenceGranted: boolean,
    sessionReason: SessionApplyReason | null = null,
  ): PrologueCisternLearningResult {
    return Object.freeze({ accepted, duplicate, reason, evidenceGranted, sessionReason, snapshot: this.snapshot() });
  }

  private rebuildExecutors(): void {
    const state = this.authoritativeSession.snapshot();
    const stages = createDefaultCisternStages(EXECUTOR_WIDTH_CELLS, EXECUTOR_HEIGHT_CELLS);
    this.controller = new CisternDemoController({
      widthCells: EXECUTOR_WIDTH_CELLS,
      heightCells: EXECUTOR_HEIGHT_CELLS,
      initialMp: state.mp.currentMp,
      maxMp: state.mp.maxMp,
      stageSpecs: stages,
      initialWorldEdits: createRoomEdits(stages, state),
    });
    if (CISTERN_CONTRACT.stages.some((stage) => regionTrue(state, STAGE_FLAG[stage.id]))) {
      this.controller.advancePhysics(1);
    }
    this.learning = new CisternLearningSession({
      playerSaveId: this.authoritativeSession.sessionId,
      expressionCapacity: state.capabilities.expressionCapacityWords,
      learningSnapshot: state.learning,
    });
    const manifests = Object.values(SCENE_INDEX.byId);
    this.bridge = new GameSessionRuntimeBridge({
      session: this.authoritativeSession,
      scenes: RUNTIME_SCENES,
      sceneAreas: Object.fromEntries(manifests.map((scene) => [scene.sceneId, scene.regionId])),
      entranceByScene: Object.fromEntries(manifests.map((scene) => [scene.sceneId, scene.recovery.entryEntranceId])),
      viewportPx: { x: 320, y: 192 },
      fixedHz: 60,
    });
  }
}

const requireStage = (stageId: RuntimeCisternLengthClass): RuntimeCisternStageManifest =>
  requireOne(CISTERN_CONTRACT.stages, (stage) => stage.id === stageId, `cistern stage ${stageId}`);
const requireFamily = (familyId: string): RuntimeCisternFamilyManifest =>
  requireOne(CISTERN_CONTRACT.families, (family) => family.id === familyId, `cistern family ${familyId}`);

export const PROLOGUE_CISTERN_DIRECT_EXPRESSIONS = STAGE_EXPRESSION;

export const createPrologueCisternInitialSession = (options: Readonly<{
  sessionId: string;
  currentMp?: number;
  learning?: GameSessionState["learning"];
}>): GameSession => {
  const maxMp = 24;
  return GameSession.create({
    sessionId: requiredId(options.sessionId, "sessionId"),
    mp: { currentMp: options.currentMp ?? maxMp, maxMp, worldVersion: 0 },
    currentSceneId: CISTERN_SCENE.sceneId,
    checkpoint: {
      id: PROLOGUE_CISTERN_ENTRY_CHECKPOINT_ID,
      sceneId: CISTERN_SCENE.sceneId,
      position: { ...ENTRY.spawnPx },
      revision: 0,
    },
    learning: options.learning,
  });
};

export const PROLOGUE_CISTERN_WORD_IDS: readonly CisternWordId[] = Object.freeze(["telo", "lili", "suli"]);
