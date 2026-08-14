import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import { readRuntimeCorpusExpansionRegistry } from
  "../../src/content/runtime-corpus-expansion-registry";
import type { ContentSource } from "../../src/content/types";
import { buildRuntimeContentArtifact } from "./runtime-artifact";

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

describe("post-pu120 corpus expansion projector", () => {
  it("projects a reviewed prefix without mutating the pu-120 partition", () => {
    const all = sources();
    const registry = registrySource(all).runtime_curriculum.corpus_expansion_registry;
    registry.admitted_corpus_ids = ["csp-tier1-rehearsal.v1"];
    registry.phases[0] = {
      ...registry.phases[0],
      status: "admitted",
      blocked_reasons: [],
      admission_contract: {
        schema_version: "tokipona.learning-corpus-admission.v0.1",
        corpus_id: "csp-tier1-rehearsal.v1",
        content_version: "csp-tier1.rehearsal.1",
        action_namespace: "csp1",
        save_partition_id: "learning.corpus.csp-tier1-rehearsal.v1",
        save_schema_version: "tokipona.learning-corpus-partition.v0.1",
        package_digest: `sha256:${"1".repeat(64)}`,
        semantic_digest: `sha256:${"2".repeat(64)}`,
        word_ids: ["testword"],
        review_receipt_ids: {
          semantic: "review.semantic.csp1.v1",
          pronunciation: "review.pronunciation.csp1.v1",
          glyph: "review.glyph.csp1.v1",
        },
      },
    };
    const projected = readRuntimeCorpusExpansionRegistry(
      buildRuntimeContentArtifact(compileContent(all)),
    );
    expect(projected.baseCorpus.corpusId).toBe("pu-120");
    expect(projected.admittedCorpusIds).toEqual(["csp-tier1-rehearsal.v1"]);
    expect(projected.phases[0]).toMatchObject({ status: "admitted",
      admissionContract: { actionNamespace: "csp1", wordIds: ["testword"] } });
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
        save_schema_version: "tokipona.learning-corpus-partition.v0.1",
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
