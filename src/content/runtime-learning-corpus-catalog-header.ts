import {
  readRuntimeCorpusExpansionRegistry,
  type RuntimeCorpusExpansionRegistry,
} from "./runtime-corpus-expansion-registry.ts";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";

export interface RuntimeLearningCorpusCatalogHeader {
  readonly registry: RuntimeCorpusExpansionRegistry;
  readonly sourceDigest: `sha256:${string}`;
  readonly registryId: string;
  readonly admittedCorpusIds: readonly string[];
  readonly packageCount: number;
}

export interface RuntimeLearningCorpusCatalogEnvelope {
  readonly header: RuntimeLearningCorpusCatalogHeader;
  readonly packageCandidates: readonly unknown[];
}

export function computeRuntimeLearningCorpusCatalogDigest(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

/** Verifies the catalog envelope without importing extension reducers. */
export function readRuntimeLearningCorpusCatalogHeader(
  artifact: unknown,
): RuntimeLearningCorpusCatalogHeader {
  return readRuntimeLearningCorpusCatalogEnvelope(artifact).header;
}

export function readRuntimeLearningCorpusCatalogEnvelope(
  artifact: unknown,
): RuntimeLearningCorpusCatalogEnvelope {
  const root = record(artifact, "runtime content artifact");
  const registry = readRuntimeCorpusExpansionRegistry(root);
  const raw = record(root.learningCorpusCatalog, "artifact.learningCorpusCatalog");
  exactKeys(raw, ["schemaVersion", "sourceDigest", "registryId", "admittedCorpusIds", "packages"],
    "artifact.learningCorpusCatalog");
  if (raw.schemaVersion !== "tokipona.runtime-learning-corpus-catalog.v0.1" ||
      raw.registryId !== registry.registryId) {
    throw new Error("learning corpus catalog identity is invalid");
  }
  const sourceDigest = digest(raw.sourceDigest, "learning corpus catalog sourceDigest");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeLearningCorpusCatalogDigest(payload) !== sourceDigest) {
    throw new Error("learning corpus catalog digest mismatch");
  }
  const admittedCorpusIds = strings(raw.admittedCorpusIds, "learning corpus admittedCorpusIds", true);
  if (!same(admittedCorpusIds, registry.admittedCorpusIds)) {
    throw new Error("learning corpus catalog admission order does not match the registry");
  }
  if (!Array.isArray(raw.packages) || raw.packages.length !== admittedCorpusIds.length) {
    throw new Error("learning corpus catalog must exactly cover admitted corpora");
  }
  return Object.freeze({
    header: Object.freeze({ registry, sourceDigest, registryId: registry.registryId,
      admittedCorpusIds: Object.freeze(admittedCorpusIds), packageCount: raw.packages.length }),
    packageCandidates: Object.freeze([...raw.packages]),
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
      new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`);
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
