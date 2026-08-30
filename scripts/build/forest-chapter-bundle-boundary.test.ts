import { describe, expect, it } from "vitest";
import {
  assertForestChapterBundleBoundary,
  type ForestChapterBundleChunk,
} from "./forest-chapter-bundle-boundary";

const ROOT = "C:/workspace";
const FOREST_READER = `${ROOT}/src/content/runtime-forest-chapter-manifest.ts`;
const OLD_MINE_UI = `${ROOT}/src/rpg-old-mine-ui.ts`;
const GRAYBOX_ENTRY = `${ROOT}/src/world-scale-main.ts`;
const PRIVATE_READER = `${ROOT}/private-assets/read-approved-pack.ts`;

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

  it("keeps the formal chapter entry isolated from developer graybox and private asset readers", () => {
    expect(() => assertForestChapterBundleBoundary(baseChunks())).not.toThrow();

    const grayboxLeak = baseChunks();
    grayboxLeak[3] = { ...grayboxLeak[3]!, imports: [grayboxLeak[4]!.fileName] };
    expect(() => assertForestChapterBundleBoundary(grayboxLeak))
      .toThrow("forest_opening_static_import:assets/world-scale.js");

    const privateLeak = baseChunks();
    privateLeak[3] = { ...privateLeak[3]!, imports: [privateLeak[5]!.fileName] };
    expect(() => assertForestChapterBundleBoundary(privateLeak))
      .toThrow("forest_opening_static_import:assets/private-reader.js");
  });

  it("requires the formal chapter entry", () => {
    expect(() => assertForestChapterBundleBoundary(baseChunks().filter((chunk) =>
      !chunk.facadeModuleId?.endsWith("chapter-one.html"))))
      .toThrow("forest_opening_entry_missing");
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
    chunk("assets/chapter-one.js", {
      facadeModuleId: `${ROOT}/chapter-one.html`,
      isEntry: true,
      moduleIds: [`${ROOT}/src/forest-opening-main.ts`],
    }),
    chunk("assets/world-scale.js", {
      moduleIds: [GRAYBOX_ENTRY],
    }),
    chunk("assets/private-reader.js", {
      moduleIds: [PRIVATE_READER],
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
