import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "./compiler";
import {
  computeRuntimeCorpusExpansionRegistryDigest,
  CORPUS_EXPANSION_ADMISSION_REQUIREMENTS,
  CORPUS_EXPANSION_PHASE_IDS,
  isVerifiedRuntimeCorpusExpansionRegistry,
  readRuntimeCorpusExpansionRegistry,
  resolveRuntimeLearningCorpusPartition,
} from "./runtime-corpus-expansion-registry";
import type { ContentSource } from "./types";

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

function resign(artifact: unknown): unknown {
  const root = artifact as { corpusExpansionRegistry: Record<string, unknown> };
  const payload = Object.fromEntries(Object.entries(root.corpusExpansionRegistry)
    .filter(([key]) => key !== "sourceDigest"));
  root.corpusExpansionRegistry.sourceDigest = computeRuntimeCorpusExpansionRegistryDigest(payload);
  return root;
}

describe("post-pu120 corpus expansion registry", () => {
  it("admits only the immutable pu-120 partition while future phases remain blocked", () => {
    const registry = readRuntimeCorpusExpansionRegistry(generated);
    expect(isVerifiedRuntimeCorpusExpansionRegistry(registry)).toBe(true);
    expect(CORPUS_EXPANSION_ADMISSION_REQUIREMENTS).toEqual([
      "corpus_id", "content_version", "action_namespace", "save_partition",
      "reviewed_word_manifest", "semantic_review", "glyph_assets",
    ]);
    expect(registry.policies.extensionOrder).toEqual(CORPUS_EXPANSION_PHASE_IDS);
    expect(registry.admittedCorpusIds).toEqual([]);
    expect(registry.phases.map((phase) => phase.status)).toEqual([
      "pending_review", "pending_review", "pending_review",
    ]);
    expect(registry.phases.every((phase) => phase.admissionContract === null &&
      phase.blockedReasons.join("|") === CORPUS_EXPANSION_ADMISSION_REQUIREMENTS.join("|"))).toBe(true);
    expect(resolveRuntimeLearningCorpusPartition(registry, "pu-120")).toEqual({
      corpusId: "pu-120",
      learningContentVersion: "core-120.prologue-12",
      actionNamespace: "core120",
      savePartitionId: "learning.corpus.pu-120",
      saveSchemaVersion: "tokipona.core120-learning-campaign.v0.2",
      canonicalWordKey: "latin_word_id",
    });
    for (const phaseId of CORPUS_EXPANSION_PHASE_IDS) {
      expect(() => resolveRuntimeLearningCorpusPartition(registry, phaseId)).toThrow(/not admitted/);
    }
    expect(() => resolveRuntimeLearningCorpusPartition(registry, "ucsur:F1980")).toThrow(/not admitted/);
  });

  it("rejects checksum tampering and re-signed premature admission", () => {
    const checksum = structuredClone(generated) as any;
    checksum.corpusExpansionRegistry.phases[0].status = "admitted";
    expect(() => readRuntimeCorpusExpansionRegistry(checksum)).toThrow(/digest mismatch/);

    const admitted = structuredClone(generated) as any;
    admitted.corpusExpansionRegistry.admittedCorpusIds = ["invented-tier1"];
    expect(() => readRuntimeCorpusExpansionRegistry(resign(admitted))).toThrow(/do not match reviewed/);

    const partition = structuredClone(generated) as any;
    partition.corpusExpansionRegistry.baseCorpus.canonicalWordKey = "display_codepoint";
    expect(() => readRuntimeCorpusExpansionRegistry(resign(partition))).toThrow(/base partition/);

    const unknown = structuredClone(generated) as any;
    unknown.corpusExpansionRegistry.policies.runtimeOverride = true;
    expect(() => readRuntimeCorpusExpansionRegistry(resign(unknown))).toThrow(/unknown or missing/);
  });

  it("rejects unreviewed admission drift at content compile time", () => {
    const all = sources();
    const registry = registrySource(all).runtime_curriculum.corpus_expansion_registry;
    registry.admitted_corpus_ids = ["invented-tier1"];
    registry.phases[0].status = "admitted";
    try {
      compileContent(all);
      throw new Error("expected corpus expansion compile failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.corpus_expansion_registry" }),
      ]));
    }
  });

  it("does not let an unverified lookalike authorize a save partition", () => {
    const registry = readRuntimeCorpusExpansionRegistry(generated);
    const lookalike = structuredClone(registry);
    expect(isVerifiedRuntimeCorpusExpansionRegistry(lookalike)).toBe(false);
    expect(() => resolveRuntimeLearningCorpusPartition(lookalike, "pu-120")).toThrow(/not verified/);
  });
});
