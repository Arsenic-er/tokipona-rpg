import {
  isVerifiedRuntimeCorpusExpansionRegistry,
  type RuntimeCorpusExpansionRegistry,
} from "./runtime-corpus-expansion-registry.ts";
import {
  readRuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusPackage,
} from "./runtime-learning-corpus-package.ts";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";

export const RUNTIME_LEARNING_CORPUS_PACKAGE_BUNDLE_SCHEMA =
  "tokipona.runtime-learning-corpus-package-bundle.v0.1" as const;

export interface RuntimeLearningCorpusPackageBundle {
  readonly schemaVersion: typeof RUNTIME_LEARNING_CORPUS_PACKAGE_BUNDLE_SCHEMA;
  readonly sourceDigest: `sha256:${string}`;
  readonly registryId: "post-pu120.csp-expansion";
  readonly admittedCorpusIds: readonly string[];
  readonly packages: readonly RuntimeLearningCorpusPackage[];
}

const verified = new WeakSet<object>();

export function computeRuntimeLearningCorpusPackageBundleDigest(
  payload: unknown,
): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedRuntimeLearningCorpusPackageBundle(
  value: unknown,
): value is RuntimeLearningCorpusPackageBundle {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeLearningCorpusPackageBundle(
  registry: RuntimeCorpusExpansionRegistry,
  candidate: unknown,
): RuntimeLearningCorpusPackageBundle {
  if (!isVerifiedRuntimeCorpusExpansionRegistry(registry)) {
    throw new Error("learning corpus package bundle registry is not verified");
  }
  const raw = record(candidate, "runtime learning corpus package bundle");
  exactKeys(raw, ["schemaVersion", "sourceDigest", "registryId", "admittedCorpusIds", "packages"],
    "runtime learning corpus package bundle");
  if (raw.schemaVersion !== RUNTIME_LEARNING_CORPUS_PACKAGE_BUNDLE_SCHEMA ||
      raw.registryId !== registry.registryId) {
    throw new Error("learning corpus package bundle identity is invalid");
  }
  const sourceDigest = digest(raw.sourceDigest, "learning corpus package bundle sourceDigest");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeLearningCorpusPackageBundleDigest(payload) !== sourceDigest) {
    throw new Error("learning corpus package bundle digest mismatch");
  }
  const admittedCorpusIds = strings(raw.admittedCorpusIds,
    "learning corpus package bundle admittedCorpusIds", true);
  if (!same(admittedCorpusIds, registry.admittedCorpusIds) ||
      !Array.isArray(raw.packages) || raw.packages.length !== admittedCorpusIds.length) {
    throw new Error("learning corpus package bundle does not cover the admitted registry");
  }
  const packages = raw.packages.map((packageCandidate, index) => {
    const pkg = readRuntimeLearningCorpusPackage(registry, packageCandidate);
    if (pkg.corpusId !== admittedCorpusIds[index]) {
      throw new Error("learning corpus package bundle order is invalid");
    }
    return pkg;
  });
  const result = deepFreeze({
    schemaVersion: RUNTIME_LEARNING_CORPUS_PACKAGE_BUNDLE_SCHEMA,
    sourceDigest,
    registryId: "post-pu120.csp-expansion" as const,
    admittedCorpusIds,
    packages,
  });
  verified.add(result);
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || new Set(keys).size !== keys.length ||
      expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
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

function same(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
