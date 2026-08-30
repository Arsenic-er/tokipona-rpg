import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import type { ContentObject, ContentSource } from "../../src/content/types";
import { projectForestOpeningRuntimeManifest } from "./forest-opening-runtime-artifact";

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

function changedOpening(mutator: (opening: ContentObject) => void): ContentSource[] {
  const sources = structuredClone(repositorySources()) as ContentSource[];
  const source = sources.find(({ path }) => path === "data/chapters/ch01-opening-slice.v0.1.yaml");
  if (!source || typeof source.data !== "object" || source.data === null || Array.isArray(source.data)) {
    throw new Error("opening source fixture is missing");
  }
  mutator(source.data as ContentObject);
  return sources;
}

describe("forest opening runtime artifact projector", () => {
  it("projects the exact peaceful arrival-to-settlement opening contract", () => {
    const projected = projectForestOpeningRuntimeManifest(compileContent(repositorySources()));

    expect(projected).toMatchObject({
      sourcePath: "data/chapters/ch01-opening-slice.v0.1.yaml",
      sliceId: "ch01_forest_opening_vertical_slice",
      chapterFlowId: "ch01_world_literacy_prologue",
      districtIds: ["forest.arrival", "forest.stream", "forest.settlement"],
      sceneIds: [
        "scene.valley.arrival_shelf",
        "scene.valley.stream_section",
        "scene.valley.settlement",
      ],
      route: [
        { districtId: "forest.arrival", sceneId: "scene.valley.arrival_shelf" },
        { districtId: "forest.stream", sceneId: "scene.valley.stream_section" },
        { districtId: "forest.settlement", sceneId: "scene.valley.settlement" },
      ],
      solutions: [
        { solutionId: "stone_steps", semanticAction: "pushLooseStone" },
        { solutionId: "deadwood_bridge", semanticAction: "placeRottenLog" },
        { solutionId: "shallow_detour", semanticAction: "digSoftSoil" },
      ],
      glyphObservation: {
        wordId: "word.telo",
        grantsMeaning: false,
        grantsPronunciation: false,
        grantsLearningEvidence: false,
        grantsSpellAccess: false,
      },
      visibleSpeciesIds: ["forest.rabbit", "forest.wetland_bird"],
      completion: {
        zeroKillRequired: true,
        settlementCheckpointId: "checkpoint.forest.settlement_perimeter",
      },
    });
    expect(projected.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it.each([
    ["a fourth solution", (opening: ContentObject) => {
      (opening.solutions as ContentObject[]).push({
        solution_id: "forbidden_fourth_route",
        semantic_action: "skipObstacle",
      });
    }],
    ["an active telo grant", (opening: ContentObject) => {
      (opening.glyph_observation as ContentObject).grants_learning_evidence = true;
    }],
    ["a combat requirement", (opening: ContentObject) => {
      opening.combat_required = true;
    }],
    ["a missing zero-kill rule", (opening: ContentObject) => {
      (opening.completion as ContentObject).zero_kill_required = false;
    }],
    ["an unknown visible species", (opening: ContentObject) => {
      ((opening.ecology as ContentObject).visible_species as ContentObject[])[1]!.species_id = "forest.unknown";
    }],
    ["route order drift", (opening: ContentObject) => {
      ((opening.route as ContentObject[])).reverse();
    }],
  ] as const)("rejects %s", (_label, mutate) => {
    expect(() => projectForestOpeningRuntimeManifest(compileContent(changedOpening(mutate))))
      .toThrow(/forest opening|noncanonical|zero.kill|solution|route|species|glyph/i);
  });
});
