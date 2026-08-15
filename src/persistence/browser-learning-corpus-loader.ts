import { readRuntimeLearningCorpusCatalog } from "../content/runtime-learning-corpus-catalog";
import { createBrowserLearningCorpusAdapter } from "./browser-learning-corpus-adapter";
import type { BrowserExtensionLearningAdapter } from "./browser-game-session-wal";

/**
 * Full extension-corpus loading boundary. Keep this module behind a dynamic
 * import so the partition reducer is absent from the initial browser bundle
 * while the generated catalog is empty.
 */
export function loadBrowserLearningCorpusAdapter(
  artifact: unknown,
): BrowserExtensionLearningAdapter {
  const runtime = readRuntimeLearningCorpusCatalog(artifact);
  if (runtime.catalog.packages.length === 0) {
    throw new Error("full learning corpus loader must not be used for an empty catalog");
  }
  return createBrowserLearningCorpusAdapter({
    registry: runtime.registry,
    packages: runtime.catalog.packages,
  });
}
