import { hasMillValley } from './world/forest-mill-terrain';
import { returnChannelMapMaterial } from './world/forest-return-channel';
import { wetlandMapMaterial, orderNodeSolid } from './world/forest-wetland-migration';
import { allocationHabitatDepth } from './world/forest-water-allocation';
import { ForestEpisode, EPISODE_SAVE_KEY, OPENING_SAVE_KEY, EPISODE_PLACES, episodeBounds, type EpisodeResult, type EpisodeTarget } from './game/forest-episode';
import { BrowserForestOpeningPersistence } from './persistence/browser-forest-opening-persistence';
import { initializeForestCamera, advanceForestCamera, type RuntimeForestCameraContract } from './runtime/forest-camera';
import { ForestMouseCamera, bindForestMouseCamera } from './visual/forest-mouse-camera';
import { ForestTravelerGait } from './visual/forest-traveler-gait';
import type { ForestOpeningPublicView } from './visual/forest-opening-view';
import { ForestEpisodeRenderer } from './visual/forest-episode-renderer';
import { loadBrowserLocalTravelerAtlasFromDocument } from './visual/browser-local-traveler-atlas';
import { loadLocalForestBackdropFromDocument } from './visual/browser-local-forest-backdrop';
import { ForestMap } from './visual/forest-map';
import { episodeWaterSolid } from './world/forest-episode-water';
import { millTailraceMapMaterial } from './world/forest-mill-tailrace';
import { cisternEntrySolid } from './world/forest-cistern-entry';
import { episodeViewport } from './visual/forest-episode-viewport';
import { WINDOW_EXPRESSIONS, type WindowExpression } from './world/forest-cistern-window';
import type { TeloCastPlan } from './spells/cast-plan';

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
  <dialog class="ep-ending" aria-label="小章节结算"><h2>水轮与碎片 · 小节完成</h2><p data-ep="ending"></p><div class="ep-actions"><button data-ep="free-roam">继续在本地走走</button><button data-ep="ending-backup">导出存档</button><button data-ep="ending-practice">临时重玩</button></div><p>这是第一章的一个可玩小节，不是三小时完整第一章。蓄水室可经校准层、虹吸和升降机抵达顶层，放下回流道永久梯后返回工坊；旧矿道和其他位点尚未开放。</p></dialog>
  <div class="ep-controls" aria-label="触控操作"><div><button data-touch="left" aria-label="向左">◀</button><button data-touch="right" aria-label="向右">▶</button></div><div><button data-touch="interact" aria-label="互动">E</button><button data-touch="jump" aria-label="跳跃">↑</button></div></div>`;
const get = <T extends HTMLElement = HTMLElement>(name: string): T => root.querySelector<T>(`[data-ep="${name}"]`)!;
const canvas = root.querySelector('canvas')!, ctx = canvas.getContext('2d', { alpha: false })!;
const talk = root.querySelector<HTMLDialogElement>('.ep-talk')!, journal = root.querySelector<HTMLDialogElement>('.ep-journal')!;
const pause = root.querySelector<HTMLDialogElement>('.ep-pause')!, ending = root.querySelector<HTMLDialogElement>('.ep-ending')!;
const dialogs = [talk, journal, pause, ending];
let windowPreviewPlan: TeloCastPlan | null = null;
const keys = new Set<string>(), touches = new Set<string>();
let focusLost = false, ready = false, saved = true, endedThisVisit = false, lastSaveTick = game.state.tick;
let muted = false, audioContext: AudioContext | null = null, audioOutput: GainNode | null = null;
const cameraContract: RuntimeForestCameraContract = { fixedZoom: true, pixelSnap: true, movementLookAheadRatio: .18, downwardBiasRatio: .14, upwardLagRatio: .08, deadZoneNormalized: { left: .38, right: .62, top: .35, bottom: .67 } };
const cameraBounds={...episodeBounds(game.state.place)};
let camera = initializeForestCamera(cameraContract, game.player, cameraBounds), lastPlace = game.state.place;
const mouseCamera = new ForestMouseCamera(cameraBounds), gait = new ForestTravelerGait();
const blocked = () => !ready || focusLost || document.hidden || dialogs.some(d => d.open) || atlas.open;
const atlas = new ForestMap(root, { storage, suffix,
  canOpen: () => !blocked(), suspend: clearInput, resume: () => { clearInput(); canvas.focus(); },
  returnShortcut:()=>game.hasRoom('return_open'),
});
bindForestMouseCamera(canvas, mouseCamera, blocked);
function clearInput(): void { keys.clear(); touches.clear(); }
function closeDialog(d: HTMLDialogElement): void { d.close(); windowPreviewPlan=null; clearInput(); canvas.focus(); }
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
  if(result.resumeWorld){if(talk.open)closeDialog(talk);else{clearInput();canvas.focus();}return;}
  windowPreviewPlan=null;
  talk.querySelector('h2')!.textContent = result.speaker ?? '旅途见闻';
  talk.querySelector('p')!.textContent = result.text;
  const actions = talk.querySelector('.ep-actions')!; actions.replaceChildren();
  const button = (text: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; actions.append(b); return b; };
  if (result.choice === 'work') button('答应维修，换取落脚', () => choose('accept'));
  if (result.choice === 'predict') {
    button('落入槽内，沿坡往低处流', () => choose('downhill'));
    button('停在空中，不再受重力影响', () => choose('hover'));
  }
  if (result.choice==='calibrate') button('尝试两词校准',()=>choose('calibrate'));
  if(result.choice==='length-recall'){
    const label=document.createElement('label'),input=document.createElement('input');
    label.textContent='回忆尺度表达';input.setAttribute('aria-label',label.textContent);input.maxLength=32;
    input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','off');label.append(input);actions.append(label);
    for(const [prediction,text] of [['short','落入挡板前的接水杯'],['long','接触远端水舌并引水'],['power','只改变冲击威力']] as const)
      button(text,()=>choose('length:predict:'+input.value.trim()+':'+prediction));
  }
  if(result.choice==='length-cast'){
    const detail=document.createElement('p');detail.setAttribute('role','status');detail.dataset.length='preview';
    detail.textContent='预览不会扣费；确认释放后才扣 MP。';actions.append(detail);let planId:string|null=null;
    button('预览复习槽形态',()=>{
      const preview=game.previewLengthStudy();if(!preview){detail.textContent='预览不可用，请重新查看复习槽。';confirm.disabled=true;windowPreviewPlan=null;planId=null;return;}
      const p=preview.plan;planId=p.planId;windowPreviewPlan=p;
      detail.textContent='长度 '+(p.requestedLengthClass==='short'?16:64)+' px · 固定截面 12 px · 向右 · 零初速度 · 受重力 · 非攻击\n需要 '+p.activationMpRequired+' MP（当前 '+game.sessionState.mp.currentMp+'）\n'+preview.reason;
      confirm.disabled=!preview.canConfirm;
    });
    const confirm=button('确认复习槽释放',()=>{if(!planId)return;const r=game.confirmLengthStudy(planId);save();updateHud();renderResult(r,target);});confirm.disabled=true;
  }
  if(result.choice==='motion-recall'){
    const label=document.createElement('label'),input=document.createElement('input');
    label.textContent='回忆去或移动的词';input.setAttribute('aria-label',label.textContent);input.maxLength=24;
    input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','off');label.append(input);actions.append(label);
    for(const [prediction,text] of [['clockwise','沿轮缘顺时针移动'],['still','相对支架保持不动'],['counterclockwise','沿轮缘逆时针移动']] as const)
      button(text,()=>choose('motion:predict:'+input.value.trim()+':'+prediction));
  }
  if(result.choice==='water-recall'){
    const label=document.createElement('label'),input=document.createElement('input');
    label.textContent='回忆水或液体的词';input.setAttribute('aria-label',label.textContent);input.maxLength=24;
    input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','off');label.append(input);actions.append(label);
    for(const [prediction,text] of [['downhill','沿槽流向低处'],['hover','留在空中'],['uphill','自行流向高处']] as const)
      button(text,()=>choose('water:predict:'+input.value.trim()+':'+prediction));
  }
  if(result.choice==='force-recall'){
    const label=document.createElement('label'),input=document.createElement('input');
    label.textContent='回忆刚才的词';input.setAttribute('aria-label',label.textContent);input.maxLength=24;
    input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','off');
    label.append(input);actions.append(label);
    for(const [prediction,text] of [['more','预测偏移增大'],['less','预测偏移减小'],['reverse','预测方向反转']] as const)
      button(text,()=>choose('force:predict:'+input.value.trim()+':'+prediction));
  }
  for(const action of result.actions??[])button(action.label,()=>choose(action.id));
  if (result.choice==='recall' || result.choice==='window'||result.choice==='calibration'||result.choice==='siphon') {
    const label=document.createElement('label'), input=document.createElement('input');
    label.textContent=result.choice==='recall'?'回忆那个词':'输入引水表达';
    input.setAttribute('aria-label',label.textContent); input.maxLength=32;
    input.autocomplete='off'; input.spellcheck=false; input.setAttribute('autocapitalize','off');
    label.append(input); actions.append(label);
    if(result.choice==='recall') {
      button('提交回忆',()=>choose(input.value));
      input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();choose(input.value);}};
    } else {
      const detail=document.createElement('p'); detail.setAttribute('role','status'); detail.dataset.window='preview';
      detail.textContent='可对照 telo lili / telo / telo suli。语言：telo 水／液体，lili 小／少，suli 大／多。本关把修饰解释为长度，不是威力。';
      actions.append(detail);
      let expression:WindowExpression|null=null, planId:string|null=null;
      const previewButton=button('预览形态',()=>{
        const value=input.value.trim().toLowerCase().replace(/\s+/g,' ');
        expression=WINDOW_EXPRESSIONS.includes(value as WindowExpression)?value as WindowExpression:null;
        const preview=expression?(target==='siphon'?game.previewSiphon(expression):target==='calibration'?game.previewCalibration(expression):game.previewWindow(expression)):null;
        if(!preview){detail.textContent='当前只支持 telo lili、telo、telo suli；输入不会自动补词或扣 MP。';confirm.disabled=true;windowPreviewPlan=null;planId=null;return;}
        const p=preview.plan; windowPreviewPlan=p; planId=p.planId;
        detail.textContent=`${expression} · ${p.requestedLengthClass==='short'?'较短':p.requestedLengthClass==='long'?'较长':'默认（不加尺度修饰词）'}\n长度 ${p.requestedLengthClass==='short'?16:p.requestedLengthClass==='long'?'64':32} px · 固定截面 12 px · ${target==='siphon'?`向右 · 锚点 184,280 · 支撑稳定度 ${game.siphonSupported?'0.75':'0.65'}`:target==='calibration'?'向左 · 锚点 254,486':'向右 · 锚点 762,326'}\n需要 ${p.activationMpRequired} MP（当前 ${game.sessionState.mp.currentMp}）· 维持费 0 · 零初速度 · 受重力 · 非攻击\n${preview.reason}`;
        confirm.disabled=!preview.canConfirm;
      });
      const confirm=button('确认释放',()=>{if(!expression||!planId)return;const r=target==='siphon'?game.confirmSiphon(expression,planId):target==='calibration'?game.confirmCalibration(expression,planId):game.confirmWindow(expression,planId);save();updateHud();renderResult(r,target);});
      confirm.disabled=true;
      input.oninput=()=>{confirm.disabled=true;planId=null;windowPreviewPlan=null;detail.textContent='表达已改动，请重新预览；没有扣 MP。';};
      input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();previewButton.click();}};
    }
  }
  button(result.choice==='work'||result.choice==='predict'||result.choice==='recall'||result.choice==='window'||result.choice==='calibration'||result.choice==='siphon' ? '先看看周围' : '继续', () => { closeDialog(talk); maybeEnding(); });
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
  if(game.state.climb||game.ridingLift){clearInput();canvas.focus();return;}
  renderResult(result, target.id);
}
function resetCamera(): void { Object.assign(cameraBounds,episodeBounds(game.state.place)); camera = initializeForestCamera(cameraContract, game.player, cameraBounds); mouseCamera.reset(); gait.reset(); lastPlace = game.state.place; clearInput(); }
function updateMap(): void {
  const p = game.player, place = game.state.place;
  const kind = place === 'mill' ? 'mill' : 'practice';
  const controls = game.controls(kind), water = game.state[kind];
  const tailrace = new Set(game.state.tailrace?.drops ?? []);
  atlas.update(place, { x: p.position.x + 6, y: p.position.y + 7 }, game.state.tick,
    (x, y) => {
      if (place === 'cistern-entry') return cisternEntrySolid(x, y, game.has('entry_open')) ? 4 : 0;
      if(place==='cistern')return game.roomSolidAt(x,y)?4:0;
      if(place==='wetland')return wetlandMapMaterial(x,y,game.allocationMode?allocationHabitatDepth(game.allocationMode):undefined);
      if(place==='order-node')return orderNodeSolid(x,y)?4:0;
      if(place==='return-channel')return returnChannelMapMaterial(game.state.returnFlow,game.flowControls,x,y)??(y>=game.groundAt(x)?2:0);
      const lx = x - (place === 'mill' ? 500 : 620), ly = y - (place === 'mill' ? 259 : 280);
      if (place !== 'settlement' && lx >= 0 && lx < 160 && ly >= 0 && ly < 48) {
        if (episodeWaterSolid(lx, ly, controls)) return place === 'mill' ? 5 : 4;
        if (water.cells[ly * 160 + lx]) return 7;
      }
      if (place === 'mill' && hasMillValley(game.terrainProfile)) {
        const material = millTailraceMapMaterial(x, y, tailrace);
        if (material !== null) return material;
      }
      return y >= game.groundAt(x, place) ? 2 : 0;
    }, game.targets.map(t => ({ x: t.x, y: game.targetFloor(t) - 12, label: t.label })));
}
function notes(): string {
  const items = [game.has('job') ? '已接下水轮维修，约定报酬 8 枚钱和一晚床位。' : '尚未与工务人约定工作。',
    game.has('repaired') ? '木撑、清淤、引水：水轮经过连续稳定运行确认。' : '水轮尚未完成稳定运行确认。',
    game.has('medium') ? '行囊 · 受损古代媒介 / 森林位点碎片（永久剧情物，不出售、不丢弃）。' : '还没有取得古代媒介。',
    game.has('intro') ? '隐士见闻 · 旧文明抽取消耗维系世界秩序的能量；媒介并不等于力量源头。MP 与媒介损伤共同限制施法。' : '',
    game.hasRoom('entered') ? '尺度复习 · 入口回声落稳后，可选旁侧短／长复习槽。自己表达、预览并确认才付 6／10 MP；实际接水后只记录所练词语的理解，不重置原机关。组合能力不足可回隐士校准，MP 不足可坐垫恢复。' : '',
    game.hasLength('lili','completed') ? 'lili · 小／少；这套引水框架中缩短长度，不改变截面或攻击威力。已有一次 H1 场景理解。' : '',
    game.hasLength('suli','completed') ? 'suli · 大／多；这套引水框架中加长长度，须有支撑且水真正到位，不是威力加成。已有一次 H1 场景理解。' : '',
    game.has('repaired')&&!game.hasMotion('completed') ? '运动刻槽 · 工坊水轮支架旁可观察活动标记与固定支架。隐士实践复盘后可调谐并回忆预测；不自动追认维修为学习证据。' : '',
    game.hasMotion('completed') ? '运动理解 · tawa：去、移动。已用现场运动验证一次 H1 理解，顺时针只是该水轮的方向，不是词语固定含义；没有开放自由施法或增加 MP、容量、报酬。' : '',
    game.has('observed') ? '词语笔记 · telo：水／液体。石槽和水壶上重复出现；这只是初次接触，不是熟练掌握。' : '',
    game.has('practiced') ? '实践 · 先预测，花 2 MP 引来小量水，再用木楔补漏。水仍服从重力。这是受损媒介的单词练习；通过额外校准后可在地下引水窗尝试长度组合，尚未开放自由攻击。' : '',
    game.has('debrief')&&!game.hasWaterStudy('completed') ? '水槽复习 · 可回隐士右侧练习石槽，主动观察、调谐、收起注音后回忆并预测；确认才花 2 MP，水实际到盆才记录理解，不自动补记旧练习。' : '',
    game.hasWaterStudy('completed') ? '水槽理解 · 这一次回忆与显化已有 H1 情境提示下的理解证据。旧水和原练习保留；不是稳定掌握，不增加最大 MP、容量或报酬。' : '',
    game.has('debrief') ? '下一条线索 · 森林碎片与其他古代位点有关。小节结算后，可从工坊右侧进入地下，调查门框、精密引水窗与高位蓄水室。' : '',
    game.has('entry_observed') ? '检修记号 · 左侧检查、右侧绞盘。隔栅由棘爪固定，工具操作不消耗 MP。' : '',
    game.has('entry_surveyed') ? '蓄水廊门框 · 精密引水窗控制侧面检修盖。碎片没有装入或消耗，深处主门尚未开放。' : '',
    game.has('phrase') ? '两词校准 · 已在隐士处休息并回忆水的表达，按进阶规则开放两词容量；当前 MP 未自动补满，未授予词语掌握。' : '',
    game.has('window_inspected') ? '引水窗 · 三档只改长度：16 / 32 / 64 px，截面 12 px；挡板距锚点 20 px。预览阻挡不扣 MP。也可用旁通阀导入已有水。' : '',
    game.has('window_filled') ? `检修盖已开 · ${game.has('window_bypass')?'使用旁通阀，没有语言证据':'显化水实际落进接水杯；有说明的练习不计无提示掌握'}。右侧检修门通往高位蓄水室。` : '',
    game.hasRoom('entered') ? '蓄水室 · 入口检查点只轻恢复一次 MP。按 E 沿东侧检修梯到校准层；途中可按 Esc 暂停。返回再进入不会重复恢复。' : '',
    game.hasRoom('echo') ? '入口回声 · 隔离演示盆展示 telo 的默认水段，32 px × 12 px；演示不扣 MP，也不算掌握。' : '',
    game.hasRoom('valve_seen') ? (game.calibrationVersion===1?'旧式校准阀 · 保留旧档水路，单份短水段不足刻度，默认水段或现场水箱均可通水。':
      '双层校准阀 · 近端回收槽与深盘分开；短水段不会带动远端入水口，反复慢速施放也不等于同步脉冲。默认水段可接触水舌，或调整现场水箱导槽。长水段受到挡板限制，水仍须实际落入深盘才开阀。') : '',
    game.hasRoom('valve_filled') ? '西侧检修梯已通 · 接水盘达到刻度，可上行调查虹吸与停靠台；仍可沿两段梯子原路返回。' : '',
    game.hasRoom('upper_seen') ? '高位虹吸 · 远端水舌距锚点 58 px；短／默认水段落入回收沟，不是语言错误。修复任一支撑后可释放长水段，或用手动导水柄释放现场水。没有授予额外词语掌握或章节完成奖励。' : '',
    game.siphonSupported ? '支撑修复 · 长水段稳定度 0.65 → 0.75；两条支撑不叠加，不改变水的初速度、压力或伤害。' : '',
    game.hasRoom('siphon_tool') ? '工具引水 · 使用水箱原有水，没有扣 MP，也没有计作词语学习证据。' : '',
    game.hasRoom('siphon_primed') ? '虹吸已通水 · 接水槽实际达到刻度，右侧下站可启用水力升降机；也可沿原检修梯返回。' : '',
    game.hasRoom('lift_arrived') ? '顶层停靠 · 检查点已保存，不恢复 MP。升降机可双向乘坐；平台不在时先呼叫，靠站后再按 E。左侧绞盘控制回流道永久梯。' : '',
    game.hasRoom('return_open') ? '永久捷径 · 顶层中间出口通往工坊回流道，工坊可沿梯回访顶层。上层水路已可用；碎片、MP 和已有奖励不变。' : '',
    game.hasFlow('entered') ? '回流湿地 · 顶层支渠可往返。先读检修牌，再扶闸、补密封、清导管；自然水实际穿过两路渠道，关闭面板才能继续流动。' : '',
    game.hasFlow('restored') ? '持续变化 · 聚落与湿地供水已经修复，回村可见公共水口通水；材料补丁和维修结果永久保存，普通水粒离开场景时冻结。' : '',
    game.hasFlow('observed') ? '水量回看 · 已查看两路标尺。这是局部观察，不是正式回访资格；旧渠口通往湿地迁徙浅滩，出水口旁可以观察测力器。沿浅滩可前往地下秩序节点的档案前厅；旧矿道仍未开放。' : '',
    game.hasForce('observed') ? '力度注音 · wawa：强、有力、能量／力量。测力器先后施加两档同方向作用，稳态偏移不同；不是尺寸、水量或方向的改变。只有主动回忆、预测并验证后才记录场景理解，修渠和动物事件不算学习证据。' : '',
    game.hasForce('completed') ? '力度理解 · 已完成一次 H1 情境提示下的非战斗测力练习。不是无提示掌握、熟练输出或攻击解锁，没有增加 MP、容量、钱或掉落。' : '',
    game.hasMigration('archive')||game.hasForce('entered') ? '五词学习账本 · '+game.chapterWordNotes+'。只展示真实记录，不把旧台词和工具操作补写成语言掌握；既有练习权限保持。' : '',
    game.hasMigration('nest') ? '迁徙危机 · 回水浸湿了旧巢；成年动物需要带幼体去高岸。拍尾是警告。看过幼体足迹后，可用岸上牵引绳移开倒木，再退回左岸观察处让路。' : '',
    game.hasMigration('resolved') ? '和平处理 · 成年动物和幼体已实际走到右岸苇地，生命身份和位置保存。没有击杀、掉落、报酬或语言掌握奖励。地下档案入口可进入，仍能沿原检修路回村。' : '',
    game.hasMigration('archive') ? '旱季档案 · 部分居民和议事者改渠保住聚落饮水与庄稼，把缺水代价转移到湿地和下游，随后因担心追责与索赔隐瞒记录。损坏的系统不能同时满足三路需求。碎片不会消耗；同步后可在右侧比较三路配水，第一章结局尚未完成。' : '',
    game.allocationStage!=='unvisited'?'三路配水 · '+(game.allocationMode?game.allocationSummary:
      game.allocationStage==='preview'?'仅预览，可取消，不改供水。计量槽从上到下对应聚落、湿地、商路。':
      '已确认分配；留在台旁观察有限旧水通过三路计量槽，实际出水符合刻度才生效。')+' 修渠与迁徙的历史成果保留。价格数值、商队和新地图尚未接入。':'',
    game.hasMigration('archive') ? '碎片座 · '+({unvisited:'待补齐五词现场理解，再嵌入原碎片。',packed:'已取回，尚未提交同步。',seated:'已嵌入，等待手动校准。',aligning:'刻线正在对齐；关闭面板并留在底座旁观察。',ready:'刻线已稳定；等待确认，也可以取回。',synchronized:'森林位点已同步，原碎片已取回。没有能力或 MP 奖励。'}[game.shardSyncStage]) : '',
    game.hasRoom('reported') ? '工务人交接 · 已说明水路变化，不重复领取报酬。旧矿道仍需后续安全调查，当前未开放。' : '',
    game.has('finished') ? '已领取 · 8 枚钱、一晚床位。小节完成，可继续回访地上地点，或从工坊进入地下检修入口。' : ''];
  return `${game.objective}\n\n${items.filter(Boolean).join('\n\n')}`;
}
function openNotes(): void { if (blocked()) return; get('notes').textContent = notes(); showDialog(journal); }
function maybeEnding(): void {
  if (!game.has('finished') || game.allocationMode !== null || game.state.place !== 'settlement' || endedThisVisit || dialogs.some(d => d.open)) return;
  endedThisVisit = true;
  get('ending').textContent = `你让水轮重新运转，带回受损媒介与森林碎片，完成隐士的第一次安全实践，并回到聚落交付。\n\n报酬：8 枚钱与一晚床位。旅途中没有强制击杀。\n下一条线索：地下蓄水廊与尚未解锁的古代位点。\n\n${saved ? '已保存，重新打开仍保留物品、MP 和结算。' : '当前保存失败；请返回游戏重试保存或导出备份。'}`;
  showDialog(ending);
}
function updateHud(): void {
  get('place').textContent = EPISODE_PLACES[game.state.place];
  const mp = game.sessionState.mp;
  get('stats').textContent = `MP ${mp.currentMp}/${mp.maxMp}  ·  钱 ${game.sessionState.economy.coin}${game.has('medium') ? '  ·  受损媒介 / 森林碎片' : ''}`;
  const near = game.nearest();
  get('prompt').textContent = game.ridingLift?(game.state.lift?.blocked?'升降机安全停机 · 通道恢复后继续':'正在乘坐升降机 · Esc 暂停'):game.state.climb?'正在沿检修梯攀行 · Esc 暂停':near ? `E · ${near.label}` : '';
  get('prompt').hidden = !near&&!game.state.climb&&!game.ridingLift;
  canvas.dataset.lift=game.state.lift?.mode??'locked';canvas.dataset.ridingLift=String(game.ridingLift);
  canvas.dataset.liftY=String(game.state.lift?.y??352);
  canvas.dataset.playerY=game.state.player.y.toFixed(2);canvas.dataset.climbing=String(!!game.state.climb);
  canvas.dataset.place = game.state.place;
  canvas.dataset.playerX = game.state.player.x.toFixed(2);
  canvas.dataset.objective = game.objective;
  canvas.dataset.ready = String(ready);
  canvas.dataset.returnFlow = game.hasFlow('restored')?'restored':game.hasFlow('entered')?'repairing':'locked';
  canvas.dataset.migration = game.state.migration?.mode??'unvisited';
  canvas.dataset.migrationResolved = String(game.hasMigration('resolved'));
  canvas.dataset.forceStudy = game.hasForce('completed')?'completed':game.state.forceStudy?.run??'unvisited';
  canvas.dataset.waterStudy = game.waterStudyStage;
  canvas.dataset.motionStudy = game.motionStudyStage;
  canvas.dataset.lengthStudyView = game.state.lengthStudy?.view??'unvisited';
  canvas.dataset.allocation = game.allocationStage;
  canvas.dataset.allocationMode = game.allocationMode??'unassigned';
  canvas.dataset.allocationAge = String(game.state.allocation?.age??0);
  const delivered=game.allocationView?.world?.delivered;
  canvas.dataset.allocationDelivered = delivered?[delivered.settlement,delivered.wetland,delivered.road].join(','):'0,0,0';
  canvas.dataset.shardSync = game.shardSyncStage;
  canvas.dataset.shardAge = String(game.state.shardSync?.age??0);
  canvas.dataset.liliStudy = game.lengthStudyStage('lili');
  canvas.dataset.suliStudy = game.lengthStudyStage('suli');
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
      camera = advanceForestCamera(cameraContract, camera, game.player, cameraBounds);
      frame = gait.advance(game.state.tick, game.player).frame; accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  mouseCamera.advance(seconds, camera, game.player.position, matchMedia('(prefers-reduced-motion: reduce)').matches);
  const composed = mouseCamera.compose(camera, game.player.position);
  // Expand the visible native-pixel viewport to the window aspect ratio; don't stretch/crop a tiny portrait viewport.
  const aspect = innerWidth / Math.max(1, innerHeight);
  const renderCamera=episodeViewport(composed,game.player.position,cameraBounds,aspect);
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
  renderer.draw(ctx, game, renderCamera, view, windowPreviewPlan);
  canvas.dataset.cameraX=String(renderCamera.x);canvas.dataset.cameraY=String(renderCamera.y);
  canvas.dataset.cameraWidth=String(renderCamera.width);canvas.dataset.cameraHeight=String(renderCamera.height);
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
