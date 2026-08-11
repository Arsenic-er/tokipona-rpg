import "./trade.css";
import {
  MERCHANT_DIRECTORY,
  TRADE_ITEMS,
  TradeSystem,
  createDemoTradeLots,
  type MerchantDefinition,
  type MerchantId,
  type SellQuote,
  type TradeLot,
} from "./game/trade";

const STORAGE_KEY = "tokipona.trade.v0.1";
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app root");

app.innerHTML = `
  <section class="trade-shell" aria-label="聚落交易实验页">
    <header class="topline">
      <div>
        <span class="eyebrow">独立交易评审页 v0.1 · 非最终数值</span>
        <strong>河谷聚落市场</strong>
      </div>
      <nav><a href="./survival.html">生存实验</a><a href="./index.html">魔法实验</a></nav>
    </header>

    <section class="wallet-panel">
      <span>钱袋 <output id="coin-count">0</output> 硬币</span>
      <span>评审种子库存/钱袋尚未接入聚落正式存档</span>
    </section>

    <section class="market-layout">
      <aside class="merchant-list" aria-labelledby="merchant-list-title">
        <h2 id="merchant-list-title">交易对象</h2>
        <div id="merchant-buttons"></div>
      </aside>

      <section class="trade-desk" aria-live="polite">
        <div id="merchant-detail"></div>
        <h2>玩家物品堆</h2>
        <div class="inventory-list" id="inventory-list"></div>
      </section>
    </section>

    <section class="quote-panel" id="quote-panel">
      <h2>待确认报价</h2>
      <div id="quote-content">尚未询价。商人不会直接拿走物品。</div>
      <button type="button" id="confirm-quote" disabled>确认交易</button>
    </section>

    <p class="status-line" id="status" aria-live="polite">先选择一个职业，再检查每件物品的收购理由。</p>
  </section>
`;

const required = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const loadTrade = (): TradeSystem => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? TradeSystem.fromSave(JSON.parse(raw)) : new TradeSystem(createDemoTradeLots());
  } catch {
    return new TradeSystem([]);
  }
};

let trade = loadTrade();
let selectedMerchantId: MerchantId = "settlement.butcher";
let pendingQuote: SellQuote | undefined;
let transactionSequence = 0;
let activeSessionSeconds = 0;
let lastClockSample = performance.now();

const sampleActiveClock = (): number => {
  const now = performance.now();
  if (document.visibilityState === "visible") {
    activeSessionSeconds += Math.max(0, Math.min(0.5, (now - lastClockSample) / 1000));
  }
  lastClockSample = now;
  return Math.floor(activeSessionSeconds);
};

window.setInterval(sampleActiveClock, 250);
document.addEventListener("visibilitychange", () => {
  lastClockSample = performance.now();
});

const merchantButtons = required<HTMLElement>("#merchant-buttons");
const merchantDetail = required<HTMLElement>("#merchant-detail");
const inventoryList = required<HTMLElement>("#inventory-list");
const coinCount = required<HTMLOutputElement>("#coin-count");
const quoteContent = required<HTMLElement>("#quote-content");
const confirmQuote = required<HTMLButtonElement>("#confirm-quote");
const status = required<HTMLElement>("#status");

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const merchantById = (merchantId: MerchantId): MerchantDefinition => {
  const merchant = MERCHANT_DIRECTORY.find((entry) => entry.merchantId === merchantId);
  if (!merchant) throw new Error(`Unknown merchant: ${merchantId}`);
  return merchant;
};

const save = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trade.toSave()));
  } catch {
    status.textContent = "浏览器拒绝写入本地存档；本页仍可临时试用。";
  }
};

const renderMerchantButtons = (): void => {
  merchantButtons.innerHTML = MERCHANT_DIRECTORY.map(
    (merchant) => `
      <button
        type="button"
        data-merchant="${merchant.merchantId}"
        aria-pressed="${merchant.merchantId === selectedMerchantId}"
      >
        <span>${escapeHtml(merchant.professionZh)}</span>
        <small>${merchant.status === "active" ? "可交易" : "规划中"}</small>
      </button>
    `,
  ).join("");

  merchantButtons.querySelectorAll<HTMLButtonElement>("[data-merchant]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMerchantId = button.dataset.merchant as MerchantId;
      pendingQuote = undefined;
      status.textContent = `已选择${merchantById(selectedMerchantId).professionZh}。`;
      render();
    });
  });
};

const renderMerchantDetail = (merchant: MerchantDefinition): void => {
  const state = trade.snapshot().merchantStates.find((entry) => entry.merchantId === merchant.merchantId);
  const remaining = Math.max(0, merchant.fullPriceUnitsPerRestock - (state?.soldUnitsSinceRestock ?? 0));
  merchantDetail.innerHTML = `
    <div class="merchant-heading">
      <div><span class="eyebrow">${escapeHtml(merchant.merchantId)}</span><h1>${escapeHtml(merchant.professionZh)}</h1></div>
      <span class="status-chip ${merchant.status}">${merchant.status === "active" ? "已开放" : "规划中"}</span>
    </div>
    <div class="merchant-rules">
      <p><strong>出售：</strong>${merchant.sellsZh.map(escapeHtml).join("、")}</p>
      <p><strong>拒绝：</strong>${merchant.refusesZh.map(escapeHtml).join("、")}</p>
      <p><strong>本轮全价需求：</strong>${remaining} / ${merchant.fullPriceUnitsPerRestock}；超量策略：${merchant.excessPolicy === "quarter_price" ? "四分之一价" : "拒收"}</p>
    </div>
  `;
};

const lotRow = (lot: TradeLot): string => {
  const item = TRADE_ITEMS[lot.itemId];
  const itemName = item?.nameZh ?? lot.itemId;
  const eligibility = trade.getEligibility(selectedMerchantId, lot.lotId, 1);
  const empty = lot.quantity <= 0;
  return `
    <article class="lot-row ${eligibility.eligible && !empty ? "eligible" : "refused"}">
      <div class="lot-main">
        <strong>${escapeHtml(itemName)}</strong>
        <span>${escapeHtml(lot.itemId)} · 数量 ${lot.quantity}</span>
        <span>来源 ${escapeHtml(lot.originKind)} · 新鲜度 ${escapeHtml(lot.freshness)} · 天然比例 ${escapeHtml(String(lot.naturalFraction))}</span>
      </div>
      <div class="lot-decision">
        <span>${escapeHtml(empty ? "物品堆已售空" : eligibility.messageZh)}</span>
        <button type="button" data-quote-lot="${escapeHtml(lot.lotId)}" ${!eligibility.eligible || empty ? "disabled" : ""}>询价 1 件</button>
      </div>
    </article>
  `;
};

const renderInventory = (): void => {
  const lots = trade.snapshot().lots;
  inventoryList.innerHTML = lots.map(lotRow).join("");
  inventoryList.querySelectorAll<HTMLButtonElement>("[data-quote-lot]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = trade.createSellQuote(
        selectedMerchantId,
        button.dataset.quoteLot ?? "",
        1,
        sampleActiveClock(),
      );
      pendingQuote = result.quote;
      status.textContent = result.eligibility.messageZh;
      save();
      renderQuote();
    });
  });
};

const renderQuote = (): void => {
  if (!pendingQuote) {
    quoteContent.textContent = "尚未询价。商人不会直接拿走物品。";
    confirmQuote.disabled = true;
    return;
  }
  quoteContent.innerHTML = `
    <strong>${escapeHtml(pendingQuote.itemNameZh)} × ${pendingQuote.quantity}</strong>
    <span>全价 ${pendingQuote.fullPriceUnits} 件；折价 ${pendingQuote.excessUnits} 件</span>
    <span>商人支付 ${pendingQuote.totalCoin} 硬币 · 五分钟内有效 · 只可确认一次</span>
  `;
  confirmQuote.disabled = false;
};

const render = (): void => {
  const merchant = merchantById(selectedMerchantId);
  coinCount.value = String(trade.snapshot().coin);
  renderMerchantButtons();
  renderMerchantDetail(merchant);
  renderInventory();
  renderQuote();
};

const confirmPendingQuote = async (): Promise<void> => {
  const requested = pendingQuote;
  if (!requested) return;
  const currentTick = sampleActiveClock();
  if (currentTick > requested.expiresWorldTick) {
    pendingQuote = undefined;
    status.textContent = "报价已超过五个活动分钟，请重新询价。";
    render();
    return;
  }

  const commitLatest = (): void => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const latest = raw ? TradeSystem.fromSave(JSON.parse(raw)) : new TradeSystem(createDemoTradeLots());
    const refreshed = latest.createSellQuote(requested.merchantId, requested.lotId, requested.quantity, currentTick);
    if (!refreshed.accepted || !refreshed.quote) {
      trade = latest;
      pendingQuote = undefined;
      status.textContent = `交易状态已变化：${refreshed.eligibility.messageZh}`;
      render();
      return;
    }
    if (refreshed.quote.totalCoin !== requested.totalCoin) {
      trade = latest;
      pendingQuote = undefined;
      status.textContent = "需求或价格已变化；没有扣除物品，请重新确认新报价。";
      save();
      render();
      return;
    }

    transactionSequence += 1;
    const transactionId = `trade.ui.${crypto.randomUUID()}.${transactionSequence}`;
    const result = latest.commitSellQuote(refreshed.quote.quoteId, transactionId, currentTick);
    trade = latest;
    pendingQuote = undefined;
    status.textContent = result.messageZh;
    save();
    render();
  };

  if (navigator.locks) {
    await navigator.locks.request(STORAGE_KEY, () => commitLatest());
  } else {
    status.textContent = "浏览器不支持跨标签页提交锁；请只在一个标签页中评审。";
    commitLatest();
  }
};

confirmQuote.addEventListener("click", () => {
  void confirmPendingQuote();
});

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    trade = TradeSystem.fromSave(JSON.parse(event.newValue));
    pendingQuote = undefined;
    status.textContent = "检测到另一标签页更新了交易存档，已重新载入。";
    render();
  } catch {
    status.textContent = "另一标签页写入了无效交易存档。";
  }
});

render();
