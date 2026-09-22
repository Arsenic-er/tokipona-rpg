import { MagicLab, LAB_WIDTH, LAB_HEIGHT, type LabPoint, type LabPreview } from './game/magic-lab';
import { LAB_PRESETS, LAB_WORDS, parseLabExpression } from './spells/lab-expression';
import { MagicLabRenderer } from './visual/magic-lab-renderer';
import { loadBrowserLocalTravelerAtlasFromDocument } from './visual/browser-local-traveler-atlas';
import { MATERIALS } from './sim/materials';

const root = document.querySelector<HTMLElement>('#magic-lab')!;
root.innerHTML = `<header><div><small>独立沙盒 / 不写入主游戏</small><h1>魔法实验室</h1></div><nav><button data-lab="pause">暂停模拟</button><a data-lab="return" href="chapter-one.html">返回主游戏</a></nav></header>
  <section class="lab-workspace"><div class="lab-stage"><canvas width="768" height="384" tabindex="0" data-surface="lab" aria-label="魔法实验场：左侧可破坏材料，右侧不可破坏结构"></canvas><output class="lab-readout" data-lab="sample"></output><div class="lab-touch"><button data-move="left" aria-label="向左">◀</button><button data-move="right" aria-label="向右">▶</button><button data-move="jump" aria-label="跳跃">↑</button><button data-lab="touch-cast">向瞄准点施法</button></div></div>
  <aside><h2>咒语工作台</h2><label for="lab-expression">组合表达</label><input id="lab-expression" value="telo" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="lab-words"></div>
    <label for="lab-preset">载入示例</label><select id="lab-preset"><option value="">选择一种组合…</option></select>
    <p data-lab="description"></p><p class="lab-cost" data-lab="cost"></p><label class="lab-check"><input type="checkbox" data-lab="infinite" checked>无限练习 MP</label>
    <div class="lab-actions"><button data-lab="refill">补满 MP</button><button data-lab="safe">回到安全台</button><button data-lab="reset">重置实验场</button></div>
    <output data-lab="result" role="status">选择组合，把鼠标移到场内预览；点击施法。</output>
    <details><summary>实验范围与操作</summary><p>鼠标瞄准，左键单次施法；A/D 移动，空格跳跃。触屏先点场地瞄准，再点施法。输入框内的按键不会移动人物。</p><p>金属蓝边结构不可破坏。土岩、木料可受冲击或燃烧破坏；水、沙受重力影响。气流、热冷、水和冲击可覆盖自己；被沙土困住时可用有力水流向出口连续冲击。只禁止直接在身体内生成沙石实体，显化仍不替换已有材料。此实验室尚无玩家受伤结算，不代表正式游戏自施法免伤。</p><p>支持词与示例为本作有限实验解释，不代表所有道本语组合已实现。新组合标为实验；不会解锁主线法术、增加学习记录、改变钱包或主线 MP。此场地不保存，离开或重置后恢复。</p></details>
  </aside></section><footer><span>左键施法 · A/D 移动 · 空格跳跃</span><span data-lab="stats"></span></footer>
  <dialog aria-label="重置实验场"><h2>重置这次实验？</h2><p>仅清除实验地形与法术，补满练习 MP；主游戏存档不变。</p><button data-lab="cancel-reset">取消</button><button data-lab="confirm-reset">重置实验</button></dialog>`;
const get = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-lab="${name}"]`)!;
const canvas = root.querySelector('canvas')!, ctx = canvas.getContext('2d', { alpha: false })!;
const input = root.querySelector<HTMLInputElement>('#lab-expression')!, presets = root.querySelector<HTMLSelectElement>('#lab-preset')!;
const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
const stage = root.querySelector<HTMLElement>('.lab-stage')!;
new ResizeObserver(() => {
  const rect = stage.getBoundingClientRect(), width = Math.min(rect.width, rect.height * 2);
  canvas.style.width = `${width}px`; canvas.style.height = `${width / 2}px`;
}).observe(stage);
const slot = new URLSearchParams(location.search).get('practice');
get<HTMLAnchorElement>('return').href = `chapter-one.html${slot && /^[0-9a-f]{32}$/.test(slot) ? `?practice=${slot}` : ''}`;
for (const [expression, label] of LAB_PRESETS) { const option = document.createElement('option'); option.value = expression; option.textContent = `${expression} · ${label}`; presets.append(option); }
for (const word of LAB_WORDS) {
  const b = document.createElement('button'); b.textContent = word; b.ariaLabel = `加入 ${word}`;
  b.onclick = () => { input.value = `${input.value.trim()} ${word}`.trim(); changed(); }; root.querySelector('.lab-words')!.append(b);
}
const lab = new MagicLab(), keys = new Set<string>();
let target: LabPoint = { x: 320, y: 230 }, preview: LabPreview | null = null, aiming = false, paused = false, focusLost = false;
let renderer: MagicLabRenderer | null = null;
const stopped = () => paused || dialog.open || document.hidden || focusLost;
function changed(): void {
  const result = parseLabExpression(input.value);
  get('description').textContent = result.ok ? `${result.plan.experimental ? '实验组合 · ' : ''}${result.plan.description}` : result.reason;
  get('description').classList.toggle('invalid', !result.ok); update();
}
function update(): void {
  preview = lab.preview(input.value, target);
  const plan = preview.plan;
  get('cost').textContent = `练习 MP ${lab.infiniteMp ? '∞' : `${lab.mp}/100`} · 本次 ${plan?.cost ?? '—'} MP`;
  const material = MATERIALS[lab.pointMaterial(target)].nameZh;
  get('sample').textContent = `${lab.isLocked(target) ? '锁定结构' : material} · ${(lab.grid.getTemperature(Math.floor(target.x / 2), Math.floor(target.y / 2)) / 10).toFixed(0)} °C${aiming && !preview.ok ? ` · ${preview.reason}` : ''}`;
  get('stats').textContent = `已施法 ${lab.casts} 次 · 冲击破坏 ${lab.destroyed} 格`;
  canvas.dataset.casts = String(lab.casts); canvas.dataset.destroyed = String(lab.destroyed); canvas.dataset.playerX = lab.player.x.toFixed(2);
  canvas.dataset.ready = String(!!renderer); canvas.dataset.tick = String(lab.tick);
}
function cast(): void {
  if (stopped() || !renderer) return;
  const result = lab.cast(input.value, target); get('result').textContent = result.ok ? `已施放 ${result.plan!.text}。${lab.infiniteMp ? '使用独立无限练习 MP。' : `扣除 ${result.plan!.cost} MP。`}` : result.reason;
  get('result').classList.toggle('invalid', !result.ok); update();
}
input.addEventListener('input', changed); input.addEventListener('focus', () => keys.clear());
presets.onchange = () => { if (presets.value) { input.value = presets.value; changed(); } };
get<HTMLInputElement>('infinite').onchange = () => { lab.infiniteMp = get<HTMLInputElement>('infinite').checked; update(); };
get('refill').onclick = () => { lab.mp = 100; update(); };
get('safe').onclick = () => { lab.returnToSafety(); keys.clear(); get('result').textContent = '已回到安全台；实验地形仍保留。'; update(); };
get('pause').onclick = () => { paused = !paused; keys.clear(); get('pause').textContent = paused ? '继续模拟' : '暂停模拟'; };
get('reset').onclick = () => { keys.clear(); dialog.showModal(); get('cancel-reset').focus(); };
get('cancel-reset').onclick = () => { dialog.close(); keys.clear(); };
get('confirm-reset').onclick = () => { lab.reset(); dialog.close(); keys.clear(); get('result').textContent = '实验已重置。主游戏进度未改动。'; update(); };
dialog.addEventListener('close', () => keys.clear());
get('touch-cast').onclick = cast;
canvas.addEventListener('pointermove', event => { aim(event); });
canvas.addEventListener('pointerleave', () => { aiming = false; });
canvas.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); canvas.focus(); aim(event); if (event.pointerType === 'mouse') cast(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
function aim(event: PointerEvent): void {
  const r = canvas.getBoundingClientRect(); target = { x: (event.clientX - r.left) / r.width * LAB_WIDTH, y: (event.clientY - r.top) / r.height * LAB_HEIGHT };
  aiming = true; update();
}
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement || dialog.open) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' && !event.repeat) { get('pause').click(); return; }
  if (stopped()) return;
  if (['a', 'd', ' ', 'w', 'arrowleft', 'arrowright', 'arrowup'].includes(key)) { event.preventDefault(); keys.add(key); }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { focusLost = true; keys.clear(); }); window.addEventListener('focus', () => { focusLost = false; keys.clear(); });
document.addEventListener('visibilitychange', () => keys.clear());
for (const b of root.querySelectorAll<HTMLButtonElement>('[data-move]')) {
  const key = b.dataset.move === 'left' ? 'a' : b.dataset.move === 'right' ? 'd' : ' ';
  b.onpointerdown = e => { e.preventDefault(); if (stopped()) return; b.setPointerCapture(e.pointerId); keys.add(key); };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => keys.delete(key));
}
changed();
const art = await loadBrowserLocalTravelerAtlasFromDocument(); renderer = new MagicLabRenderer(art.status === 'ready' ? art.atlas : null);
canvas.dataset.traveler = art.status === 'ready' ? art.atlas.version : 'public-candidate';
let last = performance.now(), accumulator = 0, drawCount = 0;
function frame(now: number): void {
  const elapsed = Math.min(.08, (now - last) / 1000); last = now;
  if (!stopped()) {
    accumulator += elapsed;
    while (accumulator >= 1 / 60) {
      lab.advance({ moveX: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')), jump: keys.has(' ') || keys.has('w') || keys.has('arrowup') });
      accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  if (++drawCount % 6 === 0) update();
  renderer!.draw(ctx, lab, aiming ? preview : null); requestAnimationFrame(frame);
}
update(); frame(last);
