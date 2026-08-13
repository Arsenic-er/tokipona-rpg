import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeSceneManifestIndex,
  type RuntimeSceneExitManifest,
  type RuntimeSceneManifest,
  type RuntimeSceneNpcManifest,
} from "../content/runtime-scene-manifest";
import { CisternLearningSession } from "../learning/cistern-session";
import {
  GameSessionRuntimeBridge,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import type { SceneDefinition } from "../runtime/scene";
import {
  commitSessionProposal,
  proposeMpRecovery,
  proposeQuestStage,
  proposeSurvivalTransaction,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionEconomySummary,
  type SessionReceiptDomain,
} from "../session/game-session";
import { CastExecutionLedger } from "../spells/cast-plan";
import { SurvivalSystem } from "./survival";

const SCENE_INDEX = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);

const requiredManifestByRegionNode = (regionNodeId: string): RuntimeSceneManifest => {
  const matches = Object.values(SCENE_INDEX.byId).filter((scene) => scene.regionNodeId === regionNodeId);
  if (matches.length !== 1) {
    throw new Error(`expected one generated scene for region node ${regionNodeId}, received ${matches.length}`);
  }
  return matches[0]!;
};

const requireOne = <T>(values: readonly T[], predicate: (value: T) => boolean, label: string): T => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) throw new Error(`expected one ${label}, received ${matches.length}`);
  return matches[0]!;
};

const SETTLEMENT_MANIFEST = requiredManifestByRegionNode("valley.settlement");
const SETTLEMENT_ENTRY = requireOne(
  SETTLEMENT_MANIFEST.entrances,
  (entrance) => entrance.id === SETTLEMENT_MANIFEST.recovery.entryEntranceId,
  "settlement recovery entrance",
);
const INBOUND_FROM_STREAM = requireOne(
  SETTLEMENT_MANIFEST.inboundRoutes,
  (route) => route.entranceId === SETTLEMENT_ENTRY.id,
  "settlement inbound route from stream",
);
const ORIENTATION_TASK = requireOne(
  SETTLEMENT_MANIFEST.tasks,
  (task) => task.id === "ch01_settlement_orientation",
  "settlement orientation task",
);
if (!ORIENTATION_TASK.nonviolent || ORIENTATION_TASK.magicRequired ||
    !ORIENTATION_TASK.reward.claimOnce || !ORIENTATION_TASK.reward.receiptRequired ||
    ORIENTATION_TASK.reward.currency !== "coin" || !Number.isSafeInteger(ORIENTATION_TASK.reward.amount) ||
    ORIENTATION_TASK.reward.amount <= 0) {
  throw new Error("settlement orientation task must be nonviolent and define a positive claim-once coin reward");
}

const requiredFacility = (kind: string): void => {
  const facility = SETTLEMENT_MANIFEST.facilities.find((candidate) => candidate.kind === kind);
  if (!facility) throw new Error(`settlement is missing required facility kind ${kind}`);
};
requiredFacility("public_well");
requiredFacility("communal_plant_meal");
requiredFacility("public_meditation_court");
requiredFacility("job_board");

const REQUIRED_PROFESSIONS = Object.freeze([
  "settlement.facility_manager",
  "settlement.repair_contractor",
  "settlement.supply_trader",
] as const);
for (const professionId of REQUIRED_PROFESSIONS) {
  if (!SETTLEMENT_MANIFEST.npcs.some((npc) => npc.professionId === professionId)) {
    throw new Error(`settlement is missing required profession ${professionId}`);
  }
}
if (SETTLEMENT_MANIFEST.npcs.length !== REQUIRED_PROFESSIONS.length) {
  throw new Error("settlement orientation expects exactly three service NPCs");
}

const isSceneTargetExit = (
  exit: RuntimeSceneExitManifest,
): exit is RuntimeSceneExitManifest & Readonly<{
  target: Readonly<{ kind: "scene"; sceneId: string; entranceId: string }>;
}> => exit.target.kind === "scene" && SCENE_INDEX.byId[exit.target.sceneId] !== undefined;

const toRuntimeScene = (manifest: RuntimeSceneManifest): SceneDefinition => {
  const entrances = manifest.entrances.map((entrance) => Object.freeze({
    id: entrance.id,
    position: Object.freeze({ ...entrance.spawnPx }),
  }));
  const exits = manifest.exits.filter(isSceneTargetExit).map((exit) => Object.freeze({
    id: exit.id,
    bounds: Object.freeze({ ...exit.boundsPx }),
    targetSceneId: exit.target.sceneId,
    targetEntranceId: exit.target.entranceId,
  }));
  return Object.freeze({
    id: manifest.sceneId,
    collisionRows: manifest.collisionRows,
    defaultEntranceId: manifest.recovery.entryEntranceId,
    entrances: Object.freeze(entrances),
    exits: Object.freeze(exits),
  });
};

const SETTLEMENT_RUNTIME_SCENES = Object.freeze(
  Object.values(SCENE_INDEX.byId).map(toRuntimeScene),
);

export const PROLOGUE_SETTLEMENT_SCENE_ID = SETTLEMENT_MANIFEST.sceneId;
export const PROLOGUE_SETTLEMENT_AREA_ID = SETTLEMENT_MANIFEST.regionId;
export const PROLOGUE_SETTLEMENT_TASK_ID = ORIENTATION_TASK.id;
export const PROLOGUE_SETTLEMENT_REWARD_COIN = ORIENTATION_TASK.reward.amount;
export const PROLOGUE_SETTLEMENT_NPC_IDS = Object.freeze(
  SETTLEMENT_MANIFEST.npcs.map((npc) => npc.id),
);

export type SettlementDialogueTopic = "role" | "public_services" | "work" | "trade" | "directions";
export type SettlementActionReason =
  | "committed"
  | "duplicate"
  | "wrong_scene"
  | "wrong_source_scene"
  | "unknown_npc"
  | "unsupported_topic"
  | "prerequisite_missing"
  | "already_completed"
  | "transaction_conflict"
  | "session_rejected";

export interface SettlementDialogueNode {
  readonly npcId: string;
  readonly professionId: string;
  readonly professionLabelZh: string;
  readonly topic: SettlementDialogueTopic;
  readonly facts: readonly string[];
  readonly clarificationTopics: readonly SettlementDialogueTopic[];
}

export interface SettlementDialogueResult {
  readonly accepted: boolean;
  readonly reason: "read_only" | "wrong_scene" | "unknown_npc" | "unsupported_topic";
  readonly node: SettlementDialogueNode | null;
  /** Dialogue and clarification are deliberately read-only. */
  readonly sessionRevision: number;
}

export interface SettlementActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: SettlementActionReason;
  readonly snapshot: PrologueSettlementSnapshot;
}

export interface SettlementEntryResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: SettlementActionReason;
  readonly settlement: PrologueSettlementSession | null;
}

export interface PrologueSettlementSnapshot {
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly sceneManifestId: string;
  readonly npcIds: readonly string[];
  readonly publicServicesFree: true;
  readonly orientationTask: Readonly<{
    taskId: string;
    stage: "available" | "accepted" | "surveyed" | "completed";
    rewardCoin: number;
    nonviolent: true;
    magicRequired: false;
  }>;
  readonly softLockRecovery: Readonly<{
    available: true;
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

const globalFlag = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "global" && flag.flagId === flagId && flag.value === true
  );

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

const receiptMatches = (
  state: GameSessionState,
  receiptId: string,
  domain: SessionReceiptDomain,
  payloadHash: string,
): "absent" | "duplicate" | "conflict" => {
  const prior = state.receiptIndex[receiptId];
  if (!prior) return "absent";
  return prior.domain === domain && prior.payloadHash === payloadHash ? "duplicate" : "conflict";
};

const economyWithCoinDelta = (state: GameSessionState, amount: number): SessionEconomySummary => ({
  coin: state.economy.coin + amount,
  walletRevision: state.economy.walletRevision + 1,
  // A wallet-only reward must preserve the canonical inventory revision and every lot.
  inventoryRevision: state.economy.inventoryRevision,
  lots: state.economy.lots.map((lot) => ({ ...lot })),
});

const factsForNpc = (npc: RuntimeSceneNpcManifest, topic: SettlementDialogueTopic): readonly string[] | null => {
  const shared: Partial<Record<SettlementDialogueTopic, readonly string[]>> = {
    role: [`profession:${npc.professionId}`, ...npc.functions.map((value) => `function:${value}`)],
    directions: ["public_well:west", "meditation_court:center", "waterwheel_exit:east"],
  };
  if (npc.professionId === "settlement.facility_manager") {
    shared.public_services = ["public_well:free", "communal_plant_meal:free", "checkpoint:town_entry"];
    shared.work = ["repair_board:contractor_assigns"];
  } else if (npc.professionId === "settlement.repair_contractor") {
    shared.work = ["survey_job:nonviolent", `reward_coin:${ORIENTATION_TASK.reward.amount}`, "magic_required:false"];
    shared.public_services = ["repair_board:public_notice"];
  } else if (npc.professionId === "settlement.supply_trader") {
    shared.trade = ["trade_entry:settlement.trade.supply_stall", "public_relief:not_for_sale"];
    shared.public_services = ["canteen_refill:explained", "public_well:free"];
  }
  return shared[topic] ?? null;
};

const rewardReceiptId = (sessionId: string): string =>
  `reward:${sessionId}:${ORIENTATION_TASK.id}`;

const taskStage = (state: GameSessionState): PrologueSettlementSnapshot["orientationTask"]["stage"] => {
  const quest = state.quests[ORIENTATION_TASK.id];
  if (!quest) return "available";
  if (quest.stageOrdinal >= 3) return "completed";
  if (quest.stageOrdinal >= 2) return "surveyed";
  return "accepted";
};

/**
 * Headless N02 gameplay coordinator. Executors are reconstructed from the
 * aggregate for each transaction; only GameSession is ever saved.
 */
export class PrologueSettlementSession {
  private authoritativeSession: GameSession;
  private bridge!: GameSessionRuntimeBridge;

  constructor(session: GameSession) {
    if (!SCENE_INDEX.byId[session.snapshot().world.currentSceneId]) {
      throw new Error("settlement session requires a scene present in the generated runtime manifest");
    }
    this.authoritativeSession = session;
    this.rebuildBridge();
  }

  static enterFromStream(session: GameSession, transactionId: string): SettlementEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const state = session.snapshot();
    if (state.world.currentSceneId !== INBOUND_FROM_STREAM.sourceSceneId &&
        state.world.currentSceneId !== SETTLEMENT_MANIFEST.sceneId) {
      return { accepted: false, duplicate: false, reason: "wrong_source_scene", settlement: null };
    }
    const payloadHash = `settlement-entry:${SETTLEMENT_MANIFEST.sceneId}:${SETTLEMENT_ENTRY.id}`;
    const prior = receiptMatches(state, id, "world", payloadHash);
    if (prior === "conflict") {
      return { accepted: false, duplicate: false, reason: "transaction_conflict", settlement: null };
    }
    if (prior === "duplicate") {
      return {
        accepted: true,
        duplicate: true,
        reason: "duplicate",
        settlement: new PrologueSettlementSession(session),
      };
    }
    const checkpoint = {
      id: "checkpoint.valley.settlement.entry",
      sceneId: SETTLEMENT_MANIFEST.sceneId,
      position: { ...SETTLEMENT_ENTRY.spawnPx },
      revision: state.checkpoint.revision + 1,
    };
    const batch: SessionProposalBatch = {
      transactionId: id,
      drafts: [
        {
          eventId: `session.settlement.entry.scene.${id}`,
          type: "scene_entered",
          payload: { sceneId: SETTLEMENT_MANIFEST.sceneId },
        },
        {
          eventId: `session.settlement.entry.flag.${id}`,
          type: "world_flag_set",
          payload: { flagId: "settlement_reached", value: true, scope: "global" },
        },
        {
          eventId: `session.settlement.entry.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint },
        },
        receiptDraft(`session.settlement.entry.receipt.${id}`, id, "world", payloadHash),
      ],
    };
    const commit = commitSessionProposal(session, batch);
    if (!commit.committed) {
      return { accepted: false, duplicate: false, reason: "session_rejected", settlement: null };
    }
    return {
      accepted: true,
      duplicate: false,
      reason: "committed",
      settlement: new PrologueSettlementSession(commit.session),
    };
  }

  static fromSave(candidate: unknown): PrologueSettlementSession {
    return new PrologueSettlementSession(GameSession.fromSave(candidate));
  }

  get session(): GameSession {
    return this.authoritativeSession;
  }

  toSave(): GameSessionSave {
    return this.authoritativeSession.toSave();
  }

  snapshot(): PrologueSettlementSnapshot {
    const session = this.authoritativeSession.snapshot();
    return Object.freeze({
      session,
      runtime: this.bridge.runtime.snapshot(),
      sceneManifestId: SETTLEMENT_MANIFEST.sceneId,
      npcIds: PROLOGUE_SETTLEMENT_NPC_IDS,
      publicServicesFree: true,
      orientationTask: Object.freeze({
        taskId: ORIENTATION_TASK.id,
        stage: taskStage(session),
        rewardCoin: ORIENTATION_TASK.reward.amount,
        nonviolent: true,
        magicRequired: false,
      }),
      softLockRecovery: Object.freeze({
        available: true,
        maximumSeconds: SETTLEMENT_MANIFEST.recovery.maximumSoftlockRecoverySeconds,
        actions: SETTLEMENT_MANIFEST.recovery.actions,
      }),
      killCount: 0,
    });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueSettlementSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    this.bridge.advanceTicks(ticks, input);
    this.authoritativeSession = this.bridge.session;
    return this.snapshot();
  }

  talk(npcId: string, topic: SettlementDialogueTopic = "role"): SettlementDialogueResult {
    if (!this.inSettlement()) return this.dialogueResult(false, "wrong_scene", null);
    const npc = SETTLEMENT_MANIFEST.npcs.find((candidate) => candidate.id === npcId);
    if (!npc) return this.dialogueResult(false, "unknown_npc", null);
    const facts = factsForNpc(npc, topic);
    if (!facts) return this.dialogueResult(false, "unsupported_topic", null);
    return this.dialogueResult(true, "read_only", Object.freeze({
      npcId: npc.id,
      professionId: npc.professionId,
      professionLabelZh: npc.professionLabelZh,
      topic,
      facts: Object.freeze([...facts]),
      clarificationTopics: Object.freeze(
        (["role", "public_services", "work", "trade", "directions"] as const)
          .filter((candidate) => factsForNpc(npc, candidate) !== null),
      ),
    }));
  }

  clarify(npcId: string, topic: SettlementDialogueTopic): SettlementDialogueResult {
    return this.talk(npcId, topic);
  }

  usePublicRelief(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const existing = state.receiptIndex[id];
    if (existing) {
      return existing.domain === "survival"
        ? this.result(true, true, "duplicate")
        : this.result(false, false, "transaction_conflict");
    }
    const executor = SurvivalSystem.fromSave(state.survival);
    const execution = executor.usePublicRelief(id);
    const proposal = proposeSurvivalTransaction(id, execution, executor.toSave());
    if (!proposal.accepted) return this.result(false, execution.duplicate, "session_rejected");
    const batch: SessionProposalBatch = {
      transactionId: id,
      drafts: [
        ...proposal.batch.drafts,
        {
          eventId: `session.settlement.relief.well.${id}`,
          type: "world_flag_set",
          payload: { flagId: "public_well_used", value: true, scope: "global" },
        },
        {
          eventId: `session.settlement.relief.meal.${id}`,
          type: "world_flag_set",
          payload: { flagId: "communal_plant_meal_offered", value: true, scope: "global" },
        },
      ],
    };
    return this.commit(batch);
  }

  meditate(transactionId: string, answerAccepted: boolean): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const receiptId = `meditation:${id}`;
    const prior = state.receiptIndex[receiptId];
    if (prior) {
      const expectedAnswer = `:${String(answerAccepted)}`;
      return prior.domain === "mp_recovery" && prior.payloadHash.endsWith(expectedAnswer)
        ? this.result(true, true, "duplicate")
        : this.result(false, false, "transaction_conflict");
    }
    const learning = new CisternLearningSession({
      playerSaveId: this.authoritativeSession.sessionId,
      expressionCapacity: 1,
      learningSnapshot: state.learning,
    });
    const proposal = learning.proposeMeditationRecovery({
      recoveryId: id,
      answerAccepted,
      // Recovery is guaranteed, but this N02 orientation prompt never writes evidence.
      evidenceEligible: false,
    });
    const ledger = new CastExecutionLedger(state.mp.currentMp, state.mp.worldVersion, state.mp.maxMp);
    const execution = ledger.applyMpRecovery(proposal);
    const sessionProposal = proposeMpRecovery(execution);
    if (!sessionProposal.accepted) return this.result(false, execution.duplicate, "session_rejected");
    const batch: SessionProposalBatch = {
      transactionId: sessionProposal.batch.transactionId,
      drafts: [
        ...sessionProposal.batch.drafts,
        {
          eventId: `session.settlement.meditation.flag.${id}`,
          type: "world_flag_set",
          payload: { flagId: "meditation_court_activated", value: true, scope: "global" },
        },
      ],
    };
    return this.commit(batch);
  }

  acceptSurveyJob(transactionId: string): SettlementActionResult {
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    if (taskStage(state) !== "available") return this.result(true, true, "duplicate");
    return this.commitQuestStage(transactionId, "accepted", 1);
  }

  inspectSurveyMarkers(transactionId: string): SettlementActionResult {
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const stage = taskStage(this.authoritativeSession.snapshot());
    if (stage === "available") return this.result(false, false, "prerequisite_missing");
    if (stage === "surveyed" || stage === "completed") return this.result(true, true, "duplicate");
    return this.commitQuestStage(transactionId, "surveyed", 2);
  }

  submitSurveyJob(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const stage = taskStage(state);
    const rewardId = rewardReceiptId(this.authoritativeSession.sessionId);
    const rewardHash = `quest-reward:${ORIENTATION_TASK.id}:coin:${ORIENTATION_TASK.reward.amount}`;
    const rewardPrior = receiptMatches(state, rewardId, "quest", rewardHash);
    if (rewardPrior === "conflict") return this.result(false, false, "transaction_conflict");
    if (stage === "completed" || rewardPrior === "duplicate") return this.result(true, true, "already_completed");
    if (stage !== "surveyed") return this.result(false, false, "prerequisite_missing");

    const questBatch = proposeQuestStage(id, ORIENTATION_TASK.id, "completed", 3);
    const expectedTxHash = `quest:${ORIENTATION_TASK.id}:completed:3`;
    const txPrior = receiptMatches(state, id, "quest", expectedTxHash);
    if (txPrior === "conflict") return this.result(false, false, "transaction_conflict");
    if (txPrior === "duplicate") return this.result(true, true, "duplicate");
    const batch: SessionProposalBatch = {
      transactionId: id,
      drafts: [
        ...questBatch.drafts,
        {
          eventId: `session.settlement.reward.wallet.${id}`,
          type: "economy_replaced",
          payload: { economy: economyWithCoinDelta(state, ORIENTATION_TASK.reward.amount) },
        },
        receiptDraft(
          `session.settlement.reward.receipt.${id}`,
          rewardId,
          "quest",
          rewardHash,
        ),
      ],
    };
    return this.commit(batch);
  }

  setCheckpoint(transactionId: string, checkpointId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const prior = state.receiptIndex[id];
    if (prior) {
      return prior.domain === "world"
        ? this.result(true, true, "duplicate")
        : this.result(false, false, "transaction_conflict");
    }
    try {
      this.bridge.setCheckpoint(id, requiredId(checkpointId, "checkpointId"));
      this.authoritativeSession = this.bridge.session;
      return this.result(true, false, "committed");
    } catch {
      return this.result(false, false, "session_rejected");
    }
  }

  resetToCheckpoint(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    try {
      const commit = this.bridge.resetToCheckpoint(id);
      this.authoritativeSession = this.bridge.session;
      return this.result(true, commit.sessionResult.duplicate, commit.sessionResult.duplicate ? "duplicate" : "committed");
    } catch {
      return this.result(false, false, "session_rejected");
    }
  }

  resetArea(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    try {
      const commit = this.bridge.resetArea(id, PROLOGUE_SETTLEMENT_AREA_ID);
      this.authoritativeSession = this.bridge.session;
      return this.result(true, commit.sessionResult.duplicate, commit.sessionResult.duplicate ? "duplicate" : "committed");
    } catch {
      return this.result(false, false, "session_rejected");
    }
  }

  /** Public recovery path for lost survey props, bad local geometry, or a fall. */
  recoverSoftLock(transactionId: string): SettlementActionResult {
    return this.resetToCheckpoint(transactionId);
  }

  private commitQuestStage(transactionId: string, stageId: string, stageOrdinal: number): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    const state = this.authoritativeSession.snapshot();
    const payloadHash = `quest:${ORIENTATION_TASK.id}:${stageId}:${stageOrdinal}`;
    const prior = receiptMatches(state, id, "quest", payloadHash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    return this.commit(proposeQuestStage(id, ORIENTATION_TASK.id, stageId, stageOrdinal));
  }

  private commit(batch: SessionProposalBatch): SettlementActionResult {
    const commit = commitSessionProposal(this.authoritativeSession, batch);
    if (!commit.committed) return this.result(false, false, "session_rejected");
    this.authoritativeSession = commit.session;
    this.rebuildBridge();
    return this.result(true, false, "committed");
  }

  private dialogueResult(
    accepted: boolean,
    reason: SettlementDialogueResult["reason"],
    node: SettlementDialogueNode | null,
  ): SettlementDialogueResult {
    return Object.freeze({
      accepted,
      reason,
      node,
      sessionRevision: this.authoritativeSession.snapshot().revision,
    });
  }

  private result(
    accepted: boolean,
    duplicate: boolean,
    reason: SettlementActionReason,
  ): SettlementActionResult {
    return Object.freeze({ accepted, duplicate, reason, snapshot: this.snapshot() });
  }

  private inSettlement(): boolean {
    return this.bridge.runtime.snapshot().sceneId === SETTLEMENT_MANIFEST.sceneId;
  }

  private rebuildBridge(): void {
    const entranceByScene = Object.fromEntries(
      Object.values(SCENE_INDEX.byId).map((scene) => [scene.sceneId, scene.recovery.entryEntranceId]),
    );
    const sceneAreas = Object.fromEntries(
      Object.values(SCENE_INDEX.byId).map((scene) => [scene.sceneId, scene.regionId]),
    );
    this.bridge = new GameSessionRuntimeBridge({
      session: this.authoritativeSession,
      scenes: SETTLEMENT_RUNTIME_SCENES,
      sceneAreas,
      entranceByScene,
      viewportPx: { x: 320, y: 160 },
      fixedHz: 60,
    });
  }
}

export const createPrologueSettlementInitialSession = (options: Readonly<{
  sessionId: string;
  currentMp?: number;
  maxMp?: number;
  economy?: SessionEconomySummary;
}>): GameSession => {
  const maxMp = options.maxMp ?? 24;
  return GameSession.create({
    sessionId: requiredId(options.sessionId, "sessionId"),
    mp: { currentMp: options.currentMp ?? maxMp, maxMp, worldVersion: 0 },
    currentSceneId: SETTLEMENT_MANIFEST.sceneId,
    checkpoint: {
      id: "checkpoint.valley.settlement.entry",
      sceneId: SETTLEMENT_MANIFEST.sceneId,
      position: { ...SETTLEMENT_ENTRY.spawnPx },
      revision: 0,
    },
    economy: options.economy,
  });
};

export const settlementReached = (state: GameSessionState): boolean =>
  globalFlag(state, "settlement_reached");
