import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeCore120CurriculumManifest } from "../content/runtime-core120-curriculum-manifest";
import { readRuntimeP0CurriculumManifest } from "../content/runtime-p0-curriculum-manifest";
import {
  core120LearningActionEvidencePresent,
  core120LearningActionPrerequisitesSatisfied,
  listCore120LearningContractDigests,
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

const MANIFEST = readRuntimeCore120CurriculumManifest(generatedRuntimeArtifact);
const P0_MANIFEST = readRuntimeP0CurriculumManifest(generatedRuntimeArtifact);
export const PROLOGUE_CORE120_LEARNING_ACTION_IDS = listCore120LearningActionIds(MANIFEST);

declare const CORE120_LEARNING_PROOF_BRAND: unique symbol;
export interface Core120LearningCommitProof {
  readonly [CORE120_LEARNING_PROOF_BRAND]: true;
  readonly actionId: Core120LearningActionId;
  readonly authority: Core120LearningAuthority;
  readonly batch: SessionProposalBatch;
}

const trustedProofs = new WeakSet<object>();
export const isTrustedCore120LearningCommitProof = (value: unknown): value is Core120LearningCommitProof =>
  typeof value === "object" && value !== null && trustedProofs.has(value);

const createProof = (actionId: Core120LearningActionId, authority: Core120LearningAuthority,
  batch: SessionProposalBatch): Core120LearningCommitProof => {
  const proof = Object.freeze({ actionId, authority, batch }) as unknown as Core120LearningCommitProof;
  trustedProofs.add(proof);
  return proof;
};

export type Core120LearningAuthority = Readonly<{
  mode: "archive_instruction" | "world_context" | "recovery_archive";
  sceneId: string;
  targetId: string;
  playerPositionPx: Readonly<{ x: number; y: number }>;
  expectedWorldRevision: number;
  contextIndex: 0 | 1 | null;
  recoveredSceneId: string | null;
}>;

export interface PrologueCore120LearningRuntimeAuthority {
  readonly session: GameSession;
  readonly runtimeSceneId: string;
  readonly playerPositionPx: Readonly<{ x: number; y: number }>;
}

export interface PrologueCore120LearningResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason:
    | "committed"
    | "duplicate"
    | "transaction_conflict"
    | "wrong_scene"
    | "too_far"
    | "recovery_scene_not_visited"
    | "p0_prerequisite_missing"
    | "prerequisite_missing"
    | "session_rejected";
  readonly actionId: Core120LearningActionId;
  readonly session: GameSession;
}

export const core120LearningActionReceiptId = (sessionId: string, actionId: Core120LearningActionId): string =>
  `learning:${sessionId}:core120-action:${actionId}`;

export const core120LearningActionPayloadHash = (actionId: Core120LearningActionId,
  authority?: Core120LearningAuthority): `sha256:${string}` =>
  core120LearningActionPayloadHashes(actionId, authority)[0]!;

export const core120LearningActionPayloadHashes = (actionId: Core120LearningActionId,
  authority?: Core120LearningAuthority): readonly `sha256:${string}`[] => Object.freeze(
  listCore120LearningContractDigests(MANIFEST).map((contractDigest) => sha256Canonical(
    authority === undefined
      ? { contractDigest, actionId, authorityMode: "settlement_recovery_archive" }
      : { contractDigest, actionId, authority } as JsonValue,
  )),
);

export function core120LearningAuthorityMatchesAction(
  actionId: Core120LearningActionId,
  authority: Core120LearningAuthority,
): boolean {
  const parsed = parseAction(actionId);
  if (!parsed || !Number.isFinite(authority.playerPositionPx.x) ||
      !Number.isFinite(authority.playerPositionPx.y) ||
      !Number.isSafeInteger(authority.expectedWorldRevision) || authority.expectedWorldRevision < 0) return false;
  const distanceTo = (point: Readonly<{ x: number; y: number }>): number => Math.hypot(
    authority.playerPositionPx.x - point.x,
    authority.playerPositionPx.y - point.y,
  );
  if (parsed.contextIndex === null) {
    return authority.mode === "archive_instruction" && authority.contextIndex === null &&
      authority.recoveredSceneId === null && authority.sceneId === MANIFEST.recoveryStation.sceneId &&
      authority.targetId === MANIFEST.recoveryStation.targetId &&
      distanceTo(MANIFEST.recoveryStation.interactionPointPx) <= MANIFEST.recoveryStation.maximumDistancePx;
  }
  const context = parsed.word.contexts[parsed.contextIndex];
  if (authority.contextIndex !== parsed.contextIndex) return false;
  if (authority.mode === "world_context") {
    return authority.recoveredSceneId === null && authority.sceneId === context.location.sceneId &&
      authority.targetId === context.location.targetId &&
      distanceTo(context.location.interactionPointPx) <= MANIFEST.worldContextAuthority.maximumDistancePx;
  }
  return authority.mode === "recovery_archive" &&
    authority.sceneId === MANIFEST.recoveryStation.sceneId &&
    authority.targetId === MANIFEST.recoveryStation.targetId &&
    authority.recoveredSceneId === context.location.sceneId &&
    distanceTo(MANIFEST.recoveryStation.interactionPointPx) <= MANIFEST.recoveryStation.maximumDistancePx;
}

export class PrologueCore120LearningCoordinator {
  constructor(private readonly runtimeAuthority: PrologueCore120LearningRuntimeAuthority) {}

  commit(actionId: Core120LearningActionId, operationId: string): PrologueCore120LearningResult {
    if (!PROLOGUE_CORE120_LEARNING_ACTION_IDS.includes(actionId)) throw new Error(`unknown core120 learning action ${actionId}`);
    if (!operationId.trim()) throw new Error("core120 learning operationId is required");
    const session = this.runtimeAuthority.session;
    const state = session.snapshot();
    const receiptId = core120LearningActionReceiptId(session.sessionId, actionId);
    const prior = state.receiptIndex[receiptId];
    if (prior) {
      const matches = prior.domain === "learning" &&
        core120LearningActionEvidencePresent(MANIFEST, state.learning, session.sessionId, actionId);
      return this.result(matches, matches, matches ? "duplicate" : "transaction_conflict", actionId, session);
    }
    const resolved = this.resolveAuthority(actionId);
    if (!resolved.authority) return this.result(false, false, resolved.reason, actionId, session);
    const authority = resolved.authority;
    const payloadHash = core120LearningActionPayloadHash(actionId, authority);
    if (!P0_MANIFEST.scope.wordIds.every((wordId) => {
      const progress = state.learning.words[wordId];
      return p0TargetReached(P0_MANIFEST.words[wordId].targetState, progress?.learningState ?? null,
        progress?.attunementState);
    })) {
      return this.result(false, false, "p0_prerequisite_missing", actionId, session);
    }
    if (!core120LearningActionPrerequisitesSatisfied(
      MANIFEST, state.learning, session.sessionId, actionId,
    )) return this.result(false, false, "prerequisite_missing", actionId, session);

    const drafts: SessionEventDraft[] = [{
      eventId: `session.core120.learning.receipt.${actionId}`,
      type: "core120_learning_action_committed",
      payload: { actionId, receiptId, payloadHash, authority },
    }];
    const batch: SessionProposalBatch = { transactionId: operationId, drafts };
    const committed = commitTrustedCore120LearningProposal(session, createProof(actionId, authority, batch));
    return committed.committed
      ? this.result(true, false, "committed", actionId, committed.session)
      : this.result(false, false, "session_rejected", actionId, session);
  }

  private resolveAuthority(actionId: Core120LearningActionId): Readonly<{
    authority: Core120LearningAuthority | null;
    reason: "wrong_scene" | "too_far" | "recovery_scene_not_visited";
  }> {
    const session = this.runtimeAuthority.session;
    const state = session.snapshot();
    const parsed = parseAction(actionId);
    if (!parsed || state.world.currentSceneId !== this.runtimeAuthority.runtimeSceneId) {
      return { authority: null, reason: "wrong_scene" };
    }
    const base = {
      sceneId: this.runtimeAuthority.runtimeSceneId,
      playerPositionPx: Object.freeze({ ...this.runtimeAuthority.playerPositionPx }),
      expectedWorldRevision: state.world.revision,
    } as const;
    const archiveDistance = Math.hypot(base.playerPositionPx.x - MANIFEST.recoveryStation.interactionPointPx.x,
      base.playerPositionPx.y - MANIFEST.recoveryStation.interactionPointPx.y);
    if (parsed.contextIndex === null) {
      if (base.sceneId !== MANIFEST.recoveryStation.sceneId) return { authority: null, reason: "wrong_scene" };
      if (!Number.isFinite(archiveDistance) || archiveDistance > MANIFEST.recoveryStation.maximumDistancePx) {
        return { authority: null, reason: "too_far" };
      }
      return { authority: Object.freeze({ ...base, mode: "archive_instruction", targetId: MANIFEST.recoveryStation.targetId,
        contextIndex: null, recoveredSceneId: null }), reason: "wrong_scene" };
    }
    const context = parsed.word.contexts[parsed.contextIndex];
    const contextDistance = Math.hypot(base.playerPositionPx.x - context.location.interactionPointPx.x,
      base.playerPositionPx.y - context.location.interactionPointPx.y);
    if (base.sceneId === context.location.sceneId && Number.isFinite(contextDistance) &&
        contextDistance <= MANIFEST.worldContextAuthority.maximumDistancePx) {
      return { authority: Object.freeze({ ...base, mode: "world_context", targetId: context.location.targetId,
        contextIndex: parsed.contextIndex, recoveredSceneId: null }), reason: "wrong_scene" };
    }
    if (base.sceneId !== MANIFEST.recoveryStation.sceneId) {
      return { authority: null, reason: base.sceneId === context.location.sceneId ? "too_far" : "wrong_scene" };
    }
    if (!Number.isFinite(archiveDistance) || archiveDistance > MANIFEST.recoveryStation.maximumDistancePx) {
      return { authority: null, reason: "too_far" };
    }
    const visited = session.events().some((event) => event.type === "scene_entered" &&
      event.payload.sceneId === context.location.sceneId);
    if (MANIFEST.worldContextAuthority.recoveryRequiresPriorSceneVisit && !visited) {
      return { authority: null, reason: "recovery_scene_not_visited" };
    }
    return { authority: Object.freeze({ ...base, mode: "recovery_archive", targetId: MANIFEST.recoveryStation.targetId,
      contextIndex: parsed.contextIndex, recoveredSceneId: context.location.sceneId }), reason: "wrong_scene" };
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

function parseAction(actionId: Core120LearningActionId): Readonly<{
  word: (typeof MANIFEST.words)[string];
  contextIndex: 0 | 1 | null;
}> | null {
  const match = /^core120\.([a-z]+)\.(discover|attune|context_0|context_1|repair)$/.exec(actionId);
  if (!match) return null;
  const word = MANIFEST.words[match[1]!];
  if (!word) return null;
  return { word, contextIndex: match[2] === "context_0" ? 0 : match[2] === "context_1" ? 1 : null };
}
