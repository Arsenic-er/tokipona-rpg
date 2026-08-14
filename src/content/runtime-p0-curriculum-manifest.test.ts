import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "./compiler";
import {
  computeRuntimeP0CurriculumDigest,
  isVerifiedRuntimeP0CurriculumManifest,
  readRuntimeP0CurriculumManifest,
} from "./runtime-p0-curriculum-manifest";
import type { ContentSource } from "./types";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(text) : parse(text) }));
const p0 = (all: ContentSource[]): Record<string, unknown> => all.find((source) => source.path.endsWith("p0-curriculum.v0.1.yaml"))!.data as Record<string, unknown>;

function resign(artifact: unknown): unknown {
  const root = artifact as { p0Curriculum: Record<string, unknown> };
  const payload = Object.fromEntries(Object.entries(root.p0Curriculum).filter(([key]) => key !== "sourceDigest"));
  root.p0Curriculum.sourceDigest = computeRuntimeP0CurriculumDigest(payload);
  return root;
}

function expectCompilerIssue(all: ContentSource[], code: string): void {
  try { compileContent(all); throw new Error("expected compile failure"); }
  catch (error) { expect(error).toBeInstanceOf(ContentValidationError); expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })])); }
}

describe("P0 curriculum runtime contract", () => {
  it("projects and verifies the exact 12-word target matrix", () => {
    const value = readRuntimeP0CurriculumManifest(generated);
    expect(isVerifiedRuntimeP0CurriculumManifest(value)).toBe(true);
    expect(value.scope).toMatchObject({ band: "P0", uniqueWordCount: 12, firstThreeHoursIsContentBudgetNotRealTimeGate: true });
    expect(value.targetStateCeiling).toEqual({ produced: ["telo", "tawa", "lili", "suli"], grounded: ["seli", "kiwen", "awen"], attuned: ["kon", "kasi", "lukin", "weka", "soweli"] });
    expect(Object.values(value.words)).toHaveLength(12);
    expect(value.words.telo).toMatchObject({ targetState: "produced", productionTaskFamilies: ["channel_routing", "washing_or_filling"], semanticFacets: ["water_or_liquid", "drinking_washing_or_containment"] });
    expect(value.words.soweli).toMatchObject({ targetState: "attuned", productionTaskFamilies: [], meditation: { contextContrast: ["animal_tracks", "peaceful_land_animal"] } });
    expect(value.acceptance).toMatchObject({ allWordsRecoverable: true, pronunciationAudio: "required", contextsPerWordMinimum: 2, communitySemanticReviewRequired: true });
    expect(value.recoveryStation).toEqual({ sceneId: "scene.valley.settlement", targetId: "settlement.p0_inscription_archive", interactionId: "settlement.open_p0_inscription_archive", interactionPointTiles: [38, 28], maximumDistancePx: 16, recoveryRouteOnlyWhenBelowTarget: true });
  });

  it("rejects checksum tampering and re-signed semantic drift", () => {
    const checksum = structuredClone(generated) as any;
    checksum.p0Curriculum.words.telo.targetState = "attuned";
    expect(() => readRuntimeP0CurriculumManifest(checksum)).toThrow(/digest mismatch/);
    const resigned = structuredClone(generated) as any;
    resigned.p0Curriculum.words.telo.targetState = "attuned";
    expect(() => readRuntimeP0CurriculumManifest(resign(resigned))).toThrow(/target state/);
    const missingContext = structuredClone(generated) as any;
    missingContext.p0Curriculum.words.kon.meditation.contextContrast = ["air_pulse"];
    expect(() => readRuntimeP0CurriculumManifest(resign(missingContext))).toThrow(/exactly two/);
    const unknown = structuredClone(generated) as any;
    unknown.p0Curriculum.words.seli.runtimeOverride = true;
    expect(() => readRuntimeP0CurriculumManifest(resign(unknown))).toThrow(/unknown or missing/);
  });

  it("fails content compilation when targets, contexts, recovery, or production families drift", () => {
    const wrongTarget = sources(), targetRoot = p0(wrongTarget).target_state_ceiling_first_three_hours as Record<string, unknown>;
    targetRoot.produced = ["telo", "tawa", "lili"];
    expectCompilerIssue(wrongTarget, "contract.p0_target");

    const oneContext = sources(), words = p0(oneContext).words as Record<string, unknown>[];
    (words.find((word) => word.word_id === "seli")!.meditation as Record<string, unknown>).context_contrast = ["local_heat"];
    expectCompilerIssue(oneContext, "contract.p0_context");

    const noRecovery = sources(), acceptance = p0(noRecovery).content_acceptance as Record<string, unknown>;
    acceptance.all_words_recoverable = false;
    expectCompilerIssue(noRecovery, "contract.p0_acceptance");

    const invalidFamily = sources(), familyWords = p0(invalidFamily).words as Record<string, unknown>[];
    familyWords.find((word) => word.word_id === "kiwen")!.production_task_families = ["invented"];
    expectCompilerIssue(invalidFamily, "contract.p0_production");

    const remoteStation = sources(), station = p0(remoteStation).runtime_recovery_station as Record<string, unknown>;
    station.interaction_point_tiles = [1, 1];
    expectCompilerIssue(remoteStation, "contract.p0_recovery_station");
  });
});
