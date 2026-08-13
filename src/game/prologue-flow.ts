import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeCisternTaskManifest } from "../content/runtime-task-manifest";
import type { RuntimeInput, RuntimeSnapshot } from "../runtime";
import { commitSessionProposal, proposeCapabilityMilestone } from "../session/adapters";
import { readVerifiedCapabilityMilestoneContract } from "../session/capability-contract";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
} from "../session/game-session";
import type { LivingSafetyZone, PointPx } from "../spells/cast-plan";
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

export type PrologueFlowMode = "arrival_stream" | "settlement" | "infrastructure" | "cistern";
export type PrologueFlowActionReason = "delegated" | "wrong_mode" | "delegate_rejected";

export interface PrologueFlowSnapshot {
  readonly mode: PrologueFlowMode;
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly arrival: PrologueArrivalStreamSnapshot | null;
  readonly settlement: PrologueSettlementSnapshot | null;
  readonly infrastructure: PrologueWaterwheelSnapshot | null;
  readonly cistern: PrologueCisternSnapshot | null;
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

export interface PrologueFlowFreshOptions {
  readonly sessionId: string;
  readonly currentMp?: number;
  readonly maxMp?: number;
}

type ArrivalAcceptedResult = PrologueActionResult;
type SettlementAcceptedResult = SettlementActionResult | SettlementDialogueResult;
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

/** One persisted GameSession coordinating the playable N00 -> N05 prologue. */
export class PrologueFlowSession {
  private arrival: PrologueArrivalStreamSession | null;
  private settlement: PrologueSettlementSession | null;
  private infrastructure: PrologueWaterwheelSession | null;
  private cistern: PrologueCisternSession | null;

  private constructor(session: GameSession) {
    const sceneId = session.snapshot().world.currentSceneId;
    this.arrival = arrivalScene(sceneId) ? new PrologueArrivalStreamSession(session) : null;
    this.settlement = sceneId === PROLOGUE_SETTLEMENT_SCENE_ID ? new PrologueSettlementSession(session) : null;
    this.infrastructure = infrastructureScene(sceneId) ? new PrologueWaterwheelSession(session) : null;
    this.cistern = sceneId === PROLOGUE_CISTERN_SCENE_ID ? new PrologueCisternSession(session) : null;
    if (!this.arrival && !this.settlement && !this.infrastructure && !this.cistern) {
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
    const entryCommitted = Object.values(state.world.flags).some((flag) =>
      flag.scope === "region" && flag.regionId === "valley_prologue" &&
      flag.flagId === PROLOGUE_CISTERN_REGION_FLAGS.entryCrossed && flag.value === true
    );
    if (state.world.currentSceneId !== PROLOGUE_CISTERN_SCENE_ID || entryCommitted) return flow;

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

  get session(): GameSession {
    return this.arrival?.session ?? this.settlement?.session ?? this.infrastructure?.session ?? this.cistern!.session;
  }

  toSave(): GameSessionSave {
    return this.session.toSave();
  }

  snapshot(): PrologueFlowSnapshot {
    if (this.arrival) {
      const arrival = this.arrival.snapshot();
      return Object.freeze({ mode: "arrival_stream", session: arrival.session, runtime: arrival.runtime,
        arrival, settlement: null, infrastructure: null, cistern: null, killCount: 0 });
    }
    if (this.settlement) {
      const settlement = this.settlement.snapshot();
      return Object.freeze({ mode: "settlement", session: settlement.session, runtime: settlement.runtime,
        arrival: null, settlement, infrastructure: null, cistern: null, killCount: 0 });
    }
    if (this.infrastructure) {
      const infrastructure = this.infrastructure.snapshot();
      return Object.freeze({ mode: "infrastructure", session: infrastructure.session, runtime: infrastructure.runtime,
        arrival: null, settlement: null, infrastructure, cistern: null, killCount: 0 });
    }
    const cistern = this.cistern!.snapshot();
    return Object.freeze({ mode: "cistern", session: cistern.session, runtime: cistern.runtime,
      arrival: null, settlement: null, infrastructure: null, cistern, killCount: 0 });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueFlowSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    for (let index = 0; index < ticks; index += 1) {
      if (this.arrival) this.arrival.advanceTicks(1, input);
      else if (this.settlement) this.settlement.advanceTicks(1, input);
      else if (this.infrastructure) this.infrastructure.advanceTicks(1, input);
      else this.cistern!.advanceTicks(1, input);
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

  enterWaterwheel(transactionId: string): PrologueFlowAction<PrologueWaterwheelEntryResult> {
    if (!this.settlement) return this.rejectedMode();
    try {
      const result = PrologueWaterwheelSession.enterFromSettlement(this.settlement.session, transactionId);
      if (result.accepted && result.infrastructure) {
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
        this.settlement = new PrologueSettlementSession(result.session);
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
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetToCheckpoint(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetToCheckpoint(transactionId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.resetToCheckpoint(transactionId));
    return this.delegateCistern((x) => x.resetToCheckpoint(transactionId));
  }

  resetArea(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetArea(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetArea(transactionId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.recoverSoftLock(transactionId));
    return this.delegateCistern((x) => x.recoverSoftLock(transactionId));
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

  private withCisternCapacity(session: GameSession): GameSession {
    if (session.snapshot().capabilities.appliedMilestones[CISTERN_CAPACITY_CONTRACT.milestoneId]) return session;
    const transactionId = `${PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX}:${session.sessionId}`;
    const commit = commitSessionProposal(session, proposeCapabilityMilestone(transactionId, CISTERN_CAPACITY_CONTRACT));
    if (!commit.committed) throw new Error(`cistern capacity milestone rejected: ${commit.reason}`);
    return commit.session;
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
      this.settlement = adoption.settlement;
      return;
    }
    if (this.settlement && sceneId === PROLOGUE_WATERWHEEL_SCENE_ID) {
      const session = this.settlement.session;
      const adoption = PrologueWaterwheelSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_WATERWHEEL_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.infrastructure) throw new Error(`waterwheel entry rejected: ${adoption.reason}`);
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
      this.settlement = null;
      this.arrival = new PrologueArrivalStreamSession(session);
      return;
    }
    if (!arrivalScene(sceneId) && sceneId !== PROLOGUE_SETTLEMENT_SCENE_ID &&
        !infrastructureScene(sceneId) && sceneId !== PROLOGUE_CISTERN_SCENE_ID) {
      throw new Error(`unsupported prologue scene: ${sceneId}`);
    }
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
