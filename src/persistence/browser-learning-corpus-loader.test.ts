import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import generatedPackageBundle from "../generated/learning-corpus-packages.v0.1.json";
import { computeRuntimeCorpusExpansionRegistryDigest } from
  "../content/runtime-corpus-expansion-registry";
import { computeRuntimeLearningCorpusCatalogDigest } from
  "../content/runtime-learning-corpus-catalog";
import { computeRuntimeLearningCorpusPackageBundleDigest } from
  "../content/runtime-learning-corpus-package-bundle";
import {
  computeRuntimeLearningCorpusPackageDigest,
  computeRuntimeLearningCorpusSemanticDigest,
  type RuntimeLearningCorpusWord,
} from "../content/runtime-learning-corpus-package";
import {
  createExtensionLearningBridge,
  createExtensionLearningSession,
  extensionLearningAuthority,
  extensionLearningEnvironmentFingerprint,
} from "../testing/extension-learning-fixture";
import { loadBrowserLearningCorpusAdapter } from "./browser-learning-corpus-loader";
import type { LocalStorageLike } from "./browser-game-session-wal";
import type { ExtensionLearningRuntimePort } from "../learning/extension-learning-runtime";
import type { GameSessionRuntimeBridge } from "../runtime/game-session-bridge";
import { bootstrapBrowserPrologue, persistBrowserPrologueCheckpoint } from
  "./browser-prologue-persistence";

const CORPUS_ID = "csp-tier1-rehearsal.v1";
const VERSION = "csp-tier1.rehearsal.1";
const RECEIPTS = { semantic: "review.semantic.csp1.v1", glyph: "review.glyph.csp1.v1" } as const;

class MemoryStorage implements LocalStorageLike {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

function admittedArtifacts(): { artifact: any; packageBundle: any } {
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
    assetBindings: { glyphAssetId: "glyph.csp1.testword.v1" },
  };
  const semantic = {
    schemaVersion: "tokipona.runtime-learning-corpus.v0.2" as const,
    phaseId: "csp-tier1-remainder" as const, corpusId: CORPUS_ID, contentVersion: VERSION,
    actionNamespace: "csp1", savePartitionId: `learning.corpus.${CORPUS_ID}`,
    saveSchemaVersion: "tokipona.learning-corpus-partition.v0.2" as const,
    canonicalWordKey: "latin_word_id" as const, wordIds: ["testword"], words: { testword: word },
  };
  const packageBody = { ...semantic, semanticDigest: computeRuntimeLearningCorpusSemanticDigest(semantic),
    reviewReceiptIds: RECEIPTS };
  const pkg = { ...packageBody, sourceDigest: computeRuntimeLearningCorpusPackageDigest(packageBody) };
  const artifact = structuredClone(generated) as any;
  const registry = artifact.corpusExpansionRegistry;
  registry.admittedCorpusIds = [CORPUS_ID];
  registry.phases[0] = { ...registry.phases[0], status: "admitted", blockedReasons: [],
    admissionContract: { schemaVersion: "tokipona.learning-corpus-admission.v0.1",
      corpusId: CORPUS_ID, contentVersion: VERSION, actionNamespace: "csp1",
      savePartitionId: `learning.corpus.${CORPUS_ID}`,
      saveSchemaVersion: "tokipona.learning-corpus-partition.v0.2", packageDigest: pkg.sourceDigest,
      semanticDigest: pkg.semanticDigest, wordIds: ["testword"], reviewReceiptIds: RECEIPTS } };
  const registryBody = Object.fromEntries(Object.entries(registry)
    .filter(([key]) => key !== "sourceDigest"));
  registry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(registryBody);
  const catalogBody = { schemaVersion: "tokipona.runtime-learning-corpus-catalog.v0.2",
    registryId: registry.registryId, admittedCorpusIds: [CORPUS_ID],
    packageDescriptors: [{ phaseId: pkg.phaseId, corpusId: pkg.corpusId,
      packageDigest: pkg.sourceDigest, semanticDigest: pkg.semanticDigest }] };
  artifact.learningCorpusCatalog = { ...catalogBody,
    sourceDigest: computeRuntimeLearningCorpusCatalogDigest(catalogBody) };
  const packageBundleBody = {
    schemaVersion: "tokipona.runtime-learning-corpus-package-bundle.v0.1",
    registryId: registry.registryId, admittedCorpusIds: [CORPUS_ID], packages: [pkg],
  };
  return { artifact, packageBundle: { ...packageBundleBody,
    sourceDigest: computeRuntimeLearningCorpusPackageBundleDigest(packageBundleBody) } };
}

describe("browser learning corpus lazy loader", () => {
  it("builds the full durable adapter only for a verified admitted catalog", () => {
    const { artifact, packageBundle } = admittedArtifacts();
    const adapter = loadBrowserLearningCorpusAdapter(artifact, packageBundle);
    const initial = adapter.create("player.extension.loader");
    expect(initial.admittedCorpusIds).toEqual([CORPUS_ID]);
    const bridge = createExtensionLearningBridge(
      createExtensionLearningSession("player.extension.loader", "discover"));
    const initialView = adapter.view(initial, "player.extension.loader", bridge,
      "scene.valley.settlement");
    expect(initialView).toMatchObject({ enabled: true, runtimeAuthorityAvailable: true,
      admittedCorpusCount: 1, completedWordCount: 0, totalWordCount: 1 });
    expect(initialView.corpora[0]?.words[0]?.actions.find((action) => action.kind === "discover"))
      .toMatchObject({ available: true, completed: false, prerequisitesSatisfied: true,
        inAuthorityScene: true, inRange: true });
    const first = adapter.commit(initial, "player.extension.loader", CORPUS_ID,
      "csp1.testword.discover", bridge);
    expect(first.result).toMatchObject({ applied: true, duplicate: false, reason: "applied" });
    const duplicate = adapter.commit(first.save, "player.extension.loader", CORPUS_ID,
      "csp1.testword.discover", createExtensionLearningBridge(
        createExtensionLearningSession("player.extension.loader", "discover")));
    expect(duplicate.result).toMatchObject({ applied: false, duplicate: true, reason: "duplicate" });
    const postView = adapter.view(first.save, "player.extension.loader", bridge,
      "scene.valley.settlement");
    expect(postView.corpora[0]?.words[0]?.actions.find((action) => action.kind === "discover"))
      .toMatchObject({ available: false, completed: true });
    expect(postView.corpora[0]?.words[0]?.actions.find((action) => action.kind === "attune"))
      .toMatchObject({ available: false, completed: false, prerequisitesSatisfied: true,
        inAuthorityScene: true, inRange: false });
  });

  it("rejects empty and tampered catalogs before browser bootstrap", () => {
    expect(() => loadBrowserLearningCorpusAdapter(generated, generatedPackageBundle))
      .toThrow(/empty catalog/);
    const forged = admittedArtifacts();
    forged.packageBundle.packages[0].words.testword.actions[0].actionId = "forged";
    const packageBundleBody = Object.fromEntries(Object.entries(forged.packageBundle)
      .filter(([key]) => key !== "sourceDigest"));
    forged.packageBundle.sourceDigest =
      computeRuntimeLearningCorpusPackageBundleDigest(packageBundleBody);
    expect(() => loadBrowserLearningCorpusAdapter(forged.artifact, forged.packageBundle))
      .toThrow(/digest mismatch/);
  });

  it("projects and advances the exact five-action prerequisite chain", () => {
    const { artifact, packageBundle } = admittedArtifacts();
    const adapter = loadBrowserLearningCorpusAdapter(artifact, packageBundle);
    const playerSaveId = "player.extension.chain";
    let save = adapter.create(playerSaveId);
    const premature = adapter.commit(save, playerSaveId, CORPUS_ID, "csp1.testword.context_0",
      createExtensionLearningBridge(createExtensionLearningSession(playerSaveId, "context_0")));
    expect(premature.result).toMatchObject({ applied: false, reason: "prerequisite_missing" });
    for (const kind of ["discover", "attune", "context_0", "context_1", "repair"] as const) {
      const bridge = createExtensionLearningBridge(createExtensionLearningSession(playerSaveId, kind));
      const committed = adapter.commit(save, playerSaveId, CORPUS_ID, `csp1.testword.${kind}`, bridge);
      expect(committed.result).toMatchObject({ applied: true, duplicate: false, reason: "applied" });
      save = committed.save;
    }
    const final = adapter.view(save, playerSaveId,
      createExtensionLearningBridge(createExtensionLearningSession(playerSaveId, "repair")),
      "scene.valley.settlement");
    expect(final).toMatchObject({ completedWordCount: 1, totalWordCount: 1 });
    expect(final.corpora[0]?.words[0]).toMatchObject({ currentState: "produced", completed: true });
    expect(final.corpora[0]?.words[0]?.actions.every((candidate) => candidate.completed)).toBe(true);
  });

  it("persists and reloads an admitted partition through companion-first bootstrap", () => {
    const { artifact, packageBundle } = admittedArtifacts();
    const adapter = loadBrowserLearningCorpusAdapter(artifact, packageBundle);
    const storage = new MemoryStorage();
    const keys = { checkpointKey: "extension.primary", companionKey: "extension.companion" };
    storage.setItem(keys.checkpointKey, JSON.stringify(
      createExtensionLearningSession("player.extension.browser", "discover").toSave()));
    const first = bootstrapBrowserPrologue(storage, keys, () => "player.extension.browser", adapter);
    const firstPort: ExtensionLearningRuntimePort = Object.freeze({
      read: (bridge: GameSessionRuntimeBridge | null, activeSceneId: string) =>
        first.coordinator.readExtensionLearningView(bridge, activeSceneId),
      commit: (corpusId: string, actionId: string, bridge: GameSessionRuntimeBridge) =>
        first.coordinator.commitExtensionLearningAction(corpusId, actionId, bridge),
    });
    first.flow.attachExtensionLearningRuntimePort(firstPort);
    expect(first.flow.extensionLearningView()).toMatchObject({
      enabled: true, runtimeAuthorityAvailable: true, completedWordCount: 0,
    });
    expect(first.flow.performExtensionLearningAction(CORPUS_ID, "csp1.testword.discover"))
      .toMatchObject({ accepted: true, result: { applied: true, duplicate: false } });
    persistBrowserPrologueCheckpoint(storage, keys, first);

    const reloaded = bootstrapBrowserPrologue(storage, keys, () => "must-not-create", adapter);
    const reloadedPort: ExtensionLearningRuntimePort = Object.freeze({
      read: (bridge: GameSessionRuntimeBridge | null, activeSceneId: string) =>
        reloaded.coordinator.readExtensionLearningView(bridge, activeSceneId),
      commit: (corpusId: string, actionId: string, bridge: GameSessionRuntimeBridge) =>
        reloaded.coordinator.commitExtensionLearningAction(corpusId, actionId, bridge),
    });
    reloaded.flow.attachExtensionLearningRuntimePort(reloadedPort);
    const collection = reloaded.coordinator.readExtensionLearningCollection();
    expect(collection.partitions[0]!.learning.words.testword).toMatchObject({
      discoveryState: "discovered",
    });
    expect(reloaded.flow.performExtensionLearningAction(CORPUS_ID, "csp1.testword.discover"))
      .toMatchObject({ accepted: true, result: { applied: false, duplicate: true } });
  });
});
