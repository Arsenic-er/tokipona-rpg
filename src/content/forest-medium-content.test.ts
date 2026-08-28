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

function object(root: MutableObject, key: string): MutableObject {
  const value = root[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object`);
  return value as MutableObject;
}

function objects(root: MutableObject, key: string): MutableObject[] {
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

describe("forest medium initiation contract", () => {
  it("locks medium discovery, hermit routes, and safe telo initiation", () => {
    const manifest = compileContent(repositorySources());
    const task = manifest.indexes.tasks.ch01_medium_hermit_initiation!;
    expect(task.required_event_sequence).toEqual([
      "waterwheel_goal_committed",
      "forest_medium_discovered",
      "forest_hermit_route_committed",
      "forest_telo_initiation_committed",
    ]);
    expect((task.hermit_routes as readonly { route_id: string }[]).map(({ route_id }) => route_id)).toEqual([
      "medium.tell_facility_worker",
      "medium.follow_fragment_markers",
      "medium.ask_external_trader",
    ]);
    expect(task.automatic_word_mastery_forbidden).toBe(true);
    expect(task.automatic_mp_increase_forbidden).toBe(true);
  });

  it("rejects reordered hermit routes", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-medium-hermit-initiation.v0.1.yaml");
    objects(task, "hermit_routes").reverse();
    expectIssue(() => compileContent(sources), "task.forest_medium_contract");
  });

  it("rejects changing the canonical task type to bypass its validator", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-medium-hermit-initiation.v0.1.yaml");
    task.task_type = "infrastructure_world_predicate";
    expectIssue(() => compileContent(sources), "task.forest_medium_contract");
  });

  it("rejects moving hermit practice authority away from the stream section", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-medium-hermit-initiation.v0.1.yaml");
    object(task, "hermit_practice").authority_scene_id = "scene.valley.settlement";
    expectIssue(() => compileContent(sources), "task.forest_medium_contract");
  });

  it("rejects omitting the natural-water observation", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-medium-hermit-initiation.v0.1.yaml");
    object(task, "hermit_practice").required_actions = [
      "predict_manifest_path",
      "perform_low_mp_telo",
      "stabilize_with_tool",
    ];
    expectIssue(() => compileContent(sources), "task.forest_medium_contract");
  });

  it.each(["automatic_word_mastery_forbidden", "automatic_mp_increase_forbidden"])(
    "rejects granting an automatic learning reward through %s",
    (flag) => {
      const sources = repositorySources();
      const task = mutableSource(sources, "tasks/ch01-medium-hermit-initiation.v0.1.yaml");
      task[flag] = false;
      expectIssue(() => compileContent(sources), "task.forest_medium_contract");
    },
  );

  it("rejects redirecting a canonical medium writer event", () => {
    const sources = repositorySources();
    const region = mutableSource(sources, "world/regions/valley-prologue.v0.1.yaml");
    object(object(region, "event_commit_points"), "forest_medium_discovered").atomic_writes = {
      forest_hermit_route_committed: true,
    };
    expectIssue(() => compileContent(sources), "ref.forest_medium");
  });

  it("rejects removing a canonical medium state entry", () => {
    const sources = repositorySources();
    const region = mutableSource(sources, "world/regions/valley-prologue.v0.1.yaml");
    region.state_registry = objects(region, "state_registry").filter(
      (state) => state.state_id !== "forest_telo_initiation_completed",
    );
    expectIssue(() => compileContent(sources), "ref.forest_medium");
  });
});
