import generated from "./generated/content-runtime.v0.1.json";
import {
  CORE120_BANDS,
  readRuntimeCore120CurriculumManifest,
  type Core120Band,
} from "./content/runtime-core120-curriculum-manifest";
import type { PrologueFlowCore120LearningView } from "./game/prologue-flow";
import type { Core120LearningActionId } from "./learning/core120-campaign";

const MANIFEST = readRuntimeCore120CurriculumManifest(generated);
const ACTION_IDS = new Set(MANIFEST.scope.wordIds.flatMap((wordId) =>
  MANIFEST.actionKinds.map((kind) => `core120.${wordId}.${kind}`)));

export type Core120LearningUiCommand = Readonly<{
  kind: "perform_core120_action";
  actionId: Core120LearningActionId;
}>;

export interface Core120LearningUiModel {
  readonly visible: boolean;
  readonly selectedBand: Core120Band;
  readonly inRange: boolean;
  readonly p0PrerequisiteComplete: boolean;
  readonly externalAssetsBlocked: boolean;
  readonly completedWordCount: number;
  readonly totalWordCount: 120;
  readonly completedSemanticActionCount: number;
  readonly totalSemanticActionCount: 600;
  readonly bandWordCounts: Readonly<Record<Core120Band, number>>;
  readonly words: PrologueFlowCore120LearningView["words"];
}

export const CORE120_LEARNING_UI_TEMPLATE = `
  <section class="core120-learning-panel" data-core120-learning-panel hidden aria-labelledby="core120-learning-title">
    <div class="panel-heading">
      <div><p class="eyebrow">PU-120 / RECOVERY CAMPAIGN</p><h2 id="core120-learning-title">120 字语义档案</h2></div>
      <strong data-core120-learning-count>0 / 600</strong>
    </div>
    <p class="core120-learning-copy">在公共档案台逐步完成发现、调谐、双情境与误解修复。界面只提交机器 action ID。</p>
    <p class="core120-learning-prerequisite" data-core120-prerequisite role="status"></p>
    <p class="core120-learning-assets" data-core120-assets role="status">发音与正式字形素材尚未通过私有资产审批；当前只开放可验证语义进度。</p>
    <div class="core120-band-tabs" data-core120-band-tabs role="tablist" aria-label="课程阶段"></div>
    <div class="core120-learning-grid" data-core120-learning-grid></div>
    <p class="core120-learning-live" data-core120-learning-live role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;

export function deriveCore120LearningUiModel(
  view: PrologueFlowCore120LearningView,
  selectedBand: Core120Band,
): Core120LearningUiModel {
  const unique = new Set(view.words.map((word) => word.wordId));
  const validWords = view.words.length === 120 && unique.size === 120 &&
    MANIFEST.scope.wordIds.every((wordId) => {
      const word = view.words.find((candidate) => candidate.wordId === wordId);
      const expectedActions = MANIFEST.actionKinds.map((kind) => `core120.${wordId}.${kind}`);
      const completed = word?.completedActionIds ?? [];
      const completedPrefixValid = completed.length <= expectedActions.length && completed.every((actionId, index) =>
        actionId === expectedActions[index]);
      const expectedNext = completedPrefixValid ? expectedActions[completed.length] ?? null : null;
      return word?.band === MANIFEST.words[wordId]?.curriculumBand &&
        word.visualDomainId === MANIFEST.words[wordId]?.visualDomainId &&
        completedPrefixValid && word.nextActionId === expectedNext;
    });
  const bandWordCounts = Object.freeze(Object.fromEntries(CORE120_BANDS.map((band) => [
    band,
    validWords ? view.words.filter((word) => word.band === band).length : 0,
  ])) as unknown as Record<Core120Band, number>);
  const selectedWords = validWords
    ? Object.freeze(view.words.filter((word) => word.band === selectedBand))
    : Object.freeze([]);
  const derivedCompletedWordCount = validWords ? view.words.filter((word) => word.nextActionId === null).length : 0;
  const derivedCompletedSemanticActionCount = validWords
    ? view.words.reduce((total, word) => total + word.completedActionIds.length, 0)
    : 0;
  const countersValid = view.totalWordCount === 120 && view.totalSemanticActionCount === 600 &&
    view.completedWordCount === derivedCompletedWordCount &&
    view.completedSemanticActionCount === derivedCompletedSemanticActionCount;
  return Object.freeze({
    visible: view.mode === "settlement" && validWords && countersValid,
    selectedBand,
    inRange: view.station.inRange,
    p0PrerequisiteComplete: view.p0PrerequisiteComplete,
    externalAssetsBlocked: !view.externalAssets.fullAssetAcceptance ||
      view.externalAssets.pronunciationAudio !== "approved" ||
      view.externalAssets.glyphVisuals !== "approved" ||
      view.externalAssets.glyphCatalog !== "approved",
    completedWordCount: countersValid ? derivedCompletedWordCount : 0,
    totalWordCount: 120,
    completedSemanticActionCount: countersValid ? derivedCompletedSemanticActionCount : 0,
    totalSemanticActionCount: 600,
    bandWordCounts,
    words: selectedWords,
  });
}

export function resolveCore120LearningUiIntent(
  model: Core120LearningUiModel,
  wordId: string,
): Core120LearningUiCommand | null {
  if (!model.visible || !model.inRange || !model.p0PrerequisiteComplete) return null;
  const actionId = model.words.find((word) => word.wordId === wordId)?.nextActionId;
  return actionId && ACTION_IDS.has(actionId)
    ? Object.freeze({ kind: "perform_core120_action", actionId })
    : null;
}

export interface RpgCore120LearningUi {
  render(view: PrologueFlowCore120LearningView): void;
}

export function createRpgCore120LearningUi(
  onCommand: (command: Core120LearningUiCommand) => void,
): RpgCore120LearningUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("core120 learning UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "core120-learning-root";
  root.innerHTML = CORE120_LEARNING_UI_TEMPLATE;
  anchor.parentElement.insertBefore(root, anchor);
  let selectedBand: Core120Band = "P0";
  let current: Core120LearningUiModel | null = null;

  root.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const bandButton = element?.closest<HTMLButtonElement>("button[data-core120-band]");
    const requestedBand = bandButton?.dataset.core120Band;
    if (requestedBand && CORE120_BANDS.includes(requestedBand as Core120Band)) {
      selectedBand = requestedBand as Core120Band;
      if (current) renderModel(currentView(current), selectedBand);
      return;
    }
    const wordButton = element?.closest<HTMLButtonElement>("button[data-core120-word]");
    if (!wordButton || wordButton.disabled || !current) return;
    const command = resolveCore120LearningUiIntent(current, wordButton.dataset.core120Word ?? "");
    if (command) onCommand(command);
  });

  let lastView: PrologueFlowCore120LearningView | null = null;
  const currentView = (_model: Core120LearningUiModel): PrologueFlowCore120LearningView => {
    if (!lastView) throw new Error("core120 learning view is unavailable");
    return lastView;
  };
  const renderModel = (view: PrologueFlowCore120LearningView, band: Core120Band): void => {
    lastView = view;
    const model = deriveCore120LearningUiModel(view, band);
    current = model;
    const panel = required<HTMLElement>(root, "[data-core120-learning-panel]");
    panel.hidden = !model.visible;
    required<HTMLElement>(root, "[data-core120-learning-count]").textContent =
      `${model.completedSemanticActionCount} / ${model.totalSemanticActionCount}`;
    required<HTMLElement>(root, "[data-core120-assets]").hidden = !model.externalAssetsBlocked;
    required<HTMLElement>(root, "[data-core120-prerequisite]").textContent = model.p0PrerequisiteComplete
      ? `P0 前置完成 · ${model.completedWordCount} / ${model.totalWordCount} 字完成`
      : "先完成 P0 12 字目标，120 字档案才会解锁。";

    const tabs = required<HTMLElement>(root, "[data-core120-band-tabs]");
    tabs.replaceChildren(...CORE120_BANDS.map((candidate) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.core120Band = candidate;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(candidate === model.selectedBand));
      button.textContent = `${candidate} · ${model.bandWordCounts[candidate]}`;
      return button;
    }));

    const grid = required<HTMLElement>(root, "[data-core120-learning-grid]");
    grid.replaceChildren();
    for (const word of model.words) {
      const row = document.createElement("article");
      row.className = "core120-learning-word";
      const label = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = word.wordId;
      const detail = document.createElement("small");
      detail.textContent = `${word.currentState} · ${word.visualDomainId.replace("D_", "")}`;
      label.append(title, detail);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.core120Word = word.wordId;
      button.textContent = word.nextActionId?.split(".").at(-1)?.replaceAll("_", " ") ?? "完成";
      button.disabled = !model.inRange || !model.p0PrerequisiteComplete || word.nextActionId === null;
      button.setAttribute("aria-label", `${word.wordId}: ${button.textContent}`);
      row.append(label, button);
      grid.append(row);
    }
    required<HTMLElement>(root, "[data-core120-learning-live]").textContent = !model.p0PrerequisiteComplete
      ? "P0 前置尚未完成。"
      : !model.inRange
        ? "靠近 settlement.p0_inscription_archive 才能提交学习动作。"
        : model.completedSemanticActionCount === 600
          ? "120 字、600 个语义动作已全部完成。"
          : `${model.selectedBand} 阶段可继续训练。`;
  };

  return Object.freeze({ render(view: PrologueFlowCore120LearningView) { renderModel(view, selectedBand); } });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`missing ${selector}`);
  return value;
}
