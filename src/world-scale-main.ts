import generatedRuntimeArtifact from "./generated/content-runtime.v0.1.json";
import { readRuntimeSceneManifestIndex } from "./content/runtime-scene-manifest";
import { projectCharacterPixels, type CharacterPixelRig } from "./visual/character-pixel-rig";
import { projectWorldEnvironment, type WorldEnvironmentProjection } from "./visual/world-environment";
import { projectWorldGameView } from "./visual/world-game-view";
import { WORLD_SCALE_TELO_GLYPH_POSITION } from "./visual/world-interaction";
import {
  WorldScalePrototypeController,
  type WorldScalePrototypeSnapshot,
} from "./visual/world-scale-controller";
import {
  WORLD_SCALE_PROFILE_IDS,
  readWorldScaleProfile,
  type WorldScaleFrame,
  type WorldScaleProfileId,
} from "./visual/world-scale-prototype";
import { projectWorldVfx, type WorldVfxProjection } from "./visual/world-vfx";

const SCENES = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;
const app = requiredDocumentElement<HTMLElement>("#world-scale-app");

app.innerHTML = `
  <section class="world-review" aria-label="tokipona-rpg N00 至 N01 纵向切片">
    <div class="world-review__stage">
      <canvas tabindex="0" aria-label="可操作的像素世界；方向键或 WASD 移动，空格跳跃，E 互动，V 打开审计抽屉"></canvas>
      <div class="world-review__vignette" aria-hidden="true"></div>
      <p class="world-review__scene-title" aria-live="polite"></p>
      <p class="world-review__prompt" aria-live="polite"></p>
      <p class="world-review__toast" role="status" aria-live="polite"></p>
      <button class="world-review__audit-toggle" type="button" aria-expanded="false" aria-controls="world-audit">
        <span aria-hidden="true">V</span> 视觉审计
      </button>
      <aside class="world-review__audit" id="world-audit" hidden>
        <p class="world-review__audit-kicker">VISUAL AUDIT · LOGIC PRESERVED</p>
        <h1>世界尺度对照</h1>
        <div class="world-review__profiles" role="group" aria-label="世界尺度">
          ${WORLD_SCALE_PROFILE_IDS.map((id) => {
            const profile = readWorldScaleProfile(id);
            return `<button type="button" data-profile="${id}" aria-pressed="${id === "medium"}">${profile.label}</button>`;
          }).join("")}
        </div>
        <dl class="world-review__diagnostics"></dl>
        <p class="world-review__audit-note">只改可视范围与表现层；16 px 世界格、12×14 碰撞体与原有玩法逻辑保持不变。</p>
      </aside>
      <div class="world-review__touch" aria-label="触控操作">
        <div class="world-review__touch-move">
          <button type="button" data-touch="left" aria-label="向左移动">←</button>
          <button type="button" data-touch="right" aria-label="向右移动">→</button>
        </div>
        <div class="world-review__touch-action">
          <button type="button" data-touch="interact" aria-label="互动">E</button>
          <button type="button" data-touch="jump" aria-label="跳跃">↑</button>
        </div>
      </div>
    </div>
  </section>
`;

const canvas = requiredElement<HTMLCanvasElement>("canvas");
const context = requiredCanvasContext(canvas);
const sceneTitle = requiredElement<HTMLElement>(".world-review__scene-title");
const prompt = requiredElement<HTMLElement>(".world-review__prompt");
const toast = requiredElement<HTMLElement>(".world-review__toast");
const auditToggle = requiredElement<HTMLButtonElement>(".world-review__audit-toggle");
const auditDrawer = requiredElement<HTMLElement>(".world-review__audit");
const diagnostics = requiredElement<HTMLElement>(".world-review__diagnostics");
const profileButtons = [...app.querySelectorAll<HTMLButtonElement>("[data-profile]")];
const touchButtons = [...app.querySelectorAll<HTMLButtonElement>("[data-touch]")];
const controller = WorldScalePrototypeController.fresh("world-scale.browser.prototype", 12, 24);
const held = new Set<"left" | "right">();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let auditOpen = false;
let jumpQueued = false;
let lastFrameTime = performance.now();
let tickRemainder = 0;
let latest = controller.snapshot();
let lastSceneId = latest.frame.sceneId;
let sceneTitleUntil = performance.now() + 2_400;
let toastMessage: string | null = null;
let toastUntil = 0;

applyProfile("medium");
bindControls();
requestAnimationFrame(loop);

function bindControls(): void {
  for (const button of profileButtons) {
    button.addEventListener("click", () => applyProfile(button.dataset.profile as WorldScaleProfileId));
  }
  auditToggle.addEventListener("click", toggleAudit);
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "v" && !event.repeat) toggleAudit();
    if (key === "e" && !event.repeat) interact();
    if (event.target instanceof HTMLButtonElement) return;
    if (key === "a" || key === "arrowleft") held.add("left");
    if (key === "d" || key === "arrowright") held.add("right");
    if ((key === " " || key === "w" || key === "arrowup") && !event.repeat) jumpQueued = true;
    if (["a", "d", "e", "v", "w", "arrowleft", "arrowright", "arrowup", " "].includes(key)) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.delete("left");
    if (key === "d" || key === "arrowright") held.delete("right");
  });
  window.addEventListener("blur", () => held.clear());
  for (const button of touchButtons) {
    const action = button.dataset.touch;
    const press = (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (action === "left" || action === "right") held.add(action);
      if (action === "jump") jumpQueued = true;
      if (action === "interact") interact();
    };
    const release = (event: PointerEvent) => {
      if (action === "left" || action === "right") held.delete(action);
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  }
}

function applyProfile(profileId: WorldScaleProfileId): void {
  latest = controller.setProfile(profileId);
  canvas.width = latest.frame.profile.viewportPx.width;
  canvas.height = latest.frame.profile.viewportPx.height;
  context.imageSmoothingEnabled = false;
  for (const button of profileButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.profile === profileId));
  }
  render(latest, performance.now());
  canvas.focus({ preventScroll: true });
}

function toggleAudit(): void {
  auditOpen = !auditOpen;
  auditDrawer.hidden = !auditOpen;
  auditToggle.setAttribute("aria-expanded", String(auditOpen));
  render(latest, performance.now());
}

function interact(): void {
  const result = controller.interact();
  latest = controller.snapshot();
  toastMessage = result.message;
  toastUntil = performance.now() + 2_600;
  render(latest, performance.now());
}

function loop(now: number): void {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1_000));
  lastFrameTime = now;
  tickRemainder += elapsed * 60;
  const ticks = Math.min(6, Math.floor(tickRemainder));
  if (ticks > 0) {
    tickRemainder -= ticks;
    const moveX = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    latest = controller.advanceTicks(ticks, { moveX, jump: jumpQueued });
    jumpQueued = false;
  }
  if (latest.frame.sceneId !== lastSceneId) {
    lastSceneId = latest.frame.sceneId;
    sceneTitleUntil = now + 2_400;
  }
  if (toastMessage && now >= toastUntil) toastMessage = null;
  render(latest, now);
  requestAnimationFrame(loop);
}

function render(snapshot: WorldScalePrototypeSnapshot, now: number): void {
  const frame = snapshot.frame;
  const scene = SCENES[frame.sceneId];
  if (!scene) throw new Error(`world review scene is missing: ${frame.sceneId}`);
  const environment = projectWorldEnvironment(scene, frame);
  const interaction = controller.interactionView();
  const vfx = projectWorldVfx({
    frame,
    waterBounds: frame.sceneId === "scene.valley.stream_section" && snapshot.flow.arrival
      ? snapshot.flow.arrival.shallowWater
      : null,
    glyph: frame.sceneId === "scene.valley.stream_section"
      ? { worldPosition: WORLD_SCALE_TELO_GLYPH_POSITION, phase: interaction.phase }
      : null,
    reducedMotion: reducedMotion.matches,
  });
  const character = projectCharacterPixels(frame.character);
  drawBackdrop(frame, environment);
  drawFarEnvironment(environment);
  drawWorld(frame, environment);
  drawWater(vfx);
  drawManifestedWater(snapshot, frame);
  drawMotes(vfx);
  drawGlyph(vfx);
  drawCharacter(frame, character);
  drawLandingDust(vfx);
  drawLighting(frame, vfx);
  drawFog(frame, vfx);

  const view = projectWorldGameView({ snapshot, interaction, auditOpen, toast: toastMessage });
  sceneTitle.textContent = view.sceneTitle;
  sceneTitle.classList.toggle("is-visible", reducedMotion.matches || now < sceneTitleUntil);
  prompt.textContent = view.interactionPrompt;
  prompt.classList.toggle("is-visible", view.interactionPrompt !== null);
  toast.textContent = view.toast;
  toast.classList.toggle("is-visible", view.toast !== null);
  if (view.audit.diagnostics) {
    diagnostics.innerHTML = `
      <div><dt>视野</dt><dd>${view.audit.diagnostics.viewport}</dd></div>
      <div><dt>世界格</dt><dd>${view.audit.diagnostics.macroTilePx} px</dd></div>
      <div><dt>材质格</dt><dd>${view.audit.diagnostics.materialCellPx} px</dd></div>
      <div><dt>碰撞体</dt><dd>${view.audit.diagnostics.collisionBody}</dd></div>
      <div><dt>tick</dt><dd>${view.audit.diagnostics.tick}</dd></div>
    `;
  }
}

function drawBackdrop(frame: WorldScaleFrame, environment: WorldEnvironmentProjection): void {
  const gradient = context.createLinearGradient(0, 0, 0, frame.camera.height);
  gradient.addColorStop(0, environment.palette.skyTop);
  gradient.addColorStop(1, environment.palette.skyBottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, frame.camera.width, frame.camera.height);
}

function drawFarEnvironment(environment: WorldEnvironmentProjection): void {
  for (const band of environment.farSilhouettes) {
    context.beginPath();
    band.points.forEach((point, index) => index === 0
      ? context.moveTo(point.x, point.y)
      : context.lineTo(point.x, point.y));
    context.closePath();
    context.fillStyle = band.color;
    context.fill();
  }
  for (const formation of environment.midFormations) {
    context.fillStyle = formation.color;
    if (formation.kind === "root") {
      context.beginPath();
      context.moveTo(formation.x, formation.y);
      context.lineTo(formation.x + formation.width, formation.y);
      context.lineTo(formation.x + Math.floor(formation.width * 0.7), formation.y + formation.height);
      context.lineTo(formation.x + Math.floor(formation.width * 0.25), formation.y + formation.height);
      context.fill();
    } else {
      context.fillRect(formation.x, formation.y, formation.width, formation.height);
    }
  }
}

function drawWorld(frame: WorldScaleFrame, environment: WorldEnvironmentProjection): void {
  for (const tile of frame.solidTiles) {
    context.fillStyle = tile.variant % 2 === 0 ? environment.palette.terrain : environment.palette.terrainShadow;
    context.fillRect(tile.screenX, tile.screenY, 16, 16);
    context.fillStyle = tile.exposedTop ? environment.palette.surface : "rgba(255,255,255,.025)";
    context.fillRect(tile.screenX, tile.screenY, 16, tile.exposedTop ? 2 : 1);
  }
  const cellTones = [
    environment.palette.terrainShadow,
    environment.palette.terrain,
    environment.palette.mid,
    environment.palette.accent,
  ] as const;
  for (const cell of frame.materialCells) {
    context.globalAlpha = cell.tone === 3 ? 0.42 : 0.58;
    context.fillStyle = cellTones[cell.tone];
    context.fillRect(cell.screenX, cell.screenY, cell.size, cell.size);
  }
  context.globalAlpha = 1;
  for (const decoration of environment.decorations) drawDecoration(decoration);
}

function drawDecoration(decoration: WorldEnvironmentProjection["decorations"][number]): void {
  context.fillStyle = decoration.color;
  if (decoration.kind === "grass") {
    context.fillRect(decoration.x, decoration.y - 4 - decoration.variant, 1, 5 + decoration.variant);
    context.fillRect(decoration.x + 2, decoration.y - 2 - (decoration.variant % 2), 1, 3 + (decoration.variant % 2));
  } else if (decoration.kind === "root") {
    context.fillRect(decoration.x, decoration.y - 1, 5 + decoration.variant, 2);
    context.fillRect(decoration.x + 3, decoration.y - 3, 1, 3);
  } else if (decoration.kind === "fungus") {
    context.fillRect(decoration.x, decoration.y - 3, 1, 3);
    context.fillRect(decoration.x - 1, decoration.y - 4, 4, 2);
  } else if (decoration.kind === "wet_streak") {
    context.globalAlpha = 0.5;
    context.fillRect(decoration.x, decoration.y, 1, 5 + decoration.variant);
    context.globalAlpha = 1;
  } else {
    context.fillRect(decoration.x, decoration.y - 2, 3 + (decoration.variant % 2), 2);
  }
}

function drawWater(vfx: WorldVfxProjection): void {
  if (!vfx.water) return;
  const gradient = context.createLinearGradient(0, vfx.water.body.y, 0, vfx.water.body.y + 50);
  gradient.addColorStop(0, "rgba(79, 148, 151, .72)");
  gradient.addColorStop(1, "rgba(20, 59, 65, .86)");
  context.fillStyle = gradient;
  context.fillRect(vfx.water.body.x, vfx.water.body.y, vfx.water.body.width, vfx.water.body.height);
  context.fillStyle = "rgba(176, 228, 217, .55)";
  for (const point of vfx.water.surfaceWaves) context.fillRect(point.x, point.y, 4, 1);
  context.fillStyle = "rgba(205, 238, 225, .58)";
  for (const foam of vfx.water.foam) context.fillRect(foam.x, foam.y, foam.width, 1);
}

function drawManifestedWater(snapshot: WorldScalePrototypeSnapshot, frame: WorldScaleFrame): void {
  if (!snapshot.flow.arrival) return;
  context.fillStyle = "#a9ebe2";
  for (const particle of snapshot.flow.arrival.manifestedWater) {
    context.fillRect(
      Math.round(particle.position.x - frame.camera.x),
      Math.round(particle.position.y - frame.camera.y),
      2,
      particle.settled ? 1 : 3,
    );
  }
}

function drawMotes(vfx: WorldVfxProjection): void {
  for (const mote of vfx.motes) {
    context.globalAlpha = mote.opacity;
    context.fillStyle = mote.color;
    context.fillRect(mote.x, mote.y, mote.size, mote.size);
  }
  context.globalAlpha = 1;
}

function drawGlyph(vfx: WorldVfxProjection): void {
  if (!vfx.glyph) return;
  context.fillStyle = "#232d2b";
  context.fillRect(vfx.glyph.slab.x, vfx.glyph.slab.y, vfx.glyph.slab.width, vfx.glyph.slab.height);
  context.fillStyle = "#354441";
  context.fillRect(vfx.glyph.slab.x + 2, vfx.glyph.slab.y + 2, vfx.glyph.slab.width - 4, 2);
  context.fillStyle = vfx.glyph.color;
  for (const stroke of vfx.glyph.strokes) context.fillRect(stroke.x, stroke.y, stroke.width, stroke.height);
}

function drawCharacter(frame: WorldScaleFrame, rig: CharacterPixelRig): void {
  const x = Math.round(frame.character.screenPosition.x + rig.anchorOffset.x);
  const y = Math.round(frame.character.screenPosition.y + rig.anchorOffset.y);
  for (const pixel of rig.pixels) {
    context.fillStyle = pixel.color;
    context.fillRect(x + pixel.x, y + pixel.y, pixel.width, pixel.height);
  }
}

function drawLandingDust(vfx: WorldVfxProjection): void {
  for (const particle of vfx.landingDust) {
    context.fillStyle = particle.color;
    context.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
}

function drawLighting(frame: WorldScaleFrame, vfx: WorldVfxProjection): void {
  context.save();
  context.fillStyle = "rgba(0, 5, 7, .32)";
  context.fillRect(0, 0, frame.camera.width, frame.camera.height);
  context.globalCompositeOperation = "screen";
  for (const light of vfx.lights) {
    const glow = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    glow.addColorStop(0, colorWithAlpha(light.color, light.strength));
    glow.addColorStop(1, colorWithAlpha(light.color, 0));
    context.fillStyle = glow;
    context.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
  }
  context.restore();
}

function drawFog(frame: WorldScaleFrame, vfx: WorldVfxProjection): void {
  for (const band of vfx.fogBands) {
    const gradient = context.createLinearGradient(0, band.y, 0, band.y + band.height);
    gradient.addColorStop(0, "rgba(160, 185, 172, 0)");
    gradient.addColorStop(0.5, `rgba(160, 185, 172, ${band.opacity})`);
    gradient.addColorStop(1, "rgba(160, 185, 172, 0)");
    context.fillStyle = gradient;
    context.fillRect(-band.drift, band.y, frame.camera.width + 32, band.height);
  }
}

function colorWithAlpha(hex: string, alpha: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (!element) throw new Error(`world scale element is missing: ${selector}`);
  return element;
}

function requiredDocumentElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`world scale document element is missing: ${selector}`);
  return element;
}

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = target.getContext("2d", { alpha: false });
  if (!value) throw new Error("world scale canvas 2d context is unavailable");
  return value;
}
