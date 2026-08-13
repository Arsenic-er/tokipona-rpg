import {
  PROLOGUE_ARRIVAL_SCENE,
  PROLOGUE_ARRIVAL_SCENE_ID,
  PROLOGUE_ARRIVAL_STREAM_SCENES,
  PROLOGUE_STREAM_SCENE_ID,
  PrologueArrivalStreamSession,
  createPrologueArrivalStreamInitialSession,
  type ManifestedWaterSnapshot,
  type PrologueActionResult,
} from "./game/prologue-arrival-stream";
import { WORLD_TILE_SIZE_PX, type RuntimeInput, type RuntimeSnapshot, type SceneDefinition } from "./runtime";
import type { GameSessionState } from "./session/game-session";

type GlyphPhase = "undiscovered" | "discovered" | "activated";
type Tone = "neutral" | "success" | "warning" | "danger";
type ToolAction = "stone" | "log" | "soil";

interface BrowserSnapshot {
  readonly runtime: RuntimeSnapshot;
  readonly session: GameSessionState;
  readonly scene: SceneDefinition;
  readonly title: string;
  readonly glyphPhase: GlyphPhase;
  readonly route: "unresolved" | "tools" | "telo";
  readonly routeReady: boolean;
  readonly settlementEntranceReached: boolean;
  readonly shallowWater: Readonly<{
    leftPx: number;
    rightPx: number;
    surfaceYPx: number;
    playerWading: boolean;
  }>;
  readonly manifestedWater: readonly ManifestedWaterSnapshot[];
  readonly nearGlyph: boolean;
}

interface UiResult {
  readonly accepted: boolean;
  readonly message: string;
  readonly tone: Tone;
}

interface PrologueBrowserPort {
  advanceFrame(seconds: number, input: RuntimeInput): void;
  snapshot(): BrowserSnapshot;
  interact(): UiResult;
  attuneOrManifest(): UiResult;
  tool(action: ToolAction): UiResult;
  setCheckpoint(): UiResult;
  resetToCheckpoint(): UiResult;
  resetArea(): UiResult;
  toSave(): unknown;
}

const WIDTH = 180;
const HEIGHT = 320;
const WORLD_Y_OFFSET = 96;
const STORAGE_KEY = "tokipona.rpg.prologue.v0.1";
const GLYPH_POSITION = Object.freeze({ x: 144, y: 100 });
const GLYPH_RADIUS = 40;

class ArrivalStreamBrowserPort implements PrologueBrowserPort {
  private remainderTicks = 0;

  constructor(private readonly coordinator: PrologueArrivalStreamSession) {}

  static fresh(): ArrivalStreamBrowserPort {
    const session = createPrologueArrivalStreamInitialSession({
      sessionId: `browser-prologue-${globalThis.crypto.randomUUID()}`,
    });
    return new ArrivalStreamBrowserPort(new PrologueArrivalStreamSession(session));
  }

  static fromSave(candidate: unknown): ArrivalStreamBrowserPort {
    return new ArrivalStreamBrowserPort(PrologueArrivalStreamSession.fromSave(candidate));
  }

  advanceFrame(seconds: number, input: RuntimeInput): void {
    this.remainderTicks += Math.min(0.1, Math.max(0, seconds)) * 60;
    const ticks = Math.floor(this.remainderTicks);
    if (ticks === 0) return;
    this.remainderTicks -= ticks;
    this.coordinator.advanceTicks(ticks, input);
  }

  snapshot(): BrowserSnapshot {
    const snapshot = this.coordinator.snapshot();
    const scene = PROLOGUE_ARRIVAL_STREAM_SCENES.find((entry) => entry.id === snapshot.runtime.sceneId) ??
      PROLOGUE_ARRIVAL_SCENE;
    return {
      runtime: snapshot.runtime,
      session: snapshot.session,
      scene,
      title: snapshot.runtime.sceneId === PROLOGUE_ARRIVAL_SCENE_ID
        ? "N00 · 山谷抵达台"
        : "N01 · 林缘浅溪",
      glyphPhase: glyphPhase(snapshot.session),
      route: snapshot.route,
      routeReady: snapshot.routeReady,
      settlementEntranceReached: snapshot.settlementEntranceReached,
      shallowWater: snapshot.shallowWater,
      manifestedWater: snapshot.manifestedWater,
      nearGlyph: isNearGlyph(snapshot.runtime),
    };
  }

  interact(): UiResult {
    const snapshot = this.snapshot();
    if (!snapshot.nearGlyph) return ui(false, "附近没有可互动对象。", "warning");
    if (snapshot.glyphPhase === "undiscovered") {
      return translate(
        this.coordinator.discoverTelo("browser.n01.glyph.telo"),
        "你发现了 telo（水）；现在还不能施法。",
      );
    }
    return ui(true, snapshot.glyphPhase === "discovered" ? "telo 正等待调谐。" : "telo 已完成调谐。", "neutral");
  }

  attuneOrManifest(): UiResult {
    const snapshot = this.snapshot();
    if (snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID || snapshot.glyphPhase === "undiscovered") {
      return ui(false, "先在浅溪遗迹中发现 telo。", "warning");
    }
    if (snapshot.glyphPhase === "discovered") {
      return translate(
        this.coordinator.attuneTelo(nextId("attune-telo"), "browser.n01.glyph.telo"),
        "调谐完成；正式字形仍待审批。",
      );
    }
    return translate(
      this.coordinator.manifestTelo(nextId("manifest-telo")),
      "显化完成：水从静止开始下落，消耗 5 MP。",
    );
  }

  tool(action: ToolAction): UiResult {
    const before = this.coordinator.snapshot();
    if (before.routeReady) {
      return ui(true, "Route already ready; no duplicate event was written.", "neutral");
    }

    const result = action === "stone"
      ? this.coordinator.pushLooseStone(nextId("push-stone"))
      : action === "log"
        ? this.coordinator.placeRottenLog(nextId("place-log"))
        : this.coordinator.digSoftSoil(nextId("dig-soil"));
    if (!result.accepted) return translate(result, "");

    const after = result.snapshot;
    if (!before.routeReady && after.routeReady) {
      const message = action === "stone"
        ? "Loose stone moved: this route is independently passable."
        : action === "log"
          ? "Rotten log placed: this route is independently passable."
          : "Soft soil opened: this route is independently passable.";
      return ui(true, message, "success");
    }
    return ui(true, "Route state did not change; no duplicate event was written.", "neutral");
  }

  setCheckpoint(): UiResult {
    try {
      this.coordinator.setCheckpoint(nextId("checkpoint"), "checkpoint.prologue.browser");
      return ui(true, "检查点已记录。", "success");
    } catch (error: unknown) {
      return ui(false, errorMessage(error, "当前位置不能成为检查点。"), "danger");
    }
  }

  resetToCheckpoint(): UiResult {
    try {
      this.coordinator.resetToCheckpoint(nextId("checkpoint-reset"));
      return ui(true, "已回到检查点；持久学习和路线状态保留。", "neutral");
    } catch (error: unknown) {
      return ui(false, errorMessage(error, "检查点恢复失败。"), "danger");
    }
  }

  resetArea(): UiResult {
    this.coordinator.resetArea(nextId("area-reset"));
    return ui(true, "区域瞬时状态已重置。", "neutral");
  }

  toSave(): unknown {
    return this.coordinator.toSave();
  }
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app mount point");

app.innerHTML = `
  <div class="rpg-shell">
    <header class="rpg-header">
      <div><p class="eyebrow">PROLOGUE / PLAYABLE GREYBOX</p><h1>言语遗迹</h1></div>
      <a href="/">返回项目入口</a>
    </header>
    <section class="notice" role="note">
      telo 图案与调谐光效是程序化占位，不是获批的 sitelen pona 正式字形；字形动画层与环境背景层彼此独立。
    </section>
    <section class="hud" aria-label="游戏状态">
      <div class="hud-row"><strong data-ui="scene">--</strong><span data-ui="tick">tick --</span></div>
      <div class="meter-row">
        <span>生命 <i class="meter meter-health"><b></b></i> <em>100 / 100</em></span>
        <span>MP <i class="meter meter-mp"><b></b></i> <em data-ui="mp">--</em></span>
      </div>
      <p data-ui="objective">--</p>
    </section>
    <section class="game-frame" aria-label="竖版像素探索场景">
      <canvas id="rpg-canvas" width="${WIDTH}" height="${HEIGHT}" tabindex="0"></canvas>
      <div class="scene-shade" aria-hidden="true"></div>
      <div class="interaction-hint" data-ui="hint">继续探索</div>
    </section>
    <section class="telo-panel" data-phase="undiscovered" aria-label="telo 学习状态">
      <div class="glyph-placeholder" aria-hidden="true"><span>TELO</span></div>
      <div><p class="eyebrow">WORD RELIC / WATER TYPE</p><strong data-ui="glyph-state">尚未发现</strong>
        <small>发现 → 调谐激活 → 奠义 → 主动产出 → 稳固</small></div>
      <button type="button" data-action="telo" disabled>调谐 telo</button>
    </section>
    <p class="status" data-ui="status" data-tone="neutral" aria-live="polite">方向键或 A/D 移动，空格/W 跳跃，E 互动。</p>
    <section class="command-row command-row-tools" aria-label="Three independent non-magic routes">
      <button type="button" data-tool="stone">MOVE STONE / INDEPENDENT</button><button type="button" data-tool="log">PLACE LOG / INDEPENDENT</button>
      <button type="button" data-tool="soil">DIG SOIL / INDEPENDENT</button>
    </section>
    <section class="command-row" aria-label="游戏操作">
      <button type="button" data-action="interact">互动 [E]</button><button type="button" data-action="checkpoint">设检查点</button>
      <button type="button" data-action="reset">回检查点 [R]</button><button type="button" data-action="save">保存</button>
      <button type="button" data-action="load">读取</button><button type="button" data-action="area-reset">重置区域</button>
    </section>
    <section class="touch-controls" aria-label="触屏操作">
      <button type="button" data-hold="left" aria-label="向左移动">◀</button><button type="button" data-hold="right" aria-label="向右移动">▶</button>
      <button type="button" data-hold="jump">跳跃</button><button type="button" data-touch-interact>互动</button>
    </section>
  </div>`;

const canvas = required<HTMLCanvasElement>("#rpg-canvas");
const context = canvasContext(canvas);
const sceneLabel = required<HTMLElement>('[data-ui="scene"]');
const tickLabel = required<HTMLElement>('[data-ui="tick"]');
const mpLabel = required<HTMLElement>('[data-ui="mp"]');
const objectiveLabel = required<HTMLElement>('[data-ui="objective"]');
const hintLabel = required<HTMLElement>('[data-ui="hint"]');
const glyphPanel = required<HTMLElement>(".telo-panel");
const glyphState = required<HTMLElement>('[data-ui="glyph-state"]');
const teloButton = required<HTMLButtonElement>('[data-action="telo"]');
const statusLabel = required<HTMLElement>('[data-ui="status"]');

let port: PrologueBrowserPort = ArrivalStreamBrowserPort.fresh();
let priorTime = performance.now();
let activationStarted: number | null = null;
let jumpQueued = false;
const held = new Set<string>();
const pointerHolds = new Map<string, Set<number>>();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

bindInputs();
reducedMotion.addEventListener("change", (event) => {
  if (event.matches) activationStarted = null;
});
requestAnimationFrame(frame);

function frame(now: number): void {
  const elapsed = Math.min(0.1, Math.max(0, (now - priorTime) / 1_000));
  priorTime = now;
  try {
    port.advanceFrame(elapsed, {
      moveX: (isHeld("right") ? 1 : 0) - (isHeld("left") ? 1 : 0),
      jump: jumpQueued || isHeld("jump"),
    });
  } catch (error: unknown) {
    setStatus(errorMessage(error, "运行时推进失败。"), "danger");
  }
  jumpQueued = false;
  render(port.snapshot(), now);
  requestAnimationFrame(frame);
}

function render(snapshot: BrowserSnapshot, now: number): void {
  drawWorld(snapshot);
  sceneLabel.textContent = snapshot.title;
  tickLabel.textContent = `tick ${snapshot.runtime.tick}`;
  mpLabel.textContent = `${snapshot.session.mp.currentMp} / ${snapshot.session.mp.maxMp}`;
  objectiveLabel.textContent = objective(snapshot);
  hintLabel.textContent = snapshot.nearGlyph ? "E / 互动：观察潮湿的词语遗迹" : "继续探索";
  hintLabel.dataset.active = String(snapshot.nearGlyph);
  glyphPanel.dataset.phase = snapshot.glyphPhase;
  glyphState.textContent = phaseLabel(snapshot.glyphPhase);
  teloButton.disabled = snapshot.glyphPhase === "undiscovered" || snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID;
  teloButton.textContent = snapshot.glyphPhase === "activated" ? "显化 telo · 5 MP" : "调谐 telo";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.disabled = snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID || snapshot.routeReady;
  }
  if (reducedMotion.matches) {
    activationStarted = null;
    glyphPanel.style.setProperty("--activation", snapshot.glyphPhase === "activated" ? "1" : "0");
  } else if (activationStarted !== null) {
    const activation = Math.min(1, (now - activationStarted) / 1_200);
    glyphPanel.style.setProperty("--activation", String(activation));
    if (activation >= 1) activationStarted = null;
  } else {
    glyphPanel.style.setProperty("--activation", snapshot.glyphPhase === "activated" ? "1" : "0");
  }
}

function drawWorld(snapshot: BrowserSnapshot): void {
  const cameraX = browserCameraX(snapshot);
  context.imageSmoothingEnabled = false;
  context.fillStyle = snapshot.runtime.sceneId === PROLOGUE_ARRIVAL_SCENE_ID ? "#08090c" : "#07100e";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawCavernBackdrop(snapshot.runtime.tick);
  const firstX = Math.max(0, Math.floor(cameraX / WORLD_TILE_SIZE_PX));
  const lastX = Math.min(snapshot.scene.collisionRows[0]!.length - 1, Math.ceil((cameraX + WIDTH) / WORLD_TILE_SIZE_PX));
  for (let y = 0; y < snapshot.scene.collisionRows.length; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      if (snapshot.scene.collisionRows[y]![x] !== "#") continue;
      rockTile(x * 16 - cameraX, y * 16 + WORLD_Y_OFFSET, x, y);
    }
  }
  if (snapshot.runtime.sceneId === PROLOGUE_STREAM_SCENE_ID) {
    context.fillStyle = "#154866";
    context.fillRect(
      Math.round(snapshot.shallowWater.leftPx - cameraX),
      Math.round(snapshot.shallowWater.surfaceYPx + WORLD_Y_OFFSET),
      snapshot.shallowWater.rightPx - snapshot.shallowWater.leftPx,
      16,
    );
    drawGlyph(GLYPH_POSITION.x - cameraX, GLYPH_POSITION.y + WORLD_Y_OFFSET, snapshot.glyphPhase);
    for (const water of snapshot.manifestedWater) {
      context.fillStyle = water.settled ? "#65c7ed" : "#a4e8f9";
      context.fillRect(Math.round(water.position.x - cameraX), Math.round(water.position.y + WORLD_Y_OFFSET), 3, 3);
    }
  }
  drawPlayer(snapshot.runtime, cameraX);
}

function drawCavernBackdrop(tick: number): void {
  context.fillStyle = "#111316";
  for (let i = 0; i < 30; i += 1) {
    const x = (i * 37 + tick * 0) % WIDTH;
    const y = 25 + ((i * 71) % (HEIGHT - 50));
    context.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
  }
}

function rockTile(x: number, y: number, tileX: number, tileY: number): void {
  const colors = ["#26241f", "#2e2b24", "#363128", "#1e2020"] as const;
  context.fillStyle = colors[Math.abs(tileX * 7 + tileY * 13) % colors.length]!;
  context.fillRect(Math.floor(x), Math.floor(y), 16, 16);
  context.fillStyle = (tileX + tileY) % 3 === 0 ? "#57402a" : "#151719";
  context.fillRect(Math.floor(x + ((tileX * 5) % 11)), Math.floor(y + ((tileY * 3) % 11)), 2, 2);
}

function drawPlayer(runtime: RuntimeSnapshot, cameraX: number): void {
  const x = Math.round(runtime.player.position.x - cameraX);
  const y = Math.round(runtime.player.position.y + WORLD_Y_OFFSET);
  context.fillStyle = "#211632";
  context.fillRect(x + 2, y, 8, 3);
  context.fillStyle = "#7744a5";
  context.fillRect(x + 3, y + 3, 6, 7);
  context.fillStyle = "#9d72c3";
  context.fillRect(x + 1, y + 9, 10, 4);
  context.fillStyle = "#e8d3aa";
  context.fillRect(x + 5, y + 5, 2, 2);
}

function drawGlyph(x: number, y: number, phase: GlyphPhase): void {
  context.fillStyle = "#171c1e";
  context.fillRect(Math.round(x - 11), Math.round(y - 26), 22, 27);
  context.fillStyle = phase === "activated" ? "#9beaff" : phase === "discovered" ? "#52737b" : "#30383a";
  context.fillRect(Math.round(x - 8), Math.round(y - 22), 16, 18);
  if (phase !== "undiscovered") {
    context.fillStyle = phase === "activated" ? "#d9f9ff" : "#83979a";
    context.fillRect(Math.round(x - 2), Math.round(y - 18), 4, 10);
    context.fillRect(Math.round(x - 5), Math.round(y - 10), 10, 3);
  }
}

function bindInputs(): void {
  window.addEventListener("keydown", (event) => {
    if (event.key === " " && preservesNativeSpace(event.target)) return;
    if (event.repeat && ["e", "r"].includes(event.key.toLowerCase())) return;
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.add("left");
    else if (key === "d" || key === "arrowright") held.add("right");
    else if (key === "w" || key === "arrowup" || key === " ") jumpQueued = true;
    else if (key === "e") run(() => port.interact());
    else if (key === "r") run(() => port.resetToCheckpoint());
    else return;
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.delete("left");
    if (key === "d" || key === "arrowright") held.delete("right");
    if (key === "w" || key === "arrowup" || key === " ") held.delete("jump");
  });
  window.addEventListener("blur", () => {
    held.clear();
    pointerHolds.clear();
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const action = button.dataset.hold;
    if (!action) continue;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const pointers = pointerHolds.get(action) ?? new Set<number>();
      pointers.add(event.pointerId);
      pointerHolds.set(action, pointers);
      if (action === "jump") jumpQueued = true;
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        releasePointerHold(action, event.pointerId);
      }
    });
    const release = (event: PointerEvent): void => {
      releasePointerHold(action, event.pointerId);
      if (event.type !== "lostpointercapture" && button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }
  required<HTMLButtonElement>("[data-touch-interact]").addEventListener("click", () => run(() => port.interact()));
  required<HTMLButtonElement>('[data-action="interact"]').addEventListener("click", () => run(() => port.interact()));
  required<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener("click", () => run(() => port.setCheckpoint()));
  required<HTMLButtonElement>('[data-action="reset"]').addEventListener("click", () => run(() => port.resetToCheckpoint()));
  required<HTMLButtonElement>('[data-action="area-reset"]').addEventListener("click", () => run(() => port.resetArea()));
  teloButton.addEventListener("click", () => {
    const before = port.snapshot().glyphPhase;
    const result = port.attuneOrManifest();
    const after = port.snapshot().glyphPhase;
    if (before === "discovered" && after === "activated" && !reducedMotion.matches) {
      activationStarted = performance.now();
    }
    show(result);
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.addEventListener("click", () => run(() => port.tool(button.dataset.tool as ToolAction)));
  }
  required<HTMLButtonElement>('[data-action="save"]').addEventListener("click", save);
  required<HTMLButtonElement>('[data-action="load"]').addEventListener("click", load);
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(port.toSave()));
    setStatus("存档已写入此浏览器。", "success");
  } catch (error: unknown) {
    setStatus(errorMessage(error, "保存失败。"), "danger");
  }
}

function load(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      setStatus("No local save exists yet.", "warning");
      return;
    }
    port = ArrivalStreamBrowserPort.fromSave(JSON.parse(saved) as unknown);
    held.clear();
    pointerHolds.clear();
    activationStarted = null;
    setStatus("Save loaded.", "success");
  } catch (error: unknown) {
    setStatus(errorMessage(error, "Save data is invalid or local storage is unavailable."), "danger");
  }
}

function glyphPhase(state: GameSessionState): GlyphPhase {
  const telo = state.learning.words.telo;
  if (telo?.attunementState === "attuned") return "activated";
  return telo?.discoveryState === "discovered" ? "discovered" : "undiscovered";
}

function isNearGlyph(runtime: RuntimeSnapshot): boolean {
  if (runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID) return false;
  const centerX = runtime.player.position.x + runtime.player.body.width / 2;
  const centerY = runtime.player.position.y + runtime.player.body.height / 2;
  return Math.hypot(centerX - GLYPH_POSITION.x, centerY - GLYPH_POSITION.y) <= GLYPH_RADIUS;
}

function browserCameraX(snapshot: BrowserSnapshot): number {
  const worldWidth = snapshot.scene.collisionRows[0]!.length * WORLD_TILE_SIZE_PX;
  const center = snapshot.runtime.player.position.x + snapshot.runtime.player.body.width / 2;
  return Math.min(Math.max(0, center - WIDTH / 2), Math.max(0, worldWidth - WIDTH));
}

function objective(snapshot: BrowserSnapshot): string {
  if (snapshot.settlementEntranceReached) return "Settlement entrance reached; N00 -> N01 complete.";
  if (snapshot.runtime.sceneId === PROLOGUE_ARRIVAL_SCENE_ID) return "Travel right across the arrival shelf into the forest stream.";
  if (snapshot.routeReady) {
    const route = snapshot.route === "telo" ? "telo route" : "independent tool route";
    return `${route} is stable; travel to the settlement entrance at far right.`;
  }
  if (snapshot.glyphPhase === "undiscovered") {
    return "Find the telo glyph, or choose stone, log, or soil; each tool opens its own route.";
  }
  if (snapshot.glyphPhase === "discovered") return "Attune telo, or choose any one independent tool route.";
  return "Manifest telo into the stream, or choose any one independent tool route.";
}

function phaseLabel(phase: GlyphPhase): string {
  if (phase === "activated") return "已激活 · 尚待奠义";
  if (phase === "discovered") return "已发现 · 等待调谐";
  return "尚未发现";
}

function translate(result: PrologueActionResult, success: string): UiResult {
  return result.accepted
    ? ui(true, success, "success")
    : ui(false, `动作未生效：${result.reason}`, result.reason === "wrong_scene" ? "warning" : "danger");
}

function ui(accepted: boolean, message: string, tone: Tone): UiResult {
  return { accepted, message, tone };
}

function run(action: () => UiResult): void {
  try {
    show(action());
  } catch (error: unknown) {
    setStatus(errorMessage(error, "操作失败。"), "danger");
  }
}

function show(result: UiResult): void {
  setStatus(result.message, result.tone);
}

function setStatus(message: string, tone: Tone): void {
  statusLabel.textContent = message;
  statusLabel.dataset.tone = tone;
}

let idSequence = 0;
function nextId(kind: string): string {
  idSequence += 1;
  return `rpg.browser.${kind}.${Date.now()}.${idSequence}.${globalThis.crypto.randomUUID()}`;
}

function isHeld(action: string): boolean {
  return held.has(action) || (pointerHolds.get(action)?.size ?? 0) > 0;
}

function releasePointerHold(action: string, pointerId: number): void {
  const pointers = pointerHolds.get(action);
  if (!pointers) return;
  pointers.delete(pointerId);
  if (pointers.size === 0) pointerHolds.delete(action);
}

function preservesNativeSpace(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("button, a, input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function canvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const result = target.getContext("2d", { alpha: false });
  if (!result) throw new Error("2D canvas is unavailable");
  return result;
}
