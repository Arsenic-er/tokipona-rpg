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
    expect(value.firstChapterActiveMasteryWordIds).toEqual(["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"]);
    expect(value.firstChapterStructureParticleIds).toEqual(["o", "li", "e"]);
    expect(value.additionalReceptiveWordIds).toEqual(["word.awen", "word.kasi", "word.kiwen", "word.kon", "word.lukin", "word.seli", "word.soweli", "word.weka"]);
    expect(value.firstChapterCompletionRequiresAllP0Words).toBe(false);
    expect(value.targetStateCeiling).toEqual({ produced: ["telo", "tawa", "lili", "suli"], grounded: ["seli", "kiwen", "awen"], attuned: ["kon", "kasi", "lukin", "weka", "soweli"] });
    expect(Object.values(value.words)).toHaveLength(12);
    expect(value.words.telo).toMatchObject({ targetState: "produced", productionTaskFamilies: ["channel_routing", "washing_or_filling"], semanticFacets: ["water_or_liquid", "drinking_washing_or_containment"] });
    expect(value.words.soweli).toMatchObject({ targetState: "attuned", productionTaskFamilies: [], meditation: { contextContrast: ["animal_tracks", "peaceful_land_animal"] } });
    expect(value.acceptance).toMatchObject({
      allWordsRecoverable: true,
      audioPolicy: {
        spokenPronunciationRequired: false,
        dialogueFeedback: "procedural_nonsemantic",
        progressMayDependOnAudio: false,
        captionsRequired: true,
      },
      contextsPerWordMinimum: 2,
      communitySemanticReviewRequired: true,
    });
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

    const legacyAudio = structuredClone(generated) as any;
    legacyAudio.p0Curriculum.acceptance.audioPolicy = {
      spokenPronunciationRequired: false,
      dialogueFeedback: "procedural_nonsemantic",
      progressMayDependOnAudio: false,
      captionsRequired: true,
      pronunciationAssetId: "audio.pronunciation.telo.v1",
    };
    expect(() => readRuntimeP0CurriculumManifest(resign(legacyAudio))).toThrow(/unknown or missing/);
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

    const spokenRequired = sources();
    (p0(spokenRequired).content_acceptance as Record<string, unknown>).audio_policy = {
      spoken_pronunciation_required: true,
      dialogue_feedback: "procedural_nonsemantic",
      progress_may_depend_on_audio: false,
      captions_required: true,
    };
    expectCompilerIssue(spokenRequired, "contract.speechless_audio_policy");

    const invalidFamily = sources(), familyWords = p0(invalidFamily).words as Record<string, unknown>[];
    familyWords.find((word) => word.word_id === "kiwen")!.production_task_families = ["invented"];
    expectCompilerIssue(invalidFamily, "contract.p0_production");

    const remoteStation = sources(), station = p0(remoteStation).runtime_recovery_station as Record<string, unknown>;
    station.interaction_point_tiles = [1, 1];
    expectCompilerIssue(remoteStation, "contract.p0_recovery_station");

    const extraActiveMastery = sources(), extraActiveScope = p0(extraActiveMastery).scope as Record<string, unknown>;
    extraActiveScope.first_chapter_active_mastery_word_ids = ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa", "word.seli"];
    expectCompilerIssue(extraActiveMastery, "contract.p0_first_chapter_scope");

    const missingActiveMastery = sources(), missingActiveScope = p0(missingActiveMastery).scope as Record<string, unknown>;
    missingActiveScope.first_chapter_active_mastery_word_ids = ["word.telo", "word.tawa", "word.lili", "word.suli"];
    expectCompilerIssue(missingActiveMastery, "contract.p0_first_chapter_scope");

    const particleAsActiveContent = sources(), particleScope = p0(particleAsActiveContent).scope as Record<string, unknown>;
    particleScope.first_chapter_active_mastery_word_ids = ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa", "o"];
    expectCompilerIssue(particleAsActiveContent, "contract.p0_first_chapter_scope");

    const allP0CompletionGate = sources(), completionScope = p0(allP0CompletionGate).scope as Record<string, unknown>;
    completionScope.first_chapter_completion_requires_all_p0_words = true;
    expectCompilerIssue(allP0CompletionGate, "contract.p0_first_chapter_scope");
  });

  it("rejects re-signed first-chapter scope drift", () => {
    const extraActiveMastery = structuredClone(generated) as any;
    extraActiveMastery.p0Curriculum.firstChapterActiveMasteryWordIds.push("word.seli");
    expect(() => readRuntimeP0CurriculumManifest(resign(extraActiveMastery))).toThrow(/first chapter scope/);

    const missingActiveMastery = structuredClone(generated) as any;
    missingActiveMastery.p0Curriculum.firstChapterActiveMasteryWordIds = ["word.telo", "word.tawa", "word.lili", "word.suli"];
    expect(() => readRuntimeP0CurriculumManifest(resign(missingActiveMastery))).toThrow(/first chapter scope/);

    const particleAsActiveContent = structuredClone(generated) as any;
    particleAsActiveContent.p0Curriculum.firstChapterActiveMasteryWordIds.push("o");
    expect(() => readRuntimeP0CurriculumManifest(resign(particleAsActiveContent))).toThrow(/first chapter scope/);

    const allP0CompletionGate = structuredClone(generated) as any;
    allP0CompletionGate.p0Curriculum.firstChapterCompletionRequiresAllP0Words = true;
    expect(() => readRuntimeP0CurriculumManifest(resign(allP0CompletionGate))).toThrow(/first chapter scope/);
  });

  it("reads the P0 contract without eagerly requiring the unrelated forest chapter branch", () => {
    const candidate = structuredClone(generated) as Record<string, unknown>;
    delete candidate.forestChapter;

    expect(readRuntimeP0CurriculumManifest(candidate).firstChapterActiveMasteryWordIds)
      .toEqual(["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"]);
  });
});
