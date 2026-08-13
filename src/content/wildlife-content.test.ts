import { parse } from "yaml";
import { describe, expect, it } from "vitest";
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

describe("N06 optional den bypass content", () => {
  it("compiles a 28x28 optional, bidirectional, zero-combat bypass while preserving N04 to N05", () => {
    const manifest = compileContent(repositorySources());
    const scene = manifest.indexes.scenes["scene.valley.den_bypass"]!;
    const task = manifest.indexes.tasks.ch01_den_bypass!;
    const service = manifest.indexes.scenes["scene.valley.service_channel"]!;
    const segment = (manifest.indexes.chapters.ch01_world_literacy_prologue!.segments as MutableObject[])
      .find((entry) => entry.segment_id === "den_and_return_flow")!;
    expect(scene.size_tiles).toEqual({ width: 28, height: 28 });
    expect(scene.tile_size_px).toBe(16);
    expect(scene.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ route_id: "den.wait_and_observe", route_kind: "non_magic" }),
      expect.objectContaining({ route_id: "den.dig_upper_bypass", route_kind: "non_magic" }),
      expect.objectContaining({ route_id: "den.low_force_noise", route_kind: "non_magic" }),
      expect.objectContaining({ route_id: "den.low_force_staff", route_kind: "non_magic" }),
    ]));
    expect(task.wildlife_reward_contract).toMatchObject({
      combat_required: false, mandatory_kills: 0, required_drops: 0,
      language_xp: 0, learning_evidence: 0, expression_capacity_growth: 0, mp_growth: 0,
      den_destruction_opens_route: false,
    });
    expect(segment.optional_task_ids).toContain("ch01_den_bypass");
    expect((service.exits as MutableObject[]).find((entry) => entry.exit_id === "service.to_high_cistern")).toMatchObject({
      target_scene_id: "scene.valley.high_cistern",
      target_entrance_id: "cistern.from_service",
    });
  });

  it("rejects warning and defense windows shorter than their safety minima", () => {
    const warningSources = repositorySources();
    const ecology = mutableSource(warningSources, "ecology/valley-prologue.v0.1.yaml");
    ((ecology.shared_behavior as MutableObject).timing_seconds as MutableObject).minimum_warning_telegraph = 0.69;
    expectIssue(() => compileContent(warningSources), "ecology.warning_window");

    const defenseSources = repositorySources();
    const defenseEcology = mutableSource(defenseSources, "ecology/valley-prologue.v0.1.yaml");
    ((defenseEcology.shared_behavior as MutableObject).timing_seconds as MutableObject).intrusion_before_defense = 1.49;
    expectIssue(() => compileContent(defenseSources), "ecology.defense_window");
  });

  it("rejects den destruction as a route shortcut or any progression reward", () => {
    const destructionSources = repositorySources();
    const task = mutableSource(destructionSources, "tasks/ch01-den-bypass.v0.1.yaml");
    (task.wildlife_reward_contract as MutableObject).den_destruction_opens_route = true;
    expectIssue(() => compileContent(destructionSources), "task.den_zero_combat");

    const rewardSources = repositorySources();
    const rewardTask = mutableSource(rewardSources, "tasks/ch01-den-bypass.v0.1.yaml");
    (rewardTask.wildlife_reward_contract as MutableObject).mp_growth = 1;
    expectIssue(() => compileContent(rewardSources), "task.den_zero_reward");
  });

  it("rejects making N06 mandatory or replacing the direct N04 to N05 mainline", () => {
    const mandatorySources = repositorySources();
    const chapter = mutableSource(mandatorySources, "chapters/ch01-world-literacy-prologue.v0.1.yaml");
    const segment = objectArray(chapter, "segments").find((entry) => entry.segment_id === "den_and_return_flow")!;
    segment.optional_task_ids = [];
    expectIssue(() => compileContent(mandatorySources), "task.den_optional_only");

    const topologySources = repositorySources();
    const service = mutableSource(topologySources, "scenes/valley-service-channel.v0.1.yaml");
    const direct = objectArray(service, "exits").find((entry) => entry.exit_id === "service.to_high_cistern")!;
    direct.target_scene_id = "scene.valley.den_bypass";
    direct.target_entrance_id = "den.from_service";
    expectIssue(() => compileContent(topologySources), "task.den_preserve_direct_mainline");
  });

  it("rejects zero or duplicate canonical fox spatial bindings", () => {
    const missingSources = repositorySources();
    const missingScene = mutableSource(missingSources, "scenes/valley-den-bypass.v0.1.yaml");
    missingScene.wildlife_bindings = [];
    expectIssue(() => compileContent(missingSources), "scene.fox_spatial_binding");

    const duplicateSources = repositorySources();
    const duplicateScene = mutableSource(duplicateSources, "scenes/valley-den-bypass.v0.1.yaml");
    const bindings = objectArray(duplicateScene, "wildlife_bindings");
    bindings.push(structuredClone(bindings[0]!));
    expectIssue(() => compileContent(duplicateSources), "scene.fox_spatial_binding");
  });

  it("rejects unsupported spawn and invalid or overlapping escape AABBs", () => {
    const spawnSources = repositorySources();
    const spawnBinding = objectArray(mutableSource(spawnSources, "scenes/valley-den-bypass.v0.1.yaml"), "wildlife_bindings")[0]!;
    spawnBinding.spawn_position_tiles = [10, 2];
    expectIssue(() => compileContent(spawnSources), "scene.fox_spawn_bounds");

    const fractionalSources = repositorySources();
    const fractionalBinding = objectArray(mutableSource(fractionalSources, "scenes/valley-den-bypass.v0.1.yaml"), "wildlife_bindings")[0]!;
    fractionalBinding.escape_bounds_tiles = { x: 24.5, y: 0, width: 2, height: 4 };
    expectIssue(() => compileContent(fractionalSources), "scene.fox_spatial_bounds");

    const overlapSources = repositorySources();
    const overlapBinding = objectArray(mutableSource(overlapSources, "scenes/valley-den-bypass.v0.1.yaml"), "wildlife_bindings")[0]!;
    overlapBinding.escape_bounds_tiles = { x: 10, y: 0, width: 2, height: 4 };
    expectIssue(() => compileContent(overlapSources), "scene.fox_escape_geometry");
  });

  it("rejects unknown, wrong-kind, and ecology-mismatched fox target references", () => {
    const unknownSources = repositorySources();
    const unknownBinding = objectArray(mutableSource(unknownSources, "scenes/valley-den-bypass.v0.1.yaml"), "wildlife_bindings")[0]!;
    unknownBinding.escape_target_id = "den.missing.exit";
    expectIssue(() => compileContent(unknownSources), "scene.fox_spatial_target");

    const wrongKindSources = repositorySources();
    const wrongKindBinding = objectArray(mutableSource(wrongKindSources, "scenes/valley-den-bypass.v0.1.yaml"), "wildlife_bindings")[0]!;
    wrongKindBinding.escape_target_id = "den.den_structure";
    expectIssue(() => compileContent(wrongKindSources), "scene.fox_spatial_target");

    const mismatchSources = repositorySources();
    const mismatchScene = mutableSource(mismatchSources, "scenes/valley-den-bypass.v0.1.yaml");
    const mismatchTargets = objectArray(mismatchScene, "targets");
    mismatchTargets.push({ target_id: "den.alternate.exit", target_kind: "real_wildlife_escape_exit", material: "soil" });
    objectArray(mismatchScene, "wildlife_bindings")[0]!.escape_target_id = "den.alternate.exit";
    expectIssue(() => compileContent(mismatchSources), "scene.fox_ecology_binding");
  });

  it("rejects ecology upper timing, contact-distance, and species-guard drift", () => {
    const timingSources = repositorySources();
    const timing = (mutableSource(timingSources, "ecology/valley-prologue.v0.1.yaml").shared_behavior as MutableObject).timing_seconds as MutableObject;
    timing.deescalate = 61;
    expectIssue(() => compileContent(timingSources), "ecology.timing_bounds");

    const contactSources = repositorySources();
    const distance = (mutableSource(contactSources, "ecology/valley-prologue.v0.1.yaml").shared_behavior as MutableObject).distance_tiles as MutableObject;
    distance.defensive_contact = 1.4;
    expectIssue(() => compileContent(contactSources), "ecology.defensive_contact");

    const guardSources = repositorySources();
    const guardEcology = mutableSource(guardSources, "ecology/valley-prologue.v0.1.yaml");
    objectArray(guardEcology, "entities").find((entity) => entity.entity_id === "wildlife.rabbit.valley")!.defense_only_when = ["cornered", "escape_blocked"];
    expectIssue(() => compileContent(guardSources), "ecology.defense_guards");
  });

  it("rejects generated N06 perception, deterrence and interaction-point drift", () => {
    const perceptionSources = repositorySources();
    const perception = (mutableSource(perceptionSources, "ecology/valley-prologue.v0.1.yaml").shared_behavior as MutableObject).distance_tiles as MutableObject;
    perception.perception = 9;
    expectIssue(() => compileContent(perceptionSources), "ecology.perception");

    const fearSources = repositorySources();
    const deterrence = ((mutableSource(fearSources, "ecology/valley-prologue.v0.1.yaml").shared_behavior as MutableObject).deterrence as MutableObject).sources as MutableObject[];
    deterrence.find((source) => source.action === "ground_impact_or_loud_sound")!.fear = 19;
    expectIssue(() => compileContent(fearSources), "ecology.deterrence_fear");

    const pointSources = repositorySources();
    const scene = mutableSource(pointSources, "scenes/valley-den-bypass.v0.1.yaml");
    objectArray(scene, "targets").find((target) => target.target_id === "den.staff_marker")!.interaction_point_tiles = [29, 1];
    expectIssue(() => compileContent(pointSources), "scene.wildlife_interaction_point");
  });

  it("rejects a missing real fox escape or unreachable scene exit", () => {
    const escapeSources = repositorySources();
    const ecology = mutableSource(escapeSources, "ecology/valley-prologue.v0.1.yaml");
    const fox = objectArray(ecology, "entities").find((entry) => entry.entity_id === "wildlife.fox.den")!;
    fox.real_escape_exit = "";
    expectIssue(() => compileContent(escapeSources), "ecology.fox_runtime_fields");

    const reachabilitySources = repositorySources();
    const scene = mutableSource(reachabilitySources, "scenes/valley-den-bypass.v0.1.yaml");
    const rows = scene.collision_rows_top_down as string[];
    for (let row = 0; row < 27; row += 1) rows[row] = "############################";
    expectIssue(() => compileContent(reachabilitySources), "scene.exit_unreachable");
  });
});
