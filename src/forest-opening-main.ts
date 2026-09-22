import { runtimeForestOpeningAssetExport } from "./assets/runtime-forest-opening-assets";
import {
  BrowserForestOpeningAudio,
  mixForestOpeningAudioFrame,
  projectForestOpeningMovementAudioEvents,
} from "./audio/browser-forest-opening-audio";
import { PrologueForestOpeningSession, FOREST_OPENING_WORLD_BOUNDS } from "./game/prologue-forest-opening";
import {
  BrowserForestOpeningPersistence,
  type ForestOpeningLoadResult,
} from "./persistence/browser-forest-opening-persistence";
import type { ForestOpeningInteraction } from "./world/forest-opening-obstacle";
import {
  createForestOpeningPageMarkup,
  fitForestOpeningPresentation,
  projectForestOpeningView,
  type ForestOpeningPublicView,
  type ForestOpeningWorldObjectView,
  type ForestOpeningAnimationId,
} from "./visual/forest-opening-view";
import type { LoadedForestOpeningVisualAssets } from "./visual/browser-forest-opening-assets";
import { drawForestOpeningCandidateTraveler } from "./visual/forest-opening-candidate-traveler";
import { drawForestOpeningBaseTerrain } from "./visual/forest-opening-base-terrain";
import { createBrowserOperationNonce } from "./runtime/browser-operation-nonce";
import type { LocalTravelerAtlas } from "./visual/browser-local-traveler-atlas";
import { ForestTravelerGait } from "./visual/forest-traveler-gait";
import { interpolateForestOpeningView } from "./visual/forest-opening-interpolation";
import type { ForestMouseCamera } from "./visual/forest-mouse-camera";
import type { ForestOpeningJourney } from "./visual/forest-opening-journey";
import type { ForestMap } from './visual/forest-map';

export function mountForestOpening(): void {
const SAVE_KEY = "tokipona.forest-opening.vertical-slice.v0.1";
const MUTE_KEY = "tokipona.forest-opening.audio-muted.v0.1";
const SESSION_ID = "browser.forest-opening.player";
const SEED = "forest.chapter-one.opening";
const practice = new URLSearchParams(location.search).get("practice");
const practiceSlot = practice !== null && /^[0-9a-f]{32}$/.test(practice) ? practice : null;
const persistence = new BrowserForestOpeningPersistence(practiceSlot ? sessionStorage : localStorage,
  practiceSlot ? `${SAVE_KEY}.practice.${practiceSlot}` : SAVE_KEY);
const loaded = persistence.load();
let session = loaded.ok
  ? persistence.restore(loaded.save)
  : PrologueForestOpeningSession.fresh({ sessionId: SESSION_ID, seed: SEED, currentMp: 12, maxMp: 24 });
let blockedLoad: ForestOpeningLoadResult | null = !loaded.ok && loaded.reason !== "missing" ? loaded : null;
let actionPresentation: Readonly<{
  animationId: Extract<ForestOpeningAnimationId, "push" | "drag" | "dig" | "observe">;
  untilTick: number;
}> | null = null;
let modelSnapshot = session.snapshot();
let view = projectForestOpeningView(modelSnapshot, runtimeForestOpeningAssetExport);
let previousView = view;
const gait = new ForestTravelerGait();
gait.advance(view.tick, modelSnapshot.runtime.spatial.player);
let visualAssets: LoadedForestOpeningVisualAssets | null = null;
let localTravelerVisuals: Readonly<{
  atlas: LocalTravelerAtlas;
  draw: typeof import("./visual/browser-local-traveler-atlas")["drawForestOpeningLocalTraveler"];
  bounds: typeof import("./visual/browser-local-traveler-atlas")["localTravelerBounds"];
}> | null = null;
let localBackdrop: ((target: CanvasRenderingContext2D, camera: ForestOpeningPublicView["camera"]) => void) | undefined;
let terrainRenderer = drawForestOpeningBaseTerrain;
let mouseCamera: ForestMouseCamera | null = null;
let sceneRenderer: typeof import("./visual/forest-opening-renderer")["renderForestOpeningView"] | null = null;
let sceneLoadFailed = false;
let journey: ForestOpeningJourney | null = null;
let atlas: ForestMap | null = null;
let painted: {
  model: typeof modelSnapshot; key: string; assets: LoadedForestOpeningVisualAssets | null;
  traveler: object | null; terrain: typeof terrainRenderer; backdrop: typeof localBackdrop;
} | null = null;
let saveSucceeded = loaded.ok;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const app = requiredDocumentElement<HTMLElement>("#forest-opening-app");
app.innerHTML = createForestOpeningPageMarkup(view);

const canvas = requiredElement<HTMLCanvasElement>('canvas[data-surface="game"]');
const context = requiredCanvasContext(canvas);
canvas.addEventListener("contextrestored", () => { painted = null; render(); });
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
let audio = new BrowserForestOpeningAudio(
  runtimeForestOpeningAssetExport,
  { setLoopGain() {}, playOneShot() {}, suspend() {}, resume() {} },
);
let audioActivationRequested = false;

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
persistence.bindLifecycle(window, document, () => blockedLoad === null ? session : null,
  (saved) => { saveSucceeded = saved; render(); });
// No audio decoder/bank loader is needed until a sound pack is actually admitted.
if (runtimeForestOpeningAssetExport.status === "approved") {
  void import("./audio/web-audio-forest-opening-port").then((module) => {
    audio = new BrowserForestOpeningAudio(runtimeForestOpeningAssetExport,
      module.createBrowserWebAudioForestOpeningPort(runtimeForestOpeningAssetExport));
    if (audioActivationRequested) audio.activate();
    applyAudio();
    if (paused) audio.suspend();
  }).catch(() => { muteButton.textContent = "声音暂不可用"; });
}
// Defer scene presentation together; retain visible base terrain while loading,
// but do not advance play until objects, interaction feedback and journal exist.
void import("./visual/forest-opening-terrain").then((module) => {
  terrainRenderer = module.drawForestOpeningTerrain;
  atlas = new module.ForestMap(app, {
    storage: practiceSlot ? sessionStorage : localStorage,
    suffix: practiceSlot ? `.practice.${practiceSlot}` : '',
    canOpen: () => !paused && blockedLoad === null && sceneRenderer !== null,
    suspend: () => { paused = true; clearInput(); audio.suspend(); },
    resume: closePause,
  });
  journey = new module.ForestOpeningJourney(app, {
    practice: practiceSlot !== null,
    canOpen: () => !paused && blockedLoad === null,
    suspend: () => { paused = true; clearInput(); audio.suspend(); },
    resume: closePause,
    retrySave: () => { persist(); render(); },
    replay: () => { location.href = `chapter-one.html?practice=${createBrowserOperationNonce()}`; },
  });
  mouseCamera = new module.ForestMouseCamera(FOREST_OPENING_WORLD_BOUNDS);
  module.bindForestMouseCamera(canvas, mouseCamera, () => paused || blockedLoad !== null);
  localBackdrop ??= (target, camera) => module.drawForestOpeningBackdrop(target, camera, view.worldMinute);
  sceneRenderer = module.renderForestOpeningView;
  render();
}).catch(() => { sceneLoadFailed = true; render(); });
if (runtimeForestOpeningAssetExport.status === "approved") void import("./visual/browser-forest-opening-assets")
  .then((module) => module.loadBrowserForestOpeningVisualAssetsFromDocument(runtimeForestOpeningAssetExport))
  .then((result) => {
    if (result.status === "approved_pack_load_failed") {
      candidateLabel.textContent = "获批素材加载失败 · 已安全回退";
      return;
    }
    if (result.status !== "ready") return;
    visualAssets = result.assets;
    render();
  }).catch(() => { candidateLabel.textContent = "获批素材加载失败 · 已安全回退"; });
if (import.meta.env.DEV || __TOKIPONA_LOCAL_DESKTOP__) {
  void import("./visual/browser-local-forest-backdrop").then(async (module) => {
    const image = await module.loadLocalForestBackdropFromDocument();
    if (image === null || visualAssets !== null) return;
    localBackdrop = (target, camera) => module.drawLocalForestBackdrop(target, camera, image);
    render();
  });
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
else if (!loaded.ok) persist();
render();
canvas.focus({ preventScroll: true });
requestAnimationFrame(loop);

function loop(now: number): void {
  const elapsed = Math.min(1, Math.max(0, (now - lastFrame) / 1_000));
  lastFrame = now;
  if (sceneRenderer && !paused && blockedLoad === null && view.mode === "forest_opening") {
    accumulator += elapsed;
    const fixedSeconds = 1 / 60;
    while (accumulator + 1e-9 >= fixedSeconds) {
      previousView = view;
      const settling = atSettlementEntrance();
      const moveX = settling ? 0 : (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const snapshot = session.advanceTicks(1, { moveX, jump: !settling && (jumpHeld || jumpQueued) });
      jumpQueued = false;
      accumulator -= fixedSeconds;
      const gaitFrame = gait.advance(snapshot.runtime.tick, snapshot.runtime.spatial.player);
      view = project(snapshot);
      applyAudio(projectForestOpeningMovementAudioEvents({
        tick: view.tick,
        grounded: snapshot.runtime.spatial.player.grounded,
        velocityX: snapshot.runtime.spatial.player.velocity.x,
        districtId: districtFor(view.traveler.position.x),
        solutionId: snapshot.runtime.obstacle.committedSolutionId,
        position: view.traveler.position,
        footContact: gaitFrame.footContact,
      }));
      tryEnterSettlement();
    }
    if (view.tick - lastSavedTick >= 120) persist();
  }
  if (paused || blockedLoad !== null) mouseCamera?.clearPointer();
  mouseCamera?.advance(elapsed, view.camera, view.traveler.position, reducedMotion.matches);
  render();
  requestAnimationFrame(loop);
}

function bindControls(): void {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (atlas?.key(event)) return;
    if (journey?.key(event)) return;
    if (key === "escape" && !event.repeat) {
      event.preventDefault();
      togglePause();
      return;
    }
    if (event.target instanceof HTMLButtonElement) return;
    if (paused || blockedLoad !== null || !sceneRenderer) return;
    activateAudio();
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
    clearInput();
  });
  window.addEventListener("resize", render);
  canvas.addEventListener("pointerdown", activateAudio, { once: true });
  pauseButton.addEventListener("click", togglePause);
  muteButton.addEventListener("click", toggleMute);
  pauseDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (paused) closePause();
  });
  requiredElement<HTMLButtonElement>('[data-action="resume"]').addEventListener("click", togglePause);
  requiredElement<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener("click", () => {
    const snapshot = session.resetToCheckpoint();
    mouseCamera?.clearPointer();
    gait.reset();
    view = project(snapshot);
    previousView = view;
    accumulator = 0;
    persist();
    closePause();
  });
  requiredElement<HTMLButtonElement>('[data-recovery="backup"]').addEventListener("click", downloadBackup);
  requiredElement<HTMLButtonElement>('[data-recovery="reset"]').addEventListener("click", () => {
    persistence.reset();
    atlas?.reset();
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
    if (pointer !== null || paused || blockedLoad !== null || !sceneRenderer) return;
    activateAudio();
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
    if (event.detail !== 0 || paused || blockedLoad !== null || !sceneRenderer) return;
    if (action === "jump") jumpQueued = true;
    else if (action === "interact") interact();
    else if (action === "observe") observe();
  });
}

function interact(): void {
  if (paused || blockedLoad !== null || view.mode !== "forest_opening") return;
  const request = nearestInteraction(view);
  if (!request) return;
  const result = session.interact(operationId("interact"), request, modelSnapshot.runtime.obstacle.revision);
  if (result.accepted) {
    const integrated = worldObjects(view).some(object => object.materialPocket?.integrated);
    journey?.feedback(integrated ? request.kind === "enter_shallow_detour"
      ? "松土已疏通，土粒正在沉积，水正流向低处。"
      : "已经施力；观察落点，可以继续推动、拖拽或从旁边通过。"
      : result.reason === "partial" ? "松石已经就位，还需要另一块。"
      : request.kind === 'enter_shallow_detour' && view.environment.some(layer => layer.objects.some(object => object.materialPocket?.sharedTerrain))
        ? '松土已疏通，水正流向低处；可以继续向东。' : "溪路已处理好，可以继续向东了。", view.tick);
    actionPresentation = { animationId: request.kind === "push_stone" ? "push"
      : request.kind === "drag_deadwood" ? "drag" : "dig", untilTick: result.snapshot.runtime.tick + 24 };
    view = project(result.snapshot);
    persist();
    applyAudio([{ kind: request.kind === "enter_shallow_detour" ? "water_entry" : "object_collision",
      position: view.traveler.position }]);
  } else {
    journey?.feedback(result.reason === "solution_conflict" ? "已经开始另一种办法，请继续当前方案，或从检查点重新尝试。"
      : "这里还够不到；靠近目标再试。", view.tick);
    view = project(result.snapshot);
  }
}

function observe(): void {
  if (paused || blockedLoad !== null || view.mode !== "forest_opening") return;
  if (view.obstacle.interactionId !== "observe_glyph") return;
  const result = session.observeGlyph(operationId("observe"));
  if (result.accepted) {
    journey?.feedback("你记下了刻痕的形状。它的读音和含义仍然未知。", view.tick);
    actionPresentation = { animationId: "observe", untilTick: result.snapshot.runtime.tick + 24 };
    view = project(result.snapshot);
    persist();
  } else view = project(result.snapshot);
}

function atSettlementEntrance(): boolean {
  if (!view.obstacle.visuallyComplete || view.mode !== "forest_opening") return false;
  const perimeter = worldObjects(view).find(({ kind }) => kind === "settlement_perimeter");
  return perimeter !== undefined && view.traveler.position.x >= perimeter.bounds.x &&
    view.traveler.position.x < perimeter.bounds.x + perimeter.bounds.width;
}

function tryEnterSettlement(): void {
  if (!atSettlementEntrance()) return;
  const player = modelSnapshot.runtime.spatial.player;
  // Let ordinary gravity and friction finish the arrival, rather than freezing
  // a jump or running pose when the terminal checkpoint is committed.
  if (!player.grounded || Math.abs(player.velocity.x) > 0.01) return;
  const result = session.enterSettlementPerimeter(operationId("settlement"));
  view = project(result.snapshot);
  if (result.accepted) { clearInput(); previousView = view; persist(); }
}

function nearestInteraction(current: ForestOpeningPublicView): ForestOpeningInteraction | null {
  const actor = { x: current.traveler.position.x + 6, y: current.traveler.position.y + 7 };
  const interactionId = current.obstacle.interactionId;
  const integrated = worldObjects(current).some(object => object.materialPocket?.integrated);
  const wantedKind = interactionId === "push_stone" ? "stone"
    : interactionId === "drag_deadwood" ? "deadwood"
      : null;
  const candidates = worldObjects(current)
    .filter((object) => object.kind === wantedKind &&
      (integrated || object.state !== "seated" && object.state !== "bridged"))
    .map((object) => ({ object, distance: gap(actor, object) }))
    .filter(({ distance }) => distance <= 48)
    .sort((left, right) => left.distance - right.distance);
  const nearest = candidates[0]?.object;
  if (nearest?.kind === "stone") return { kind: "push_stone", objectId: nearest.id as "stream.stone.a" | "stream.stone.b",
    direction: integrated && actor.x > nearest.bounds.x + nearest.bounds.width / 2 ? -1 : 1 };
  if (nearest?.kind === "deadwood") return { kind: "drag_deadwood", objectId: "stream.deadwood",
    direction: integrated && actor.x < nearest.bounds.x + nearest.bounds.width / 2 ? -1 : 1 };
  if (interactionId !== "enter_shallow_detour") return null;
  const stream = worldObjects(current).find(({ kind }) => kind === "stream");
  return stream && gap(actor, stream) <= 48 ? { kind: "enter_shallow_detour" } : null;
}

function render(): void {
  if (atlas && blockedLoad === null) {
    let samples: Map<string, Uint8Array> | undefined;
    const p = { x: view.traveler.position.x + 6, y: view.traveler.position.y + 7 };
    atlas.update('opening', p, view.tick, (x, y) => {
      samples ??= new Map(session.visibleMaterialChunks({ x: Math.max(0, p.x - 176), y: Math.max(0, p.y - 112), width: 352, height: 224 })
        .map(c => [`${c.chunkX},${c.chunkY}`, c.materials]));
      return samples.get(`${Math.floor(x / 16)},${Math.floor(y / 16)}`)?.[(y % 16) * 16 + x % 16] ?? 1;
    }, worldObjects(view).filter(o => o.kind === 'settlement_perimeter' || o.kind === 'unknown_glyph')
      .map(o => ({ x: o.bounds.x, y: o.bounds.y, label: o.kind === 'unknown_glyph' ? '石面刻痕' : '聚落入口' })));
  }
  // Model snapshots are immutable and already returned by every state change.
  // Reading notes or a finished save must not rebuild/hash the world each frame.
  view = project(modelSnapshot);
  const interpolated = paused ? view : interpolateForestOpeningView(previousView, view, accumulator * 60);
  const renderView = { ...interpolated, camera: mouseCamera?.compose(interpolated.camera, interpolated.traveler.position)
    ?? { ...interpolated.camera, x: Math.round(interpolated.camera.x), y: Math.round(interpolated.camera.y) } };
  const key = [renderView.camera.x, renderView.camera.y, renderView.camera.width, renderView.camera.height,
    renderView.traveler.position.x, renderView.traveler.position.y, renderView.traveler.animationId,
    renderView.traveler.frame, window.innerWidth, window.innerHeight].join(":");
  if (!painted || painted.model !== modelSnapshot || painted.key !== key || painted.assets !== visualAssets ||
      painted.traveler !== localTravelerVisuals || painted.terrain !== terrainRenderer || painted.backdrop !== localBackdrop) {
    paintScene(renderView);
    painted = { model: modelSnapshot, key, assets: visualAssets, traveler: localTravelerVisuals,
      terrain: terrainRenderer, backdrop: localBackdrop };
  }
  const healthText = `${view.hud.health}/${view.hud.maxHealth}`;
  const mpText = `${view.hud.mp}/${view.hud.maxMp}`;
  if (health.value !== healthText) health.value = healthText;
  if (mp.value !== mpText) mp.value = mpText;
  if (objective.textContent !== view.hud.objective) objective.textContent = view.hud.objective;
  const promptText = view.obstacle.interactionPrompt ?? "";
  if (prompt.textContent !== promptText) prompt.textContent = promptText;
  const hideLabel = !sceneLoadFailed && view.presentation.kind === "approved_asset_pack";
  if (candidateLabel.hidden !== hideLabel) candidateLabel.hidden = hideLabel;
  const failureText = "场景加载失败 · 请刷新重试（原存档保留）";
  if (sceneLoadFailed && candidateLabel.textContent !== failureText) candidateLabel.textContent = failureText;
  journey?.update(view, saveSucceeded, blockedLoad !== null);
}

function paintScene(renderView: ForestOpeningPublicView): void {
  if (canvas.width !== renderView.camera.width) canvas.width = renderView.camera.width;
  if (canvas.height !== renderView.camera.height) canvas.height = renderView.camera.height;
  if (sceneRenderer) sceneRenderer(
    context,
    renderView,
    visualAssets,
    (target, camera) => terrainRenderer(target, session.visibleMaterialChunks(camera), camera),
    (target, currentView) => {
      if (localTravelerVisuals !== null) {
        localTravelerVisuals.draw(target, currentView, localTravelerVisuals.atlas);
        return;
      }
      drawForestOpeningCandidateTraveler(target, currentView);
    },
    localBackdrop,
  );
  else {
    context.fillStyle = "#253b36";
    context.fillRect(0, 0, canvas.width, canvas.height);
    terrainRenderer(context, session.visibleMaterialChunks(renderView.camera), renderView.camera);
    drawForestOpeningCandidateTraveler(context, renderView);
  }
  const travelerBounds = localTravelerVisuals === null
    ? {
        x: renderView.traveler.position.x - renderView.camera.x - 1,
        y: renderView.traveler.position.y - renderView.camera.y - 5,
        width: 14,
        height: 19,
      }
    : localTravelerVisuals.bounds(renderView);
  const crop = fitForestOpeningPresentation(
    { width: window.innerWidth, height: window.innerHeight },
    travelerBounds,
    renderView.camera,
  );
  canvas.style.left = `${crop.left}px`;
  canvas.style.top = `${crop.top}px`;
  canvas.style.width = `${crop.width}px`;
  canvas.style.height = `${crop.height}px`;
}

function project(snapshot: ReturnType<PrologueForestOpeningSession["snapshot"]>): ForestOpeningPublicView {
  modelSnapshot = snapshot;
  if (actionPresentation !== null && snapshot.runtime.tick > actionPresentation.untilTick) actionPresentation = null;
  return projectForestOpeningView(snapshot, runtimeForestOpeningAssetExport, visualAssets,
    actionPresentation?.animationId ?? null,
    gait.advance(snapshot.runtime.tick, snapshot.runtime.spatial.player).frame);
}

function persist(): void {
  atlas?.save();
  lastSavedTick = view.tick;
  try { persistence.save(session); saveSucceeded = true; }
  catch { saveSucceeded = false; journey?.feedback("保存失败，请先不要关闭页面；抵达后可重试。", view.tick); }
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

function activateAudio(): void {
  audioActivationRequested = true;
  audio.activate();
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
    clearInput();
    pauseDialog.showModal();
    audio.suspend();
  } else closePause();
}

function clearInput(): void {
  held.clear(); jumpHeld = false; jumpQueued = false; accumulator = 0;
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
  const bounds = object.interactionBounds ?? object.bounds;
  const dx = Math.max(bounds.x - point.x, point.x - (bounds.x + bounds.width), 0);
  const dy = Math.max(bounds.y - point.y, point.y - (bounds.y + bounds.height), 0);
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
}
