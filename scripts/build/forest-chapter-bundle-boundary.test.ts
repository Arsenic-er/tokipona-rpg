import { describe, expect, it } from "vitest";
import {
  assertForestChapterBundleBoundary,
  type ForestChapterBundleChunk,
} from "./forest-chapter-bundle-boundary";

const ROOT = "C:/workspace";
const FOREST_READER = `${ROOT}/src/content/runtime-forest-chapter-manifest.ts`;
const OLD_MINE_UI = `${ROOT}/src/rpg-old-mine-ui.ts`;

describe("forest chapter bundle boundary", () => {
  it("keeps forest verification and the post-chapter old-mine UI out of the RPG static closure", () => {
    expect(() => assertForestChapterBundleBoundary(baseChunks())).not.toThrow();

    const readerLeak = baseChunks();
    readerLeak[0] = { ...readerLeak[0]!, imports: [readerLeak[1]!.fileName] };
    expect(() => assertForestChapterBundleBoundary(readerLeak))
      .toThrow("forest_chapter_static_import:assets/forest-reader.js");

    const oldMineLeak = baseChunks();
    oldMineLeak[0] = { ...oldMineLeak[0]!, imports: [oldMineLeak[2]!.fileName] };
    expect(() => assertForestChapterBundleBoundary(oldMineLeak))
      .toThrow("forest_chapter_static_import:assets/old-mine-ui.js");
  });
});

function baseChunks(): ForestChapterBundleChunk[] {
  return [
    chunk("assets/rpg.js", {
      facadeModuleId: `${ROOT}/rpg.html`,
      isEntry: true,
      moduleIds: [`${ROOT}/src/rpg-main.ts`],
    }),
    chunk("assets/forest-reader.js", {
      moduleIds: [FOREST_READER],
    }),
    chunk("assets/old-mine-ui.js", {
      moduleIds: [OLD_MINE_UI],
    }),
  ];
}

function chunk(
  fileName: string,
  overrides: Partial<ForestChapterBundleChunk> = {},
): ForestChapterBundleChunk {
  return {
    fileName,
    facadeModuleId: null,
    isEntry: false,
    imports: [],
    moduleIds: [],
    ...overrides,
  };
}
