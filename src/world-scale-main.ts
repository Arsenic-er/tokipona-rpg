import {
  advanceForestGrayboxAuditFrame,
  ForestGrayboxController,
} from "./visual/forest-graybox-controller";
import {
  bindForestGrayboxTouchControl,
  createForestGrayboxPageMarkup,
  FOREST_GRAYBOX_VIEWPORT,
  projectForestGrayboxView,
  renderForestGrayboxView,
  type ForestGrayboxTouchAction,
  type ForestGrayboxViewProjection,
} from "./visual/forest-graybox-view";

export const WORLD_SCALE_GRAYBOX_SEED = "forest.chapter-one.audit";

const app = requiredDocumentElement<HTMLElement>("#world-scale-app");
const controller = ForestGrayboxController.fresh({ seed: WORLD_SCALE_GRAYBOX_SEED });
const materialPixels = new Uint8ClampedArray(
  FOREST_GRAYBOX_VIEWPORT.width * FOREST_GRAYBOX_VIEWPORT.height * 4,
);
let latest = controller.snapshot();
let view = projectForestGrayboxView(latest, { materialPixels });

app.innerHTML = createForestGrayboxPageMarkup(view, latest.diagnostics.regionId);

const root = requiredElement<HTMLElement>(".forest-graybox");
const canvas = requiredElement<HTMLCanvasElement>("canvas");
const context = requiredCanvasContext(canvas);
const district = requiredElement<HTMLElement>('[data-hud="district"]');
const seedOutput = requiredElement<HTMLOutputElement>('[data-hud="seed"]');
const tickOutput = requiredElement<HTMLOutputElement>('[data-hud="tick"]');
const resetButton = requiredElement<HTMLButtonElement>('[data-action="reset"]');
const touchButtons = [...app.querySelectorAll<HTMLButtonElement>("[data-touch]")];
const held = new Set<"left" | "right">();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let jumpQueued = false;
let queuedMove: -1 | 0 | 1 = 0;
let lastFrameTime = performance.now();

canvas.width = view.viewport.width;
canvas.height = view.viewport.height;
context.imageSmoothingEnabled = false;
bindControls();
syncReducedMotion();
render(view);
canvas.focus({ preventScroll: true });
requestAnimationFrame(loop);

function bindControls(): void {
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLButtonElement) return;
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.add("left");
    if (key === "d" || key === "arrowright") held.add("right");
    if ((key === " " || key === "w" || key === "arrowup") && !event.repeat) jumpQueued = true;
    if (["a", "d", "w", "arrowleft", "arrowright", "arrowup", " "].includes(key)) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.delete("left");
    if (key === "d" || key === "arrowright") held.delete("right");
  });
  window.addEventListener("blur", () => {
    held.clear();
    jumpQueued = false;
    queuedMove = 0;
  });
  resetButton.addEventListener("click", () => {
    latest = controller.resetToCheckpoint();
    view = projectForestGrayboxView(latest, { materialPixels });
    render(view);
    canvas.focus({ preventScroll: true });
  });
  for (const button of touchButtons) {
    const action = touchAction(button.dataset.touch);
    bindForestGrayboxTouchControl(button, action, {
      activate: (activatedAction) => {
        if (activatedAction === "left") queuedMove = -1;
        if (activatedAction === "right") queuedMove = 1;
        if (activatedAction === "jump") jumpQueued = true;
      },
      setHeld: (heldAction, active) => {
        if (heldAction === "jump") return;
        if (active) held.add(heldAction);
        else held.delete(heldAction);
      },
    });
  }
  reducedMotion.addEventListener("change", syncReducedMotion);
}

function touchAction(value: string | undefined): ForestGrayboxTouchAction {
  if (value === "left" || value === "right" || value === "jump") return value;
  throw new Error(`forest graybox touch action is invalid: ${String(value)}`);
}

function loop(now: number): void {
  const elapsed = Math.max(0, (now - lastFrameTime) / 1_000);
  lastFrameTime = now;
  const beforeTick = latest.runtime.tick;
  const heldMove = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  latest = advanceForestGrayboxAuditFrame(controller, elapsed, {
    moveX: heldMove === 0 ? queuedMove : heldMove,
    jump: jumpQueued,
  });
  if (latest.runtime.tick > beforeTick) {
    jumpQueued = false;
    queuedMove = 0;
  }
  view = projectForestGrayboxView(latest, { materialPixels });
  render(view);
  requestAnimationFrame(loop);
}

function render(next: ForestGrayboxViewProjection): void {
  renderForestGrayboxView(context, next);
  const landmark = next.landmarks.find((candidate) =>
    candidate.landmarkId === "forest.waterwheel_structure");
  if (!landmark) throw new Error("forest graybox waterwheel audit projection is missing");
  root.dataset.districtId = next.districtId;
  root.dataset.playerX = String(latest.runtime.player.position.x);
  root.dataset.playerY = String(latest.runtime.player.position.y);
  root.dataset.checkpointId = latest.runtime.checkpoint.id;
  root.dataset.checkpointX = String(latest.runtime.checkpoint.position.x);
  root.dataset.checkpointY = String(latest.runtime.checkpoint.position.y);
  root.dataset.cameraWidth = String(next.viewport.width);
  root.dataset.cameraHeight = String(next.viewport.height);
  root.dataset.waterwheelFullyVisible = String(landmark.fullyVisible);
  root.dataset.waterwheelVisibleComponents = String(landmark.visibleComponentIds.length);
  root.dataset.waterwheelTotalComponents = String(landmark.totalComponentCount);
  root.dataset.laterGatesBlocked = String(
    latest.diagnostics.laterGates.length > 0 &&
    latest.diagnostics.laterGates.every((gate) => gate.blocked),
  );
  district.textContent = next.hud.districtLabel;
  seedOutput.textContent = next.hud.seed;
  tickOutput.textContent = String(next.hud.tick);
}

function syncReducedMotion(): void {
  root.dataset.reducedMotion = String(reducedMotion.matches);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (!element) throw new Error(`forest graybox element is missing: ${selector}`);
  return element;
}

function requiredDocumentElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`forest graybox document element is missing: ${selector}`);
  return element;
}

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = target.getContext("2d", { alpha: false });
  if (!value) throw new Error("forest graybox canvas 2d context is unavailable");
  return value;
}
