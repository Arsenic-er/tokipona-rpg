const EXTENSION_MODULE_SUFFIXES = Object.freeze([
  "/src/persistence/browser-learning-corpus-loader.ts",
  "/src/generated/learning-corpus-packages.v0.1.json",
  "/src/persistence/browser-learning-corpus-adapter.ts",
  "/src/learning/corpus-partition-collection.ts",
  "/src/learning/corpus-partition.ts",
] as const);

export interface ExtensionLearningBundleChunk {
  readonly fileName: string;
  readonly facadeModuleId: string | null;
  readonly isEntry: boolean;
  readonly isDynamicEntry: boolean;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly moduleIds: readonly string[];
}

/**
 * The reviewed extension reducer is a separate, dynamically loaded save
 * partition. With an empty admitted catalog it must be absent from the output,
 * not merely small enough to hide inside the RPG budget. Once admitted, the
 * loader and reducer must exist but remain outside the RPG static closure.
 */
export function assertExtensionLearningBundleBoundary(
  chunks: readonly ExtensionLearningBundleChunk[],
  admitted: boolean,
): void {
  const byFileName = new Map<string, ExtensionLearningBundleChunk>();
  for (const chunk of chunks) {
    if (!relativeFile(chunk.fileName) || byFileName.has(chunk.fileName)) {
      throw new Error("extension_learning_bundle_chunk_invalid");
    }
    byFileName.set(chunk.fileName, chunk);
  }
  const rpgEntry = chunks.find((chunk) => chunk.isEntry &&
    normalized(chunk.facadeModuleId ?? "").endsWith("/rpg.html"));
  if (rpgEntry === undefined) throw new Error("extension_learning_rpg_entry_missing");

  const protectedChunks = chunks.filter((chunk) =>
    chunk.moduleIds.some(isExtensionModule));
  const staticFiles = staticClosure(rpgEntry.fileName, byFileName);
  const staticProtected = protectedChunks.find((chunk) => staticFiles.has(chunk.fileName));
  if (staticProtected !== undefined) {
    throw new Error(`extension_learning_static_import:${staticProtected.fileName}`);
  }

  if (!admitted) {
    if (protectedChunks.length > 0) {
      throw new Error(`extension_learning_zero_catalog_module_emitted:${protectedChunks[0]!.fileName}`);
    }
    return;
  }

  for (const suffix of EXTENSION_MODULE_SUFFIXES) {
    if (!chunks.some((chunk) => chunk.moduleIds.some((moduleId) =>
      normalized(moduleId).endsWith(suffix)))) {
      throw new Error(`extension_learning_admitted_module_missing:${suffix}`);
    }
  }
  const loaderChunk = chunks.find((chunk) => chunk.moduleIds.some((moduleId) =>
    normalized(moduleId).endsWith(EXTENSION_MODULE_SUFFIXES[0])));
  if (loaderChunk?.isDynamicEntry !== true || !rpgEntry.dynamicImports.includes(loaderChunk.fileName)) {
    throw new Error("extension_learning_loader_not_dynamic");
  }
}

function staticClosure(
  rootFileName: string,
  chunks: ReadonlyMap<string, ExtensionLearningBundleChunk>,
): ReadonlySet<string> {
  const visited = new Set<string>();
  const visit = (fileName: string): void => {
    if (visited.has(fileName)) return;
    const chunk = chunks.get(fileName);
    if (chunk === undefined) throw new Error(`extension_learning_static_import_missing:${fileName}`);
    visited.add(fileName);
    for (const imported of chunk.imports) visit(imported);
  };
  visit(rootFileName);
  return visited;
}

function isExtensionModule(moduleId: string): boolean {
  const value = normalized(moduleId);
  return EXTENSION_MODULE_SUFFIXES.some((suffix) => value.endsWith(suffix));
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
