import type { CisternConfirmResult, CisternMpRecoveryResult } from "../game/cistern-demo";
import type { DemoActionResult, SettlementDemoSave } from "../game/settlement-demo";
import type { SurvivalSave, SurvivalTransactionResult } from "../game/survival";
import type { CommitResult, TradeSave } from "../game/trade";
import type { EvidenceProposalResult } from "../learning/cistern-session";
import type { LearningProgressionSnapshot } from "../learning/progression";
import type { CastExecutionResult, MpRecoveryReceipt } from "../spells/cast-plan";
import {
  GameSession,
  adaptSurvivalSave,
  adaptTradeSnapshot,
  type GameSessionEvent,
  type SessionApplyResult,
  type SessionCheckpointState,
  type SessionEconomySummary,
  type SessionReceiptDomain,
} from "./game-session";

/**
 * Transaction boundary:
 * 1. An old subsystem executes a transaction in memory.
 * 2. This module derives immutable GameSession proposals from the result.
 * 3. The caller atomically commits the proposal batch to a cloned GameSession.
 * 4. Only the resulting GameSession save is persisted. Never persist executor saves beside it.
 */
export interface SessionEventDraft<TEvent extends GameSessionEvent = GameSessionEvent> {
  readonly eventId: string;
  readonly type: TEvent["type"];
  readonly payload: TEvent["payload"];
}

export interface SessionProposalBatch {
  readonly transactionId: string;
  readonly drafts: readonly SessionEventDraft[];
}

export type SessionProposalResult =
  | Readonly<{ accepted: true; batch: SessionProposalBatch }>
  | Readonly<{ accepted: false; reason: "executor_rejected" | "executor_duplicate" | "executor_missing_receipt" }>;

export interface SessionBatchCommitResult {
  readonly committed: boolean;
  readonly failedDraftId: string | null;
  readonly reason: SessionApplyResult["reason"] | null;
  readonly session: GameSession;
}

const receiptDraft = (
  transactionId: string,
  domain: SessionReceiptDomain,
  payloadHash: string,
): SessionEventDraft => ({
  eventId: `session.receipt.${domain}.${transactionId}`,
  type: "receipt_recorded",
  payload: { receiptId: transactionId, domain, payloadHash },
});

const finiteNonNegative = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`);
};

const requiredId = (value: string, name: string): void => {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
};

const uniqueReceiptDrafts = (
  receiptIds: readonly string[],
  domain: SessionReceiptDomain,
  prefix: string,
): readonly SessionEventDraft[] => [...new Set(receiptIds)].map((receiptId) =>
  receiptDraft(receiptId, domain, `${prefix}:${receiptId}`));

export const proposeCastExecution = (
  result: CastExecutionResult,
  maxMp: number,
): SessionProposalResult => {
  if (!result.committed) return { accepted: false, reason: result.duplicate ? "executor_duplicate" : "executor_rejected" };
  finiteNonNegative(maxMp, "maxMp");
  if (result.snapshot.mp > maxMp) throw new Error("cast result MP exceeds maxMp");
  const transactionId = result.idempotencyKey;
  requiredId(transactionId, "cast idempotency key");
  return {
    accepted: true,
    batch: {
      transactionId,
      drafts: [
        {
          eventId: `session.cast.mp.${transactionId}`,
          type: "mp_replaced",
          payload: {
            mp: {
              currentMp: result.snapshot.mp,
              maxMp,
              worldVersion: result.snapshot.worldVersion,
            },
          },
        },
        receiptDraft(transactionId, "cast", `cast:${result.planId}:charge:${result.mpCharge}`),
      ],
    },
  };
};

export const proposeCisternCast = (
  result: CisternConfirmResult,
  maxMp = result.snapshot.maxMp,
): SessionProposalResult => result.execution
  ? proposeCastExecution(result.execution, maxMp)
  : { accepted: false, reason: "executor_missing_receipt" };

export const proposeMpRecovery = (receipt: MpRecoveryReceipt): SessionProposalResult => {
  if (receipt.duplicate) return { accepted: false, reason: "executor_duplicate" };
  if (receipt.reason === "idempotency_conflict") return { accepted: false, reason: "executor_rejected" };
  const transactionId = `${receipt.source}:${receipt.recoveryId}`;
  return {
    accepted: true,
    batch: {
      transactionId,
      drafts: [
        {
          eventId: `session.recovery.mp.${transactionId}`,
          type: "mp_replaced",
          payload: {
            mp: {
              currentMp: receipt.afterMp,
              maxMp: receipt.maxMp,
              // MP-only recovery does not mutate the world. Commit fills this from session truth.
              worldVersion: -1,
            },
          },
        },
        receiptDraft(
          transactionId,
          "mp_recovery",
          `recovery:${receipt.beforeMp}:${receipt.restoredMp}:${receipt.afterMp}:${String(receipt.answerAccepted)}`,
        ),
      ],
    },
  };
};

export const proposeCisternRecovery = (result: CisternMpRecoveryResult): SessionProposalResult =>
  result.accepted && result.receipt
    ? proposeMpRecovery(result.receipt)
    : { accepted: false, reason: "executor_missing_receipt" };

export const proposeLearningReplacement = (
  transactionId: string,
  proposal: EvidenceProposalResult,
): SessionProposalResult => {
  requiredId(transactionId, "learning transactionId");
  if (proposal.reason !== "proposed") return { accepted: false, reason: "executor_rejected" };
  const eligibleEvents = proposal.reductions.filter((reduction) => reduction.applied);
  if (eligibleEvents.length === 0) return { accepted: false, reason: "executor_duplicate" };
  return {
    accepted: true,
    batch: {
      transactionId,
      drafts: [
        {
          eventId: `session.learning.state.${transactionId}`,
          type: "learning_replaced",
          payload: { learning: proposal.learning },
        },
        ...proposal.proposedEvents.map((event) => receiptDraft(
          event.idempotencyKey,
          "learning",
          `learning:${event.eventType}:${event.eventId}`,
        )),
      ],
    },
  };
};

export const proposeLearningSnapshot = (
  transactionId: string,
  learning: LearningProgressionSnapshot,
  evidenceReceiptIds: readonly string[],
): SessionProposalBatch => ({
  transactionId,
  drafts: [
    {
      eventId: `session.learning.state.${transactionId}`,
      type: "learning_replaced",
      payload: { learning },
    },
    ...uniqueReceiptDrafts(evidenceReceiptIds, "learning", "learning-evidence"),
  ],
});

export const proposeSurvivalTransaction = (
  transactionId: string,
  result: SurvivalTransactionResult,
  executorSave: SurvivalSave,
): SessionProposalResult => {
  requiredId(transactionId, "survival transactionId");
  if (!result.committed) return { accepted: false, reason: result.duplicate ? "executor_duplicate" : "executor_rejected" };
  const save = adaptSurvivalSave(executorSave);
  if (!save.receipts.includes(transactionId)) throw new Error("committed survival transaction is missing its receipt");
  return {
    accepted: true,
    batch: {
      transactionId,
      drafts: [
        {
          eventId: `session.survival.state.${transactionId}`,
          type: "survival_replaced",
          payload: { survival: save },
        },
        receiptDraft(transactionId, "survival", `survival:${save.revision}`),
      ],
    },
  };
};

export const proposeTradeTransaction = (
  result: CommitResult,
  executorSave: TradeSave,
): SessionProposalResult => {
  if (!result.committed) return { accepted: false, reason: result.duplicate ? "executor_duplicate" : "executor_rejected" };
  if (!result.receipt) return { accepted: false, reason: "executor_missing_receipt" };
  const transactionId = result.receipt.transactionId;
  if (!executorSave.receipts.some((receipt) => receipt.transactionId === transactionId)) {
    throw new Error("committed trade transaction is missing its receipt");
  }
  const economy = adaptTradeSnapshot(executorSave);
  return {
    accepted: true,
    batch: {
      transactionId,
      drafts: [
        {
          eventId: `session.trade.state.${transactionId}`,
          type: "economy_replaced",
          payload: { economy },
        },
        receiptDraft(
          transactionId,
          "trade",
          `trade:${result.receipt.quoteId}:${result.receipt.itemId}:${result.receipt.quantity}:${result.receipt.coinDelta}`,
        ),
      ],
    },
  };
};

export const proposeQuestStage = (
  transactionId: string,
  questId: string,
  stageId: string,
  stageOrdinal: number,
): SessionProposalBatch => ({
  transactionId,
  drafts: [
    {
      eventId: `session.quest.stage.${transactionId}`,
      type: "quest_stage_set",
      payload: { questId, stageId, stageOrdinal },
    },
    receiptDraft(transactionId, "quest", `quest:${questId}:${stageId}:${stageOrdinal}`),
  ],
});

export const proposeCheckpoint = (
  transactionId: string,
  checkpoint: SessionCheckpointState,
): SessionProposalBatch => ({
  transactionId,
  drafts: [
    { eventId: `session.checkpoint.${transactionId}`, type: "checkpoint_set", payload: { checkpoint } },
    receiptDraft(transactionId, "world", `checkpoint:${checkpoint.id}:${checkpoint.revision}`),
  ],
});

export interface RuntimeCheckpointSnapshot {
  readonly checkpointId: string;
  readonly sceneId: string;
  readonly positionPx: Readonly<{ x: number; y: number }>;
  readonly revision: number;
}

export const adaptRuntimeCheckpoint = (checkpoint: RuntimeCheckpointSnapshot): SessionCheckpointState => ({
  id: checkpoint.checkpointId,
  sceneId: checkpoint.sceneId,
  position: { ...checkpoint.positionPx },
  revision: checkpoint.revision,
});

export const proposeSettlementReplacement = (
  transactionId: string,
  result: DemoActionResult,
  executorSave: SettlementDemoSave,
): SessionProposalResult => {
  if (!result.committed) return { accepted: false, reason: result.duplicate ? "executor_duplicate" : "executor_rejected" };
  if (!executorSave.receipts.includes(transactionId)) throw new Error("settlement action is missing its receipt");
  const economy: SessionEconomySummary = {
    coin: executorSave.coins,
    walletRevision: executorSave.transactionSequence,
    inventoryRevision: executorSave.transactionSequence,
    lots: [
      { lotId: "settlement.raw-meat", itemId: "food.raw_small_game_meat", quantity: executorSave.rawMeat, ownershipRevision: executorSave.transactionSequence, freshnessRevision: 0 },
      { lotId: "settlement.cooked-meat", itemId: "food.cooked_game_meat", quantity: executorSave.cookedMeat, ownershipRevision: executorSave.transactionSequence, freshnessRevision: 0 },
    ],
  };
  return {
    accepted: true,
    batch: {
      transactionId,
      drafts: [
        { eventId: `session.settlement.survival.${transactionId}`, type: "survival_replaced", payload: { survival: executorSave.survival } },
        { eventId: `session.settlement.economy.${transactionId}`, type: "economy_replaced", payload: { economy } },
        receiptDraft(transactionId, "other", `settlement:${executorSave.transactionSequence}`),
      ],
    },
  };
};

const materializeDraft = (
  draft: SessionEventDraft,
  sequence: number,
  session: GameSession,
): GameSessionEvent => {
  if (draft.type === "mp_replaced") {
    const payload = draft.payload as Extract<GameSessionEvent, { type: "mp_replaced" }>["payload"];
    const mp = payload.mp.worldVersion === -1
      ? { ...payload.mp, worldVersion: session.snapshot().mp.worldVersion }
      : payload.mp;
    return { eventId: draft.eventId, sequence, type: "mp_replaced", payload: { mp } };
  }
  return { ...draft, sequence } as GameSessionEvent;
};

export const commitSessionProposal = (
  authoritative: GameSession,
  batch: SessionProposalBatch,
): SessionBatchCommitResult => {
  const working = GameSession.fromSave(authoritative.toSave());
  for (const draft of batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const result = working.apply(event);
    if (!result.applied) {
      return { committed: false, failedDraftId: draft.eventId, reason: result.reason, session: authoritative };
    }
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};
