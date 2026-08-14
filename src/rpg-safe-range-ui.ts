import generatedRuntimeArtifact from "./generated/content-runtime.v0.1.json";
import { readRuntimeSafeRangeManifest } from "./content/runtime-safe-range-manifest";
import {
  type PrologueFlowSafeRangeCompileResult,
  type PrologueFlowSafeRangePreview,
  type PrologueFlowSafeRangeView,
} from "./game/prologue-flow";
import type { SettlementAttackQualificationSemanticActionId } from "./game/prologue-attack-qualification";
import {
  PROLOGUE_SAFE_RANGE_SCENE_ID,
  PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID,
} from "./game/prologue-safe-range";
import {
  SAFE_RANGE_TARGET_CLASSES,
  type SafeRangeTargetClass,
} from "./game/safe-range-physics";

export type SafeRangeWaterSource = PrologueFlowSafeRangePreview["waterSource"];
export type SafeRangePromptLevel = PrologueFlowSafeRangePreview["promptLevel"];

export type SafeRangeUiCommand =
  | Readonly<{ kind: "perform_qualification_action"; actionId: SettlementAttackQualificationSemanticActionId }>
  | Readonly<{ kind: "calibrate_attack_capacity" }>
  | Readonly<{ kind: "grant_range_trial_permission" }>
  | Readonly<{ kind: "enter_safe_range" }>
  | Readonly<{ kind: "compile"; targetClass: SafeRangeTargetClass;
      promptLevel: SafeRangePromptLevel; waterSource: SafeRangeWaterSource }>
  | Readonly<{ kind: "execute"; previewId: string }>
  | Readonly<{ kind: "inspect_material_table" }>
  | Readonly<{ kind: "return_settlement" }>
  | Readonly<{ kind: "recover_softlock" }>
  | Readonly<{ kind: "reset_checkpoint" }>;

export interface SafeRangeUiSelection {
  readonly targetClass: SafeRangeTargetClass;
  readonly waterSource: SafeRangeWaterSource;
  readonly promptLevel: SafeRangePromptLevel;
}

export interface SafeRangeUiTargetModel {
  readonly targetClass: SafeRangeTargetClass;
  readonly label: string;
  readonly materialClass: string;
  readonly completed: boolean;
  readonly selected: boolean;
  readonly enabled: boolean;
}

export interface SafeRangeQualificationActionModel {
  readonly actionId: string;
  readonly taskFamilyId: string;
  readonly evidenceType: string;
  readonly promptLevel: 0 | 1 | null;
  readonly unrelated: boolean;
  readonly available: boolean;
  readonly completed: boolean;
  readonly enabled: boolean;
}

export interface SafeRangeUiModel {
  readonly gatewayVisible: boolean;
  readonly canEnter: boolean;
  readonly qualificationActions: readonly SafeRangeQualificationActionModel[];
  readonly settlementActionsComplete: boolean;
  readonly attackCapacityCalibrated: boolean;
  readonly returnObservationComplete: boolean;
  readonly canCalibrate: boolean;
  readonly canGrantPermission: boolean;
  readonly panelVisible: boolean;
  readonly contractValid: boolean;
  readonly selection: SafeRangeUiSelection;
  readonly targets: readonly SafeRangeUiTargetModel[];
  readonly currentMp: number;
  readonly maxMp: number;
  readonly waterSources: readonly Readonly<{
    waterSource: SafeRangeWaterSource;
    label: string;
    quotedMp: 13 | 18;
    selected: boolean;
  }>[];
  readonly prompts: readonly Readonly<{
    promptLevel: SafeRangePromptLevel;
    label: "H0" | "H1";
    selected: boolean;
  }>[];
  readonly canonicalAst: "word.telo o word.tawa word.wawa";
  readonly effect: Readonly<{
    phase: "liquid";
    massMu: 2;
    kineticEu: 8;
    speedBandMps: readonly [3, 5];
  }>;
  readonly preview: PrologueFlowSafeRangePreview | null;
  readonly previewQuotedMp: 13 | 18 | null;
  readonly canCompile: boolean;
  readonly canExecute: boolean;
  readonly canInspectTable: boolean;
  readonly canReturn: boolean;
  readonly firstAttackSignatureAvailable: boolean;
  readonly firstAttackSignatureCompleted: boolean;
  readonly targetPolicy: "仅限四个惰性靶具；人物与生物不是目标";
  readonly liveStatus: string;
}

export type SafeRangeUiIntent =
  | Readonly<{ kind: "perform_qualification_action"; actionId: SettlementAttackQualificationSemanticActionId }>
  | Readonly<{ kind: "calibrate_attack_capacity" }>
  | Readonly<{ kind: "grant_range_trial_permission" }>
  | Readonly<{ kind: "enter_safe_range" }>
  | Readonly<{ kind: "select_target"; targetClass: string }>
  | Readonly<{ kind: "select_water_source"; waterSource: string }>
  | Readonly<{ kind: "select_prompt_level"; promptLevel: number }>
  | Readonly<{ kind: "compile" }>
  | Readonly<{ kind: "execute" }>
  | Readonly<{ kind: "inspect_material_table" }>
  | Readonly<{ kind: "return_settlement" }>
  | Readonly<{ kind: "recover_softlock" }>
  | Readonly<{ kind: "reset_checkpoint" }>;

export interface RpgSafeRangeUi {
  render(snapshot: PrologueFlowSafeRangeView, compileResult?: PrologueFlowSafeRangeCompileResult | null): void;
}

const CONTRACT = readRuntimeSafeRangeManifest(generatedRuntimeArtifact);
const SETTLEMENT_QUALIFICATION_ACTIONS = Object.freeze([
  ...CONTRACT.parallelCalibration.actions.filter((action) =>
    action.authoritySceneId === CONTRACT.parallelCalibration.authoritySceneId &&
    !action.existingDomainEventMappingOnly),
  ...CONTRACT.parallelCalibration.unrelatedSemanticWorldActions,
]);

const QUALIFICATION_ACTION_IDS = new Set<string>(SETTLEMENT_QUALIFICATION_ACTIONS.map((action) => action.actionId));
const isQualificationActionId = (value: unknown): value is SettlementAttackQualificationSemanticActionId =>
  typeof value === "string" && QUALIFICATION_ACTION_IDS.has(value);

const DEFAULT_SELECTION: SafeRangeUiSelection = Object.freeze({
  targetClass: "wood_dummy",
  waterSource: "bound_existing",
  promptLevel: 0,
});

const TARGET_LABELS: Readonly<Record<SafeRangeTargetClass, string>> = Object.freeze({
  wood_dummy: "木制假人",
  sandbag: "纤维沙袋",
  minecart: "制动矿车",
  hanging_stone: "悬挂石块",
});

const WATER_SOURCES = Object.freeze([
  Object.freeze({ waterSource: "bound_existing" as const, label: "绑定既有水", quotedMp: 13 as const }),
  Object.freeze({ waterSource: "manifest_default" as const, label: "显现默认水", quotedMp: 18 as const }),
]);

const CANONICAL_AST = "word.telo o word.tawa word.wawa" as const;
const EFFECT = Object.freeze({
  phase: "liquid" as const,
  massMu: 2 as const,
  kineticEu: 8 as const,
  speedBandMps: Object.freeze([3, 5]) as readonly [3, 5],
});

const isTargetClass = (value: unknown): value is SafeRangeTargetClass =>
  typeof value === "string" && (SAFE_RANGE_TARGET_CLASSES as readonly string[]).includes(value);

const isWaterSource = (value: unknown): value is SafeRangeWaterSource =>
  value === "bound_existing" || value === "manifest_default";

const isPromptLevel = (value: unknown): value is SafeRangePromptLevel => value === 0 || value === 1;

function normalizedSelection(candidate?: Partial<SafeRangeUiSelection>): SafeRangeUiSelection {
  return Object.freeze({
    targetClass: isTargetClass(candidate?.targetClass) ? candidate.targetClass : DEFAULT_SELECTION.targetClass,
    waterSource: isWaterSource(candidate?.waterSource) ? candidate.waterSource : DEFAULT_SELECTION.waterSource,
    promptLevel: isPromptLevel(candidate?.promptLevel) ? candidate.promptLevel : DEFAULT_SELECTION.promptLevel,
  });
}

function exactPreview(
  result: PrologueFlowSafeRangeCompileResult | null | undefined,
  selection: SafeRangeUiSelection,
): PrologueFlowSafeRangePreview | null {
  if (!result?.ok) return null;
  const preview = result.preview;
  if (preview === null || preview.previewId.trim().length === 0) return null;
  const expectedQuote = selection.waterSource === "bound_existing" ? 13 : 18;
  if (preview.targetClass !== selection.targetClass || preview.waterSource !== selection.waterSource ||
      preview.promptLevel !== selection.promptLevel || preview.quotedMp !== expectedQuote ||
      preview.canonicalAst.subjectHead !== "word.telo" || preview.canonicalAst.commandParticle !== "o" ||
      preview.canonicalAst.action !== "word.tawa" || preview.canonicalAst.manner !== "word.wawa" ||
      preview.effect.phase !== "liquid" || preview.effect.massMu !== 2 || preview.effect.kineticEu !== 8 ||
      preview.effect.speedBandMps.length !== 2 || preview.effect.speedBandMps[0] !== 3 ||
      preview.effect.speedBandMps[1] !== 5) return null;
  return preview;
}

export function deriveSafeRangeUiModel(
  snapshot: PrologueFlowSafeRangeView,
  compileResult: PrologueFlowSafeRangeCompileResult | null = null,
  selected: Partial<SafeRangeUiSelection> = DEFAULT_SELECTION,
): SafeRangeUiModel {
  const selection = normalizedSelection(selected);
  const safeRange = snapshot.safeRange;
  const gatewayVisible = snapshot.mode === "settlement" &&
    snapshot.sceneId === PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID;
  const panelVisible = snapshot.mode === "safe_range" &&
    snapshot.sceneId === PROLOGUE_SAFE_RANGE_SCENE_ID && safeRange !== null;
  const qualificationActions = Object.freeze(snapshot.qualificationActions.map((action) => Object.freeze({
    ...action,
    enabled: gatewayVisible && action.available && !action.completed,
  })));
  const settlementActionsComplete = snapshot.settlementActionsComplete;
  const qualificationGraphComplete = snapshot.qualificationGraphComplete;
  const attackCapacityCalibrated = snapshot.attackCapacityCalibrated;
  const returnObservationComplete = snapshot.returnObservationComplete;
  const permissionGranted = snapshot.permissionGranted;
  const targets = Object.freeze(SAFE_RANGE_TARGET_CLASSES.map((targetClass) => {
    const state = safeRange?.targets[targetClass] ?? {
      materialClass: "unavailable", completed: false,
    };
    return Object.freeze({
      targetClass,
      label: TARGET_LABELS[targetClass],
      materialClass: state.materialClass,
      completed: state.completed,
      selected: selection.targetClass === targetClass,
      enabled: panelVisible && safeRange?.permissionGranted === true && !state.completed,
    });
  }));
  const selectedTarget = targets.find((target) => target.targetClass === selection.targetClass)!;
  const preview = exactPreview(compileResult, selection);
  const compileContractValid = compileResult === null || !compileResult.ok || preview !== null;
  const canCompile = panelVisible && safeRange?.permissionGranted === true &&
    !selectedTarget.completed && preview === null;
  const allTargetsCompleted = targets.every((target) => target.completed);
  const liveStatus = statusFor(snapshot, compileResult, preview, canCompile, allTargetsCompleted);

  return Object.freeze({
    gatewayVisible,
    canEnter: gatewayVisible && permissionGranted,
    qualificationActions,
    settlementActionsComplete,
    attackCapacityCalibrated,
    returnObservationComplete,
    canCalibrate: gatewayVisible && settlementActionsComplete && qualificationGraphComplete &&
      !attackCapacityCalibrated,
    canGrantPermission: gatewayVisible && attackCapacityCalibrated &&
      returnObservationComplete && !permissionGranted,
    panelVisible,
    contractValid: compileContractValid,
    selection,
    targets,
    currentMp: snapshot.currentMp,
    maxMp: snapshot.maxMp,
    waterSources: Object.freeze(WATER_SOURCES.map((source) => Object.freeze({
      ...source,
      selected: source.waterSource === selection.waterSource,
    }))),
    prompts: Object.freeze(([0, 1] as const).map((promptLevel) => Object.freeze({
      promptLevel,
      label: `H${promptLevel}` as "H0" | "H1",
      selected: promptLevel === selection.promptLevel,
    }))),
    canonicalAst: CANONICAL_AST,
    effect: EFFECT,
    preview,
    previewQuotedMp: preview?.quotedMp ?? null,
    canCompile,
    canExecute: panelVisible && safeRange?.permissionGranted === true &&
      preview !== null && !selectedTarget.completed,
    canInspectTable: panelVisible && allTargetsCompleted &&
      safeRange?.firstAttackSignatureCompleted === false,
    canReturn: panelVisible,
    firstAttackSignatureAvailable: safeRange?.firstAttackSignatureAvailable ?? false,
    firstAttackSignatureCompleted: safeRange?.firstAttackSignatureCompleted ?? false,
    targetPolicy: "仅限四个惰性靶具；人物与生物不是目标",
    liveStatus,
  });
}

function statusFor(
  snapshot: PrologueFlowSafeRangeView,
  compileResult: PrologueFlowSafeRangeCompileResult | null,
  preview: PrologueFlowSafeRangePreview | null,
  canCompile: boolean,
  allTargetsCompleted: boolean,
): string {
  if (snapshot.mode === "settlement" &&
      snapshot.sceneId === PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID) {
    return snapshot.permissionGranted
      ? "靶场许可已核验，可以进入 N08。" : "完成聚落校准后才会开放 N08。";
  }
  if (snapshot.mode !== "safe_range" || snapshot.sceneId !== PROLOGUE_SAFE_RANGE_SCENE_ID ||
      snapshot.safeRange === null) return "";
  if (snapshot.safeRange.firstAttackSignatureCompleted) {
    return "四种材料对照已完成；首个攻击签名校准完成。";
  }
  if (compileResult?.ok && preview === null) return "编译预览与当前语义选择不一致；已禁止执行。";
  if (compileResult && !compileResult.ok) return `编译未通过：${compileResult.reason}。未扣除 MP。`;
  if (preview) return `预览就绪：${preview.quotedMp} MP，执行前仍会复核世界状态。`;
  if (allTargetsCompleted) return "四个惰性靶具均已记录；请检查材料碰撞表。";
  return canCompile ? "选择惰性靶具、水源和 H0/H1，然后编译结构化表达。" : "当前目标不可编译。";
}

export function resolveSafeRangeUiIntent(
  model: SafeRangeUiModel,
  intent: SafeRangeUiIntent,
): SafeRangeUiCommand | null {
  if (intent.kind === "perform_qualification_action") {
    const action = model.qualificationActions.find((candidate) => candidate.actionId === intent.actionId);
    return action?.enabled && isQualificationActionId(intent.actionId)
      ? Object.freeze({ kind: "perform_qualification_action", actionId: intent.actionId }) : null;
  }
  if (intent.kind === "calibrate_attack_capacity") {
    return model.canCalibrate ? Object.freeze({ kind: "calibrate_attack_capacity" }) : null;
  }
  if (intent.kind === "grant_range_trial_permission") {
    return model.canGrantPermission ? Object.freeze({ kind: "grant_range_trial_permission" }) : null;
  }
  if (intent.kind === "enter_safe_range") {
    return model.canEnter ? Object.freeze({ kind: "enter_safe_range" }) : null;
  }
  if (intent.kind === "select_target" || intent.kind === "select_water_source" ||
      intent.kind === "select_prompt_level") return null;
  if (intent.kind === "compile") {
    return model.canCompile ? Object.freeze({ kind: "compile", ...model.selection }) : null;
  }
  if (intent.kind === "execute") {
    return model.canExecute && model.preview
      ? Object.freeze({ kind: "execute", previewId: model.preview.previewId }) : null;
  }
  if (intent.kind === "inspect_material_table") {
    return model.canInspectTable ? Object.freeze({ kind: "inspect_material_table" }) : null;
  }
  if (intent.kind === "return_settlement") {
    return model.canReturn ? Object.freeze({ kind: "return_settlement" }) : null;
  }
  if (intent.kind === "recover_softlock") {
    return model.panelVisible ? Object.freeze({ kind: "recover_softlock" }) : null;
  }
  if (intent.kind === "reset_checkpoint") {
    return model.panelVisible ? Object.freeze({ kind: "reset_checkpoint" }) : null;
  }
  return null;
}
export function moveSafeRangeFocus(currentIndex: number, key: string, itemCount: number): number {
  if (itemCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (Math.max(0, currentIndex) + 1) % itemCount;
  if (key === "ArrowLeft" || key === "ArrowUp") return (Math.max(0, currentIndex) - 1 + itemCount) % itemCount;
  return Math.min(itemCount - 1, Math.max(0, currentIndex));
}

export const SAFE_RANGE_UI_TEMPLATE = `
  <section class="safe-range-panel safe-range-gateway" data-safe-range-gateway hidden aria-labelledby="safe-range-gateway-heading">
    <p class="eyebrow">N02 → N08 / SAFE RANGE</p>
    <h2 id="safe-range-gateway-heading">惰性材料靶场</h2>
    <p>资格状态只从已提交回执与保护旗标读取；按钮不会提交坐标、world revision、proof 或旗标覆盖。</p>
    <section class="safe-range-calibration" aria-labelledby="safe-range-calibration-heading">
      <h3 id="safe-range-calibration-heading">N02 平行校准站</h3>
      <div class="safe-range-calibration-actions" data-safe-range-qualification-actions
        aria-label="聚落资格动作"></div>
      <p class="safe-range-calibration-copy" data-safe-range-calibration-status
        role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="safe-range-calibration-commits">
        <button type="button" data-safe-range-intent="calibrate_attack_capacity">提交容量校准</button>
        <button type="button" data-safe-range-intent="grant_range_trial_permission">核发靶场许可</button>
        <button type="button" data-safe-range-intent="enter_safe_range">进入 N08</button>
      </div>
    </section>  </section>
  <section class="safe-range-panel" data-safe-range-panel hidden aria-labelledby="safe-range-heading">
    <div class="panel-heading"><div><p class="eyebrow">N08 / INERT TRANSFER</p><h2 id="safe-range-heading">首个攻击签名校准</h2></div>
      <strong data-safe-range-completion>进行中</strong></div>
    <p class="safe-range-policy" data-safe-range-policy></p>
    <div class="safe-range-state" aria-label="靶场资源与签名状态">
      <span>MP<strong data-safe-range-mp>--</strong></span>
      <span>可用<strong data-safe-range-available>否</strong></span>
      <span>完成<strong data-safe-range-completed>否</strong></span>
    </div>
    <section aria-labelledby="safe-range-target-heading"><h3 id="safe-range-target-heading">四个惰性材料靶具</h3>
      <div data-safe-range-targets role="radiogroup" aria-label="选择惰性材料靶具"></div>
    </section>
    <section aria-labelledby="safe-range-source-heading"><h3 id="safe-range-source-heading">水源</h3>
      <div class="safe-range-options safe-range-sources" role="radiogroup" aria-label="选择水源">
        <button type="button" role="radio" data-safe-range-source="bound_existing">绑定既有水 · 13 MP</button>
        <button type="button" role="radio" data-safe-range-source="manifest_default">显现默认水 · 18 MP</button>
      </div>
    </section>
    <section aria-labelledby="safe-range-prompt-heading"><h3 id="safe-range-prompt-heading">提示级别</h3>
      <div class="safe-range-options safe-range-prompts" role="radiogroup" aria-label="选择提示级别">
        <button type="button" role="radio" data-safe-range-prompt="0">H0</button>
        <button type="button" role="radio" data-safe-range-prompt="1">H1</button>
      </div>
    </section>
    <section class="safe-range-expression" aria-labelledby="safe-range-expression-heading"><h3 id="safe-range-expression-heading">结构化表达</h3>
      <code data-safe-range-ast>word.telo o word.tawa word.wawa</code>
      <p>液体 · 2 MU · 8 EU · 初速 3–5 m/s</p>
      <p class="safe-range-preview" data-safe-range-preview>尚未建立预览</p>
      <div class="safe-range-expression-actions"><button type="button" data-safe-range-intent="compile">编译</button>
        <button type="button" data-safe-range-intent="execute">执行已核验预览</button></div>
    </section>
    <div class="safe-range-actions"><button type="button" data-safe-range-intent="inspect_material_table">检查材料碰撞表</button>
      <button type="button" data-safe-range-intent="return_settlement">返回 N02</button>
      <button type="button" data-safe-range-intent="recover_softlock">恢复局部靶场</button>
      <button type="button" data-safe-range-intent="reset_checkpoint">重置到检查点</button></div>
    <p data-safe-range-live role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;

export function createRpgSafeRangeUi(onCommand: (command: SafeRangeUiCommand) => void): RpgSafeRangeUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("RPG safe-range UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "safe-range-root";
  root.innerHTML = SAFE_RANGE_UI_TEMPLATE;
  anchor.parentElement.insertBefore(root, anchor);

  let selection = DEFAULT_SELECTION;
  let currentModel: SafeRangeUiModel | null = null;
  let lastSnapshot: PrologueFlowSafeRangeView | null = null;
  let lastCompileResult: PrologueFlowSafeRangeCompileResult | null = null;
  let qualificationRenderKey = "";
  let targetRenderKey = "";

  const rerender = (): void => {
    if (lastSnapshot) render(lastSnapshot, lastCompileResult);
  };

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled || !currentModel) return;
    const intent = intentFromButton(button);
    if (!intent) return;
    if (intent.kind === "select_target") {
      const target = currentModel.targets.find((candidate) => candidate.targetClass === intent.targetClass);
      if (!target?.enabled) return;
      selection = Object.freeze({ ...selection, targetClass: target.targetClass });
      rerender();
      return;
    }
    if (intent.kind === "select_water_source") {
      if (!isWaterSource(intent.waterSource)) return;
      selection = Object.freeze({ ...selection, waterSource: intent.waterSource });
      rerender();
      return;
    }
    if (intent.kind === "select_prompt_level") {
      if (!isPromptLevel(intent.promptLevel)) return;
      selection = Object.freeze({ ...selection, promptLevel: intent.promptLevel });
      rerender();
      return;
    }
    const command = resolveSafeRangeUiIntent(currentModel, intent);
    if (command) onCommand(command);
  });
  root.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
      .filter((button) => button.offsetParent !== null);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = moveSafeRangeFocus(current, event.key, buttons.length);
    if (next >= 0) {
      event.preventDefault();
      buttons[next]!.focus();
    }
  });

  const render = (
    snapshot: PrologueFlowSafeRangeView,
    compileResult: PrologueFlowSafeRangeCompileResult | null = null,
  ): void => {
    lastSnapshot = snapshot;
    lastCompileResult = compileResult;
    currentModel = deriveSafeRangeUiModel(snapshot, compileResult, selection);
    required<HTMLElement>(root, "[data-safe-range-gateway]").hidden = !currentModel.gatewayVisible;
    required<HTMLButtonElement>(root, "[data-safe-range-intent='enter_safe_range']").disabled = !currentModel.canEnter;
    const qualificationRoot = required<HTMLElement>(root, "[data-safe-range-qualification-actions]");
    const nextQualificationRenderKey = JSON.stringify(currentModel.qualificationActions);
    if (nextQualificationRenderKey !== qualificationRenderKey) {
      qualificationRenderKey = nextQualificationRenderKey;
      qualificationRoot.replaceChildren(...currentModel.qualificationActions.map((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.safeRangeQualificationAction = action.actionId;
        button.disabled = !action.enabled;
        const hint = action.promptLevel === null ? "world" : `H${action.promptLevel}`;
        button.textContent = `${action.completed ? "✓ " : ""}${action.actionId} · ${action.evidenceType} · ${hint}`;
        return button;
      }));
    }
    required<HTMLButtonElement>(root, "[data-safe-range-intent='calibrate_attack_capacity']").disabled =
      !currentModel.canCalibrate;
    required<HTMLButtonElement>(root, "[data-safe-range-intent='grant_range_trial_permission']").disabled =
      !currentModel.canGrantPermission;
    text(root, "[data-safe-range-calibration-status]",
      `N02 ${currentModel.qualificationActions.filter((action) => action.completed).length}/${currentModel.qualificationActions.length} · ` +
      `容量校准 ${currentModel.attackCapacityCalibrated ? "完成" : "未完成"} · ` +
      `N07 回流观察 ${currentModel.returnObservationComplete ? "完成" : "未完成"} · ` +
      `许可 ${currentModel.canEnter ? "已核发" : "未核发"}`);
    required<HTMLElement>(root, "[data-safe-range-panel]").hidden = !currentModel.panelVisible;
    if (!currentModel.panelVisible) return;
    text(root, "[data-safe-range-policy]", currentModel.targetPolicy);
    text(root, "[data-safe-range-mp]", `${currentModel.currentMp} / ${currentModel.maxMp}`);
    text(root, "[data-safe-range-available]", currentModel.firstAttackSignatureAvailable ? "是" : "否");
    text(root, "[data-safe-range-completed]", currentModel.firstAttackSignatureCompleted ? "是" : "否");
    text(root, "[data-safe-range-completion]", currentModel.firstAttackSignatureCompleted ? "已完成" : "进行中");
    text(root, "[data-safe-range-ast]", currentModel.canonicalAst);
    text(root, "[data-safe-range-preview]", currentModel.previewQuotedMp === null
      ? "尚未建立预览" : `已核验预览 · ${currentModel.previewQuotedMp} MP · 2 MU / 8 EU`);
    text(root, "[data-safe-range-live]", currentModel.liveStatus);

    const targetRoot = required<HTMLElement>(root, "[data-safe-range-targets]");
    const nextTargetRenderKey = JSON.stringify(currentModel.targets);
    if (nextTargetRenderKey !== targetRenderKey) {
      targetRenderKey = nextTargetRenderKey;
      targetRoot.replaceChildren(...currentModel.targets.map((target) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.dataset.safeRangeTarget = target.targetClass;
        button.setAttribute("aria-checked", String(target.selected));
        button.tabIndex = target.selected ? 0 : -1;
        button.disabled = !target.enabled;
        button.textContent = `${target.label} · ${target.materialClass}${target.completed ? " · 已记录" : ""}`;
        return button;
      }));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-safe-range-source]")) {
      const source = button.dataset.safeRangeSource;
      const selectedSource = currentModel.waterSources.find((candidate) => candidate.waterSource === source);
      button.setAttribute("aria-checked", String(selectedSource?.selected === true));
      button.tabIndex = selectedSource?.selected === true ? 0 : -1;
      button.disabled = !currentModel.panelVisible;
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-safe-range-prompt]")) {
      const promptLevel = Number(button.dataset.safeRangePrompt);
      const selectedPrompt = currentModel.prompts.find((candidate) => candidate.promptLevel === promptLevel);
      button.setAttribute("aria-checked", String(selectedPrompt?.selected === true));
      button.tabIndex = selectedPrompt?.selected === true ? 0 : -1;
      button.disabled = !currentModel.panelVisible;
    }
    required<HTMLButtonElement>(root, "[data-safe-range-intent='compile']").disabled = !currentModel.canCompile;
    required<HTMLButtonElement>(root, "[data-safe-range-intent='execute']").disabled = !currentModel.canExecute;
    required<HTMLButtonElement>(root, "[data-safe-range-intent='inspect_material_table']").disabled = !currentModel.canInspectTable;
    required<HTMLButtonElement>(root, "[data-safe-range-intent='return_settlement']").disabled = !currentModel.canReturn;
  };

  return Object.freeze({ render });
}

function intentFromButton(button: HTMLButtonElement): SafeRangeUiIntent | null {
  const qualificationActionId = button.dataset.safeRangeQualificationAction;
  if (qualificationActionId && isQualificationActionId(qualificationActionId)) {
    return { kind: "perform_qualification_action", actionId: qualificationActionId };
  }
  const targetClass = button.dataset.safeRangeTarget;
  if (targetClass) return { kind: "select_target", targetClass };
  const waterSource = button.dataset.safeRangeSource;
  if (waterSource) return { kind: "select_water_source", waterSource };
  const prompt = button.dataset.safeRangePrompt;
  if (prompt !== undefined) return { kind: "select_prompt_level", promptLevel: Number(prompt) };
  const kind = button.dataset.safeRangeIntent;
  if (kind === "calibrate_attack_capacity" || kind === "grant_range_trial_permission" ||
      kind === "enter_safe_range" || kind === "compile" || kind === "execute" ||
      kind === "inspect_material_table" || kind === "return_settlement" ||
      kind === "recover_softlock" || kind === "reset_checkpoint") return { kind };
  return null;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`Missing safe-range UI element: ${selector}`);
  return value;
}

function text(root: ParentNode, selector: string, value: string): void {
  required<HTMLElement>(root, selector).textContent = value;
}
