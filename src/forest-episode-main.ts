import { ForestEpisode, EPISODE_SAVE_KEY, OPENING_SAVE_KEY, EPISODE_PLACES, EPISODE_BOUNDS, type EpisodeResult, type EpisodeTarget } from './game/forest-episode';
import { BrowserForestOpeningPersistence } from './persistence/browser-forest-opening-persistence';
import { initializeForestCamera, advanceForestCamera, type RuntimeForestCameraContract } from './runtime/forest-camera';
import { ForestMouseCamera, bindForestMouseCamera } from './visual/forest-mouse-camera';
import { ForestTravelerGait } from './visual/forest-traveler-gait';
import type { ForestOpeningPublicView } from './visual/forest-opening-view';
import { ForestEpisodeRenderer } from './visual/forest-episode-renderer';
import { loadBrowserLocalTravelerAtlasFromDocument } from './visual/browser-local-traveler-atlas';
import { loadLocalForestBackdropFromDocument } from './visual/browser-local-forest-backdrop';
import { ForestMap } from './visual/forest-map';
import { EPISODE_TARGETS } from './game/forest-episode';
import { episodeWaterSolid } from './world/forest-episode-water';

const params = new URLSearchParams(location.search), rawSlot = params.get('practice');
const practice = rawSlot !== null && /^[0-9a-f]{32}$/.test(rawSlot);
const suffix = practice ? `.practice.${rawSlot}` : '';
const key = EPISODE_SAVE_KEY + suffix;
const root = document.querySelector<HTMLElement>('#forest-opening-app')!;
root.className = 'episode';
let storage: Storage;
let game: ForestEpisode;
try {
  storage = practice ? sessionStorage : localStorage;
  const saved = storage.getItem(key);
  if (saved !== null) game = ForestEpisode.restore(JSON.parse(saved));
  else {
    const p = new BrowserForestOpeningPersistence(storage, OPENING_SAVE_KEY + suffix), opening = p.load();
    if (!opening.ok) throw new Error(opening.reason === 'missing' ? '还没有抵达聚落的开场进度。请先走完溪路。' : '开场存档无法验证；没有覆盖原数据。');
    game = ForestEpisode.begin(p.restore(opening.save));
    storage.setItem(key, JSON.stringify(game.toSave()));
  }
} catch (error) {
  root.innerHTML = '<section class="ep-recovery"><h1>这段旅程暂时无法载入</h1><p></p><p>没有覆盖或清空任何存档。可以导出原始数据，或另开临时旅程。</p><div class="ep-actions"><button data-recovery="backup">导出原存档</button><button data-recovery="retry">重试载入</button><button data-recovery="practice">另开临时旅程</button></div></section>';
  root.querySelector('p')!.textContent = String(error);
  root.querySelector<HTMLButtonElement>('[data-recovery="backup"]')!.onclick = () => {
    try { download({ episode: (practice ? sessionStorage : localStorage).getItem(key), opening: (practice ? sessionStorage : localStorage).getItem(OPENING_SAVE_KEY + suffix) }); }
    catch { root.querySelector('p')!.textContent = '浏览器禁止访问存储，无法读取备份；原存档没有改动。'; }
  };
  root.querySelector<HTMLButtonElement>('[data-recovery="retry"]')!.onclick = () => location.reload();
  root.querySelector<HTMLButtonElement>('[data-recovery="practice"]')!.onclick = newPractice;
  throw error;
}

root.innerHTML = `<canvas width="640" height="360" tabindex="0" data-surface="game" aria-label="水轮与碎片游戏画面"></canvas>
  <header><section><small>第一章 · 水往何处 / ${practice ? '临时旅程' : '水轮与碎片'}</small><h1 data-ep="place"></h1><p data-ep="stats"></p></section>
    <nav><button data-ep="journal">任务日志 J</button><button data-ep="mute" aria-pressed="false">声音 开</button><button data-ep="pause">暂停 Esc</button></nav></header>
  <output class="ep-prompt" data-ep="prompt"></output><output class="ep-status" data-ep="save"></output>
  <dialog class="ep-talk" aria-label="人物对话"><h2></h2><p></p><div class="ep-actions"></div></dialog>
  <dialog class="ep-journal" aria-label="章节笔记"><h2>水轮与碎片 · 任务日志</h2><p data-ep="notes"></p><div class="ep-actions"><button data-ep="close-notes">回到旅途</button><button data-ep="backup">导出存档</button></div></dialog>
  <dialog class="ep-pause" aria-label="暂停"><h2>暂停</h2><p>A/D 或方向键移动，按住从走加速到跑；空格/W 跳跃。E 与身边的人或物互动。滚轮缩放，鼠标轻微带动视野，0 恢复镜头。J 看笔记。对话和离开窗口时暂停。</p><p>每个重要步骤与场景切换自动保存。临时旅程不改主进度。</p><div class="ep-actions"><button data-ep="resume">继续游戏</button><button data-ep="retry-save">重试保存</button><button data-ep="new-practice">临时重玩</button></div></dialog>
  <dialog class="ep-ending" aria-label="小章节结算"><h2>水轮与碎片 · 小节完成</h2><p data-ep="ending"></p><div class="ep-actions"><button data-ep="free-roam">继续在本地走走</button><button data-ep="ending-backup">导出存档</button><button data-ep="ending-practice">临时重玩</button></div><p>这是第一章的一个可玩小节，不是三小时完整第一章。地下蓄水廊和其他位点尚未开放。</p></dialog>
  <div class="ep-controls" aria-label="触控操作"><div><button data-touch="left" aria-label="向左">◀</button><button data-touch="right" aria-label="向右">▶</button></div><div><button data-touch="interact" aria-label="互动">E</button><button data-touch="jump" aria-label="跳跃">↑</button></div></div>`;
const get = <T extends HTMLElement = HTMLElement>(name: string): T => root.querySelector<T>(`[data-ep="${name}"]`)!;
const canvas = root.querySelector('canvas')!, ctx = canvas.getContext('2d', { alpha: false })!;
const talk = root.querySelector<HTMLDialogElement>('.ep-talk')!, journal = root.querySelector<HTMLDialogElement>('.ep-journal')!;
const pause = root.querySelector<HTMLDialogElement>('.ep-pause')!, ending = root.querySelector<HTMLDialogElement>('.ep-ending')!;
const dialogs = [talk, journal, pause, ending];
const keys = new Set<string>(), touches = new Set<string>();
let focusLost = false, ready = false, saved = true, endedThisVisit = false, lastSaveTick = game.state.tick;
let muted = false, audioContext: AudioContext | null = null, audioOutput: GainNode | null = null;
const cameraContract: RuntimeForestCameraContract = { fixedZoom: true, pixelSnap: true, movementLookAheadRatio: .18, downwardBiasRatio: .14, upwardLagRatio: .08, deadZoneNormalized: { left: .38, right: .62, top: .35, bottom: .67 } };
let camera = initializeForestCamera(cameraContract, game.player, EPISODE_BOUNDS), lastPlace = game.state.place;
const mouseCamera = new ForestMouseCamera(EPISODE_BOUNDS), gait = new ForestTravelerGait();
const blocked = () => !ready || focusLost || document.hidden || dialogs.some(d => d.open) || atlas.open;
const atlas = new ForestMap(root, { storage, suffix,
  canOpen: () => !blocked(), suspend: clearInput, resume: () => { clearInput(); canvas.focus(); },
});
bindForestMouseCamera(canvas, mouseCamera, blocked);
function clearInput(): void { keys.clear(); touches.clear(); }
function closeDialog(d: HTMLDialogElement): void { d.close(); clearInput(); canvas.focus(); }
function showDialog(d: HTMLDialogElement): void { clearInput(); d.showModal(); d.querySelector('button')?.focus(); }
function sound(): void {
  if (muted) return;
  try {
    audioContext ??= new AudioContext();
    if (!audioOutput) { audioOutput = audioContext.createGain(); audioOutput.gain.value = .018; audioOutput.connect(audioContext.destination); }
    void audioContext.resume().catch(() => {});
    const t = audioContext.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audioContext.createOscillator(), gain = audioContext.createGain();
      o.type = 'triangle'; o.frequency.value = 180 + i % 2 * 38;
      gain.gain.setValueAtTime(0, t + i * .09); gain.gain.linearRampToValueAtTime(1, t + i * .09 + .012); gain.gain.linearRampToValueAtTime(0, t + i * .09 + .062);
      o.connect(gain); gain.connect(audioOutput); o.start(t + i * .09); o.stop(t + i * .09 + .07); o.onended = () => { o.disconnect(); gain.disconnect(); };
    }
  } catch { /* Silent devices must not block play. */ }
}
function save(): void {
  atlas.save();
  try { storage.setItem(key, JSON.stringify(game.toSave())); saved = true; }
  catch { saved = false; }
  lastSaveTick = game.state.tick;
  get('save').textContent = saved ? `${practice ? '临时进度' : '本机进度'}已保存 · ${game.has('finished') ? '小节完成' : '关闭后可继续'}` : '保存失败：先别关闭！Esc 重试保存，或 J 导出备份。';
  get('save').classList.toggle('ep-error', !saved);
}
function renderResult(result: EpisodeResult, target: EpisodeTarget): void {
  talk.querySelector('h2')!.textContent = result.speaker ?? '旅途见闻';
  talk.querySelector('p')!.textContent = result.text;
  const actions = talk.querySelector('.ep-actions')!; actions.replaceChildren();
  const button = (text: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; actions.append(b); };
  if (result.choice === 'work') button('答应维修，换取落脚', () => choose('accept'));
  if (result.choice === 'predict') {
    button('落入槽内，沿坡往低处流', () => choose('downhill'));
    button('停在空中，不再受重力影响', () => choose('hover'));
  }
  button(result.choice ? '先看看周围' : '继续', () => { closeDialog(talk); maybeEnding(); });
  if (!talk.open) showDialog(talk);
  else actions.querySelector('button')?.focus();
  sound();
  function choose(choice: string): void { const next = game.interact(target, choice); save(); renderResult(next, target); updateHud(); }
}
function interact(): void {
  if (blocked()) return;
  const target = game.nearest(); if (!target) return;
  const oldPlace = game.state.place;
  const result = game.interact(target.id); updateMap(); save(); updateHud();
  if (oldPlace !== game.state.place) { resetCamera(); canvas.focus(); return; }
  renderResult(result, target.id);
}
function resetCamera(): void { camera = initializeForestCamera(cameraContract, game.player, EPISODE_BOUNDS); mouseCamera.reset(); gait.reset(); lastPlace = game.state.place; clearInput(); }
function updateMap(): void {
  const p = game.player, place = game.state.place;
  const kind = place === 'mill' ? 'mill' : 'practice';
  const controls = game.controls(kind), water = game.state[kind];
  atlas.update(place, { x: p.position.x + 6, y: p.position.y + 7 }, game.state.tick,
    (x, y) => {
      const lx = x - (place === 'mill' ? 500 : 620), ly = y - (place === 'mill' ? 259 : 280);
      if (place !== 'settlement' && lx >= 0 && lx < 160 && ly >= 0 && ly < 48) {
        if (episodeWaterSolid(lx, ly, controls)) return place === 'mill' ? 5 : 4;
        if (water.cells[ly * 160 + lx]) return 7;
      }
      return y >= game.groundAt(x, place) ? 2 : 0;
    }, EPISODE_TARGETS[place].map(t => ({ x: t.x, y: game.groundAt(t.x, place) - 12, label: t.label })));
}
function notes(): string {
  const items = [game.has('job') ? '已接下水轮维修，约定报酬 8 枚钱和一晚床位。' : '尚未与工务人约定工作。',
    game.has('repaired') ? '木撑、清淤、引水：水轮经过连续稳定运行确认。' : '水轮尚未完成稳定运行确认。',
    game.has('medium') ? '行囊 · 受损古代媒介 / 森林位点碎片（永久剧情物，不出售、不丢弃）。' : '还没有取得古代媒介。',
    game.has('intro') ? '隐士见闻 · 旧文明抽取消耗维系世界秩序的能量；媒介并不等于力量源头。MP 与媒介损伤共同限制施法。' : '',
    game.has('observed') ? '词语笔记 · telo：水／液体。石槽和水壶上重复出现；这只是初次接触，不是熟练掌握。' : '',
    game.has('practiced') ? '实践 · 先预测，花 2 MP 引来小量水，再用木楔补漏。水仍服从重力。当前仅开放隐士监督下的单词练习，未解锁自由组合或攻击。' : '',
    game.has('debrief') ? '下一条线索 · 森林碎片与其他古代位点有关，地下蓄水廊是后续调查方向（尚未开放）。' : '',
    game.has('finished') ? '已领取 · 8 枚钱、一晚床位。小节完成，可继续回访这三个地点。' : ''];
  return `${game.objective}\n\n${items.filter(Boolean).join('\n\n')}`;
}
function openNotes(): void { if (blocked()) return; get('notes').textContent = notes(); showDialog(journal); }
function maybeEnding(): void {
  if (!game.has('finished') || endedThisVisit || dialogs.some(d => d.open)) return;
  endedThisVisit = true;
  get('ending').textContent = `你让水轮重新运转，带回受损媒介与森林碎片，完成隐士的第一次安全实践，并回到聚落交付。\n\n报酬：8 枚钱与一晚床位。旅途中没有强制击杀。\n下一条线索：地下蓄水廊与尚未解锁的古代位点。\n\n${saved ? '已保存，重新打开仍保留物品、MP 和结算。' : '当前保存失败；请返回游戏重试保存或导出备份。'}`;
  showDialog(ending);
}
function updateHud(): void {
  get('place').textContent = EPISODE_PLACES[game.state.place];
  const mp = game.sessionState.mp;
  get('stats').textContent = `MP ${mp.currentMp}/${mp.maxMp}  ·  钱 ${game.sessionState.economy.coin}${game.has('medium') ? '  ·  受损媒介 / 森林碎片' : ''}`;
  const near = game.nearest();
  get('prompt').textContent = near ? `E · ${near.label}` : '';
  get('prompt').hidden = !near;
  canvas.dataset.place = game.state.place;
  canvas.dataset.playerX = game.state.player.x.toFixed(2);
  canvas.dataset.objective = game.objective;
  canvas.dataset.ready = String(ready);
  // Read-only projections for accessibility and tests; no command/debug mutation interface.
  canvas.dataset.completed = String(game.has('finished'));
}
get('journal').onclick = openNotes;
get('pause').onclick = () => { if (!blocked()) showDialog(pause); };
get('resume').onclick = () => closeDialog(pause);
get('close-notes').onclick = () => closeDialog(journal);
get('free-roam').onclick = () => closeDialog(ending);
get('retry-save').onclick = save;
get('new-practice').onclick = newPractice; get('ending-practice').onclick = newPractice;
const labLink = document.createElement('a');
labLink.href = `magic-lab.html${practice ? `?practice=${rawSlot}` : ''}`;
labLink.textContent = '独立魔法实验室（不改主进度）';
pause.querySelector('.ep-actions')!.append(labLink);
if (practice) {
  const link = document.createElement('a'); link.href = 'chapter-one.html'; link.textContent = '返回主进度';
  pause.querySelector('.ep-actions')!.append(link);
}
get('backup').onclick = () => download(game.toSave()); get('ending-backup').onclick = () => download(game.toSave());
get('mute').onclick = () => { muted = !muted; if (audioOutput) audioOutput.gain.value = muted ? 0 : .018; get('mute').textContent = muted ? '声音 关' : '声音 开'; get('mute').setAttribute('aria-pressed', String(muted)); };
for (const d of dialogs) d.addEventListener('cancel', event => { event.preventDefault(); closeDialog(d); maybeEnding(); });
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const k = event.key.toLowerCase();
  if (atlas.key(event)) return;
  if (k === 'escape' && !dialogs.some(d => d.open)) { event.preventDefault(); if (!blocked()) showDialog(pause); return; }
  if (blocked()) return;
  if (k === 'j' && !event.repeat) { event.preventDefault(); openNotes(); return; }
  if (k === 'e' && !event.repeat) { event.preventDefault(); interact(); return; }
  if (['a', 'd', 'w', ' ', 'arrowleft', 'arrowright', 'arrowup'].includes(k)) { event.preventDefault(); keys.add(k); }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { focusLost = true; clearInput(); save(); });
window.addEventListener('focus', () => { focusLost = false; clearInput(); });
document.addEventListener('visibilitychange', () => { clearInput(); if (document.hidden) save(); });
window.addEventListener('pagehide', save);
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-touch]')) {
  const key = button.dataset.touch!;
  button.addEventListener('pointerdown', e => { e.preventDefault(); if (blocked()) return; button.setPointerCapture(e.pointerId); if (key === 'interact') interact(); else touches.add(key); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => touches.delete(key));
}

const [traveler, backdrop] = await Promise.all([loadBrowserLocalTravelerAtlasFromDocument(), loadLocalForestBackdropFromDocument()]);
const renderer = new ForestEpisodeRenderer(traveler.status === 'ready' ? traveler.atlas : null, backdrop);
canvas.dataset.traveler = traveler.status === 'ready' ? traveler.atlas.version : 'public-candidate';
ready = true; updateHud(); save(); canvas.focus();
let last = performance.now(), accumulator = 0, frame = 0, hudTick = -1, storyRevision = game.sessionState.revision;
function draw(now: number): void {
  const seconds = Math.min(.1, (now - last) / 1000); last = now;
  if (!blocked()) {
    accumulator += seconds;
    while (accumulator >= 1 / 60) {
      const left = keys.has('a') || keys.has('arrowleft') || touches.has('left'), right = keys.has('d') || keys.has('arrowright') || touches.has('right');
      game.advance({ moveX: Number(right) - Number(left), jump: keys.has('w') || keys.has(' ') || keys.has('arrowup') || touches.has('jump') });
      if (lastPlace !== game.state.place) resetCamera();
      camera = advanceForestCamera(cameraContract, camera, game.player, EPISODE_BOUNDS);
      frame = gait.advance(game.state.tick, game.player).frame; accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  mouseCamera.advance(seconds, camera, game.player.position, matchMedia('(prefers-reduced-motion: reduce)').matches);
  const composed = mouseCamera.compose(camera, game.player.position);
  // Expand the visible native-pixel viewport to the window aspect ratio; don't stretch/crop a tiny portrait viewport.
  const aspect = innerWidth / Math.max(1, innerHeight);
  const width = Math.min(1024, Math.round(composed.height * aspect));
  const height = Math.round(width / aspect);
  const anchor = Math.max(.2, Math.min(.8, (game.player.position.x + 6 - composed.x) / composed.width));
  const renderCamera = { ...composed, width, height,
    x: Math.round(Math.max(0, Math.min(1024 - width, game.player.position.x + 6 - anchor * width))),
    y: Math.round(Math.max(0, Math.min(480 - height, composed.y + (composed.height - height) / 2))) };
  if (canvas.width !== renderCamera.width || canvas.height !== renderCamera.height) { canvas.width = renderCamera.width; canvas.height = renderCamera.height; }
  const p = game.player, velocity = Math.abs(p.velocity.x);
  updateMap();
  const view: ForestOpeningPublicView = {
    mode: 'forest_opening', tick: game.state.tick, worldMinute: 0,
    presentation: { kind: 'procedural_candidate', approvedAssetPackId: null }, camera: renderCamera,
    traveler: { position: p.position, facing: camera.facing === 'left' ? -1 : 1, animationId: !p.grounded ? p.velocity.y < 0 ? 'jump' : 'fall' : velocity > 74 ? 'run' : velocity > .1 ? 'walk' : 'idle', frame, visualHeightPx: 19, glow: false },
    environment: [], creatures: [], dialogue: null,
    obstacle: { solutionId: null, interactionId: null, interactionPrompt: null, visuallyComplete: false, glyph: { wordId: 'word.telo', observed: false, meaningKnown: false, pronunciationKnown: false } },
    hud: { health: 100, maxHealth: 100, mp: game.sessionState.mp.currentMp, maxMp: game.sessionState.mp.maxMp, objective: game.objective },
  };
  renderer.draw(ctx, game, renderCamera, view);
  if (game.state.tick !== hudTick) { updateHud(); hudTick = game.state.tick; }
  if (game.sessionState.revision !== storyRevision || game.state.tick - lastSaveTick >= 300) { save(); storyRevision = game.sessionState.revision; }
  requestAnimationFrame(draw);
}
draw(performance.now());
maybeEnding();

function download(value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'tokipona-waterwheel-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function newPractice(): void {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  location.assign(`chapter-one.html?practice=${nonce}`);
}
