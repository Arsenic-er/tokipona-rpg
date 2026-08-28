const DEFERRED_FOREST_MODULE_SUFFIXES = Object.freeze([
  "/src/content/runtime-forest-chapter-manifest.ts",
  "/src/rpg-old-mine-ui.ts",
]);

export interface ForestChapterBundleChunk {
  readonly fileName: string;
  readonly facadeModuleId: string | null;
  readonly isEntry: boolean;
  readonly imports: readonly string[];
  readonly moduleIds: readonly string[];
}

/**
 * The forest authority remains available to its strict reader, but the RPG
 * starts from the P0 reader and must not transitively evaluate the entire
 * forest contract or mount its post-chapter UI at initial load.
 */
export function assertForestChapterBundleBoundary(
  chunks: readonly ForestChapterBundleChunk[],
): void {
  const byFileName = new Map<string, ForestChapterBundleChunk>();
  for (const chunk of chunks) {
    if (!relativeFile(chunk.fileName) || byFileName.has(chunk.fileName)) {
      throw new Error("forest_chapter_bundle_chunk_invalid");
    }
    byFileName.set(chunk.fileName, chunk);
  }
  const rpgEntry = chunks.find((chunk) => chunk.isEntry &&
    normalized(chunk.facadeModuleId ?? "").endsWith("/rpg.html"));
  if (rpgEntry === undefined) throw new Error("forest_chapter_rpg_entry_missing");

  const staticFiles = staticClosure(rpgEntry.fileName, byFileName);
  const deferredForestModule = chunks.find((chunk) => staticFiles.has(chunk.fileName) &&
    chunk.moduleIds.some((moduleId) => DEFERRED_FOREST_MODULE_SUFFIXES.some((suffix) =>
      normalized(moduleId).endsWith(suffix))));
  if (deferredForestModule !== undefined) {
    throw new Error(`forest_chapter_static_import:${deferredForestModule.fileName}`);
  }
}

function staticClosure(
  rootFileName: string,
  chunks: ReadonlyMap<string, ForestChapterBundleChunk>,
): ReadonlySet<string> {
  const visited = new Set<string>();
  const visit = (fileName: string): void => {
    if (visited.has(fileName)) return;
    const chunk = chunks.get(fileName);
    if (chunk === undefined) throw new Error(`forest_chapter_static_import_missing:${fileName}`);
    visited.add(fileName);
    for (const imported of chunk.imports) visit(imported);
  };
  visit(rootFileName);
  return visited;
}

function normalized(value: string): string {
  const slash = value.replaceAll("\\", "/");
  return slash.startsWith("/") ? slash : `/${slash}`;
}

function relativeFile(value: string): boolean {
  return value.length > 0 && !value.includes("\\") && !value.startsWith("/") &&
    !value.includes(":") && value.split("/").every((segment) =>
      segment.length > 0 && segment !== "." && segment !== "..");
}
