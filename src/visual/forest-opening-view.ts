import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json" with { type: "json" };
import {
  readRuntimeForestOpeningManifest,
  type ForestOpeningSolutionId,
} from "../content/runtime-forest-opening-manifest";
import type {
  RuntimeForestOpeningAssetExport,
  RuntimeForestOpeningAssetRole,
} from "../assets/runtime-forest-opening-assets";
import type { PrologueForestOpeningSnapshot } from "../game/prologue-forest-opening";
import type { ForestCameraState } from "../runtime/forest-camera";
import type { Aabb, Vec2 } from "../runtime/geometry";
import type { RabbitMode, WetlandBirdMode } from "../world/forest-opening-ecology";

export const FOREST_OPENING_VIEWPORT = Object.freeze({ width: 640 as const, height: 360 as const });
const manifest = readRuntimeForestOpeningManifest(generatedRuntimeArtifact);

export type ForestOpeningAnimationId = "idle" | "walk" | "run" | "jump" | "fall";
export type ForestOpeningLayerId = "far_parallax" | "mid_parallax" | "world_material" | "foreground";

export interface ForestOpeningWorldObjectView {
  readonly kind: "stream" | "stone" | "deadwood" | "unknown_glyph" | "settlement_perimeter";
  readonly id: string;
  readonly bounds: Aabb;
  readonly state: string;
}

export interface ForestOpeningEnvironmentLayer {
  readonly layer: ForestOpeningLayerId;
  readonly parallaxRatio: number;
  readonly assetRole: RuntimeForestOpeningAssetRole | null;
  readonly objects: readonly ForestOpeningWorldObjectView[];
}

export interface ForestOpeningCreatureView {
  readonly speciesId: "forest.rabbit" | "forest.wetland_bird";
  readonly position: Vec2;
  readonly animationId: RabbitMode | WetlandBirdMode;
  readonly frame: number;
  readonly hostile: false;
}

export interface ForestOpeningPublicView {
  readonly mode: "forest_opening" | "settlement_perimeter";
  readonly tick: number;
  readonly worldMinute: number;
  readonly presentation: Readonly<{
    kind: "approved_asset_pack" | "procedural_candidate";
    approvedAssetPackId: "forest.opening.vertical-slice.v001" | null;
  }>;
  readonly camera: ForestCameraState;
  readonly traveler: Readonly<{
    position: Vec2;
    facing: -1 | 1;
    animationId: ForestOpeningAnimationId;
    frame: number;
    visualHeightPx: 20;
    glow: false;
  }>;
  readonly environment: readonly ForestOpeningEnvironmentLayer[];
  readonly obstacle: Readonly<{
    solutionId: ForestOpeningSolutionId | null;
    interactionPrompt: string | null;
    visuallyComplete: boolean;
    glyph: Readonly<{
      wordId: "word.telo";
      observed: boolean;
      meaningKnown: false;
      pronunciationKnown: false;
    }>;
  }>;
  readonly creatures: readonly ForestOpeningCreatureView[];
  readonly dialogue: Readonly<{ speakerId: string; text: string }> | null;
  readonly hud: Readonly<{
    health: 100;
    maxHealth: 100;
    mp: number;
    maxMp: number;
    objective: string;
  }>;
}

export interface ForestOpeningPresentationCrop {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export function fitForestOpeningPresentation(
  viewport: Readonly<{ width: number; height: number }>,
  traveler: Readonly<{ x: number; y: number; width: number; height: number }>,
): ForestOpeningPresentationCrop {
  if (![viewport.width, viewport.height, traveler.x, traveler.y, traveler.width, traveler.height]
    .every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 ||
    traveler.width <= 0 || traveler.height <= 0) {
    throw new Error("forest opening presentation bounds are invalid");
  }
  const scale = Math.max(viewport.width / 640, viewport.height / 360);
  const width = 640 * scale;
  const height = 360 * scale;
  const centeredLeft = (viewport.width - width) / 2;
  const centeredTop = (viewport.height - height) / 2;
  const left = keepVisible(centeredLeft, width, viewport.width,
    traveler.x * scale, (traveler.x + traveler.width) * scale);
  const top = keepVisible(centeredTop, height, viewport.height,
    traveler.y * scale, (traveler.y + traveler.height) * scale);
  return Object.freeze({ left, top, width, height, scale });
}

export function createForestOpeningPageMarkup(view: ForestOpeningPublicView): string {
  const candidate = view.presentation.kind === "procedural_candidate"
    ? '<span class="forest-opening__candidate">程序化画面候选</span>' : "";
  return `<section class="forest-opening" data-mode="${view.mode}">
    <div class="forest-opening__stage">
      <canvas data-surface="game" width="640" height="360" tabindex="0" aria-label="第一章森林开场游戏画面"></canvas>
      <header class="forest-opening__hud" aria-live="polite">
        <div class="forest-opening__meters"><span>HP <output data-hud="health">${view.hud.health}/${view.hud.maxHealth}</output></span><span>MP <output data-hud="mp">${view.hud.mp}/${view.hud.maxMp}</output></span></div>
        <p data-hud="objective">${escapeHtml(view.hud.objective)}</p>
        <output data-hud="prompt">${escapeHtml(view.obstacle.interactionPrompt ?? "")}</output>
        ${candidate}
        <button type="button" data-action="pause" aria-pressed="false">暂停</button>
      </header>
      <div class="forest-opening__touch" aria-label="触控操作">
        <div><button type="button" data-touch="left" aria-label="向左">◀</button><button type="button" data-touch="right" aria-label="向右">▶</button></div>
        <div><button type="button" data-touch="observe" aria-label="观察">看</button><button type="button" data-touch="interact" aria-label="互动">用</button><button type="button" data-touch="jump" aria-label="跳跃">↑</button></div>
      </div>
      <dialog class="forest-opening__pause"><h2>暂停</h2><p>A/D 移动，W 或空格跳跃，E 互动，F 观察。</p><button type="button" data-action="resume">继续</button><button type="button" data-action="checkpoint">返回检查点</button></dialog>
      <section class="forest-opening__recovery" data-recovery="status" hidden aria-live="assertive"><h2>存档需要处理</h2><p data-recovery="message"></p><button type="button" data-recovery="backup">导出原存档</button><button type="button" data-recovery="reset">明确重置</button></section>
    </div>
  </section>`;
}

export function projectForestOpeningView(
  snapshot: PrologueForestOpeningSnapshot,
  assets: RuntimeForestOpeningAssetExport,
): ForestOpeningPublicView {
  const spatial = snapshot.runtime.spatial;
  if (spatial.camera.width !== FOREST_OPENING_VIEWPORT.width || spatial.camera.height !== FOREST_OPENING_VIEWPORT.height) {
    throw new Error("forest opening view requires the authored 640x360 camera");
  }
  const approved = assets.status === "approved";
  const velocity = spatial.player.velocity;
  const animationId: ForestOpeningAnimationId = !spatial.player.grounded
    ? velocity.y < 0 ? "jump" : "fall"
    : Math.abs(velocity.x) >= 5 ? "run"
      : Math.abs(velocity.x) > 0 ? "walk" : "idle";
  const animationStride = animationId === "run" ? 3 : animationId === "walk" ? 6 : 10;
  const obstacle = snapshot.runtime.obstacle;
  const objects: readonly ForestOpeningWorldObjectView[] = Object.freeze([
    freezeObject("stream", "stream.shallow", manifest.obstacle.materialPocketPx,
      obstacle.committedSolutionId ?? "flowing"),
    freezeObject("stone", "stream.stone.a", obstacle.stones.a.bounds, obstacle.stones.a.seated ? "seated" : "loose"),
    freezeObject("stone", "stream.stone.b", obstacle.stones.b.bounds, obstacle.stones.b.seated ? "seated" : "loose"),
    freezeObject("deadwood", "stream.deadwood", obstacle.deadwood.bounds,
      obstacle.deadwood.bridged ? "bridged" : "loose"),
    freezeObject("unknown_glyph", "stream.glyph.unknown", {
      x: manifest.glyphObservation.positionPx[0] - 4,
      y: manifest.glyphObservation.positionPx[1] - 8,
      width: 8,
      height: 8,
    }, snapshot.glyphObserved ? "observed" : "unknown"),
    freezeObject("settlement_perimeter", "settlement.perimeter", manifest.obstacle.settlementEntranceBoundsPx,
      snapshot.mode === "settlement_perimeter" ? "entered" : "ahead"),
  ]);
  const playerCenter = {
    x: spatial.player.position.x + spatial.player.body.width / 2,
    y: spatial.player.position.y + spatial.player.body.height / 2,
  };
  const interactionPrompt = obstacle.committedSolutionId !== null
    ? null
    : promptForNearest(playerCenter, objects);

  const farRole = approved ? "far_parallax_atlas" as const : null;
  const midRole = approved ? "mid_parallax_atlas" as const : null;
  const environmentRole = approved ? "environment_atlas" as const : null;
  const propRole = approved ? "prop_glyph_atlas" as const : null;
  return Object.freeze({
    mode: snapshot.mode,
    tick: snapshot.runtime.tick,
    worldMinute: snapshot.runtime.worldMinute,
    presentation: Object.freeze({
      kind: approved ? "approved_asset_pack" as const : "procedural_candidate" as const,
      approvedAssetPackId: approved ? "forest.opening.vertical-slice.v001" as const : null,
    }),
    camera: Object.freeze({ ...spatial.camera }),
    traveler: Object.freeze({
      position: Object.freeze({ ...spatial.player.position }),
      facing: spatial.camera.facing === "right" ? 1 as const : -1 as const,
      animationId,
      frame: Math.floor(snapshot.runtime.tick / animationStride) % 4,
      visualHeightPx: 20 as const,
      glow: false as const,
    }),
    environment: Object.freeze([
      freezeLayer("far_parallax", 0.15, farRole, []),
      freezeLayer("mid_parallax", 0.42, midRole, []),
      freezeLayer("world_material", 1, environmentRole, objects),
      freezeLayer("foreground", 1.18, propRole, []),
    ]),
    obstacle: Object.freeze({
      solutionId: obstacle.committedSolutionId,
      interactionPrompt,
      visuallyComplete: obstacle.committedSolutionId !== null,
      glyph: Object.freeze({
        wordId: "word.telo" as const,
        observed: snapshot.glyphObserved,
        meaningKnown: false as const,
        pronunciationKnown: false as const,
      }),
    }),
    creatures: Object.freeze([
      freezeCreature("forest.rabbit", snapshot.runtime.ecology.rabbit.position,
        snapshot.runtime.ecology.rabbit.mode, snapshot.runtime.ecology.rabbit.modeTick),
      freezeCreature("forest.wetland_bird", snapshot.runtime.ecology.wetlandBird.position,
        snapshot.runtime.ecology.wetlandBird.mode, snapshot.runtime.ecology.wetlandBird.modeTick),
    ]),
    dialogue: null,
    hud: Object.freeze({
      health: 100 as const,
      maxHealth: 100 as const,
      mp: snapshot.session.mp.currentMp,
      maxMp: snapshot.session.mp.maxMp,
      objective: objective(snapshot),
    }),
  });
}

export function renderForestOpeningView(
  context: CanvasRenderingContext2D,
  view: ForestOpeningPublicView,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  const phase = Math.max(0, Math.min(1, (view.worldMinute - 360) / 180));
  context.fillStyle = blendHex("#122126", "#52604d", phase);
  context.fillRect(0, 0, 640, 360);
  drawForestDepth(context, view.camera, 0.15, "#1c3030", 54, 94);
  drawForestDepth(context, view.camera, 0.42, "#142523", 34, 60);
  context.fillStyle = "#0d1715";
  context.fillRect(0, 300, 640, 60);
  context.fillStyle = "#44513a";
  context.fillRect(0, 296, 640, 4);

  for (const object of view.environment[2]!.objects) drawWorldObject(context, view.camera, object);
  for (const creature of view.creatures) drawCreature(context, view.camera, creature);
  drawTraveler(context, view);
  context.restore();
}

function drawForestDepth(
  context: CanvasRenderingContext2D,
  camera: ForestCameraState,
  parallax: number,
  color: string,
  spacing: number,
  width: number,
): void {
  context.fillStyle = color;
  const offset = -Math.floor((camera.x * parallax) % spacing);
  for (let x = offset - spacing; x < 640 + spacing; x += spacing) {
    const trunkWidth = 6 + Math.abs(Math.floor((x + camera.x) / spacing)) % Math.max(7, width / 5);
    context.fillRect(x, 0, trunkWidth, 304);
    context.fillRect(x - trunkWidth, 52 + (x % 41), trunkWidth * 3, 5);
  }
}

function drawWorldObject(context: CanvasRenderingContext2D, camera: ForestCameraState, object: ForestOpeningWorldObjectView): void {
  const x = Math.round(object.bounds.x - camera.x);
  const y = Math.round(object.bounds.y - camera.y);
  if (x + object.bounds.width < 0 || x > 640 || y + object.bounds.height < 0 || y > 360) return;
  if (object.kind === "stream") {
    context.fillStyle = "#21565d";
    context.fillRect(x, y, object.bounds.width, object.bounds.height);
    context.fillStyle = "#4d9290";
    for (let line = 0; line < object.bounds.width; line += 17) context.fillRect(x + line, y + 4 + line % 5, 9, 1);
  } else if (object.kind === "stone") {
    context.fillStyle = object.state === "seated" ? "#808878" : "#5c665e";
    context.fillRect(x, y, object.bounds.width, object.bounds.height);
    context.fillStyle = "#a2aa91";
    context.fillRect(x + 2, y + 1, Math.max(1, object.bounds.width - 5), 1);
  } else if (object.kind === "deadwood") {
    context.fillStyle = "#5a3823";
    context.fillRect(x, y + 2, object.bounds.width, Math.max(2, object.bounds.height - 4));
    context.fillStyle = "#8b6334";
    context.fillRect(x + 2, y + 3, Math.max(1, object.bounds.width - 5), 1);
  } else if (object.kind === "unknown_glyph") {
    context.fillStyle = "#777d6a";
    context.fillRect(x, y, object.bounds.width, object.bounds.height);
    context.strokeStyle = object.state === "observed" ? "#c7ba7b" : "#989176";
    context.strokeRect(x + 2, y + 2, 3, 3);
  } else {
    context.fillStyle = "#27352d";
    context.fillRect(x, y, 2, object.bounds.height);
  }
}

function drawCreature(context: CanvasRenderingContext2D, camera: ForestCameraState, creature: ForestOpeningCreatureView): void {
  const x = Math.round(creature.position.x - camera.x);
  const y = Math.round(creature.position.y - camera.y);
  context.fillStyle = creature.speciesId === "forest.rabbit" ? "#8e7961" : "#345675";
  context.fillRect(x - 4, y - 5, 8, 5);
  context.fillRect(x + 2, y - 8, 3, 4);
  if (creature.speciesId === "forest.rabbit") context.fillRect(x + 2, y - 12, 1, 5);
  else {
    context.fillStyle = "#bb7939";
    context.fillRect(x + 5, y - 7, 3, 1);
  }
}

function drawTraveler(context: CanvasRenderingContext2D, view: ForestOpeningPublicView): void {
  const x = Math.round(view.traveler.position.x - view.camera.x);
  const y = Math.round(view.traveler.position.y - view.camera.y + 14 - view.traveler.visualHeightPx);
  const stride = view.traveler.animationId === "walk" || view.traveler.animationId === "run"
    ? view.traveler.frame % 2 : 0;
  context.fillStyle = "#081012";
  context.fillRect(x + 1, y, 5, 5);
  context.fillStyle = "#0e5b5b";
  context.fillRect(x, y + 4, 7, 10);
  context.fillStyle = "#caa06c";
  context.fillRect(x + 5, y + 2, 2, 3);
  context.fillStyle = "#121c20";
  context.fillRect(x + 1, y + 14, 2, 5 + stride);
  context.fillRect(x + 5, y + 14, 2, 6 - stride);
}

function freezeObject(
  kind: ForestOpeningWorldObjectView["kind"], id: string, bounds: Aabb, state: string,
): ForestOpeningWorldObjectView {
  return Object.freeze({ kind, id, bounds: Object.freeze({ ...bounds }), state });
}

function freezeLayer(
  layer: ForestOpeningLayerId,
  parallaxRatio: number,
  assetRole: RuntimeForestOpeningAssetRole | null,
  objects: readonly ForestOpeningWorldObjectView[],
): ForestOpeningEnvironmentLayer {
  return Object.freeze({ layer, parallaxRatio, assetRole, objects: Object.freeze([...objects]) });
}

function freezeCreature(
  speciesId: ForestOpeningCreatureView["speciesId"],
  position: Vec2,
  animationId: RabbitMode | WetlandBirdMode,
  modeTick: number,
): ForestOpeningCreatureView {
  return Object.freeze({ speciesId, position: Object.freeze({ ...position }), animationId,
    frame: Math.floor(modeTick / 8) % 4, hostile: false as const });
}

function promptForNearest(center: Vec2, objects: readonly ForestOpeningWorldObjectView[]): string | null {
  const nearby = objects.find(({ kind, bounds }) => kind !== "stream" && kind !== "settlement_perimeter" &&
    Math.hypot(center.x - (bounds.x + bounds.width / 2), center.y - (bounds.y + bounds.height / 2)) <= 52);
  if (!nearby) return null;
  if (nearby.kind === "stone") return "E · 推动松石";
  if (nearby.kind === "deadwood") return "E · 拖动枯木";
  return "F · 观察未知刻痕";
}

function objective(snapshot: PrologueForestOpeningSnapshot): string {
  if (snapshot.mode === "settlement_perimeter") return "已抵达林间聚落边缘";
  if (!snapshot.storyRouteReady) return "沿森林道路前进，并想办法穿过受损溪路";
  return "继续向东，抵达林间聚落";
}

function blendHex(left: string, right: string, ratio: number): string {
  const channel = (value: string, index: number) => Number.parseInt(value.slice(index, index + 2), 16);
  const result = [1, 3, 5].map((index) => Math.round(channel(left, index) * (1 - ratio) + channel(right, index) * ratio));
  return `rgb(${result.join(",")})`;
}

function keepVisible(
  origin: number,
  surfaceSize: number,
  viewportSize: number,
  start: number,
  end: number,
): number {
  const inset = 12;
  let result = origin;
  if (result + start < inset) result = inset - start;
  if (result + end > viewportSize - inset) result = viewportSize - inset - end;
  return Math.max(viewportSize - surfaceSize, Math.min(0, result));
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
