import {
  applyLearningCorpusCollectionAction,
  createLearningCorpusPartitionCollectionState,
  readLearningCorpusPartitionCollectionState,
  reconcileLearningCorpusPartitionCollectionState,
  toLearningCorpusPartitionCollectionSave,
  verifyRuntimeLearningCorpusSet,
  type LearningCorpusPartitionCollectionState,
  type RuntimeLearningCorpusSet,
} from "../learning/corpus-partition-collection.ts";
import { learningCorpusPartitionActionStatus } from "../learning/corpus-partition.ts";
import { LearningCorpusRuntimeAuthority } from "../learning/corpus-action-authority.ts";
import type {
  ExtensionLearningActionView,
  ExtensionLearningRuntimeView,
  ExtensionLearningState,
} from "../learning/extension-learning-runtime.ts";
import type { GameSessionRuntimeBridge } from "../runtime/game-session-bridge.ts";
import type { BrowserExtensionLearningAdapter } from "./browser-game-session-wal.ts";

/**
 * Builds the reviewed extension-corpus executor separately from the browser
 * shell. The current game has no admitted extension packages, so production
 * does not import this reducer into the initial bundle. When a reviewed corpus
 * is admitted, its package loader can import this module lazily and inject the
 * resulting adapter into browser bootstrap.
 */
export function createBrowserLearningCorpusAdapter(
  source: RuntimeLearningCorpusSet,
): BrowserExtensionLearningAdapter {
  const runtime = verifyRuntimeLearningCorpusSet(source.registry, source.packages, source.scenes);
  const authority = new LearningCorpusRuntimeAuthority(runtime);
  let cachedCandidate: object | null = null;
  let cachedState: LearningCorpusPartitionCollectionState | null = null;
  const readState = (candidate: unknown): LearningCorpusPartitionCollectionState => {
    if (typeof candidate === "object" && candidate !== null && candidate === cachedCandidate &&
        cachedState !== null) return cachedState;
    const state = readLearningCorpusPartitionCollectionState(runtime, candidate);
    cachedCandidate = typeof candidate === "object" && candidate !== null ? candidate : null;
    cachedState = state;
    return state;
  };
  return Object.freeze({
    create: (playerSaveId: string) => toLearningCorpusPartitionCollectionSave(
      createLearningCorpusPartitionCollectionState(runtime, playerSaveId)),
    reconcile: (candidate: unknown, playerSaveId: string) => toLearningCorpusPartitionCollectionSave(
      reconcileLearningCorpusPartitionCollectionState(runtime, candidate, playerSaveId)),
    read: (candidate: unknown, playerSaveId: string) => {
      const state = readState(candidate);
      if (state.playerSaveId !== playerSaveId) {
        throw new Error("browser extension learning player identity mismatch");
      }
      return toLearningCorpusPartitionCollectionSave(state);
    },
    view: (candidate: unknown, playerSaveId: string, runtimeBridge: GameSessionRuntimeBridge | null,
      activeSceneId: string): ExtensionLearningRuntimeView => {
      const state = readState(candidate);
      if (state.playerSaveId !== playerSaveId) {
        throw new Error("browser extension learning player identity mismatch");
      }
      const runtimeSnapshot = runtimeBridge?.runtime.snapshot() ?? null;
      const sessionSnapshot = runtimeBridge?.sessionSnapshot() ?? null;
      const bridgeBound = runtimeBridge !== null && runtimeBridge.session.sessionId === playerSaveId &&
        sessionSnapshot?.world.currentSceneId === activeSceneId &&
        runtimeSnapshot?.sceneId === activeSceneId;
      const corpora = runtime.packages.map((pkg, corpusIndex) => {
        const partition = state.partitions[corpusIndex]!;
        const words = pkg.wordIds.map((wordId) => {
          const word = pkg.words[wordId]!;
          const progress = partition.learning.words[wordId];
          const actions = word.actions.map((action): ExtensionLearningActionView => {
            const status = learningCorpusPartitionActionStatus(pkg, partition, action.actionId);
            if (status === null) throw new Error("browser extension learning action projection failed");
            const inAuthorityScene = activeSceneId === action.worldAuthority.sceneId;
            const inRange = bridgeBound && inAuthorityScene && runtimeSnapshot !== null &&
              Number.isFinite(runtimeSnapshot.player.position.x) &&
              Number.isFinite(runtimeSnapshot.player.position.y) &&
              Math.hypot(
                runtimeSnapshot.player.position.x - action.worldAuthority.interactionPointPx.x,
                runtimeSnapshot.player.position.y - action.worldAuthority.interactionPointPx.y,
              ) <= action.worldAuthority.maximumDistancePx;
            return Object.freeze({
              corpusId: pkg.corpusId,
              wordId,
              actionId: action.actionId,
              kind: action.kind,
              sceneId: action.worldAuthority.sceneId,
              targetId: action.worldAuthority.targetId,
              sourceObjectClass: action.worldAuthority.sourceObjectClass,
              completed: status.completed,
              prerequisitesSatisfied: status.prerequisitesSatisfied,
              inAuthorityScene,
              inRange,
              available: !status.completed && status.prerequisitesSatisfied && inRange,
            });
          });
          const currentState: ExtensionLearningState =
            progress?.learningState !== undefined && progress.learningState !== null &&
              progress.learningState !== "discovered"
              ? progress.learningState
              : progress?.attunementState === "attuned" ? "attuned"
                : progress?.discoveryState === "discovered" ? "discovered" : "unknown";
          const completed = actions.every((action) => action.completed);
          return Object.freeze({ wordId, targetState: word.targetState, currentState, completed,
            actions: Object.freeze(actions) });
        });
        return Object.freeze({
          corpusId: pkg.corpusId,
          contentVersion: pkg.contentVersion,
          completedWordCount: words.filter((word) => word.completed).length,
          totalWordCount: words.length,
          words: Object.freeze(words),
        });
      });
      return Object.freeze({
        enabled: true,
        activeSceneId,
        runtimeAuthorityAvailable: bridgeBound,
        admittedCorpusCount: corpora.length,
        completedWordCount: corpora.reduce((sum, corpus) => sum + corpus.completedWordCount, 0),
        totalWordCount: corpora.reduce((sum, corpus) => sum + corpus.totalWordCount, 0),
        corpora: Object.freeze(corpora),
      });
    },
    commit: (candidate: unknown, playerSaveId: string, corpusId: string, actionId: string,
      runtimeBridge: GameSessionRuntimeBridge) => {
      const state = readState(candidate);
      if (state.playerSaveId !== playerSaveId) {
        throw new Error("browser extension learning player identity mismatch");
      }
      const proof = authority.authorize(corpusId, actionId, playerSaveId, runtimeBridge);
      const result = applyLearningCorpusCollectionAction(runtime, state, corpusId, actionId, proof);
      return Object.freeze({
        save: toLearningCorpusPartitionCollectionSave(result.state),
        result: Object.freeze({
          corpusId,
          actionId,
          applied: result.applied,
          duplicate: result.duplicate,
          reason: result.reason,
        }),
      });
    },
  });
}
