import type { PrologueFlowSnapshot } from "./game/prologue-flow";
import { GIFTED_RABBIT_ENTITY_ID } from "./game/gifted-carcass";

export type EconomyUiCommand =
  | Readonly<{ kind: "accept_gift" }>
  | Readonly<{ kind: "harvest_meat" }>
  | Readonly<{ kind: "start_cooking" }>
  | Readonly<{ kind: "work_cooking" }>
  | Readonly<{ kind: "complete_cooking" }>
  | Readonly<{ kind: "claim_cooking" }>
  | Readonly<{ kind: "consume_cooked" }>
  | Readonly<{ kind: "issue_sell"; merchantId: "settlement.butcher"; lotId: string; quantity: 1 }>
  | Readonly<{ kind: "confirm_sell"; quoteId: string }>;

export interface EconomyUiLot {
  readonly lotId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly freshness: string;
}

export interface EconomyUiModel {
  readonly panelVisible: boolean;
  readonly coin: number;
  readonly satiety: number;
  readonly hydration: number;
  readonly giftedCarcassPresent: boolean;
  readonly harvestableMeat: number;
  readonly rawMeat: number;
  readonly cookedMeat: number;
  readonly cookingStatus: string;
  readonly sellableLots: readonly EconomyUiLot[];
  readonly canAcceptGift: boolean;
  readonly canHarvest: boolean;
  readonly canStartCooking: boolean;
  readonly canWorkCooking: boolean;
  readonly canCompleteCooking: boolean;
  readonly canClaimCooking: boolean;
  readonly canConsumeCooked: boolean;
  readonly zeroLearningReward: true;
  readonly zeroAttackReward: true;
}

const sumLots = (snapshot: PrologueFlowSnapshot, itemId: string): number =>
  snapshot.session.economy.lots
    .filter((lot) => lot.itemId === itemId && lot.legalOwnerId === snapshot.sessionId && lot.stolenFromId === null)
    .reduce((total, lot) => total + lot.quantity, 0);

export function deriveEconomyUiModel(snapshot: PrologueFlowSnapshot): EconomyUiModel {
  const corpses = Object.values(snapshot.session.lifeCorpseLedger.corpses);
  const giftedCorpses = corpses.filter((corpse) => corpse.entityId === GIFTED_RABBIT_ENTITY_ID);
  const harvestableMeat = giftedCorpses.flatMap((corpse) => corpse.tissueSlots)
    .filter((slot) => slot.tissueSlotId === "meat")
    .reduce((total, slot) => total + slot.remainingQuantity, 0);
  const cookingOrders = snapshot.session.economy.workOrders
    .filter((order) => order.recipeId === "cook.game_meat.v0.1" && order.status !== "claimed" && order.status !== "cancelled");
  const cooking = cookingOrders.at(-1) ?? null;
  const worked = cooking !== null && snapshot.session.economy.processingReceipts.some((receipt) =>
    receipt.workOrderId === cooking.workOrderId && receipt.action === "work");
  const sellableLots = snapshot.session.economy.lots
    .filter((lot) => lot.legalOwnerId === snapshot.sessionId && lot.quantity > 0 && lot.economyEligible &&
      !lot.reserved && !lot.equipped && lot.stolenFromId === null && lot.wildlifeProvenance !== undefined)
    .map((lot) => Object.freeze({ lotId: lot.lotId, itemId: lot.itemId, quantity: lot.quantity, freshness: lot.freshness }));
  const rawMeat = sumLots(snapshot, "food.raw_small_game_meat");
  const cookedMeat = sumLots(snapshot, "food.cooked_game_meat");
  return Object.freeze({
    panelVisible: snapshot.mode === "settlement",
    coin: snapshot.session.economy.coin,
    satiety: snapshot.session.survival.satiety,
    hydration: snapshot.session.survival.hydration,
    giftedCarcassPresent: giftedCorpses.length > 0,
    harvestableMeat,
    rawMeat,
    cookedMeat,
    cookingStatus: cooking?.status ?? "none",
    sellableLots: Object.freeze(sellableLots),
    canAcceptGift: snapshot.mode === "settlement" && giftedCorpses.length === 0,
    canHarvest: snapshot.mode === "settlement" && harvestableMeat > 0,
    canStartCooking: snapshot.mode === "settlement" && rawMeat > 0 && cooking === null,
    canWorkCooking: snapshot.mode === "settlement" && cooking?.status === "reserved" && !worked,
    canCompleteCooking: snapshot.mode === "settlement" && cooking?.status === "reserved" && worked,
    canClaimCooking: snapshot.mode === "settlement" && cooking?.status === "completed",
    canConsumeCooked: snapshot.mode === "settlement" && cookedMeat > 0,
    zeroLearningReward: true,
    zeroAttackReward: true,
  });
}

export interface RpgEconomyUi {
  render(snapshot: PrologueFlowSnapshot): void;
  rememberQuote(quoteId: string): void;
  clearQuote(): void;
}

export function createRpgEconomyUi(onCommand: (command: EconomyUiCommand) => void): RpgEconomyUi {
  const anchor = document.querySelector<HTMLElement>(".status");
  if (!anchor?.parentElement) throw new Error("RPG economy UI requires the status element");
  const root = document.createElement("section");
  root.dataset.ui = "economy-root";
  root.innerHTML = `
    <section class="economy-panel" data-economy-panel hidden>
      <div class="panel-heading"><div><p class="eyebrow">N02 / WILDLIFE ECONOMY</p><h2>赠予、加工与验证交易</h2></div>
        <strong data-economy-order>无工单</strong></div>
      <div class="economy-state">
        <span>硬币<strong data-economy-coin>0</strong></span>
        <span>饱食<strong data-economy-satiety>0</strong></span>
        <span>水分<strong data-economy-hydration>0</strong></span>
        <span>生肉 / 熟肉<strong data-economy-meat>0 / 0</strong></span>
      </div>
      <p class="economy-copy">动物、尸体、收获与加工都不会提供语言、MP、容量或攻击资格证据。</p>
      <div class="economy-action-grid">
        <button type="button" data-economy-command="accept_gift">接受赠予兔尸</button>
        <button type="button" data-economy-command="harvest_meat">在屠宰台取肉</button>
        <button type="button" data-economy-command="start_cooking">在公共厨房开工</button>
        <button type="button" data-economy-command="work_cooking">完成 3 分钟工作</button>
        <button type="button" data-economy-command="complete_cooking">结算烹饪</button>
        <button type="button" data-economy-command="claim_cooking">领取成品</button>
        <button type="button" data-economy-command="consume_cooked">食用熟肉</button>
      </div>
      <div class="economy-sell">
        <label>可验证出售<select data-economy-sell-lot></select></label>
        <button type="button" data-economy-command="issue_sell">向屠夫询价</button>
        <button type="button" data-economy-command="confirm_sell">确认当前报价</button>
        <small data-economy-quote>没有本次运行签发的报价</small>
      </div>
    </section>`;
  anchor.parentElement.insertBefore(root, anchor);
  let pendingQuoteId: string | null = null;

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;
    const kind = button.dataset.economyCommand;
    if (kind === "issue_sell") {
      const lotId = required<HTMLSelectElement>(root, "[data-economy-sell-lot]").value;
      if (lotId) onCommand({ kind, merchantId: "settlement.butcher", lotId, quantity: 1 });
      return;
    }
    if (kind === "confirm_sell") {
      if (pendingQuoteId) onCommand({ kind, quoteId: pendingQuoteId });
      return;
    }
    if (kind && ["accept_gift", "harvest_meat", "start_cooking", "work_cooking", "complete_cooking", "claim_cooking", "consume_cooked"].includes(kind)) {
      onCommand({ kind } as EconomyUiCommand);
    }
  });

  return Object.freeze({
    render(snapshot: PrologueFlowSnapshot): void {
      const model = deriveEconomyUiModel(snapshot);
      required<HTMLElement>(root, "[data-economy-panel]").hidden = !model.panelVisible;
      if (!model.panelVisible) return;
      text(root, "[data-economy-coin]", String(model.coin));
      text(root, "[data-economy-satiety]", String(model.satiety));
      text(root, "[data-economy-hydration]", String(model.hydration));
      text(root, "[data-economy-meat]", `${model.rawMeat} / ${model.cookedMeat}`);
      text(root, "[data-economy-order]", model.cookingStatus === "none" ? "无工单" : model.cookingStatus);
      const availability: Readonly<Record<string, boolean>> = {
        accept_gift: model.canAcceptGift, harvest_meat: model.canHarvest, start_cooking: model.canStartCooking,
        work_cooking: model.canWorkCooking, complete_cooking: model.canCompleteCooking,
        claim_cooking: model.canClaimCooking, consume_cooked: model.canConsumeCooked,
        issue_sell: model.sellableLots.length > 0, confirm_sell: pendingQuoteId !== null,
      };
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-economy-command]")) {
        button.disabled = availability[button.dataset.economyCommand ?? ""] !== true;
      }
      const select = required<HTMLSelectElement>(root, "[data-economy-sell-lot]");
      const previous = select.value;
      select.replaceChildren(...model.sellableLots.map((lot) => {
        const option = document.createElement("option");
        option.value = lot.lotId;
        option.textContent = `${lot.itemId} ×${lot.quantity} · ${lot.freshness}`;
        return option;
      }));
      if (model.sellableLots.some((lot) => lot.lotId === previous)) select.value = previous;
      text(root, "[data-economy-quote]", pendingQuoteId ?? "没有本次运行签发的报价");
    },
    rememberQuote(quoteId: string): void {
      pendingQuoteId = quoteId.trim() || null;
      text(root, "[data-economy-quote]", pendingQuoteId ?? "没有本次运行签发的报价");
      required<HTMLButtonElement>(root, "[data-economy-command='confirm_sell']").disabled = pendingQuoteId === null;
    },
    clearQuote(): void {
      pendingQuoteId = null;
      text(root, "[data-economy-quote]", "没有本次运行签发的报价");
      required<HTMLButtonElement>(root, "[data-economy-command='confirm_sell']").disabled = true;
    },
  });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`missing RPG economy UI element ${selector}`);
  return element;
}

function text(root: ParentNode, selector: string, value: string): void {
  required<HTMLElement>(root, selector).textContent = value;
}
