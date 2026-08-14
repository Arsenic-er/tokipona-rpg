import type { PrologueFlowOldMineView } from "./game/prologue-flow";

export type OldMineUiCommand = Readonly<{ kind: "enter_old_mine" }> | Readonly<{ kind: "return_settlement" }>;

export interface OldMineUiModel {
  readonly gatewayVisible: boolean;
  readonly panelVisible: boolean;
  readonly chapterComplete: boolean;
  readonly peacefulExit: true;
  readonly killCount: 0;
  readonly canEnter: boolean;
  readonly canReturn: boolean;
}

export const OLD_MINE_UI_TEMPLATE = `
  <section class="old-mine-gateway" data-old-mine-gateway hidden aria-labelledby="old-mine-gateway-title">
    <div class="panel-heading"><div><p class="eyebrow">CH01 EXIT / OLD MINE</p><h2 id="old-mine-gateway-title">旧矿门槛</h2></div>
      <strong>和平出口</strong></div>
    <p>完成回流水路并回到聚落后，才可进入本章的和平门槛；安全靶场仍是可选支路。</p>
    <button type="button" data-old-mine-enter>进入旧矿门槛</button>
  </section>
  <section class="old-mine-panel" data-old-mine-panel hidden aria-labelledby="old-mine-title">
    <div class="panel-heading"><div><p class="eyebrow">PEACEFUL CHAPTER THRESHOLD</p><h2 id="old-mine-title">旧矿入口</h2></div>
      <strong data-old-mine-state>已完成</strong></div>
    <p>序章主线以零击杀抵达旧矿；本场景不生成攻击资格、战斗奖励或素材掉落。</p>
    <div class="old-mine-contract" aria-label="和平完成合同">
      <span>章节完成<strong data-old-mine-complete>是</strong></span>
      <span>和平出口<strong>是</strong></span>
      <span>击杀数<strong data-old-mine-kills>0</strong></span>
    </div>
    <button type="button" data-old-mine-return>返回 N02 聚落</button>
    <p class="old-mine-live" role="status" aria-live="polite" aria-atomic="true"></p>
  </section>`;

export function deriveOldMineUiModel(view: PrologueFlowOldMineView): OldMineUiModel {
  const panelVisible = view.mode === "old_mine" && view.inOldMine && view.sceneId === "scene.valley.old_mine_threshold";
  return Object.freeze({
    gatewayVisible: view.mode === "settlement" && view.entryAvailable,
    panelVisible,
    chapterComplete: panelVisible && view.chapterComplete,
    peacefulExit: true,
    killCount: 0,
    canEnter: view.mode === "settlement" && view.entryAvailable,
    canReturn: panelVisible && view.returnToSettlementAvailable && view.chapterComplete,
  });
}

export function resolveOldMineUiIntent(model: OldMineUiModel, kind: OldMineUiCommand["kind"]): OldMineUiCommand | null {
  if (kind === "enter_old_mine") return model.canEnter ? Object.freeze({ kind }) : null;
  return model.canReturn ? Object.freeze({ kind }) : null;
}

export interface RpgOldMineUi { render(view: PrologueFlowOldMineView): void; }

export function createRpgOldMineUi(onCommand: (command: OldMineUiCommand) => void): RpgOldMineUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("old-mine UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "old-mine-root";
  root.innerHTML = OLD_MINE_UI_TEMPLATE;
  anchor.parentElement.insertBefore(root, anchor);
  let current: OldMineUiModel | null = null;
  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled || !current) return;
    const kind = button.hasAttribute("data-old-mine-enter") ? "enter_old_mine" :
      button.hasAttribute("data-old-mine-return") ? "return_settlement" : null;
    if (!kind) return;
    const command = resolveOldMineUiIntent(current, kind);
    if (command) onCommand(command);
  });
  return Object.freeze({ render(view: PrologueFlowOldMineView) {
    const model = deriveOldMineUiModel(view);
    current = model;
    const gateway = required<HTMLElement>(root, "[data-old-mine-gateway]");
    const panel = required<HTMLElement>(root, "[data-old-mine-panel]");
    gateway.hidden = !model.gatewayVisible;
    panel.hidden = !model.panelVisible;
    required<HTMLButtonElement>(root, "[data-old-mine-enter]").disabled = !model.canEnter;
    required<HTMLButtonElement>(root, "[data-old-mine-return]").disabled = !model.canReturn;
    required<HTMLElement>(root, "[data-old-mine-complete]").textContent = model.chapterComplete ? "是" : "否";
    required<HTMLElement>(root, "[data-old-mine-kills]").textContent = String(model.killCount);
    required<HTMLElement>(root, "[data-old-mine-state]").textContent = model.chapterComplete ? "已完成" : "未完成";
    required<HTMLElement>(root, ".old-mine-live").textContent = model.panelVisible
      ? "和平门槛已提交；可返回聚落或保存后继续。" : "";
  } });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`missing ${selector}`);
  return value;
}
