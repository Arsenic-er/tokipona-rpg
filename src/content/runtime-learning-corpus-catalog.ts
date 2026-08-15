import type { RuntimeCorpusExpansionRegistry } from "./runtime-corpus-expansion-registry.ts";
import {
  readRuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusPackage,
} from "./runtime-learning-corpus-package.ts";
import {
  readRuntimeLearningCorpusCatalogEnvelope,
} from "./runtime-learning-corpus-catalog-header.ts";

export { computeRuntimeLearningCorpusCatalogDigest } from
  "./runtime-learning-corpus-catalog-header.ts";
export { readRuntimeLearningCorpusCatalogHeader } from
  "./runtime-learning-corpus-catalog-header.ts";
export type { RuntimeLearningCorpusCatalogHeader } from
  "./runtime-learning-corpus-catalog-header.ts";

export interface RuntimeLearningCorpusCatalog {
  readonly schemaVersion: "tokipona.runtime-learning-corpus-catalog.v0.1";
  readonly sourceDigest: `sha256:${string}`;
  readonly registryId: string;
  readonly admittedCorpusIds: readonly string[];
  readonly packages: readonly RuntimeLearningCorpusPackage[];
}

export interface VerifiedRuntimeLearningCorpusCatalog {
  readonly registry: RuntimeCorpusExpansionRegistry;
  readonly catalog: RuntimeLearningCorpusCatalog;
}

const verifiedCatalogs = new WeakSet<object>();

export function isVerifiedRuntimeLearningCorpusCatalog(
  value: unknown,
): value is RuntimeLearningCorpusCatalog {
  return typeof value === "object" && value !== null && verifiedCatalogs.has(value);
}

export function readRuntimeLearningCorpusCatalog(
  artifact: unknown,
): VerifiedRuntimeLearningCorpusCatalog {
  const { header, packageCandidates } = readRuntimeLearningCorpusCatalogEnvelope(artifact);
  const packages = packageCandidates.map((candidate, index) => {
    const pkg = readRuntimeLearningCorpusPackage(header.registry, candidate);
    if (pkg.corpusId !== header.admittedCorpusIds[index]) {
      throw new Error("learning corpus catalog package order does not match admitted corpora");
    }
    return pkg;
  });
  const catalog = deepFreeze({
    schemaVersion: "tokipona.runtime-learning-corpus-catalog.v0.1" as const,
    sourceDigest: header.sourceDigest,
    registryId: header.registryId,
    admittedCorpusIds: header.admittedCorpusIds,
    packages,
  }) as RuntimeLearningCorpusCatalog;
  verifiedCatalogs.add(catalog);
  return Object.freeze({ registry: header.registry, catalog });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
