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
import { createCrossSaveTransactionId } from "../persistence/cross-save-wal";
import type { CrossSaveTransactionCoordinator } from "./cross-save-transaction-coordinator";
import {
  commitSessionProposal,
  proposeInventoryConsumption,
  proposeMpRecovery,
  proposeWildlifeDamage,
  proposeWildlifeLifeRegistration,
  proposeWildlifeProcessing,
  proposeWildlifeProcessingInteraction,
  proposeWildlifeProcessingWork,
  proposeVerifiedTradeQuote,
  proposeVerifiedTradeSale,
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
  GIFTED_RABBIT_DEATH_CAUSE_CLASS,
  GIFTED_RABBIT_ENTITY_ID,
  GIFTED_RABBIT_RECEIPT_HASH,
  createGiftedRabbitLife,
} from "./gifted-carcass";
import type { WildlifeProcessingAction, WildlifeProcessingWorkOrder } from "./wildlife-processing";
import { verifiedTradeManifest, type VerifiedSellQuote } from "./verified-trade";
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

export type SettlementVerifiedQuoteResult = Readonly<{ accepted: true; duplicate: boolean; quote: VerifiedSellQuote }> |
  Readonly<{ accepted: false; duplicate: false; reason: "wrong_scene" | "quote_rejected" | "session_rejected" | "transaction_conflict" | "quote_expired_after_reload" }>;
export type SettlementVerifiedSaleResult = Readonly<{ accepted: true; duplicate: boolean }> |
  Readonly<{ accepted: false; duplicate: boolean; reason: "quote_not_issued_in_this_session" | "session_rejected" }>;

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
  private readonly liveTradeQuotes = new Map<string, Readonly<{ quote: VerifiedSellQuote; issuedEventId: string }>>();
  private readonly liveTradeOperations = new Map<string, Readonly<{ fingerprint: string; quote: VerifiedSellQuote }>>();
  private readonly completedTradeQuoteIds = new Set<string>();

  constructor(session: GameSession, private readonly transactionCoordinator: CrossSaveTransactionCoordinator | null = null) {
    if (!SCENE_INDEX.byId[session.snapshot().world.currentSceneId]) {
      throw new Error("settlement session requires a scene present in the generated runtime manifest");
    }
    if (this.transactionCoordinator) {
      this.transactionCoordinator.synchronizeOrdinarySession(session);
      this.authoritativeSession = this.transactionCoordinator.readSession();
    } else {
      this.authoritativeSession = session;
    }
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

  authorizeWildlifeProcessingStation(stationId: string, operationId: string): SettlementActionResult {
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const runtime = this.bridge.runtime.snapshot();
    try {
      return this.commit(proposeWildlifeProcessingInteraction(this.authoritativeSession, stationId, {
        playerPositionPx: runtime.player.position,
        sceneRevision: this.authoritativeSession.snapshot().world.revision,
        runtimeInteractionSequence: runtime.tick, operationId,
      }));
    } catch {
      return this.result(false, false, "unauthorized_interaction");
    }
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

  acceptGiftedRabbitCarcass(transactionId: string): SettlementActionResult {
    const id = requiredId(transactionId, "gifted carcass transactionId");
    const giftReceiptId = `gifted-carcass:${this.authoritativeSession.sessionId}:n02.rabbit.v0.1`;
    const giftHash = GIFTED_RABBIT_RECEIPT_HASH;
    const prior = this.authoritativeSession.snapshot().receiptIndex[giftReceiptId];
    if (prior) return prior.domain === "wildlife" && prior.payloadHash === giftHash
      ? this.result(true, true, "duplicate") : this.result(false, false, "transaction_conflict");
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const authority = verifiedTradeManifest().stationAuthorities.find((candidate) => candidate.merchantIds.includes("settlement.butcher"));
    const runtime = this.bridge.runtime.snapshot();
    this.synchronizeCoordinatedSession();
    if (!authority || runtime.sceneId !== authority.sceneId ||
        Math.hypot(runtime.player.position.x - authority.interactionPointPx.x,
          runtime.player.position.y - authority.interactionPointPx.y) > 16) {
      return this.result(false, false, "unauthorized_interaction");
    }
    const stablePrefix = `gifted-carcass:${this.authoritativeSession.sessionId}:n02.rabbit.v0.1`;
    const expectedLife = createGiftedRabbitLife({ playerSaveId: this.authoritativeSession.sessionId,
      regionId: PROLOGUE_SETTLEMENT_AREA_ID, worldTick: this.authoritativeSession.snapshot().survival.worldTicks });
    if (!this.transactionCoordinator) {
      const registration = proposeWildlifeLifeRegistration(`${stablePrefix}:register`, expectedLife);
      const registered = commitSessionProposal(this.authoritativeSession, registration);
      if (!registered.committed) return this.result(false, false, "session_rejected");
      const death = proposeWildlifeDamage(registered.session, { transactionId: createCrossSaveTransactionId("death", `${stablePrefix}:death`),
        lifeInstanceId: expectedLife.lifeInstanceId, expectedLifeRevision: 0, damage: expectedLife.maxHp,
        causeClass: GIFTED_RABBIT_DEATH_CAUSE_CLASS, worldTick: registered.session.snapshot().survival.worldTicks,
        position: { sceneId: authority.sceneId, x: authority.interactionPointPx.x, y: authority.interactionPointPx.y } });
      return this.commit({ transactionId: id, drafts: [...registration.drafts, ...death.drafts,
        receiptDraft(`session.settlement.gifted-carcass.${id}`, giftReceiptId, "wildlife", giftHash)] });
    }
    try {
      const currentLife = this.authoritativeSession.snapshot().lifeCorpseLedger.lives[expectedLife.lifeInstanceId];
      if (!currentLife) {
        const registered = this.transactionCoordinator.commitOrdinary(
          proposeWildlifeLifeRegistration(`${stablePrefix}:register`, expectedLife));
        if (!registered.committed) return this.result(false, false, "session_rejected");
        this.installCoordinatedSession();
      } else if (currentLife.entityId !== expectedLife.entityId || currentLife.regionSaveId !== expectedLife.regionSaveId ||
          currentLife.spawnGeneration !== expectedLife.spawnGeneration || currentLife.spawnSequence !== expectedLife.spawnSequence) {
        return this.result(false, false, "transaction_conflict");
      }
      const registeredLife = this.authoritativeSession.snapshot().lifeCorpseLedger.lives[expectedLife.lifeInstanceId]!;
      if (registeredLife.state === "alive") {
        this.transactionCoordinator.commitDeath({ transactionId: "materialized-by-coordinator",
          lifeInstanceId: registeredLife.lifeInstanceId, expectedLifeRevision: registeredLife.lifeRevision,
          damage: registeredLife.currentHp, causeClass: GIFTED_RABBIT_DEATH_CAUSE_CLASS,
          worldTick: this.authoritativeSession.snapshot().survival.worldTicks,
          position: { sceneId: authority.sceneId, x: authority.interactionPointPx.x, y: authority.interactionPointPx.y } });
        this.installCoordinatedSession();
      }
      const marker = this.transactionCoordinator.commitOrdinary({ transactionId: id,
        drafts: [receiptDraft(`session.settlement.gifted-carcass.${id}`, giftReceiptId, "wildlife", giftHash)] });
      if (!marker.committed) return this.result(false, false, "session_rejected");
      this.installCoordinatedSession();
      return this.result(true, false, "committed");
    } catch { return this.result(false, false, "session_rejected"); }
  }

  harvestGiftedMeat(operationId: string): SettlementActionResult {
    const replay = this.semanticProcessingReplay("butcher_table", operationId, "harvest");
    if (replay) return replay;
    const corpse = Object.values(this.authoritativeSession.snapshot().lifeCorpseLedger.corpses).find((candidate) =>
      candidate.entityId === GIFTED_RABBIT_ENTITY_ID && candidate.tissueSlots.some((slot) => slot.tissueSlotId === "meat" && slot.remainingQuantity > 0));
    const slot = corpse?.tissueSlots.find((candidate) => candidate.tissueSlotId === "meat");
    if (!corpse || !slot) return this.result(false, false, "prerequisite_missing");
    return this.commitSemanticProcessingStep("butcher_table", operationId, (staged, interactionReceiptId) => {
      const snapshot = staged.snapshot();
      const action: WildlifeProcessingAction = { action: "harvest", transactionId: "materialized-by-session",
        canonicalIdempotencyKey: "materialized-by-session", currentWorldTick: 0, interactionReceiptId,
        corpseId: corpse.corpseId, tissueSlotId: slot.tissueSlotId, harvestSequence: 0,
        expectedCorpseRevision: corpse.revision, expectedRemainingTissueQuantity: slot.remainingQuantity,
        expectedInventoryRevision: snapshot.economy.inventoryRevision, playerSaveId: staged.sessionId,
        stationOrToolId: "butcher_table" };
      return proposeWildlifeProcessing(staged, action);
    });
  }

  startCooking(operationId: string): SettlementActionResult {
    const replay = this.semanticProcessingReplay("communal_kitchen", operationId, "reserve");
    if (replay) return replay;
    const state = this.authoritativeSession.snapshot();
    const lot = state.economy.lots.find((candidate) => candidate.itemId === "food.raw_small_game_meat" &&
      candidate.legalOwnerId === this.authoritativeSession.sessionId && !candidate.reserved && candidate.quantity > 0);
    if (!lot?.wildlifeProvenance) return this.result(false, false, "prerequisite_missing");
    return this.commitSemanticProcessingStep("communal_kitchen", operationId, (staged, interactionReceiptId) => {
      const current = staged.snapshot();
      const currentLot = current.economy.lots.find((candidate) => candidate.lotId === lot.lotId)!;
      const action: WildlifeProcessingAction = { action: "reserve", transactionId: "materialized-by-session",
        canonicalIdempotencyKey: "materialized-by-session", currentWorldTick: 0, interactionReceiptId,
        expectedInventoryRevision: current.economy.inventoryRevision, playerSaveId: staged.sessionId,
        stationId: "communal_kitchen", recipeId: "cook.game_meat.v0.1", startEventSequence: 0,
        inputs: [{ lotId: currentLot.lotId, quantity: 1, expectedOwnershipRevision: currentLot.ownershipRevision,
          expectedFreshnessRevision: currentLot.freshnessRevision,
          expectedReservationRevision: currentLot.wildlifeProvenance!.reservationRevision }] };
      return proposeWildlifeProcessing(staged, action);
    });
  }

  workCooking(operationId: string): SettlementActionResult {
    const replay = this.semanticProcessingReplay("communal_kitchen", operationId, "work");
    if (replay) return replay;
    const order = this.currentCookingOrder("reserved");
    if (!order) return this.result(false, false, "prerequisite_missing");
    return this.commitSemanticProcessingStep("communal_kitchen", operationId,
      (staged, interactionReceiptId) => proposeWildlifeProcessingWork(staged, order.workOrderId, interactionReceiptId));
  }

  completeCooking(operationId: string): SettlementActionResult {
    const replay = this.semanticProcessingReplay("communal_kitchen", operationId, "complete");
    if (replay) return replay;
    const order = this.currentCookingOrder("reserved");
    if (!order) return this.result(false, false, "prerequisite_missing");
    return this.commitSemanticProcessingStep("communal_kitchen", operationId, (staged, interactionReceiptId) => {
      const current = staged.snapshot();
      const currentOrder = current.economy.workOrders.find((candidate) => candidate.workOrderId === order.workOrderId) as WildlifeProcessingWorkOrder;
      return proposeWildlifeProcessing(staged, { action: "complete", transactionId: "materialized-by-session",
        canonicalIdempotencyKey: "materialized-by-session", currentWorldTick: 0, interactionReceiptId,
        workOrderId: currentOrder.workOrderId, expectedWorkOrderRevision: currentOrder.revision,
        expectedInventoryRevision: current.economy.inventoryRevision, energyEventId: null });
    });
  }

  claimCooking(operationId: string): SettlementActionResult {
    const replay = this.semanticProcessingReplay("communal_kitchen", operationId, "claim");
    if (replay) return replay;
    const order = this.currentCookingOrder("completed");
    if (!order) return this.result(false, false, "prerequisite_missing");
    return this.commitSemanticProcessingStep("communal_kitchen", operationId, (staged, interactionReceiptId) => {
      const current = staged.snapshot();
      const currentOrder = current.economy.workOrders.find((candidate) => candidate.workOrderId === order.workOrderId) as WildlifeProcessingWorkOrder;
      return proposeWildlifeProcessing(staged, { action: "claim", transactionId: "materialized-by-session",
        canonicalIdempotencyKey: "materialized-by-session", currentWorldTick: 0, interactionReceiptId,
        workOrderId: currentOrder.workOrderId, expectedWorkOrderRevision: currentOrder.revision,
        expectedInventoryRevision: current.economy.inventoryRevision, claimantPlayerSaveId: staged.sessionId });
    });
  }

  consumeCooked(consumptionSequence: number): SettlementActionResult {
    const prior = this.authoritativeSession.events().find((event) => event.type === "inventory_consumption_committed" &&
      event.payload.action.playerSaveId === this.authoritativeSession.sessionId &&
      event.payload.action.consumptionSequence === consumptionSequence);
    if (prior?.type === "inventory_consumption_committed") {
      const priorLot = this.authoritativeSession.snapshot().economy.lots.find((candidate) => candidate.lotId === prior.payload.action.lotId);
      return prior.payload.action.quantity === 1 && priorLot?.itemId === "food.cooked_game_meat"
        ? this.result(true, true, "duplicate") : this.result(false, false, "transaction_conflict");
    }
    const lot = this.authoritativeSession.snapshot().economy.lots.find((candidate) =>
      candidate.itemId === "food.cooked_game_meat" && candidate.legalOwnerId === this.authoritativeSession.sessionId && candidate.quantity > 0);
    if (!lot) return this.result(false, false, "prerequisite_missing");
    try {
      const request = { playerSaveId: this.authoritativeSession.sessionId, lotId: lot.lotId, quantity: 1, consumptionSequence };
      if (!this.transactionCoordinator) return this.commit(proposeInventoryConsumption(this.authoritativeSession, request));
      this.transactionCoordinator.commitConsumption(request); this.installCoordinatedSession();
      return this.result(true, false, "committed");
    } catch { return this.result(false, false, "session_rejected"); }
  }

  issueVerifiedSellQuote(request: Readonly<{ merchantId: string; lotId: string; quantity: number; operationId: string }>): SettlementVerifiedQuoteResult {
    if (!this.inSettlement()) return { accepted: false, duplicate: false, reason: "wrong_scene" };
    const fingerprint = JSON.stringify(request);
    const prior = this.liveTradeOperations.get(request.operationId);
    if (prior) return prior.fingerprint === fingerprint ? { accepted: true, duplicate: true, quote: prior.quote } :
      { accepted: false, duplicate: false, reason: "transaction_conflict" };
    const persisted = this.authoritativeSession.events().find((event) =>
      event.type === "verified_trade_quote_issued" && event.payload.operationId === request.operationId);
    if (persisted?.type === "verified_trade_quote_issued") {
      const persistedRequest = JSON.stringify({ merchantId: persisted.payload.quote.merchantId,
        lotId: persisted.payload.quote.lineItems[0]?.lotId ?? "", quantity: persisted.payload.quote.lineItems[0]?.quantity ?? 0,
        operationId: persisted.payload.operationId });
      return persistedRequest === fingerprint
        ? { accepted: false, duplicate: false, reason: "quote_expired_after_reload" }
        : { accepted: false, duplicate: false, reason: "transaction_conflict" };
    }
    const runtime = this.bridge.runtime.snapshot();
    this.synchronizeCoordinatedSession();
    const proposed = proposeVerifiedTradeQuote(this.authoritativeSession, {
      playerSaveId: this.authoritativeSession.toSave().sessionId, merchantId: request.merchantId,
      lotId: request.lotId, quantity: request.quantity,
    }, { playerPositionPx: runtime.player.position, sceneRevision: this.authoritativeSession.snapshot().world.revision,
      operationId: request.operationId });
    if (!proposed.accepted) return { accepted: false, duplicate: false, reason: "quote_rejected" };
    const committed = this.transactionCoordinator
      ? this.transactionCoordinator.commitOrdinary(proposed.batch)
      : commitSessionProposal(this.authoritativeSession, proposed.batch);
    if (!committed.committed) return { accepted: false, duplicate: false, reason: "session_rejected" };
    if (this.transactionCoordinator) this.installCoordinatedSession();
    else { this.authoritativeSession = committed.session; this.rebuildBridge(); }
    this.liveTradeQuotes.set(proposed.quote.quoteId, { quote: proposed.quote, issuedEventId: proposed.issuedEventId });
    this.liveTradeOperations.set(request.operationId, { fingerprint, quote: proposed.quote });
    return { accepted: true, duplicate: false, quote: proposed.quote };
  }

  confirmVerifiedSellQuote(quoteId: string): SettlementVerifiedSaleResult {
    if (this.completedTradeQuoteIds.has(quoteId)) return { accepted: true, duplicate: true };
    const remembered = this.liveTradeQuotes.get(quoteId);
    if (!remembered) return { accepted: false, duplicate: false, reason: "quote_not_issued_in_this_session" };
    const runtime = this.bridge.runtime.snapshot();
    this.synchronizeCoordinatedSession();
    if (this.transactionCoordinator) {
      try { this.transactionCoordinator.commitSell(remembered.quote, remembered.issuedEventId,
        { playerPositionPx: runtime.player.position, sceneRevision: this.authoritativeSession.snapshot().world.revision }); }
      catch { return { accepted: false, duplicate: false, reason: "session_rejected" }; }
      this.installCoordinatedSession(); this.liveTradeQuotes.delete(quoteId); this.completedTradeQuoteIds.add(quoteId);
      return { accepted: true, duplicate: false };
    }
    const committed = commitSessionProposal(this.authoritativeSession, proposeVerifiedTradeSale(this.authoritativeSession,
      remembered.quote, remembered.issuedEventId, { playerPositionPx: runtime.player.position,
        sceneRevision: this.authoritativeSession.snapshot().world.revision }));
    if (!committed.committed) return { accepted: false,
      duplicate: committed.reason === "duplicate_event" || committed.reason === "duplicate_receipt", reason: "session_rejected" };
    this.authoritativeSession = committed.session; this.rebuildBridge(); this.liveTradeQuotes.delete(quoteId); this.completedTradeQuoteIds.add(quoteId);
    return { accepted: true, duplicate: false };
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
    const state = this.authoritativeSession.snapshot();
    const recoveryAnchor = state.checkpoint.sceneId === SETTLEMENT_MANIFEST.sceneId
      ? state.checkpoint
      : { id: "checkpoint.valley.settlement.entry", sceneId: SETTLEMENT_MANIFEST.sceneId,
          position: SETTLEMENT_ENTRY.spawnPx, revision: state.checkpoint.revision };
    const fingerprint = settlementOperationFingerprint("settlement_softlock_recovery", {
      actions: SETTLEMENT_MANIFEST.recovery.actions.join(","),
      sceneId: SETTLEMENT_MANIFEST.sceneId,

      recoveryPositionX: recoveryAnchor.position.x,
      recoveryPositionY: recoveryAnchor.position.y,
    });
    const preflight = this.preflightOperation(id, fingerprint);
    if (preflight) return preflight;
    const checkpoint = {
      id: recoveryAnchor.id,
      sceneId: SETTLEMENT_MANIFEST.sceneId,
      position: { ...recoveryAnchor.position },
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

  private semanticProcessingReplay(stationId: string, operationId: string,
    expectedAction: "harvest" | "reserve" | "work" | "complete" | "claim"): SettlementActionResult | null {
    const id = requiredId(operationId, "processing operationId");
    const interactionReceiptId = `wildlife-processing-interaction:${stationId}:${this.authoritativeSession.snapshot().world.revision}:${id}`;
    const useReceipt = this.authoritativeSession.snapshot().receiptIndex[`wildlife-processing-interaction-use:${interactionReceiptId}`];
    if (!useReceipt) return null;
    const event = this.authoritativeSession.events().find((candidate) => candidate.eventId === useReceipt.recordedByEventId);
    const action = event?.type === "wildlife_processing_work_advanced" ? "work" :
      event?.type === "wildlife_processing_committed" ? event.payload.action.action : null;
    return action === expectedAction ? this.result(true, true, "duplicate") :
      this.result(false, false, "transaction_conflict");
  }

  private currentCookingOrder(status: "reserved" | "completed"): WildlifeProcessingWorkOrder | null {
    return (this.authoritativeSession.snapshot().economy.workOrders.find((candidate) =>
      candidate.recipeId === "cook.game_meat.v0.1" && candidate.status === status &&
      (candidate as WildlifeProcessingWorkOrder).initiatingPlayerSaveId === this.authoritativeSession.sessionId) as WildlifeProcessingWorkOrder | undefined) ?? null;
  }

  private commitSemanticProcessingStep(stationId: string, operationId: string,
    build: (staged: GameSession, interactionReceiptId: string) => SessionProposalBatch): SettlementActionResult {
    if (!this.inSettlement()) return this.result(false, false, "wrong_scene");
    const id = requiredId(operationId, "processing operationId");
    const runtime = this.bridge.runtime.snapshot();
    this.synchronizeCoordinatedSession();
    try {
      const receiptId = `wildlife-processing-interaction:${stationId}:${this.authoritativeSession.snapshot().world.revision}:${id}`;
      let staged = this.authoritativeSession;
      if (!staged.snapshot().receiptIndex[receiptId]) {
        const interaction = proposeWildlifeProcessingInteraction(staged, stationId, {
          playerPositionPx: runtime.player.position, sceneRevision: staged.snapshot().world.revision,
          runtimeInteractionSequence: runtime.tick, operationId: id });
        if (!this.transactionCoordinator) {
          const action = build(commitSessionProposal(staged, interaction).session, receiptId);
          return this.commit({ transactionId: `semantic-processing:${id}`, drafts: [...interaction.drafts, ...action.drafts] });
        }
        const committed = this.transactionCoordinator.commitOrdinary(interaction);
        if (!committed.committed) return this.result(false, false, "unauthorized_interaction");
        this.installCoordinatedSession(); staged = this.authoritativeSession;
      }
      const action = build(staged, receiptId);
      if (!this.transactionCoordinator) return this.commit(action);
      const draft = action.drafts[0];
      if (draft?.type === "wildlife_processing_committed") {
        this.transactionCoordinator.commitProcessing((draft.payload as { action: WildlifeProcessingAction }).action);
      } else if (draft?.type === "wildlife_processing_work_advanced") {
        const payload = draft.payload as { workOrderId: string; interactionReceiptId: string };
        this.transactionCoordinator.commitWork(payload.workOrderId, payload.interactionReceiptId);
      } else throw new Error("unsupported coordinated processing proposal");
      this.installCoordinatedSession();
      return this.result(true, false, "committed");
    } catch { return this.result(false, false, "unauthorized_interaction"); }
  }

  private commit(batch: SessionProposalBatch): SettlementActionResult {
    this.synchronizeCoordinatedSession();
    const commit = this.transactionCoordinator
      ? this.transactionCoordinator.commitOrdinary(batch)
      : commitSessionProposal(this.authoritativeSession, batch);
    if (!commit.committed) return this.result(false, false, "session_rejected");
    if (this.transactionCoordinator) this.installCoordinatedSession();
    else { this.authoritativeSession = commit.session; this.rebuildBridge(); }
    return this.result(true, false, "committed");
  }

  private synchronizeCoordinatedSession(): void {
    if (!this.transactionCoordinator) return;
    this.transactionCoordinator.synchronizeOrdinarySession(this.authoritativeSession);
    this.authoritativeSession = this.transactionCoordinator.readSession();
  }

  private installCoordinatedSession(): void {
    if (!this.transactionCoordinator) throw new Error("cross-save coordinator is unavailable");
    this.authoritativeSession = this.transactionCoordinator.readSession();
    this.rebuildBridge();
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
