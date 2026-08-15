import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import {
  computeRuntimeCorpusExpansionRegistryDigest,
  readRuntimeCorpusExpansionRegistry,
} from "./runtime-corpus-expansion-registry";
import {
  computeRuntimeLearningCorpusPackageDigest,
  computeRuntimeLearningCorpusSemanticDigest,
  isVerifiedRuntimeLearningCorpusPackage,
  readRuntimeLearningCorpusPackage,
  readRuntimeLearningCorpusPackageCandidate,
  type RuntimeLearningCorpusWord,
} from "./runtime-learning-corpus-package";
import {
  computeLearningCorpusPartitionIntegrity,
  applyLearningCorpusPartitionAction,
  createLearningCorpusPartitionState,
  isVerifiedLearningCorpusPartitionState,
  isLearningCorpusWordComplete,
  readLearningCorpusPartitionState,
  toLearningCorpusPartitionSave,
} from "../learning/corpus-partition";

const CORPUS_ID = "csp-tier1-rehearsal.v1";
const CONTENT_VERSION = "csp-tier1.rehearsal.1";
const ACTION_NAMESPACE = "csp1";
const WORD_ID = "testword";
const REVIEW_RECEIPTS = {
  semantic: "review.semantic.csp1.v1",
  pronunciation: "review.pronunciation.csp1.v1",
  glyph: "review.glyph.csp1.v1",
} as const;

function packageCandidate(glyphAssetId = "glyph.csp1.testword.v1"): any {
  const word: RuntimeLearningCorpusWord = {
    wordId: WORD_ID,
    targetState: "produced",
    semanticFacets: ["test-semantic-facet"],
    actions: [
      { kind: "discover", actionId: `${ACTION_NAMESPACE}.${WORD_ID}.discover`,
        evidenceType: "glyph_discovered", taskFamilyId: null, environmentFingerprint: null,
        promptLevel: null, semanticFacets: [] },
      { kind: "attune", actionId: `${ACTION_NAMESPACE}.${WORD_ID}.attune`,
        evidenceType: "glyph_attunement_completed", taskFamilyId: null,
        environmentFingerprint: null, promptLevel: null, semanticFacets: [] },
      { kind: "context_0", actionId: `${ACTION_NAMESPACE}.${WORD_ID}.context_0`,
        evidenceType: "active_retrieval_submitted", taskFamilyId: "csp1.testword.family0",
        environmentFingerprint: "scene.test:target.primary", promptLevel: 0,
        semanticFacets: ["test-semantic-facet"] },
      { kind: "context_1", actionId: `${ACTION_NAMESPACE}.${WORD_ID}.context_1`,
        evidenceType: "active_retrieval_submitted", taskFamilyId: "csp1.testword.family1",
        environmentFingerprint: "scene.test:target.reinforcement", promptLevel: 1,
        semanticFacets: ["test-semantic-facet"] },
      { kind: "repair", actionId: `${ACTION_NAMESPACE}.${WORD_ID}.repair`,
        evidenceType: "repair_completed", taskFamilyId: "csp1.testword.repair",
        environmentFingerprint: "scene.test:target.repair", promptLevel: 1,
        semanticFacets: ["test-semantic-facet"] },
    ],
    assetBindings: {
      pronunciationAssetId: "audio.pronunciation.testword.v1",
      glyphAssetId,
    },
  };
  const semanticSource = {
    schemaVersion: "tokipona.runtime-learning-corpus.v0.1" as const,
    phaseId: "csp-tier1-remainder" as const,
    corpusId: CORPUS_ID,
    contentVersion: CONTENT_VERSION,
    actionNamespace: ACTION_NAMESPACE,
    savePartitionId: `learning.corpus.${CORPUS_ID}`,
    saveSchemaVersion: "tokipona.learning-corpus-partition.v0.1" as const,
    canonicalWordKey: "latin_word_id" as const,
    wordIds: [WORD_ID],
    words: { [WORD_ID]: word },
  };
  const payload = {
    ...semanticSource,
    semanticDigest: computeRuntimeLearningCorpusSemanticDigest(semanticSource),
    reviewReceiptIds: REVIEW_RECEIPTS,
  };
  return { ...payload, sourceDigest: computeRuntimeLearningCorpusPackageDigest(payload) };
}

function admittedArtifact(pkg: any, wordIds: readonly string[] = [WORD_ID]): any {
  const artifact = structuredClone(generated) as any;
  const registry = artifact.corpusExpansionRegistry;
  registry.admittedCorpusIds = [CORPUS_ID];
  registry.phases[0] = {
    ...registry.phases[0],
    status: "admitted",
    blockedReasons: [],
    admissionContract: {
      schemaVersion: "tokipona.learning-corpus-admission.v0.1",
      corpusId: CORPUS_ID,
      contentVersion: CONTENT_VERSION,
      actionNamespace: ACTION_NAMESPACE,
      savePartitionId: `learning.corpus.${CORPUS_ID}`,
      saveSchemaVersion: "tokipona.learning-corpus-partition.v0.1",
      packageDigest: pkg.sourceDigest,
      semanticDigest: pkg.semanticDigest,
      wordIds,
      reviewReceiptIds: REVIEW_RECEIPTS,
    },
  };
  const payload = Object.fromEntries(Object.entries(registry).filter(([key]) => key !== "sourceDigest"));
  registry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(payload);
  return artifact;
}

function resignPackage(pkg: any): any {
  const payload = Object.fromEntries(Object.entries(pkg).filter(([key]) => key !== "sourceDigest"));
  pkg.sourceDigest = computeRuntimeLearningCorpusPackageDigest(payload);
  return pkg;
}

function resignPartition(save: any): any {
  const body = Object.fromEntries(Object.entries(save).filter(([key]) => key !== "integrity"));
  save.integrity = computeLearningCorpusPartitionIntegrity(body);
  return save;
}

describe("versioned extension learning corpus packages", () => {
  it("strictly validates content candidates without granting runtime admission", () => {
    const candidate = packageCandidate();
    const parsed = readRuntimeLearningCorpusPackageCandidate(candidate);
    expect(parsed.corpusId).toBe(CORPUS_ID);
    expect(isVerifiedRuntimeLearningCorpusPackage(parsed)).toBe(false);

    const wrongPhase = structuredClone(candidate);
    wrongPhase.phaseId = "invented-phase";
    resignPackage(wrongPhase);
    expect(() => readRuntimeLearningCorpusPackageCandidate(wrongPhase)).toThrow(/phaseId/);
  });

  it("keeps current pending phases unloadable", () => {
    const registry = readRuntimeCorpusExpansionRegistry(generated);
    expect(() => readRuntimeLearningCorpusPackage(registry, packageCandidate())).toThrow(/not admitted/);
  });

  it("loads only a reviewed package that exactly matches a contiguous admitted contract", () => {
    const candidate = packageCandidate();
    const registry = readRuntimeCorpusExpansionRegistry(admittedArtifact(candidate));
    const pkg = readRuntimeLearningCorpusPackage(registry, candidate);
    expect(isVerifiedRuntimeLearningCorpusPackage(pkg)).toBe(true);
    expect(pkg.wordIds).toEqual([WORD_ID]);
    expect(pkg.words[WORD_ID]!.actions.map((action) => action.actionId)).toEqual([
      "csp1.testword.discover", "csp1.testword.attune", "csp1.testword.context_0",
      "csp1.testword.context_1", "csp1.testword.repair",
    ]);
  });

  it("rejects overlap, protected namespace reuse, noncontiguous admission, and package drift", () => {
    const candidate = packageCandidate();
    const overlap = admittedArtifact(candidate, ["telo"]);
    expect(() => readRuntimeCorpusExpansionRegistry(overlap)).toThrow(/overlaps a prior corpus/);

    const namespace = admittedArtifact(candidate);
    namespace.corpusExpansionRegistry.phases[0].admissionContract.actionNamespace = "core120";
    const namespacePayload = Object.fromEntries(Object.entries(namespace.corpusExpansionRegistry)
      .filter(([key]) => key !== "sourceDigest"));
    namespace.corpusExpansionRegistry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(namespacePayload);
    expect(() => readRuntimeCorpusExpansionRegistry(namespace)).toThrow(/admission contract|protected identity/);

    const gap = admittedArtifact(candidate);
    gap.corpusExpansionRegistry.phases[0] = structuredClone(generated.corpusExpansionRegistry.phases[0]);
    gap.corpusExpansionRegistry.phases[1] = {
      ...gap.corpusExpansionRegistry.phases[1],
      status: "admitted",
      blockedReasons: [],
      admissionContract: gap.corpusExpansionRegistry.phases[0].admissionContract,
    };
    const gapPayload = Object.fromEntries(Object.entries(gap.corpusExpansionRegistry)
      .filter(([key]) => key !== "sourceDigest"));
    gap.corpusExpansionRegistry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(gapPayload);
    expect(() => readRuntimeCorpusExpansionRegistry(gap)).toThrow(/contiguous reviewed prefix|safely blocked/);

    const registry = readRuntimeCorpusExpansionRegistry(admittedArtifact(candidate));
    const drift = structuredClone(candidate);
    drift.words[WORD_ID].actions[2].environmentFingerprint = "scene.forged:target";
    resignPackage(drift);
    expect(() => readRuntimeLearningCorpusPackage(registry, drift)).toThrow(/semantic digest mismatch/);
  });

  it("stores expansion progress in an independent semantic partition", () => {
    const candidate = packageCandidate();
    const registry = readRuntimeCorpusExpansionRegistry(admittedArtifact(candidate));
    const pkg = readRuntimeLearningCorpusPackage(registry, candidate);
    const state = createLearningCorpusPartitionState(pkg, "player-save.test");
    expect(isVerifiedLearningCorpusPartitionState(state)).toBe(true);
    const save = toLearningCorpusPartitionSave(state);
    expect(readLearningCorpusPartitionState(pkg, JSON.parse(JSON.stringify(save)))).toEqual(state);

    const foreign = structuredClone(save) as any;
    foreign.learning.words.telo = {
      wordId: "telo", discoveryState: "unknown", attunementState: "locked", learningState: null,
      evidence: [], productionTaskFamilies: [], producedBaselineTaskFamilies: [],
      producedBaselineEnvironmentFingerprints: [], demonstratedSemanticFacets: [],
    };
    expect(() => readLearningCorpusPartitionState(pkg, resignPartition(foreign))).toThrow(/unknown word/);
  });

  it("applies the five semantic actions deterministically and replays them from the partition", () => {
    const candidate = packageCandidate();
    const registry = readRuntimeCorpusExpansionRegistry(admittedArtifact(candidate));
    const pkg = readRuntimeLearningCorpusPackage(registry, candidate);
    let state = createLearningCorpusPartitionState(pkg, "player-save.sequence");
    expect(applyLearningCorpusPartitionAction(pkg, state, "csp1.testword.repair").reason)
      .toBe("prerequisite_missing");
    for (const actionId of ["csp1.testword.discover", "csp1.testword.attune",
      "csp1.testword.context_0", "csp1.testword.context_1", "csp1.testword.repair"]) {
      const result = applyLearningCorpusPartitionAction(pkg, state, actionId);
      expect(result.reason).toBe("applied");
      state = result.state;
    }
    expect(isLearningCorpusWordComplete(pkg, state, WORD_ID)).toBe(true);
    const duplicate = applyLearningCorpusPartitionAction(pkg, state, "csp1.testword.context_1");
    expect(duplicate).toMatchObject({ applied: false, duplicate: true, reason: "duplicate" });
    const save = toLearningCorpusPartitionSave(state);
    const reloaded = readLearningCorpusPartitionState(pkg, JSON.parse(JSON.stringify(save)));
    expect(isLearningCorpusWordComplete(pkg, reloaded, WORD_ID)).toBe(true);
    expect(reloaded.learning.words[WORD_ID]!.learningState).toBe("produced");
  });

  it("rejects a re-signed forged evidence chain", () => {
    const candidate = packageCandidate();
    const registry = readRuntimeCorpusExpansionRegistry(admittedArtifact(candidate));
    const pkg = readRuntimeLearningCorpusPackage(registry, candidate);
    let state = createLearningCorpusPartitionState(pkg, "player-save.forgery");
    for (const actionId of ["csp1.testword.discover", "csp1.testword.attune",
      "csp1.testword.context_0"]) {
      state = applyLearningCorpusPartitionAction(pkg, state, actionId).state;
    }
    const forged = structuredClone(toLearningCorpusPartitionSave(state)) as any;
    forged.learning.words[WORD_ID].evidence[2].environmentFingerprint = "scene.forged:target";
    expect(() => readLearningCorpusPartitionState(pkg, resignPartition(forged)))
      .toThrow(/evidence identity/);
  });

  it("preserves partition progress when only reviewed asset bindings are reissued", () => {
    const firstCandidate = packageCandidate();
    const firstRegistry = readRuntimeCorpusExpansionRegistry(admittedArtifact(firstCandidate));
    const firstPackage = readRuntimeLearningCorpusPackage(firstRegistry, firstCandidate);
    const save = toLearningCorpusPartitionSave(
      createLearningCorpusPartitionState(firstPackage, "player-save.assets"),
    );

    const revisedCandidate = packageCandidate("glyph.csp1.testword.v2");
    expect(revisedCandidate.sourceDigest).not.toBe(firstCandidate.sourceDigest);
    expect(revisedCandidate.semanticDigest).toBe(firstCandidate.semanticDigest);
    const revisedRegistry = readRuntimeCorpusExpansionRegistry(admittedArtifact(revisedCandidate));
    const revisedPackage = readRuntimeLearningCorpusPackage(revisedRegistry, revisedCandidate);
    expect(readLearningCorpusPartitionState(revisedPackage, save).corpusSemanticDigest)
      .toBe(firstPackage.semanticDigest);
  });

  it("rejects unverified package lookalikes and re-signed partition identity changes", () => {
    const candidate = packageCandidate();
    const registry = readRuntimeCorpusExpansionRegistry(admittedArtifact(candidate));
    const pkg = readRuntimeLearningCorpusPackage(registry, candidate);
    expect(() => createLearningCorpusPartitionState(structuredClone(pkg), "player-save.test"))
      .toThrow(/not verified/);

    const save = structuredClone(toLearningCorpusPartitionSave(
      createLearningCorpusPartitionState(pkg, "player-save.test"),
    )) as any;
    save.corpusId = "csp-tier2-forged.v1";
    expect(() => readLearningCorpusPartitionState(pkg, resignPartition(save))).toThrow(/identity mismatch/);
  });
});
