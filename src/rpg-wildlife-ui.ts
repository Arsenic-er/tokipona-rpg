import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import {
  PROLOGUE_WILDLIFE_DIG_SOLUTION_ID,
  PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
  PROLOGUE_WILDLIFE_SCENE_ID,
  PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID,
  PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID,
  type PrologueWildlifeSnapshot,
  type PrologueWildlifeSolutionId,
} from "./game/prologue-wildlife";
import { PROLOGUE_CISTERN_SCENE_ID } from "./game/prologue-cistern";
import { PROLOGUE_SERVICE_CHANNEL_SCENE_ID } from "./game/prologue-waterwheel";

export type WildlifeUiFlowSnapshot = Omit<PrologueFlowSnapshot, "mode"> & Readonly<{
  mode: PrologueFlowSnapshot["mode"] | "wildlife";
  wildlife?: PrologueWildlifeSnapshot | null;
}>;

export type WildlifeUiCommand =
  | Readonly<{ kind: "enter_wildlife"; source: "service" | "cistern" }>
  | Readonly<{ kind: "observe_warning" }>
  | Readonly<{ kind: "retreat_safely" }>
  | Readonly<{ kind: "wait_for_real_exit" }>
  | Readonly<{ kind: "make_low_force_noise" }>
  | Readonly<{ kind: "use_wood_staff" }>
  | Readonly<{ kind: "open_old_latch" }>
  | Readonly<{ kind: "mark_upper_line" }>
  | Readonly<{ kind: "dig_upper_bypass" }>
  | Readonly<{ kind: "install_braces" }>
  | Readonly<{ kind: "complete_route"; solutionId: PrologueWildlifeSolutionId }>
  | Readonly<{ kind: "return_to_service" }>
  | Readonly<{ kind: "go_to_cistern" }>
  | Readonly<{ kind: "recover_softlock" }>
  | Readonly<{ kind: "reset_checkpoint" }>;

export type WildlifeUiStepId =
  | "observe_warning"
  | "retreat_safely"
  | "wait_for_real_exit"
  | "make_low_force_noise"
  | "use_wood_staff"
  | "open_old_latch"
  | "mark_upper_line"
  | "dig_upper_bypass"
  | "install_braces"
  | "complete_route";

export interface WildlifeUiRouteModel {
  readonly solutionId: PrologueWildlifeSolutionId;
  readonly label: string;
  readonly description: string;
  readonly completed: boolean;
  readonly ready: boolean;
  readonly nextStep: WildlifeUiStepId | null;
  readonly nextStepLabel: string;
}

export interface WildlifeUiModel {
  readonly gatewayVisible: boolean;
  readonly gatewaySource: "service" | "cistern" | null;
  readonly canEnter: boolean;
  readonly gatewayCopy: string;
  readonly mainlineRemainsAvailable: true;
  readonly panelVisible: boolean;
  readonly behaviorState: string;
  readonly behaviorLabel: string;
  readonly warningTicks: number;
  readonly warningRequiredTicks: number;
  readonly warningProgress: number;
  readonly warningObserved: boolean;
  readonly safeRetreatRecorded: boolean;
  readonly realExitReached: boolean;
  readonly playerOutsideWarningZone: boolean;
  readonly escapeLaneOpen: boolean;
  readonly denIntact: boolean;
  readonly oldLatchOpened: boolean;
  readonly foxPositionLabel: string;
  readonly routeOpen: boolean;
  readonly routeSolutionId: string | null;
  readonly routes: readonly WildlifeUiRouteModel[];
  readonly canReturnToService: boolean;
  readonly canGoToCistern: boolean;
  readonly maximumRecoverySeconds: number;
  readonly zeroRewardContract: boolean;
  readonly safetyCopy: string;
}

export interface RpgWildlifeUi {
  render(snapshot: WildlifeUiFlowSnapshot): void;
}

const SERVICE_REACHED_FLAG = "service_channel_reached";
const DEN_ROUTE_OPEN_FLAG = "den_route_open";

const ROUTE_META: Readonly<Record<PrologueWildlifeSolutionId, Readonly<{
  label: string;
  description: string;
}>>> = Object.freeze({
  [PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID]: Object.freeze({
    label: "观察并等待",
    description: "读完警告、退到安全处，等狐狸从真实出口离开。",
  }),
  [PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID]: Object.freeze({
    label: "敲击空木",
    description: "敲木头而不是动物；造成 0 伤害，只增加警觉。",
  }),
  [PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID]: Object.freeze({
    label: "木杖保持距离",
    description: "在标记处举杖后退，不击中狐狸。",
  }),
  [PROLOGUE_WILDLIFE_DIG_SOLUTION_ID]: Object.freeze({
    label: "挖掘上方绕路",
    description: "标线、确认狐狸离巢、挖掘并安装支撑。",
  }),
});

export function deriveWildlifeUiModel(snapshot: WildlifeUiFlowSnapshot): WildlifeUiModel {
  const wildlife = snapshot.wildlife ?? null;
  const atService = snapshot.mode === "infrastructure" && snapshot.runtime.sceneId === PROLOGUE_SERVICE_CHANNEL_SCENE_ID;
  const atCistern = snapshot.mode === "cistern" && snapshot.runtime.sceneId === PROLOGUE_CISTERN_SCENE_ID;
  const gatewaySource = atService ? "service" : atCistern ? "cistern" : null;
  const serviceReached = regionFlagTrue(snapshot, SERVICE_REACHED_FLAG);
  const denRouteOpen = regionFlagTrue(snapshot, DEN_ROUTE_OPEN_FLAG);
  const canEnter = gatewaySource === "service" ? serviceReached : gatewaySource === "cistern" ? denRouteOpen : false;
  const panelVisible = snapshot.mode === "wildlife" && snapshot.runtime.sceneId === PROLOGUE_WILDLIFE_SCENE_ID && wildlife !== null;
  const evidence = wildlife?.visitEvidence;
  const warningTicks = wildlife?.fox.warningTicks ?? 0;
  const warningRequiredTicks = wildlife === null ? 0 : projectedWarningTicks(wildlife);
  const denIntact = wildlife?.foxDenIntact ?? true;
  const routeOpen = wildlife?.denRouteOpen ?? denRouteOpen;
  const foxClearOfDen = wildlife === null ? false : !inside(wildlife.foxPositionTiles, wildlife.spatialBinding.denBoundsTiles);
  const commonReady = evidence !== undefined &&
    !evidence.playerHarmOccurred && evidence.warningObservedWithoutHarm && evidence.realExitReached &&
    evidence.currentOutsideWarningZone && evidence.currentEscapeLaneOpen && evidence.denIntactObserved &&
    evidence.oldLatchOpened && denIntact;
  const dig = wildlife?.digProgress;

  const routes = Object.freeze([
    routeModel(PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID, wildlife?.routeSolutionId ?? null, routeOpen,
      commonReady && evidence?.playerRetreatedAfterWarning === true,
      waitNext(evidence)),
    routeModel(PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID, wildlife?.routeSolutionId ?? null, routeOpen,
      commonReady && evidence?.lowForceNoiseUsed === true,
      nonDigNext(evidence, "make_low_force_noise")),
    routeModel(PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID, wildlife?.routeSolutionId ?? null, routeOpen,
      commonReady && evidence?.lowForceStaffUsed === true,
      nonDigNext(evidence, "use_wood_staff")),
    routeModel(PROLOGUE_WILDLIFE_DIG_SOLUTION_ID, wildlife?.routeSolutionId ?? null, routeOpen,
      dig !== undefined && dig.upperLineMarked && dig.upperBypassClear && dig.bracesInstalled &&
        dig.slumpBelowLimit && foxClearOfDen && evidence?.currentEscapeLaneOpen === true && denIntact,
      digNext(dig, foxClearOfDen)),
  ]);
  const rewards = wildlife?.rewards;
  const zeroRewardContract = rewards === undefined || Object.values(rewards).every((value) => value === 0);

  return Object.freeze({
    gatewayVisible: gatewaySource !== null,
    gatewaySource,
    canEnter,
    gatewayCopy: gatewaySource === "service"
      ? "可选生态支路：进入兽穴绕道；通往高位蓄水池的主线入口仍然保留。"
      : gatewaySource === "cistern"
        ? denRouteOpen ? "已打开的生态支路可以返回；也可继续留在蓄水池。" : "兽穴绕道尚未从另一侧打开；蓄水池玩法不受影响。"
        : "",
    mainlineRemainsAvailable: true,
    panelVisible,
    behaviorState: wildlife?.fox.behaviorState ?? "unavailable",
    behaviorLabel: behaviorLabel(wildlife?.fox.behaviorState),
    warningTicks,
    warningRequiredTicks,
    warningProgress: warningRequiredTicks === 0 ? 0 : evidence?.warningObservedWithoutHarm === true
      ? 1 : Math.min(1, warningTicks / warningRequiredTicks),
    warningObserved: evidence?.warningObservedWithoutHarm ?? false,
    safeRetreatRecorded: evidence?.playerRetreatedAfterWarning ?? false,
    realExitReached: evidence?.realExitReached ?? false,
    playerOutsideWarningZone: evidence?.currentOutsideWarningZone ?? true,
    escapeLaneOpen: evidence?.currentEscapeLaneOpen ?? true,
    denIntact,
    oldLatchOpened: evidence?.oldLatchOpened ?? false,
    foxPositionLabel: wildlife === null ? "--" : `${wildlife.foxPositionTiles.x.toFixed(1)}, ${wildlife.foxPositionTiles.y.toFixed(1)}`,
    routeOpen,
    routeSolutionId: wildlife?.routeSolutionId ?? null,
    routes,
    canReturnToService: wildlife?.serviceReturnAlwaysOpen ?? false,
    canGoToCistern: wildlife?.highCisternReady ?? false,
    maximumRecoverySeconds: wildlife?.softLockRecovery.maximumSeconds ?? 60,
    zeroRewardContract,
    safetyCopy: "这里没有 DPS 或击杀目标。四种解法均为 0 击杀；伤害、掉落、语言经验、MP 与金币奖励均为 0。",
  });
}

export function createRpgWildlifeUi(onCommand: (command: WildlifeUiCommand) => void): RpgWildlifeUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("RPG wildlife UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "wildlife-root";
  root.innerHTML = `
    <section class="wildlife-panel wildlife-gateway" data-wildlife-gateway hidden>
      <p class="eyebrow">N04 / N05 → N06 · OPTIONAL ECOLOGY ROUTE</p>
      <h2>兽穴绕道</h2>
      <p class="wildlife-copy" data-wildlife-gateway-copy></p>
      <button type="button" data-wildlife-command="enter">进入可选支路</button>
    </section>
    <section class="wildlife-panel" data-wildlife-panel hidden>
      <div class="panel-heading"><div><p class="eyebrow">N06 · ZERO-KILL WILDLIFE</p><h2>读懂狐狸的警告</h2></div>
        <strong data-wildlife-route-state>路线未打开</strong></div>
      <div class="wildlife-state">
        <span>狐狸状态<strong data-wildlife-behavior>--</strong></span>
        <span>警告读秒<strong data-wildlife-warning>--</strong></span>
        <span>狐狸位置<strong data-wildlife-position>--</strong></span>
        <span>兽穴<strong data-wildlife-den>完整</strong></span>
      </div>
      <div class="wildlife-warning-track" role="progressbar" aria-label="警告观察进度" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><b></b></div>
      <ol class="wildlife-safety-chain" aria-label="安全行为链">
        <li data-wildlife-evidence="warning" data-wildlife-warning-step>观察完整警告</li>
        <li data-wildlife-evidence="retreat">后退到警戒区外</li>
        <li data-wildlife-evidence="lane">保持真实逃生通道畅通</li>
        <li data-wildlife-evidence="exit">确认狐狸到达真实出口</li>
        <li data-wildlife-evidence="latch">安全后打开旧闩</li>
      </ol>
      <div class="wildlife-action-grid" aria-label="安全观察操作">
        ${commandButton("observe_warning", "观察警告", "读取生成阈值")}
        ${commandButton("retreat_safely", "安全后退", "不接触")}
        ${commandButton("wait_for_real_exit", "等待真实逃生", "留出通道")}
        ${commandButton("open_old_latch", "打开旧闩", "出口附近")}
      </div>
      <div class="wildlife-route-grid" data-wildlife-routes></div>
      <div class="wildlife-tools" aria-label="路线交互">
        ${commandButton("make_low_force_noise", "敲击空木", "0 伤害 · fear +20")}
        ${commandButton("use_wood_staff", "举起木杖", "0 命中 · 保持距离")}
        ${commandButton("mark_upper_line", "标记上方土线", "挖掘 1/3")}
        ${commandButton("dig_upper_bypass", "挖掘绕道", "挖掘 2/3")}
        ${commandButton("install_braces", "安装支撑", "挖掘 3/3")}
      </div>
      <p class="wildlife-safety-copy" data-wildlife-safety-copy></p>
      <div class="wildlife-navigation">
        <button type="button" data-wildlife-command="return_to_service">返回 N04</button>
        <button type="button" data-wildlife-command="go_to_cistern">前往 N05</button>
        <button type="button" data-wildlife-command="reset_checkpoint">重置到存档点</button>
        <button type="button" data-wildlife-command="recover_softlock">恢复安全通路（≤60 秒）</button>
      </div>
    </section>`;
  anchor.parentElement.insertBefore(root, anchor);

  let lastModel: WildlifeUiModel | null = null;
  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled || !root.contains(button)) return;
    const command = button.dataset.wildlifeCommand;
    if (!command) return;
    event.stopPropagation();
    if (command === "enter") {
      if (lastModel?.gatewaySource) onCommand({ kind: "enter_wildlife", source: lastModel.gatewaySource });
      return;
    }
    const solutionId = button.dataset.solutionId as PrologueWildlifeSolutionId | undefined;
    if (command === "complete_route" && solutionId) return onCommand({ kind: "complete_route", solutionId });
    const commands: Readonly<Record<string, WildlifeUiCommand>> = {
      observe_warning: { kind: "observe_warning" },
      retreat_safely: { kind: "retreat_safely" },
      wait_for_real_exit: { kind: "wait_for_real_exit" },
      make_low_force_noise: { kind: "make_low_force_noise" },
      use_wood_staff: { kind: "use_wood_staff" },
      open_old_latch: { kind: "open_old_latch" },
      mark_upper_line: { kind: "mark_upper_line" },
      dig_upper_bypass: { kind: "dig_upper_bypass" },
      install_braces: { kind: "install_braces" },
      return_to_service: { kind: "return_to_service" },
      go_to_cistern: { kind: "go_to_cistern" },
      recover_softlock: { kind: "recover_softlock" },
      reset_checkpoint: { kind: "reset_checkpoint" },
    };
    const resolved = commands[command];
    if (resolved) onCommand(resolved);
  });

  return Object.freeze({
    render(snapshot: WildlifeUiFlowSnapshot): void {
      const model = deriveWildlifeUiModel(snapshot);
      lastModel = model;
      required<HTMLElement>(root, "[data-wildlife-gateway]").hidden = !model.gatewayVisible;
      text(root, "[data-wildlife-gateway-copy]", model.gatewayCopy);
      required<HTMLButtonElement>(root, "[data-wildlife-command='enter']").disabled = !model.canEnter;
      required<HTMLElement>(root, "[data-wildlife-panel]").hidden = !model.panelVisible;
      if (!model.panelVisible) return;
      text(root, "[data-wildlife-behavior]", model.behaviorLabel);
      text(root, "[data-wildlife-warning-step]", model.warningRequiredTicks === 0
        ? "等待生成的警告阈值" : "观察完整的 " + model.warningRequiredTicks + " tick 警告");
      text(root, "[data-wildlife-warning]", model.warningRequiredTicks === 0
        ? "--" : `${Math.min(model.warningTicks, model.warningRequiredTicks)} / ${model.warningRequiredTicks} tick`);
      text(root, "[data-wildlife-position]", model.foxPositionLabel);
      text(root, "[data-wildlife-den]", model.denIntact ? "完整" : "已破坏");
      text(root, "[data-wildlife-route-state]", model.routeOpen ? `已打开 · ${model.routeSolutionId ?? "既有路线"}` : "路线未打开");
      text(root, "[data-wildlife-safety-copy]", model.safetyCopy);
      const progress = required<HTMLElement>(root, ".wildlife-warning-track");
      progress.setAttribute("aria-valuemax", String(model.warningRequiredTicks));
      progress.setAttribute("aria-valuenow", String(Math.round(model.warningProgress * model.warningRequiredTicks)));
      required<HTMLElement>(progress, "b").style.width = `${model.warningProgress * 100}%`;
      setEvidence(root, "warning", model.warningObserved);
      setEvidence(root, "retreat", model.safeRetreatRecorded && model.playerOutsideWarningZone);
      setEvidence(root, "lane", model.escapeLaneOpen);
      setEvidence(root, "exit", model.realExitReached);
      setEvidence(root, "latch", model.oldLatchOpened);
      required<HTMLElement>(root, "[data-wildlife-routes]").innerHTML = model.routes.map(routeCard).join("");
      required<HTMLButtonElement>(root, "[data-wildlife-command='observe_warning']").disabled = model.warningObserved || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='retreat_safely']").disabled = !model.warningObserved || model.safeRetreatRecorded || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='wait_for_real_exit']").disabled = !model.safeRetreatRecorded || model.realExitReached || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='open_old_latch']").disabled = !model.realExitReached || !model.playerOutsideWarningZone || !model.escapeLaneOpen || model.oldLatchOpened || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='make_low_force_noise']").disabled = !model.warningObserved || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='use_wood_staff']").disabled = !model.warningObserved || model.routeOpen;
      const digRoute = model.routes.find((route) => route.solutionId === PROLOGUE_WILDLIFE_DIG_SOLUTION_ID);
      required<HTMLButtonElement>(root, "[data-wildlife-command='mark_upper_line']").disabled = digRoute?.nextStep !== "mark_upper_line" || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='dig_upper_bypass']").disabled = digRoute?.nextStep !== "dig_upper_bypass" || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='install_braces']").disabled = digRoute?.nextStep !== "install_braces" || model.routeOpen;
      required<HTMLButtonElement>(root, "[data-wildlife-command='return_to_service']").disabled = !model.canReturnToService;
      required<HTMLButtonElement>(root, "[data-wildlife-command='go_to_cistern']").disabled = !model.canGoToCistern;
    },
  });
}

function routeModel(
  solutionId: PrologueWildlifeSolutionId,
  completedSolutionId: string | null,
  routeOpen: boolean,
  prerequisitesReady: boolean,
  nextStep: WildlifeUiStepId | null,
): WildlifeUiRouteModel {
  const completed = completedSolutionId === solutionId;
  const ready = !routeOpen && prerequisitesReady;
  const effectiveNext = completed || routeOpen ? null : ready ? "complete_route" : nextStep;
  return Object.freeze({
    solutionId,
    ...ROUTE_META[solutionId],
    completed,
    ready,
    nextStep: effectiveNext,
    nextStepLabel: completed ? "已用此方案打开" : routeOpen ? "路线已由其他方案打开" : ready ? "可以完成路线" : stepLabel(effectiveNext),
  });
}

function waitNext(evidence: PrologueWildlifeSnapshot["visitEvidence"] | undefined): WildlifeUiStepId {
  if (!evidence?.warningObservedWithoutHarm) return "observe_warning";
  if (!evidence.playerRetreatedAfterWarning || !evidence.currentOutsideWarningZone) return "retreat_safely";
  if (!evidence.realExitReached) return "wait_for_real_exit";
  if (!evidence.oldLatchOpened) return "open_old_latch";
  return "complete_route";
}

function nonDigNext(
  evidence: PrologueWildlifeSnapshot["visitEvidence"] | undefined,
  action: "make_low_force_noise" | "use_wood_staff",
): WildlifeUiStepId {
  if (!evidence?.warningObservedWithoutHarm) return "observe_warning";
  if (!(action === "make_low_force_noise" ? evidence.lowForceNoiseUsed : evidence.lowForceStaffUsed)) return action;
  if (!evidence.realExitReached) return "wait_for_real_exit";
  if (!evidence.oldLatchOpened) return "open_old_latch";
  return "complete_route";
}

function digNext(
  dig: PrologueWildlifeSnapshot["digProgress"] | undefined,
  foxClearOfDen: boolean,
): WildlifeUiStepId {
  if (!dig?.upperLineMarked) return "mark_upper_line";
  if (!foxClearOfDen) return "wait_for_real_exit";
  if (!dig.upperBypassClear) return "dig_upper_bypass";
  if (!dig.bracesInstalled || !dig.slumpBelowLimit) return "install_braces";
  return "complete_route";
}

function routeCard(route: WildlifeUiRouteModel): string {
  const state = route.completed ? "completed" : route.ready ? "ready" : "progress";
  return `<article class="wildlife-route" data-route-state="${state}">
    <span>0 KILL</span><h3>${route.label}</h3><p>${route.description}</p><small>${route.nextStepLabel}</small>
    <button type="button" data-wildlife-command="complete_route" data-solution-id="${route.solutionId}" ${route.ready ? "" : "disabled"}>完成此路线</button>
  </article>`;
}

function commandButton(command: string, label: string, note: string): string {
  return `<button type="button" data-wildlife-command="${command}"><strong>${label}</strong><small>${note}</small></button>`;
}

function behaviorLabel(state: PrologueWildlifeSnapshot["fox"]["behaviorState"] | undefined): string {
  if (!state) return "--";
  const labels: Readonly<Record<PrologueWildlifeSnapshot["fox"]["behaviorState"], string>> = {
    calm: "平静",
    observe: "观察玩家",
    warn: "发出警告",
    self_defense: "短暂自卫",
    flee: "逃向真实出口",
    return: "安全返回",
  };
  return labels[state];
}

function stepLabel(step: WildlifeUiStepId | null): string {
  if (step === null) return "等待世界状态";
  const labels: Readonly<Record<WildlifeUiStepId, string>> = {
    observe_warning: "下一步：观察完整警告",
    retreat_safely: "下一步：安全后退",
    wait_for_real_exit: "下一步：等待狐狸到达真实出口",
    make_low_force_noise: "下一步：在空木处制造低强度声音",
    use_wood_staff: "下一步：在距离标记处举杖并后退",
    open_old_latch: "下一步：在旧闩处打开通路",
    mark_upper_line: "下一步：标记上方挖掘线",
    dig_upper_bypass: "下一步：狐狸离巢后挖掘",
    install_braces: "下一步：安装支撑并控制塌落",
    complete_route: "下一步：提交路线完成",
  };
  return labels[step];
}

function regionFlagTrue(snapshot: WildlifeUiFlowSnapshot, flagId: string): boolean {
  return Object.values(snapshot.session.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === "valley_prologue" && flag.flagId === flagId && flag.value === true);
}

function projectedWarningTicks(snapshot: PrologueWildlifeSnapshot): number {
  return Number.isSafeInteger(snapshot.minimumWarningTicks) && snapshot.minimumWarningTicks > 0
    ? snapshot.minimumWarningTicks : 0;
}

function inside(
  point: Readonly<{ x: number; y: number }>,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width &&
    point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

function setEvidence(root: ParentNode, id: string, complete: boolean): void {
  required<HTMLElement>(root, `[data-wildlife-evidence='${id}']`).dataset.complete = String(complete);
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`Missing wildlife UI element: ${selector}`);
  return value;
}

function text(root: ParentNode, selector: string, value: string): void {
  required<HTMLElement>(root, selector).textContent = value;
}
