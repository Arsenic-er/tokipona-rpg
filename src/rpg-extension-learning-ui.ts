import type {
  ExtensionLearningActionView,
  ExtensionLearningRuntimeView,
} from "./learning/extension-learning-runtime";

const ACTION_KINDS = new Set(["discover", "attune", "context_0", "context_1", "repair"]);

export type ExtensionLearningUiCommand = Readonly<{
  kind: "perform_extension_learning_action";
  corpusId: string;
  actionId: string;
}>;

export interface ExtensionLearningUiModel {
  readonly visible: boolean;
  readonly activeSceneId: string;
  readonly runtimeAuthorityAvailable: boolean;
  readonly completedWordCount: number;
  readonly totalWordCount: number;
  readonly actions: readonly ExtensionLearningActionView[];
}

export function deriveExtensionLearningUiModel(
  view: ExtensionLearningRuntimeView,
): ExtensionLearningUiModel {
  const corpora = view.corpora;
  const words = corpora.flatMap((corpus) => corpus.words);
  const actions = words.flatMap((word) => word.actions);
  const actionIds = new Set(actions.map((action) => action.actionId));
  const wordCount = corpora.reduce((sum, corpus) => sum + corpus.totalWordCount, 0);
  const completedWordCount = words.filter((word) => word.completed).length;
  const structurallyValid = view.enabled && view.admittedCorpusCount === corpora.length &&
    view.totalWordCount === wordCount && words.length === wordCount &&
    view.completedWordCount === completedWordCount &&
    actionIds.size === actions.length &&
    corpora.every((corpus) => {
      const corpusWordsValid = corpus.words.every((word) => {
        const actionsValid = word.actions.every((action) =>
          action.corpusId === corpus.corpusId && action.wordId === word.wordId &&
          ACTION_KINDS.has(action.kind) &&
          action.available === (!action.completed && action.prerequisitesSatisfied && action.inRange));
        return word.actions.length === 5 &&
          word.completed === word.actions.every((action) => action.completed) && actionsValid;
      });
      return corpus.totalWordCount === corpus.words.length &&
        corpus.completedWordCount === corpus.words.filter((word) => word.completed).length &&
        corpusWordsValid;
    });
  return Object.freeze({
    visible: structurallyValid,
    activeSceneId: view.activeSceneId,
    runtimeAuthorityAvailable: structurallyValid && view.runtimeAuthorityAvailable,
    completedWordCount: structurallyValid ? completedWordCount : 0,
    totalWordCount: structurallyValid ? wordCount : 0,
    actions: Object.freeze(structurallyValid ? actions : []),
  });
}

export function resolveExtensionLearningUiIntent(
  model: ExtensionLearningUiModel,
  corpusId: string,
  actionId: string,
): ExtensionLearningUiCommand | null {
  const action = model.actions.find((candidate) =>
    candidate.corpusId === corpusId && candidate.actionId === actionId);
  return model.visible && model.runtimeAuthorityAvailable && action?.available === true
    ? Object.freeze({ kind: "perform_extension_learning_action", corpusId, actionId })
    : null;
}

export interface RpgExtensionLearningUi {
  render(view: ExtensionLearningRuntimeView): void;
}

export function createRpgExtensionLearningUi(
  onCommand: (command: ExtensionLearningUiCommand) => void,
): RpgExtensionLearningUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("extension learning UI requires the status element");
  const root = document.createElement("section");
  root.className = "extension-learning-panel";
  root.hidden = true;
  root.setAttribute("aria-labelledby", "extension-learning-title");
  root.innerHTML = `
    <div class="panel-heading">
      <div><p class="eyebrow">REVIEWED EXTENSION CORPUS</p>
        <h2 id="extension-learning-title">扩展语料练习</h2></div>
      <strong data-extension-count>0 / 0</strong>
    </div>
    <p data-extension-authority role="status"></p>
    <div data-extension-actions></div>
    <p data-extension-live role="status" aria-live="polite" aria-atomic="true"></p>`;
  anchor.parentElement.insertBefore(root, anchor);
  const count = required<HTMLElement>(root, "[data-extension-count]");
  const authority = required<HTMLElement>(root, "[data-extension-authority]");
  const actionList = required<HTMLElement>(root, "[data-extension-actions]");
  const live = required<HTMLElement>(root, "[data-extension-live]");
  let model: ExtensionLearningUiModel | null = null;
  actionList.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "button[data-corpus-id][data-action-id]");
    if (!button || model === null) return;
    const command = resolveExtensionLearningUiIntent(
      model, button.dataset.corpusId ?? "", button.dataset.actionId ?? "");
    if (command === null) {
      live.textContent = "该语义动作尚未获得当前位置与前置条件授权。";
      return;
    }
    onCommand(command);
    live.textContent = `已提交语义动作：${command.actionId}`;
  });
  return Object.freeze({
    render(view: ExtensionLearningRuntimeView): void {
      model = deriveExtensionLearningUiModel(view);
      root.hidden = !model.visible;
      if (!model.visible) {
        actionList.replaceChildren();
        return;
      }
      count.textContent = `${model.completedWordCount} / ${model.totalWordCount}`;
      authority.textContent = model.runtimeAuthorityAvailable
        ? `当前位置：${model.activeSceneId}`
        : "当前场景没有可提交的运行时权威。";
      const fragment = document.createDocumentFragment();
      for (const action of model.actions) {
        const row = document.createElement("div");
        row.className = "extension-learning-action";
        const label = document.createElement("span");
        label.textContent = `${action.wordId} · ${action.kind}`;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.corpusId = action.corpusId;
        button.dataset.actionId = action.actionId;
        button.disabled = !action.available;
        button.textContent = action.completed ? "已完成" : action.inAuthorityScene ?
          action.inRange ? "执行" : "靠近目标" : `前往 ${action.sceneId}`;
        row.append(label, button);
        fragment.append(row);
      }
      actionList.replaceChildren(fragment);
    },
  });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`extension learning UI element missing: ${selector}`);
  return value;
}
