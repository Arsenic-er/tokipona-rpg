import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileContent, ContentValidationError } from "./compiler";
import type { ContentSource } from "./types";

type MutableObject = Record<string, unknown>;

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

function mutableSource(sources: ContentSource[], suffix: string): MutableObject {
  const source = sources.find((candidate) => candidate.path.endsWith(suffix));
  if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) {
    throw new Error(`Missing object source ${suffix}`);
  }
  return source.data as MutableObject;
}

function objectArray(root: MutableObject, key: string): MutableObject[] {
  const value = root[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value as MutableObject[];
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

describe("N03/N04 infrastructure content contracts", () => {
  it("compiles two independently indexed infrastructure tasks with canonical topology", () => {
    const manifest = compileContent(repositorySources());
    expect(Object.keys(manifest.indexes.tasks).sort()).toEqual([
      "ch01_den_bypass",
      "ch01_first_attack_qualification",
      "ch01_large_creature_crisis",
      "ch01_length_cistern",
      "ch01_medium_hermit_initiation",
      "ch01_return_flow",
      "ch01_service_channel",
      "ch01_underground_water_allocation",
      "ch01_waterwheel",
    ]);
    expect(manifest.indexes.scenes["scene.valley.waterwheel"]?.size_tiles).toEqual({
      width: 30,
      height: 32,
    });
    expect(manifest.indexes.scenes["scene.valley.service_channel"]?.size_tiles).toEqual({
      width: 28,
      height: 40,
    });
  });

  it("rejects a waterwheel contract where a temporary result persists", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-waterwheel.v0.1.yaml");
    const temporary = objectArray(task, "result_modes").find(
      (mode) => mode.mode_id === "temporary_driven",
    );
    if (!temporary) throw new Error("temporary mode missing");
    temporary.persists_across_reload = true;
    temporary.patch_record_ref = "patch.valley.waterwheel_structure.v0.1";
    expectIssue(() => compileContent(sources), "task.waterwheel_persistence");
  });

  it("rejects an infrastructure task with fewer than two non-magic mainline solutions", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-service-channel.v0.1.yaml");
    for (const [index, solution] of objectArray(task, "solution_families").entries()) {
      solution.mainline = index === 0;
    }
    expectIssue(() => compileContent(sources), "task.non_magic_solution_minimum");
  });

  it("rejects turning receptive o contact into an automatic language grant", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-service-channel.v0.1.yaml");
    objectArray(task, "grammar_contacts")[0]!.automatic_state_grant = true;
    expectIssue(() => compileContent(sources), "task.o_contact_only");
  });

  it("rejects task guards that diverge from the authoritative region topology", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-waterwheel.v0.1.yaml");
    task.exit_guard_any = ["invented_shortcut == true"];
    expectIssue(() => compileContent(sources), "ref.mismatch");
  });

  it("rejects a scene exit guard that diverges from the region connection", () => {
    const sources = repositorySources();
    const scene = mutableSource(sources, "scenes/valley-service-channel.v0.1.yaml");
    const exit = objectArray(scene, "exits").find(
      (candidate) => candidate.exit_id === "service.to_high_cistern",
    );
    if (!exit) throw new Error("service exit missing");
    exit.traversal_guard = { any: ["invented_shortcut == true"] };
    expectIssue(() => compileContent(sources), "scene.traversal_guard_mismatch");
  });

  it("rejects scene dimensions that drift from the region node contract", () => {
    const sources = repositorySources();
    const scene = mutableSource(sources, "scenes/valley-waterwheel.v0.1.yaml");
    (scene.size_tiles as MutableObject).width = 31;
    expectIssue(() => compileContent(sources), "scene.region_size_mismatch");
  });

  it("rejects recovery paths designed beyond sixty seconds", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-service-channel.v0.1.yaml");
    (task.recovery as MutableObject).maximum_softlock_recovery_seconds = 61;
    expectIssue(() => compileContent(sources), "task.recovery_duration");
  });
});
