import "./settlement.css";
import {
  SettlementDemoSystem,
  type ActivityMode,
  type DemoActionResult,
  type SettlementDemoSnapshot,
} from "./game/settlement-demo";

const STORAGE_KEY = "tokipona.settlement-demo.v0.1";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app root");

app.innerHTML = `
  <section class="settlement-shell" aria-label="聚落生存灰盒">
    <header class="topline">
      <div>
        <span class="eyebrow">玩法灰盒 v0.1</span>
        <strong>河谷聚落 · 生存与加工</strong>
      </div>
      <a class="back-link" href="./index.html">返回魔法实验室</a>
    </header>

    <section class="needs-panel" aria-label="旅途需求">
      <div class="need" aria-label="饱食">
        <span>饱食</span>
        <div class="need__track"><div class="need__fill" id="satiety-fill"></div></div>
        <output id="satiety-text">85</output>
      </div>
      <div class="need" aria-label="水分">
        <span>水分</span>
        <div class="need__track"><div class="need__fill" id="hydration-fill"></div></div>
        <output id="hydration-text">90</output>
      </div>
      <div class="zone-badge" id="zone-badge">聚落安全区 · 代谢暂停</div>
    </section>

    <section class="clock-panel" aria-labelledby="clock-title">
      <h2 id="clock-title">双时钟验证</h2>
      <div class="clock-readout">
        <span>世界时间 <output id="world-time">0 分钟</output></span>
        <span>代谢时间 <output id="metabolism-time">0 分钟</output></span>
      </div>
      <div class="button-row" id="mode-controls">
        <button type="button" data-mode="safe_zone" aria-pressed="true">聚落安全区</button>
        <button type="button" data-mode="field" aria-pressed="false">野外活动</button>
        <button type="button" data-mode="paused" aria-pressed="false">暂停</button>
      </div>
      <div class="button-row">
        <button type="button" id="advance-one">推进 1 活动分钟</button>
        <button type="button" id="advance-thirty">推进 30 活动分钟</button>
        <button type="button" id="advance-three-hours">验证 3 小时</button>
      </div>
      <p class="note">只推进明确的活动时间；暂停、离线和现实墙钟不会结算。安全区工作只推进世界钟。</p>
    </section>

    <section class="action-card" aria-labelledby="supplies-title">
      <h2 id="supplies-title">旅途补给</h2>
      <div class="inventory-readout">
        <span>水壶 <output id="canteen-count">3 / 3</output></span>
        <span>旅行口粮 <output id="ration-count">1</output></span>
      </div>
      <div class="button-row">
        <button type="button" id="drink">喝水 +25</button>
        <button type="button" id="eat-ration">吃口粮 +30</button>
        <button type="button" id="relief">公共水井与植物餐</button>
      </div>
      <p class="caption"><span lang="tok">moku</span> · 公共餐食（环境性文字；不用答题，也不增加语言证据）</p>
    </section>

    <section class="action-card" aria-labelledby="kitchen-title">
      <h2 id="kitchen-title">公共厨房 · cook.game_meat.v0.1</h2>
      <div class="inventory-readout">
        <span>新鲜生肉 <output id="raw-count">1</output></span>
        <span>熟肉 <output id="cooked-count">0</output></span>
        <span>硬币 <output id="coin-count">0</output></span>
        <span>热源 8 EU ✓</span>
      </div>
      <div class="progress">
        <div class="progress__track"><div class="progress__fill" id="cooking-fill"></div></div>
        <output id="cooking-time">00:00 / 03:00</output>
      </div>
      <div class="button-row">
        <button type="button" id="start-cooking">开始加工</button>
        <button type="button" id="claim-cooking">领取熟肉</button>
        <button type="button" id="eat-cooked">食用熟肉 +35</button>
      </div>
      <div class="button-row">
        <button type="button" id="sell-cooked">出售熟肉 +2 硬币</button>
      </div>
      <p class="note">本入口预置一份灰盒测试肉，用于验证“素材 → 加工 → 食用/出售”；正式流程仍需从尸体记录分割取得，狩猎不是主线门槛。</p>
    </section>

    <p class="status-line" id="status" aria-live="polite">聚落内需求暂停；可先推进时间观察双时钟。</p>
  </section>
`;

const requiredElement = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

const loadDemo = (): SettlementDemoSystem => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? SettlementDemoSystem.fromSave(JSON.parse(stored)) : new SettlementDemoSystem();
  } catch {
    return new SettlementDemoSystem();
  }
};

const demo = loadDemo();
const satietyFill = requiredElement<HTMLElement>("#satiety-fill");
const hydrationFill = requiredElement<HTMLElement>("#hydration-fill");
const satietyText = requiredElement<HTMLOutputElement>("#satiety-text");
const hydrationText = requiredElement<HTMLOutputElement>("#hydration-text");
const zoneBadge = requiredElement<HTMLElement>("#zone-badge");
const worldTime = requiredElement<HTMLOutputElement>("#world-time");
const metabolismTime = requiredElement<HTMLOutputElement>("#metabolism-time");
const canteenCount = requiredElement<HTMLOutputElement>("#canteen-count");
const rationCount = requiredElement<HTMLOutputElement>("#ration-count");
const rawCount = requiredElement<HTMLOutputElement>("#raw-count");
const cookedCount = requiredElement<HTMLOutputElement>("#cooked-count");
const coinCount = requiredElement<HTMLOutputElement>("#coin-count");
const cookingFill = requiredElement<HTMLElement>("#cooking-fill");
const cookingTime = requiredElement<HTMLOutputElement>("#cooking-time");
const status = requiredElement<HTMLElement>("#status");

const modeLabels: Readonly<Record<ActivityMode, string>> = {
  safe_zone: "聚落安全区 · 代谢暂停",
  field: "野外活动 · 代谢运行",
  paused: "游戏暂停 · 双时钟暂停",
};

const formatClock = (minutes: number): string => `${minutes.toFixed(minutes % 1 === 0 ? 0 : 1)} 分钟`;

const formatDuration = (seconds: number): string => {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
};

const save = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demo.toSave()));
  } catch {
    status.textContent = "浏览器拒绝本地存档；本次会话仍可继续。";
  }
};

const render = (snapshot: SettlementDemoSnapshot): void => {
  const survival = snapshot.survival;
  satietyFill.style.width = `${survival.satiety}%`;
  hydrationFill.style.width = `${survival.hydration}%`;
  satietyText.value = String(Math.round(survival.satiety));
  hydrationText.value = String(Math.round(survival.hydration));
  zoneBadge.textContent = modeLabels[snapshot.mode];
  worldTime.value = formatClock(survival.worldMinutes);
  metabolismTime.value = formatClock(survival.metabolismMinutes);
  canteenCount.value = `${survival.canteenCharges} / 3`;
  rationCount.value = String(survival.travelRations);
  rawCount.value = String(snapshot.rawMeat);
  cookedCount.value = String(snapshot.cookedMeat);
  coinCount.value = String(snapshot.coins);
  cookingFill.style.width = `${(snapshot.cookingProgressSeconds / snapshot.cookingRequiredSeconds) * 100}%`;
  cookingTime.value = `${formatDuration(snapshot.cookingProgressSeconds)} / 03:00`;

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === snapshot.mode));
  });
  requiredElement<HTMLButtonElement>("#advance-one").disabled = snapshot.mode === "paused";
  requiredElement<HTMLButtonElement>("#advance-thirty").disabled = snapshot.mode === "paused";
  requiredElement<HTMLButtonElement>("#advance-three-hours").disabled = snapshot.mode === "paused";
  requiredElement<HTMLButtonElement>("#drink").disabled = survival.canteenCharges <= 0;
  requiredElement<HTMLButtonElement>("#eat-ration").disabled = survival.travelRations <= 0;
  requiredElement<HTMLButtonElement>("#start-cooking").disabled = snapshot.rawMeat <= 0 || snapshot.cookingState !== "idle";
  requiredElement<HTMLButtonElement>("#claim-cooking").disabled = snapshot.cookingState !== "completed";
  requiredElement<HTMLButtonElement>("#eat-cooked").disabled = snapshot.cookedMeat <= 0;
  requiredElement<HTMLButtonElement>("#sell-cooked").disabled = snapshot.cookedMeat <= 0;
};

const commitAction = (action: () => DemoActionResult): void => {
  const result = action();
  status.textContent = result.message;
  render(result.snapshot);
  save();
};

const advance = (minutes: number): void => {
  const before = demo.snapshot();
  const snapshot = demo.advanceActiveMinutes(minutes);
  const metabolismDelta = snapshot.survival.metabolismMinutes - before.survival.metabolismMinutes;
  status.textContent = metabolismDelta === 0
    ? `世界时间推进 ${minutes} 分钟；当前区域冻结代谢。`
    : `野外活动推进 ${minutes} 分钟；代谢同步结算。`;
  render(snapshot);
  save();
};

document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode as ActivityMode;
    render(demo.setMode(mode));
    status.textContent = modeLabels[mode];
    save();
  });
});

requiredElement<HTMLButtonElement>("#advance-one").addEventListener("click", () => advance(1));
requiredElement<HTMLButtonElement>("#advance-thirty").addEventListener("click", () => advance(30));
requiredElement<HTMLButtonElement>("#advance-three-hours").addEventListener("click", () => advance(180));
requiredElement<HTMLButtonElement>("#drink").addEventListener("click", () => {
  const id = demo.nextTransactionId("drink-canteen");
  commitAction(() => demo.drinkFromCanteen(id));
});
requiredElement<HTMLButtonElement>("#eat-ration").addEventListener("click", () => {
  const id = demo.nextTransactionId("eat-ration");
  commitAction(() => demo.eatTravelRation(id));
});
requiredElement<HTMLButtonElement>("#relief").addEventListener("click", () => {
  const id = demo.nextTransactionId("public-relief");
  commitAction(() => demo.usePublicRelief(id));
});
requiredElement<HTMLButtonElement>("#start-cooking").addEventListener("click", () => {
  const id = demo.nextTransactionId("start-cooking");
  commitAction(() => demo.startCooking(id));
});
requiredElement<HTMLButtonElement>("#claim-cooking").addEventListener("click", () => {
  const id = demo.nextTransactionId("claim-cooking");
  commitAction(() => demo.claimCookedMeat(id));
});
requiredElement<HTMLButtonElement>("#eat-cooked").addEventListener("click", () => {
  const id = demo.nextTransactionId("eat-cooked");
  commitAction(() => demo.eatCookedMeat(id));
});
requiredElement<HTMLButtonElement>("#sell-cooked").addEventListener("click", () => {
  const id = demo.nextTransactionId("sell-cooked");
  commitAction(() => demo.sellCookedMeat(id));
});

render(demo.snapshot());
