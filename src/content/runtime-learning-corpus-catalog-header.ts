import {
  readRuntimeCorpusExpansionRegistry,
  type CorpusExpansionPhaseId,
  type RuntimeCorpusExpansionRegistry,
} from "./runtime-corpus-expansion-registry.ts";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";

export const RUNTIME_LEARNING_CORPUS_CATALOG_SCHEMA =
  "tokipona.runtime-learning-corpus-catalog.v0.2" as const;

export interface RuntimeLearningCorpusPackageDescriptor {
  readonly phaseId: CorpusExpansionPhaseId;
  readonly corpusId: string;
  readonly packageDigest: `sha256:${string}`;
  readonly semanticDigest: `sha256:${string}`;
}

export interface RuntimeLearningCorpusCatalogHeader {
  readonly registry: RuntimeCorpusExpansionRegistry;
  readonly schemaVersion: typeof RUNTIME_LEARNING_CORPUS_CATALOG_SCHEMA;
  readonly sourceDigest: `sha256:${string}`;
  readonly registryId: string;
  readonly admittedCorpusIds: readonly string[];
  readonly packageDescriptors: readonly RuntimeLearningCorpusPackageDescriptor[];
  readonly packageCount: number;
}

export function computeRuntimeLearningCorpusCatalogDigest(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

/**
 * Verifies only the small catalog header kept in the core runtime artifact.
 * Reviewed package bodies live in a separate generated module and must not be
 * imported until the browser crosses the extension-learning dynamic boundary.
 */
export function readRuntimeLearningCorpusCatalogHeader(
  artifact: unknown,
): RuntimeLearningCorpusCatalogHeader {
  const root = record(artifact, "runtime content artifact");
  const registry = readRuntimeCorpusExpansionRegistry(root);
  const raw = record(root.learningCorpusCatalog, "artifact.learningCorpusCatalog");
  exactKeys(raw, ["schemaVersion", "sourceDigest", "registryId", "admittedCorpusIds",
    "packageDescriptors"], "artifact.learningCorpusCatalog");
  if (raw.schemaVersion !== RUNTIME_LEARNING_CORPUS_CATALOG_SCHEMA ||
      raw.registryId !== registry.registryId) {
    throw new Error("learning corpus catalog identity is invalid");
  }
  const sourceDigest = digest(raw.sourceDigest, "learning corpus catalog sourceDigest");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeLearningCorpusCatalogDigest(payload) !== sourceDigest) {
    throw new Error("learning corpus catalog digest mismatch");
  }
  const admittedCorpusIds = strings(raw.admittedCorpusIds, "learning corpus admittedCorpusIds", true);
  if (!same(admittedCorpusIds, registry.admittedCorpusIds) ||
      !Array.isArray(raw.packageDescriptors) ||
      raw.packageDescriptors.length !== admittedCorpusIds.length) {
    throw new Error("learning corpus catalog admission order does not match the registry");
  }
  const packageDescriptors = raw.packageDescriptors.map((candidate, index) => {
    const descriptor = record(candidate, `learning corpus package descriptor ${index}`);
    exactKeys(descriptor, ["phaseId", "corpusId", "packageDigest", "semanticDigest"],
      `learning corpus package descriptor ${index}`);
    const phase = registry.phases[index];
    if (phase?.status !== "admitted" || descriptor.phaseId !== phase.phaseId ||
        descriptor.corpusId !== admittedCorpusIds[index] ||
        descriptor.corpusId !== phase.admissionContract.corpusId ||
        descriptor.packageDigest !== phase.admissionContract.packageDigest ||
        descriptor.semanticDigest !== phase.admissionContract.semanticDigest) {
      throw new Error("learning corpus package descriptor does not match the admitted registry");
    }
    return Object.freeze({
      phaseId: descriptor.phaseId as CorpusExpansionPhaseId,
      corpusId: descriptor.corpusId as string,
      packageDigest: digest(descriptor.packageDigest, "learning corpus descriptor packageDigest"),
      semanticDigest: digest(descriptor.semanticDigest, "learning corpus descriptor semanticDigest"),
    });
  });
  return Object.freeze({
    registry,
    schemaVersion: RUNTIME_LEARNING_CORPUS_CATALOG_SCHEMA,
    sourceDigest,
    registryId: registry.registryId,
    admittedCorpusIds: Object.freeze(admittedCorpusIds),
    packageDescriptors: Object.freeze(packageDescriptors),
    packageCount: packageDescriptors.length,
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) ||
      !value.every((entry) => typeof entry === "string" && entry.length > 0) ||
      new Set(value).size !== value.length) {
    throw new Error(`${label} must be a unique string array`);
  }
  return [...value] as string[];
}

function digest(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be sha256`);
  }
  return value as `sha256:${string}`;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || new Set(keys).size !== keys.length ||
      expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function same(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}
