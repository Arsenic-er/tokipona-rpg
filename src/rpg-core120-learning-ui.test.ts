import { describe, expect, it } from "vitest";
import generated from "./generated/content-runtime.v0.1.json";
import { readRuntimeCore120CurriculumManifest } from "./content/runtime-core120-curriculum-manifest";
import type { PrologueFlowCore120LearningView } from "./game/prologue-flow";
import rpgMainSource from "./rpg-main.ts?raw";
import {
  CORE120_LEARNING_UI_TEMPLATE,
  deriveCore120LearningUiModel,
  resolveCore120LearningUiIntent,
} from "./rpg-core120-learning-ui";

const manifest = readRuntimeCore120CurriculumManifest(generated);

const view = (overrides: Partial<PrologueFlowCore120LearningView> = {}): PrologueFlowCore120LearningView => ({
  mode: "settlement",
  p0PrerequisiteComplete: true,
  authorityInRange: true,
  station: { sceneId: manifest.recoveryStation.sceneId, targetId: manifest.recoveryStation.targetId,
    interactionId: manifest.recoveryStation.interactionId, inRange: true },
  externalAssets: { pronunciationAudio: "blocked_pending_private_assets",
    glyphVisuals: "blocked_pending_private_approval", glyphCatalog: "draft", fullAssetAcceptance: false },
  words: manifest.scope.wordIds.map((wordId) => ({
    wordId,
    band: manifest.words[wordId]!.curriculumBand,
    visualDomainId: manifest.words[wordId]!.visualDomainId,
    currentState: "unknown",
    completedActionIds: [],
    nextActionId: `core120.${wordId}.discover`,
    availableActionId: `core120.${wordId}.discover`,
    audioReady: false,
    glyphReady: false,
  })),
  totalWordCount: 120,
  completedWordCount: 0,
  completedSemanticActionCount: 0,
  totalSemanticActionCount: 600,
  ...overrides,
});

describe("core-120 browser UI boundary", () => {
  it("projects one verified band at a time and keeps private assets explicitly blocked", () => {
    const model = deriveCore120LearningUiModel(view(), "P3");
    expect(model).toMatchObject({ visible: true, selectedBand: "P3", externalAssetsBlocked: true,
      totalWordCount: 120, totalSemanticActionCount: 600 });
    expect(model.words).toHaveLength(30);
    expect(model.words.every((word) => word.band === "P3")).toBe(true);
    expect(CORE120_LEARNING_UI_TEMPLATE).toContain('aria-live="polite"');
    expect(CORE120_LEARNING_UI_TEMPLATE).toContain('type="search"');
    expect(CORE120_LEARNING_UI_TEMPLATE).toContain('maxlength="16"');
    expect(CORE120_LEARNING_UI_TEMPLATE).toContain('aria-controls="core120-learning-grid"');
    expect(CORE120_LEARNING_UI_TEMPLATE).toContain('aria-describedby="core120-search-status"');
    expect(CORE120_LEARNING_UI_TEMPLATE).not.toMatch(/private[/\\]|assetPath|semanticFacets/);
  });

  it("emits only the canonical next action after P0 and proximity gates", () => {
    const model = deriveCore120LearningUiModel(view(), "P0");
    const wordId = model.words[0]!.wordId;
    expect(resolveCore120LearningUiIntent(model, wordId)).toEqual({
      kind: "perform_core120_action",
      actionId: `core120.${wordId}.discover`,
    });
    expect(resolveCore120LearningUiIntent(deriveCore120LearningUiModel(view({ p0PrerequisiteComplete: false }), "P0"), wordId)).toBeNull();
    expect(resolveCore120LearningUiIntent(deriveCore120LearningUiModel(view({ authorityInRange: false }), "P0"), wordId)).toBeNull();
    expect(resolveCore120LearningUiIntent(model, "not-a-word")).toBeNull();
  });

  it("accepts an independently completed second context and executes the available first context", () => {
    const projected = structuredClone(view({ mode: "world_context" })) as any;
    const word = projected.words.find((candidate: { wordId: string }) => candidate.wordId === "akesi");
    word.completedActionIds = ["core120.akesi.discover", "core120.akesi.attune", "core120.akesi.context_1"];
    word.nextActionId = "core120.akesi.context_0";
    word.availableActionId = "core120.akesi.context_0";
    word.currentState = "produced";
    projected.completedSemanticActionCount = 3;
    const model = deriveCore120LearningUiModel(projected, word.band);
    expect(model.visible).toBe(true);
    expect(resolveCore120LearningUiIntent(model, "akesi")).toEqual({
      kind: "perform_core120_action",
      actionId: "core120.akesi.context_0",
    });
  });

  it("searches all 120 Latin word IDs locally without widening the command payload", () => {
    const model = deriveCore120LearningUiModel(view(), "P0", "  ALA  ");
    expect(model).toMatchObject({
      visible: true,
      selectedBand: "P0",
      searchQuery: "ala",
      searchValid: true,
      searchActive: true,
      searchResultCount: 1,
    });
    expect(model.words.map((word) => [word.wordId, word.band])).toEqual([["ala", "P1"]]);
    const command = resolveCore120LearningUiIntent(model, "ala");
    expect(command).toEqual({ kind: "perform_core120_action", actionId: "core120.ala.discover" });
    expect(Object.keys(command!)).toEqual(["kind", "actionId"]);
    expect(JSON.stringify(command)).not.toMatch(/query|search|raw|text/i);
  });

  it("fails closed on non-Latin or overlong search input", () => {
    for (const query of ["ala!", "telo 水", "abcdefghijklmnopq"]) {
      const model = deriveCore120LearningUiModel(view(), "P0", query);
      expect(model).toMatchObject({ searchValid: false, searchActive: false, searchResultCount: 0, words: [] });
      expect(resolveCore120LearningUiIntent(model, "ala")).toBeNull();
    }
  });

  it("fails closed on incomplete, duplicate or mismatched machine projections", () => {
    const incomplete = view({ words: view().words.slice(1) });
    expect(deriveCore120LearningUiModel(incomplete, "P0")).toMatchObject({ visible: false, words: [] });
    const duplicate = view({ words: [...view().words.slice(0, -1), view().words[0]!] });
    expect(deriveCore120LearningUiModel(duplicate, "P0")).toMatchObject({ visible: false, words: [] });
    const mismatched = structuredClone(view()) as any;
    mismatched.words[0].band = mismatched.words[0].band === "P5" ? "P4" : "P5";
    expect(deriveCore120LearningUiModel(mismatched, "P0")).toMatchObject({ visible: false, words: [] });
    const crossWordAction = structuredClone(view()) as any;
    crossWordAction.words.find((word: { wordId: string }) => word.wordId === "awen").nextActionId = "core120.akesi.discover";
    expect(deriveCore120LearningUiModel(crossWordAction, "P0")).toMatchObject({ visible: false, words: [] });
    expect(deriveCore120LearningUiModel(view({ completedSemanticActionCount: 1 }), "P0"))
      .toMatchObject({ visible: false, completedSemanticActionCount: 0 });
  });

  it("requires a narrow Flow port and never sends authored evidence or private asset paths", () => {
    expect(rpgMainSource).toContain("core120LearningView(): PrologueFlowCore120LearningView");
    expect(rpgMainSource).toContain("performCore120LearningAction(nextId(\"core120-learning\"), command.actionId)");
    expect(rpgMainSource).not.toMatch(/core120Learning\([^)]*(evidence|semanticFacets|privatePath|audioPath)/);
  });
});
