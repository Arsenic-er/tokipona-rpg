import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";

export const CORPUS_EXPANSION_PHASE_IDS = [
  "csp-tier1-remainder",
  "csp-tier2",
  "csp-tier3",
] as const;

export const CORPUS_EXPANSION_ADMISSION_REQUIREMENTS = [
  "corpus_id",
  "content_version",
  "action_namespace",
  "save_partition",
  "reviewed_word_manifest",
  "semantic_review",
  "pronunciation_assets",
  "glyph_assets",
] as const;

export type CorpusExpansionPhaseId = (typeof CORPUS_EXPANSION_PHASE_IDS)[number];

export interface RuntimeLearningCorpusPartition {
  readonly corpusId: "pu-120";
  readonly learningContentVersion: "core-120.prologue-12";
  readonly actionNamespace: "core120";
  readonly savePartitionId: "learning.corpus.pu-120";
  readonly saveSchemaVersion: "tokipona.core120-learning-campaign.v0.2";
  readonly canonicalWordKey: "latin_word_id";
}

export interface RuntimeCorpusExpansionPhase {
  readonly phaseId: CorpusExpansionPhaseId;
  readonly sequence: 1 | 2 | 3;
  readonly predecessorId: "pu-120" | CorpusExpansionPhaseId;
  readonly status: "pending_review";
  readonly admissionContract: null;
  readonly blockedReasons: typeof CORPUS_EXPANSION_ADMISSION_REQUIREMENTS;
}

export interface RuntimeCorpusExpansionRegistry {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/language/glyph-progression.v0.1.yaml";
  readonly contentVersion: "core-120.prologue-12";
  readonly registryId: "post-pu120.csp-expansion";
  readonly baseCorpus: RuntimeLearningCorpusPartition;
  readonly policies: Readonly<{
    readonly extensionOrder: typeof CORPUS_EXPANSION_PHASE_IDS;
    readonly newCorpusIdRequired: true;
    readonly newContentVersionRequired: true;
    readonly distinctActionNamespaceRequired: true;
    readonly distinctSavePartitionRequired: true;
    readonly appendToBaseCorpusForbidden: true;
    readonly crossCorpusWordOverlapForbidden: true;
    readonly displayCodepointIsIdentity: false;
    readonly runtimeLoadRequiresAdmittedStatus: true;
    readonly admissionRequirements: typeof CORPUS_EXPANSION_ADMISSION_REQUIREMENTS;
  }>;
  readonly admittedCorpusIds: readonly [];
  readonly phases: readonly RuntimeCorpusExpansionPhase[];
}

const EXPECTED_PREDECESSORS = ["pu-120", "csp-tier1-remainder", "csp-tier2"] as const;
const verified = new WeakSet<object>();

export function computeRuntimeCorpusExpansionRegistryDigest(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedRuntimeCorpusExpansionRegistry(
  value: unknown,
): value is RuntimeCorpusExpansionRegistry {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeCorpusExpansionRegistry(candidate: unknown): RuntimeCorpusExpansionRegistry {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.corpusExpansionRegistry, "artifact.corpusExpansionRegistry");
  exactKeys(raw, [
    "sourceDigest", "sourcePath", "contentVersion", "registryId", "baseCorpus", "policies",
    "admittedCorpusIds", "phases",
  ], "corpus expansion registry");
  const digest = string(raw.sourceDigest, "corpus expansion sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("corpus expansion sourceDigest must be sha256");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeCorpusExpansionRegistryDigest(payload) !== digest) {
    throw new Error("corpus expansion registry digest mismatch");
  }
  if (raw.sourcePath !== "data/language/glyph-progression.v0.1.yaml" ||
      raw.contentVersion !== "core-120.prologue-12" ||
      raw.registryId !== "post-pu120.csp-expansion") {
    throw new Error("corpus expansion registry identity is invalid");
  }

  const base = record(raw.baseCorpus, "corpus expansion base corpus");
  exactKeys(base, ["corpusId", "learningContentVersion", "actionNamespace", "savePartitionId",
    "saveSchemaVersion", "canonicalWordKey"], "corpus expansion base corpus");
  if (base.corpusId !== "pu-120" || base.learningContentVersion !== "core-120.prologue-12" ||
      base.actionNamespace !== "core120" || base.savePartitionId !== "learning.corpus.pu-120" ||
      base.saveSchemaVersion !== "tokipona.core120-learning-campaign.v0.2" ||
      base.canonicalWordKey !== "latin_word_id") {
    throw new Error("corpus expansion base partition is invalid");
  }

  const policies = record(raw.policies, "corpus expansion policies");
  exactKeys(policies, [
    "extensionOrder", "newCorpusIdRequired", "newContentVersionRequired",
    "distinctActionNamespaceRequired", "distinctSavePartitionRequired", "appendToBaseCorpusForbidden",
    "crossCorpusWordOverlapForbidden", "displayCodepointIsIdentity",
    "runtimeLoadRequiresAdmittedStatus", "admissionRequirements",
  ], "corpus expansion policies");
  if (!same(policies.extensionOrder, CORPUS_EXPANSION_PHASE_IDS) ||
      policies.newCorpusIdRequired !== true || policies.newContentVersionRequired !== true ||
      policies.distinctActionNamespaceRequired !== true || policies.distinctSavePartitionRequired !== true ||
      policies.appendToBaseCorpusForbidden !== true || policies.crossCorpusWordOverlapForbidden !== true ||
      policies.displayCodepointIsIdentity !== false || policies.runtimeLoadRequiresAdmittedStatus !== true ||
      !same(policies.admissionRequirements, CORPUS_EXPANSION_ADMISSION_REQUIREMENTS)) {
    throw new Error("corpus expansion policies are invalid");
  }
  if (!Array.isArray(raw.admittedCorpusIds) || raw.admittedCorpusIds.length !== 0) {
    throw new Error("unreviewed corpus expansion cannot be admitted");
  }
  if (!Array.isArray(raw.phases) || raw.phases.length !== CORPUS_EXPANSION_PHASE_IDS.length) {
    throw new Error("corpus expansion phases are invalid");
  }
  raw.phases.forEach((candidatePhase, index) => {
    const phase = record(candidatePhase, `corpus expansion phase ${index}`);
    exactKeys(phase, ["phaseId", "sequence", "predecessorId", "status", "admissionContract",
      "blockedReasons"], `corpus expansion phase ${index}`);
    if (phase.phaseId !== CORPUS_EXPANSION_PHASE_IDS[index] || phase.sequence !== index + 1 ||
        phase.predecessorId !== EXPECTED_PREDECESSORS[index] || phase.status !== "pending_review" ||
        phase.admissionContract !== null || !same(phase.blockedReasons,
          CORPUS_EXPANSION_ADMISSION_REQUIREMENTS)) {
      throw new Error(`corpus expansion phase ${index} is not safely blocked`);
    }
  });

  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimeCorpusExpansionRegistry;
  verified.add(result);
  return result;
}

/**
 * Returns the only currently admitted learning partition. Pending extension
 * phase IDs and unknown corpus IDs fail closed instead of creating save data.
 */
export function resolveRuntimeLearningCorpusPartition(
  registry: RuntimeCorpusExpansionRegistry,
  corpusId: string,
): RuntimeLearningCorpusPartition {
  if (!isVerifiedRuntimeCorpusExpansionRegistry(registry)) {
    throw new Error("corpus expansion registry is not verified");
  }
  if (corpusId !== registry.baseCorpus.corpusId) {
    throw new Error(`learning corpus ${corpusId} is not admitted`);
  }
  return registry.baseCorpus;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function same(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (!sameSet(Object.keys(value), expected)) throw new Error(`${label} contains unknown or missing fields`);
}

function sameSet(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && new Set(value).size === value.length &&
    expected.every((entry) => value.includes(entry));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
