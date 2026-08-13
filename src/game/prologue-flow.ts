import type { RuntimeInput, RuntimeSnapshot } from "../runtime";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
} from "../session/game-session";
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

export type PrologueFlowMode = "arrival_stream" | "settlement" | "infrastructure";
export type PrologueFlowActionReason = "delegated" | "wrong_mode" | "delegate_rejected";

export interface PrologueFlowSnapshot {
  readonly mode: PrologueFlowMode;
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly arrival: PrologueArrivalStreamSnapshot | null;
  readonly settlement: PrologueSettlementSnapshot | null;
  readonly infrastructure: PrologueWaterwheelSnapshot | null;
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

export interface PrologueFlowFreshOptions {
  readonly sessionId: string;
  readonly currentMp?: number;
  readonly maxMp?: number;
}

type ArrivalAcceptedResult = PrologueActionResult;
type SettlementAcceptedResult = SettlementActionResult | SettlementDialogueResult;
type InfrastructureAcceptedResult = InfrastructureActionResult | InfrastructureLanguageActionResult;

const arrivalScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_ARRIVAL_SCENE_ID || sceneId === PROLOGUE_STREAM_SCENE_ID;
const infrastructureScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_WATERWHEEL_SCENE_ID || sceneId === PROLOGUE_SERVICE_CHANNEL_SCENE_ID;

/** One persisted GameSession coordinating the playable N00 -> N04 prologue. */
export class PrologueFlowSession {
  private arrival: PrologueArrivalStreamSession | null;
  private settlement: PrologueSettlementSession | null;
  private infrastructure: PrologueWaterwheelSession | null;

  private constructor(session: GameSession) {
    const sceneId = session.snapshot().world.currentSceneId;
    if (arrivalScene(sceneId)) {
      this.arrival = new PrologueArrivalStreamSession(session);
      this.settlement = null;
      this.infrastructure = null;
      return;
    }
    if (sceneId === PROLOGUE_SETTLEMENT_SCENE_ID) {
      this.arrival = null;
      this.settlement = new PrologueSettlementSession(session);
      this.infrastructure = null;
      return;
    }
    if (infrastructureScene(sceneId)) {
      this.arrival = null;
      this.settlement = null;
      this.infrastructure = new PrologueWaterwheelSession(session);
      return;
    }
    throw new Error(`unsupported prologue scene: ${sceneId}`);
  }

  static fresh(options: PrologueFlowFreshOptions): PrologueFlowSession {
    return new PrologueFlowSession(createPrologueArrivalStreamInitialSession(options));
  }

  static fromSave(candidate: unknown): PrologueFlowSession {
    return new PrologueFlowSession(GameSession.fromSave(candidate));
  }

  get session(): GameSession {
    return this.arrival?.session ?? this.settlement?.session ?? this.infrastructure!.session;
  }

  toSave(): GameSessionSave {
    return this.session.toSave();
  }

  snapshot(): PrologueFlowSnapshot {
    if (this.arrival) {
      const arrival = this.arrival.snapshot();
      return Object.freeze({ mode: "arrival_stream", session: arrival.session, runtime: arrival.runtime,
        arrival, settlement: null, infrastructure: null, killCount: 0 });
    }
    if (this.settlement) {
      const settlement = this.settlement.snapshot();
      return Object.freeze({ mode: "settlement", session: settlement.session, runtime: settlement.runtime,
        arrival: null, settlement, infrastructure: null, killCount: 0 });
    }
    const infrastructure = this.infrastructure!.snapshot();
    return Object.freeze({ mode: "infrastructure", session: infrastructure.session, runtime: infrastructure.runtime,
      arrival: null, settlement: null, infrastructure, killCount: 0 });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueFlowSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    for (let index = 0; index < ticks; index += 1) {
      if (this.arrival) this.arrival.advanceTicks(1, input);
      else if (this.settlement) this.settlement.advanceTicks(1, input);
      else this.infrastructure!.advanceTicks(1, input);
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
    } catch {
      return this.rejectedDelegate();
    }
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
    } catch {
      return this.rejectedDelegate();
    }
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

  setCheckpoint(transactionId: string, checkpointId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.setCheckpoint(transactionId, checkpointId));
    if (this.settlement) return this.delegateSettlement((x) => x.setCheckpoint(transactionId, checkpointId));
    return this.delegateInfrastructure((x) => x.setCheckpoint(
      transactionId,
      checkpointId,
      this.snapshot().runtime.player.position,
    ));
  }

  resetToCheckpoint(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetToCheckpoint(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetToCheckpoint(transactionId));
    return this.delegateInfrastructure((x) => x.resetToCheckpoint(transactionId));
  }

  resetArea(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetArea(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetArea(transactionId));
    return this.delegateInfrastructure((x) => x.recoverSoftLock(transactionId));
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
    if (this.settlement && arrivalScene(sceneId)) {
      const session = this.settlement.session;
      this.settlement = null;
      this.arrival = new PrologueArrivalStreamSession(session);
      return;
    }
    if (!arrivalScene(sceneId) && sceneId !== PROLOGUE_SETTLEMENT_SCENE_ID && !infrastructureScene(sceneId)) {
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
