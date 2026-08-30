import { runtimeForestOpeningAssetExport } from "./assets/runtime-forest-opening-assets";
import { BrowserForestOpeningAudio, mixForestOpeningAudioFrame } from "./audio/browser-forest-opening-audio";
import { PrologueForestOpeningSession } from "./game/prologue-forest-opening";
import {
  BrowserForestOpeningPersistence,
  type ForestOpeningLoadResult,
} from "./persistence/browser-forest-opening-persistence";
import type { ForestOpeningInteraction } from "./world/forest-opening-obstacle";
import {
  createForestOpeningPageMarkup,
  fitForestOpeningPresentation,
  projectForestOpeningView,
  renderForestOpeningView,
  type ForestOpeningPublicView,
  type ForestOpeningWorldObjectView,
} from "./visual/forest-opening-view";

const SAVE_KEY = "tokipona.forest-opening.vertical-slice.v0.1";
const SESSION_ID = "browser.forest-opening.player";
const SEED = "forest.chapter-one.opening";
const persistence = new BrowserForestOpeningPersistence(localStorage, SAVE_KEY);
const loaded = persistence.load();
let session = loaded.ok
  ? persistence.restore(loaded.save)
  : PrologueForestOpeningSession.fresh({ sessionId: SESSION_ID, seed: SEED, currentMp: 12, maxMp: 24 });
let blockedLoad: ForestOpeningLoadResult | null = !loaded.ok && loaded.reason !== "missing" ? loaded : null;
let view = projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
const app = requiredDocumentElement<HTMLElement>("#forest-opening-app");
app.innerHTML = createForestOpeningPageMarkup(view);

const root = requiredElement<HTMLElement>(".forest-opening");
const canvas = requiredElement<HTMLCanvasElement>('canvas[data-surface="game"]');
const context = requiredCanvasContext(canvas);
const health = requiredElement<HTMLOutputElement>('[data-hud="health"]');
const mp = requiredElement<HTMLOutputElement>('[data-hud="mp"]');
const objective = requiredElement<HTMLElement>('[data-hud="objective"]');
const prompt = requiredElement<HTMLOutputElement>('[data-hud="prompt"]');
const pauseButton = requiredElement<HTMLButtonElement>('[data-action="pause"]');
const pauseDialog = requiredElement<HTMLDialogElement>(".forest-opening__pause");
const recovery = requiredElement<HTMLElement>('[data-recovery="status"]');
const recoveryMessage = requiredElement<HTMLElement>('[data-recovery="message"]');
const held = new Set<"left" | "right">();
const audio = new BrowserForestOpeningAudio(runtimeForestOpeningAssetExport, {
  setLoopGain() {}, playOneShot() {}, suspend() {}, resume() {},
});

let jumpQueued = false;
let paused = false;
let accumulator = 0;
let lastFrame = performance.now();
let operationSequence = 0;
let lastSavedTick = view.tick;

bindControls();
persistence.bindPagehide(window, () => session);
if (blockedLoad) showRecovery(blockedLoad.reason);
else if (!loaded.ok) persistence.save(session);
render();
canvas.focus({ preventScroll: true });
requestAnimationFrame(loop);

function loop(now: number): void {
  const elapsed = Math.min(1, Math.max(0, (now - lastFrame) / 1_000));
  lastFrame = now;
  if (!paused && blockedLoad === null && view.mode === "forest_opening") {
    accumulator += elapsed;
    const fixedSeconds = 1 / 60;
    while (accumulator + 1e-9 >= fixedSeconds) {
      const moveX = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      session.advanceTicks(1, { moveX, jump: jumpQueued });
      jumpQueued = false;
      accumulator -= fixedSeconds;
      view = projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
      tryEnterSettlement();
    }
    if (view.tick - lastSavedTick >= 120) persist();
  }
  render();
  requestAnimationFrame(loop);
}

function bindControls(): void {
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLButtonElement) return;
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.add("left");
    if (key === "d" || key === "arrowright") held.add("right");
    if ((key === "w" || key === "arrowup" || key === " ") && !event.repeat) jumpQueued = true;
    if (key === "e" && !event.repeat) interact();
    if (key === "f" && !event.repeat) observe();
    if (key === "escape" && !event.repeat) togglePause();
    if (["a", "d", "w", "e", "f", "arrowleft", "arrowright", "arrowup", " "].includes(key)) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.delete("left");
    if (key === "d" || key === "arrowright") held.delete("right");
  });
  window.addEventListener("blur", () => held.clear());
  window.addEventListener("resize", render);
  canvas.addEventListener("pointerdown", () => { audio.activate(); }, { once: true });
  pauseButton.addEventListener("click", togglePause);
  requiredElement<HTMLButtonElement>('[data-action="resume"]').addEventListener("click", togglePause);
  requiredElement<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener("click", () => {
    session.resetToCheckpoint();
    view = projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
    persist();
    closePause();
  });
  requiredElement<HTMLButtonElement>('[data-recovery="backup"]').addEventListener("click", downloadBackup);
  requiredElement<HTMLButtonElement>('[data-recovery="reset"]').addEventListener("click", () => {
    persistence.reset();
    blockedLoad = null;
    window.location.reload();
  });
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-touch]")) bindTouch(button);
}

function bindTouch(button: HTMLButtonElement): void {
  const action = button.dataset.touch;
  let pointer: number | null = null;
  const release = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    if (action === "left" || action === "right") held.delete(action);
    pointer = null;
  };
  button.addEventListener("pointerdown", (event) => {
    if (pointer !== null) return;
    pointer = event.pointerId;
    if (action === "left" || action === "right") held.add(action);
    else if (action === "jump") jumpQueued = true;
    else if (action === "interact") interact();
    else if (action === "observe") observe();
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    if (action === "jump") jumpQueued = true;
    else if (action === "interact") interact();
    else if (action === "observe") observe();
  });
}

function interact(): void {
  if (paused || blockedLoad !== null || view.mode !== "forest_opening") return;
  const request = nearestInteraction(view);
  if (!request) return;
  const result = session.interact(operationId("interact"), request, session.snapshot().runtime.obstacle.revision);
  view = projectForestOpeningView(result.snapshot, runtimeForestOpeningAssetExport);
  if (result.accepted) {
    persist();
    audio.apply(mixForestOpeningAudioFrame({
      districtId: districtFor(view.traveler.position.x), listener: view.traveler.position,
      streamPosition: { x: 1840, y: 704 }, muted: false, suspended: paused,
      events: [{ kind: request.kind === "enter_shallow_detour" ? "water_entry" : "object_collision",
        position: view.traveler.position }],
    }));
  }
}

function observe(): void {
  if (paused || blockedLoad !== null || view.mode !== "forest_opening") return;
  const result = session.observeGlyph(operationId("observe"));
  view = projectForestOpeningView(result.snapshot, runtimeForestOpeningAssetExport);
  if (result.accepted) persist();
}

function tryEnterSettlement(): void {
  if (!view.obstacle.visuallyComplete || view.mode !== "forest_opening") return;
  const perimeter = worldObjects(view).find(({ kind }) => kind === "settlement_perimeter");
  if (!perimeter || view.traveler.position.x + 12 < perimeter.bounds.x) return;
  const result = session.enterSettlementPerimeter(operationId("settlement"));
  view = projectForestOpeningView(result.snapshot, runtimeForestOpeningAssetExport);
  if (result.accepted) persist();
}

function nearestInteraction(current: ForestOpeningPublicView): ForestOpeningInteraction | null {
  const actor = { x: current.traveler.position.x + 6, y: current.traveler.position.y + 7 };
  const candidates = worldObjects(current)
    .filter((object) => (object.kind === "stone" || object.kind === "deadwood") &&
      object.state !== "seated" && object.state !== "bridged")
    .map((object) => ({ object, distance: gap(actor, object) }))
    .filter(({ distance }) => distance <= 48)
    .sort((left, right) => left.distance - right.distance);
  const nearest = candidates[0]?.object;
  if (nearest?.kind === "stone") return { kind: "push_stone", objectId: nearest.id as "stream.stone.a" | "stream.stone.b", direction: 1 };
  if (nearest?.kind === "deadwood") return { kind: "drag_deadwood", objectId: "stream.deadwood", direction: 1 };
  const stream = worldObjects(current).find(({ kind }) => kind === "stream");
  return stream && gap(actor, stream) <= 48 ? { kind: "enter_shallow_detour" } : null;
}

function render(): void {
  view = projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
  renderForestOpeningView(context, view);
  const screenX = view.traveler.position.x - view.camera.x;
  const screenY = view.traveler.position.y - view.camera.y - 6;
  const crop = fitForestOpeningPresentation(
    { width: window.innerWidth, height: window.innerHeight },
    { x: screenX, y: screenY, width: 8, height: 20 },
  );
  canvas.style.left = `${crop.left}px`;
  canvas.style.top = `${crop.top}px`;
  canvas.style.width = `${crop.width}px`;
  canvas.style.height = `${crop.height}px`;
  root.dataset.mode = view.mode;
  health.value = `${view.hud.health}/${view.hud.maxHealth}`;
  mp.value = `${view.hud.mp}/${view.hud.maxMp}`;
  objective.textContent = view.hud.objective;
  prompt.textContent = view.obstacle.interactionPrompt ?? "";
}

function persist(): void {
  persistence.save(session);
  lastSavedTick = view.tick;
}

function togglePause(): void {
  if (blockedLoad !== null) return;
  paused = !paused;
  pauseButton.setAttribute("aria-pressed", String(paused));
  if (paused) {
    pauseDialog.showModal();
    audio.suspend();
  } else closePause();
}

function closePause(): void {
  paused = false;
  pauseButton.setAttribute("aria-pressed", "false");
  if (pauseDialog.open) pauseDialog.close();
  audio.resume();
  canvas.focus({ preventScroll: true });
}

function showRecovery(reason: Exclude<ForestOpeningLoadResult, { ok: true }>["reason"]): void {
  paused = true;
  recovery.hidden = false;
  recoveryMessage.textContent = reason === "invalid_json" ? "存档不是有效 JSON；原字节仍保留。"
    : reason === "incompatible" ? "存档版本不兼容；请先导出备份再明确重置。"
      : "存档完整性校验失败；原字节仍保留。";
}

function downloadBackup(): void {
  const bytes = persistence.exportBackup();
  if (bytes === null) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
  link.download = "tokipona-forest-opening-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function operationId(action: string): string {
  operationSequence += 1;
  return `browser.forest-opening:${action}:${view.tick}:${operationSequence}`;
}

function worldObjects(current: ForestOpeningPublicView): readonly ForestOpeningWorldObjectView[] {
  return current.environment.find(({ layer }) => layer === "world_material")?.objects ?? [];
}

function gap(point: { x: number; y: number }, object: ForestOpeningWorldObjectView): number {
  const dx = Math.max(object.bounds.x - point.x, point.x - (object.bounds.x + object.bounds.width), 0);
  const dy = Math.max(object.bounds.y - point.y, point.y - (object.bounds.y + object.bounds.height), 0);
  return Math.hypot(dx, dy);
}

function districtFor(x: number): string {
  return x < 1280 ? "forest.arrival" : x < 2496 ? "forest.stream" : "forest.settlement";
}

function requiredDocumentElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`forest opening document element is missing: ${selector}`);
  return element;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (!element) throw new Error(`forest opening element is missing: ${selector}`);
  return element;
}

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = target.getContext("2d", { alpha: false });
  if (!value) throw new Error("forest opening canvas context is unavailable");
  return value;
}
