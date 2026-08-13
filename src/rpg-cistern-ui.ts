import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import {
  PROLOGUE_CISTERN_FAMILY_CONTRACTS,
  PROLOGUE_CISTERN_REGION_FLAGS,
  PROLOGUE_CISTERN_SCENE_ID,
} from "./game/prologue-cistern";
import type { CisternDirectionId, CisternExpressionId } from "./game/cistern-demo";
import { PROLOGUE_SERVICE_CHANNEL_SCENE_ID } from "./game/prologue-waterwheel";

export type CisternUiCommand =
  | Readonly<{ kind: "enter_cistern" }>
  | Readonly<{ kind: "expression"; expression: CisternExpressionId }>
  | Readonly<{ kind: "direction"; direction: CisternDirectionId }>
  | Readonly<{ kind: "target_current" }>
  | Readonly<{ kind: "nudge_target"; dx: number; dy: number }>
  | Readonly<{ kind: "preview" }>
  | Readonly<{ kind: "confirm" }>
  | Readonly<{ kind: "cancel" }>
  | Readonly<{ kind: "tool_family"; familyId: string }>
  | Readonly<{ kind: "discover_word"; wordId: "lili" | "suli" }>
  | Readonly<{ kind: "attune_word"; wordId: "lili" | "suli" }>
  | Readonly<{ kind: "natural_recovery"; ticks: number }>
  | Readonly<{ kind: "meditate"; answerAccepted: boolean }>
  | Readonly<{ kind: "checkpoint_recovery" }>
  | Readonly<{ kind: "reset_checkpoint" }>
  | Readonly<{ kind: "softlock_recovery" }>;

export interface CisternUiModel {
  readonly gatewayVisible: boolean;
  readonly canEnter: boolean;
  readonly panelVisible: boolean;
  readonly currentMp: number;
  readonly maxMp: number;
  readonly expressionCapacityWords: number;
  readonly focusSlots: number;
  readonly stage: "short" | "default" | "long" | "completed" | "unavailable";
  readonly selectedExpression: CisternExpressionId | null;
  readonly selectedDirection: CisternDirectionId | null;
  readonly pendingPreview: boolean;
  readonly previewMp: number | null;
  readonly previewLengthPx: number | null;
  readonly previewCanConfirm: boolean;
  readonly previewReason: string;
  readonly stages: Readonly<Record<"short" | "default" | "long", boolean>>;
  readonly families: Readonly<Record<string, boolean>>;
  readonly completionFlags: Readonly<Record<string, boolean>>;
  readonly words: Readonly<Record<"lili" | "suli", Readonly<{
    discovery: string;
    attunement: string;
    learning: string;
    evidenceCount: number;
  }>>>;
  readonly completed: boolean;
  readonly maximumRecoverySeconds: number;
}

export interface RpgCisternUi {
  render(snapshot: PrologueFlowSnapshot): void;
}

const EMPTY_STAGES = Object.freeze({ short: false, default: false, long: false });
const COMPLETION_FLAG_IDS = Object.freeze([
  PROLOGUE_CISTERN_REGION_FLAGS.highCisternReconnected,
  PROLOGUE_CISTERN_REGION_FLAGS.upperChannelAvailable,
  PROLOGUE_CISTERN_REGION_FLAGS.exitLadderLowered,
]);

export function deriveCisternUiModel(snapshot: PrologueFlowSnapshot): CisternUiModel {
  const cistern = snapshot.cistern;
  const gatewayVisible = snapshot.mode === "infrastructure" &&
    snapshot.runtime.sceneId === PROLOGUE_SERVICE_CHANNEL_SCENE_ID;
  const canEnter = gatewayVisible && snapshot.infrastructure?.serviceChannel.cisternReady === true;
  const plan = cistern?.cistern.pendingPlan ?? null;
  const word = (wordId: "lili" | "suli") => {
    const progress = snapshot.session.learning.words[wordId];
    return Object.freeze({
      discovery: progress?.discoveryState ?? "unknown",
      attunement: progress?.attunementState ?? "locked",
      learning: progress?.learningState ?? "not grounded",
      evidenceCount: progress?.evidence.length ?? 0,
    });
  };
  const completionFlags = Object.freeze(Object.fromEntries(COMPLETION_FLAG_IDS.map((flagId) => [
    flagId,
    Object.values(snapshot.session.world.flags).some((flag) =>
      flag.scope === "region" && flag.flagId === flagId && flag.value === true),
  ])));
  return Object.freeze({
    gatewayVisible,
    canEnter,
    panelVisible: snapshot.mode === "cistern" && snapshot.runtime.sceneId === PROLOGUE_CISTERN_SCENE_ID,
    currentMp: snapshot.session.mp.currentMp,
    maxMp: snapshot.session.mp.maxMp,
    expressionCapacityWords: snapshot.session.capabilities.expressionCapacityWords,
    focusSlots: snapshot.session.capabilities.focusSlots,
    stage: cistern?.cistern.stage ?? "unavailable",
    selectedExpression: cistern?.cistern.selectedExpression ?? null,
    selectedDirection: cistern?.cistern.selectedDirection ?? null,
    pendingPreview: plan !== null,
    previewMp: plan?.activationMpRequired ?? null,
    previewLengthPx: plan?.preview.geometry.realizedLengthPx ?? null,
    previewCanConfirm: plan?.canConfirm ?? false,
    previewReason: plan === null ? "尚未建立预览" : plan.canConfirm ? "可确认" : (plan.rejectionCode ?? "不可确认"),
    stages: cistern?.stages ?? EMPTY_STAGES,
    families: cistern?.families ?? Object.freeze({}),
    completionFlags,
    words: Object.freeze({ lili: word("lili"), suli: word("suli") }),
    completed: cistern?.completed ?? false,
    maximumRecoverySeconds: cistern?.softLockRecovery.maximumSeconds ?? 60,
  });
}

export function createRpgCisternUi(
  onCommand: (command: CisternUiCommand) => void,
): RpgCisternUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("RPG cistern UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "cistern-root";
  root.innerHTML = `
    <section class="cistern-panel cistern-gateway" data-cistern-gateway hidden>
      <p class="eyebrow">N04 → N05 / HIGH CISTERN</p>
      <h2>旧蓄水池入口</h2>
      <p class="cistern-copy">检修渠稳定后进入长度校准区；容量、法器槽与最大 MP 只读取统一存档。</p>
      <button type="button" data-cistern-command="enter_cistern">进入 N05</button>
    </section>
    <section class="cistern-panel" data-cistern-panel hidden>
      <div class="panel-heading"><div><p class="eyebrow">N05 / LENGTH CISTERN</p><h2>长度校准与输水</h2></div>
        <strong data-cistern-completed>进行中</strong></div>
      <div class="cistern-state">
        <span>阶段<strong data-cistern-stage>--</strong></span>
        <span>MP<strong data-cistern-mp>--</strong></span>
        <span>表达容量<strong data-cistern-capacity>--</strong></span>
        <span>法器槽<strong data-cistern-slots>--</strong></span>
      </div>
      <div class="cistern-section"><strong>三种表达</strong><div class="cistern-expression-grid">
        ${expressionButton("telo_lili", "telo + lili", "短")}
        ${expressionButton("telo", "telo", "默认")}
        ${expressionButton("telo_suli", "telo + suli", "长")}
      </div></div>
      <div class="cistern-section"><strong>方向与接收器目标</strong><div class="cistern-direction-grid">
        ${directionButton("north", "↑")}${directionButton("west", "←")}
        ${directionButton("east", "→")}${directionButton("south", "↓")}
        <button type="button" data-cistern-command="target_current">对准当前接收器</button>
        <button type="button" data-cistern-command="nudge_up">目标上移 8px</button>
      </div></div>
      <div class="cistern-preview" data-preview-state="empty">
        <span>预览<strong data-cistern-preview>尚未建立预览</strong></span>
        <span>耗费<strong data-cistern-preview-mp>--</strong></span>
        <span>长度<strong data-cistern-preview-length>--</strong></span>
      </div>
      <div class="cistern-action-grid">
        <button type="button" data-cistern-command="preview">预览</button>
        <button type="button" data-cistern-command="confirm">确认施法</button>
        <button type="button" data-cistern-command="cancel">取消预览</button>
      </div>
      <div class="cistern-section"><strong>A/B 独立任务族 · 工具旁路不给语言证据</strong><div class="cistern-family-grid">
        ${PROLOGUE_CISTERN_FAMILY_CONTRACTS.map((family, index) =>
          `<button type="button" data-tool-family="${family.id}">${index === 0 ? "A 校准工具" : "B 输水工具"}</button>`).join("")}
      </div><small class="cistern-copy" data-cistern-family-state>--</small></div>
      <div class="cistern-section"><strong>lili / suli 学习状态</strong><div class="cistern-word-grid">
        ${wordControls("lili")}${wordControls("suli")}
      </div><small class="cistern-copy" data-cistern-word-state>--</small></div>
      <div class="cistern-section"><strong>MP 与软锁恢复</strong><div class="cistern-recovery-grid">
        <button type="button" data-cistern-command="natural_recovery">自然恢复 600 tick</button>
        <button type="button" data-cistern-command="meditate_correct">冥想（正确）</button>
        <button type="button" data-cistern-command="meditate_wrong">冥想（错误）</button>
        <button type="button" data-cistern-command="checkpoint_recovery">存档点轻恢复</button>
        <button type="button" data-cistern-command="reset_checkpoint">Reset to checkpoint</button>
        <button type="button" data-cistern-command="softlock_recovery">恢复局部路线</button>
      </div><small class="cistern-copy" data-cistern-recovery-copy>--</small></div>
      <div class="cistern-flags" aria-label="N05 三个原子完成旗标">
        ${COMPLETION_FLAG_IDS.map((flagId) => `<span data-completion-flag="${flagId}">${flagId}<b>未完成</b></span>`).join("")}
      </div>
    </section>`;
  anchor.parentElement.insertBefore(root, anchor);

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;
    const expression = button.dataset.expression as CisternExpressionId | undefined;
    if (expression) return onCommand({ kind: "expression", expression });
    const direction = button.dataset.direction as CisternDirectionId | undefined;
    if (direction) return onCommand({ kind: "direction", direction });
    const familyId = button.dataset.toolFamily;
    if (familyId) return onCommand({ kind: "tool_family", familyId });
    const wordId = button.dataset.wordId as "lili" | "suli" | undefined;
    const wordAction = button.dataset.wordAction;
    if (wordId && wordAction === "discover") return onCommand({ kind: "discover_word", wordId });
    if (wordId && wordAction === "attune") return onCommand({ kind: "attune_word", wordId });
    const command = button.dataset.cisternCommand;
    if (!command) return;
    const commands: Readonly<Record<string, CisternUiCommand>> = {
      enter_cistern: { kind: "enter_cistern" }, target_current: { kind: "target_current" },
      nudge_up: { kind: "nudge_target", dx: 0, dy: -8 }, preview: { kind: "preview" },
      confirm: { kind: "confirm" }, cancel: { kind: "cancel" },
      natural_recovery: { kind: "natural_recovery", ticks: 600 },
      meditate_correct: { kind: "meditate", answerAccepted: true },
      meditate_wrong: { kind: "meditate", answerAccepted: false },
      checkpoint_recovery: { kind: "checkpoint_recovery" },
      reset_checkpoint: { kind: "reset_checkpoint" },
      softlock_recovery: { kind: "softlock_recovery" },
    };
    const resolved = commands[command];
    if (resolved) onCommand(resolved);
  });

  return Object.freeze({
    render(snapshot: PrologueFlowSnapshot): void {
      const model = deriveCisternUiModel(snapshot);
      required<HTMLElement>(root, "[data-cistern-gateway]").hidden = !model.gatewayVisible;
      required<HTMLButtonElement>(root, "[data-cistern-command='enter_cistern']").disabled = !model.canEnter;
      required<HTMLElement>(root, "[data-cistern-panel]").hidden = !model.panelVisible;
      if (!model.panelVisible) return;
      text(root, "[data-cistern-stage]", model.stage);
      text(root, "[data-cistern-mp]", `${model.currentMp} / ${model.maxMp}`);
      text(root, "[data-cistern-capacity]", `${model.expressionCapacityWords} 词`);
      text(root, "[data-cistern-slots]", String(model.focusSlots));
      text(root, "[data-cistern-completed]", model.completed ? "已重连" : "进行中");
      text(root, "[data-cistern-preview]", model.previewReason);
      text(root, "[data-cistern-preview-mp]", model.previewMp === null ? "--" : `${model.previewMp} MP`);
      text(root, "[data-cistern-preview-length]", model.previewLengthPx === null ? "--" : `${model.previewLengthPx}px`);
      required<HTMLElement>(root, ".cistern-preview").dataset.previewState = model.pendingPreview
        ? model.previewCanConfirm ? "ready" : "blocked" : "empty";
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-expression]")) {
        button.dataset.selected = String(button.dataset.expression === model.selectedExpression);
        button.disabled = model.pendingPreview;
      }
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-direction], [data-cistern-command='target_current'], [data-cistern-command='nudge_up']")) {
        if (button.dataset.direction) button.dataset.selected = String(button.dataset.direction === model.selectedDirection);
        button.disabled = model.pendingPreview;
      }
      required<HTMLButtonElement>(root, "[data-cistern-command='preview']").disabled = model.pendingPreview || model.stage === "completed";
      required<HTMLButtonElement>(root, "[data-cistern-command='confirm']").disabled = !model.pendingPreview || !model.previewCanConfirm;
      required<HTMLButtonElement>(root, "[data-cistern-command='cancel']").disabled = !model.pendingPreview;
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-tool-family]")) {
        button.disabled = model.pendingPreview || model.families[button.dataset.toolFamily ?? ""] === true;
      }
      text(root, "[data-cistern-family-state]", PROLOGUE_CISTERN_FAMILY_CONTRACTS.map((family) =>
        `${family.id}: ${model.families[family.id] ? "完成" : "未完成"}`).join(" · "));
      text(root, "[data-cistern-word-state]", (["lili", "suli"] as const).map((wordId) => {
        const state = model.words[wordId];
        return `${wordId}: ${state.discovery}/${state.attunement}/${state.learning} · evidence ${state.evidenceCount}`;
      }).join(" · "));
      text(root, "[data-cistern-recovery-copy]", `软锁恢复上限 ${model.maximumRecoverySeconds}s；恢复不伪造学习证据。`);
      for (const element of root.querySelectorAll<HTMLElement>("[data-completion-flag]")) {
        const flagId = element.dataset.completionFlag ?? "";
        const complete = model.completionFlags[flagId] === true;
        element.dataset.complete = String(complete);
        const status = element.querySelector<HTMLElement>("b");
        if (status) status.textContent = complete ? "完成" : "未完成";
      }
    },
  });
}

function expressionButton(expression: CisternExpressionId, label: string, length: string): string {
  return `<button type="button" data-expression="${expression}"><strong>${label}</strong><small>${length}</small></button>`;
}

function directionButton(direction: CisternDirectionId, label: string): string {
  return `<button type="button" data-direction="${direction}" aria-label="方向 ${direction}">${label}</button>`;
}

function wordControls(wordId: "lili" | "suli"): string {
  return `<span><b>${wordId}</b><button type="button" data-word-id="${wordId}" data-word-action="discover">发现</button>
    <button type="button" data-word-id="${wordId}" data-word-action="attune">调谐</button></span>`;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`Missing cistern UI element: ${selector}`);
  return value;
}

function text(root: ParentNode, selector: string, value: string): void {
  required<HTMLElement>(root, selector).textContent = value;
}
