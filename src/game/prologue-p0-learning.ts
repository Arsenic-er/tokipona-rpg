import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  commitTrustedP0LearningProposal,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import type { GameSession } from "../session/game-session";
import {
  materializeP0LearningEvidence,
  p0LearningActionIds,
  p0TargetReached,
  type P0LearningActionId,
} from "./p0-learning-contract";
import type { PrologueSettlementSession } from "./prologue-settlement";

const MANIFEST = readRuntimeP0CurriculumManifest(generatedRuntimeArtifact);
export const PROLOGUE_P0_LEARNING_ACTION_IDS = p0LearningActionIds(MANIFEST);

declare const P0_LEARNING_PROOF_BRAND: unique symbol;
export interface P0LearningCommitProof {
  readonly [P0_LEARNING_PROOF_BRAND]: true;
  readonly actionId: P0LearningActionId;
  readonly batch: SessionProposalBatch;
}
const trustedProofs = new WeakSet<object>();
export const isTrustedP0LearningCommitProof = (value: unknown): value is P0LearningCommitProof =>
  typeof value === "object" && value !== null && trustedProofs.has(value);
const createProof = (actionId: P0LearningActionId, batch: SessionProposalBatch): P0LearningCommitProof => {
  const proof = Object.freeze({ actionId, batch }) as unknown as P0LearningCommitProof;
  trustedProofs.add(proof);
  return proof;
};

export interface PrologueP0LearningResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: "committed" | "duplicate" | "transaction_conflict" | "wrong_scene" | "too_far" | "prerequisite_missing" | "session_rejected";
  readonly actionId: P0LearningActionId;
  readonly session: GameSession;
}

const actionReceiptId = (sessionId: string, actionId: P0LearningActionId): string =>
  `learning:${sessionId}:p0-action:${actionId}`;
const actionHash = (actionId: P0LearningActionId): `sha256:${string}` => sha256Canonical({
  contractDigest: MANIFEST.sourceDigest,
  actionId,
} as JsonValue);

export class PrologueP0LearningCoordinator {
  constructor(private readonly settlement: PrologueSettlementSession) {}

  commit(actionId: P0LearningActionId, operationId: string): PrologueP0LearningResult {
    if (!PROLOGUE_P0_LEARNING_ACTION_IDS.includes(actionId)) throw new Error(`unknown P0 learning action ${actionId}`);
    if (!operationId.trim()) throw new Error("P0 learning operationId is required");
    const session = this.settlement.session;
    const state = session.snapshot();
    const runtime = this.settlement.snapshot().runtime;
    if (state.world.currentSceneId !== MANIFEST.recoveryStation.sceneId || runtime.sceneId !== MANIFEST.recoveryStation.sceneId) return this.result(false, false, "wrong_scene", actionId, session);
    const point = MANIFEST.recoveryStation.interactionPointTiles;
    const distance = Math.hypot(runtime.player.position.x - point[0] * 16, runtime.player.position.y - point[1] * 16);
    if (!Number.isFinite(runtime.player.position.x) || !Number.isFinite(runtime.player.position.y) || distance > MANIFEST.recoveryStation.maximumDistancePx) return this.result(false, false, "too_far", actionId, session);
    const receiptId = actionReceiptId(session.sessionId, actionId);
    const prior = state.receiptIndex[receiptId];
    if (prior) return this.result(prior.payloadHash === actionHash(actionId), prior.payloadHash === actionHash(actionId), prior.payloadHash === actionHash(actionId) ? "duplicate" : "transaction_conflict", actionId, session);
    const [, wordId, kind] = actionId.split(".") as ["p0", keyof typeof MANIFEST.words, string];
    const progress = state.learning.words[wordId];
    if ((kind === "attune" && progress?.discoveryState !== "discovered") ||
        ((kind === "context_0" || kind === "context_1" || kind === "repair") && progress?.attunementState !== "attuned")) return this.result(false, false, "prerequisite_missing", actionId, session);
    if ((kind === "discover" || kind === "attune") && p0TargetReached(MANIFEST.words[wordId].targetState, progress?.learningState ?? null, progress?.attunementState)) return this.result(false, false, "prerequisite_missing", actionId, session);
    const evidence = materializeP0LearningEvidence(MANIFEST, session.sessionId, actionId);
    const drafts: SessionEventDraft[] = evidence.map((entry, ordinal) => ({
      eventId: `session.p0.learning.${actionId}.${ordinal}`,
      type: "learning_evidence_committed",
      payload: { evidence: entry, p0CurriculumActionId: actionId, p0EvidenceOrdinal: ordinal },
    }));
    drafts.push({ eventId: `session.p0.learning.receipt.${actionId}`, type: "receipt_recorded",
      payload: { receiptId, domain: "learning", payloadHash: actionHash(actionId) } });
    const batch: SessionProposalBatch = { transactionId: operationId, drafts };
    const committed = commitTrustedP0LearningProposal(session, createProof(actionId, batch));
    return committed.committed
      ? this.result(true, false, "committed", actionId, committed.session)
      : this.result(false, false, "session_rejected", actionId, session);
  }

  private result(accepted: boolean, duplicate: boolean, reason: PrologueP0LearningResult["reason"], actionId: P0LearningActionId, session: GameSession): PrologueP0LearningResult {
    return Object.freeze({ accepted, duplicate, reason, actionId, session });
  }
}
