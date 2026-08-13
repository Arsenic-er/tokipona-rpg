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

describe("N05 high-cistern content contract", () => {
  it("compiles the canonical 30x48 scene, direct N04 inbound, three receiver stages and two independent families", () => {
    const manifest = compileContent(repositorySources());
    const scene = manifest.indexes.scenes["scene.valley.high_cistern"]!;
    const task = manifest.indexes.tasks.ch01_length_cistern!;
    expect(scene.size_tiles).toEqual({ width: 30, height: 48 });
    expect((scene.inbound_route_refs as MutableObject[])[0]).toMatchObject({
      source_scene_id: "scene.valley.service_channel",
      source_exit_id: "service.to_high_cistern",
      entrance_id: "cistern.from_service",
    });
    const service = manifest.indexes.scenes["scene.valley.service_channel"]!;
    expect((service.exits as MutableObject[]).find((exit) => exit.exit_id === "service.to_high_cistern")).toMatchObject({
      target_scene_id: "scene.valley.high_cistern",
      target_entrance_id: "cistern.from_service",
    });
    expect(task.capacity_milestone_binding).toEqual(expect.objectContaining({
      milestone_id: "pre_cistern_length_phrase",
      writer_event: "first_evidence_package_committed",
      runtime_projection: "reference_only",
    }));
    expect(task.task_families).toEqual([
      expect.objectContaining({ family_id: "cistern.family_a.calibration", stage_ids: ["short", "default"] }),
      expect.objectContaining({ family_id: "cistern.family_b.transfer", stage_ids: ["long"] }),
    ]);
  });

  it("rejects drifting the short stage from telo lili or its 6 MP quote", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    const short = object(object(task, "stage_contracts"), "short");
    object(short, "direct_teaching_solution").activation_mp = 5;
    expectIssue(() => compileContent(sources), "task.cistern_stage_profile");
  });

  it("rejects a canonical stage expression that no longer names its authored word IDs", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    const long = object(object(task, "stage_contracts"), "long");
    object(long, "direct_teaching_solution").canonical_word_ids = ["word.telo"];
    expectIssue(() => compileContent(sources), "task.cistern_stage_expression");
  });

  it("rejects treating a legal wrong-length cast as stage completion", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    object(task, "semantic_acceptance").legal_wrong_length_cast_executes_but_never_completes_stage = false;
    expectIssue(() => compileContent(sources), "task.cistern_world_predicate_authority");
  });

  it("rejects turning H0 into answer-token disclosure", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    const levels = object(object(task, "hint_ladder"), "levels");
    object(levels, "H0").answer_token_ids_visible = true;
    expectIssue(() => compileContent(sources), "task.cistern_nonanswer_hint");
  });

  it("rejects counterfeit language evidence from a tool bypass", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    objects(task, "task_families")[0]!.language_evidence_from_tool_bypass = true;
    expectIssue(() => compileContent(sources), "task.cistern_family_contract");
  });

  it("rejects an unsourced or invented capacity milestone", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    object(task, "capacity_milestone_binding").milestone_id = "invented_capacity";
    expectIssue(() => compileContent(sources), "task.cistern_capacity_ref");
  });

  it("rejects weakening N04 to an implicit region-node handoff", () => {
    const sources = repositorySources();
    const service = mutableSource(sources, "scenes/valley-service-channel.v0.1.yaml");
    const exit = objects(service, "exits").find((candidate) => candidate.exit_id === "service.to_high_cistern")!;
    delete exit.target_scene_id;
    delete exit.target_entrance_id;
    exit.target_region_node_id = "valley.high_cistern";
    expectIssue(() => compileContent(sources), "task.cistern_direct_inbound");
  });

  it("rejects omitting any atomic N05 completion flag", () => {
    const sources = repositorySources();
    const task = mutableSource(sources, "tasks/ch01-length-cistern.v0.1.yaml");
    const completion = object(task, "completion");
    const transition = object(completion, "world_transition");
    object(transition, "set_flags").exit_ladder_lowered = false;
    expectIssue(() => compileContent(sources), "task.cistern_completion_flag");
  });
});
