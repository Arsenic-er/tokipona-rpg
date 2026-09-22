import type { ForestCameraState } from "../runtime/forest-camera";
import type { LoadedForestOpeningVisualAssets } from "./browser-forest-opening-assets";
import type { ForestOpeningPublicView, ForestOpeningWorldObjectView, ForestOpeningCreatureView } from "./forest-opening-view";
import { forestObjectMaterialRuns } from "./forest-material-texture";

export function renderForestOpeningView(
  context: CanvasRenderingContext2D,
  view: ForestOpeningPublicView,
  loadedVisuals: LoadedForestOpeningVisualAssets | null = null,
  renderTerrain?: (context: CanvasRenderingContext2D, camera: ForestCameraState) => void,
  renderTraveler?: (context: CanvasRenderingContext2D, view: ForestOpeningPublicView) => void,
  renderBackdrop?: (context: CanvasRenderingContext2D, camera: ForestCameraState) => void,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  const approved = view.presentation.kind === "approved_asset_pack" &&
    loadedVisuals?.packId === view.presentation.approvedAssetPackId;
  if (approved) {
    drawApprovedParallax(context, loadedVisuals.images.far_parallax_atlas, view.camera, 0.15);
    drawApprovedParallax(context, loadedVisuals.images.mid_parallax_atlas, view.camera, 0.42);
    context.drawImage(loadedVisuals.images.environment_atlas, 0, 0, 256, 256, 0, view.camera.height - 256, view.camera.width, 256);
    renderTerrain?.(context, view.camera);
    for (const object of view.environment[2]!.objects) {
      drawApprovedWorldObject(context, view.camera, object, loadedVisuals.images.prop_glyph_atlas);
    }
    for (const creature of view.creatures) {
      drawApprovedCreature(context, view.camera, creature, loadedVisuals.images.creature_atlas);
    }
    drawApprovedTraveler(context, view, loadedVisuals);
    applyApprovedTimePalette(context, loadedVisuals, view.worldMinute, view.camera);
  } else {
    if (renderBackdrop) renderBackdrop(context, view.camera);
    else {
      context.fillStyle = "#253b36";
      context.fillRect(0, 0, view.camera.width, view.camera.height);
    }
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
  camera: ForestCameraState,
): void {
  const palette = interpolatePalette(assets, worldMinute);
  context.save();
  context.globalCompositeOperation = "multiply";
  context.globalAlpha = 0.24;
  context.fillStyle = `rgb(${palette.multiply.map((value) => Math.round(value * 255)).join(",")})`;
  context.fillRect(0, 0, camera.width, camera.height);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 0.08;
  context.fillStyle = `rgb(${palette.ambient.map((value) => Math.round(value)).join(",")})`;
  context.fillRect(0, 0, camera.width, camera.height);
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
  for (let x = offset; x < camera.width; x += 640) context.drawImage(image, x, 0, 640, camera.height);
}

function drawApprovedWorldObject(
  context: CanvasRenderingContext2D,
  camera: ForestCameraState,
  object: ForestOpeningWorldObjectView,
  atlas: CanvasImageSource,
): void {
  if (object.bodyShape === 'chipped-v1' && (object.kind === 'stone' || object.kind === 'deadwood')) {
    drawWorldObject(context, camera, object);
    return;
  }
  const x = Math.round(object.bounds.x - camera.x);
  const y = Math.round(object.bounds.y - camera.y);
  if (x + object.bounds.width < 0 || x > camera.width || y + object.bounds.height < 0 || y > camera.height) return;
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

function drawWorldObject(context: CanvasRenderingContext2D, camera: ForestCameraState, object: ForestOpeningWorldObjectView): void {
  const x = Math.round(object.bounds.x - camera.x);
  const y = Math.round(object.bounds.y - camera.y);
  if (x + object.bounds.width < 0 || x > camera.width || y + object.bounds.height < 0 || y > camera.height) return;
  if (object.kind === "stream") {
    drawMaterialPocket(context, x, y, object);
  } else if (object.kind === "stone" || object.kind === "deadwood") {
    const variant = object.id.endsWith(".b") ? 1 : 0;
    const shaped = object.bodyShape === 'chipped-v1';
    // Match the terrain raster origin even at fractional body/camera positions.
    const bodyX = shaped ? Math.floor(object.bounds.x) - Math.round(camera.x) : x;
    const bodyY = shaped ? Math.floor(object.bounds.y) - Math.round(camera.y) : y;
    for (const run of forestObjectMaterialRuns(object.kind, object.bounds.width, object.bounds.height, variant,
      object.bodyShape, shaped ? object.bounds.x : 0, shaped ? object.bounds.y : 0)) {
      context.fillStyle = run.color;
      context.fillRect(bodyX + run.x, bodyY + run.y, run.width, 1);
    }
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
  // Dynamic creek pixels are already drawn by the shared terrain renderer.
  if (pocket.sharedTerrain) return;
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
