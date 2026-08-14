import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeCore120CurriculumManifest } from "../content/runtime-core120-curriculum-manifest";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import {
  core120LearningActionEvidencePresent,
  core120LearningActionPrerequisitesSatisfied,
  listCore120LearningActionIds,
  type Core120LearningActionId,
} from "../learning/core120-campaign";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  commitTrustedCore120LearningProposal,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import type { GameSession } from "../session/game-session";
import { p0TargetReached } from "./p0-learning-contract";
import type { PrologueSettlementSession } from "./prologue-settlement";

const MANIFEST = readRuntimeCore120CurriculumManifest(generatedRuntimeArtifact);
const P0_MANIFEST = readRuntimeP0CurriculumManifest(generatedRuntimeArtifact);
export const PROLOGUE_CORE120_LEARNING_ACTION_IDS = listCore120LearningActionIds(MANIFEST);

declare const CORE120_LEARNING_PROOF_BRAND: unique symbol;
export interface Core120LearningCommitProof {
  readonly [CORE120_LEARNING_PROOF_BRAND]: true;
  readonly actionId: Core120LearningActionId;
  readonly batch: SessionProposalBatch;
}

const trustedProofs = new WeakSet<object>();
export const isTrustedCore120LearningCommitProof = (value: unknown): value is Core120LearningCommitProof =>
  typeof value === "object" && value !== null && trustedProofs.has(value);

const createProof = (actionId: Core120LearningActionId, batch: SessionProposalBatch): Core120LearningCommitProof => {
  const proof = Object.freeze({ actionId, batch }) as unknown as Core120LearningCommitProof;
  trustedProofs.add(proof);
  return proof;
};

export interface PrologueCore120LearningResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason:
    | "committed"
    | "duplicate"
    | "transaction_conflict"
    | "wrong_scene"
    | "too_far"
    | "p0_prerequisite_missing"
    | "prerequisite_missing"
    | "session_rejected";
  readonly actionId: Core120LearningActionId;
  readonly session: GameSession;
}

export const core120LearningActionReceiptId = (sessionId: string, actionId: Core120LearningActionId): string =>
  `learning:${sessionId}:core120-action:${actionId}`;

export const core120LearningActionPayloadHash = (actionId: Core120LearningActionId): `sha256:${string}` => sha256Canonical({
  contractDigest: MANIFEST.sourceDigest,
  actionId,
  authorityMode: "settlement_recovery_archive",
} as JsonValue);

export class PrologueCore120LearningCoordinator {
  constructor(private readonly settlement: PrologueSettlementSession) {}

  commit(actionId: Core120LearningActionId, operationId: string): PrologueCore120LearningResult {
    if (!PROLOGUE_CORE120_LEARNING_ACTION_IDS.includes(actionId)) throw new Error(`unknown core120 learning action ${actionId}`);
    if (!operationId.trim()) throw new Error("core120 learning operationId is required");
    const session = this.settlement.session;
    const state = session.snapshot();
    const runtime = this.settlement.snapshot().runtime;
    if (state.world.currentSceneId !== MANIFEST.recoveryStation.sceneId ||
        runtime.sceneId !== MANIFEST.recoveryStation.sceneId) {
      return this.result(false, false, "wrong_scene", actionId, session);
    }
    const point = MANIFEST.recoveryStation.interactionPointTiles;
    const distance = Math.hypot(runtime.player.position.x - point[0] * 16, runtime.player.position.y - point[1] * 16);
    if (!Number.isFinite(runtime.player.position.x) || !Number.isFinite(runtime.player.position.y) ||
        distance > MANIFEST.recoveryStation.maximumDistancePx) {
      return this.result(false, false, "too_far", actionId, session);
    }
    if (!P0_MANIFEST.scope.wordIds.every((wordId) => {
      const progress = state.learning.words[wordId];
      return p0TargetReached(P0_MANIFEST.words[wordId].targetState, progress?.learningState ?? null,
        progress?.attunementState);
    })) {
      return this.result(false, false, "p0_prerequisite_missing", actionId, session);
    }

    const receiptId = core120LearningActionReceiptId(session.sessionId, actionId);
    const payloadHash = core120LearningActionPayloadHash(actionId);
    const prior = state.receiptIndex[receiptId];
    if (prior) {
      const matches = prior.payloadHash === payloadHash &&
        core120LearningActionEvidencePresent(MANIFEST, state.learning, session.sessionId, actionId);
      return this.result(matches, matches, matches ? "duplicate" : "transaction_conflict", actionId, session);
    }
    if (!core120LearningActionPrerequisitesSatisfied(
      MANIFEST, state.learning, session.sessionId, actionId,
    )) return this.result(false, false, "prerequisite_missing", actionId, session);

    const drafts: SessionEventDraft[] = [{
      eventId: `session.core120.learning.receipt.${actionId}`,
      type: "core120_learning_action_committed",
      payload: { actionId, receiptId, payloadHash },
    }];
    const batch: SessionProposalBatch = { transactionId: operationId, drafts };
    const committed = commitTrustedCore120LearningProposal(session, createProof(actionId, batch));
    return committed.committed
      ? this.result(true, false, "committed", actionId, committed.session)
      : this.result(false, false, "session_rejected", actionId, session);
  }

  private result(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueCore120LearningResult["reason"],
    actionId: Core120LearningActionId,
    session: GameSession,
  ): PrologueCore120LearningResult {
    return Object.freeze({ accepted, duplicate, reason, actionId, session });
  }
}
