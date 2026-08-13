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

export type PrologueFlowMode = "arrival_stream" | "settlement";
export type PrologueFlowActionReason = "delegated" | "wrong_mode" | "delegate_rejected";

export interface PrologueFlowSnapshot {
  readonly mode: PrologueFlowMode;
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly arrival: PrologueArrivalStreamSnapshot | null;
  readonly settlement: PrologueSettlementSnapshot | null;
  readonly killCount: 0;
}

export interface PrologueFlowAction<T> {
  readonly accepted: boolean;
  readonly reason: PrologueFlowActionReason;
  /** The delegated coordinator's unmodified result. Null means the mode rejected the action. */
  readonly result: T | null;
  readonly snapshot: PrologueFlowSnapshot;
}

export const PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX = "prologue.flow.settlement.entry";

export interface PrologueFlowFreshOptions {
  readonly sessionId: string;
  readonly currentMp?: number;
  readonly maxMp?: number;
}

type ArrivalAcceptedResult = PrologueActionResult;
type SettlementAcceptedResult = SettlementActionResult | SettlementDialogueResult;

const arrivalScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_ARRIVAL_SCENE_ID || sceneId === PROLOGUE_STREAM_SCENE_ID;

const acceptedByDelegate = (result: { readonly accepted: boolean }): boolean => result.accepted;

/**
 * Single-save prologue coordinator for N00 -> N01 -> N02 and the return route.
 *
 * The active child is an executor only. It is discarded and reconstructed
 * whenever GameSession's current scene crosses the N01/N02 boundary. This
 * prevents parallel saves, avoids replaying settlement entry, and keeps MP,
 * learning, economy, quests, receipts and global progress on one ledger.
 */
export class PrologueFlowSession {
  private arrival: PrologueArrivalStreamSession | null;
  private settlement: PrologueSettlementSession | null;

  private constructor(session: GameSession) {
    const sceneId = session.snapshot().world.currentSceneId;
    if (arrivalScene(sceneId)) {
      this.arrival = new PrologueArrivalStreamSession(session);
      this.settlement = null;
      return;
    }
    if (sceneId === PROLOGUE_SETTLEMENT_SCENE_ID) {
      this.arrival = null;
      this.settlement = new PrologueSettlementSession(session);
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
    return this.arrival?.session ?? this.settlement!.session;
  }

  toSave(): GameSessionSave {
    return this.session.toSave();
  }

  snapshot(): PrologueFlowSnapshot {
    if (this.arrival) {
      const arrival = this.arrival.snapshot();
      return Object.freeze({
        mode: "arrival_stream",
        session: arrival.session,
        runtime: arrival.runtime,
        arrival,
        settlement: null,
        killCount: 0,
      });
    }
    const settlement = this.settlement!.snapshot();
    return Object.freeze({
      mode: "settlement",
      session: settlement.session,
      runtime: settlement.runtime,
      arrival: null,
      settlement,
      killCount: 0,
    });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueFlowSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new RangeError("ticks must be a non-negative safe integer");
    }
    // Advance one fixed step at a time so a boundary handoff never runs the
    // remainder of a frame batch through the wrong scene coordinator.
    for (let index = 0; index < ticks; index += 1) {
      if (this.arrival) this.arrival.advanceTicks(1, input);
      else this.settlement!.advanceTicks(1, input);
      this.reconcileMode();
    }
    return this.snapshot();
  }

  pushLooseStone(transactionId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.pushLooseStone(transactionId));
  }

  placeRottenLog(transactionId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.placeRottenLog(transactionId));
  }

  digSoftSoil(transactionId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.digSoftSoil(transactionId));
  }

  discoverTelo(occurrenceId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.discoverTelo(occurrenceId));
  }

  attuneTelo(attemptId: string, occurrenceId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.attuneTelo(attemptId, occurrenceId));
  }

  manifestTelo(transactionId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.manifestTelo(transactionId));
  }

  damageCrossing(transactionId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.damageCrossing(transactionId));
  }

  repairCrossing(transactionId: string): PrologueFlowAction<PrologueActionResult> {
    return this.delegateArrival((target) => target.repairCrossing(transactionId));
  }

  talk(npcId: string, topic: SettlementDialogueTopic = "role"): PrologueFlowAction<SettlementDialogueResult> {
    return this.delegateSettlement((target) => target.talk(npcId, topic));
  }

  clarify(npcId: string, topic: SettlementDialogueTopic): PrologueFlowAction<SettlementDialogueResult> {
    return this.delegateSettlement((target) => target.clarify(npcId, topic));
  }

  usePublicRelief(transactionId: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((target) => target.usePublicRelief(transactionId));
  }

  meditate(transactionId: string, answerAccepted: boolean): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((target) => target.meditate(transactionId, answerAccepted));
  }

  acceptSurveyJob(transactionId: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((target) => target.acceptSurveyJob(transactionId));
  }

  inspectSurveyMarker(transactionId: string, markerId: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((target) => target.inspectSurveyMarkers(transactionId, markerId));
  }

  inspectSurveyMarkers(transactionId: string, markerId?: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((target) => target.inspectSurveyMarkers(transactionId, markerId));
  }

  submitSurveyJob(transactionId: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((target) => target.submitSurveyJob(transactionId));
  }

  openTrade(transactionId: string): PrologueFlowAction<SettlementTradeOpenResult> {
    return this.delegateSettlement((target) => target.openTrade(transactionId));
  }

  setCheckpoint(
    transactionId: string,
    checkpointId: string,
  ): PrologueFlowAction<PrologueArrivalStreamSnapshot | SettlementActionResult> {
    if (this.arrival) {
      return this.delegateArrivalSnapshot((target) => target.setCheckpoint(transactionId, checkpointId));
    }
    return this.delegateSettlement((target) => target.setCheckpoint(transactionId, checkpointId));
  }

  resetToCheckpoint(
    transactionId: string,
  ): PrologueFlowAction<PrologueArrivalStreamSnapshot | SettlementActionResult> {
    if (this.arrival) {
      return this.delegateArrivalSnapshot((target) => target.resetToCheckpoint(transactionId));
    }
    const delegated = this.delegateSettlement((target) => target.resetToCheckpoint(transactionId));
    this.reconcileMode();
    return { ...delegated, snapshot: this.snapshot() };
  }

  resetArea(
    transactionId: string,
  ): PrologueFlowAction<PrologueArrivalStreamSnapshot | SettlementActionResult> {
    if (this.arrival) {
      return this.delegateArrivalSnapshot((target) => target.resetArea(transactionId));
    }
    const delegated = this.delegateSettlement((target) => target.resetArea(transactionId));
    this.reconcileMode();
    return { ...delegated, snapshot: this.snapshot() };
  }

  private delegateArrival<T extends ArrivalAcceptedResult>(
    action: (target: PrologueArrivalStreamSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.arrival) return this.rejectedMode();
    try {
      const result = action(this.arrival);
      this.reconcileMode();
      return this.delegated(result, acceptedByDelegate(result));
    } catch {
      return this.rejectedDelegate();
    }
  }

  private delegateArrivalSnapshot<T extends PrologueArrivalStreamSnapshot>(
    action: (target: PrologueArrivalStreamSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.arrival) return this.rejectedMode();
    try {
      const result = action(this.arrival);
      this.reconcileMode();
      return this.delegated(result, true);
    } catch {
      return this.rejectedDelegate();
    }
  }

  private delegateSettlement<T extends SettlementAcceptedResult>(
    action: (target: PrologueSettlementSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.settlement) return this.rejectedMode();
    try {
      const result = action(this.settlement);
      this.reconcileMode();
      return this.delegated(result, acceptedByDelegate(result));
    } catch {
      return this.rejectedDelegate();
    }
  }

  private reconcileMode(): void {
    const sceneId = this.session.snapshot().world.currentSceneId;
    if (this.arrival && sceneId === PROLOGUE_SETTLEMENT_SCENE_ID) {
      // Arrival owns the runtime scene transition and canonical first-traverse
      // region flag. Settlement adopts that committed handoff exactly once to
      // add its entry checkpoint, settlement_reached flag and operation receipt.
      const session = this.arrival.session;
      const adoption = PrologueSettlementSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.settlement) {
        throw new Error(`settlement runtime entry adoption rejected: ${adoption.reason}`);
      }
      this.arrival = null;
      this.settlement = adoption.settlement;
      return;
    }
    if (this.settlement && arrivalScene(sceneId)) {
      const session = this.settlement.session;
      this.settlement = null;
      this.arrival = new PrologueArrivalStreamSession(session);
      return;
    }
    if (!arrivalScene(sceneId) && sceneId !== PROLOGUE_SETTLEMENT_SCENE_ID) {
      throw new Error(`unsupported prologue scene: ${sceneId}`);
    }
  }

  private delegated<T>(result: T, accepted: boolean): PrologueFlowAction<T> {
    return Object.freeze({
      accepted,
      reason: accepted ? "delegated" : "delegate_rejected",
      result,
      snapshot: this.snapshot(),
    });
  }

  private rejectedMode<T>(): PrologueFlowAction<T> {
    return Object.freeze({ accepted: false, reason: "wrong_mode", result: null, snapshot: this.snapshot() });
  }

  private rejectedDelegate<T>(): PrologueFlowAction<T> {
    return Object.freeze({ accepted: false, reason: "delegate_rejected", result: null, snapshot: this.snapshot() });
  }
}

