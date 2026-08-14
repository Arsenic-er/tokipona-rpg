import {
  computeRuntimeCorpusExpansionRegistryDigest,
  CORPUS_EXPANSION_ADMISSION_REQUIREMENTS,
  CORPUS_EXPANSION_PHASE_IDS,
  type RuntimeCorpusExpansionPhase,
  type RuntimeCorpusExpansionRegistry,
} from "../../src/content/runtime-corpus-expansion-registry.ts";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";

const EXPECTED_PREDECESSORS = ["pu-120", "csp-tier1-remainder", "csp-tier2"] as const;

export function projectCorpusExpansionRegistry(manifest: ContentManifest): RuntimeCorpusExpansionRegistry {
  const sources = manifest.byKind.glyph_progression;
  if (sources.length !== 1) throw new Error("corpus expansion registry requires one glyph progression source");
  const source = sources[0]!;
  if (source.path !== "data/language/glyph-progression.v0.1.yaml" ||
      source.contentVersion !== "core-120.prologue-12") {
    throw new Error("corpus expansion registry source identity is noncanonical");
  }
  const scope = object(source.content.scope, "scope");
  if (scope.product_launch_corpus !== "pu-120" ||
      scope.product_launch_scope_is_independent_of_csp_tier !== true ||
      scope.full_120_word_id_manifest_required_before_content_freeze !== true ||
      scope.canonical_save_key !== "latin_word_id" || scope.official_unicode_claim !== false) {
    throw new Error("corpus expansion registry launch scope is invalid");
  }
  const runtime = object(source.content.runtime_curriculum, "runtime_curriculum");
  const authored = object(runtime.corpus_expansion_registry, "runtime_curriculum.corpus_expansion_registry");
  exactKeys(authored, ["registry_id", "base_corpus", "policies", "admitted_corpus_ids", "phases"],
    "corpus expansion registry");
  if (authored.registry_id !== "post-pu120.csp-expansion") {
    throw new Error("corpus expansion registry ID is invalid");
  }
  const base = object(authored.base_corpus, "corpus expansion base corpus");
  exactKeys(base, ["corpus_id", "learning_content_version", "action_namespace", "save_partition_id",
    "save_schema_version", "canonical_word_key"], "corpus expansion base corpus");
  if (base.corpus_id !== "pu-120" || base.learning_content_version !== source.contentVersion ||
      base.action_namespace !== "core120" || base.save_partition_id !== "learning.corpus.pu-120" ||
      base.save_schema_version !== "tokipona.core120-learning-campaign.v0.2" ||
      base.canonical_word_key !== "latin_word_id") {
    throw new Error("corpus expansion base corpus is invalid");
  }
  const policies = object(authored.policies, "corpus expansion policies");
  exactKeys(policies, ["extension_order", "new_corpus_id_required", "new_content_version_required",
    "distinct_action_namespace_required", "distinct_save_partition_required",
    "append_to_base_corpus_forbidden", "cross_corpus_word_overlap_forbidden",
    "display_codepoint_is_identity", "runtime_load_requires_admitted_status", "admission_requirements"],
  "corpus expansion policies");
  if (!same(policies.extension_order, CORPUS_EXPANSION_PHASE_IDS) ||
      policies.new_corpus_id_required !== true || policies.new_content_version_required !== true ||
      policies.distinct_action_namespace_required !== true ||
      policies.distinct_save_partition_required !== true ||
      policies.append_to_base_corpus_forbidden !== true ||
      policies.cross_corpus_word_overlap_forbidden !== true ||
      policies.display_codepoint_is_identity !== false ||
      policies.runtime_load_requires_admitted_status !== true ||
      !same(policies.admission_requirements, CORPUS_EXPANSION_ADMISSION_REQUIREMENTS)) {
    throw new Error("corpus expansion policies are invalid");
  }
  if (!Array.isArray(authored.admitted_corpus_ids) || authored.admitted_corpus_ids.length !== 0) {
    throw new Error("unreviewed corpus expansion cannot be admitted");
  }
  const phaseSources = objects(authored.phases, "corpus expansion phases");
  if (phaseSources.length !== CORPUS_EXPANSION_PHASE_IDS.length) {
    throw new Error("corpus expansion phase count is invalid");
  }
  const phases = phaseSources.map((phase, index) => {
    exactKeys(phase, ["phase_id", "sequence", "predecessor_id", "status", "admission_contract",
      "blocked_reasons"], `corpus expansion phase ${index}`);
    if (phase.phase_id !== CORPUS_EXPANSION_PHASE_IDS[index] || phase.sequence !== index + 1 ||
        phase.predecessor_id !== EXPECTED_PREDECESSORS[index] || phase.status !== "pending_review" ||
        phase.admission_contract !== null ||
        !same(phase.blocked_reasons, CORPUS_EXPANSION_ADMISSION_REQUIREMENTS)) {
      throw new Error(`corpus expansion phase ${index} is not safely blocked`);
    }
    return {
      phaseId: phase.phase_id,
      sequence: phase.sequence,
      predecessorId: phase.predecessor_id,
      status: "pending_review",
      admissionContract: null,
      blockedReasons: CORPUS_EXPANSION_ADMISSION_REQUIREMENTS,
    } as RuntimeCorpusExpansionPhase;
  });
  const body = {
    sourcePath: source.path,
    contentVersion: source.contentVersion,
    registryId: "post-pu120.csp-expansion",
    baseCorpus: {
      corpusId: "pu-120",
      learningContentVersion: "core-120.prologue-12",
      actionNamespace: "core120",
      savePartitionId: "learning.corpus.pu-120",
      saveSchemaVersion: "tokipona.core120-learning-campaign.v0.2",
      canonicalWordKey: "latin_word_id",
    },
    policies: {
      extensionOrder: CORPUS_EXPANSION_PHASE_IDS,
      newCorpusIdRequired: true,
      newContentVersionRequired: true,
      distinctActionNamespaceRequired: true,
      distinctSavePartitionRequired: true,
      appendToBaseCorpusForbidden: true,
      crossCorpusWordOverlapForbidden: true,
      displayCodepointIsIdentity: false,
      runtimeLoadRequiresAdmittedStatus: true,
      admissionRequirements: CORPUS_EXPANSION_ADMISSION_REQUIREMENTS,
    },
    admittedCorpusIds: [] as const,
    phases,
  } as const;
  return {
    sourceDigest: computeRuntimeCorpusExpansionRegistryDigest(body),
    ...body,
  } as RuntimeCorpusExpansionRegistry;
}

function object(value: ContentValue | undefined, label: string): ContentObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as ContentObject;
}

function objects(value: ContentValue | undefined, label: string): ContentObject[] {
  if (!Array.isArray(value) || !value.every((entry) =>
    typeof entry === "object" && entry !== null && !Array.isArray(entry))) {
    throw new Error(`${label} must be an object array`);
  }
  return value as ContentObject[];
}

function same(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function exactKeys(value: ContentObject, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || new Set(keys).size !== keys.length ||
      expected.some((entry) => !keys.includes(entry))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}
