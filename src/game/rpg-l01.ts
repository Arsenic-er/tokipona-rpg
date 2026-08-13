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
} from "../session/game-session";
import {
  GameSessionRuntimeBridge,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import type { SceneDefinition } from "../runtime/scene";
import {
  CisternLearningSession,
  type CisternStage,
  type EvidenceProposalResult,
} from "../learning/cistern-session";
import type {
  LivingSafetyZone,
  MpRecoveryReceipt,
  PointPx,
} from "../spells/cast-plan";
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

export const RPG_L01_SCENE_ID = "chapter01.high-cistern" as const;
export const RPG_L01_AREA_ID = "chapter01.high-cistern-area" as const;
export const RPG_L01_QUEST_ID = "quest.chapter01.high-cistern" as const;
export const RPG_L01_ENTRY_CHECKPOINT_ID = "checkpoint.chapter01.high-cistern.entry" as const;

export const RPG_L01_WORLD_FLAGS = Object.freeze({
  shortReceiverSatisfied: "l01_receiver_short_satisfied",
  defaultReceiverSatisfied: "l01_receiver_default_satisfied",
  longReceiverSatisfied: "l01_receiver_long_satisfied",
  toolBypassUsed: "l01_maintenance_tool_bypass_used",
  highCisternReconnected: "high_cistern_reconnected",
  upperChannelAvailable: "upper_channel_available",
  exitLadderLowered: "exit_ladder_lowered",
});

const WIDTH_CELLS = 100;
const HEIGHT_CELLS = 40;
const PLAYER_FLOOR_Y = 7 * 16 - 14;
const STAGE_ORDER: readonly CisternStage[] = ["short", "default", "long"];
const STAGE_EXPRESSIONS: Readonly<Record<CisternStage, CisternExpressionId>> = Object.freeze({
  short: "telo_lili",
  default: "telo",
  long: "telo_suli",
});
const STAGE_ACTIONS: Readonly<Record<CisternStage, string>> = Object.freeze({
  short: "short_direct_cast",
  default: "default_single_cast",
  long: "long_direct_cast",
});
const RECEIVER_FLAG_BY_STAGE: Readonly<Record<CisternStage, string>> = Object.freeze({
  short: RPG_L01_WORLD_FLAGS.shortReceiverSatisfied,
  default: RPG_L01_WORLD_FLAGS.defaultReceiverSatisfied,
  long: RPG_L01_WORLD_FLAGS.longReceiverSatisfied,
});

export const RPG_L01_SCENE: SceneDefinition = Object.freeze({
  id: RPG_L01_SCENE_ID,
  collisionRows: Object.freeze([
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "........................................",
    "########################################",
  ]),
  defaultEntranceId: "entry",
  entrances: Object.freeze([
    Object.freeze({ id: "entry", position: Object.freeze({ x: 16, y: PLAYER_FLOOR_Y }) }),
  ]),
  exits: Object.freeze([]),
});

export interface RpgL01Options {
  readonly activateEntryCheckpoint?: boolean;
  readonly expressionCapacity?: number;
}

export type RpgL01ResolutionMode = "unresolved" | "direct_language" | "tool_bypass";

export interface RpgL01Snapshot {
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly cistern: CisternDemoSnapshot;
  readonly completed: boolean;
  readonly resolutionMode: RpgL01ResolutionMode;
}

export type RpgL01ConfirmReason =
  | "confirmed"
  | "no_pending_preview"
  | "cast_rejected"
  | "duplicate_transaction"
  | "session_rejected";

export interface RpgL01ConfirmOutcome {
  readonly accepted: boolean;
  readonly reason: RpgL01ConfirmReason;
  readonly confirmation: CisternConfirmResult | null;
  readonly sessionReason: SessionApplyReason | null;
  readonly evidence: EvidenceProposalResult | null;
  readonly snapshot: RpgL01Snapshot;
}

export type RpgL01ToolBypassReason = "completed" | "already_completed" | "duplicate_transaction" | "session_rejected";

export interface RpgL01ToolBypassOutcome {
  readonly accepted: boolean;
  readonly reason: RpgL01ToolBypassReason;
  readonly sessionReason: SessionApplyReason | null;
  readonly snapshot: RpgL01Snapshot;
}

export interface RpgL01ResetOutcome {
  readonly resetApplied: boolean;
  readonly snapshot: RpgL01Snapshot;
}

const globalFlagValue = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "global" && flag.flagId === flagId && flag.value === true
  );

const requiredId = (value: string, label: string): void => {
  if (!value.trim()) throw new Error(`${label} is required`);
};

const stageOrdinal = (stage: CisternStage): number => STAGE_ORDER.indexOf(stage) + 1;

const receiptDraft = (
  eventId: string,
  receiptId: string,
  domain: "cast" | "learning" | "quest",
  payloadHash: string,
): SessionEventDraft => ({
  eventId,
  type: "receipt_recorded",
  payload: { receiptId, domain, payloadHash },
});

const globalFlagDraft = (eventId: string, flagId: string): SessionEventDraft => ({
  eventId,
  type: "world_flag_set",
  payload: { flagId, value: true, scope: "global" },
});

const createRoomEdits = (
  stages: readonly CisternReceiverStageSpec[],
  state: GameSessionState,
): readonly WorldMaterialEdit[] => {
  const edits = new Map<string, WorldMaterialEdit>();
  const set = (cellX: number, cellY: number, material: Material): void => {
    if (cellX < 0 || cellY < 0 || cellX >= WIDTH_CELLS || cellY >= HEIGHT_CELLS) return;
    edits.set(`${cellX}:${cellY}`, Object.freeze({ cellX, cellY, material }));
  };

  for (let cellX = 0; cellX < WIDTH_CELLS; cellX += 1) {
    set(cellX, HEIGHT_CELLS - 1, Material.Rock);
  }
  for (const stage of stages) {
    const bounds = stage.boundsCells;
    const left = bounds.x - 1;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    for (let cellY = bounds.y - 1; cellY <= bottom; cellY += 1) {
      set(left, cellY, Material.Rock);
      set(right, cellY, Material.Rock);
    }
    for (let cellX = left; cellX <= right; cellX += 1) set(cellX, bottom, Material.Rock);

    if (!globalFlagValue(state, RECEIVER_FLAG_BY_STAGE[stage.stageId])) continue;
    for (let cellY = bounds.y; cellY < bounds.y + bounds.height; cellY += 1) {
      for (let cellX = bounds.x; cellX < bounds.x + bounds.width; cellX += 1) {
        set(cellX, cellY, Material.Water);
      }
    }
  }
  return Object.freeze([...edits.values()]);
};

/**
 * Headless formal-room boundary for L-01. GameSession is the persisted truth;
 * the material controller is rebuilt from its MP and receiver flags after each
 * committed transaction, so a local reset or load cannot mint water, MP, or
 * language evidence.
 */
export class RpgL01RoomSession {
  private authoritativeSession: GameSession;
  private bridge!: GameSessionRuntimeBridge;
  private controller!: CisternDemoController;
  private learning!: CisternLearningSession;
  private readonly expressionCapacity: number;
  readonly entryRecoveryReceipt: MpRecoveryReceipt | null;

  constructor(session: GameSession, options: RpgL01Options = {}) {
    const state = session.snapshot();
    if (state.world.currentSceneId !== RPG_L01_SCENE_ID || state.checkpoint.sceneId !== RPG_L01_SCENE_ID) {
      throw new Error(`L-01 room requires current scene and checkpoint ${RPG_L01_SCENE_ID}`);
    }
    this.authoritativeSession = session;
    this.expressionCapacity = options.expressionCapacity ?? 2;
    if (!Number.isSafeInteger(this.expressionCapacity) || this.expressionCapacity < 1) {
      throw new RangeError("expressionCapacity must be a positive safe integer");
    }
    this.rebuildActors();
    this.entryRecoveryReceipt = options.activateEntryCheckpoint === false
      ? null
      : this.activateEntryCheckpointRecovery();
  }

  static fromSave(candidate: unknown, options: RpgL01Options = {}): RpgL01RoomSession {
    return new RpgL01RoomSession(GameSession.fromSave(candidate), options);
  }

  get session(): GameSession {
    return this.authoritativeSession;
  }

  get runtime(): GameSessionRuntimeBridge["runtime"] {
    return this.bridge.runtime;
  }

  get cistern(): CisternDemoController {
    return this.controller;
  }

  snapshot(): RpgL01Snapshot {
    const session = this.authoritativeSession.snapshot();
    const toolBypass = globalFlagValue(session, RPG_L01_WORLD_FLAGS.toolBypassUsed);
    const completed = globalFlagValue(session, RPG_L01_WORLD_FLAGS.highCisternReconnected) &&
      globalFlagValue(session, RPG_L01_WORLD_FLAGS.upperChannelAvailable) &&
      globalFlagValue(session, RPG_L01_WORLD_FLAGS.exitLadderLowered);
    return Object.freeze({
      session,
      runtime: this.bridge.runtime.snapshot(),
      cistern: this.controller.snapshot(),
      completed,
      resolutionMode: completed ? (toolBypass ? "tool_bypass" : "direct_language") : "unresolved",
    });
  }

  toSave(): GameSessionSave {
    return this.authoritativeSession.toSave();
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): RpgL01Snapshot {
    this.bridge.advanceTicks(ticks, input);
    this.authoritativeSession = this.bridge.session;
    return this.snapshot();
  }

  setExpression(expression: CisternExpressionId): RpgL01Snapshot {
    this.controller.setExpression(expression);
    return this.snapshot();
  }

  setDirection(direction: CisternDirectionId): RpgL01Snapshot {
    this.controller.setDirection(direction);
    return this.snapshot();
  }

  targetCurrentReceiver(): RpgL01Snapshot {
    this.controller.targetCurrentReceiver();
    return this.snapshot();
  }

  setTargetAnchorPx(anchorPx: PointPx): RpgL01Snapshot {
    this.controller.setTargetAnchorPx(anchorPx);
    return this.snapshot();
  }

  beginPreview(livingSafetyZones: readonly LivingSafetyZone[] = []): CisternPreviewResult {
    return this.controller.beginPreview(livingSafetyZones);
  }

  cancelPending(): RpgL01Snapshot {
    this.controller.cancelPending();
    return this.snapshot();
  }

  confirmPending(
    transactionId: string,
    currentLivingSafetyZones: readonly LivingSafetyZone[] = [],
  ): RpgL01ConfirmOutcome {
    requiredId(transactionId, "transactionId");
    const stage = this.controller.snapshot().stage;
    if (stage === "completed" || !this.controller.snapshot().pendingPlan) {
      return this.confirmOutcome(false, "no_pending_preview", null, null, null);
    }
    if (this.authoritativeSession.snapshot().receiptIndex[transactionId]) {
      this.controller.cancelPending();
      return this.confirmOutcome(false, "duplicate_transaction", null, "duplicate_receipt", null);
    }

    const confirmation = this.controller.confirmPending(transactionId, currentLivingSafetyZones);
    if (!confirmation.accepted || !confirmation.execution?.committed) {
      return this.confirmOutcome(false, "cast_rejected", confirmation, null, null);
    }

    const evidence = this.resolveDirectEvidence(stage, transactionId);
    const before = this.authoritativeSession.snapshot();
    const nextWorldVersion = before.mp.worldVersion + 1;
    if (!Number.isSafeInteger(nextWorldVersion)) {
      this.rebuildActors();
      return this.confirmOutcome(false, "session_rejected", confirmation, "invalid_event", evidence);
    }
    const drafts: SessionEventDraft[] = [
      {
        eventId: `session.l01.cast.mp.${transactionId}`,
        type: "mp_replaced",
        payload: {
          mp: {
            currentMp: confirmation.execution.snapshot.mp,
            maxMp: before.mp.maxMp,
            worldVersion: nextWorldVersion,
          },
        },
      },
      receiptDraft(
        `session.l01.cast.receipt.${transactionId}`,
        transactionId,
        "cast",
        `l01:${stage}:${confirmation.execution.planId}:charge:${confirmation.execution.mpCharge}`,
      ),
      globalFlagDraft(
        `session.l01.receiver.${stage}.${transactionId}`,
        RECEIVER_FLAG_BY_STAGE[stage],
      ),
      {
        eventId: `session.l01.quest.${stage}.${transactionId}`,
        type: "quest_stage_set",
        payload: {
          questId: RPG_L01_QUEST_ID,
          stageId: stage === "long" ? "completed" : `${stage}_receiver_satisfied`,
          stageOrdinal: stage === "long" ? 4 : stageOrdinal(stage),
        },
      },
    ];

    if (evidence.reason === "proposed") {
      const appliedEvidence = evidence.proposedEvents.filter((_, index) => evidence.reductions[index]?.applied);
      if (appliedEvidence.length > 0) {
        drafts.push({
          eventId: `session.l01.learning.${stage}.${transactionId}`,
          type: "learning_replaced",
          payload: { learning: evidence.learning },
        });
        for (const event of appliedEvidence) {
          drafts.push(receiptDraft(
            `session.l01.learning.receipt.${event.eventId}`,
            event.idempotencyKey,
            "learning",
            `l01:${event.eventType}:${event.eventId}`,
          ));
        }
      }
    }

    if (stage === "long") {
      drafts.push(
        globalFlagDraft(`session.l01.completed.cistern.${transactionId}`, RPG_L01_WORLD_FLAGS.highCisternReconnected),
        globalFlagDraft(`session.l01.completed.channel.${transactionId}`, RPG_L01_WORLD_FLAGS.upperChannelAvailable),
        globalFlagDraft(`session.l01.completed.ladder.${transactionId}`, RPG_L01_WORLD_FLAGS.exitLadderLowered),
      );
    }

    const commit = commitSessionProposal(this.authoritativeSession, {
      transactionId,
      drafts,
    });
    if (!commit.committed) {
      this.rebuildActors();
      return this.confirmOutcome(false, "session_rejected", confirmation, commit.reason, evidence);
    }
    this.authoritativeSession = commit.session;
    this.rebuildActors();
    return this.confirmOutcome(true, "confirmed", confirmation, null, evidence);
  }

  useMaintenanceToolBypass(transactionId: string): RpgL01ToolBypassOutcome {
    requiredId(transactionId, "transactionId");
    const state = this.authoritativeSession.snapshot();
    if (globalFlagValue(state, RPG_L01_WORLD_FLAGS.highCisternReconnected)) {
      return { accepted: false, reason: "already_completed", sessionReason: null, snapshot: this.snapshot() };
    }
    if (state.receiptIndex[transactionId]) {
      return { accepted: false, reason: "duplicate_transaction", sessionReason: "duplicate_receipt", snapshot: this.snapshot() };
    }
    const batch: SessionProposalBatch = {
      transactionId,
      drafts: [
        {
          eventId: `session.l01.quest.tool.${transactionId}`,
          type: "quest_stage_set",
          payload: { questId: RPG_L01_QUEST_ID, stageId: "completed", stageOrdinal: 4 },
        },
        receiptDraft(
          `session.l01.quest.tool.receipt.${transactionId}`,
          transactionId,
          "quest",
          "l01:maintenance_tool_bypass:completed:no_language_evidence",
        ),
        globalFlagDraft(`session.l01.tool.used.${transactionId}`, RPG_L01_WORLD_FLAGS.toolBypassUsed),
        globalFlagDraft(`session.l01.tool.cistern.${transactionId}`, RPG_L01_WORLD_FLAGS.highCisternReconnected),
        globalFlagDraft(`session.l01.tool.channel.${transactionId}`, RPG_L01_WORLD_FLAGS.upperChannelAvailable),
        globalFlagDraft(`session.l01.tool.ladder.${transactionId}`, RPG_L01_WORLD_FLAGS.exitLadderLowered),
      ],
    };
    const commit = commitSessionProposal(this.authoritativeSession, batch);
    if (!commit.committed) {
      return { accepted: false, reason: "session_rejected", sessionReason: commit.reason, snapshot: this.snapshot() };
    }
    this.authoritativeSession = commit.session;
    this.rebuildActors();
    return { accepted: true, reason: "completed", sessionReason: null, snapshot: this.snapshot() };
  }

  resetToEntryCheckpoint(eventId: string): RpgL01ResetOutcome {
    requiredId(eventId, "eventId");
    const reset = this.bridge.resetToCheckpoint(eventId);
    this.authoritativeSession = this.bridge.session;
    this.rebuildActors();
    return { resetApplied: reset.sessionResult.applied || reset.sessionResult.duplicate, snapshot: this.snapshot() };
  }

  private activateEntryCheckpointRecovery(): MpRecoveryReceipt | null {
    const state = this.authoritativeSession.snapshot();
    const activationId = `l01.entry.${state.checkpoint.id}.${state.checkpoint.revision}`;
    const persistedReceiptId = `checkpoint:${activationId}`;
    if (state.receiptIndex[persistedReceiptId]) return null;
    const proposal = this.learning.proposeCheckpointRecovery({ activationId });
    const recovery = this.controller.applyMpRecovery(proposal);
    if (!recovery.accepted || !recovery.receipt) return null;
    const sessionProposal = proposeCisternRecovery(recovery);
    if (!sessionProposal.accepted) {
      this.rebuildActors();
      return recovery.receipt;
    }
    const commit = commitSessionProposal(this.authoritativeSession, sessionProposal.batch);
    if (!commit.committed) {
      this.rebuildActors();
      return recovery.receipt;
    }
    this.authoritativeSession = commit.session;
    this.rebuildActors();
    return recovery.receipt;
  }

  private resolveDirectEvidence(stage: CisternStage, transactionId: string): EvidenceProposalResult {
    return this.learning.resolveReceiverAttempt({
      attemptId: transactionId,
      stage,
      taskId: "ch01_length_cistern",
      taskFamilyId: `cistern.length.${stage}`,
      variantHash: `rpg-l01.${stage}.formal-room`,
      normalizedEnvironmentFingerprint: `env.rpg-l01.${stage}.receiver-v1`,
      receiverGoalSatisfied: true,
      selectedActionClass: STAGE_ACTIONS[stage],
      toolBypass: false,
      promptLevel: 0,
      interpretationStatus: "executed_legal",
      answerVisible: false,
      fixedSlotOnly: false,
      colorOnlyCue: false,
      activeRetrieval: true,
    });
  }

  private confirmOutcome(
    accepted: boolean,
    reason: RpgL01ConfirmReason,
    confirmation: CisternConfirmResult | null,
    sessionReason: SessionApplyReason | null,
    evidence: EvidenceProposalResult | null,
  ): RpgL01ConfirmOutcome {
    return { accepted, reason, confirmation, sessionReason, evidence, snapshot: this.snapshot() };
  }

  private rebuildActors(): void {
    const state = this.authoritativeSession.snapshot();
    const stages = createDefaultCisternStages(WIDTH_CELLS, HEIGHT_CELLS);
    this.controller = new CisternDemoController({
      widthCells: WIDTH_CELLS,
      heightCells: HEIGHT_CELLS,
      initialMp: state.mp.currentMp,
      maxMp: state.mp.maxMp,
      stageSpecs: stages,
      initialWorldEdits: createRoomEdits(stages, state),
    });
    if (STAGE_ORDER.some((stage) => globalFlagValue(state, RECEIVER_FLAG_BY_STAGE[stage]))) {
      this.controller.advancePhysics(1);
    }
    this.learning = new CisternLearningSession({
      playerSaveId: this.authoritativeSession.sessionId,
      expressionCapacity: this.expressionCapacity,
      learningSnapshot: state.learning,
    });
    this.bridge = new GameSessionRuntimeBridge({
      session: this.authoritativeSession,
      scenes: [RPG_L01_SCENE],
      sceneAreas: { [RPG_L01_SCENE_ID]: RPG_L01_AREA_ID },
      entranceByScene: { [RPG_L01_SCENE_ID]: "entry" },
      viewportPx: { x: 320, y: 128 },
    });
  }
}

export const RPG_L01_DIRECT_EXPRESSIONS: Readonly<Record<CisternStage, CisternExpressionId>> =
  STAGE_EXPRESSIONS;

export const createRpgL01InitialSession = (options: Readonly<{
  sessionId: string;
  currentMp?: number;
  maxMp?: number;
  learning?: GameSessionState["learning"];
}>): GameSession => {
  const maxMp = options.maxMp ?? 24;
  const currentMp = options.currentMp ?? maxMp;
  return GameSession.create({
    sessionId: options.sessionId,
    mp: { currentMp, maxMp, worldVersion: 0 },
    currentSceneId: RPG_L01_SCENE_ID,
    checkpoint: {
      id: RPG_L01_ENTRY_CHECKPOINT_ID,
      sceneId: RPG_L01_SCENE_ID,
      position: { x: 16, y: PLAYER_FLOOR_Y },
      revision: 0,
    },
    learning: options.learning,
  });
};
