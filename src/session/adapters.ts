import { canonicalInventoryConsumptionKey, inventoryConsumptionTransactionId, materializeInventoryConsumptionAction } from "../game/inventory-consumption";
import type { CisternConfirmResult, CisternMpRecoveryResult } from "../game/cistern-demo";
import type { DemoActionResult, SettlementDemoSave } from "../game/settlement-demo";
import type { SurvivalSave, SurvivalTransactionResult } from "../game/survival";
import type { CommitResult, QuoteResult, TradeSave } from "../game/trade";
import { createVerifiedSellQuote, createVerifiedSellTransactionId, verifiedTradeManifest, type VerifiedQuoteRequest, type VerifiedSellQuote } from "../game/verified-trade";
import { adaptTradeSaveToSessionEconomy } from "../game/economy-state";
import type { EvidenceProposalResult } from "../learning/cistern-session";
import type { LearningProgressionSnapshot } from "../learning/progression";
import { isTrustedSafeRangeCommitProof, type SafeRangeCommitProof } from "../game/prologue-safe-range";
import {
  isTrustedReturnFlowQualificationCommitProof,
  type ReturnFlowQualificationCommitProof,
} from "../game/prologue-return-flow";
import {
  isTrustedAttackQualificationCommitProof,
  type AttackQualificationCommitProof,
} from "../game/prologue-attack-qualification";
import { isTrustedP0LearningCommitProof, type P0LearningCommitProof } from "../game/prologue-p0-learning";
import {
  isTrustedCore120LearningCommitProof,
  type Core120LearningCommitProof,
} from "../game/prologue-core120-learning";
import {
  WILDLIFE_ECONOMY_ID,
  ZERO_WILDLIFE_REWARD_DELTA,
  createDeterministicCorpseId,
  createDeterministicDeathEventId,
  isSessionWildlifeLifeRecord,
  tissueSlotsForLife,
  type SessionWildlifeLifeRecord,
  type WildlifeDamageRequest,
} from "../game/life-corpse-ledger";
import type { CastExecutionResult, MpRecoveryReceipt } from "../spells/cast-plan";
import {
  canonicalWildlifeProcessingIdempotencyKey,
  createWildlifeProcessingTransactionId,
  canonicalWildlifeProcessingWorkIdempotencyKey,
  createWildlifeProcessingWorkTransactionId,
  wildlifeProcessingManifest,
  wildlifeProcessingTransactionKind,
  type WildlifeProcessingAction,
  type WildlifeProcessingWorkOrder,
} from "../game/wildlife-processing";
import {
  assertVerifiedCapabilityMilestoneContract,
  type VerifiedCapabilityMilestoneContract,
} from "./capability-contract";
import { ATTACK_PERMISSION_WRITER_EVENT, ATTACK_CALIBRATION_WRITER_EVENT,
  RUNTIME_ATTACK_QUALIFICATION_CONTRACT } from "../game/attack-qualification";
import {
  GameSession,
  adaptSurvivalSave,
  type AttackQualificationEvidenceActionId,
  type GameSessionEvent,
  type SessionApplyResult,
  type SessionCheckpointState,
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

/** @deprecated Whole-learning replacement is forbidden for live production writes. */
export const proposeLearningReplacement = (
  _transactionId: string,
  _proposal: EvidenceProposalResult,
): never => {
  throw new Error("proposeLearningReplacement is disabled; commit learning evidence domain events");
};

/** @deprecated Whole-learning replacement is accepted only when replaying a legacy ledger prefix. */
export const proposeLearningSnapshot = (
  _transactionId: string,
  _learning: LearningProgressionSnapshot,
  _evidenceReceiptIds: readonly string[],
): never => {
  throw new Error("proposeLearningSnapshot is disabled; commit learning evidence domain events");
};
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

const tradeReceiptHash = (receipt: NonNullable<CommitResult["receipt"]>): string =>
  `trade:${receipt.quoteId}:${receipt.itemId}:${receipt.quantity}:${receipt.coinDelta}`;

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** Persist a successful inquiry before allowing a sale. Quotes themselves intentionally expire on load. */
export const proposeTradeQuoteSequence = (
  authoritative: GameSession,
  result: QuoteResult,
  executorSave: TradeSave,
): SessionProposalResult => {
  if (!result.accepted || !result.quote) return { accepted: false, reason: "executor_rejected" };
  const current = authoritative.snapshot().economy;
  const projected = adaptTradeSaveToSessionEconomy(executorSave, current);
  if (projected.quoteSequence !== current.quoteSequence + 1) {
    throw new Error("trade quote sequence must advance exactly once");
  }
  const { quoteSequence: _currentSequence, ...currentStable } = current;
  const { quoteSequence: _projectedSequence, ...projectedStable } = projected;
  if (!sameJson(currentStable, projectedStable)) {
    throw new Error("creating a quote may only change quoteSequence");
  }
  return {
    accepted: true,
    batch: {
      transactionId: result.quote.quoteId,
      drafts: [{
        eventId: `session.trade.quote.${result.quote.quoteId}`,
        type: "quote_sequence_advanced",
        payload: {
          expectedQuoteSequence: current.quoteSequence,
          nextQuoteSequence: projected.quoteSequence,
        },
      }],
    },
  };
};

/**
 * Domain-CAS sale projection. The one aggregate event records both the full trade receipt and
 * the unified session receipt, so a failed revision check cannot leave a half-committed sale.
 */
export const proposeTradeSale = (
  authoritative: GameSession,
  result: CommitResult,
  executorSave: TradeSave,
): SessionProposalResult => {
  if (!result.committed) return { accepted: false, reason: result.duplicate ? "executor_duplicate" : "executor_rejected" };
  if (!result.receipt) return { accepted: false, reason: "executor_missing_receipt" };
  const receipt = result.receipt;
  const savedReceipt = executorSave.receipts.find((candidate) => candidate.transactionId === receipt.transactionId);
  if (!savedReceipt || !sameJson(savedReceipt, receipt)) {
    throw new Error("committed trade transaction is missing its exact receipt");
  }
  const current = authoritative.snapshot().economy;
  const projected = adaptTradeSaveToSessionEconomy(executorSave, current);
  const currentLot = current.lots.find((lot) => lot.lotId === receipt.lotId);
  const nextLot = projected.lots.find((lot) => lot.lotId === receipt.lotId);
  const currentMerchant = current.merchantStates.find((state) => state.merchantId === receipt.merchantId);
  const nextMerchantState = projected.merchantStates.find((state) => state.merchantId === receipt.merchantId);
  if (!currentLot || !nextLot || !currentMerchant || !nextMerchantState) {
    throw new Error("trade sale projection is missing its lot or merchant state");
  }
  return {
    accepted: true,
    batch: {
      transactionId: receipt.transactionId,
      drafts: [{
        eventId: `session.trade.sale.${receipt.transactionId}`,
        type: "trade_sale_committed",
        payload: {
          expectedWalletRevision: current.walletRevision,
          expectedInventoryRevision: current.inventoryRevision,
          expectedQuoteSequence: current.quoteSequence,
          expectedLotOwnershipRevision: currentLot.ownershipRevision,
          expectedLotFreshnessRevision: currentLot.freshnessRevision,
          expectedMerchantDemandRevision: currentMerchant.demandRevision,
          nextCoin: projected.coin,
          nextWalletRevision: projected.walletRevision,
          nextInventoryRevision: projected.inventoryRevision,
          nextLot,
          nextMerchantState,
          tradeReceipt: receipt,
          sessionReceiptPayloadHash: tradeReceiptHash(receipt),
        },
      }],
    },
  };
};

/** @deprecated Whole-economy replacement is forbidden for new production transactions. */
export const proposeTradeTransaction = (_result: CommitResult, _executorSave: TradeSave): never => {
  throw new Error("proposeTradeTransaction is disabled; commit quote sequence and trade sale domain events");
};

/**
 * Builds the only proposal allowed to advance expression words, focus slots and max MP together.
 * The WeakSet assertion requires a contract returned by readVerifiedCapabilityMilestoneContract.
 */
export const proposeCapabilityMilestone = (
  transactionId: string,
  contract: VerifiedCapabilityMilestoneContract,
): SessionProposalBatch => {
  requiredId(transactionId, "capability transactionId");
  assertVerifiedCapabilityMilestoneContract(contract);
  return {
    transactionId,
    drafts: [{
      eventId: `session.capability.${contract.writerEvent}.${transactionId}`,
      type: "capability_milestone_committed",
      payload: {
        milestoneId: contract.milestoneId,
        writerEvent: contract.writerEvent,
        sourcePath: contract.sourcePath,
        sourceDigest: contract.sourceDigest,
        contractRevision: contract.contractRevision,
        resultingState: { ...contract.resultingState },
      },
    }],
  };
};

export const proposeWildlifeLifeRegistration = (
  transactionId: string,
  life: SessionWildlifeLifeRecord,
): SessionProposalBatch => {
  requiredId(transactionId, "wildlife life registration transactionId");
  if (!isSessionWildlifeLifeRecord(life) || life.state !== "alive" || life.lifeRevision !== 0 ||
      life.currentHp !== life.maxHp) throw new Error("wildlife life registration must be a validated initial life");
  return {
    transactionId,
    drafts: [{
      eventId: "session.wildlife.life." + transactionId,
      type: "wildlife_life_registered",
      payload: { life },
    }],
  };
};

/** Builds one CAS damage event. A lethal hit carries the complete corpse envelope in the same event. */
export const proposeWildlifeDamage = (
  session: GameSession,
  request: WildlifeDamageRequest,
): SessionProposalBatch => {
  requiredId(request.transactionId, "wildlife damage transactionId");
  requiredId(request.lifeInstanceId, "wildlife lifeInstanceId");
  requiredId(request.causeClass, "wildlife damage causeClass");
  finiteNonNegative(request.expectedLifeRevision, "wildlife expectedLifeRevision");
  finiteNonNegative(request.worldTick, "wildlife worldTick");
  if (!Number.isSafeInteger(request.expectedLifeRevision) || !Number.isSafeInteger(request.worldTick) ||
      !Number.isFinite(request.damage) || request.damage <= 0 || !Number.isFinite(request.position.x) ||
      !Number.isFinite(request.position.y)) throw new Error("wildlife damage request is invalid");
  const life = session.snapshot().lifeCorpseLedger.lives[request.lifeInstanceId];
  if (!life || life.state !== "alive") throw new Error("wildlife life must be registered and alive");
  const common = { ...request, rewardDelta: ZERO_WILDLIFE_REWARD_DELTA };
  if (request.damage < life.currentHp) {
    return {
      transactionId: request.transactionId,
      drafts: [{
        eventId: "session.wildlife.damage." + request.transactionId,
        type: "wildlife_damage_committed",
        payload: common,
      }],
    };
  }
  const deathEventId = createDeterministicDeathEventId(life.regionSaveId, life.lifeInstanceId);
  const corpseId = createDeterministicCorpseId(WILDLIFE_ECONOMY_ID, life.lifeInstanceId);
  return {
    transactionId: request.transactionId,
    drafts: [{
      eventId: "session.wildlife.death." + request.transactionId,
      type: "wildlife_death_committed",
      payload: {
        ...common,
        economyId: WILDLIFE_ECONOMY_ID,
        deathEventId,
        corpseId,
        tissueSlots: tissueSlotsForLife(life.species, life.ageClass),
        populationDelta: {
          species: life.species,
          adultLivingDelta: life.ageClass === "adult" ? -1 : 0,
          cause: "wildlife_death",
        },
      },
    }],
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

/** @internal Runtime authority must supply position and the matching Session scene revision. */
export const proposeWildlifeProcessingInteraction = (
  authoritative: GameSession,
  stationId: string,
  runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number; runtimeInteractionSequence: number; operationId: string }>,
): SessionProposalBatch => {
  requiredId(stationId, "stationId");
  const snapshot = authoritative.snapshot();
  const binding = wildlifeProcessingManifest().stationBindings[stationId];
  if (!binding || snapshot.world.currentSceneId !== binding.sceneId) {
    throw new Error(`processing station ${stationId} is not available in the current scene`);
  }
  requiredId(runtime.operationId, "processing interaction operationId");
  const transactionId = `wildlife-processing-interaction:${stationId}:${runtime.sceneRevision}:${runtime.operationId}`;
  return {
    transactionId,
    drafts: [{
      eventId: `session.wildlife.interaction.${stationId}.${runtime.sceneRevision}.${runtime.operationId}`,
      type: "wildlife_processing_interaction_committed",
      payload: { stationId: binding.stationId, sceneId: binding.sceneId, targetId: binding.targetId,
        interactionId: binding.interactionId, playerPositionPx: { ...runtime.playerPositionPx }, runtimeSceneRevision: runtime.sceneRevision,
        runtimeInteractionSequence: runtime.runtimeInteractionSequence, operationId: runtime.operationId },
    }],
  };
};


/**
 * Session is authoritative for tick, ledger cursor, transaction ID, and canonical idempotency key.
 * Caller-provided values for those fields are overwritten before the immutable event is proposed.
 */
export const proposeWildlifeProcessing = (
  authoritative: GameSession,
  requested: WildlifeProcessingAction,
): SessionProposalBatch => {
  const snapshot = authoritative.snapshot();
  const sessionId = authoritative.toSave().sessionId;
  if ((requested.action === "harvest" || requested.action === "reserve") && requested.playerSaveId !== sessionId) {
    throw new Error("processing playerSaveId does not match the authoritative Session");
  }
  if (requested.action === "claim" && requested.claimantPlayerSaveId !== sessionId) {
    throw new Error("processing claimant does not match the authoritative Session");
  }
  const currentCursor = snapshot.lastEventSequence;
  const eventSequence = authoritative.nextSequence();
  const manifest = wildlifeProcessingManifest();
  const fieldDress = manifest.processingRecipes["process.field_dress.v0.1"];
  if (requested.action === "harvest" && (!fieldDress || fieldDress.transactionKind !== "harvest")) {
    throw new Error("field-dress harvest contract unavailable");
  }
  const requestedOrder = requested.action === "harvest" || requested.action === "reserve" ? undefined :
    snapshot.economy.workOrders.find((order) => order.workOrderId === requested.workOrderId) as
      WildlifeProcessingWorkOrder | undefined;
  if (requestedOrder && requestedOrder.initiatingPlayerSaveId !== sessionId) {
    throw new Error("processing work order is owned by another Session");
  }
  const stationId = requested.action === "harvest" ? requested.stationOrToolId :
    requested.action === "reserve" ? requested.stationId : requestedOrder?.stationId;
  const binding = stationId ? manifest.stationBindings[stationId] : undefined;
  const interactionReceiptId = requested.interactionReceiptId;
  if (!stationId || !binding || !interactionReceiptId || snapshot.world.currentSceneId !== binding.sceneId ||
      !snapshot.receiptIndex[interactionReceiptId]) {
    throw new Error(`processing station ${stationId ?? "unknown"} is not authorized in the current scene`);
  }
  const harvestSeconds = requested.action === "harvest"
    ? fieldDress!.interactionWorkUnits * manifest.workUnitActiveSeconds : 0;
  const authoritativeTick = snapshot.survival.worldTicks + harvestSeconds;
  const energyEventId = requested.action === "complete"
    ? Object.values(snapshot.receiptIndex).filter((receipt) => receipt.receiptId.startsWith(`wildlife-processing-energy:${requested.workOrderId}:`))
        .sort((left, right) => right.recordedAtSequence - left.recordedAtSequence)[0]?.receiptId ?? null
    : undefined;
  const materialized = {
    ...requested,
    currentWorldTick: authoritativeTick,
    ...(requested.action === "reserve" ? { startEventSequence: currentCursor } : {}),
    ...(requested.action === "complete" ? { energyEventId } : {}),
  } as WildlifeProcessingAction;
  const canonicalIdempotencyKey = canonicalWildlifeProcessingIdempotencyKey(materialized, {
    requiredEventCursor: currentCursor,
    cancellationSequence: eventSequence,
  });
  const transactionId = createWildlifeProcessingTransactionId(
    wildlifeProcessingTransactionKind(materialized), canonicalIdempotencyKey,
  );
  const action = { ...materialized, canonicalIdempotencyKey, transactionId } as WildlifeProcessingAction;
  return {
    transactionId,
    drafts: [{ eventId: `session.wildlife.processing.${transactionId}`, type: "wildlife_processing_committed", payload: { action } }],
  };
};


export type VerifiedTradeQuoteProposal = Readonly<{ accepted: true; quote: VerifiedSellQuote; batch: SessionProposalBatch; issuedEventId: string }> |
  Readonly<{ accepted: false; reason: string }>;

/** @internal Formal coordinators must source position from their runtime snapshot and retain the quote only in memory. */
export const proposeVerifiedTradeQuote = (authoritative: GameSession, request: Omit<VerifiedQuoteRequest, "currentWorldTick">,
  runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number; operationId: string }>): VerifiedTradeQuoteProposal => {
  const snapshot = authoritative.snapshot();
  if (authoritative.events().some((event) => event.type === "verified_trade_quote_issued" && event.payload.operationId === runtime.operationId)) {
    return { accepted: false, reason: "operation_already_committed" };
  }
  if (request.playerSaveId !== authoritative.toSave().sessionId) return { accepted: false, reason: "wrong_player" };
  const issued = createVerifiedSellQuote(snapshot.economy, { ...request, currentWorldTick: snapshot.survival.worldTicks });
  if (!issued.accepted) return issued;
  const authority = verifiedTradeManifest().stationAuthorities.find((candidate) => candidate.sceneId === snapshot.world.currentSceneId &&
    candidate.merchantIds.includes(request.merchantId));
  if (!authority || !runtime.operationId || runtime.sceneRevision !== snapshot.world.revision) return { accepted: false, reason: "unauthorized" };
  const issuedEventId = `session.trade.quote.${issued.quote.quoteId}.${runtime.operationId}`;
  return { accepted: true, quote: issued.quote, issuedEventId, batch: { transactionId: `trade-quote:${issued.quote.quoteId}:${runtime.operationId}`, drafts: [{
    eventId: issuedEventId, type: "verified_trade_quote_issued", payload: { quote: issued.quote, decayedLot: issued.decayedLot,
      sceneId: authority.sceneId, targetId: authority.targetId, interactionId: authority.interactionId,
      playerPositionPx: { ...runtime.playerPositionPx }, runtimeSceneRevision: runtime.sceneRevision, operationId: runtime.operationId },
  }] } };
};

/** @internal Only an ephemeral verified-trade coordinator may call confirm with a quote it retained from issue. */
export const proposeVerifiedTradeSale = (authoritative: GameSession, quote: VerifiedSellQuote, issuedEventId: string,
  runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number }>): SessionProposalBatch => {
  const authority = verifiedTradeManifest().stationAuthorities.find((candidate) => candidate.sceneId === authoritative.snapshot().world.currentSceneId &&
    candidate.merchantIds.includes(quote.merchantId));
  if (!authority) throw new Error("trade authority is not available in the current scene");
  return { transactionId: createVerifiedSellTransactionId(quote), drafts: [{ eventId: `session.trade.sale.${createVerifiedSellTransactionId(quote)}`,
    type: "verified_trade_sale_committed", payload: { quote, issuedEventId, quotePayloadHash: quote.quotePayloadHash,
      sceneId: authority.sceneId, targetId: authority.targetId, interactionId: authority.interactionId,
      playerPositionPx: { ...runtime.playerPositionPx }, runtimeSceneRevision: runtime.sceneRevision } }],
  };
};

export const proposeWildlifeProcessingEvidence = (
  authoritative: GameSession,
  request: Readonly<{ evidenceId: string; workOrderId: string; subjectEventId: string;
    classification: "mainline_world_predicate_commit" | "non_replayed_side_task_commit" | "region_transition_commit" }>,
): SessionProposalBatch => {
  requiredId(request.evidenceId, "processing evidenceId"); requiredId(request.workOrderId, "processing evidence workOrderId");
  requiredId(request.subjectEventId, "processing evidence subjectEventId");
  const subject = authoritative.events().find((event) => event.eventId === request.subjectEventId);
  if (!subject || (subject.type !== "quest_stage_set" && subject.type !== "world_flag_set" && subject.type !== "scene_entered")) {
    throw new Error("processing evidence subject event is not authoritative or eligible");
  }
  return { transactionId: `wildlife-processing-evidence:${request.evidenceId}`, drafts: [{
    eventId: `session.wildlife.evidence.${request.evidenceId}`, type: "wildlife_processing_evidence_committed",
    payload: { ...request, subjectEventType: subject.type },
  }] };
};

/** Advances only the authoritative active-world clock; metabolism is explicitly unchanged. */
export const proposeWildlifeProcessingWork = (
  authoritative: GameSession,
  workOrderId: string,
  interactionReceiptId: string,
): SessionProposalBatch => {
  requiredId(workOrderId, "workOrderId");
  requiredId(interactionReceiptId, "processing work interactionReceiptId");
  const snapshot = authoritative.snapshot();
  const order = snapshot.economy.workOrders.find((candidate) => candidate.workOrderId === workOrderId) as
    WildlifeProcessingWorkOrder | undefined;
  if (!order) throw new Error(`unknown work order ${workOrderId}`);
  const binding = wildlifeProcessingManifest().stationBindings[order.stationId];
  const interactionReceipt = snapshot.receiptIndex[interactionReceiptId];
  const interactionUseId = `wildlife-processing-interaction-use:${interactionReceiptId}`;
  if (!binding || snapshot.world.currentSceneId !== binding.sceneId || !interactionReceipt ||
      !interactionReceiptId.startsWith(`wildlife-processing-interaction:${order.stationId}:${snapshot.world.revision}:`) ||
      snapshot.receiptIndex[interactionUseId]) {
    throw new Error(`processing station ${order.stationId} is not authorized in the current scene`);
  }
  const identity = { workOrderId, expectedWorkOrderRevision: order.revision, stationInteractionId: interactionReceiptId };
  const canonicalIdempotencyKey = canonicalWildlifeProcessingWorkIdempotencyKey(identity);
  const transactionId = createWildlifeProcessingWorkTransactionId(identity);
  return {
    transactionId,
    drafts: [{
      eventId: `session.wildlife.work.${transactionId}`,
      type: "wildlife_processing_work_advanced",
      payload: {
        transactionId, canonicalIdempotencyKey,
        workOrderId,
        expectedWorkOrderRevision: order.revision,
        expectedSurvivalRevision: snapshot.survival.revision,
        expectedWorldTicks: snapshot.survival.worldTicks,
        interactionReceiptId,
      },
    }],
  };
};
export const nextInventoryConsumptionSequence = (authoritative: GameSession): number =>
  authoritative.events().reduce((highest, event) =>
    event.type === "inventory_consumption_committed"
      ? Math.max(highest, event.payload.action.consumptionSequence)
      : highest, 0) + 1;
export const proposeInventoryConsumption = (
  authoritative: GameSession,
  request: Readonly<{ playerSaveId: string; lotId: string; quantity?: number; consumptionSequence: number }>,
): SessionProposalBatch => {
  requiredId(request.playerSaveId, "consumption playerSaveId");
  requiredId(request.lotId, "consumption lotId");
  const snapshot = authoritative.snapshot();
  if (request.playerSaveId !== authoritative.toSave().sessionId) {
    throw new Error("consumption playerSaveId does not match the authoritative Session");
  }
  const retryKey = canonicalInventoryConsumptionKey({ playerSaveId: request.playerSaveId, lotId: request.lotId,
    consumptionSequence: request.consumptionSequence });
  const retryTransactionId = inventoryConsumptionTransactionId(retryKey);
  const retryEventId = `session.inventory.consume.${retryTransactionId}`;
  const prior = authoritative.events().find((event) => event.eventId === retryEventId && event.type === "inventory_consumption_committed") as Extract<GameSessionEvent, { type: "inventory_consumption_committed" }> | undefined;
  if (prior) {
    const requestedQuantity = request.quantity ?? 1;
    const action = prior.payload.action.quantity === requestedQuantity ? prior.payload.action :
      { ...prior.payload.action, quantity: requestedQuantity };
    return { transactionId: retryTransactionId, drafts: [{ eventId: retryEventId,
      type: "inventory_consumption_committed", payload: { action } }] };
  }
  const lot = snapshot.economy.lots.find((candidate) => candidate.lotId === request.lotId);
  if (!lot) throw new Error(`unknown consumption lot ${request.lotId}`);
  const action = materializeInventoryConsumptionAction({
    playerSaveId: request.playerSaveId, lotId: request.lotId, quantity: request.quantity ?? 1,
    consumptionSequence: request.consumptionSequence, currentWorldTick: snapshot.survival.worldTicks,
    expectedInventoryRevision: snapshot.economy.inventoryRevision,
    expectedLotOwnershipRevision: lot.ownershipRevision, expectedLotFreshnessRevision: lot.freshnessRevision,
    expectedSurvivalRevision: snapshot.survival.revision,
  });
  return { transactionId: action.transactionId, drafts: [{
    eventId: `session.inventory.consume.${action.transactionId}`,
    type: "inventory_consumption_committed", payload: { action },
  }] };
};

/** @deprecated Whole-economy settlement replacement is forbidden for new production transactions. */

export const proposeSettlementReplacement = (
  _transactionId: string,
  _result: DemoActionResult,
  _executorSave: SettlementDemoSave,
): never => {
  throw new Error("proposeSettlementReplacement is disabled; use economy domain events");
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
  if (batch.drafts.some((draft) => draft.type === "safe_range_runtime_frame_committed" ||
      draft.type === "safe_range_transfer_passed" ||
      draft.type === "safe_range_material_table_completed" ||
      (draft.type === "learning_evidence_committed" &&
        (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"]).p0CurriculumActionId !== undefined))) {
    return { committed: false, failedDraftId: batch.drafts[0]?.eventId ?? null,
      reason: "invalid_event", session: authoritative };
  }
  const types = new Set(batch.drafts.map((draft) => draft.type));
  const invalidCycle =
    (types.has("attack_capacity_calibrated") && types.has("learning_evidence_committed")) ||
    (types.has("attack_prerequisites_verified") &&
      (types.has("attack_capacity_calibrated") || types.has("prologue_return_observation_committed")));
  if (invalidCycle) return { committed: false, failedDraftId: batch.drafts[0]?.eventId ?? null,
    reason: "invalid_event", session: authoritative };
  const working = authoritative.forkForProposal();
  for (const draft of batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const result = working.apply(event);
    if (!result.applied) {
      return { committed: false, failedDraftId: draft.eventId, reason: result.reason, session: authoritative };
    }
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};

export const commitTrustedP0LearningProposal = (
  authoritative: GameSession,
  proof: P0LearningCommitProof,
): SessionBatchCommitResult => {
  if (!isTrustedP0LearningCommitProof(proof)) return { committed: false, failedDraftId: null, reason: "invalid_event", session: authoritative };
  const p0Drafts = proof.batch.drafts.filter((draft) => draft.type === "learning_evidence_committed" &&
    (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"]).p0CurriculumActionId !== undefined);
  const receipt = proof.batch.drafts.at(-1);
  if (p0Drafts.length === 0 || receipt?.type !== "receipt_recorded" || p0Drafts.some((draft) =>
    (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"]).p0CurriculumActionId !== proof.actionId)) {
    return { committed: false, failedDraftId: p0Drafts[0]?.eventId ?? null, reason: "invalid_event", session: authoritative };
  }
  const working = authoritative.forkForProposal();
  for (const draft of proof.batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const protectedEvent = event.type === "learning_evidence_committed" && event.payload.p0CurriculumActionId !== undefined;
    const result = protectedEvent ? working.applyTrustedP0LearningEvent(event, proof) : working.apply(event);
    if (!result.applied) return { committed: false, failedDraftId: draft.eventId, reason: result.reason, session: authoritative };
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};

export const commitTrustedCore120LearningProposal = (
  authoritative: GameSession,
  proof: Core120LearningCommitProof,
): SessionBatchCommitResult => {
  if (!isTrustedCore120LearningCommitProof(proof)) {
    return { committed: false, failedDraftId: null, reason: "invalid_event", session: authoritative };
  }
  const protectedDrafts = proof.batch.drafts.filter((draft) => draft.type === "learning_evidence_committed" &&
    (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"])
      .core120CurriculumActionId !== undefined);
  const receipt = proof.batch.drafts.at(-1);
  const validReceipt = receipt?.type === "core120_learning_action_committed" &&
    (receipt.payload as Extract<GameSessionEvent, { type: "core120_learning_action_committed" }>["payload"])
      .actionId === proof.actionId;
  if (protectedDrafts.length === 0 || protectedDrafts.length + 1 !== proof.batch.drafts.length ||
      !validReceipt ||
      protectedDrafts.some((draft) =>
    (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"])
      .core120CurriculumActionId !== proof.actionId)) {
    return { committed: false, failedDraftId: protectedDrafts[0]?.eventId ?? null,
      reason: "invalid_event", session: authoritative };
  }
  const working = authoritative.forkForProposal();
  for (const draft of proof.batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const protectedEvent = event.type === "core120_learning_action_committed" ||
      (event.type === "learning_evidence_committed" &&
        event.payload.core120CurriculumActionId !== undefined);
    const result = protectedEvent ? working.applyTrustedCore120LearningEvent(event, proof) : working.apply(event);
    if (!result.applied) {
      return { committed: false, failedDraftId: draft.eventId, reason: result.reason, session: authoritative };
    }
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};

export const commitTrustedReturnFlowQualificationProposal = (
  authoritative: GameSession,
  proof: ReturnFlowQualificationCommitProof,
): SessionBatchCommitResult => {
  if (!isTrustedReturnFlowQualificationCommitProof(proof)) {
    return { committed: false, failedDraftId: null, reason: "invalid_event", session: authoritative };
  }
  const protectedDrafts = proof.batch.drafts.filter((draft) =>
    draft.type === "prologue_return_observation_committed" ||
    (draft.type === "learning_evidence_committed" &&
      (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"])
        .qualificationActionId !== undefined));
  const valid = proof.kind === "grounding"
    ? protectedDrafts.length === 1 && protectedDrafts[0]?.type === "learning_evidence_committed" &&
      proof.batch.drafts.some((draft) => draft.type === "learning_evidence_committed" &&
        (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"]).evidence !== undefined)
    : protectedDrafts.length === 1 && protectedDrafts[0]?.type === "prologue_return_observation_committed" &&
      proof.batch.drafts.some((draft) => draft.type === "scene_entered" &&
        (draft.payload as { sceneId: string }).sceneId === "scene.valley.settlement");
  if (!valid) return { committed: false, failedDraftId: protectedDrafts[0]?.eventId ?? null,
    reason: "invalid_event", session: authoritative };
  const working = authoritative.forkForProposal();
  for (const draft of proof.batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const protectedEvent = event.type === "prologue_return_observation_committed" ||
      (event.type === "learning_evidence_committed" && event.payload.qualificationActionId !== undefined);
    const result = protectedEvent ? working.applyTrustedReturnFlowQualificationEvent(event, proof) : working.apply(event);
    if (!result.applied) return { committed: false, failedDraftId: draft.eventId,
      reason: result.reason, session: authoritative };
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};
export const commitTrustedAttackQualificationProposal = (
  authoritative: GameSession,
  proof: AttackQualificationCommitProof,
): SessionBatchCommitResult => {
  if (!isTrustedAttackQualificationCommitProof(proof)) {
    return { committed: false, failedDraftId: null, reason: "invalid_event", session: authoritative };
  }
  const batch = proof.batch;
  const protectedDrafts = batch.drafts.filter((draft) => draft.type === "attack_qualification_interaction_committed" ||
    draft.type === "attack_capacity_calibrated" || draft.type === "prologue_return_observation_committed" ||
    draft.type === "attack_prerequisites_verified" ||
    (draft.type === "learning_evidence_committed" &&
      (draft.payload as Extract<GameSessionEvent, { type: "learning_evidence_committed" }>["payload"]).qualificationActionId !== undefined));
  const allowed = proof.kind === "settlement_action"
    ? protectedDrafts.length === 2 && protectedDrafts[0]?.type === "attack_qualification_interaction_committed" &&
      protectedDrafts[1]?.type === "learning_evidence_committed"
    : proof.kind === "return_flow_grounding"
      ? protectedDrafts.length === 1 && protectedDrafts[0]?.type === "learning_evidence_committed"
      : proof.kind === "calibration"
        ? protectedDrafts.length === 1 && protectedDrafts[0]?.type === "attack_capacity_calibrated"
        : proof.kind === "return_observation"
          ? protectedDrafts.length === 1 && protectedDrafts[0]?.type === "prologue_return_observation_committed"
          : proof.kind === "permission"
            ? protectedDrafts.length === 1 && protectedDrafts[0]?.type === "attack_prerequisites_verified"
            : false;
  if (!allowed) return { committed: false, failedDraftId: protectedDrafts[0]?.eventId ?? null,
    reason: "invalid_event", session: authoritative };
  const working = authoritative.forkForProposal();
  for (const draft of batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const qualificationForm = event.type === "learning_evidence_committed" &&
      event.payload.qualificationActionId !== undefined;
    const protectedEvent = event.type === "attack_qualification_interaction_committed" || qualificationForm ||
      event.type === "attack_capacity_calibrated" || event.type === "prologue_return_observation_committed" ||
      event.type === "attack_prerequisites_verified";
    const result = protectedEvent ? working.applyTrustedAttackQualificationEvent(event, proof) : working.apply(event);
    if (!result.applied) return { committed: false, failedDraftId: draft.eventId,
      reason: result.reason, session: authoritative };
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};
export const commitTrustedSafeRangeProposal = (
  authoritative: GameSession,
  proof: SafeRangeCommitProof,
): SessionBatchCommitResult => {
  if (!isTrustedSafeRangeCommitProof(proof)) {
    return { committed: false, failedDraftId: null, reason: "invalid_event", session: authoritative };
  }
  const batch = proof.batch;
  const safeDrafts = batch.drafts.filter((draft) => draft.type === "safe_range_runtime_frame_committed" ||
    draft.type === "safe_range_transfer_passed" ||
    draft.type === "safe_range_material_table_completed");
  const expectedType = proof.kind === "transfer" ? "safe_range_transfer_passed" : "safe_range_material_table_completed";
  if (batch.drafts.length !== 3 || safeDrafts.length !== 2 ||
      safeDrafts[0]!.type !== "safe_range_runtime_frame_committed" || safeDrafts[1]!.type !== expectedType ||
      batch.drafts[2]!.type !== "receipt_recorded") {
    return { committed: false, failedDraftId: safeDrafts[0]?.eventId ?? null,
      reason: "invalid_event", session: authoritative };
  }
  const working = authoritative.forkForProposal();
  for (const draft of batch.drafts) {
    const event = materializeDraft(draft, working.nextSequence(), working);
    const result = event.type === "safe_range_runtime_frame_committed" ||
      event.type === "safe_range_transfer_passed" || event.type === "safe_range_material_table_completed"
      ? working.applyTrustedSafeRangeEvent(event, proof) : working.apply(event);
    if (!result.applied) return { committed: false, failedDraftId: draft.eventId,
      reason: result.reason, session: authoritative };
  }
  return { committed: true, failedDraftId: null, reason: null, session: working };
};
export const proposeLearningEvidence = (
  transactionId: string,
  evidence: import("../learning/progression").LearningEvidenceEvent,
): SessionProposalBatch => {
  requiredId(transactionId, "learning evidence transactionId");
  return { transactionId, drafts: [{ eventId: `session.learning.evidence.${transactionId}`,
    type: "learning_evidence_committed", payload: { evidence } }] };
};

export const proposeAttackQualificationInteraction = (
  operationId: string,
  playerPositionPx: Readonly<{ readonly x: number; readonly y: number }>,
  expectedWorldRevision: number,
): SessionProposalBatch => ({
  transactionId: operationId,
  drafts: [{ eventId: `session.attack.interaction.${operationId}`,
    type: "attack_qualification_interaction_committed",
    payload: { operationId, sceneId: "scene.valley.settlement",
      targetId: "settlement.attack_calibration_table", interactionId: "settlement.open_attack_calibration",
      playerPositionPx, expectedWorldRevision } }],
});
export const proposeAttackQualificationEvidence = (
  transactionId: string,
  qualificationActionId: AttackQualificationEvidenceActionId,
  unrelatedWorldEventIds?: readonly string[],
  interactionReceiptId?: string,
  sourceEvidenceEventId?: string,
): SessionProposalBatch => {
  requiredId(transactionId, "attack qualification evidence transactionId");
  return { transactionId, drafts: [{ eventId: `session.attack.evidence.${transactionId}`,
    type: "learning_evidence_committed",
    payload: { qualificationActionId, transactionId,
      ...(unrelatedWorldEventIds === undefined ? {} : { unrelatedWorldEventIds }),
      ...(interactionReceiptId === undefined ? {} : { interactionReceiptId }),
      ...(sourceEvidenceEventId === undefined ? {} : { sourceEvidenceEventId }) } }] };
};

export const proposeAttackCapacityCalibration = (transactionId: string): SessionProposalBatch => {
  requiredId(transactionId, "attack calibration transactionId");
  return { transactionId, drafts: [{ eventId: `session.attack.calibration.${transactionId}`,
    type: "attack_capacity_calibrated", payload: { transactionId,
      writerEvent: ATTACK_CALIBRATION_WRITER_EVENT, contract: RUNTIME_ATTACK_QUALIFICATION_CONTRACT } }] };
};

export const proposeReturnObservation = (transactionId: string): SessionProposalBatch => {
  requiredId(transactionId, "return observation transactionId");
  return { transactionId, drafts: [{ eventId: `session.return.observation.${transactionId}`,
    type: "prologue_return_observation_committed",
    payload: { transactionId, writerEvent: "return_observation_committed" } }] };
};

export const proposeAttackPermission = (transactionId: string): SessionProposalBatch => {
  requiredId(transactionId, "attack permission transactionId");
  return { transactionId, drafts: [{ eventId: `session.attack.permission.${transactionId}`,
    type: "attack_prerequisites_verified", payload: { transactionId,
      writerEvent: ATTACK_PERMISSION_WRITER_EVENT,
      contractId: RUNTIME_ATTACK_QUALIFICATION_CONTRACT.contractId } }] };
};

export type SafeRangeTransferPayload = Extract<GameSessionEvent,
  { type: "safe_range_transfer_passed" }>["payload"];
export type SafeRangeRuntimeFrameCommitPayload = Extract<GameSessionEvent,
  { type: "safe_range_runtime_frame_committed" }>["payload"];
export const proposeSafeRangeRuntimeFrame = (payload: SafeRangeRuntimeFrameCommitPayload): SessionProposalBatch => ({
  transactionId: payload.transactionId,
  drafts: [{ eventId: `session.safe-range.frame.${payload.transactionId}`,
    type: "safe_range_runtime_frame_committed", payload }],
});
export const proposeSafeRangeTransfer = (payload: SafeRangeTransferPayload): SessionProposalBatch => ({
  transactionId: payload.transactionId,
  drafts: [{ eventId: `session.safe-range.transfer.${payload.transactionId}`,
    type: "safe_range_transfer_passed", payload }],
});

export const proposeSafeRangeMaterialTableCompletion = (
  transactionId: string,
  authorityProof: Extract<GameSessionEvent, { type: "safe_range_material_table_completed" }>["payload"]["authorityProof"],
): SessionProposalBatch => {
  requiredId(transactionId, "safe range table transactionId");
  return { transactionId, drafts: [{ eventId: `session.safe-range.table.${transactionId}`,
    type: "safe_range_material_table_completed",
    payload: { transactionId, writerEvent: "safe_range_material_table_completed", authorityProof } }] };
};
