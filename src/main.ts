import "./styles.css";
import { MaterialLab, SPELLS, type LabSnapshot, type SpellId } from "./game/lab";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app root");

app.innerHTML = `
  <section class="lab-shell" aria-label="道本语魔法材料实验室">
    <header class="hud">
      <div class="hud__title">
        <span class="eyebrow">物理灰盒 v0.1</span>
        <strong>暗色洞窟实验室</strong>
        <a class="mode-link" href="./survival.html">&#29983;&#23384;&#28784;&#30418; &rarr;</a>
      </div>
      <div class="meter" aria-label="魔力">
        <span>MP</span>
        <div class="meter__track"><div class="meter__fill" id="mp-fill"></div></div>
        <output id="mp-text">24 / 24</output>
      </div>
    </header>

    <div class="game-frame">
      <canvas id="game" aria-label="可破坏材料实验场景"></canvas>
      <div class="crosshair-copy" aria-hidden="true">法术只输入物质、热量或力；环境决定结果</div>
    </div>

    <section class="spell-panel" aria-label="单词共鸣">
      <div class="spell-readout">
        <span>当前共鸣</span>
        <strong id="selected-spell">telo</strong>
        <small id="selected-description">显化水；随后受重力影响</small>
      </div>
      <div class="spell-grid" id="spell-grid"></div>
    </section>

    <footer class="lab-controls">
      <button id="meditate" type="button">冥想恢复 MP</button>
      <button id="blast" type="button">实验震碎</button>
      <button id="reset" type="button">重置场景</button>
      <p id="sample">目标：空气 · 20°C</p>
      <p class="help">移动：WASD / 方向键　施法：点击场景　1–6 选词　B 震碎　R 重置</p>
    </footer>
  </section>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const spellGrid = document.querySelector<HTMLElement>("#spell-grid");
const mpFill = document.querySelector<HTMLElement>("#mp-fill");
const mpText = document.querySelector<HTMLOutputElement>("#mp-text");
const selectedSpell = document.querySelector<HTMLElement>("#selected-spell");
const selectedDescription = document.querySelector<HTMLElement>("#selected-description");
const sampleText = document.querySelector<HTMLElement>("#sample");
if (!canvas || !spellGrid || !mpFill || !mpText || !selectedSpell || !selectedDescription || !sampleText) {
  throw new Error("Missing laboratory UI element");
}

const lab = new MaterialLab(canvas);

SPELLS.forEach((spell, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.spell = spell.id;
  button.innerHTML = `<span>${index + 1}</span><strong>${spell.label}</strong><small>${spell.cost} MP</small>`;
  button.addEventListener("click", () => lab.selectSpell(spell.id));
  spellGrid.append(button);
});

document.querySelector<HTMLButtonElement>("#meditate")?.addEventListener("click", () => lab.meditate());
document.querySelector<HTMLButtonElement>("#blast")?.addEventListener("click", () => lab.triggerLabBlast());
document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => lab.reset());

const updateUi = (snapshot: LabSnapshot): void => {
  mpFill.style.width = `${(snapshot.mp / snapshot.maxMp) * 100}%`;
  mpText.value = `${snapshot.mp} / ${snapshot.maxMp}`;
  selectedSpell.textContent = snapshot.selectedSpell;
  const definition = SPELLS.find((spell) => spell.id === snapshot.selectedSpell);
  selectedDescription.textContent = definition?.description ?? "";
  sampleText.textContent = `目标：${snapshot.targetMaterial} · ${snapshot.targetTemperature.toFixed(1)}°C`;
  document.querySelectorAll<HTMLButtonElement>("[data-spell]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.spell === snapshot.selectedSpell));
  });
};

lab.onSnapshot(updateUi);
lab.start();

window.addEventListener("beforeunload", () => lab.stop());

declare global {
  interface Window {
    selectTokiPonaSpell?: (spell: SpellId) => void;
  }
}

window.selectTokiPonaSpell = (spell: SpellId) => lab.selectSpell(spell);
