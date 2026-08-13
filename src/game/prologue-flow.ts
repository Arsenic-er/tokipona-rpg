import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeCisternTaskManifest } from "../content/runtime-task-manifest";
import {
  DEFAULT_PLAYER_BODY,
  WORLD_TILE_SIZE_PX,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import { commitSessionProposal, proposeCapabilityMilestone } from "../session/adapters";
import { readVerifiedCapabilityMilestoneContract } from "../session/capability-contract";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
} from "../session/game-session";
import type { LivingSafetyZone, PointPx } from "../spells/cast-plan";
import type { CrossSaveTransactionCoordinator } from "./cross-save-transaction-coordinator";
import {
  PROLOGUE_ARRIVAL_SCENE_ID,
  PROLOGUE_STREAM_SCENE_ID,
  PrologueArrivalStreamSession,
  createPrologueArrivalStreamInitialSession,
  type PrologueActionResult,
  type PrologueArrivalStreamSnapshot,
} from "./prologue-arrival-stream";
import {
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PrologueSettlementSession,
  type PrologueSettlementSnapshot,
  type SettlementActionResult,
  type SettlementDialogueResult,
  type SettlementDialogueTopic,
  type SettlementTradeOpenResult,
  type SettlementVerifiedQuoteResult,
  type SettlementVerifiedSaleResult,
} from "./prologue-settlement";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
  PrologueWaterwheelSession,
  type InfrastructureActionResult,
  type InfrastructureLanguageActionResult,
  type PrologueWaterwheelEntryResult,
  type PrologueWaterwheelSettlementReturnResult,
  type PrologueWaterwheelSnapshot,
  type ServiceSolutionEvidence,
  type TawaGroundingAttempt,
  type WaterwheelSolutionEvidence,
} from "./prologue-waterwheel";
import type { WaterwheelPhysicalObservation } from "./infrastructure-predicates";
import {
  PROLOGUE_CISTERN_REGION_FLAGS,
  PROLOGUE_CISTERN_SCENE_ID,
  PrologueCisternSession,
  type PrologueCisternActionResult,
  type PrologueCisternConfirmOutcome,
  type PrologueCisternEntryResult,
  type PrologueCisternLearningResult,
  type PrologueCisternPreviewOutcome,
  type PrologueCisternSnapshot,
} from "./prologue-cistern";
import type { CisternDirectionId, CisternExpressionId } from "./cistern-demo";
import {
  PROLOGUE_WILDLIFE_REGION_FLAGS,
  PROLOGUE_WILDLIFE_SCENE_ID,
  PrologueWildlifeSession,
  type PrologueWildlifeActionResult,
  type PrologueWildlifeDeterrenceResult,
  type PrologueWildlifeEntryResult,
  type PrologueWildlifeHandoffResult,
  type PrologueWildlifeSnapshot,
} from "./prologue-wildlife";

export type PrologueFlowMode = "arrival_stream" | "settlement" | "infrastructure" | "cistern" | "wildlife";
export type PrologueFlowActionReason = "delegated" | "wrong_mode" | "delegate_rejected";

export interface PrologueFlowSnapshot {
  readonly mode: PrologueFlowMode;
  readonly sessionId: string;
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly arrival: PrologueArrivalStreamSnapshot | null;
  readonly settlement: PrologueSettlementSnapshot | null;
  readonly infrastructure: PrologueWaterwheelSnapshot | null;
  readonly cistern: PrologueCisternSnapshot | null;
  readonly wildlife: PrologueWildlifeSnapshot | null;
  readonly killCount: 0;
}

export interface PrologueFlowAction<T> {
  readonly accepted: boolean;
  readonly reason: PrologueFlowActionReason;
  readonly result: T | null;
  readonly snapshot: PrologueFlowSnapshot;
}

export const PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX = "prologue.flow.settlement.entry";
export const PROLOGUE_FLOW_WATERWHEEL_ENTRY_TRANSACTION_PREFIX = "prologue.flow.waterwheel.entry";
export const PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX = "prologue.flow.cistern.entry";
export const PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX = "prologue.flow.cistern.capacity";
export const PROLOGUE_FLOW_WILDLIFE_ENTRY_TRANSACTION_PREFIX = "prologue.flow.wildlife.entry";

export interface PrologueFlowFreshOptions {
  readonly sessionId: string;
  readonly currentMp?: number;
  readonly maxMp?: number;
}

type ArrivalAcceptedResult = PrologueActionResult;
type SettlementAcceptedResult = SettlementActionResult | SettlementDialogueResult | SettlementVerifiedQuoteResult | SettlementVerifiedSaleResult;
type InfrastructureAcceptedResult = InfrastructureActionResult | InfrastructureLanguageActionResult;
type CisternAcceptedResult = PrologueCisternActionResult | PrologueCisternLearningResult;

const CISTERN_CAPACITY_CONTRACT = readVerifiedCapabilityMilestoneContract(
  generatedRuntimeArtifact.capabilityProgression,
  readRuntimeCisternTaskManifest(generatedRuntimeArtifact).capacityMilestoneRef,
);

const arrivalScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_ARRIVAL_SCENE_ID || sceneId === PROLOGUE_STREAM_SCENE_ID;
const infrastructureScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_WATERWHEEL_SCENE_ID || sceneId === PROLOGUE_SERVICE_CHANNEL_SCENE_ID;
const regionTrue = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === "valley_prologue" && flag.flagId === flagId && flag.value === true
  );
const wildlifeRuntimeSnapshot = (
  state: GameSessionState,
  playerPosition: PointPx,
  tick: number,
): RuntimeSnapshot => Object.freeze({
  tick,
  sceneId: PROLOGUE_WILDLIFE_SCENE_ID,
  player: Object.freeze({ position: Object.freeze({ ...playerPosition }), velocity: Object.freeze({ x: 0, y: 0 }), grounded: false, body: DEFAULT_PLAYER_BODY }),
  camera: Object.freeze({ x: Math.max(0, playerPosition.x - 80), y: Math.max(0, playerPosition.y - 45), width: 160, height: 90 }),
  checkpoint: Object.freeze({ id: state.checkpoint.id, sceneId: state.checkpoint.sceneId, position: Object.freeze({ ...state.checkpoint.position }), tick }),
});

/** One persisted GameSession coordinating the playable N00 -> N06 prologue. */
export class PrologueFlowSession {
  private arrival: PrologueArrivalStreamSession | null;
  private settlement: PrologueSettlementSession | null;
  private infrastructure: PrologueWaterwheelSession | null;
  private cistern: PrologueCisternSession | null;
  private wildlife: PrologueWildlifeSession | null;
  private wildlifePlayerPositionPx: PointPx | null;
  private wildlifeRuntimeTick = 0;
  private crossSaveCoordinator: CrossSaveTransactionCoordinator | null = null;

  private constructor(session: GameSession) {
    const sceneId = session.snapshot().world.currentSceneId;
    this.arrival = arrivalScene(sceneId) ? new PrologueArrivalStreamSession(session) : null;
    this.settlement = sceneId === PROLOGUE_SETTLEMENT_SCENE_ID ? new PrologueSettlementSession(session) : null;
    this.infrastructure = infrastructureScene(sceneId) ? new PrologueWaterwheelSession(session) : null;
    this.cistern = sceneId === PROLOGUE_CISTERN_SCENE_ID ? new PrologueCisternSession(session) : null;
    this.wildlife = sceneId === PROLOGUE_WILDLIFE_SCENE_ID ? new PrologueWildlifeSession(session) : null;
    this.wildlifePlayerPositionPx = this.wildlife ? Object.freeze({ ...session.snapshot().checkpoint.position }) : null;
    if (!this.arrival && !this.settlement && !this.infrastructure && !this.cistern && !this.wildlife) {
      throw new Error(`unsupported prologue scene: ${sceneId}`);
    }
  }

  static fresh(options: PrologueFlowFreshOptions): PrologueFlowSession {
    return new PrologueFlowSession(createPrologueArrivalStreamInitialSession(options));
  }

  static fromSave(candidate: unknown): PrologueFlowSession {
    const session = GameSession.fromSave(candidate);
    const flow = new PrologueFlowSession(session);
    const state = session.snapshot();
    if (state.world.currentSceneId === PROLOGUE_WILDLIFE_SCENE_ID) {
      if (regionTrue(state, PROLOGUE_WILDLIFE_REGION_FLAGS.denEntryCrossed) &&
          state.checkpoint.sceneId === PROLOGUE_WILDLIFE_SCENE_ID) return flow;
      const entryCount = session.events().filter((event) =>
        event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_WILDLIFE_SCENE_ID
      ).length;
      const adoption = PrologueWildlifeSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_WILDLIFE_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}:${entryCount}`,
      );
      if (!adoption.accepted || !adoption.wildlife) throw new Error(`wildlife load reconciliation rejected: ${adoption.reason}`);
      return new PrologueFlowSession(adoption.wildlife.session);
    }
    const entryCommitted = Object.values(state.world.flags).some((flag) =>
      flag.scope === "region" && flag.regionId === "valley_prologue" &&
      flag.flagId === PROLOGUE_CISTERN_REGION_FLAGS.entryCrossed && flag.value === true
    );
    const latestCisternEntry = [...session.events()].reverse().find((event) =>
      event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_CISTERN_SCENE_ID
    );
    const fromWildlife = state.world.currentSceneId === PROLOGUE_CISTERN_SCENE_ID &&
      state.checkpoint.sceneId === PROLOGUE_CISTERN_SCENE_ID &&
      latestCisternEntry?.eventId.endsWith(`${PROLOGUE_WILDLIFE_SCENE_ID}->${PROLOGUE_CISTERN_SCENE_ID}`) === true;
    if (state.world.currentSceneId !== PROLOGUE_CISTERN_SCENE_ID || entryCommitted || fromWildlife) return flow;

    const capableSession = flow.withCisternCapacity(session);
    const adoption = PrologueCisternSession.adoptRuntimeEntry(
      capableSession,
      `${PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
    );
    if (!adoption.accepted || !adoption.cistern) {
      throw new Error(`cistern load reconciliation rejected: ${adoption.reason}`);
    }
    return new PrologueFlowSession(adoption.cistern.session);
  }

  attachCrossSaveTransactionCoordinator(coordinator: CrossSaveTransactionCoordinator): void {
    coordinator.synchronizeOrdinarySession(this.session);
    this.crossSaveCoordinator = coordinator;
    if (this.settlement) this.settlement = new PrologueSettlementSession(coordinator.readSession(), coordinator);
  }

  get session(): GameSession {
    return this.arrival?.session ?? this.settlement?.session ?? this.infrastructure?.session ??
      this.cistern?.session ?? this.wildlife!.session;
  }

  toSave(): GameSessionSave {
    if (this.crossSaveCoordinator) {
      this.crossSaveCoordinator.synchronizeOrdinarySession(this.session);
      return this.crossSaveCoordinator.toSessionSave();
    }
    return this.session.toSave();
  }

  snapshot(): PrologueFlowSnapshot {
    if (this.arrival) {
      const arrival = this.arrival.snapshot();
      return Object.freeze({ mode: "arrival_stream", sessionId: this.session.sessionId, session: arrival.session, runtime: arrival.runtime,
        arrival, settlement: null, infrastructure: null, cistern: null, wildlife: null, killCount: 0 });
    }
    if (this.settlement) {
      const settlement = this.settlement.snapshot();
      return Object.freeze({ mode: "settlement", sessionId: this.session.sessionId, session: settlement.session, runtime: settlement.runtime,
        arrival: null, settlement, infrastructure: null, cistern: null, wildlife: null, killCount: 0 });
    }
    if (this.infrastructure) {
      const infrastructure = this.infrastructure.snapshot();
      return Object.freeze({ mode: "infrastructure", sessionId: this.session.sessionId, session: infrastructure.session, runtime: infrastructure.runtime,
        arrival: null, settlement: null, infrastructure, cistern: null, wildlife: null, killCount: 0 });
    }
    if (this.cistern) {
      const cistern = this.cistern.snapshot();
      return Object.freeze({ mode: "cistern", sessionId: this.session.sessionId, session: cistern.session, runtime: cistern.runtime,
        arrival: null, settlement: null, infrastructure: null, cistern, wildlife: null, killCount: 0 });
    }
    const wildlife = this.wildlife!.snapshot();
    const playerPosition = this.wildlifePlayerPositionPx ?? wildlife.session.checkpoint.position;
    return Object.freeze({ mode: "wildlife", sessionId: this.session.sessionId, session: wildlife.session,
      runtime: wildlifeRuntimeSnapshot(wildlife.session, playerPosition, this.wildlifeRuntimeTick),
      arrival: null, settlement: null, infrastructure: null, cistern: null, wildlife, killCount: 0 });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueFlowSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    for (let index = 0; index < ticks; index += 1) {
      if (this.arrival) this.arrival.advanceTicks(1, input);
      else if (this.settlement) this.settlement.advanceTicks(1, input);
      else if (this.infrastructure) this.infrastructure.advanceTicks(1, input);
      else if (this.cistern) this.cistern.advanceTicks(1, input);
      else return this.snapshot();
      this.reconcileMode();
    }
    return this.snapshot();
  }

  pushLooseStone(transactionId: string) { return this.delegateArrival((x) => x.pushLooseStone(transactionId)); }
  placeRottenLog(transactionId: string) { return this.delegateArrival((x) => x.placeRottenLog(transactionId)); }
  digSoftSoil(transactionId: string) { return this.delegateArrival((x) => x.digSoftSoil(transactionId)); }
  discoverTelo(occurrenceId: string) { return this.delegateArrival((x) => x.discoverTelo(occurrenceId)); }
  attuneTelo(attemptId: string, occurrenceId: string) {
    return this.delegateArrival((x) => x.attuneTelo(attemptId, occurrenceId));
  }
  manifestTelo(transactionId: string) { return this.delegateArrival((x) => x.manifestTelo(transactionId)); }
  damageCrossing(transactionId: string) { return this.delegateArrival((x) => x.damageCrossing(transactionId)); }
  repairCrossing(transactionId: string) { return this.delegateArrival((x) => x.repairCrossing(transactionId)); }

  talk(npcId: string, topic: SettlementDialogueTopic = "role") {
    return this.delegateSettlement((x) => x.talk(npcId, topic));
  }
  clarify(npcId: string, topic: SettlementDialogueTopic) {
    return this.delegateSettlement((x) => x.clarify(npcId, topic));
  }
  usePublicRelief(transactionId: string) { return this.delegateSettlement((x) => x.usePublicRelief(transactionId)); }
  meditate(transactionId: string, answerAccepted: boolean) {
    return this.delegateSettlement((x) => x.meditate(transactionId, answerAccepted));
  }
  acceptSurveyJob(transactionId: string) { return this.delegateSettlement((x) => x.acceptSurveyJob(transactionId)); }
  inspectSurveyMarker(transactionId: string, markerId: string) {
    return this.delegateSettlement((x) => x.inspectSurveyMarkers(transactionId, markerId));
  }
  inspectSurveyMarkers(transactionId: string, markerId?: string) {
    return this.delegateSettlement((x) => x.inspectSurveyMarkers(transactionId, markerId));
  }
  submitSurveyJob(transactionId: string) { return this.delegateSettlement((x) => x.submitSurveyJob(transactionId)); }
  openTrade(transactionId: string): PrologueFlowAction<SettlementTradeOpenResult> {
    return this.delegateSettlement((x) => x.openTrade(transactionId));
  }
  acceptGiftedRabbitCarcass(transactionId: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((x) => x.acceptGiftedRabbitCarcass(transactionId));
  }
  harvestGiftedMeat(operationId: string) { return this.delegateSettlement((x) => x.harvestGiftedMeat(operationId)); }
  startCooking(operationId: string) { return this.delegateSettlement((x) => x.startCooking(operationId)); }
  workCooking(operationId: string) { return this.delegateSettlement((x) => x.workCooking(operationId)); }
  completeCooking(operationId: string) { return this.delegateSettlement((x) => x.completeCooking(operationId)); }
  claimCooking(operationId: string) { return this.delegateSettlement((x) => x.claimCooking(operationId)); }
  consumeCooked(consumptionSequence: number) { return this.delegateSettlement((x) => x.consumeCooked(consumptionSequence)); }
  issueVerifiedSellQuote(request: Readonly<{ merchantId: string; lotId: string; quantity: number; operationId: string }>):
  PrologueFlowAction<SettlementVerifiedQuoteResult> {
    return this.delegateSettlement((x) => x.issueVerifiedSellQuote(request));
  }
  confirmVerifiedSellQuote(quoteId: string): PrologueFlowAction<SettlementVerifiedSaleResult> {
    return this.delegateSettlement((x) => x.confirmVerifiedSellQuote(quoteId));
  }

  enterWaterwheel(transactionId: string): PrologueFlowAction<PrologueWaterwheelEntryResult> {
    if (!this.settlement) return this.rejectedMode();
    try {
      const result = PrologueWaterwheelSession.enterFromSettlement(this.settlement.session, transactionId);
      if (result.accepted && result.infrastructure) {
        this.commitCrossSaveRegionExit(result.infrastructure.session);
        this.arrival = null;
        this.settlement = null;
        this.infrastructure = result.infrastructure;
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  observeWaterwheelPhysics(transactionId: string, observation: WaterwheelPhysicalObservation) {
    return this.delegateInfrastructure((x) => x.observeWaterwheelPhysics(transactionId, observation));
  }
  completeWaterwheelSolution(transactionId: string, solutionId: string, evidence: WaterwheelSolutionEvidence) {
    return this.delegateInfrastructure((x) => x.completeWaterwheelSolution(transactionId, solutionId, evidence));
  }
  enterServiceChannel(transactionId: string) {
    return this.delegateInfrastructure((x) => x.enterServiceChannel(transactionId));
  }
  returnToWaterwheel(transactionId: string) {
    return this.delegateInfrastructure((x) => x.returnToWaterwheel(transactionId));
  }
  returnToSettlement(transactionId: string): PrologueFlowAction<PrologueWaterwheelSettlementReturnResult> {
    if (!this.infrastructure) return this.rejectedMode();
    try {
      const result = this.infrastructure.returnToSettlement(transactionId);
      if (result.accepted && result.session) {
        this.arrival = null;
        this.infrastructure = null;
        this.settlement = new PrologueSettlementSession(result.session, this.crossSaveCoordinator);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  completeServiceSolution(transactionId: string, solutionId: string, evidence: ServiceSolutionEvidence) {
    return this.delegateInfrastructure((x) => x.completeServiceSolution(transactionId, solutionId, evidence));
  }
  discoverTawa(transactionId: string) { return this.delegateInfrastructure((x) => x.discoverTawa(transactionId)); }
  attuneTawa(transactionId: string) { return this.delegateInfrastructure((x) => x.attuneTawa(transactionId)); }
  groundTawa(transactionId: string, attempt: TawaGroundingAttempt) {
    return this.delegateInfrastructure((x) => x.groundTawa(transactionId, attempt));
  }
  readGrammarOSign(transactionId: string) {
    return this.delegateInfrastructure((x) => x.readGrammarOSign(transactionId));
  }
  acceptGrammarOReceptivePrompt(transactionId: string, answerAccepted: boolean) {
    return this.delegateInfrastructure((x) => x.acceptGrammarOReceptivePrompt(transactionId, answerAccepted));
  }
  recoverInfrastructureSoftLock(transactionId: string) {
    return this.delegateInfrastructure((x) => x.recoverSoftLock(transactionId));
  }

  enterWildlife(
    transactionId: string,
    source: "service" | "cistern",
  ): PrologueFlowAction<PrologueWildlifeEntryResult> {
    if (source === "service") {
      if (!this.infrastructure || this.infrastructure.snapshot().mode !== "service_channel") return this.rejectedMode();
      try {
        const result = PrologueWildlifeSession.enterFromService(this.infrastructure.session, transactionId);
        if (result.accepted && result.wildlife) this.activateWildlife(result.wildlife);
        return this.delegated(result, result.accepted);
      } catch { return this.rejectedDelegate(); }
    }
    if (!this.cistern) return this.rejectedMode();
    try {
      const result = PrologueWildlifeSession.enterFromCistern(this.cistern.session, transactionId);
      if (result.accepted && result.wildlife) this.activateWildlife(result.wildlife);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  observeWildlife(operationId: string): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const snapshot = this.wildlife.snapshot();
    const warningCenter = this.boundsCenter(snapshot.spatialBinding.warningBoundsTiles);
    return this.advanceWildlifeSemantic(operationId, "observe", 44, warningCenter, snapshot.foxPositionTiles, false);
  }

  retreatWildlife(operationId: string): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const snapshot = this.wildlife.snapshot();
    return this.advanceWildlifeSemantic(operationId, "retreat", 1, this.outsideWarningPoint(snapshot), snapshot.foxPositionTiles, true);
  }

  waitForWildlifeExit(operationId: string): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const snapshot = this.wildlife.snapshot();
    const exit = this.boundsCenter(snapshot.spatialBinding.escapeBoundsTiles);
    const ticks = Math.max(1, Math.ceil(Math.hypot(snapshot.foxPositionTiles.x - exit.x, snapshot.foxPositionTiles.y - exit.y) / 0.25));
    return this.advanceWildlifeSemantic(operationId, "wait_exit", ticks, this.outsideWarningPoint(snapshot), exit, true);
  }

  makeWildlifeNoise(transactionId: string): PrologueFlowAction<PrologueWildlifeDeterrenceResult> {
    const point = this.wildlife?.snapshot().interactionPoints.noise;
    const positioned = point && this.positionWildlifePlayer(point, false);
    if (!positioned?.accepted) return this.rejectedMode();
    return this.delegateWildlife((x) => x.makeLowForceNoise(transactionId));
  }

  useWildlifeStaff(transactionId: string): PrologueFlowAction<PrologueWildlifeDeterrenceResult> {
    const point = this.wildlife?.snapshot().interactionPoints.staff;
    const positioned = point && this.positionWildlifePlayer(point, true);
    if (!positioned?.accepted) return this.rejectedMode();
    return this.delegateWildlife((x) => x.useWoodStaff(transactionId));
  }

  openWildlifeLatch(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    const point = this.wildlife?.snapshot().interactionPoints.latch;
    const positioned = point && this.positionWildlifePlayer(point, false);
    if (!positioned?.accepted) return this.rejectedMode();
    return this.delegateWildlife((x) => x.openOldServiceLatch(transactionId));
  }

  markWildlifeDigLine(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.positionWildlifeForDig()) return this.rejectedMode();
    return this.delegateWildlife((x) => x.inspectAndMarkUpperLine(transactionId));
  }

  digWildlifeUpperBypass(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.positionWildlifeForDig()) return this.rejectedMode();
    return this.delegateWildlife((x) => x.digUpperBypass(transactionId));
  }

  installWildlifeBraces(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.positionWildlifeForDig()) return this.rejectedMode();
    return this.delegateWildlife((x) => x.installUpperBypassBraces(transactionId));
  }

  completeWildlifeRoute(
    transactionId: string,
    solutionId: "den.wait_and_observe" | "den.dig_upper_bypass" | "den.low_force_noise" | "den.low_force_staff",
  ): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.wildlife) return this.rejectedMode();
    if (solutionId === "den.wait_and_observe") return this.delegateWildlife((x) => x.completeWaitAndObserve(transactionId));
    if (solutionId === "den.dig_upper_bypass") return this.delegateWildlife((x) => x.completeDigUpperBypass(transactionId));
    if (solutionId === "den.low_force_noise") return this.delegateWildlife((x) => x.completeLowForceNoise(transactionId));
    return this.delegateWildlife((x) => x.completeLowForceStaff(transactionId));
  }

  returnWildlifeToService(transactionId: string): PrologueFlowAction<PrologueWildlifeHandoffResult> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = this.wildlife.returnToService(transactionId);
      if (result.accepted && result.session) {
        this.wildlife = null;
        this.wildlifePlayerPositionPx = null;
        this.wildlifeRuntimeTick = 0;
        this.infrastructure = new PrologueWaterwheelSession(result.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  handoffWildlifeToCistern(transactionId: string): PrologueFlowAction<PrologueWildlifeHandoffResult> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = this.wildlife.handoffToHighCistern(transactionId);
      if (result.accepted && result.session) {
        const capableSession = this.withCisternCapacity(result.session);
        this.wildlife = null;
        this.wildlifePlayerPositionPx = null;
        this.wildlifeRuntimeTick = 0;
        this.cistern = new PrologueCisternSession(capableSession);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  recoverWildlifeSoftLock(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    return this.resetWildlife((x) => x.recoverSoftLock(transactionId));
  }

  resetWildlifeCheckpoint(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    return this.resetWildlife((x) => x.resetToCheckpoint(transactionId));
  }

  private advanceWildlifeSemantic(
    operationId: string,
    actionId: "observe" | "retreat" | "wait_exit",
    ticks: number,
    playerPositionTiles: Readonly<{ x: number; y: number }>,
    foxPositionTiles: Readonly<{ x: number; y: number }>,
    playerRetreating: boolean,
  ): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const semantic = this.wildlife.recordSemanticAction(operationId, actionId);
      if (!semantic.accepted) return this.delegated(this.wildlife.snapshot(), false);
      if (semantic.duplicate) return this.delegated(this.wildlife.snapshot(), true);
      const result = this.wildlife.advanceTicks(ticks, {
        playerPositionTiles,
        foxPositionTiles,
        playerProfile: { id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 },
        world: { playerRetreating, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false },
      });
      this.wildlifePlayerPositionPx = Object.freeze({ x: playerPositionTiles.x * WORLD_TILE_SIZE_PX, y: playerPositionTiles.y * WORLD_TILE_SIZE_PX });
      this.wildlifeRuntimeTick += ticks;
      return this.delegated(result, true);
    } catch { return this.rejectedDelegate(); }
  }

  private positionWildlifePlayer(
    point: Readonly<{ x: number; y: number }>,
    playerRetreating: boolean,
  ): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const fox = this.wildlife.snapshot().foxPositionTiles;
    try {
      const result = this.wildlife.advanceTicks(1, {
        playerPositionTiles: point,
        foxPositionTiles: fox,
        playerProfile: { id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 },
        world: { playerRetreating, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false },
      });
      this.wildlifePlayerPositionPx = Object.freeze({ x: point.x * WORLD_TILE_SIZE_PX, y: point.y * WORLD_TILE_SIZE_PX });
      this.wildlifeRuntimeTick += 1;
      return this.delegated(result, true);
    } catch { return this.rejectedDelegate(); }
  }

  private boundsCenter(bounds: Readonly<{ x: number; y: number; width: number; height: number }>) {
    return Object.freeze({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  }

  private outsideWarningPoint(snapshot: PrologueWildlifeSnapshot) {
    const bounds = snapshot.spatialBinding.warningBoundsTiles;
    return Object.freeze({ x: Math.max(0, bounds.x - 1), y: bounds.y + bounds.height / 2 });
  }

  private positionWildlifeForDig(): boolean {
    if (!this.wildlife) return false;
    const snapshot = this.wildlife.snapshot();
    const den = snapshot.spatialBinding.denBoundsTiles;
    const foxClear = Object.freeze({ x: den.x + den.width + 1, y: snapshot.foxPositionTiles.y });
    const ticks = Math.max(1, Math.ceil(Math.hypot(snapshot.foxPositionTiles.x - foxClear.x, snapshot.foxPositionTiles.y - foxClear.y) / 0.25));
    try {
      this.wildlife.advanceTicks(ticks, {
        playerPositionTiles: snapshot.interactionPoints.dig,
        foxPositionTiles: foxClear,
        playerProfile: { id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 },
        world: { playerRetreating: false, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false },
      });
      this.wildlifePlayerPositionPx = Object.freeze({ x: snapshot.interactionPoints.dig.x * WORLD_TILE_SIZE_PX, y: snapshot.interactionPoints.dig.y * WORLD_TILE_SIZE_PX });
      this.wildlifeRuntimeTick += ticks;
      return true;
    } catch { return false; }
  }

  enterCistern(transactionId: string): PrologueFlowAction<PrologueCisternEntryResult> {
    if (!this.infrastructure) return this.rejectedMode();
    const infrastructure = this.infrastructure.snapshot();
    if (infrastructure.mode !== "service_channel" || !infrastructure.serviceChannel.cisternReady) {
      return this.rejectedDelegate();
    }
    try {
      const session = this.withCisternCapacity(this.infrastructure.session);
      const result = PrologueCisternSession.enterFromServiceChannel(session, transactionId);
      if (result.accepted && result.cistern) {
        this.arrival = null;
        this.settlement = null;
        this.infrastructure = null;
        this.cistern = result.cistern;
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  setCisternExpression(expression: CisternExpressionId) {
    return this.delegateCisternSnapshot((x) => x.setExpression(expression));
  }
  setCisternDirection(direction: CisternDirectionId) {
    return this.delegateCisternSnapshot((x) => x.setDirection(direction));
  }
  targetCisternCurrentReceiver() {
    return this.delegateCisternSnapshot((x) => x.targetCurrentReceiver());
  }
  setCisternTargetAnchorPx(anchorPx: PointPx) {
    return this.delegateCisternSnapshot((x) => x.setTargetAnchorPx(anchorPx));
  }
  previewCisternCast(livingSafetyZones: readonly LivingSafetyZone[] = []): PrologueFlowAction<PrologueCisternPreviewOutcome> {
    if (!this.cistern) return this.rejectedMode();
    try {
      const result = this.cistern.beginPreview(livingSafetyZones);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  confirmCisternCast(transactionId: string, livingSafetyZones: readonly LivingSafetyZone[] = []): PrologueFlowAction<PrologueCisternConfirmOutcome> {
    if (!this.cistern) return this.rejectedMode();
    try {
      const result = this.cistern.confirmPending(transactionId, livingSafetyZones);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  cancelCisternCast() { return this.delegateCisternSnapshot((x) => x.cancelPending()); }
  completeCisternFamilyWithTools(transactionId: string, familyId: string) {
    return this.delegateCistern((x) => x.completeFamilyWithTools(transactionId, familyId));
  }
  discoverCisternLengthWord(transactionId: string, wordId: "lili" | "suli") {
    return this.delegateCistern((x) => x.discoverLengthWord(transactionId, wordId));
  }
  attuneCisternLengthWord(transactionId: string, wordId: "lili" | "suli") {
    return this.delegateCistern((x) => x.attuneLengthWord(transactionId, wordId));
  }
  applyCisternNaturalRecovery(transactionId: string, ticks: number) {
    return this.delegateCistern((x) => x.applyNaturalRecovery(transactionId, ticks));
  }
  meditateCistern(transactionId: string, answerAccepted: boolean, evidenceEligible: boolean) {
    return this.delegateCistern((x) => x.meditate(transactionId, answerAccepted, evidenceEligible));
  }
  recoverCisternAtCheckpoint(transactionId: string) {
    return this.delegateCistern((x) => x.recoverAtCheckpoint(transactionId));
  }
  recoverCisternSoftLock(transactionId: string) {
    return this.delegateCistern((x) => x.recoverSoftLock(transactionId));
  }

  setCheckpoint(transactionId: string, checkpointId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.setCheckpoint(transactionId, checkpointId));
    if (this.settlement) return this.delegateSettlement((x) => x.setCheckpoint(transactionId, checkpointId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.setCheckpoint(
      transactionId,
      checkpointId,
      this.snapshot().runtime.player.position,
    ));
    return this.rejectedDelegate();
  }

  resetToCheckpoint(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult | PrologueWildlifeActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetToCheckpoint(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetToCheckpoint(transactionId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.resetToCheckpoint(transactionId));
    if (this.cistern) return this.delegateCistern((x) => x.resetToCheckpoint(transactionId));
    return this.resetWildlife((x) => x.resetToCheckpoint(transactionId));
  }

  resetArea(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult | PrologueWildlifeActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetArea(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetArea(transactionId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.recoverSoftLock(transactionId));
    if (this.cistern) return this.delegateCistern((x) => x.recoverSoftLock(transactionId));
    return this.resetWildlife((x) => x.resetToCheckpoint(transactionId));
  }

  private delegateArrival<T extends ArrivalAcceptedResult>(action: (x: PrologueArrivalStreamSession) => T) {
    if (!this.arrival) return this.rejectedMode<T>();
    try { const result = action(this.arrival); this.reconcileMode(); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate<T>(); }
  }
  private delegateArrivalSnapshot<T extends PrologueArrivalStreamSnapshot>(
    action: (x: PrologueArrivalStreamSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.arrival) return this.rejectedMode();
    try { const result = action(this.arrival); this.reconcileMode(); return this.delegated(result, true); }
    catch { return this.rejectedDelegate(); }
  }
  private delegateSettlement<T extends SettlementAcceptedResult>(action: (x: PrologueSettlementSession) => T) {
    if (!this.settlement) return this.rejectedMode<T>();
    try { const result = action(this.settlement); this.reconcileMode(); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate<T>(); }
  }
  private delegateInfrastructure<T extends InfrastructureAcceptedResult>(
    action: (x: PrologueWaterwheelSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.infrastructure) return this.rejectedMode();
    try { const result = action(this.infrastructure); this.reconcileMode(); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate(); }
  }
  private delegateCistern<T extends CisternAcceptedResult>(action: (x: PrologueCisternSession) => T) {
    if (!this.cistern) return this.rejectedMode<T>();
    try { const result = action(this.cistern); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate<T>(); }
  }
  private delegateCisternSnapshot<T extends PrologueCisternSnapshot>(
    action: (x: PrologueCisternSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.cistern) return this.rejectedMode();
    try { return this.delegated(action(this.cistern), true); }
    catch { return this.rejectedDelegate(); }
  }
  private delegateWildlife<T extends PrologueWildlifeActionResult>(action: (x: PrologueWildlifeSession) => T): PrologueFlowAction<T> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = action(this.wildlife);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  private resetWildlife(action: (x: PrologueWildlifeSession) => PrologueWildlifeActionResult): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = action(this.wildlife);
      if (result.accepted) {
        this.wildlifePlayerPositionPx = Object.freeze({ ...this.wildlife.session.snapshot().checkpoint.position });
        this.wildlifeRuntimeTick = 0;
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  private withCisternCapacity(session: GameSession): GameSession {
    if (session.snapshot().capabilities.appliedMilestones[CISTERN_CAPACITY_CONTRACT.milestoneId]) return session;
    const transactionId = `${PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX}:${session.sessionId}`;
    const commit = commitSessionProposal(session, proposeCapabilityMilestone(transactionId, CISTERN_CAPACITY_CONTRACT));
    if (!commit.committed) throw new Error(`cistern capacity milestone rejected: ${commit.reason}`);
    return commit.session;
  }

  private activateWildlife(wildlife: PrologueWildlifeSession): void {
    this.arrival = null; this.settlement = null; this.infrastructure = null; this.cistern = null;
    this.wildlife = wildlife;
    this.wildlifePlayerPositionPx = Object.freeze({ ...wildlife.session.snapshot().checkpoint.position });
    this.wildlifeRuntimeTick = 0;
  }

  private reconcileMode(): void {
    const sceneId = this.session.snapshot().world.currentSceneId;
    if (this.arrival && sceneId === PROLOGUE_SETTLEMENT_SCENE_ID) {
      const session = this.arrival.session;
      const adoption = PrologueSettlementSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.settlement) throw new Error(`settlement entry rejected: ${adoption.reason}`);
      this.arrival = null;
      this.settlement = this.crossSaveCoordinator
        ? new PrologueSettlementSession(adoption.settlement.session, this.crossSaveCoordinator)
        : adoption.settlement;
      return;
    }
    if (this.settlement && sceneId === PROLOGUE_WATERWHEEL_SCENE_ID) {
      const session = this.settlement.session;
      const adoption = PrologueWaterwheelSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_WATERWHEEL_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.infrastructure) throw new Error(`waterwheel entry rejected: ${adoption.reason}`);
      this.commitCrossSaveRegionExit(adoption.infrastructure.session);
      this.settlement = null;
      this.infrastructure = adoption.infrastructure;
      return;
    }
    if (this.infrastructure && sceneId === PROLOGUE_CISTERN_SCENE_ID) {
      const session = this.withCisternCapacity(this.infrastructure.session);
      const adoption = PrologueCisternSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.cistern) throw new Error(`cistern entry rejected: ${adoption.reason}`);
      this.infrastructure = null;
      this.cistern = adoption.cistern;
      return;
    }
    if (this.settlement && arrivalScene(sceneId)) {
      const session = this.settlement.session;
      this.commitCrossSaveRegionExit(session);
      this.settlement = null;
      this.arrival = new PrologueArrivalStreamSession(session);
      return;
    }
    if (!arrivalScene(sceneId) && sceneId !== PROLOGUE_SETTLEMENT_SCENE_ID &&
        !infrastructureScene(sceneId) && sceneId !== PROLOGUE_CISTERN_SCENE_ID &&
        sceneId !== PROLOGUE_WILDLIFE_SCENE_ID) {
      throw new Error(`unsupported prologue scene: ${sceneId}`);
    }
  }

  private commitCrossSaveRegionExit(session: GameSession): void {
    if (!this.crossSaveCoordinator) return;
    this.crossSaveCoordinator.synchronizeOrdinarySession(session);
    const recovery = this.crossSaveCoordinator.regionExitBarrier();
    if (recovery.sceneActivationBlocked) throw new Error("cross-save region exit recovery blocks activation");
  }

  private delegated<T>(result: T, accepted: boolean): PrologueFlowAction<T> {
    return Object.freeze({ accepted, reason: accepted ? "delegated" : "delegate_rejected", result, snapshot: this.snapshot() });
  }
  private rejectedMode<T>(): PrologueFlowAction<T> {
    return Object.freeze({ accepted: false, reason: "wrong_mode", result: null, snapshot: this.snapshot() });
  }
  private rejectedDelegate<T>(): PrologueFlowAction<T> {
    return Object.freeze({ accepted: false, reason: "delegate_rejected", result: null, snapshot: this.snapshot() });
  }
}
