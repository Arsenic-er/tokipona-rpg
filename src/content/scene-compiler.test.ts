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
  it("compiles the canonical N00 through N08 scene documents as a multi-source content kind", () => {
    const manifest = compileContent(repositorySources());
    expect(manifest.byKind.scene).toHaveLength(10);
    expect(Object.keys(manifest.indexes.scenes).sort()).toEqual([
      "scene.valley.arrival_shelf",
      "scene.valley.den_bypass",
      "scene.valley.high_cistern",
      "scene.valley.old_mine_threshold",
      "scene.valley.return_channel",
      "scene.valley.safe_range",
      "scene.valley.settlement",
      "scene.valley.stream_section",
      "scene.valley.underground_order_node",
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

  it("keeps N00/N01 navigation free of pre-hermit magic authority", () => {
    const manifest = compileContent(repositorySources());
    const arrival = manifest.indexes.scenes["scene.valley.arrival_shelf"] as Record<string, unknown>;
    const stream = manifest.indexes.scenes["scene.valley.stream_section"] as Record<string, unknown>;

    expect(objectArray(arrival, "routes").every((route) => route.route_kind === "non_magic")).toBe(true);
    expect(objectArray(arrival, "interactions").every((interaction) => interaction.optional_word_id === undefined))
      .toBe(true);
    expect(objectArray(stream, "routes").every((route) => route.route_kind === "non_magic")).toBe(true);
    expect(objectArray(stream, "interactions").filter((interaction) => interaction.optional_word_id !== undefined))
      .toEqual([expect.objectContaining({
        interaction_id: "stream.perform_low_mp_telo",
        verb: "perform_low_mp_telo",
        optional_word_id: "word.telo",
      })]);
  });

  it("rejects reintroducing a pre-hermit magic route or interaction", () => {
    const routeSources = repositorySources();
    const arrival = mutableScene(routeSources, "scenes/valley-arrival-shelf.v0.1.yaml");
    objectArray(arrival, "routes").push({
      route_id: "arrival.forged_magic",
      route_kind: "optional_magic",
      solution_family: "manifest_water_into_old_flume",
      from_entrance_id: "arrival.spawn",
      to_exit_id: "arrival.to_stream",
      objective_ids: ["arrival.reach_stream"],
    });
    expectIssue(() => compileContent(routeSources), "scene.pre_hermit_magic_forbidden");

    const interactionSources = repositorySources();
    const stream = mutableScene(interactionSources, "scenes/valley-stream-section.v0.1.yaml");
    objectArray(stream, "interactions").push({
      interaction_id: "stream.forged_fill_basin",
      target_id: "stream.shallow_basin",
      verb: "fill",
      optional_word_id: "word.telo",
    });
    expectIssue(() => compileContent(interactionSources), "scene.pre_hermit_magic_forbidden");
  });
});
