import {
  computeRuntimeCorpusExpansionRegistryDigest,
  CORPUS_EXPANSION_ADMISSION_REQUIREMENTS,
  CORPUS_EXPANSION_PHASE_IDS,
  type RuntimeLearningCorpusAdmissionContract,
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
  const admittedCorpusIds = strings(authored.admitted_corpus_ids, "admitted corpus IDs", true);
  const phaseSources = objects(authored.phases, "corpus expansion phases");
  if (phaseSources.length !== CORPUS_EXPANSION_PHASE_IDS.length) {
    throw new Error("corpus expansion phase count is invalid");
  }
  const catalogSources = manifest.byKind.glyph_catalog.filter((candidate) =>
    candidate.schemaVersion === "pu120.magic-glyph-catalog.v0.2");
  if (catalogSources.length !== 1) throw new Error("corpus expansion registry requires the base catalog");
  const observedWordIds = new Set(objects(catalogSources[0]!.content.glyphs, "base glyphs")
    .map((glyph) => string(glyph.canonicalWordId, "base word ID")));
  const observedCorpusIds = new Set<string>();
  const observedNamespaces = new Set(["core120"]);
  const observedPartitions = new Set(["learning.corpus.pu-120"]);
  const observedVersions = new Set(["core-120.prologue-12"]);
  const projectedAdmittedCorpusIds: string[] = [];
  let pendingObserved = false;
  const phases = phaseSources.map((phase, index) => {
    exactKeys(phase, ["phase_id", "sequence", "predecessor_id", "status", "admission_contract",
      "blocked_reasons"], `corpus expansion phase ${index}`);
    if (phase.phase_id !== CORPUS_EXPANSION_PHASE_IDS[index] || phase.sequence !== index + 1 ||
        phase.predecessor_id !== EXPECTED_PREDECESSORS[index]) {
      throw new Error(`corpus expansion phase ${index} identity is invalid`);
    }
    if (phase.status === "pending_review") {
      pendingObserved = true;
      if (phase.admission_contract !== null ||
          !same(phase.blocked_reasons, CORPUS_EXPANSION_ADMISSION_REQUIREMENTS)) {
        throw new Error(`corpus expansion phase ${index} is not safely blocked`);
      }
      return { phaseId: phase.phase_id, sequence: phase.sequence,
        predecessorId: phase.predecessor_id, status: "pending_review", admissionContract: null,
        blockedReasons: CORPUS_EXPANSION_ADMISSION_REQUIREMENTS } as RuntimeCorpusExpansionPhase;
    }
    if (phase.status !== "admitted" || pendingObserved || !Array.isArray(phase.blocked_reasons) ||
        phase.blocked_reasons.length !== 0) {
      throw new Error("admitted corpus phases must form a contiguous reviewed prefix");
    }
    const contract = projectAdmissionContract(phase.admission_contract, `corpus expansion phase ${index}`);
    if (observedCorpusIds.has(contract.corpusId) || observedNamespaces.has(contract.actionNamespace) ||
        observedPartitions.has(contract.savePartitionId) || observedVersions.has(contract.contentVersion)) {
      throw new Error(`corpus expansion phase ${index} reuses a protected identity`);
    }
    for (const wordId of contract.wordIds) {
      if (observedWordIds.has(wordId)) throw new Error(`corpus expansion word ${wordId} overlaps a prior corpus`);
      observedWordIds.add(wordId);
    }
    observedCorpusIds.add(contract.corpusId);
    observedNamespaces.add(contract.actionNamespace);
    observedPartitions.add(contract.savePartitionId);
    observedVersions.add(contract.contentVersion);
    projectedAdmittedCorpusIds.push(contract.corpusId);
    return { phaseId: phase.phase_id, sequence: phase.sequence,
      predecessorId: phase.predecessor_id, status: "admitted", admissionContract: contract,
      blockedReasons: [] } as RuntimeCorpusExpansionPhase;
  });
  if (!same(admittedCorpusIds, projectedAdmittedCorpusIds)) {
    throw new Error("admitted corpus IDs do not match reviewed phase contracts");
  }
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
    admittedCorpusIds,
    phases,
  } as const;
  return {
    sourceDigest: computeRuntimeCorpusExpansionRegistryDigest(body),
    ...body,
  } as RuntimeCorpusExpansionRegistry;
}

function projectAdmissionContract(value: ContentValue | undefined,
  label: string): RuntimeLearningCorpusAdmissionContract {
  const contract = object(value, `${label} admission contract`);
  exactKeys(contract, ["schema_version", "corpus_id", "content_version", "action_namespace",
    "save_partition_id", "save_schema_version", "package_digest", "semantic_digest", "word_ids",
    "review_receipt_ids"], `${label} admission contract`);
  const corpusId = string(contract.corpus_id, `${label}.corpus_id`);
  const contentVersion = string(contract.content_version, `${label}.content_version`);
  const actionNamespace = string(contract.action_namespace, `${label}.action_namespace`);
  const savePartitionId = string(contract.save_partition_id, `${label}.save_partition_id`);
  const packageDigest = string(contract.package_digest, `${label}.package_digest`);
  const semanticDigest = string(contract.semantic_digest, `${label}.semantic_digest`);
  const wordIds = strings(contract.word_ids, `${label}.word_ids`);
  const receipts = object(contract.review_receipt_ids, `${label}.review_receipt_ids`);
  exactKeys(receipts, ["semantic", "pronunciation", "glyph"], `${label}.review_receipt_ids`);
  const reviewReceiptIds = {
    semantic: string(receipts.semantic, `${label}.semantic review receipt`),
    pronunciation: string(receipts.pronunciation, `${label}.pronunciation review receipt`),
    glyph: string(receipts.glyph, `${label}.glyph review receipt`),
  };
  if (contract.schema_version !== "tokipona.learning-corpus-admission.v0.1" ||
      !/^[a-z][a-z0-9.-]*$/.test(corpusId) || corpusId === "pu-120" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*$/.test(contentVersion) ||
      !/^[a-z][a-z0-9_]*$/.test(actionNamespace) || actionNamespace === "core120" ||
      savePartitionId !== `learning.corpus.${corpusId}` ||
      contract.save_schema_version !== "tokipona.learning-corpus-partition.v0.1" ||
      !/^sha256:[0-9a-f]{64}$/.test(packageDigest) ||
      !/^sha256:[0-9a-f]{64}$/.test(semanticDigest) ||
      !wordIds.every((wordId) => /^[a-z]+$/.test(wordId)) ||
      new Set(Object.values(reviewReceiptIds)).size !== 3) {
    throw new Error(`${label} admission contract is invalid`);
  }
  return { schemaVersion: "tokipona.learning-corpus-admission.v0.1", corpusId, contentVersion,
    actionNamespace, savePartitionId, saveSchemaVersion: "tokipona.learning-corpus-partition.v0.1",
    packageDigest: packageDigest as `sha256:${string}`,
    semanticDigest: semanticDigest as `sha256:${string}`, wordIds, reviewReceiptIds };
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

function string(value: ContentValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty`);
  return value;
}

function strings(value: ContentValue | undefined, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) ||
      !value.every((entry) => typeof entry === "string" && entry.length > 0) ||
      new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`);
  return [...value] as string[];
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
