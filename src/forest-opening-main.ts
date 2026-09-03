import { runtimeForestOpeningAssetExport } from "./assets/runtime-forest-opening-assets";
import {
  BrowserForestOpeningAudio,
  mixForestOpeningAudioFrame,
  projectForestOpeningMovementAudioEvents,
} from "./audio/browser-forest-opening-audio";
import { createBrowserWebAudioForestOpeningPort } from "./audio/web-audio-forest-opening-port";
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
  type ForestOpeningAnimationId,
} from "./visual/forest-opening-view";
import {
  loadBrowserForestOpeningVisualAssetsFromDocument,
  type LoadedForestOpeningVisualAssets,
} from "./visual/browser-forest-opening-assets";
import { drawForestOpeningCandidateTraveler } from "./visual/forest-opening-candidate-traveler";
import { drawForestOpeningTerrain } from "./visual/forest-opening-terrain";
import { createBrowserOperationNonce } from "./runtime/browser-operation-nonce";
import type { LocalTravelerAtlas } from "./visual/browser-local-traveler-atlas";

const SAVE_KEY = "tokipona.forest-opening.vertical-slice.v0.1";
const MUTE_KEY = "tokipona.forest-opening.audio-muted.v0.1";
const SESSION_ID = "browser.forest-opening.player";
const SEED = "forest.chapter-one.opening";
const persistence = new BrowserForestOpeningPersistence(localStorage, SAVE_KEY);
const loaded = persistence.load();
let session = loaded.ok
  ? persistence.restore(loaded.save)
  : PrologueForestOpeningSession.fresh({ sessionId: SESSION_ID, seed: SEED, currentMp: 12, maxMp: 24 });
let blockedLoad: ForestOpeningLoadResult | null = !loaded.ok && loaded.reason !== "missing" ? loaded : null;
let actionPresentation: Readonly<{
  animationId: Extract<ForestOpeningAnimationId, "push" | "drag" | "dig" | "observe">;
  untilTick: number;
}> | null = null;
let view = projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
let visualAssets: LoadedForestOpeningVisualAssets | null = null;
let localTravelerVisuals: Readonly<{
  atlas: LocalTravelerAtlas;
  draw: typeof import("./visual/browser-local-traveler-atlas")["drawForestOpeningLocalTraveler"];
  bounds: typeof import("./visual/browser-local-traveler-atlas")["localTravelerBounds"];
}> | null = null;
const app = requiredDocumentElement<HTMLElement>("#forest-opening-app");
app.innerHTML = createForestOpeningPageMarkup(view);

const canvas = requiredElement<HTMLCanvasElement>('canvas[data-surface="game"]');
const context = requiredCanvasContext(canvas);
const health = requiredElement<HTMLOutputElement>('[data-hud="health"]');
const mp = requiredElement<HTMLOutputElement>('[data-hud="mp"]');
const objective = requiredElement<HTMLElement>('[data-hud="objective"]');
const prompt = requiredElement<HTMLOutputElement>('[data-hud="prompt"]');
const pauseButton = requiredElement<HTMLButtonElement>('[data-action="pause"]');
const muteButton = requiredElement<HTMLButtonElement>('[data-action="mute"]');
const pauseDialog = requiredElement<HTMLDialogElement>(".forest-opening__pause");
const recovery = requiredElement<HTMLElement>('[data-recovery="status"]');
const recoveryMessage = requiredElement<HTMLElement>('[data-recovery="message"]');
const candidateLabel = requiredElement<HTMLElement>(".forest-opening__candidate");
const held = new Set<"left" | "right">();
const audio = new BrowserForestOpeningAudio(
  runtimeForestOpeningAssetExport,
  createBrowserWebAudioForestOpeningPort(runtimeForestOpeningAssetExport),
);

let jumpQueued = false;
let jumpHeld = false;
let paused = false;
let muted = localStorage.getItem(MUTE_KEY) === "true";
let accumulator = 0;
let lastFrame = performance.now();
let operationSequence = 0;
const operationNonce = createBrowserOperationNonce();
let lastSavedTick = view.tick;

bindControls();
updateMuteButton();
persistence.bindLifecycle(window, document, () => blockedLoad === null ? session : null);
void loadBrowserForestOpeningVisualAssetsFromDocument(runtimeForestOpeningAssetExport)
  .then((result) => {
    if (result.status === "approved_pack_load_failed") {
      candidateLabel.textContent = "获批素材加载失败 · 已安全回退";
      return;
    }
    if (result.status !== "ready") return;
    visualAssets = result.assets;
    render();
  });
if (import.meta.env.DEV) {
  void import("./visual/browser-local-traveler-atlas").then(async (module) => {
    const result = await module.loadBrowserLocalTravelerAtlasFromDocument();
    if (result.status !== "ready" || visualAssets !== null) return;
    localTravelerVisuals = Object.freeze({
      atlas: result.atlas,
      draw: module.drawForestOpeningLocalTraveler,
      bounds: module.localTravelerBounds,
    });
    candidateLabel.textContent = "本地人物步态候选 v0.6 · 尚未通过正式素材审批";
    render();
  });
}
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
      session.advanceTicks(1, { moveX, jump: jumpHeld || jumpQueued });
      jumpQueued = false;
      accumulator -= fixedSeconds;
      const snapshot = session.snapshot();
      view = project(snapshot);
      applyAudio(projectForestOpeningMovementAudioEvents({
        tick: view.tick,
        grounded: snapshot.runtime.spatial.player.grounded,
        velocityX: snapshot.runtime.spatial.player.velocity.x,
        districtId: districtFor(view.traveler.position.x),
        solutionId: snapshot.runtime.obstacle.committedSolutionId,
        position: view.traveler.position,
      }));
      tryEnterSettlement();
    }
    if (view.tick - lastSavedTick >= 120) persist();
  }
  render();
  requestAnimationFrame(loop);
}

function bindControls(): void {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "escape" && !event.repeat) {
      event.preventDefault();
      togglePause();
      return;
    }
    if (event.target instanceof HTMLButtonElement) return;
    audio.activate();
    if (key === "a" || key === "arrowleft") held.add("left");
    if (key === "d" || key === "arrowright") held.add("right");
    if (key === "w" || key === "arrowup" || key === " ") {
      jumpHeld = true;
      if (!event.repeat) jumpQueued = true;
    }
    if (key === "e" && !event.repeat) interact();
    if (key === "f" && !event.repeat) observe();
    if (["a", "d", "w", "e", "f", "arrowleft", "arrowright", "arrowup", " "].includes(key)) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.delete("left");
    if (key === "d" || key === "arrowright") held.delete("right");
    if (key === "w" || key === "arrowup" || key === " ") jumpHeld = false;
  });
  window.addEventListener("blur", () => {
    held.clear();
    jumpHeld = false;
  });
  window.addEventListener("resize", render);
  canvas.addEventListener("pointerdown", () => { audio.activate(); }, { once: true });
  pauseButton.addEventListener("click", togglePause);
  muteButton.addEventListener("click", toggleMute);
  pauseDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (paused) closePause();
  });
  requiredElement<HTMLButtonElement>('[data-action="resume"]').addEventListener("click", togglePause);
  requiredElement<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener("click", () => {
    session.resetToCheckpoint();
    view = project(session.snapshot());
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
    else if (action === "jump") jumpHeld = false;
    pointer = null;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener("pointerdown", (event) => {
    if (pointer !== null) return;
    audio.activate();
    pointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
    if (action === "left" || action === "right") held.add(action);
    else if (action === "jump") {
      jumpHeld = true;
      jumpQueued = true;
    }
    else if (action === "interact") interact();
    else if (action === "observe") observe();
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => {
    if (pointer === null) return;
    if (action === "left" || action === "right") held.delete(action);
    else if (action === "jump") jumpHeld = false;
    pointer = null;
  });
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
  if (result.accepted) {
    actionPresentation = { animationId: request.kind === "push_stone" ? "push"
      : request.kind === "drag_deadwood" ? "drag" : "dig", untilTick: result.snapshot.runtime.tick + 24 };
    view = project(result.snapshot);
    persist();
    applyAudio([{ kind: request.kind === "enter_shallow_detour" ? "water_entry" : "object_collision",
      position: view.traveler.position }]);
  } else view = project(result.snapshot);
}

function observe(): void {
  if (paused || blockedLoad !== null || view.mode !== "forest_opening") return;
  if (view.obstacle.interactionId !== "observe_glyph") return;
  const result = session.observeGlyph(operationId("observe"));
  if (result.accepted) {
    actionPresentation = { animationId: "observe", untilTick: result.snapshot.runtime.tick + 24 };
    view = project(result.snapshot);
    persist();
  } else view = project(result.snapshot);
}

function tryEnterSettlement(): void {
  if (!view.obstacle.visuallyComplete || view.mode !== "forest_opening") return;
  const perimeter = worldObjects(view).find(({ kind }) => kind === "settlement_perimeter");
  if (!perimeter || view.traveler.position.x < perimeter.bounds.x) return;
  const result = session.enterSettlementPerimeter(operationId("settlement"));
  view = project(result.snapshot);
  if (result.accepted) persist();
}

function nearestInteraction(current: ForestOpeningPublicView): ForestOpeningInteraction | null {
  const actor = { x: current.traveler.position.x + 6, y: current.traveler.position.y + 7 };
  const interactionId = current.obstacle.interactionId;
  const wantedKind = interactionId === "push_stone" ? "stone"
    : interactionId === "drag_deadwood" ? "deadwood"
      : null;
  const candidates = worldObjects(current)
    .filter((object) => object.kind === wantedKind &&
      object.state !== "seated" && object.state !== "bridged")
    .map((object) => ({ object, distance: gap(actor, object) }))
    .filter(({ distance }) => distance <= 48)
    .sort((left, right) => left.distance - right.distance);
  const nearest = candidates[0]?.object;
  if (nearest?.kind === "stone") return { kind: "push_stone", objectId: nearest.id as "stream.stone.a" | "stream.stone.b", direction: 1 };
  if (nearest?.kind === "deadwood") return { kind: "drag_deadwood", objectId: "stream.deadwood", direction: 1 };
  if (interactionId !== "enter_shallow_detour") return null;
  const stream = worldObjects(current).find(({ kind }) => kind === "stream");
  return stream && gap(actor, stream) <= 48 ? { kind: "enter_shallow_detour" } : null;
}

function render(): void {
  view = project(session.snapshot());
  renderForestOpeningView(
    context,
    view,
    visualAssets,
    (target, camera) => drawForestOpeningTerrain(target, session.visibleMaterialChunks(), camera),
    (target, currentView) => {
      if (localTravelerVisuals !== null) {
        localTravelerVisuals.draw(target, currentView, localTravelerVisuals.atlas);
        return;
      }
      drawForestOpeningCandidateTraveler(target, currentView);
    },
  );
  const travelerBounds = localTravelerVisuals === null
    ? {
        x: view.traveler.position.x - view.camera.x - 1,
        y: view.traveler.position.y - view.camera.y - 5,
        width: 14,
        height: 19,
      }
    : localTravelerVisuals.bounds(view);
  const crop = fitForestOpeningPresentation(
    { width: window.innerWidth, height: window.innerHeight },
    travelerBounds,
  );
  canvas.style.left = `${crop.left}px`;
  canvas.style.top = `${crop.top}px`;
  canvas.style.width = `${crop.width}px`;
  canvas.style.height = `${crop.height}px`;
  health.value = `${view.hud.health}/${view.hud.maxHealth}`;
  mp.value = `${view.hud.mp}/${view.hud.maxMp}`;
  objective.textContent = view.hud.objective;
  prompt.textContent = view.obstacle.interactionPrompt ?? "";
  candidateLabel.hidden = view.presentation.kind === "approved_asset_pack";
}

function project(snapshot: ReturnType<PrologueForestOpeningSession["snapshot"]>): ForestOpeningPublicView {
  if (actionPresentation !== null && snapshot.runtime.tick > actionPresentation.untilTick) actionPresentation = null;
  return projectForestOpeningView(snapshot, runtimeForestOpeningAssetExport, visualAssets,
    actionPresentation?.animationId ?? null);
}

function persist(): void {
  persistence.save(session);
  lastSavedTick = view.tick;
}

function applyAudio(events: Parameters<typeof mixForestOpeningAudioFrame>[0]["events"] = []): void {
  audio.apply(mixForestOpeningAudioFrame({
    districtId: districtFor(view.traveler.position.x),
    listener: view.traveler.position,
    streamPosition: { x: 1_840, y: 704 },
    muted,
    suspended: paused,
    events,
  }));
}

function toggleMute(): void {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, String(muted));
  updateMuteButton();
  applyAudio();
}

function updateMuteButton(): void {
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.textContent = muted ? "声音：关" : "声音：开";
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
  return `browser.forest-opening:${operationNonce}:${action}:${view.tick}:${operationSequence}`;
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
