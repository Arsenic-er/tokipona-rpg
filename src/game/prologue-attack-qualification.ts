import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSafeRangeManifest } from "../content/runtime-safe-range-manifest";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  commitTrustedAttackQualificationProposal,
  proposeAttackCapacityCalibration,
  proposeAttackPermission,
  proposeAttackQualificationEvidence,
  proposeAttackQualificationInteraction,
  type SessionBatchCommitResult,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type AttackQualificationEvidenceActionId,
  type GameSessionSave,
} from "../session/game-session";
import type { PrologueSettlementSession } from "./prologue-settlement";

const MANIFEST = readRuntimeSafeRangeManifest(generatedRuntimeArtifact);
const SETTLEMENT_SCENE_ID = MANIFEST.parallelCalibration.authoritySceneId;
const SETTLEMENT_ACTIONS = Object.freeze(MANIFEST.parallelCalibration.actions.filter((action) =>
  action.authoritySceneId === SETTLEMENT_SCENE_ID && !action.existingDomainEventMappingOnly));
const UNRELATED_ACTIONS = Object.freeze(MANIFEST.parallelCalibration.unrelatedSemanticWorldActions);
const TABLE_POINT_PX = Object.freeze({
  x: MANIFEST.parallelCalibration.interactionPointTiles[0] * 16,
  y: MANIFEST.parallelCalibration.interactionPointTiles[1] * 16,
});

export type SettlementAttackQualificationActionId =
  | "settlement.telo.h0" | "settlement.telo.h1"
  | "settlement.tawa.h0" | "settlement.tawa.h1"
  | "settlement.repair.motion_h0" | "settlement.delayed_retrieval_h0";
export type SettlementAttackQualificationUnrelatedActionId =
  | "settlement.calibration.unrelated_delivery_commit"
  | "settlement.calibration.unrelated_route_commit";
export type SettlementAttackQualificationSemanticActionId =
  | SettlementAttackQualificationActionId
  | SettlementAttackQualificationUnrelatedActionId;

export const PROLOGUE_SETTLEMENT_ATTACK_QUALIFICATION_ACTION_IDS = Object.freeze(
  SETTLEMENT_ACTIONS.map((action) => action.actionId as SettlementAttackQualificationActionId),
);
export const PROLOGUE_SETTLEMENT_ATTACK_QUALIFICATION_UNRELATED_ACTION_IDS = Object.freeze(
  UNRELATED_ACTIONS.map((action) => action.actionId as SettlementAttackQualificationUnrelatedActionId),
);

export type AttackQualificationCommitKind =
  | "settlement_action"
  | "return_flow_grounding"
  | "calibration"
  | "return_observation"
  | "permission";

declare const ATTACK_QUALIFICATION_PROOF_BRAND: unique symbol;
export interface AttackQualificationCommitProof {
  readonly [ATTACK_QUALIFICATION_PROOF_BRAND]: true;
  readonly kind: AttackQualificationCommitKind;
  readonly batch: SessionProposalBatch;
}

const trustedCommitProofs = new WeakSet<object>();
export const isTrustedAttackQualificationCommitProof = (
  value: unknown,
): value is AttackQualificationCommitProof =>
  typeof value === "object" && value !== null && trustedCommitProofs.has(value);

const createProof = (
  kind: AttackQualificationCommitKind,
  batch: SessionProposalBatch,
): AttackQualificationCommitProof => {
  const proof = Object.freeze({ kind, batch }) as unknown as AttackQualificationCommitProof;
  trustedCommitProofs.add(proof);
  return proof;
};

const requiredId = (value: string, label: string): string => {
  const id = value.trim();
  if (!id) throw new Error(`${label} is required`);
  return id;
};

const operationReceiptId = (sessionId: string, operationId: string): string =>
  `world:${sessionId}:attack-qualification-operation:${operationId}`;
const operationHash = (actionId: string): string => sha256Canonical({
  kind: "settlement_attack_qualification",
  actionId,
} as JsonValue);
const operationReceiptDraft = (
  sessionId: string,
  operationId: string,
  actionId: string,
): SessionEventDraft => ({
  eventId: `session.attack.operation.${operationId}`,
  type: "receipt_recorded",
  payload: {
    receiptId: operationReceiptId(sessionId, operationId),
    domain: "world",
    payloadHash: operationHash(actionId),
  },
});

export type PrologueAttackQualificationReason =
  | "committed" | "duplicate" | "transaction_conflict" | "wrong_scene"
  | "unknown_action" | "out_of_range" | "prerequisite_missing" | "session_rejected";
export interface PrologueAttackQualificationResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueAttackQualificationReason;
  readonly session: GameSession;
}

/**
 * Formal N02 command boundary. The browser supplies only semantic IDs. Scene,
 * player position, tick and world revision are captured from the live
 * PrologueSettlementSession and never accepted as command input.
 */
export class PrologueAttackQualificationCoordinator {
  private authoritativeSession: GameSession;
  private readonly authority: Readonly<{
    sceneId: string;
    playerPositionPx: Readonly<{ x: number; y: number }>;
    runtimeTick: number;
  }>;

  constructor(settlement: PrologueSettlementSession) {
    const snapshot = settlement.snapshot();
    this.authoritativeSession = settlement.session;
    this.authority = Object.freeze({
      sceneId: snapshot.runtime.sceneId,
      playerPositionPx: Object.freeze({ ...snapshot.runtime.player.position }),
      runtimeTick: snapshot.runtime.tick,
    });
  }

  static fromSave(settlement: PrologueSettlementSession, candidate: unknown): PrologueAttackQualificationCoordinator {
    const loaded = GameSession.fromSave(candidate);
    if (loaded.sessionId !== settlement.session.sessionId ||
        loaded.snapshot().revision !== settlement.session.snapshot().revision) {
      throw new Error("qualification save does not match the settlement aggregate");
    }
    return new PrologueAttackQualificationCoordinator(settlement);
  }

  get session(): GameSession { return this.authoritativeSession; }
  toSave(): GameSessionSave { return this.authoritativeSession.toSave(); }

  commitSettlementAction(
    actionId: SettlementAttackQualificationSemanticActionId,
    operationId: string,
  ): PrologueAttackQualificationResult {
    const id = requiredId(operationId, "operationId");
    const action = SETTLEMENT_ACTIONS.find((candidate) => candidate.actionId === actionId);
    const unrelated = UNRELATED_ACTIONS.find((candidate) => candidate.actionId === actionId);
    if (!action && !unrelated) return this.result(false, false, "unknown_action");
    if (this.authority.sceneId !== SETTLEMENT_SCENE_ID ||
        this.authoritativeSession.snapshot().world.currentSceneId !== SETTLEMENT_SCENE_ID) {
      return this.result(false, false, "wrong_scene");
    }
    if (!Number.isFinite(this.authority.playerPositionPx.x) || !Number.isFinite(this.authority.playerPositionPx.y) ||
        Math.hypot(this.authority.playerPositionPx.x - TABLE_POINT_PX.x,
          this.authority.playerPositionPx.y - TABLE_POINT_PX.y) > 16) {
      return this.result(false, false, "out_of_range");
    }
    const receiptId = operationReceiptId(this.authoritativeSession.sessionId, id);
    const prior = this.authoritativeSession.snapshot().receiptIndex[receiptId];
    const hash = operationHash(actionId);
    if (prior) return prior.payloadHash === hash
      ? this.result(true, true, "duplicate")
      : this.result(false, false, "transaction_conflict");

    const interaction = proposeAttackQualificationInteraction(id, this.authority.playerPositionPx,
      this.authoritativeSession.snapshot().world.revision);
    const interactionReceiptId = `attack-qualification-interaction:${id}`;
    let unrelatedWorldEventIds: readonly string[] | undefined;
    if (action?.evidenceType === "delayed_retrieval") {
      const required = action.requiredUnrelatedActionIds;
      const events = required.map((requiredActionId) => [...this.authoritativeSession.events()].reverse().find((event) =>
        event.type === "learning_evidence_committed" &&
        event.payload.qualificationActionId === requiredActionId));
      if (events.some((event) => event === undefined)) return this.result(false, false, "prerequisite_missing");
      unrelatedWorldEventIds = events.map((event) => event!.eventId);
    }
    const evidence = proposeAttackQualificationEvidence(id, actionId as AttackQualificationEvidenceActionId,
      unrelatedWorldEventIds, interactionReceiptId);
    const batch: SessionProposalBatch = {
      transactionId: id,
      drafts: [...interaction.drafts, ...evidence.drafts,
        operationReceiptDraft(this.authoritativeSession.sessionId, id, actionId)],
    };
    return this.install(commitTrustedAttackQualificationProposal(this.authoritativeSession,
      createProof("settlement_action", batch)));
  }

  calibrate(operationId: string): PrologueAttackQualificationResult {
    const id = requiredId(operationId, "operationId");
    const batch = proposeAttackCapacityCalibration(id);
    return this.install(commitTrustedAttackQualificationProposal(this.authoritativeSession,
      createProof("calibration", batch)));
  }

  grantRangeTrialPermission(operationId: string): PrologueAttackQualificationResult {
    const id = requiredId(operationId, "operationId");
    const batch = proposeAttackPermission(id);
    return this.install(commitTrustedAttackQualificationProposal(this.authoritativeSession,
      createProof("permission", batch)));
  }

  private install(commit: SessionBatchCommitResult): PrologueAttackQualificationResult {
    if (!commit.committed) return Object.freeze({
      ...this.result(false, false,
        commit.reason === "duplicate_receipt" || commit.reason === "duplicate_event" ? "duplicate" :
          commit.reason === "receipt_payload_conflict" || commit.reason === "event_payload_conflict"
            ? "transaction_conflict" : "session_rejected"),
      sessionReason: commit.reason,
      failedDraftId: commit.failedDraftId,
    });
    this.authoritativeSession = commit.session;
    return this.result(true, false, "committed");
  }

  private result(accepted: boolean, duplicate: boolean,
    reason: PrologueAttackQualificationReason): PrologueAttackQualificationResult {
    return Object.freeze({ accepted, duplicate, reason, session: this.authoritativeSession });
  }
}
