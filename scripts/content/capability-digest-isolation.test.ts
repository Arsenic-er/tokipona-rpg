import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import type { ContentSource } from "../../src/content/types";
import { buildRuntimeContentArtifact } from "./runtime-artifact";

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

function mutableChapter(sources: ContentSource[]): Record<string, unknown> {
  const source = sources.find((entry) => entry.path.endsWith("ch01-world-literacy-prologue.v0.1.yaml"));
  if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) {
    throw new Error("chapter fixture unavailable");
  }
  return source.data as Record<string, unknown>;
}

describe("capability progression digest isolation", () => {
  it("does not change when an unrelated chapter field changes", () => {
    const sources = repositorySources();
    const before = buildRuntimeContentArtifact(compileContent(sources)).capabilityProgression.sourceDigest;
    mutableChapter(sources).status = "digest-isolation-test";
    const after = buildRuntimeContentArtifact(compileContent(sources)).capabilityProgression.sourceDigest;
    expect(after).toBe(before);
  });

  it("changes when a projected capacity value changes", () => {
    const sources = repositorySources();
    const before = buildRuntimeContentArtifact(compileContent(sources)).capabilityProgression.sourceDigest;
    const chapter = mutableChapter(sources) as {
      capacity_progression: { milestones: Array<{ milestone_id: string; resulting_state: Record<string, unknown> }> };
    };
    const milestone = chapter.capacity_progression.milestones.find(
      (entry) => entry.milestone_id === "pre_cistern_length_phrase",
    );
    if (!milestone) throw new Error("pre-cistern milestone unavailable");
    milestone.resulting_state.player_max_mp = 27;
    const after = buildRuntimeContentArtifact(compileContent(sources)).capabilityProgression.sourceDigest;
    expect(after).not.toBe(before);
  });
});
