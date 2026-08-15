import type { LearningCorpusActionKind } from "../content/runtime-learning-corpus-package.ts";
import type { GameSessionRuntimeBridge } from "../runtime/game-session-bridge.ts";

export type ExtensionLearningState =
  | "unknown"
  | "discovered"
  | "attuned"
  | "grounded"
  | "produced"
  | "stabilized";

export interface ExtensionLearningActionView {
  readonly corpusId: string;
  readonly wordId: string;
  readonly actionId: string;
  readonly kind: LearningCorpusActionKind;
  readonly sceneId: string;
  readonly targetId: string;
  readonly sourceObjectClass: string;
  readonly completed: boolean;
  readonly prerequisitesSatisfied: boolean;
  readonly inAuthorityScene: boolean;
  readonly inRange: boolean;
  readonly available: boolean;
}

export interface ExtensionLearningWordView {
  readonly wordId: string;
  readonly targetState: "produced";
  readonly currentState: ExtensionLearningState;
  readonly completed: boolean;
  readonly actions: readonly ExtensionLearningActionView[];
}

export interface ExtensionLearningCorpusView {
  readonly corpusId: string;
  readonly contentVersion: string;
  readonly completedWordCount: number;
  readonly totalWordCount: number;
  readonly words: readonly ExtensionLearningWordView[];
}

/** Browser-safe projection. It contains no GameSession, receipt, position, or runtime bridge. */
export interface ExtensionLearningRuntimeView {
  readonly enabled: boolean;
  readonly activeSceneId: string;
  readonly runtimeAuthorityAvailable: boolean;
  readonly admittedCorpusCount: number;
  readonly completedWordCount: number;
  readonly totalWordCount: number;
  readonly corpora: readonly ExtensionLearningCorpusView[];
}

export type ExtensionLearningActionReason =
  | "applied"
  | "duplicate"
  | "unknown_action"
  | "unknown_corpus"
  | "prerequisite_missing"
  | "authority_rejected"
  | "invalid_state"
  | "idempotency_conflict"
  | "evidence_rejected";

export interface ExtensionLearningActionResult {
  readonly corpusId: string;
  readonly actionId: string;
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly reason: ExtensionLearningActionReason;
}

/**
 * A runtime port is installed by the durable browser coordinator. Game modes
 * call it with their private bridge; browser/UI code never receives that bridge.
 */
export interface ExtensionLearningRuntimePort {
  read(
    bridge: GameSessionRuntimeBridge | null,
    activeSceneId: string,
  ): ExtensionLearningRuntimeView;
  commit(
    corpusId: string,
    actionId: string,
    bridge: GameSessionRuntimeBridge,
  ): ExtensionLearningActionResult;
}

export function emptyExtensionLearningRuntimeView(
  activeSceneId: string,
): ExtensionLearningRuntimeView {
  return Object.freeze({
    enabled: false,
    activeSceneId,
    runtimeAuthorityAvailable: false,
    admittedCorpusCount: 0,
    completedWordCount: 0,
    totalWordCount: 0,
    corpora: Object.freeze([]),
  });
}
