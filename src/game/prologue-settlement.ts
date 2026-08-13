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
  proposeSurvivalTransaction,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionEconomyState,
  type SessionEconomySummary,
  type SessionReceiptDomain,
} from "../session/game-session";
import { CastExecutionLedger } from "../spells/cast-plan";
import { SurvivalSystem } from "./survival";
import {
  authorizedTradeEntry,
  classifySettlementOperation,
  exactManifestInteraction,
  settlementOperationFingerprint,
  settlementOperationReceiptDraft,
  type SettlementInteractionToken,
} from "./prologue-settlement-contract";

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
requiredFacility("trade_entry");

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
export const PROLOGUE_SETTLEMENT_REGION_FLAG_IDS = Object.freeze({
  settlementReached: "settlement_reached",
  publicWellUsed: "public_well_used",
  communalPlantMealOffered: "communal_plant_meal_offered",
  meditationCourtActivated: "meditation_court_activated",
});
export const PROLOGUE_SETTLEMENT_TASK_ID = ORIENTATION_TASK.id;
export const PROLOGUE_SETTLEMENT_REWARD_COIN = ORIENTATION_TASK.reward.amount;
export const PROLOGUE_SETTLEMENT_NPC_IDS = Object.freeze(
  SETTLEMENT_MANIFEST.npcs.map((npc) => npc.id),
);
export const PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS = Object.freeze([
  "settlement.survey_marker.public_well",
  "settlement.survey_marker.meditation_court",
  "settlement.survey_marker.east_gate",
] as const);
export const PROLOGUE_SETTLEMENT_INTERACTIONS = Object.freeze({
  publicWell: "settlement.draw_public_water",
  publicMeal: "settlement.take_plant_meal",
  meditation: "settlement.meditate",
  acceptSurvey: "settlement.accept_survey",
  inspectSurveyMarker: "settlement.inspect_survey_markers",
  submitSurvey: "settlement.submit_survey",
  openSupplyTrade: "settlement.open_supply_trade",
} as const);
export const PROLOGUE_SETTLEMENT_REPAIR_CONTRACTOR_ID = "settlement.npc.repair_contractor";
export const PROLOGUE_SETTLEMENT_SUPPLY_TRADER_ID = "settlement.npc.supply_trader";
export const PROLOGUE_SETTLEMENT_JOB_BOARD_ID = "settlement.facility.repair_board";
export const PROLOGUE_SETTLEMENT_SUPPLY_STALL_ID = "settlement.facility.supply_stall";

const REQUIRED_SOFTLOCK_ACTIONS = Object.freeze([
  "reissue_nontradeable_survey_slate",
  "restore_checkpoint_local_markers",
] as const);
for (const action of REQUIRED_SOFTLOCK_ACTIONS) {
  if (!SETTLEMENT_MANIFEST.recovery.actions.includes(action) || !ORIENTATION_TASK.recoveryActions.includes(action)) {
    throw new Error(`settlement manifest is missing task-safe recovery action ${action}`);
  }
}

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
  | "unauthorized_interaction"
  | "unknown_marker"
  | "reward_inconsistent"
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
  readonly entryMode: "direct_transition" | "adopted_runtime_transition" | null;
  readonly settlement: PrologueSettlementSession | null;
}

export interface SettlementReliefInteractionToken {
  readonly wellInteractionId: string;
  readonly mealInteractionId: string;
}

export interface SettlementTradeOpenResult extends SettlementActionResult {
  readonly tradeEntryId: string | null;
  readonly merchantIds: readonly string[];
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
    surveyedMarkerIds: readonly string[];
    requiredSurveyMarkerCount: number;
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


const regionFlag = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === PROLOGUE_SETTLEMENT_AREA_ID &&
    flag.flagId === flagId && flag.value === true
  );

const surveyMarkerFlagId = (markerId: string): string => `settlement.survey.inspected:${markerId}`;

const surveyedMarkerIds = (state: GameSessionState): readonly string[] =>
  PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.filter((markerId) =>
    regionFlag(state, surveyMarkerFlagId(markerId))
  );

const regionFlagDraft = (eventId: string, flagId: string, value: boolean | string): SessionEventDraft => ({
  eventId,
  type: "world_flag_set",
  payload: {
    flagId,
    value,
    scope: "region",
    regionId: PROLOGUE_SETTLEMENT_AREA_ID,
  },
});

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

const economyWalletRewardDraft = (
  eventId: string,
  state: GameSessionState,
  amount: number,
): SessionEventDraft => ({
  eventId,
  type: "economy_wallet_changed",
  payload: {
    expectedWalletRevision: state.economy.walletRevision,
    nextWalletRevision: state.economy.walletRevision + 1,
    coinDelta: amount,
    nextCoin: state.economy.coin + amount,
  },
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
    return this.commitEntry(session, transactionId, "direct_transition");
  }

  /**
   * Adopts a transition already committed by GameSessionRuntimeBridge. This is
   * intentionally separate from enterFromStream: the direct API must never
   * accept a fresh transaction ID merely because the aggregate is at N02.
   */
  static adoptRuntimeEntry(session: GameSession, transactionId: string): SettlementEntryResult {
    return this.commitEntry(session, transactionId, "adopted_runtime_transition");
  }

  private static commitEntry(
    session: GameSession,
    transactionId: string,
    mode: "direct_transition" | "adopted_runtime_transition",
  ): SettlementEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const state = session.snapshot();
    const fingerprint = settlementOperationFingerprint("settlement_entry", {
      mode,
      sourceSceneId: INBOUND_FROM_STREAM.sourceSceneId,
      sourceExitId: INBOUND_FROM_STREAM.sourceExitId,
      targetSceneId: SETTLEMENT_MANIFEST.sceneId,
      targetEntranceId: SETTLEMENT_ENTRY.id,
    });
    const prior = classifySettlementOperation(state, id, fingerprint);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") {
      return state.world.currentSceneId === SETTLEMENT_MANIFEST.sceneId
        ? this.entryResult(true, true, "duplicate", mode, new PrologueSettlementSession(session))
        : this.entryResult(false, false, "wrong_source_scene", null, null);
    }

    if (mode === "direct_transition" && state.world.currentSceneId !== INBOUND_FROM_STREAM.sourceSceneId) {
      return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    if (mode === "adopted_runtime_transition") {
      if (state.world.currentSceneId !== SETTLEMENT_MANIFEST.sceneId ||
          !this.hasCanonicalRuntimeHandoff(session)) {
        return this.entryResult(false, false, "wrong_source_scene", null, null);
      }
    }

    const checkpoint = {
      id: "checkpoint.valley.settlement.entry",
      sceneId: SETTLEMENT_MANIFEST.sceneId,
      position: { ...SETTLEMENT_ENTRY.spawnPx },
      revision: state.checkpoint.revision + 1,
    };
    const drafts: SessionEventDraft[] = [];
    if (mode === "direct_transition") {
      drafts.push({
        eventId: `session.settlement.entry.scene.${id}`,
        type: "scene_entered",
        payload: { sceneId: SETTLEMENT_MANIFEST.sceneId },
      });
    }
    drafts.push(
      {
        eventId: `session.settlement.entry.flag.${id}`,
        type: "world_flag_set",
        payload: { flagId: PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.settlementReached, value: true, scope: "region", regionId: PROLOGUE_SETTLEMENT_AREA_ID },
      },
      {
        eventId: `session.settlement.entry.checkpoint.${id}`,
        type: "checkpoint_set",
        payload: { checkpoint },
      },
      settlementOperationReceiptDraft(id, fingerprint),
    );
    const commit = commitSessionProposal(session, { transactionId: id, drafts });
    if (!commit.committed) return this.entryResult(false, false, "session_rejected", null, null);
    return this.entryResult(
      true,
      false,
      "committed",
      mode,
      new PrologueSettlementSession(commit.session),
    );
  }

  private static hasCanonicalRuntimeHandoff(session: GameSession): boolean {
    if (!regionFlag(session.snapshot(), "settlement_entry_crossed")) return false;
    const suffix = `${INBOUND_FROM_STREAM.sourceSceneId}->${SETTLEMENT_MANIFEST.sceneId}`;
    return [...session.events()].reverse().some((event) =>
      event.type === "scene_entered" && event.payload.sceneId === SETTLEMENT_MANIFEST.sceneId &&
      event.eventId.endsWith(suffix)
    );
  }

  private static entryResult(
    accepted: boolean,
    duplicate: boolean,
    reason: SettlementActionReason,
    entryMode: SettlementEntryResult["entryMode"],
    settlement: PrologueSettlementSession | null,
  ): SettlementEntryResult {
    return Object.freeze({ accepted, duplicate, reason, entryMode, settlement });
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
        surveyedMarkerIds: Object.freeze([...surveyedMarkerIds(session)]),
        requiredSurveyMarkerCount: PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.length,
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
    return this.usePublicReliefAt(transactionId, {
      wellInteractionId: PROLOGUE_SETTLEMENT_INTERACTIONS.publicWell,
      mealInteractionId: PROLOGUE_SETTLEMENT_INTERACTIONS.publicMeal,
    });
  }

  usePublicReliefAt(
    transactionId: string,
    token: SettlementReliefInteractionToken,
  ): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const well = exactManifestInteraction(SETTLEMENT_MANIFEST, {
      interactionId: token.wellInteractionId,
      facilityId: "settlement.facility.public_well",
    }, { verb: "drink_or_fill", facilityKind: "public_well" });
    const meal = exactManifestInteraction(SETTLEMENT_MANIFEST, {
      interactionId: token.mealInteractionId,
      facilityId: "settlement.facility.communal_kitchen",
    }, { verb: "eat", facilityKind: "communal_plant_meal" });
    if (!well || !meal) return this.result(false, false, "unauthorized_interaction");
    const fingerprint = settlementOperationFingerprint("public_relief", {
      mealInteractionId: meal.id,
      wellInteractionId: well.id,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;

    const state = this.authoritativeSession.snapshot();
    const executor = SurvivalSystem.fromSave(state.survival);
    const executorId = `settlement:relief:${id}`;
    const execution = executor.usePublicRelief(executorId);
    const proposal = proposeSurvivalTransaction(executorId, execution, executor.toSave());
    if (!proposal.accepted) return this.result(false, execution.duplicate, "session_rejected");
    return this.commit({
      transactionId: id,
      drafts: [
        settlementOperationReceiptDraft(id, fingerprint),
        ...proposal.batch.drafts,
        {
          eventId: `session.settlement.relief.well.${id}`,
          type: "world_flag_set",
          payload: { flagId: PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.publicWellUsed, value: true, scope: "region", regionId: PROLOGUE_SETTLEMENT_AREA_ID },
        },
        {
          eventId: `session.settlement.relief.meal.${id}`,
          type: "world_flag_set",
          payload: { flagId: PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.communalPlantMealOffered, value: true, scope: "region", regionId: PROLOGUE_SETTLEMENT_AREA_ID },
        },
      ],
    });
  }

  meditate(transactionId: string, answerAccepted: boolean): SettlementActionResult {
    return this.meditateAt(transactionId, answerAccepted, {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.meditation,
      facilityId: "settlement.facility.meditation_court",
    });
  }

  meditateAt(
    transactionId: string,
    answerAccepted: boolean,
    token: SettlementInteractionToken,
  ): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const interaction = exactManifestInteraction(SETTLEMENT_MANIFEST, token, {
      verb: "meditate",
      facilityKind: "public_meditation_court",
    });
    if (!interaction) return this.result(false, false, "unauthorized_interaction");
    const fingerprint = settlementOperationFingerprint("meditation", {
      answerAccepted,
      facilityId: interaction.facilityId,
      interactionId: interaction.id,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;

    const state = this.authoritativeSession.snapshot();
    const learning = new CisternLearningSession({
      playerSaveId: this.authoritativeSession.sessionId,
      expressionCapacity: 1,
      learningSnapshot: state.learning,
    });
    const executorRecoveryId = `settlement:${id}`;
    const proposal = learning.proposeMeditationRecovery({
      recoveryId: executorRecoveryId,
      answerAccepted,
      evidenceEligible: false,
    });
    const ledger = new CastExecutionLedger(state.mp.currentMp, state.mp.worldVersion, state.mp.maxMp);
    const execution = ledger.applyMpRecovery(proposal);
    const sessionProposal = proposeMpRecovery(execution);
    if (!sessionProposal.accepted) return this.result(false, execution.duplicate, "session_rejected");
    return this.commit({
      transactionId: id,
      drafts: [
        settlementOperationReceiptDraft(id, fingerprint),
        ...sessionProposal.batch.drafts,
        {
          eventId: `session.settlement.meditation.flag.${id}`,
          type: "world_flag_set",
          payload: { flagId: PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.meditationCourtActivated, value: true, scope: "region", regionId: PROLOGUE_SETTLEMENT_AREA_ID },
        },
      ],
    });
  }

  acceptSurveyJob(transactionId: string): SettlementActionResult {
    return this.acceptSurveyJobAt(transactionId, {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.acceptSurvey,
      npcId: PROLOGUE_SETTLEMENT_REPAIR_CONTRACTOR_ID,
      facilityId: PROLOGUE_SETTLEMENT_JOB_BOARD_ID,
    });
  }

  acceptSurveyJobAt(transactionId: string, token: SettlementInteractionToken): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const interaction = exactManifestInteraction(SETTLEMENT_MANIFEST, token, {
      verb: "accept_job",
      npcProfessionId: "settlement.repair_contractor",
      facilityKind: "job_board",
      taskId: ORIENTATION_TASK.id,
    });
    if (!interaction) return this.result(false, false, "unauthorized_interaction");
    const fingerprint = settlementOperationFingerprint("survey_job_accept", {
      facilityId: interaction.facilityId,
      interactionId: interaction.id,
      npcId: interaction.npcId,
      taskId: ORIENTATION_TASK.id,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    if (taskStage(this.authoritativeSession.snapshot()) !== "available") {
      return this.result(true, true, "already_completed");
    }
    return this.commitQuestStageExact(id, "accepted", 1, fingerprint);
  }

  inspectSurveyMarkers(transactionId: string, markerId?: string): SettlementActionResult {
    const nextMarker = markerId ?? PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.find((candidate) =>
      !regionFlag(this.authoritativeSession.snapshot(), surveyMarkerFlagId(candidate))
    ) ?? PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS[0];
    return this.inspectSurveyMarkerAt(transactionId, nextMarker, {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.inspectSurveyMarker,
    });
  }

  inspectSurveyMarkerAt(
    transactionId: string,
    markerId: string,
    token: SettlementInteractionToken,
  ): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    if (!(PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS as readonly string[]).includes(markerId)) {
      return this.result(false, false, "unknown_marker");
    }
    const interaction = exactManifestInteraction(SETTLEMENT_MANIFEST, token, {
      verb: "survey",
      taskId: ORIENTATION_TASK.id,
    });
    if (!interaction) return this.result(false, false, "unauthorized_interaction");
    const fingerprint = settlementOperationFingerprint("survey_marker_inspect", {
      interactionId: interaction.id,
      markerId,
      taskId: ORIENTATION_TASK.id,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    const stage = taskStage(state);
    if (stage === "available") return this.result(false, false, "prerequisite_missing");
    if (stage === "completed") return this.result(true, true, "already_completed");
    if (regionFlag(state, surveyMarkerFlagId(markerId))) {
      return this.result(true, true, "duplicate");
    }
    const nextCount = surveyedMarkerIds(state).length + 1;
    const drafts: SessionEventDraft[] = [
      regionFlagDraft(
        `session.settlement.survey.marker.${id}`,
        surveyMarkerFlagId(markerId),
        true,
      ),
      settlementOperationReceiptDraft(id, fingerprint),
    ];
    if (nextCount === PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.length) {
      drafts.unshift({
        eventId: `session.quest.stage.${id}`,
        type: "quest_stage_set",
        payload: { questId: ORIENTATION_TASK.id, stageId: "surveyed", stageOrdinal: 2 },
      });
    }
    return this.commit({ transactionId: id, drafts });
  }

  submitSurveyJob(transactionId: string): SettlementActionResult {
    return this.submitSurveyJobAt(transactionId, {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.submitSurvey,
      npcId: PROLOGUE_SETTLEMENT_REPAIR_CONTRACTOR_ID,
    });
  }

  submitSurveyJobAt(transactionId: string, token: SettlementInteractionToken): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const interaction = exactManifestInteraction(SETTLEMENT_MANIFEST, token, {
      verb: "submit_job",
      npcProfessionId: "settlement.repair_contractor",
      taskId: ORIENTATION_TASK.id,
    });
    if (!interaction) return this.result(false, false, "unauthorized_interaction");
    const fingerprint = settlementOperationFingerprint("survey_job_submit", {
      interactionId: interaction.id,
      npcId: interaction.npcId,
      taskId: ORIENTATION_TASK.id,
    });
    const state = this.authoritativeSession.snapshot();
    const rewardId = rewardReceiptId(this.authoritativeSession.sessionId);
    const rewardHash = `quest-reward:${ORIENTATION_TASK.id}:coin:${ORIENTATION_TASK.reward.amount}`;
    const rewardPrior = receiptMatches(state, rewardId, "quest", rewardHash);
    const completed = taskStage(state) === "completed";
    if (rewardPrior === "conflict" || completed !== (rewardPrior === "duplicate")) {
      return this.result(false, false, "reward_inconsistent");
    }
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    if (completed) return this.result(true, true, "already_completed");
    if (taskStage(state) !== "surveyed") return this.result(false, false, "prerequisite_missing");
    if (surveyedMarkerIds(state).length !== PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.length) {
      return this.result(false, false, "prerequisite_missing");
    }
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.quest.stage.${id}`,
          type: "quest_stage_set",
          payload: { questId: ORIENTATION_TASK.id, stageId: "completed", stageOrdinal: 3 },
        },
        economyWalletRewardDraft(
          `session.settlement.reward.wallet.${id}`,
          state,
          ORIENTATION_TASK.reward.amount,
        ),
        receiptDraft(`session.settlement.reward.receipt.${id}`, rewardId, "quest", rewardHash),
        settlementOperationReceiptDraft(id, fingerprint),
      ],
    });
  }

  openTrade(transactionId: string): SettlementTradeOpenResult {
    return this.openTradeAt(transactionId, {
      interactionId: PROLOGUE_SETTLEMENT_INTERACTIONS.openSupplyTrade,
      npcId: PROLOGUE_SETTLEMENT_SUPPLY_TRADER_ID,
      facilityId: PROLOGUE_SETTLEMENT_SUPPLY_STALL_ID,
    });
  }

  openTradeAt(transactionId: string, token: SettlementInteractionToken): SettlementTradeOpenResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.tradeResult(false, false, "wrong_scene", null, []);
    const authorized = authorizedTradeEntry(SETTLEMENT_MANIFEST, token);
    if (!authorized) return this.tradeResult(false, false, "unauthorized_interaction", null, []);
    const fingerprint = settlementOperationFingerprint("open_trade", {
      facilityId: authorized.interaction.facilityId,
      interactionId: authorized.interaction.id,
      npcId: authorized.npc.id,
      tradeEntryId: authorized.tradeEntry.id,
    });
    const prior = classifySettlementOperation(this.authoritativeSession.snapshot(), id, fingerprint);
    if (prior === "conflict") {
      return this.tradeResult(false, false, "transaction_conflict", null, []);
    }
    if (prior === "duplicate") {
      return this.tradeResult(true, true, "duplicate", authorized.tradeEntry.id, authorized.tradeEntry.merchantIds);
    }
    const result = this.commit({
      transactionId: id,
      drafts: [settlementOperationReceiptDraft(id, fingerprint)],
    });
    return this.tradeResult(
      result.accepted,
      result.duplicate,
      result.reason,
      result.accepted ? authorized.tradeEntry.id : null,
      result.accepted ? authorized.tradeEntry.merchantIds : [],
    );
  }

  setCheckpoint(transactionId: string, checkpointId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    const normalizedCheckpointId = requiredId(checkpointId, "checkpointId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const runtime = this.bridge.runtime.snapshot();
    const fingerprint = settlementOperationFingerprint("checkpoint_set", {
      checkpointId: normalizedCheckpointId,
      positionX: runtime.player.position.x,
      positionY: runtime.player.position.y,
      sceneId: SETTLEMENT_MANIFEST.sceneId,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.settlement.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: {
            checkpoint: {
              id: normalizedCheckpointId,
              sceneId: SETTLEMENT_MANIFEST.sceneId,
              position: { ...runtime.player.position },
              revision: state.checkpoint.revision + 1,
            },
          },
        },
        settlementOperationReceiptDraft(id, fingerprint),
      ],
    });
  }

  resetToCheckpoint(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const checkpoint = this.authoritativeSession.snapshot().checkpoint;
    const fingerprint = settlementOperationFingerprint("checkpoint_reset", {
      checkpointId: checkpoint.id,
      checkpointRevision: checkpoint.revision,
      targetSceneId: checkpoint.sceneId,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.settlement.checkpoint.reset.${id}`,
          type: "scene_entered",
          payload: { sceneId: checkpoint.sceneId },
        },
        settlementOperationReceiptDraft(id, fingerprint),
      ],
    });
  }

  resetArea(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const checkpoint = this.authoritativeSession.snapshot().checkpoint;
    const fingerprint = settlementOperationFingerprint("area_reset", {
      areaId: PROLOGUE_SETTLEMENT_AREA_ID,
      checkpointId: checkpoint.id,
      checkpointRevision: checkpoint.revision,
      respawnSceneId: checkpoint.sceneId,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.settlement.area.reset.${id}`,
          type: "area_reset",
          payload: { areaId: PROLOGUE_SETTLEMENT_AREA_ID, respawnSceneId: checkpoint.sceneId },
        },
        settlementOperationReceiptDraft(id, fingerprint),
      ],
    });
  }

  /** Public N02-only recovery path; region progress and reward truth are preserved. */
  recoverSoftLock(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const fingerprint = settlementOperationFingerprint("settlement_softlock_recovery", {
      actions: SETTLEMENT_MANIFEST.recovery.actions.join(","),
      sceneId: SETTLEMENT_MANIFEST.sceneId,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    const checkpoint = {
      id: "checkpoint.valley.settlement.entry",
      sceneId: SETTLEMENT_MANIFEST.sceneId,
      position: { ...SETTLEMENT_ENTRY.spawnPx },
      revision: state.checkpoint.revision + 1,
    };
    return this.commit({
      transactionId: id,
      drafts: [
        {
          eventId: `session.settlement.recovery.scene.${id}`,
          type: "scene_entered",
          payload: { sceneId: SETTLEMENT_MANIFEST.sceneId },
        },
        {
          eventId: `session.settlement.recovery.checkpoint.${id}`,
          type: "checkpoint_set",
          payload: { checkpoint },
        },
        regionFlagDraft(
          `session.settlement.recovery.slate.${id}`,
          "settlement.survey_slate_available",
          true,
        ),
        regionFlagDraft(
          `session.settlement.recovery.markers.${id}`,
          "settlement.local_marker_tools_restored_by",
          id,
        ),
        settlementOperationReceiptDraft(id, fingerprint),
      ],
    });
  }

  private commitQuestStageExact(
    transactionId: string,
    stageId: string,
    stageOrdinal: number,
    fingerprint: string,
  ): SettlementActionResult {
    return this.commit({
      transactionId,
      drafts: [
        {
          eventId: `session.quest.stage.${transactionId}`,
          type: "quest_stage_set",
          payload: { questId: ORIENTATION_TASK.id, stageId, stageOrdinal },
        },
        settlementOperationReceiptDraft(transactionId, fingerprint),
      ],
    });
  }

  private preflightOperation(transactionId: string, fingerprint: string): SettlementActionResult | null {
    const prior = classifySettlementOperation(this.authoritativeSession.snapshot(), transactionId, fingerprint);
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    return null;
  }

  private tradeResult(
    accepted: boolean,
    duplicate: boolean,
    reason: SettlementActionReason,
    tradeEntryId: string | null,
    merchantIds: readonly string[],
  ): SettlementTradeOpenResult {
    return Object.freeze({
      accepted,
      duplicate,
      reason,
      snapshot: this.snapshot(),
      tradeEntryId,
      merchantIds: Object.freeze([...merchantIds]),
    });
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
  economy?: SessionEconomySummary | SessionEconomyState;
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
  regionFlag(state, PROLOGUE_SETTLEMENT_REGION_FLAG_IDS.settlementReached);
