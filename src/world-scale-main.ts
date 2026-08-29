import { ForestGrayboxController } from "./visual/forest-graybox-controller";
import {
  createForestGrayboxPageMarkup,
  projectForestGrayboxView,
  renderForestGrayboxView,
  type ForestGrayboxViewProjection,
} from "./visual/forest-graybox-view";

export const WORLD_SCALE_GRAYBOX_SEED = "forest.chapter-one.audit";

const app = requiredDocumentElement<HTMLElement>("#world-scale-app");
const controller = ForestGrayboxController.fresh({ seed: WORLD_SCALE_GRAYBOX_SEED });
let latest = controller.snapshot();
let view = projectForestGrayboxView(latest);

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
  });
  resetButton.addEventListener("click", () => {
    latest = controller.resetToCheckpoint();
    view = projectForestGrayboxView(latest);
    render(view);
    canvas.focus({ preventScroll: true });
  });
  for (const button of touchButtons) bindTouchButton(button);
  reducedMotion.addEventListener("change", syncReducedMotion);
}

function bindTouchButton(button: HTMLButtonElement): void {
  const action = button.dataset.touch;
  const press = (event: PointerEvent) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (action === "left" || action === "right") held.add(action);
    if (action === "jump") jumpQueued = true;
  };
  const release = (event: PointerEvent) => {
    if (action === "left" || action === "right") held.delete(action);
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => {
    if (action === "left" || action === "right") held.delete(action);
  });
}

function loop(now: number): void {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1_000));
  lastFrameTime = now;
  const beforeTick = latest.runtime.tick;
  latest = controller.advanceFrame(elapsed, {
    moveX: (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
    jump: jumpQueued,
  });
  if (latest.runtime.tick > beforeTick) jumpQueued = false;
  view = projectForestGrayboxView(latest);
  render(view);
  requestAnimationFrame(loop);
}

function render(next: ForestGrayboxViewProjection): void {
  renderForestGrayboxView(context, next);
  root.dataset.districtId = next.districtId;
  root.dataset.cameraWidth = String(next.viewport.width);
  root.dataset.cameraHeight = String(next.viewport.height);
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
