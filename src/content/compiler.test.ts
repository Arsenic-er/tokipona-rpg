import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileContent, ContentValidationError, createSerializableManifestIndex } from "./compiler";
import type { ContentSource } from "./types";

const rawRepositoryContent = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(rawRepositoryContent).map(([path, raw]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
  }));
}

function mutableSource(sources: ContentSource[], suffix: string): Record<string, unknown> {
  const source = sources.find((candidate) => candidate.path.endsWith(suffix));
  if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) {
    throw new Error(`Missing object source ${suffix}`);
  }
  return source.data as Record<string, unknown>;
}

function objectArray(object: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = object[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value as Array<Record<string, unknown>>;
}

describe("content compiler", () => {
  it("compiles every repository YAML/JSON source into typed indexes", () => {
    const manifest = compileContent(repositorySources());

    expect(Object.keys(manifest.sources)).toHaveLength(Object.keys(rawRepositoryContent).length);
    expect(Object.keys(manifest.indexes.words)).toHaveLength(14);
    expect(Object.keys(manifest.indexes.glyphs)).toHaveLength(120);
    expect(Object.keys(manifest.indexes.p0Words)).toHaveLength(12);
    expect(manifest.indexes.tasks.ch01_length_cistern).toBeDefined();
    expect(manifest.indexes.attackSignatures["attack.water.forceful_motion.v0.1"]).toBeDefined();

    const index = createSerializableManifestIndex(manifest);
    expect(index.schemaVersion).toBe("tokipona.content-index.v0.1");
    expect(index.ids.words).toContain("word.telo");
    expect(JSON.stringify(index)).not.toContain("prototype_activation_mp");
  });

  it("fails closed when a referenced file does not exist", () => {
    const sources = repositorySources();
    mutableSource(sources, "chapters/ch01-world-literacy-prologue.v0.1.yaml").region_ref =
      "../world/regions/does-not-exist.v0.1.yaml";

    expect(() => compileContent(sources)).toThrowError(ContentValidationError);
    try {
      compileContent(sources);
    } catch (error) {
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "ref.file_missing" })]),
      );
    }
  });

  it("rejects duplicate IDs in authored collections", () => {
    const sources = repositorySources();
    const lexicon = mutableSource(sources, "spells/single-word-spells.v0.1.yaml");
    const entries = objectArray(lexicon, "entries");
    entries.push(structuredClone(entries[0] as Record<string, unknown>));

    expect(() => compileContent(sources)).toThrowError(/duplicate ID word\.telo/);
  });

  it("rejects out-of-range numeric gameplay values", () => {
    const sources = repositorySources();
    const lexicon = mutableSource(sources, "spells/single-word-spells.v0.1.yaml");
    const first = objectArray(lexicon, "entries")[0];
    const world = first?.world as Record<string, unknown>;
    const cost = world.cost as Record<string, unknown>;
    cost.prototype_activation_mp = -1;

    expect(() => compileContent(sources)).toThrowError(/cannot be negative/);
  });

  it("rejects missing cross-domain IDs", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    const enabled = task.enabled_content as Record<string, unknown>;
    enabled.word_ids = ["word.telo", "word.not_real"];

    expect(() => compileContent(sources)).toThrowError(/unknown word word\.not_real/);
  });

  it("rejects malformed content versions", () => {
    const sources = repositorySources();
    mutableSource(sources, "language/p0-curriculum.v0.1.yaml").content_version = "";

    expect(() => compileContent(sources)).toThrowError(/version\.invalid/);
  });
});
