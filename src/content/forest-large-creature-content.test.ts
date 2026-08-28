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

describe("forest large-creature crisis contract", () => {
  it("authors one persistent large semiaquatic creature and six resolution paths", () => {
    const manifest = compileContent(repositorySources());
    const ecology = manifest.indexes.ecologies.valley_prologue!;
    const largeCreature = (ecology.entities as readonly MutableObject[]).find(
      (entity) => entity.entity_id === "wildlife.valley.large_semiaquatic_nester",
    )!;
    const task = manifest.indexes.tasks.ch01_large_creature_crisis!;

    expect(largeCreature.behavior_states).toEqual([
      "nesting", "searching_for_young", "warning", "defending", "fleeing", "resettling", "dead",
    ]);
    expect(task.resolution_ids).toEqual([
      "restore_migration_channel", "guide_with_food_and_scent", "wait_and_yield",
      "install_nonlethal_barrier", "drive_away_by_combat", "kill",
    ]);
    expect(task.mandatory_kill).toBe(false);
    expect(task.language_evidence_from_harm).toBe(false);
    expect(task.attack_qualification_evidence_from_harm).toBe(false);
  });

  it("rejects a mandatory kill or harm-generated language or qualification evidence", () => {
    const mandatoryKillSources = repositorySources();
    mutableSource(mandatoryKillSources, "tasks/ch01-large-creature-crisis.v0.1.yaml").mandatory_kill = true;
    expectIssue(() => compileContent(mandatoryKillSources), "task.forest_large_creature_contract");

    const harmEvidenceSources = repositorySources();
    mutableSource(harmEvidenceSources, "tasks/ch01-large-creature-crisis.v0.1.yaml").language_evidence_from_harm = true;
    expectIssue(() => compileContent(harmEvidenceSources), "task.forest_large_creature_contract");

    const qualificationEvidenceSources = repositorySources();
    mutableSource(qualificationEvidenceSources, "tasks/ch01-large-creature-crisis.v0.1.yaml").attack_qualification_evidence_from_harm = true;
    expectIssue(() => compileContent(qualificationEvidenceSources), "task.forest_large_creature_contract");
  });

  it("rejects removing persistent nest or young identity or adding a mainline drop", () => {
    const youngSources = repositorySources();
    const ecology = mutableSource(youngSources, "ecology/valley-prologue.v0.1.yaml");
    const largeCreature = objects(ecology, "entities").find(
      (entity) => entity.entity_id === "wildlife.valley.large_semiaquatic_nester",
    )!;
    delete largeCreature.young_id;
    delete largeCreature.nest_id;
    expectIssue(() => compileContent(youngSources), "ecology.forest_large_creature");

    const dropSources = repositorySources();
    mutableSource(dropSources, "tasks/ch01-large-creature-crisis.v0.1.yaml").mainline_quest_drop_id = "item.large_creature_key";
    expectIssue(() => compileContent(dropSources), "task.forest_large_creature_contract");
  });
});
