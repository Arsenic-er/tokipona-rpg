import generatedRuntimeArtifact from "./generated/content-runtime.v0.1.json";
import {
  readRuntimeReturnFlowTaskManifest,
  type RuntimeReturnFlowTaskManifest,
} from "./content/runtime-task-manifest";

const CONTRACT = readRuntimeReturnFlowTaskManifest(generatedRuntimeArtifact);

export type ReturnFlowSolutionId =
  | "return_flow.repair_overflow"
  | "return_flow.clear_mud"
  | "return_flow.reuse_old_channel";

export type ReturnFlowUiCommand =
  | Readonly<{ kind: "perform_action"; actionId: string }>
  | Readonly<{ kind: "discover_wawa" }>
  | Readonly<{ kind: "attune_wawa" }>
  | Readonly<{ kind: "complete_solution"; solutionId: ReturnFlowSolutionId }>
  | Readonly<{ kind: "ground_wawa"; solutionId: ReturnFlowSolutionId; promptLevel: 0 | 1 }>
  | Readonly<{ kind: "return_settlement" }>
  | Readonly<{ kind: "recover_softlock" }>
  | Readonly<{ kind: "reset_checkpoint" }>;

export interface ReturnFlowUiFlowSnapshot {
  readonly mode: string;
  readonly runtime: Readonly<{ readonly sceneId: string }>;
  readonly returnFlow: Readonly<{
    readonly settlementSupplyStable: boolean;
    readonly wetMeadowRestored: boolean;
    readonly solutionId: string | null;
    readonly materialPatchApplied: boolean;
    readonly prologueReturnObserved: boolean;
    readonly taskCompleted: boolean;
    readonly wawa: Readonly<{
      readonly discoveryState: string;
      readonly attunementState: string;
      readonly learningState: string | null;
      readonly inertMechanismEvidenceCount: number;
      readonly groundedPromptLevels: readonly (0 | 1)[];
    }>;
    readonly solutionContracts: readonly Readonly<{
      readonly id: string;
      readonly routeKind: string;
      readonly mainline: boolean;
      readonly requiredActions: readonly string[];
    }>[];
    readonly softLockRecovery: Readonly<{ readonly maximumSeconds: number }>;
  }> | null;
  readonly returnFlowProgress?: Readonly<{
    readonly selectedSolutionId: string | null;
    readonly completedActionIds: readonly string[];
  }> | null;
}

export interface ReturnFlowUiActionStep {
  readonly id: string;
  readonly label: string;
  readonly completed: boolean;
  readonly enabled: boolean;
  readonly indicatorObservation: boolean;
}

export interface ReturnFlowUiRoute {
  readonly id: ReturnFlowSolutionId;
  readonly label: string;
  readonly selected: boolean;
  readonly completed: boolean;
  readonly locked: boolean;
  readonly actions: readonly ReturnFlowUiActionStep[];
  readonly canCommit: boolean;
}

export type ReturnFlowUiPhase =
  | "hidden"
  | "contract_error"
  | "observe_indicator"
  | "discover_wawa"
  | "attune_wawa"
  | "complete_route"
  | "commit_route"
  | "ground_wawa"
  | "return_settlement";

export interface ReturnFlowUiModel {
  readonly panelVisible: boolean;
  readonly contractValid: boolean;
  readonly phase: ReturnFlowUiPhase;
  readonly routes: readonly ReturnFlowUiRoute[];
  readonly selectedSolutionId: ReturnFlowSolutionId | null;
  readonly indicatorObserved: boolean;
  readonly canDiscover: boolean;
  readonly canAttune: boolean;
  readonly canGround: boolean;
  readonly canGroundH0: boolean;
  readonly canGroundH1: boolean;
  readonly canReturn: boolean;
  readonly taskCompleted: boolean;
  readonly grounded: boolean;
  readonly flags: Readonly<{
    readonly settlementSupplyStable: boolean;
    readonly wetMeadowRestored: boolean;
  }>;
  readonly patch: Readonly<{ readonly id: string; readonly applied: boolean }>;
  readonly zeroAttack: Readonly<{
    readonly mainline: true;
    readonly mandatoryKills: 0;
    readonly mandatoryCombatEncounters: 0;
  }>;
  readonly recovery: Readonly<{ readonly maximumSeconds: number }>;
  readonly liveStatus: string;
}

export type ReturnFlowUiIntent =
  | Readonly<{ kind: "perform_action"; solutionId: string; actionId: string }>
  | Readonly<{ kind: "discover_wawa" }>
  | Readonly<{ kind: "attune_wawa" }>
  | Readonly<{ kind: "complete_solution"; solutionId: string }>
  | Readonly<{ kind: "ground_wawa"; promptLevel: 0 | 1 }>
  | Readonly<{ kind: "return_settlement" }>
  | Readonly<{ kind: "recover_softlock" }>
  | Readonly<{ kind: "reset_checkpoint" }>;

export interface RpgReturnFlowUi {
  render(snapshot: ReturnFlowUiFlowSnapshot): void;
}

const SOLUTION_IDS: readonly ReturnFlowSolutionId[] = Object.freeze([
  "return_flow.repair_overflow",
  "return_flow.clear_mud",
  "return_flow.reuse_old_channel",
]);

const ROUTE_LABELS: Readonly<Record<ReturnFlowSolutionId, string>> = Object.freeze({
  "return_flow.repair_overflow": "修复溢流闸",
  "return_flow.clear_mud": "清理淤泥",
  "return_flow.reuse_old_channel": "复用旧水道",
});

const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "return_flow.repair_overflow.inspect_indicator": "观察惰性水力指示器",
  "return_flow.repair_overflow.reseat_gate": "重新安放溢流闸",
  "return_flow.repair_overflow.repair_seal": "修复密封",
  "return_flow.repair_overflow.clear_conduit": "清通溢流管道",
  "return_flow.clear_mud.inspect_indicator": "观察惰性水力指示器",
  "return_flow.clear_mud.loosen_blockage": "松动泥堵",
  "return_flow.clear_mud.remove_mud": "移除淤泥",
  "return_flow.clear_mud.restore_grade": "恢复水道坡度",
  "return_flow.clear_mud.clear_intake": "清理回流入口",
  "return_flow.reuse_old_channel.inspect_indicator": "观察惰性水力指示器",
  "return_flow.reuse_old_channel.connect_channel": "连接旧水道",
  "return_flow.reuse_old_channel.clear_channel": "清理旧水道",
  "return_flow.reuse_old_channel.brace_bank": "加固水道岸壁",
  "return_flow.reuse_old_channel.set_split_gauge": "设定分流计",
});

const isSolutionId = (value: string | null): value is ReturnFlowSolutionId =>
  value !== null && (SOLUTION_IDS as readonly string[]).includes(value);

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function contractsValid(
  candidates: NonNullable<ReturnFlowUiFlowSnapshot["returnFlow"]>["solutionContracts"],
): boolean {
  return candidates.length === CONTRACT.solutions.length && CONTRACT.solutions.every((expected, index) => {
    const candidate = candidates[index];
    return candidate?.id === expected.id && candidate.routeKind === "non_magic" && candidate.mainline === true &&
      sameStrings(candidate.requiredActions, expected.requiredActions) &&
      candidate.requiredActions.every((actionId) => ACTION_LABELS[actionId] !== undefined);
  });
}

export function deriveReturnFlowUiModel(snapshot: ReturnFlowUiFlowSnapshot): ReturnFlowUiModel {
  const panelVisible = snapshot.mode === "return_flow" && snapshot.runtime.sceneId === CONTRACT.sceneId;
  const flow = snapshot.returnFlow;
  const valid = flow !== null && contractsValid(flow.solutionContracts) &&
    flow.softLockRecovery.maximumSeconds === CONTRACT.maximumSoftlockRecoverySeconds;
  const empty = baseModel(panelVisible, valid, flow);
  if (!panelVisible) return Object.freeze({ ...empty, phase: "hidden", liveStatus: "" });
  if (!valid || !flow) {
    return Object.freeze({ ...empty, phase: "contract_error", liveStatus: "N07 内容合同不一致；交互已安全停用。" });
  }

  const progress = snapshot.returnFlowProgress;
  const completedIds = new Set(progress?.completedActionIds ?? []);
  const selected = isSolutionId(progress?.selectedSolutionId ?? null)
    ? progress!.selectedSolutionId as ReturnFlowSolutionId
    : isSolutionId(flow.solutionId) ? flow.solutionId : null;
  const allActionIds = new Set(flow.solutionContracts.flatMap((solution) => solution.requiredActions));
  const progressValid = [...completedIds].every((id) => allActionIds.has(id)) &&
    (progress?.selectedSolutionId == null || isSolutionId(progress.selectedSolutionId)) &&
    [...completedIds].every((id) => selected !== null && id.startsWith(`${selected}.`));
  if (!progressValid) {
    return Object.freeze({ ...empty, contractValid: false, phase: "contract_error",
      liveStatus: "N07 路线进度不符合生成合同；交互已安全停用。" });
  }

  const taskCompleted = flow.taskCompleted && flow.settlementSupplyStable && flow.wetMeadowRestored &&
    flow.materialPatchApplied && isSolutionId(flow.solutionId);
  const indicatorObserved = taskCompleted || [...completedIds].some((id) => id.endsWith(".inspect_indicator"));
  const discovered = flow.wawa.discoveryState === "discovered";
  const attuned = flow.wawa.attunementState === "attuned";
  const promptLevelsValid = flow.wawa.groundedPromptLevels.every((level) => level === 0 || level === 1) &&
    new Set(flow.wawa.groundedPromptLevels).size === flow.wawa.groundedPromptLevels.length;
  if (!promptLevelsValid) return Object.freeze({ ...empty, contractValid: false, phase: "contract_error" });
  const grounded = flow.wawa.groundedPromptLevels.length > 0;

  const routes = flow.solutionContracts.map((contract) => {
    const id = contract.id as ReturnFlowSolutionId;
    const routeSelected = selected === id;
    const routeCompleted = taskCompleted && flow.solutionId === id;
    let priorComplete = true;
    const actions = contract.requiredActions.map((actionId, index) => {
      const completed = routeCompleted || completedIds.has(actionId);
      const enabled = !taskCompleted && (selected === null || routeSelected) && !completed && priorComplete;
      void index;
      priorComplete = priorComplete && completed;
      return Object.freeze({ id: actionId, label: ACTION_LABELS[actionId]!, completed, enabled,
        indicatorObservation: actionId.endsWith(".inspect_indicator") });
    });
    const allComplete = actions.every((action) => action.completed);
    return Object.freeze({ id, label: ROUTE_LABELS[id], selected: routeSelected, completed: routeCompleted,
      locked: selected !== null && !routeSelected, actions: Object.freeze(actions),
      canCommit: !taskCompleted && routeSelected && allComplete });
  });

  const canDiscover = indicatorObserved && !discovered;
  const canAttune = indicatorObserved && discovered && !attuned;
  const canGroundH0 = taskCompleted && attuned && !flow.wawa.groundedPromptLevels.includes(0);
  const canGroundH1 = taskCompleted && attuned && !flow.wawa.groundedPromptLevels.includes(1);
  const canGround = canGroundH0 || canGroundH1;
  const canReturn = taskCompleted && !flow.prologueReturnObserved;
  const phase: ReturnFlowUiPhase = taskCompleted ? canGround ? "ground_wawa" : "return_settlement"
    : !indicatorObserved ? "observe_indicator"
      : canDiscover ? "discover_wawa"
        : canAttune ? "attune_wawa"
          : routes.some((route) => route.canCommit) ? "commit_route" : "complete_route";
  const liveStatus = statusFor(phase, selected, flow.prologueReturnObserved);

  return Object.freeze({ ...empty, contractValid: true, phase, routes: Object.freeze(routes),
    selectedSolutionId: selected, indicatorObserved, canDiscover, canAttune, canGround, canGroundH0, canGroundH1, canReturn,
    taskCompleted, grounded, flags: Object.freeze({
      settlementSupplyStable: flow.settlementSupplyStable,
      wetMeadowRestored: flow.wetMeadowRestored,
    }), patch: Object.freeze({ id: CONTRACT.patchRecordRef, applied: flow.materialPatchApplied }),
    recovery: Object.freeze({ maximumSeconds: flow.softLockRecovery.maximumSeconds }), liveStatus });
}

function baseModel(panelVisible: boolean, contractValid: boolean, flow: ReturnFlowUiFlowSnapshot["returnFlow"]): ReturnFlowUiModel {
  return {
    panelVisible, contractValid, phase: panelVisible ? "contract_error" : "hidden", routes: Object.freeze([]),
    selectedSolutionId: null, indicatorObserved: false, canDiscover: false, canAttune: false,
    canGround: false, canGroundH0: false, canGroundH1: false,
    canReturn: false, taskCompleted: false, grounded: false,
    flags: Object.freeze({ settlementSupplyStable: flow?.settlementSupplyStable ?? false,
      wetMeadowRestored: flow?.wetMeadowRestored ?? false }),
    patch: Object.freeze({ id: CONTRACT.patchRecordRef, applied: flow?.materialPatchApplied ?? false }),
    zeroAttack: Object.freeze({ mainline: CONTRACT.zeroAttack.zeroAttackMainline,
      mandatoryKills: CONTRACT.zeroAttack.mandatoryKills,
      mandatoryCombatEncounters: CONTRACT.zeroAttack.mandatoryCombatEncounters }),
    recovery: Object.freeze({ maximumSeconds: flow?.softLockRecovery.maximumSeconds ?? CONTRACT.maximumSoftlockRecoverySeconds }),
    liveStatus: "",
  };
}

function statusFor(phase: ReturnFlowUiPhase, selected: ReturnFlowSolutionId | null, returned: boolean): string {
  if (returned) return "已从 N07 返回聚落。";
  if (phase === "observe_indicator") return "先从任一路线观察惰性水力指示器。";
  if (phase === "discover_wawa") return "指示器已观察；现在辨认 wawa。";
  if (phase === "attune_wawa") return "wawa 已发现；完成调谐后继续修复。";
  if (phase === "complete_route") return selected === null ? "选择一条非魔法路线并依次完成步骤。" : `继续${ROUTE_LABELS[selected]}。`;
  if (phase === "commit_route") return "路线步骤已完成；提交回流水路修复。";
  if (phase === "ground_wawa") return "水路已恢复；选择 H0 或 H1 完成非战斗语义落地。";
  if (phase === "return_settlement") return "两项水流状态与材质补丁已提交；返回聚落。";
  return "";
}

export function resolveReturnFlowUiIntent(model: ReturnFlowUiModel, intent: ReturnFlowUiIntent): ReturnFlowUiCommand | null {
  if (!model.panelVisible || !model.contractValid) return null;
  if (intent.kind === "perform_action") {
    const route = model.routes.find((candidate) => candidate.id === intent.solutionId);
    const action = route?.actions.find((candidate) => candidate.id === intent.actionId);
    return action?.enabled ? Object.freeze({ kind: "perform_action", actionId: action.id }) : null;
  }
  if (intent.kind === "discover_wawa") return model.canDiscover ? Object.freeze({ kind: "discover_wawa" }) : null;
  if (intent.kind === "attune_wawa") return model.canAttune ? Object.freeze({ kind: "attune_wawa" }) : null;
  if (intent.kind === "complete_solution") {
    const route = model.routes.find((candidate) => candidate.id === intent.solutionId);
    return route?.canCommit ? Object.freeze({ kind: "complete_solution", solutionId: route.id }) : null;
  }
  if (intent.kind === "ground_wawa") {
    const allowed = intent.promptLevel === 0 ? model.canGroundH0 : model.canGroundH1;
    return allowed && model.selectedSolutionId
      ? Object.freeze({ kind: "ground_wawa", solutionId: model.selectedSolutionId, promptLevel: intent.promptLevel }) : null;
  }
  if (intent.kind === "return_settlement") return model.canReturn ? Object.freeze({ kind: "return_settlement" }) : null;
  if (intent.kind === "recover_softlock") return Object.freeze({ kind: "recover_softlock" });
  return Object.freeze({ kind: "reset_checkpoint" });
}

export function moveReturnFlowFocus(currentIndex: number, key: string, itemCount: number): number {
  if (itemCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (Math.max(0, currentIndex) + 1) % itemCount;
  if (key === "ArrowLeft" || key === "ArrowUp") return (Math.max(0, currentIndex) - 1 + itemCount) % itemCount;
  return Math.min(itemCount - 1, Math.max(0, currentIndex));
}

export function createRpgReturnFlowUi(onCommand: (command: ReturnFlowUiCommand) => void): RpgReturnFlowUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("RPG return-flow UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "return-flow-root";
  root.innerHTML = `
    <section class="return-flow-panel" data-return-flow-panel hidden aria-labelledby="return-flow-heading">
      <div class="panel-heading"><div><p class="eyebrow">N07 / RETURN CHANNEL</p><h2 id="return-flow-heading">回流水路与 wawa</h2></div><strong data-return-flow-phase>--</strong></div>
      <p class="return-flow-boundary">三条主线均为非魔法方案；工具完成不会自动生成语言证据。</p>
      <div class="return-flow-sequence" aria-label="学习与修复顺序"><span>1 观察</span><span>2 可选发现/调谐</span><span>3 修复</span><span>4 可选 H0/H1</span><span>5 返回</span></div>
      <div class="return-flow-routes" data-return-flow-routes aria-label="三条非魔法回流方案"></div>
      <section class="return-flow-learning" aria-labelledby="return-flow-learning-heading"><strong id="return-flow-learning-heading">惰性 wawa 证据</strong>
        <div><button type="button" data-return-intent="discover_wawa">发现 wawa</button><button type="button" data-return-intent="attune_wawa">调谐 wawa</button></div>
        <div><button type="button" data-return-intent="ground_h0">H0：判断力的强弱对比</button><button type="button" data-return-intent="ground_h1">H1：判断水流贡献</button></div>
      </section>
      <div class="return-flow-flags" aria-label="回流完成状态"><span>聚落供水稳定 <b data-return-flag="supply">否</b></span><span>湿地恢复 <b data-return-flag="meadow">否</b></span><span>材质补丁 <b data-return-patch>未提交</b></span></div>
      <p class="return-flow-zero" data-return-zero>主线 0 战斗 · 0 击杀</p>
      <div class="return-flow-actions"><button type="button" data-return-intent="return_settlement">返回聚落</button><button type="button" data-return-intent="recover_softlock">软锁恢复</button><button type="button" data-return-intent="reset_checkpoint">重置到检查点</button></div>
      <p class="return-flow-recovery" data-return-recovery></p>
      <p class="return-flow-live" data-return-live role="status" aria-live="polite" aria-atomic="true"></p>
    </section>`;
  anchor.parentElement.insertBefore(root, anchor);
  let currentModel = deriveReturnFlowUiModel({ mode: "hidden", runtime: { sceneId: "" }, returnFlow: null });
  let renderedRouteState = "";

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;
    const intent = intentFromButton(button);
    if (!intent) return;
    const command = resolveReturnFlowUiIntent(currentModel, intent);
    if (command) onCommand(command);
  });
  root.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = moveReturnFlowFocus(current, event.key, buttons.length);
    if (next >= 0) { event.preventDefault(); buttons[next]!.focus(); }
  });

  return Object.freeze({
    render(snapshot: ReturnFlowUiFlowSnapshot): void {
      currentModel = deriveReturnFlowUiModel(snapshot);
      const panel = required<HTMLElement>(root, "[data-return-flow-panel]");
      panel.hidden = !currentModel.panelVisible;
      if (!currentModel.panelVisible) return;
      text(root, "[data-return-flow-phase]", currentModel.phase);
      const nextRouteState = JSON.stringify(currentModel.routes);
      if (nextRouteState !== renderedRouteState) {
        renderRoutes(root, currentModel);
        renderedRouteState = nextRouteState;
      }
      setDisabled(root, "discover_wawa", !currentModel.canDiscover);
      setDisabled(root, "attune_wawa", !currentModel.canAttune);
      setDisabled(root, "ground_h0", !currentModel.canGroundH0);
      setDisabled(root, "ground_h1", !currentModel.canGroundH1);
      setDisabled(root, "return_settlement", !currentModel.canReturn);
      text(root, "[data-return-flag='supply']", currentModel.flags.settlementSupplyStable ? "是" : "否");
      text(root, "[data-return-flag='meadow']", currentModel.flags.wetMeadowRestored ? "是" : "否");
      text(root, "[data-return-patch]", `${currentModel.patch.applied ? "已提交" : "未提交"} · ${currentModel.patch.id}`);
      text(root, "[data-return-zero]", `非魔法主线 · ${currentModel.zeroAttack.mandatoryCombatEncounters} 场强制战斗 · ${currentModel.zeroAttack.mandatoryKills} 击杀`);
      text(root, "[data-return-recovery]", `局部软锁恢复上限 ${currentModel.recovery.maximumSeconds} 秒；生命、尸体、加工与生存账本不在此处清除。`);
      text(root, "[data-return-live]", currentModel.liveStatus);
    },
  });
}

function renderRoutes(root: ParentNode, model: ReturnFlowUiModel): void {
  const container = required<HTMLElement>(root, "[data-return-flow-routes]");
  container.replaceChildren(...model.routes.map((route) => {
    const article = document.createElement("article");
    article.className = "return-flow-route";
    article.dataset.selected = String(route.selected);
    article.dataset.completed = String(route.completed);
    article.setAttribute("aria-label", route.label);
    const heading = document.createElement("strong");
    heading.textContent = route.label;
    article.append(heading);
    const list = document.createElement("ol");
    for (const action of route.actions) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.returnIntent = "perform_action";
      button.dataset.solutionId = route.id;
      button.dataset.actionId = action.id;
      button.disabled = !action.enabled;
      button.textContent = `${action.completed ? "✓" : "○"} ${action.label}`;
      if (action.enabled) button.setAttribute("aria-current", "step");
      item.append(button);
      list.append(item);
    }
    article.append(list);
    const commit = document.createElement("button");
    commit.type = "button";
    commit.dataset.returnIntent = "complete_solution";
    commit.dataset.solutionId = route.id;
    commit.disabled = !route.canCommit;
    commit.textContent = route.completed ? "路线已提交" : "提交这条路线";
    article.append(commit);
    return article;
  }));
}

function intentFromButton(button: HTMLButtonElement): ReturnFlowUiIntent | null {
  const kind = button.dataset.returnIntent;
  if (kind === "perform_action" && button.dataset.solutionId && button.dataset.actionId) {
    return { kind, solutionId: button.dataset.solutionId, actionId: button.dataset.actionId };
  }
  if (kind === "complete_solution" && button.dataset.solutionId) return { kind, solutionId: button.dataset.solutionId };
  if (kind === "discover_wawa" || kind === "attune_wawa" || kind === "return_settlement" ||
      kind === "recover_softlock" || kind === "reset_checkpoint") return { kind };
  if (kind === "ground_h0" || kind === "ground_h1") return { kind: "ground_wawa", promptLevel: kind === "ground_h0" ? 0 : 1 };
  return null;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`Missing return-flow UI element: ${selector}`);
  return value;
}

function text(root: ParentNode, selector: string, value: string): void {
  required<HTMLElement>(root, selector).textContent = value;
}

function setDisabled(root: ParentNode, intent: string, disabled: boolean): void {
  required<HTMLButtonElement>(root, `[data-return-intent='${intent}']`).disabled = disabled;
}

export const RETURN_FLOW_UI_CONTRACT: RuntimeReturnFlowTaskManifest = CONTRACT;
