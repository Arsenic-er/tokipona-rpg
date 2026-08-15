import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import { readRuntimeCorpusExpansionRegistry } from
  "../../src/content/runtime-corpus-expansion-registry";
import { readRuntimeLearningCorpusCatalog } from
  "../../src/content/runtime-learning-corpus-catalog";
import {
  computeRuntimeLearningCorpusPackageDigest,
  computeRuntimeLearningCorpusSemanticDigest,
  type RuntimeLearningCorpusWord,
} from "../../src/content/runtime-learning-corpus-package";
import type { ContentSource } from "../../src/content/types";
import {
  extensionLearningAuthority,
  extensionLearningEnvironmentFingerprint,
} from "../../src/testing/extension-learning-fixture";
import {
  buildRuntimeContentArtifact,
  buildRuntimeLearningCorpusPackageBundle,
} from "./runtime-artifact";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({
  path: path.replace(/^\.\.\/\.\.\//, ""),
  data: path.endsWith(".json") ? JSON.parse(text) : parse(text),
}));

const registrySource = (all: ContentSource[]): Record<string, any> =>
  all.find((source) => source.path.endsWith("glyph-progression.v0.1.yaml"))!.data as Record<string, any>;

const CORPUS_ID = "csp-tier1-rehearsal.v1";
const CONTENT_VERSION = "csp-tier1.rehearsal.1";
const REVIEW_RECEIPTS = {
  semantic: "review.semantic.csp1.v1",
  pronunciation: "review.pronunciation.csp1.v1",
  glyph: "review.glyph.csp1.v1",
} as const;

function reviewedPackage(): any {
  const word: RuntimeLearningCorpusWord = {
    wordId: "testword", targetState: "produced", semanticFacets: ["test-semantic-facet"],
    actions: [
      { kind: "discover", actionId: "csp1.testword.discover", evidenceType: "glyph_discovered",
        taskFamilyId: null, environmentFingerprint: null, promptLevel: null, semanticFacets: [],
        worldAuthority: extensionLearningAuthority("discover") },
      { kind: "attune", actionId: "csp1.testword.attune", evidenceType: "glyph_attunement_completed",
        taskFamilyId: null, environmentFingerprint: null, promptLevel: null, semanticFacets: [],
        worldAuthority: extensionLearningAuthority("attune") },
      { kind: "context_0", actionId: "csp1.testword.context_0", evidenceType: "active_retrieval_submitted",
        taskFamilyId: "csp1.testword.family0", environmentFingerprint:
          extensionLearningEnvironmentFingerprint("context_0"),
        promptLevel: 0, semanticFacets: ["test-semantic-facet"],
        worldAuthority: extensionLearningAuthority("context_0") },
      { kind: "context_1", actionId: "csp1.testword.context_1", evidenceType: "active_retrieval_submitted",
        taskFamilyId: "csp1.testword.family1", environmentFingerprint:
          extensionLearningEnvironmentFingerprint("context_1"),
        promptLevel: 1, semanticFacets: ["test-semantic-facet"],
        worldAuthority: extensionLearningAuthority("context_1") },
      { kind: "repair", actionId: "csp1.testword.repair", evidenceType: "repair_completed",
        taskFamilyId: "csp1.testword.repair", environmentFingerprint:
          extensionLearningEnvironmentFingerprint("repair"),
        promptLevel: 1, semanticFacets: ["test-semantic-facet"],
        worldAuthority: extensionLearningAuthority("repair") },
    ],
    assetBindings: { pronunciationAssetId: "audio.pronunciation.testword.v1",
      glyphAssetId: "glyph.csp1.testword.v1" },
  };
  const semantic = {
    schemaVersion: "tokipona.runtime-learning-corpus.v0.2" as const,
    phaseId: "csp-tier1-remainder" as const,
    corpusId: CORPUS_ID, contentVersion: CONTENT_VERSION, actionNamespace: "csp1",
    savePartitionId: `learning.corpus.${CORPUS_ID}`,
    saveSchemaVersion: "tokipona.learning-corpus-partition.v0.2" as const,
    canonicalWordKey: "latin_word_id" as const, wordIds: ["testword"],
    words: { testword: word },
  };
  const payload = { ...semantic, semanticDigest: computeRuntimeLearningCorpusSemanticDigest(semantic),
    reviewReceiptIds: REVIEW_RECEIPTS };
  return { ...payload, sourceDigest: computeRuntimeLearningCorpusPackageDigest(payload) };
}

function admitReviewedPackage(all: ContentSource[]): any {
  const pkg = reviewedPackage();
  const registry = registrySource(all).runtime_curriculum.corpus_expansion_registry;
  registry.admitted_corpus_ids = [CORPUS_ID];
  registry.phases[0] = {
    ...registry.phases[0], status: "admitted", blocked_reasons: [],
    admission_contract: {
      schema_version: "tokipona.learning-corpus-admission.v0.1", corpus_id: CORPUS_ID,
      content_version: CONTENT_VERSION, action_namespace: "csp1",
      save_partition_id: `learning.corpus.${CORPUS_ID}`,
      save_schema_version: "tokipona.learning-corpus-partition.v0.2",
      package_digest: pkg.sourceDigest, semantic_digest: pkg.semanticDigest, word_ids: ["testword"],
      review_receipt_ids: REVIEW_RECEIPTS,
    },
  };
  all.push({ path: `data/language/corpora/${CORPUS_ID}.${CONTENT_VERSION}.json`, data: pkg });
  return pkg;
}

describe("post-pu120 corpus expansion projector", () => {
  it("projects a reviewed prefix without mutating the pu-120 partition", () => {
    const all = sources();
    const pkg = admitReviewedPackage(all);
    const manifest = compileContent(all);
    const artifact = buildRuntimeContentArtifact(manifest);
    const packageBundle = buildRuntimeLearningCorpusPackageBundle(manifest);
    const projected = readRuntimeCorpusExpansionRegistry(artifact);
    const catalog = readRuntimeLearningCorpusCatalog(artifact, packageBundle).catalog;
    expect(projected.baseCorpus.corpusId).toBe("pu-120");
    expect(projected.admittedCorpusIds).toEqual([CORPUS_ID]);
    expect(projected.phases[0]).toMatchObject({ status: "admitted",
      admissionContract: { actionNamespace: "csp1", wordIds: ["testword"] } });
    expect(catalog.admittedCorpusIds).toEqual([CORPUS_ID]);
    expect(catalog.packages[0]).toMatchObject({ corpusId: CORPUS_ID, sourceDigest: pkg.sourceDigest });
  });

  it("requires exactly one reviewed package for every admitted corpus", () => {
    const missing = sources();
    const pkg = admitReviewedPackage(missing);
    missing.pop();
    expect(() => buildRuntimeContentArtifact(compileContent(missing)))
      .toThrow(/exactly cover admitted corpus IDs/);

    const wrongPath = sources();
    admitReviewedPackage(wrongPath);
    wrongPath[wrongPath.length - 1] = {
      ...wrongPath.at(-1)!, path: `data/language/corpora/${CORPUS_ID}.wrong.json`,
    };
    expect(() => compileContent(wrongPath)).toThrow(/canonical path/);

    const tampered = sources();
    admitReviewedPackage(tampered);
    (tampered.at(-1)!.data as any).words.testword.assetBindings.glyphAssetId =
      "glyph.csp1.testword.forged";
    expect(() => compileContent(tampered)).toThrow(/package digest mismatch/);
    expect(pkg.corpusId).toBe(CORPUS_ID);
  });

  it("rejects a fully re-signed package that points an action at the wrong world target", () => {
    const all = sources();
    const pkg = admitReviewedPackage(all);
    pkg.words.testword.actions[0].worldAuthority = {
      ...pkg.words.testword.actions[0].worldAuthority,
      targetId: "settlement.merchant_butcher",
    };
    const semanticSource = Object.fromEntries(Object.entries(pkg).filter(([key]) =>
      key !== "semanticDigest" && key !== "reviewReceiptIds" && key !== "sourceDigest"));
    pkg.semanticDigest = computeRuntimeLearningCorpusSemanticDigest(semanticSource as any);
    const packagePayload = Object.fromEntries(Object.entries(pkg).filter(([key]) => key !== "sourceDigest"));
    pkg.sourceDigest = computeRuntimeLearningCorpusPackageDigest(packagePayload);
    const admission = registrySource(all).runtime_curriculum.corpus_expansion_registry
      .phases[0].admission_contract;
    admission.package_digest = pkg.sourceDigest;
    admission.semantic_digest = pkg.semanticDigest;

    expect(() => buildRuntimeContentArtifact(compileContent(all))).toThrow(/world authority is invalid/);
  });

  it("rejects word overlap and a gap in reviewed phases", () => {
    const overlap = sources();
    const overlapRegistry = registrySource(overlap).runtime_curriculum.corpus_expansion_registry;
    overlapRegistry.admitted_corpus_ids = ["csp-tier1-rehearsal.v1"];
    overlapRegistry.phases[0] = {
      ...overlapRegistry.phases[0], status: "admitted", blocked_reasons: [],
      admission_contract: {
        schema_version: "tokipona.learning-corpus-admission.v0.1",
        corpus_id: "csp-tier1-rehearsal.v1", content_version: "csp-tier1.rehearsal.1",
        action_namespace: "csp1", save_partition_id: "learning.corpus.csp-tier1-rehearsal.v1",
        save_schema_version: "tokipona.learning-corpus-partition.v0.2",
        package_digest: `sha256:${"1".repeat(64)}`, semantic_digest: `sha256:${"2".repeat(64)}`,
        word_ids: ["telo"], review_receipt_ids: { semantic: "r.s", pronunciation: "r.p", glyph: "r.g" },
      },
    };
    expect(() => buildRuntimeContentArtifact(compileContent(overlap))).toThrow(/overlaps a prior corpus/);

    const gap = sources();
    const gapRegistry = registrySource(gap).runtime_curriculum.corpus_expansion_registry;
    gapRegistry.admitted_corpus_ids = ["csp-tier2-rehearsal.v1"];
    gapRegistry.phases[1] = { ...gapRegistry.phases[1], status: "admitted", blocked_reasons: [],
      admission_contract: { ...overlapRegistry.phases[0].admission_contract,
        corpus_id: "csp-tier2-rehearsal.v1", content_version: "csp-tier2.rehearsal.1",
        action_namespace: "csp2", save_partition_id: "learning.corpus.csp-tier2-rehearsal.v1",
        word_ids: ["testword"] } };
    expect(() => compileContent(gap)).toThrow(/corpus_expansion_registry|reviewed identities/);
  });
});
