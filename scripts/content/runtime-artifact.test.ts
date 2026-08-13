import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import type { ContentSource } from "../../src/content/types";
import generatedRuntimeText from "../../src/generated/content-runtime.v0.1.json?raw";
import {
  assertRuntimeArtifactCurrent,
  buildRuntimeContentArtifact,
  serializeRuntimeContentArtifact,
} from "./runtime-artifact";

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

describe("runtime content artifact generator", () => {
  it("matches the checked-in generated artifact byte for byte", () => {
    const expected = serializeRuntimeContentArtifact(
      buildRuntimeContentArtifact(compileContent(repositorySources())),
    );
    expect(() => assertRuntimeArtifactCurrent(generatedRuntimeText, expected)).not.toThrow();
  });

  it("fails the check when the generated artifact is stale", () => {
    const expected = serializeRuntimeContentArtifact(
      buildRuntimeContentArtifact(compileContent(repositorySources())),
    );
    expect(() => assertRuntimeArtifactCurrent(`${generatedRuntimeText} `, expected)).toThrowError(
      /Generated runtime content is stale/,
    );
  });

  it("changes the source digest after a valid authoring change", () => {
    const sources = repositorySources();
    const original = buildRuntimeContentArtifact(compileContent(sources));
    const lengthSource = sources.find((source) => source.path.endsWith("length-profiles.v0.1.yaml"));
    if (!lengthSource || typeof lengthSource.data !== "object" || lengthSource.data === null) {
      throw new Error("Length source fixture is unavailable.");
    }
    (lengthSource.data as Record<string, unknown>).content_version = "chapter-01.4-test";
    const changed = buildRuntimeContentArtifact(compileContent(sources));

    expect(changed.sourceDigest).not.toBe(original.sourceDigest);
    expect(() =>
      assertRuntimeArtifactCurrent(
        serializeRuntimeContentArtifact(original),
        serializeRuntimeContentArtifact(changed),
      )
    ).toThrowError(/stale/);
  });
});
