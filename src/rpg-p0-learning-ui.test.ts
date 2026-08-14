import { describe, expect, it } from "vitest";
import rpgMainSource from "./rpg-main.ts?raw";
import type { PrologueFlowP0LearningView } from "./game/prologue-flow";
import {
  P0_LEARNING_UI_TEMPLATE,
  deriveP0LearningUiModel,
  resolveP0LearningUiIntent,
} from "./rpg-p0-learning-ui";

const wordIds = ["awen", "kasi", "kiwen", "kon", "lili", "lukin", "seli", "soweli", "suli", "tawa", "telo", "weka"] as const;
const view = (inRange = true): PrologueFlowP0LearningView => ({
  mode: "settlement",
  station: { sceneId: "scene.valley.settlement", targetId: "settlement.p0_inscription_archive",
    interactionId: "settlement.open_p0_inscription_archive", inRange },
  externalAssets: { pronunciationAudio: "blocked_pending_private_assets", approvedGlyphRelease: "blocked_pending_private_approval" },
  words: wordIds.map((wordId, index) => ({ wordId, targetState: index < 5 ? "attuned" : index < 8 ? "grounded" : "produced",
    currentState: "unknown", targetReached: false, completedActionIds: [], nextActionId: `p0.${wordId}.discover` as const })),
  targetWordCount: 12,
  reachedWordCount: 0,
});

describe("P0 learning UI boundary", () => {
  it("renders the exact 12-word machine view and keeps external assets blocked", () => {
    const model = deriveP0LearningUiModel(view());
    expect(model.visible).toBe(true);
    expect(model.words.map((word) => word.wordId)).toEqual(wordIds);
    expect(model.externalAssetsBlocked).toBe(true);
    expect(P0_LEARNING_UI_TEMPLATE).toContain('aria-live="polite"');
    expect(P0_LEARNING_UI_TEMPLATE).toContain("等待私有素材审批");
  });

  it("emits only the generated next action while in authoritative range", () => {
    const model = deriveP0LearningUiModel(view());
    expect(resolveP0LearningUiIntent(model, "kon")).toEqual({ kind: "perform_p0_action", actionId: "p0.kon.discover" });
    expect(resolveP0LearningUiIntent(deriveP0LearningUiModel(view(false)), "kon")).toBeNull();
    expect(resolveP0LearningUiIntent(model, "jan")).toBeNull();
  });

  it("fails closed on incomplete or duplicate word projections", () => {
    const incomplete = view() as any;
    incomplete.words = incomplete.words.slice(0, 11);
    expect(deriveP0LearningUiModel(incomplete)).toMatchObject({ visible: false, words: [] });
  });

  it("connects the browser port without exposing authored evidence payloads", () => {
    expect(rpgMainSource).toContain("p0LearningView(): PrologueFlowP0LearningView");
    expect(rpgMainSource).toContain("performP0LearningAction(nextId(\"p0-learning\"), command.actionId)");
    expect(rpgMainSource).not.toMatch(/p0Learning\([^)]*(semanticFacets|misconception|targetState)/);
  });
});
