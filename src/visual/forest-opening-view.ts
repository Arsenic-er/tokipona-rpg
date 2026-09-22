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
import { forestCreekToolBounds } from '../world/forest-opening-creek';
import type { ForestBodyShape } from '../world/forest-body-shape';
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
  readonly interactionBounds?: Aabb;
  readonly state: string;
  readonly bodyShape?: ForestBodyShape;
  readonly materialPocket: Readonly<{
    sharedTerrain?: true;
    integrated?: true;
    soilOpened?: boolean;
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
  surface: Readonly<{ width: number; height: number }> = FOREST_OPENING_VIEWPORT,
): ForestOpeningPresentationCrop {
  if (![viewport.width, viewport.height, traveler.x, traveler.y, traveler.width, traveler.height, surface.width, surface.height]
    .every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 ||
    traveler.width <= 0 || traveler.height <= 0 || surface.width <= 0 || surface.height <= 0) {
    throw new Error("forest opening presentation bounds are invalid");
  }
  const scale = Math.max(viewport.width / surface.width, viewport.height / surface.height);
  const width = surface.width * scale;
  const height = surface.height * scale;
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
        <p data-hud="objective" hidden>${escapeHtml(view.hud.objective)}</p>
        <output data-hud="prompt">${escapeHtml(view.obstacle.interactionPrompt ?? "")}</output>
        ${candidate}
        <div class="forest-opening__settings"><button type="button" data-action="mute" aria-pressed="false">声音</button><button type="button" data-action="pause" aria-pressed="false">暂停</button></div>
      </header>
      <div class="forest-opening__touch" aria-label="触控操作">
        <div><button type="button" data-touch="left" aria-label="向左">◀</button><button type="button" data-touch="right" aria-label="向右">▶</button></div>
        <div><button type="button" data-touch="observe" aria-label="观察">看</button><button type="button" data-touch="interact" aria-label="互动">用</button><button type="button" data-touch="jump" aria-label="跳跃">↑</button></div>
      </div>
      <dialog class="forest-opening__pause"><h2>暂停</h2><p>A/D 移动，W 或空格跳跃，E 互动，F 观察。滚轮上推拉近、下拉拉远，鼠标轻微带动视野；游戏中按 0 恢复默认镜头。</p><button type="button" data-action="resume">继续</button><button type="button" data-action="checkpoint">返回检查点</button></dialog>
      <section class="forest-opening__recovery" data-recovery="status" hidden aria-live="assertive"><h2>存档需要处理</h2><p data-recovery="message"></p><button type="button" data-recovery="backup">导出原存档</button><button type="button" data-recovery="reset">明确重置</button></section>
    </div>
  </section>`;
}

export function projectForestOpeningView(
  snapshot: PrologueForestOpeningSnapshot,
  assets: RuntimeForestOpeningAssetExport,
  loadedVisuals: LoadedForestOpeningVisualAssets | null = null,
  actionPresentation: "push" | "drag" | "dig" | "observe" | null = null,
  locomotionFrame = 0,
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
  const obstacle = snapshot.runtime.obstacle;
  const objects: readonly ForestOpeningWorldObjectView[] = Object.freeze([
    freezeObject("stream", "stream.shallow", manifest.obstacle.materialPocketPx,
      obstacle.materialPocket.soilOpened ? "excavated" : obstacle.committedSolutionId ?? "flowing", obstacle.materialPocket),
    freezeObject("stone", "stream.stone.a", obstacle.stones.a.bounds, obstacle.stones.a.seated ? "seated" : "loose", null, obstacle.materialPocket.bodyShape),
    freezeObject("stone", "stream.stone.b", obstacle.stones.b.bounds, obstacle.stones.b.seated ? "seated" : "loose", null, obstacle.materialPocket.bodyShape),
    freezeObject("deadwood", "stream.deadwood", obstacle.deadwood.bounds,
      obstacle.deadwood.bridged ? "bridged" : "loose", null, obstacle.materialPocket.bodyShape),
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
  // The glyph drawing extends above its interaction point. Do not offer F one
  // pixel early during a jump when the coordinator would reject the observation.
  const interactableObjects = objects.filter(({ kind }) => kind !== "unknown_glyph" ||
    gapToBounds({ x: manifest.glyphObservation.positionPx[0], y: manifest.glyphObservation.positionPx[1] },
      { ...spatial.player.position, ...spatial.player.body }) <= manifest.obstacle.interactionRadiusPx);
  const integrated = obstacle.materialPocket.integrated === true;
  const usableObjects = interactableObjects.filter(object =>
    object.kind !== "unknown_glyph" || !snapshot.glyphObserved).filter(object =>
    object.kind !== "stream" || !object.materialPocket?.soilOpened).filter(object =>
    integrated || object.state !== "seated" && object.state !== "bridged");
  const interaction = obstacle.committedSolutionId !== null && !integrated
    ? snapshot.glyphObserved ? null : promptForNearest(
      playerCenter,
      interactableObjects.filter(({ kind }) => kind === "unknown_glyph"),
    )
    : promptForNearest(playerCenter, usableObjects);

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
      frame: locomotionAnimation ? locomotionFrame % 8 : Math.floor(snapshot.runtime.tick / 10) % 4,
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


function freezeObject(
  kind: ForestOpeningWorldObjectView["kind"], id: string, bounds: Aabb, state: string,
  materialPocket: ForestOpeningWorldObjectView["materialPocket"] = null,
  bodyShape?: ForestBodyShape,
): ForestOpeningWorldObjectView {
  return Object.freeze({ kind, id, bounds: Object.freeze({ ...bounds }), state,
    ...(bodyShape ? {bodyShape} : {}),
    ...(kind === 'stream' && materialPocket?.sharedTerrain ? { interactionBounds: forestCreekToolBounds(bounds) } : {}),
    materialPocket: materialPocket === null ? null : Object.freeze({
      width: materialPocket.width,
      height: materialPocket.height,
      cells: Object.isFrozen(materialPocket.cells) ? materialPocket.cells : Object.freeze([...materialPocket.cells]),
      ...(materialPocket.sharedTerrain ? { sharedTerrain: true as const } : {}),
      ...(materialPocket.integrated ? { integrated: true as const, soilOpened: materialPocket.soilOpened } : {}),
    }) });
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
    .map((object) => ({ object, distance: gapToBounds(center, object.interactionBounds ?? object.bounds) }))
    .filter(({ distance }) => distance <= manifest.obstacle.interactionRadiusPx)
    .sort((left, right) => left.distance - right.distance);
  const stream = nearbyObjects.find(({ object }) => object.kind === "stream");
  const nearby = stream?.object.materialPocket?.sharedTerrain ? nearbyObjects[0]?.object : (nearbyObjects.find(({ object, distance }) =>
    object.kind !== "stream" && (stream === undefined || distance <= manifest.obstacle.interactionRadiusPx / 2)) ??
    stream ?? nearbyObjects[0])?.object;
  if (!nearby) return null;
  if (nearby.kind === "stream") return Object.freeze({ interactionId: "enter_shallow_detour",
    prompt: nearby.materialPocket?.sharedTerrain ? 'E · 疏通松土' : 'E · 涉水绕行' });
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
