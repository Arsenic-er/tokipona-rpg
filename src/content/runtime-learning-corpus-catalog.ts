import type { RuntimeCorpusExpansionRegistry } from "./runtime-corpus-expansion-registry.ts";
import {
  readRuntimeLearningCorpusCatalogHeader,
} from "./runtime-learning-corpus-catalog-header.ts";
import {
  readRuntimeLearningCorpusPackageBundle,
} from "./runtime-learning-corpus-package-bundle.ts";
import type { RuntimeLearningCorpusPackage } from "./runtime-learning-corpus-package.ts";

export { computeRuntimeLearningCorpusCatalogDigest } from
  "./runtime-learning-corpus-catalog-header.ts";
export {
  readRuntimeLearningCorpusCatalogHeader,
  RUNTIME_LEARNING_CORPUS_CATALOG_SCHEMA,
} from "./runtime-learning-corpus-catalog-header.ts";
export type {
  RuntimeLearningCorpusCatalogHeader,
  RuntimeLearningCorpusPackageDescriptor,
} from "./runtime-learning-corpus-catalog-header.ts";

export interface RuntimeLearningCorpusCatalog {
  readonly schemaVersion: "tokipona.runtime-learning-corpus-catalog.v0.2";
  readonly sourceDigest: `sha256:${string}`;
  readonly packageBundleDigest: `sha256:${string}`;
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
  packageBundleCandidate: unknown,
): VerifiedRuntimeLearningCorpusCatalog {
  const header = readRuntimeLearningCorpusCatalogHeader(artifact);
  const packageBundle = readRuntimeLearningCorpusPackageBundle(
    header.registry, packageBundleCandidate);
  if (packageBundle.registryId !== header.registryId ||
      !same(packageBundle.admittedCorpusIds, header.admittedCorpusIds) ||
      packageBundle.packages.length !== header.packageDescriptors.length ||
      packageBundle.packages.some((pkg, index) => {
        const descriptor = header.packageDescriptors[index];
        return descriptor === undefined || pkg.phaseId !== descriptor.phaseId ||
          pkg.corpusId !== descriptor.corpusId || pkg.sourceDigest !== descriptor.packageDigest ||
          pkg.semanticDigest !== descriptor.semanticDigest;
      })) {
    throw new Error("learning corpus package bundle does not match the core catalog header");
  }
  const catalog = deepFreeze({
    schemaVersion: "tokipona.runtime-learning-corpus-catalog.v0.2" as const,
    sourceDigest: header.sourceDigest,
    packageBundleDigest: packageBundle.sourceDigest,
    registryId: header.registryId,
    admittedCorpusIds: header.admittedCorpusIds,
    packages: packageBundle.packages,
  }) as RuntimeLearningCorpusCatalog;
  verifiedCatalogs.add(catalog);
  return Object.freeze({ registry: header.registry, catalog });
}

function same(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
