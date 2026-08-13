import type { WildlifeDamageRequest } from "./life-corpse-ledger";
import type { VerifiedSellQuote } from "./verified-trade";
import type { WildlifeProcessingAction } from "./wildlife-processing";
import type { SessionBatchCommitResult, SessionProposalBatch } from "../session/adapters";
import type { GameSession, GameSessionSave } from "../session/game-session";
import type { CrossSaveWalRecord, CrossSaveWalRecovery } from "../persistence/cross-save-wal";

/**
 * Application port for transactions whose material effects span independently
 * persisted save owners. The game layer owns this contract; browser/local
 * persistence is an adapter and must not leak into gameplay policy.
 */
export interface CrossSaveTransactionCoordinator {
  readSession(): GameSession;
  commitOrdinary(batch: SessionProposalBatch): SessionBatchCommitResult;
  synchronizeOrdinarySession(session: GameSession): void;
  commitDeath(request: WildlifeDamageRequest, tick?: number): CrossSaveWalRecord;
  commitProcessing(request: WildlifeProcessingAction, tick?: number): CrossSaveWalRecord;
  commitWork(workOrderId: string, interactionReceiptId: string, tick?: number): CrossSaveWalRecord;
  commitConsumption(
    request: Readonly<{ playerSaveId: string; lotId: string; quantity?: number; consumptionSequence: number }>,
    tick?: number,
  ): CrossSaveWalRecord;
  commitSell(
    quote: VerifiedSellQuote,
    issuedEventId: string,
    runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number }>,
    tick?: number,
  ): CrossSaveWalRecord;
  checkpointBarrier(tick?: number): CrossSaveWalRecovery;
  regionExitBarrier(tick?: number): CrossSaveWalRecovery;
  isSceneActivationReady(): boolean;
  toSessionSave(): GameSessionSave;
}
