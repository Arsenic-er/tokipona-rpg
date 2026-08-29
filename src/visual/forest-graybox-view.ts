import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import type { ForestCameraState } from "../runtime/forest-camera";
import { FOREST_MATERIAL, type ForestMaterialChunk } from "../world/forest-chunk-stream";
import { generateForestRegion, type ForestRectPx, type ForestRegion } from "../world/forest-region-generator";
import type { ForestGrayboxControllerSnapshot } from "./forest-graybox-controller";

export const FOREST_GRAYBOX_VIEWPORT = Object.freeze({ width: 640, height: 360 }) as Readonly<{
  width: 640;
  height: 360;
}>;

type ForestGrayboxLayer =
  | "regional-field"
  | "edge-silhouette"
  | "structural-mass"
  | "streamed-material"
  | "water-and-landmark"
  | "traveler";

interface BaseCommand {
  readonly layer: ForestGrayboxLayer;
  readonly kind: string;
}

export interface ForestGrayboxRectCommand extends BaseCommand {
  readonly kind: "rect";
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

export interface ForestGrayboxPolylineCommand extends BaseCommand {
  readonly kind: "polyline";
  readonly role: "water-course" | "support-cable";
  readonly points: readonly Readonly<{ x: number; y: number }>[];
  readonly color: string;
  readonly width: number;
}

export interface ForestGrayboxArcCommand extends BaseCommand {
  readonly kind: "arc";
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly startRadians: number;
  readonly endRadians: number;
  readonly color: string;
  readonly width: number;
}

export interface ForestGrayboxMaterialPixelsCommand extends BaseCommand {
  readonly kind: "material-pixels";
  readonly width: 640;
  readonly height: 360;
  readonly pixels: Uint8ClampedArray;
}

export interface ForestGrayboxTravelerCommand extends BaseCommand {
  readonly kind: "traveler";
  readonly role: "provisional-traveler";
  readonly x: number;
  readonly y: number;
  readonly width: 8;
  readonly height: 18;
  readonly facing: "left" | "right";
}

export type ForestGrayboxRenderCommand =
  | ForestGrayboxRectCommand
  | ForestGrayboxPolylineCommand
  | ForestGrayboxArcCommand
  | ForestGrayboxMaterialPixelsCommand
  | ForestGrayboxTravelerCommand;

export interface ForestGrayboxMeadowProjection {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: 16;
  readonly isLevel: true;
}

export interface ForestGrayboxLandmarkProjection {
  readonly landmarkId: string;
  readonly worldBounds: ForestRectPx;
  readonly totalComponentCount: number;
  readonly visibleComponentIds: readonly string[];
  readonly fullyVisible: boolean;
}

export interface ForestGrayboxTravelerProjection {
  readonly worldPosition: Readonly<{ x: number; y: number }>;
  readonly visualBounds: Readonly<{ x: number; y: number; width: 8; height: 18 }>;
  readonly provisional: true;
  readonly glow: false;
}

export interface ForestGrayboxHud {
  readonly districtLabel: string;
  readonly movementHelp: "A/D 或 ←/→ 移动 · W/↑/空格 跳跃";
  readonly seed: string;
  readonly tick: number;
  readonly auditResetAction: "返回检查点";
}

export interface ForestGrayboxViewProjection {
  readonly viewport: typeof FOREST_GRAYBOX_VIEWPORT;
  readonly districtId: string;
  readonly edgeContinuations: readonly ("left" | "right" | "top" | "bottom")[];
  readonly meadow: ForestGrayboxMeadowProjection | null;
  readonly landmarks: readonly ForestGrayboxLandmarkProjection[];
  readonly traveler: ForestGrayboxTravelerProjection;
  readonly hud: ForestGrayboxHud;
  readonly commands: readonly ForestGrayboxRenderCommand[];
}

interface LandmarkComponent {
  readonly componentId: string;
  readonly boundsPx: ForestRectPx;
  readonly command: ForestGrayboxRectCommand | ForestGrayboxArcCommand | ForestGrayboxPolylineCommand;
}

const manifest = readRuntimeForestSpatialManifest(generatedRuntimeArtifact);
const materialSurfaces = new WeakMap<object, Readonly<{
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}>>();
let cachedRegion: Readonly<{ seed: string; region: ForestRegion }> | null = null;

const DISTRICT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "forest.arrival": "森林入口",
  "forest.stream": "浅溪坡地",
  "forest.settlement": "林间聚落",
  "forest.hermit_branch": "隐士支路",
  "forest.waterwheel": "水轮峡谷",
  "forest.cistern": "上层蓄水池",
  "forest.den_bypass": "兽穴绕行道",
  "forest.return_channel": "回流水道",
  "forest.underground_node": "地下秩序节点",
  "forest.safe_range": "封闭靶场",
  "forest.old_mine": "旧矿入口",
});

const MATERIAL_COLORS: Readonly<Record<number, readonly [number, number, number, number]>> = Object.freeze({
  [FOREST_MATERIAL.air]: [0, 0, 0, 0] as const,
  [FOREST_MATERIAL.protected_mass]: [25, 31, 29, 255] as const,
  [FOREST_MATERIAL.soil]: [63, 61, 40, 255] as const,
  [FOREST_MATERIAL.wet_soil]: [38, 52, 47, 255] as const,
  [FOREST_MATERIAL.stone]: [31, 39, 37, 255] as const,
  [FOREST_MATERIAL.wood]: [70, 55, 36, 255] as const,
  [FOREST_MATERIAL.metal]: [80, 87, 77, 255] as const,
  [FOREST_MATERIAL.water]: [35, 82, 88, 214] as const,
  [FOREST_MATERIAL.vegetation]: [73, 91, 61, 255] as const,
});

export function projectForestGrayboxView(
  snapshot: ForestGrayboxControllerSnapshot,
): ForestGrayboxViewProjection {
  const camera = snapshot.runtime.camera;
  if (camera.width !== FOREST_GRAYBOX_VIEWPORT.width || camera.height !== FOREST_GRAYBOX_VIEWPORT.height) {
    throw new Error("forest graybox view requires the fixed 640×360 camera");
  }
  const region = regionFor(snapshot.runtime.seed);
  if (region.topologyDigest !== snapshot.runtime.topologyDigest) {
    throw new Error("forest graybox view topology does not match the controller snapshot");
  }

  const commands: ForestGrayboxRenderCommand[] = [regionalField(snapshot.location.districtId)];
  commands.push(...edgeSilhouettes(snapshot.location.districtId));
  commands.push(...structuralMassCommands(region, camera));

  const meadow = projectMeadow(camera);
  if (meadow) {
    commands.push(Object.freeze({
      layer: "structural-mass" as const,
      kind: "rect" as const,
      role: "level-meadow-band",
      ...meadow,
      color: "#797047",
    }));
  }

  commands.push(Object.freeze({
    layer: "streamed-material" as const,
    kind: "material-pixels" as const,
    width: FOREST_GRAYBOX_VIEWPORT.width,
    height: FOREST_GRAYBOX_VIEWPORT.height,
    pixels: rasterizeMaterialPixels(snapshot.streamedChunks, camera),
  }));
  commands.push(...waterCourseCommands(camera));

  const landmarkProjection = projectLandmark(camera);
  commands.push(...landmarkProjection.commands);

  const traveler = projectTraveler(snapshot);
  commands.push(Object.freeze({
    layer: "traveler" as const,
    kind: "traveler" as const,
    role: "provisional-traveler" as const,
    x: traveler.visualBounds.x,
    y: traveler.visualBounds.y,
    width: traveler.visualBounds.width,
    height: traveler.visualBounds.height,
    facing: camera.facing,
  }));

  return Object.freeze({
    viewport: FOREST_GRAYBOX_VIEWPORT,
    districtId: snapshot.location.districtId,
    edgeContinuations: edgeContinuations(snapshot.location.districtId),
    meadow,
    landmarks: Object.freeze([landmarkProjection.projection]),
    traveler,
    hud: Object.freeze({
      districtLabel: DISTRICT_LABELS[snapshot.location.districtId] ?? snapshot.location.districtId,
      movementHelp: "A/D 或 ←/→ 移动 · W/↑/空格 跳跃" as const,
      seed: snapshot.runtime.seed,
      tick: snapshot.runtime.tick,
      auditResetAction: "返回检查点" as const,
    }),
    commands: Object.freeze(commands),
  });
}

export function renderForestGrayboxView(
  context: CanvasRenderingContext2D,
  view: ForestGrayboxViewProjection,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  for (const command of view.commands) {
    if (command.kind === "material-pixels") {
      uploadMaterialPixels(context, command);
    } else if (command.kind === "rect") {
      context.fillStyle = command.color;
      context.fillRect(command.x, command.y, command.width, command.height);
    } else if (command.kind === "polyline") {
      if (command.points.length < 2) continue;
      context.beginPath();
      context.moveTo(command.points[0]!.x, command.points[0]!.y);
      for (const point of command.points.slice(1)) context.lineTo(point.x, point.y);
      context.strokeStyle = command.color;
      context.lineWidth = command.width;
      context.stroke();
    } else if (command.kind === "arc") {
      context.beginPath();
      context.arc(command.x, command.y, command.radius, command.startRadians, command.endRadians);
      context.strokeStyle = command.color;
      context.lineWidth = command.width;
      context.stroke();
    } else if (command.kind === "traveler") {
      drawTraveler(context, command);
    }
  }
  context.restore();
}

export function createForestGrayboxPageMarkup(
  view: ForestGrayboxViewProjection,
  regionId: string,
): string {
  return `
    <section class="forest-graybox" aria-label="第一章连续森林灰盒" data-region-id="${attribute(regionId)}" data-district-id="${attribute(view.districtId)}">
      <div class="forest-graybox__stage">
        <canvas width="${view.viewport.width}" height="${view.viewport.height}" tabindex="0" aria-label="可操作的连续森林；方向键或 WASD 移动，空格跳跃"></canvas>
        <div class="forest-graybox__hud" aria-label="森林灰盒状态">
          <p class="forest-graybox__district" data-hud="district">${text(view.hud.districtLabel)}</p>
          <p class="forest-graybox__help" data-hud="movement-help">${text(view.hud.movementHelp)}</p>
          <p class="forest-graybox__runtime"><span>seed <output data-hud="seed">${text(view.hud.seed)}</output></span><span>tick <output data-hud="tick">${view.hud.tick}</output></span></p>
          <button type="button" data-action="reset" aria-label="返回最近的灰盒检查点">${text(view.hud.auditResetAction)}</button>
        </div>
        <div class="forest-graybox__touch" aria-label="触控移动">
          <div>
            <button type="button" data-touch="left" aria-label="向左移动">←</button>
            <button type="button" data-touch="right" aria-label="向右移动">→</button>
          </div>
          <button type="button" data-touch="jump" aria-label="跳跃">↑</button>
        </div>
      </div>
    </section>
  `;
}

function regionFor(seed: string): ForestRegion {
  if (cachedRegion?.seed === seed) return cachedRegion.region;
  const region = generateForestRegion(manifest, seed);
  cachedRegion = Object.freeze({ seed, region });
  return region;
}

function regionalField(districtId: string): ForestGrayboxRectCommand {
  const color = districtId === "forest.arrival" || districtId === "forest.settlement"
    ? "#0a1311"
    : districtId === "forest.waterwheel" || districtId === "forest.den_bypass"
      ? "#070e0f"
      : "#09110f";
  return Object.freeze({
    layer: "regional-field",
    kind: "rect",
    role: "regional-darkness",
    x: 0,
    y: 0,
    width: FOREST_GRAYBOX_VIEWPORT.width,
    height: FOREST_GRAYBOX_VIEWPORT.height,
    color,
  });
}

function edgeContinuations(
  districtId: string,
): readonly ("left" | "right" | "top" | "bottom")[] {
  return Object.freeze(
    districtId === "forest.arrival" || districtId === "forest.settlement" || districtId === "forest.stream"
      ? ["left", "right", "bottom"] as const
      : ["left", "right", "top", "bottom"] as const,
  );
}

function edgeSilhouettes(districtId: string): readonly ForestGrayboxRectCommand[] {
  const commands: ForestGrayboxRectCommand[] = [
    Object.freeze({
      layer: "edge-silhouette", kind: "rect", role: "ground-depth",
      x: -32, y: 302, width: 704, height: 90, color: "#0d1815",
    }),
    Object.freeze({
      layer: "edge-silhouette", kind: "rect", role: "left-rock-cut",
      x: -22, y: 224, width: 54, height: 168, color: "#101a17",
    }),
    Object.freeze({
      layer: "edge-silhouette", kind: "rect", role: "right-root-cut",
      x: 620, y: 176, width: 46, height: 216, color: "#111d18",
    }),
  ];
  if (!(districtId === "forest.arrival" || districtId === "forest.settlement" || districtId === "forest.stream")) {
    commands.push(Object.freeze({
      layer: "edge-silhouette", kind: "rect", role: "overhead-root-cut",
      x: -24, y: -18, width: 688, height: 44, color: "#0f1917",
    }));
  }
  return Object.freeze(commands);
}

function structuralMassCommands(
  region: ForestRegion,
  camera: ForestCameraState,
): readonly ForestGrayboxRectCommand[] {
  const commands: ForestGrayboxRectCommand[] = [];
  for (const zone of region.protectedZones) {
    if (zone.kind !== "settlement_structure" && zone.kind !== "waterwheel_protected_mass") continue;
    const clipped = clipToCamera(zone.boundsPx, camera);
    if (!clipped) continue;
    commands.push(Object.freeze({
      layer: "structural-mass",
      kind: "rect",
      role: zone.kind,
      ...clipped,
      color: zone.kind === "settlement_structure" ? "#28281d" : "#171d1b",
    }));
  }
  return Object.freeze(commands);
}

function projectMeadow(camera: ForestCameraState): ForestGrayboxMeadowProjection | null {
  const band = manifest.meadowGroundBandPx;
  const clipped = clipToCamera({
    x: band.left,
    y: band.y,
    width: band.right - band.left,
    height: 16,
  }, camera);
  if (!clipped) return null;
  return Object.freeze({ ...clipped, height: 16 as const, isLevel: true as const });
}

function rasterizeMaterialPixels(
  chunks: readonly ForestMaterialChunk[],
  camera: ForestCameraState,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(FOREST_GRAYBOX_VIEWPORT.width * FOREST_GRAYBOX_VIEWPORT.height * 4);
  for (const chunk of chunks) {
    const originX = chunk.chunkX * 16 - camera.x;
    const originY = chunk.chunkY * 16 - camera.y;
    for (let localY = 0; localY < 16; localY += 1) {
      const screenY = originY + localY;
      if (screenY < 0 || screenY >= FOREST_GRAYBOX_VIEWPORT.height) continue;
      for (let localX = 0; localX < 16; localX += 1) {
        const screenX = originX + localX;
        if (screenX < 0 || screenX >= FOREST_GRAYBOX_VIEWPORT.width) continue;
        const material = chunk.materials[localY * 16 + localX]!;
        const color = MATERIAL_COLORS[material];
        if (!color || color[3] === 0) continue;
        const offset = (screenY * FOREST_GRAYBOX_VIEWPORT.width + screenX) * 4;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = color[3];
      }
    }
  }
  return pixels;
}

function waterCourseCommands(camera: ForestCameraState): readonly ForestGrayboxPolylineCommand[] {
  const commands: ForestGrayboxPolylineCommand[] = [];
  for (let index = 0; index < manifest.waterCourseControlPointsPx.length - 1; index += 1) {
    const from = manifest.waterCourseControlPointsPx[index]!;
    const to = manifest.waterCourseControlPointsPx[index + 1]!;
    const bounds = {
      x: Math.min(from[0], to[0]),
      y: Math.min(from[1], to[1]) - 6,
      width: Math.max(1, Math.abs(to[0] - from[0])),
      height: Math.max(12, Math.abs(to[1] - from[1]) + 12),
    };
    if (!intersects(bounds, camera)) continue;
    commands.push(Object.freeze({
      layer: "water-and-landmark",
      kind: "polyline",
      role: "water-course",
      points: Object.freeze([
        Object.freeze({ x: from[0] - camera.x, y: from[1] - camera.y + 3 }),
        Object.freeze({ x: to[0] - camera.x, y: to[1] - camera.y + 3 }),
      ]),
      color: "#4d8d91",
      width: 3,
    }));
  }
  return Object.freeze(commands);
}

function projectLandmark(camera: ForestCameraState): Readonly<{
  projection: ForestGrayboxLandmarkProjection;
  commands: readonly (ForestGrayboxRectCommand | ForestGrayboxArcCommand | ForestGrayboxPolylineCommand)[];
}> {
  const landmark = manifest.landmarks.find((candidate) => candidate.landmarkId === "forest.waterwheel_structure")!;
  const components = waterwheelComponents(landmark.boundsPx, camera);
  const visible = components.filter((component) => intersects(component.boundsPx, camera));
  return Object.freeze({
    projection: Object.freeze({
      landmarkId: landmark.landmarkId,
      worldBounds: Object.freeze({ ...landmark.boundsPx }),
      totalComponentCount: components.length,
      visibleComponentIds: Object.freeze(visible.map((component) => component.componentId)),
      fullyVisible: containsRect(camera, landmark.boundsPx),
    }),
    commands: Object.freeze(visible.map((component) => component.command)),
  });
}

function waterwheelComponents(bounds: ForestRectPx, camera: ForestCameraState): readonly LandmarkComponent[] {
  const screen = (rect: ForestRectPx): ForestRectPx => ({
    x: rect.x - camera.x,
    y: rect.y - camera.y,
    width: rect.width,
    height: rect.height,
  });
  const westSupport = { x: bounds.x + 64, y: bounds.y + 112, width: 32, height: 720 };
  const westRim = { x: bounds.x + 160, y: bounds.y + 208, width: 420, height: 608 };
  const hub = { x: bounds.x + 640, y: bounds.y + 448, width: 128, height: 128 };
  const eastRim = { x: bounds.x + 760, y: bounds.y + 256, width: 480, height: 640 };
  const eastSupport = { x: bounds.x + 1_240, y: bounds.y + 144, width: 32, height: 736 };
  const machinery = { x: bounds.x + 592, y: bounds.y + 704, width: 352, height: 144 };
  const channel = { x: bounds.x - 96, y: bounds.y + 640, width: 560, height: 48 };
  const westRimScreen = screen(westRim);
  const eastRimScreen = screen(eastRim);
  return Object.freeze([
    componentRect("support-beams-west", westSupport, screen(westSupport), "#554a32"),
    Object.freeze({
      componentId: "broken-rim-west",
      boundsPx: westRim,
      command: Object.freeze({
        layer: "water-and-landmark", kind: "arc", role: "broken-rim-west",
        x: westRimScreen.x + westRim.width, y: westRimScreen.y + westRim.height / 2,
        radius: westRim.height / 2, startRadians: Math.PI * 0.68, endRadians: Math.PI * 1.32,
        color: "#776a43", width: 9,
      }),
    }),
    componentRect("inner-hub", hub, screen(hub), "#6c694e"),
    Object.freeze({
      componentId: "broken-rim-east",
      boundsPx: eastRim,
      command: Object.freeze({
        layer: "water-and-landmark", kind: "arc", role: "broken-rim-east",
        x: eastRimScreen.x, y: eastRimScreen.y + eastRim.height / 2,
        radius: eastRim.height / 2, startRadians: -Math.PI * 0.32, endRadians: Math.PI * 0.32,
        color: "#776a43", width: 9,
      }),
    }),
    componentRect("support-beams-east", eastSupport, screen(eastSupport), "#554a32"),
    componentRect("inner-machinery", machinery, screen(machinery), "#454b3e"),
    componentRect("water-channel", channel, screen(channel), "#263f3d"),
  ]);
}

function componentRect(
  componentId: string,
  boundsPx: ForestRectPx,
  screenBounds: ForestRectPx,
  color: string,
): LandmarkComponent {
  return Object.freeze({
    componentId,
    boundsPx: Object.freeze(boundsPx),
    command: Object.freeze({
      layer: "water-and-landmark",
      kind: "rect",
      role: componentId,
      ...screenBounds,
      color,
    }),
  });
}

function projectTraveler(snapshot: ForestGrayboxControllerSnapshot): ForestGrayboxTravelerProjection {
  const player = snapshot.runtime.player;
  const camera = snapshot.runtime.camera;
  const width = 8 as const;
  const height = 18 as const;
  const x = Math.round(player.position.x + player.body.width / 2 - width / 2 - camera.x);
  const y = Math.round(player.position.y + player.body.height - height - camera.y);
  return Object.freeze({
    worldPosition: Object.freeze({ ...player.position }),
    visualBounds: Object.freeze({ x, y, width, height }),
    provisional: true,
    glow: false,
  });
}

function uploadMaterialPixels(
  context: CanvasRenderingContext2D,
  command: ForestGrayboxMaterialPixelsCommand,
): void {
  let surface = materialSurfaces.get(context);
  if (!surface) {
    const canvas = context.canvas.ownerDocument.createElement("canvas");
    canvas.width = command.width;
    canvas.height = command.height;
    const materialContext = canvas.getContext("2d", { alpha: true });
    if (!materialContext) throw new Error("forest graybox material surface is unavailable");
    surface = Object.freeze({ canvas, context: materialContext });
    materialSurfaces.set(context, surface);
  }
  const image = surface.context.createImageData(command.width, command.height);
  image.data.set(command.pixels);
  surface.context.putImageData(image, 0, 0);
  context.drawImage(surface.canvas, 0, 0);
}

function drawTraveler(
  context: CanvasRenderingContext2D,
  command: ForestGrayboxTravelerCommand,
): void {
  context.fillStyle = "#c6bea0";
  context.fillRect(command.x + 2, command.y, 4, 5);
  context.fillStyle = "#476d69";
  context.fillRect(command.x + 1, command.y + 5, 6, 8);
  context.fillStyle = "#263b39";
  context.fillRect(command.x + 1, command.y + 13, 2, 5);
  context.fillRect(command.x + 5, command.y + 13, 2, 5);
  context.fillStyle = "#8e8262";
  context.fillRect(command.facing === "right" ? command.x + 7 : command.x, command.y + 7, 1, 4);
}

function clipToCamera(rect: ForestRectPx, camera: ForestCameraState): ForestRectPx | null {
  const left = Math.max(rect.x, camera.x);
  const top = Math.max(rect.y, camera.y);
  const right = Math.min(rect.x + rect.width, camera.x + camera.width);
  const bottom = Math.min(rect.y + rect.height, camera.y + camera.height);
  if (right <= left || bottom <= top) return null;
  return Object.freeze({
    x: left - camera.x,
    y: top - camera.y,
    width: right - left,
    height: bottom - top,
  });
}

function intersects(rect: ForestRectPx, camera: ForestCameraState): boolean {
  return rect.x < camera.x + camera.width && camera.x < rect.x + rect.width &&
    rect.y < camera.y + camera.height && camera.y < rect.y + rect.height;
}

function containsRect(outer: ForestRectPx, inner: ForestRectPx): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;
}

function text(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function attribute(value: string): string {
  return text(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
