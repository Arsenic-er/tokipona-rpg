import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import {
  computeRuntimeCorpusExpansionRegistryDigest,
  readRuntimeCorpusExpansionRegistry,
} from "../content/runtime-corpus-expansion-registry";
import {
  computeRuntimeLearningCorpusPackageDigest,
  computeRuntimeLearningCorpusSemanticDigest,
  readRuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusWord,
} from "../content/runtime-learning-corpus-package";
import {
  applyLearningCorpusCollectionAction,
  computeLearningCorpusPartitionCollectionIntegrity,
  createLearningCorpusPartitionCollectionState,
  isVerifiedLearningCorpusPartitionCollectionState,
  readLearningCorpusPartitionCollectionState,
  reconcileLearningCorpusPartitionCollectionState,
  resolveLearningCorpusPartitionState,
  toLearningCorpusPartitionCollectionSave,
  verifyRuntimeLearningCorpusSet,
} from "./corpus-partition-collection";

type PhaseId = "csp-tier1-remainder" | "csp-tier2";
type CorpusSpec = Readonly<{
  phaseId: PhaseId;
  corpusId: string;
  contentVersion: string;
  actionNamespace: string;
  wordId: string;
  glyphVersion?: string;
}>;

const FIRST: CorpusSpec = {
  phaseId: "csp-tier1-remainder",
  corpusId: "csp-tier1-rehearsal.v1",
  contentVersion: "csp-tier1.rehearsal.1",
  actionNamespace: "csp1",
  wordId: "testword",
};
const SECOND: CorpusSpec = {
  phaseId: "csp-tier2",
  corpusId: "csp-tier2-rehearsal.v1",
  contentVersion: "csp-tier2.rehearsal.1",
  actionNamespace: "csp2",
  wordId: "secondword",
};

function packageCandidate(spec: CorpusSpec): any {
  const action = (kind: "discover" | "attune" | "context_0" | "context_1" | "repair",
    evidenceType: "glyph_discovered" | "glyph_attunement_completed" |
      "active_retrieval_submitted" | "repair_completed",
    promptLevel: 0 | 1 | null): RuntimeLearningCorpusWord["actions"][number] => ({
    kind,
    actionId: `${spec.actionNamespace}.${spec.wordId}.${kind}`,
    evidenceType,
    taskFamilyId: kind === "discover" || kind === "attune" ? null :
      `${spec.actionNamespace}.${spec.wordId}.${kind}.family`,
    environmentFingerprint: kind === "discover" || kind === "attune" ? null :
      `scene.test:${spec.wordId}:${kind}`,
    promptLevel,
    semanticFacets: kind === "discover" || kind === "attune" ? [] : [`${spec.wordId}.facet`],
  });
  const word: RuntimeLearningCorpusWord = {
    wordId: spec.wordId,
    targetState: "produced",
    semanticFacets: [`${spec.wordId}.facet`],
    actions: [
      action("discover", "glyph_discovered", null),
      action("attune", "glyph_attunement_completed", null),
      action("context_0", "active_retrieval_submitted", 0),
      action("context_1", "active_retrieval_submitted", 1),
      action("repair", "repair_completed", 1),
    ],
    assetBindings: {
      pronunciationAssetId: `audio.pronunciation.${spec.wordId}.v1`,
      glyphAssetId: `glyph.${spec.actionNamespace}.${spec.wordId}.${spec.glyphVersion ?? "v1"}`,
    },
  };
  const semantic = {
    schemaVersion: "tokipona.runtime-learning-corpus.v0.1" as const,
    phaseId: spec.phaseId,
    corpusId: spec.corpusId,
    contentVersion: spec.contentVersion,
    actionNamespace: spec.actionNamespace,
    savePartitionId: `learning.corpus.${spec.corpusId}`,
    saveSchemaVersion: "tokipona.learning-corpus-partition.v0.1" as const,
    canonicalWordKey: "latin_word_id" as const,
    wordIds: [spec.wordId],
    words: { [spec.wordId]: word },
  };
  const payload = {
    ...semantic,
    semanticDigest: computeRuntimeLearningCorpusSemanticDigest(semantic),
    reviewReceiptIds: {
      semantic: `review.semantic.${spec.actionNamespace}.v1`,
      pronunciation: `review.pronunciation.${spec.actionNamespace}.v1`,
      glyph: `review.glyph.${spec.actionNamespace}.v1`,
    },
  };
  return { ...payload, sourceDigest: computeRuntimeLearningCorpusPackageDigest(payload) };
}

function admittedRuntime(...candidates: any[]) {
  const artifact = structuredClone(generated) as any;
  artifact.corpusExpansionRegistry.admittedCorpusIds = candidates.map((candidate) => candidate.corpusId);
  candidates.forEach((candidate, index) => {
    artifact.corpusExpansionRegistry.phases[index] = {
      ...artifact.corpusExpansionRegistry.phases[index],
      status: "admitted",
      blockedReasons: [],
      admissionContract: {
        schemaVersion: "tokipona.learning-corpus-admission.v0.1",
        corpusId: candidate.corpusId,
        contentVersion: candidate.contentVersion,
        actionNamespace: candidate.actionNamespace,
        savePartitionId: candidate.savePartitionId,
        saveSchemaVersion: candidate.saveSchemaVersion,
        packageDigest: candidate.sourceDigest,
        semanticDigest: candidate.semanticDigest,
        wordIds: candidate.wordIds,
        reviewReceiptIds: candidate.reviewReceiptIds,
      },
    };
  });
  const payload = Object.fromEntries(Object.entries(artifact.corpusExpansionRegistry)
    .filter(([key]) => key !== "sourceDigest"));
  artifact.corpusExpansionRegistry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(payload);
  const registry = readRuntimeCorpusExpansionRegistry(artifact);
  const packages = candidates.map((candidate) => readRuntimeLearningCorpusPackage(registry, candidate));
  return verifyRuntimeLearningCorpusSet(registry, packages);
}

function resignCollection(candidate: any): any {
  const body = Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "integrity"));
  candidate.integrity = computeLearningCorpusPartitionCollectionIntegrity(body);
  return candidate;
}

describe("versioned learning corpus partition collections", () => {
  it("persists the current zero-extension registry as an explicit empty collection", () => {
    const runtime = verifyRuntimeLearningCorpusSet(readRuntimeCorpusExpansionRegistry(generated), []);
    const state = createLearningCorpusPartitionCollectionState(runtime, "player.collection.empty");
    expect(isVerifiedLearningCorpusPartitionCollectionState(state)).toBe(true);
    expect(state).toMatchObject({ admittedCorpusIds: [], partitions: [] });
    const save = toLearningCorpusPartitionCollectionSave(state);
    expect(readLearningCorpusPartitionCollectionState(runtime, structuredClone(save))).toEqual(state);
  });

  it("applies independent corpus actions in registry order and reloads both partitions", () => {
    const first = packageCandidate(FIRST), second = packageCandidate(SECOND);
    const runtime = admittedRuntime(first, second);
    let state = createLearningCorpusPartitionCollectionState(runtime, "player.collection.two");
    const firstResult = applyLearningCorpusCollectionAction(runtime, state, FIRST.corpusId,
      `${FIRST.actionNamespace}.${FIRST.wordId}.discover`);
    expect(firstResult).toMatchObject({ applied: true, reason: "applied" });
    state = firstResult.state;
    const secondResult = applyLearningCorpusCollectionAction(runtime, state, SECOND.corpusId,
      `${SECOND.actionNamespace}.${SECOND.wordId}.discover`);
    expect(secondResult).toMatchObject({ applied: true, reason: "applied" });
    state = secondResult.state;

    const reloaded = readLearningCorpusPartitionCollectionState(runtime,
      structuredClone(toLearningCorpusPartitionCollectionSave(state)));
    expect(reloaded.admittedCorpusIds).toEqual([FIRST.corpusId, SECOND.corpusId]);
    expect(resolveLearningCorpusPartitionState(reloaded, FIRST.corpusId)?.learning.words)
      .toHaveProperty(FIRST.wordId);
    expect(resolveLearningCorpusPartitionState(reloaded, SECOND.corpusId)?.learning.words)
      .toHaveProperty(SECOND.wordId);
    expect(applyLearningCorpusCollectionAction(runtime, reloaded, "unreviewed-corpus",
      "forged.action").reason).toBe("unknown_corpus");
  });

  it("requires exact verified package coverage and stable registry ordering", () => {
    const firstCandidate = packageCandidate(FIRST), secondCandidate = packageCandidate(SECOND);
    const runtime = admittedRuntime(firstCandidate, secondCandidate);
    expect(() => verifyRuntimeLearningCorpusSet(runtime.registry, [runtime.packages[1]!, runtime.packages[0]!]))
      .toThrow(/exactly cover/);
    expect(() => verifyRuntimeLearningCorpusSet(runtime.registry, [runtime.packages[0]!]))
      .toThrow(/exactly cover/);
    expect(() => verifyRuntimeLearningCorpusSet(runtime.registry,
      [structuredClone(runtime.packages[0]) as RuntimeLearningCorpusPackage, runtime.packages[1]!]))
      .toThrow(/exactly cover/);
  });

  it("adds only a newly admitted suffix while preserving an existing semantic partition", () => {
    const firstCandidate = packageCandidate(FIRST), secondCandidate = packageCandidate(SECOND);
    const firstRuntime = admittedRuntime(firstCandidate);
    let firstState = createLearningCorpusPartitionCollectionState(firstRuntime, "player.collection.upgrade");
    firstState = applyLearningCorpusCollectionAction(firstRuntime, firstState, FIRST.corpusId,
      `${FIRST.actionNamespace}.${FIRST.wordId}.discover`).state;
    const oldSave = toLearningCorpusPartitionCollectionSave(firstState);

    const expandedRuntime = admittedRuntime(firstCandidate, secondCandidate);
    const reconciled = reconcileLearningCorpusPartitionCollectionState(expandedRuntime, oldSave,
      "player.collection.upgrade");
    expect(reconciled.admittedCorpusIds).toEqual([FIRST.corpusId, SECOND.corpusId]);
    expect(resolveLearningCorpusPartitionState(reconciled, FIRST.corpusId)?.learning.words)
      .toHaveProperty(FIRST.wordId);
    expect(resolveLearningCorpusPartitionState(reconciled, SECOND.corpusId)?.learning.words)
      .toEqual({});
  });

  it("preserves progress across asset-only reissue and rejects collection identity forgery", () => {
    const firstCandidate = packageCandidate(FIRST);
    const firstRuntime = admittedRuntime(firstCandidate);
    let state = createLearningCorpusPartitionCollectionState(firstRuntime, "player.collection.assets");
    state = applyLearningCorpusCollectionAction(firstRuntime, state, FIRST.corpusId,
      `${FIRST.actionNamespace}.${FIRST.wordId}.discover`).state;
    const save = toLearningCorpusPartitionCollectionSave(state);

    const revisedCandidate = packageCandidate({ ...FIRST, glyphVersion: "v2" });
    expect(revisedCandidate.sourceDigest).not.toBe(firstCandidate.sourceDigest);
    expect(revisedCandidate.semanticDigest).toBe(firstCandidate.semanticDigest);
    const revisedRuntime = admittedRuntime(revisedCandidate);
    expect(readLearningCorpusPartitionCollectionState(revisedRuntime, save).partitions[0]?.learning.words)
      .toHaveProperty(FIRST.wordId);

    const foreign = structuredClone(save) as any;
    foreign.playerSaveId = "player.collection.foreign";
    expect(() => reconcileLearningCorpusPartitionCollectionState(revisedRuntime,
      resignCollection(foreign), "player.collection.assets")).toThrow(/reconciled/);

    const missing = structuredClone(save) as any;
    missing.partitions = [];
    expect(() => readLearningCorpusPartitionCollectionState(revisedRuntime,
      resignCollection(missing))).toThrow(/partitions are incomplete/);
  });
});
