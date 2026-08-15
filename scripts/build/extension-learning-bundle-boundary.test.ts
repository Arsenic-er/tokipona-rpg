import { describe, expect, it } from "vitest";
import {
  assertExtensionLearningBundleBoundary,
  type ExtensionLearningBundleChunk,
} from "./extension-learning-bundle-boundary";

const ROOT = "C:/workspace";
const MODULES = [
  `${ROOT}/src/persistence/browser-learning-corpus-loader.ts`,
  `${ROOT}/src/generated/learning-corpus-packages.v0.1.json`,
  `${ROOT}/src/persistence/browser-learning-corpus-adapter.ts`,
  `${ROOT}/src/learning/corpus-partition-collection.ts`,
  `${ROOT}/src/learning/corpus-partition.ts`,
] as const;

describe("extension learning bundle boundary", () => {
  it("accepts a zero-catalog build only when no extension module is emitted", () => {
    expect(() => assertExtensionLearningBundleBoundary(baseChunks(), false)).not.toThrow();

    const leaked = [...baseChunks(), chunk("assets/unused-extension.js", {
      isDynamicEntry: true,
      moduleIds: [MODULES[0]],
    })];
    expect(() => assertExtensionLearningBundleBoundary(leaked, false))
      .toThrow(/zero_catalog_module_emitted/);
  });

  it("requires an admitted reducer set behind the RPG dynamic edge", () => {
    const admitted = admittedChunks();
    expect(() => assertExtensionLearningBundleBoundary(admitted, true)).not.toThrow();

    const missing = admittedChunks();
    missing[1] = { ...missing[1]!, moduleIds: MODULES.slice(0, -1) };
    expect(() => assertExtensionLearningBundleBoundary(missing, true))
      .toThrow(/admitted_module_missing/);

    const notDynamic = admittedChunks();
    notDynamic[0] = { ...notDynamic[0]!, dynamicImports: [] };
    expect(() => assertExtensionLearningBundleBoundary(notDynamic, true))
      .toThrow(/loader_not_dynamic/);
  });

  it("rejects extension reducers reachable from the RPG static closure", () => {
    const chunks = admittedChunks();
    chunks[0] = { ...chunks[0]!, imports: [chunks[1]!.fileName], dynamicImports: [] };
    chunks[1] = { ...chunks[1]!, isDynamicEntry: false };
    expect(() => assertExtensionLearningBundleBoundary(chunks, true))
      .toThrow(/static_import/);
  });
});

function baseChunks(): ExtensionLearningBundleChunk[] {
  return [chunk("assets/rpg.js", {
    facadeModuleId: `${ROOT}/rpg.html`,
    isEntry: true,
    moduleIds: [`${ROOT}/src/rpg-main.ts`],
  })];
}

function admittedChunks(): ExtensionLearningBundleChunk[] {
  const dynamic = chunk("assets/extension.js", {
    isDynamicEntry: true,
    moduleIds: [...MODULES],
  });
  return [
    { ...baseChunks()[0]!, dynamicImports: [dynamic.fileName] },
    dynamic,
  ];
}

function chunk(
  fileName: string,
  overrides: Partial<ExtensionLearningBundleChunk> = {},
): ExtensionLearningBundleChunk {
  return {
    fileName,
    facadeModuleId: null,
    isEntry: false,
    isDynamicEntry: false,
    imports: [],
    dynamicImports: [],
    moduleIds: [],
    ...overrides,
  };
}
