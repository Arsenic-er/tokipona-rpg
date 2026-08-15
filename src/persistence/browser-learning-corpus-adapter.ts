import {
  applyLearningCorpusCollectionAction,
  createLearningCorpusPartitionCollectionState,
  readLearningCorpusPartitionCollectionState,
  reconcileLearningCorpusPartitionCollectionState,
  toLearningCorpusPartitionCollectionSave,
  verifyRuntimeLearningCorpusSet,
  type RuntimeLearningCorpusSet,
} from "../learning/corpus-partition-collection.ts";
import { LearningCorpusRuntimeAuthority } from "../learning/corpus-action-authority.ts";
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
  return Object.freeze({
    create: (playerSaveId: string) => toLearningCorpusPartitionCollectionSave(
      createLearningCorpusPartitionCollectionState(runtime, playerSaveId)),
    reconcile: (candidate: unknown, playerSaveId: string) => toLearningCorpusPartitionCollectionSave(
      reconcileLearningCorpusPartitionCollectionState(runtime, candidate, playerSaveId)),
    read: (candidate: unknown, playerSaveId: string) => {
      const state = readLearningCorpusPartitionCollectionState(runtime, candidate);
      if (state.playerSaveId !== playerSaveId) {
        throw new Error("browser extension learning player identity mismatch");
      }
      return toLearningCorpusPartitionCollectionSave(state);
    },
    commit: (candidate: unknown, playerSaveId: string, corpusId: string, actionId: string,
      runtimeBridge: GameSessionRuntimeBridge) => {
      const state = readLearningCorpusPartitionCollectionState(runtime, candidate);
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
