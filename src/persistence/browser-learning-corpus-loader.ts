import { readRuntimeLearningCorpusCatalog } from "../content/runtime-learning-corpus-catalog";
import generatedPackageBundle from
  "../generated/learning-corpus-packages.v0.1.json" with { type: "json" };
import { createBrowserLearningCorpusAdapter } from "./browser-learning-corpus-adapter";
import type { BrowserExtensionLearningAdapter } from "./browser-game-session-wal";
import {
  createRpgExtensionLearningUi,
  type RpgExtensionLearningUi,
  type ExtensionLearningUiCommand,
} from "../rpg-extension-learning-ui";

export interface BrowserLearningCorpusFeature {
  readonly adapter: BrowserExtensionLearningAdapter;
  createUi(onCommand: (command: ExtensionLearningUiCommand) => void): RpgExtensionLearningUi;
}

/**
 * Full extension-corpus loading boundary. Keep this module behind a dynamic
 * import so the partition reducer is absent from the initial browser bundle
 * while the generated catalog is empty.
 */
export function loadBrowserLearningCorpusAdapter(
  artifact: unknown,
  packageBundle: unknown = generatedPackageBundle,
): BrowserExtensionLearningAdapter {
  const runtime = readRuntimeLearningCorpusCatalog(artifact, packageBundle);
  if (runtime.catalog.packages.length === 0) {
    throw new Error("full learning corpus loader must not be used for an empty catalog");
  }
  return createBrowserLearningCorpusAdapter({
    registry: runtime.registry,
    packages: runtime.catalog.packages,
    scenes: runtime.scenes,
  });
}

export function loadBrowserLearningCorpusFeature(
  artifact: unknown,
  packageBundle: unknown = generatedPackageBundle,
): BrowserLearningCorpusFeature {
  return Object.freeze({
    adapter: loadBrowserLearningCorpusAdapter(artifact, packageBundle),
    createUi: createRpgExtensionLearningUi,
  });
}
