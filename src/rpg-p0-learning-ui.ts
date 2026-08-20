import generated from "./generated/content-runtime.v0.1.json";
import { readRuntimeP0CurriculumManifest } from "./content/runtime-p0-curriculum-manifest";
import type { PrologueFlowP0LearningView } from "./game/prologue-flow";
import type { P0LearningActionId } from "./game/p0-learning-contract";

const MANIFEST = readRuntimeP0CurriculumManifest(generated);
const ACTION_IDS = new Set(MANIFEST.scope.wordIds.flatMap((wordId) =>
  (["discover", "attune", "context_0", "context_1", "repair"] as const).map((kind) => `p0.${wordId}.${kind}`)));

export type P0LearningUiCommand = Readonly<{ kind: "perform_p0_action"; actionId: P0LearningActionId }>;
export interface P0LearningUiModel {
  readonly visible: boolean;
  readonly inRange: boolean;
  readonly reachedWordCount: number;
  readonly targetWordCount: 12;
  readonly externalAssetsBlocked: boolean;
  readonly words: PrologueFlowP0LearningView["words"];
}

export const P0_LEARNING_UI_TEMPLATE = `
  <section class="p0-learning-panel" data-p0-learning-panel hidden aria-labelledby="p0-learning-title">
    <div class="panel-heading"><div><p class="eyebrow">P0 / 12-WORD RECOVERY</p><h2 id="p0-learning-title">公共刻印档案台</h2></div>
      <strong data-p0-learning-count>0 / 12</strong></div>
    <p class="p0-learning-copy">每个词按发现、调谐、双情境与误解修复推进；按钮只提交机器 action ID。</p>
    <p class="p0-learning-assets" data-p0-learning-assets role="status">正式字形仍等待私有素材审批，不会用占位素材冒充通过。</p>
    <div class="p0-learning-grid" data-p0-learning-grid></div>
    <p class="p0-learning-live" data-p0-learning-live role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;

export function deriveP0LearningUiModel(view: PrologueFlowP0LearningView): P0LearningUiModel {
  const validWords = view.words.length === 12 && new Set(view.words.map((word) => word.wordId)).size === 12 &&
    MANIFEST.scope.wordIds.every((wordId) => view.words.some((word) => word.wordId === wordId));
  return Object.freeze({ visible: view.mode === "settlement" && validWords, inRange: view.station.inRange,
    reachedWordCount: validWords ? view.reachedWordCount : 0, targetWordCount: 12,
    externalAssetsBlocked: view.externalAssets.approvedGlyphRelease !== "approved",
    words: validWords ? view.words : Object.freeze([]) });
}

export function resolveP0LearningUiIntent(
  model: P0LearningUiModel,
  wordId: string,
): P0LearningUiCommand | null {
  if (!model.visible || !model.inRange || !MANIFEST.scope.wordIds.includes(wordId as never)) return null;
  const actionId = model.words.find((word) => word.wordId === wordId)?.nextActionId;
  return actionId && ACTION_IDS.has(actionId) ? Object.freeze({ kind: "perform_p0_action", actionId }) : null;
}

export interface RpgP0LearningUi { render(view: PrologueFlowP0LearningView): void; }

export function createRpgP0LearningUi(onCommand: (command: P0LearningUiCommand) => void): RpgP0LearningUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("P0 learning UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "p0-learning-root";
  root.innerHTML = P0_LEARNING_UI_TEMPLATE;
  anchor.parentElement.insertBefore(root, anchor);
  let current: P0LearningUiModel | null = null;
  let gridRenderKey = "";
  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-p0-word]") : null;
    if (!button || button.disabled || !current) return;
    const command = resolveP0LearningUiIntent(current, button.dataset.p0Word ?? "");
    if (command) onCommand(command);
  });
  return Object.freeze({ render(view: PrologueFlowP0LearningView) {
    const model = deriveP0LearningUiModel(view); current = model;
    const panel = required<HTMLElement>(root, "[data-p0-learning-panel]"); panel.hidden = !model.visible;
    required<HTMLElement>(root, "[data-p0-learning-assets]").hidden = !model.externalAssetsBlocked;
    required<HTMLElement>(root, "[data-p0-learning-count]").textContent = `${model.reachedWordCount} / ${model.targetWordCount}`;
    const grid = required<HTMLElement>(root, "[data-p0-learning-grid]");
    const nextGridRenderKey = JSON.stringify({ inRange: model.inRange, words: model.words });
    if (nextGridRenderKey !== gridRenderKey) {
      gridRenderKey = nextGridRenderKey;
      grid.replaceChildren();
      for (const word of model.words) {
      const row = document.createElement("article"); row.className = "p0-learning-word";
      const label = document.createElement("span"); label.innerHTML = `<strong>${word.wordId}</strong><small>${word.currentState} → ${word.targetState}</small>`;
      const button = document.createElement("button"); button.type = "button"; button.dataset.p0Word = word.wordId;
      button.textContent = word.nextActionId?.split(".").at(-1)?.replace("_", " ") ?? "完成";
      button.disabled = !model.inRange || word.nextActionId === null;
      button.setAttribute("aria-label", `${word.wordId}: ${button.textContent}`);
        row.append(label, button); grid.append(row);
      }
    }
    required<HTMLElement>(root, "[data-p0-learning-live]").textContent = !model.inRange
      ? "靠近 settlement.p0_inscription_archive 后才能提交恢复动作。"
      : model.reachedWordCount === 12 ? "12 个 P0 词均达到前三小时目标状态。" : "档案台已授权；请选择下一项语义动作。";
  } });
}

function required<T extends Element>(root: ParentNode, selector: string): T { const value = root.querySelector<T>(selector); if (!value) throw new Error(`missing ${selector}`); return value; }
