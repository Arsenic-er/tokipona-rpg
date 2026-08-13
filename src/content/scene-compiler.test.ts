import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileContent, ContentValidationError } from "./compiler";
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

function mutableScene(sources: ContentSource[], suffix: string): Record<string, unknown> {
  const source = sources.find((candidate) => candidate.path.endsWith(suffix));
  if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) {
    throw new Error(`Missing scene fixture ${suffix}`);
  }
  return source.data as Record<string, unknown>;
}

function objectArray(object: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = object[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value as Array<Record<string, unknown>>;
}

function expectIssue(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as ContentValidationError).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  }
}

describe("scene content compiler", () => {
  it("compiles the canonical N00 through N04 scene documents as a multi-source content kind", () => {
    const manifest = compileContent(repositorySources());
    expect(manifest.byKind.scene).toHaveLength(5);
    expect(Object.keys(manifest.indexes.scenes).sort()).toEqual([
      "scene.valley.arrival_shelf",
      "scene.valley.service_channel",
      "scene.valley.settlement",
      "scene.valley.stream_section",
      "scene.valley.waterwheel",
    ]);
  });

  it("rejects an exit that names an unknown target entrance", () => {
    const sources = repositorySources();
    const arrival = mutableScene(sources, "scenes/valley-arrival-shelf.v0.1.yaml");
    objectArray(arrival, "exits")[0]!.target_entrance_id = "stream.not_real";
    expectIssue(() => compileContent(sources), "ref.missing");
  });

  it("rejects a scene without an explicit recovery entrance", () => {
    const sources = repositorySources();
    const arrival = mutableScene(sources, "scenes/valley-arrival-shelf.v0.1.yaml");
    for (const entrance of objectArray(arrival, "entrances")) entrance.recovery_entry = false;
    expectIssue(() => compileContent(sources), "scene.recovery_entrance_missing");
  });

  it("rejects duplicate scene IDs across separate scene documents", () => {
    const sources = repositorySources();
    const arrival = mutableScene(sources, "scenes/valley-arrival-shelf.v0.1.yaml");
    sources.push({
      path: "data/scenes/duplicate-arrival.v0.1.yaml",
      data: structuredClone(arrival),
    });
    expectIssue(() => compileContent(sources), "id.duplicate");
  });

  it("rejects a scene whose logical tile size is not 16px", () => {
    const sources = repositorySources();
    mutableScene(sources, "scenes/valley-stream-section.v0.1.yaml").tile_size_px = 8;
    expectIssue(() => compileContent(sources), "scene.tile_size");
  });

  it("rejects a scene without any non-magic route declaration", () => {
    const sources = repositorySources();
    const stream = mutableScene(sources, "scenes/valley-stream-section.v0.1.yaml");
    for (const route of objectArray(stream, "routes")) route.route_kind = "optional_magic";
    expectIssue(() => compileContent(sources), "scene.non_magic_route_missing");
  });
});
