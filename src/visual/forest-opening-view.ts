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
import type {
  ForestOpeningTravelerAction,
  LoadedForestOpeningVisualAssets,
} from "./browser-forest-opening-assets";

export const FOREST_OPENING_VIEWPORT = Object.freeze({ width: 640 as const, height: 360 as const });
const TRAVELER_RUN_ANIMATION_SPEED = 74;
const manifest = readRuntimeForestOpeningManifest(generatedRuntimeArtifact);

export type ForestOpeningAnimationId = ForestOpeningTravelerAction;
export type ForestOpeningLayerId = "far_parallax" | "mid_parallax" | "world_material" | "foreground";
export type ForestOpeningInteractionId =
  | "push_stone" | "drag_deadwood" | "enter_shallow_detour" | "observe_glyph";

export interface ForestOpeningWorldObjectView {
  readonly kind: "stream" | "stone" | "deadwood" | "unknown_glyph" | "settlement_perimeter";
  readonly id: string;
  readonly bounds: Aabb;
  readonly state: string;
  readonly materialPocket: Readonly<{
    width: 128;
    height: 64;
    cells: readonly number[];
  }> | null;
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
    visualHeightPx: 19;
    glow: false;
  }>;
  readonly environment: readonly ForestOpeningEnvironmentLayer[];
  readonly obstacle: Readonly<{
    solutionId: ForestOpeningSolutionId | null;
    interactionId: ForestOpeningInteractionId | null;
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
    ? '<span class="forest-opening__candidate">候选视觉 · 尚未通过素材审批</span>' : "";
  return `<section class="forest-opening">
    <div class="forest-opening__stage">
      <canvas data-surface="game" width="640" height="360" tabindex="0" aria-label="第一章森林开场游戏画面"></canvas>
      <header class="forest-opening__hud" aria-live="polite">
        <div class="forest-opening__meters"><span>HP <output data-hud="health">${view.hud.health}/${view.hud.maxHealth}</output></span><span>MP <output data-hud="mp">${view.hud.mp}/${view.hud.maxMp}</output></span></div>
        <p data-hud="objective">${escapeHtml(view.hud.objective)}</p>
        <output data-hud="prompt">${escapeHtml(view.obstacle.interactionPrompt ?? "")}</output>
        ${candidate}
        <div class="forest-opening__settings"><button type="button" data-action="mute" aria-pressed="false">声音</button><button type="button" data-action="pause" aria-pressed="false">暂停</button></div>
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
  loadedVisuals: LoadedForestOpeningVisualAssets | null = null,
  actionPresentation: "push" | "drag" | "dig" | "observe" | null = null,
): ForestOpeningPublicView {
  const spatial = snapshot.runtime.spatial;
  if (spatial.camera.width !== FOREST_OPENING_VIEWPORT.width || spatial.camera.height !== FOREST_OPENING_VIEWPORT.height) {
    throw new Error("forest opening view requires the authored 640x360 camera");
  }
  const approved = assets.status === "approved" && loadedVisuals?.packId === assets.packId;
  const velocity = spatial.player.velocity;
  const movementAnimation: ForestOpeningAnimationId = !spatial.player.grounded
    ? velocity.y < 0 ? "jump" : "fall"
    : Math.abs(velocity.x) >= TRAVELER_RUN_ANIMATION_SPEED ? "run"
      : Math.abs(velocity.x) >= 0.5 ? "walk" : "idle";
  const animationId = actionPresentation ?? movementAnimation;
  const locomotionAnimation = animationId === "run" || animationId === "walk";
  const animationStride = locomotionAnimation ? 5 : 10;
  const obstacle = snapshot.runtime.obstacle;
  const objects: readonly ForestOpeningWorldObjectView[] = Object.freeze([
    freezeObject("stream", "stream.shallow", manifest.obstacle.materialPocketPx,
      obstacle.committedSolutionId ?? "flowing", obstacle.materialPocket),
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
  const interaction = obstacle.committedSolutionId !== null
    ? snapshot.glyphObserved ? null : promptForNearest(
      playerCenter,
      objects.filter(({ kind }) => kind === "unknown_glyph"),
    )
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
      frame: Math.floor(snapshot.runtime.tick / animationStride) % (locomotionAnimation ? 8 : 4),
      visualHeightPx: 19 as const,
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
      interactionId: interaction?.interactionId ?? null,
      interactionPrompt: interaction?.prompt ?? null,
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
  loadedVisuals: LoadedForestOpeningVisualAssets | null = null,
  renderTerrain?: (context: CanvasRenderingContext2D, camera: ForestCameraState) => void,
  renderTraveler?: (context: CanvasRenderingContext2D, view: ForestOpeningPublicView) => void,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  const phase = Math.max(0, Math.min(1, (view.worldMinute - 360) / 180));
  const approved = view.presentation.kind === "approved_asset_pack" &&
    loadedVisuals?.packId === view.presentation.approvedAssetPackId;
  if (approved) {
    drawApprovedParallax(context, loadedVisuals.images.far_parallax_atlas, view.camera, 0.15);
    drawApprovedParallax(context, loadedVisuals.images.mid_parallax_atlas, view.camera, 0.42);
    context.drawImage(loadedVisuals.images.environment_atlas, 0, 0, 256, 256, 0, 104, 640, 256);
    for (const object of view.environment[2]!.objects) {
      drawApprovedWorldObject(context, view.camera, object, loadedVisuals.images.prop_glyph_atlas);
    }
    for (const creature of view.creatures) {
      drawApprovedCreature(context, view.camera, creature, loadedVisuals.images.creature_atlas);
    }
    drawApprovedTraveler(context, view, loadedVisuals);
    applyApprovedTimePalette(context, loadedVisuals, view.worldMinute);
  } else {
    context.fillStyle = blendHex("#122126", "#52604d", phase);
    context.fillRect(0, 0, 640, 360);
    drawForestDepth(context, view.camera, 0.15, "#1c3030", 54, 94);
    drawForestDepth(context, view.camera, 0.42, "#142523", 34, 60);
    renderTerrain?.(context, view.camera);
    for (const object of view.environment[2]!.objects) drawWorldObject(context, view.camera, object);
    for (const creature of view.creatures) drawCreature(context, view.camera, creature);
    if (renderTraveler) renderTraveler(context, view);
    else drawTraveler(context, view);
  }
  context.restore();
}

function applyApprovedTimePalette(
  context: CanvasRenderingContext2D,
  assets: LoadedForestOpeningVisualAssets,
  worldMinute: number,
): void {
  const palette = interpolatePalette(assets, worldMinute);
  context.save();
  context.globalCompositeOperation = "multiply";
  context.globalAlpha = 0.24;
  context.fillStyle = `rgb(${palette.multiply.map((value) => Math.round(value * 255)).join(",")})`;
  context.fillRect(0, 0, 640, 360);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 0.08;
  context.fillStyle = `rgb(${palette.ambient.map((value) => Math.round(value)).join(",")})`;
  context.fillRect(0, 0, 640, 360);
  context.restore();
}

function interpolatePalette(
  assets: LoadedForestOpeningVisualAssets,
  worldMinute: number,
): Readonly<{ multiply: readonly number[]; ambient: readonly number[] }> {
  const states = assets.timePalette;
  if (states.length !== 4) throw new Error("forest opening approved time palette is incomplete");
  const anchors = [360, 720, 1_080, 1_320, 1_800] as const;
  const normalized = ((worldMinute % 1_440) + 1_440) % 1_440;
  const minute = normalized < 360 ? normalized + 1_440 : normalized;
  let index = 0;
  while (index < anchors.length - 2 && minute > anchors[index + 1]!) index += 1;
  const left = states[index % 4]!;
  const right = states[(index + 1) % 4]!;
  const ratio = (minute - anchors[index]!) / (anchors[index + 1]! - anchors[index]!);
  return Object.freeze({
    multiply: Object.freeze(left.multiply.map((value, channel) =>
      value + (right.multiply[channel]! - value) * ratio)),
    ambient: Object.freeze(left.ambient.map((value, channel) =>
      value + (right.ambient[channel]! - value) * ratio)),
  });
}

function drawApprovedParallax(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  camera: ForestCameraState,
  ratio: number,
): void {
  const offset = -Math.floor((camera.x * ratio) % 640);
  context.drawImage(image, offset, 0, 640, 360);
  context.drawImage(image, offset + 640, 0, 640, 360);
}

function drawApprovedWorldObject(
  context: CanvasRenderingContext2D,
  camera: ForestCameraState,
  object: ForestOpeningWorldObjectView,
  atlas: CanvasImageSource,
): void {
  const x = Math.round(object.bounds.x - camera.x);
  const y = Math.round(object.bounds.y - camera.y);
  if (x + object.bounds.width < 0 || x > 640 || y + object.bounds.height < 0 || y > 360) return;
  if (object.kind === "stone") context.drawImage(atlas, 0, 0, 28, 32, x, y, object.bounds.width, object.bounds.height);
  else if (object.kind === "deadwood") context.drawImage(atlas, 0, 32, 64, 32, x, y, object.bounds.width, object.bounds.height);
  else if (object.kind === "unknown_glyph") context.drawImage(atlas, 208, 88, 48, 40, x - 12, y - 12, 32, 32);
  else drawWorldObject(context, camera, object);
}

function drawApprovedCreature(
  context: CanvasRenderingContext2D,
  camera: ForestCameraState,
  creature: ForestOpeningCreatureView,
  atlas: CanvasImageSource,
): void {
  const x = Math.round(creature.position.x - camera.x);
  const y = Math.round(creature.position.y - camera.y);
  const sourceX = creatureCellIndex(creature) * 25;
  const sourceY = creature.speciesId === "forest.rabbit" ? 0 : 32;
  context.drawImage(atlas, sourceX, sourceY, 25, 32, x - 10, y - 24, 25, 32);
}

function drawApprovedTraveler(
  context: CanvasRenderingContext2D,
  view: ForestOpeningPublicView,
  assets: LoadedForestOpeningVisualAssets,
): void {
  const animation = assets.travelerAnimations[view.traveler.animationId];
  const sourceX = (view.traveler.frame % animation.frames) * animation.frameWidthPx;
  const sourceY = animation.footAnchorYPx - animation.frameHeightPx;
  const x = Math.round(view.traveler.position.x - view.camera.x - (animation.frameWidthPx - 8) / 2);
  const y = Math.round(view.traveler.position.y - view.camera.y - 6);
  context.drawImage(assets.images.traveler_atlas, sourceX, sourceY,
    animation.frameWidthPx, animation.frameHeightPx, x, y,
    animation.frameWidthPx, animation.frameHeightPx);
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
    drawMaterialPocket(context, x, y, object);
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
  const y = Math.round(view.traveler.position.y - view.camera.y - 5);
  context.fillStyle = "#2f6970";
  context.fillRect(x, y, 8, 19);
}

function freezeObject(
  kind: ForestOpeningWorldObjectView["kind"], id: string, bounds: Aabb, state: string,
  materialPocket: ForestOpeningWorldObjectView["materialPocket"] = null,
): ForestOpeningWorldObjectView {
  return Object.freeze({ kind, id, bounds: Object.freeze({ ...bounds }), state,
    materialPocket: materialPocket === null ? null : Object.freeze({
      width: materialPocket.width,
      height: materialPocket.height,
      cells: Object.freeze([...materialPocket.cells]),
    }) });
}

function creatureCellIndex(creature: ForestOpeningCreatureView): number {
  if (creature.speciesId === "forest.rabbit") {
    return creature.animationId === "foraging" ? 1
      : creature.animationId === "alert" ? 2
        : creature.animationId === "fleeing" ? 3 : 4;
  }
  return creature.animationId === "wading" ? 2
    : creature.animationId === "alert" ? 3 : 4;
}

const MATERIAL_COLORS = Object.freeze([
  "transparent", "#21565d", "#6f5b3e", "#514734", "#817157", "#6f7770", "#5a3823", "#202923",
] as const);

function drawMaterialPocket(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  object: ForestOpeningWorldObjectView,
): void {
  const pocket = object.materialPocket;
  if (pocket === null) return;
  for (let row = 0; row < pocket.height; row += 1) {
    let start = 0;
    while (start < pocket.width) {
      const material = pocket.cells[row * pocket.width + start] ?? 0;
      let end = start + 1;
      while (end < pocket.width && pocket.cells[row * pocket.width + end] === material) end += 1;
      if (material !== 0) {
        context.fillStyle = MATERIAL_COLORS[material] ?? MATERIAL_COLORS[7];
        context.fillRect(x + start, y + row, end - start, 1);
      }
      start = end;
    }
  }
  if (object.state === "shallow_detour") {
    context.fillStyle = "#9a875f";
    for (let step = 0; step < pocket.width; step += 8) context.fillRect(x + step, y + 43 + step % 3, 5, 2);
  }
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

function promptForNearest(
  center: Vec2,
  objects: readonly ForestOpeningWorldObjectView[],
): Readonly<{ interactionId: ForestOpeningInteractionId; prompt: string }> | null {
  const nearbyObjects = objects
    .filter(({ kind }) => kind !== "settlement_perimeter")
    .map((object) => ({ object, distance: gapToBounds(center, object.bounds) }))
    .filter(({ distance }) => distance <= manifest.obstacle.interactionRadiusPx)
    .sort((left, right) => left.distance - right.distance);
  const stream = nearbyObjects.find(({ object }) => object.kind === "stream");
  const nearby = (nearbyObjects.find(({ object, distance }) =>
    object.kind !== "stream" && (stream === undefined || distance <= manifest.obstacle.interactionRadiusPx / 2)) ??
    stream ?? nearbyObjects[0])?.object;
  if (!nearby) return null;
  if (nearby.kind === "stream") return Object.freeze({ interactionId: "enter_shallow_detour", prompt: "E · 涉水绕行" });
  if (nearby.kind === "stone") return Object.freeze({ interactionId: "push_stone", prompt: "E · 推动松石" });
  if (nearby.kind === "deadwood") return Object.freeze({ interactionId: "drag_deadwood", prompt: "E · 拖动枯木" });
  return Object.freeze({ interactionId: "observe_glyph", prompt: "F · 观察未知刻痕" });
}

function gapToBounds(point: Vec2, bounds: Aabb): number {
  const dx = Math.max(bounds.x - point.x, point.x - (bounds.x + bounds.width), 0);
  const dy = Math.max(bounds.y - point.y, point.y - (bounds.y + bounds.height), 0);
  return Math.hypot(dx, dy);
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
