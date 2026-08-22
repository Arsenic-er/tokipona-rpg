import type { RuntimeSceneManifest } from "../content/runtime-scene-manifest";
import type { WorldScaleFrame } from "./world-scale-prototype";

export type WorldEnvironmentAmbience = "dry_warm" | "wet_cool";
export type WorldDecorationKind = "grass" | "root" | "pebble" | "fungus" | "wet_streak";

export interface WorldEnvironmentPalette {
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly far: string;
  readonly mid: string;
  readonly terrain: string;
  readonly terrainShadow: string;
  readonly surface: string;
  readonly accent: string;
}

export interface WorldSilhouetteBand {
  readonly depth: 0.12 | 0.2 | 0.28;
  readonly color: string;
  readonly points: readonly Readonly<{ x: number; y: number }>[];
}

export interface WorldMidFormation {
  readonly kind: "pillar" | "root" | "shelf";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly depth: 0.35;
}

export interface WorldDecoration {
  readonly kind: WorldDecorationKind;
  readonly x: number;
  readonly y: number;
  readonly variant: 0 | 1 | 2 | 3;
  readonly color: string;
}

export interface WorldEnvironmentProjection {
  readonly sceneId: string;
  readonly ambience: WorldEnvironmentAmbience;
  readonly palette: WorldEnvironmentPalette;
  readonly farSilhouettes: readonly WorldSilhouetteBand[];
  readonly midFormations: readonly WorldMidFormation[];
  readonly decorations: readonly WorldDecoration[];
}

const DRY_PALETTE: WorldEnvironmentPalette = Object.freeze({
  skyTop: "#101716",
  skyBottom: "#070a09",
  far: "#17201d",
  mid: "#222820",
  terrain: "#292820",
  terrainShadow: "#171a17",
  surface: "#827245",
  accent: "#a39354",
});

const WET_PALETTE: WorldEnvironmentPalette = Object.freeze({
  skyTop: "#0b1718",
  skyBottom: "#050b0d",
  far: "#102126",
  mid: "#1a2929",
  terrain: "#222a25",
  terrainShadow: "#121b1a",
  surface: "#536a4b",
  accent: "#79a183",
});

export function projectWorldEnvironment(
  scene: RuntimeSceneManifest,
  frame: WorldScaleFrame,
): WorldEnvironmentProjection {
  if (scene.sceneId !== frame.sceneId) throw new Error("environment scene identity mismatch");
  const ambience: WorldEnvironmentAmbience = scene.sceneId === "scene.valley.stream_section"
    ? "wet_cool"
    : "dry_warm";
  const palette = ambience === "wet_cool" ? WET_PALETTE : DRY_PALETTE;
  const seed = stableHash(scene.sceneId);
  const farSilhouettes = [0.12, 0.2, 0.28].map((depth, bandIndex) => {
    const points: Array<Readonly<{ x: number; y: number }>> = [Object.freeze({ x: 0, y: frame.camera.height })];
    const segmentWidth = Math.max(24, Math.ceil(frame.camera.width / 7));
    for (let index = 0; index <= 8; index += 1) {
      const local = mix(seed, bandIndex * 17 + index);
      const ridge = 0.22 + bandIndex * 0.1 + (local % 17) / 100;
      points.push(Object.freeze({
        x: index * segmentWidth - ((frame.camera.x * depth) % segmentWidth),
        y: Math.round(frame.camera.height * ridge),
      }));
    }
    points.push(Object.freeze({ x: frame.camera.width, y: frame.camera.height }));
    return Object.freeze({
      depth: depth as 0.12 | 0.2 | 0.28,
      color: bandIndex === 0 ? palette.far : bandIndex === 1 ? palette.mid : palette.terrainShadow,
      points: Object.freeze(points),
    });
  });

  const midFormations: WorldMidFormation[] = [];
  for (let index = 0; index < 5; index += 1) {
    const local = mix(seed, 101 + index);
    const width = 6 + (local % 11);
    const height = 34 + (Math.floor(local / 11) % 88);
    const x = Math.round(((index + 0.45) / 5) * frame.camera.width - (frame.camera.x * 0.35) % 31);
    const fromCeiling = index % 2 === 0;
    midFormations.push(Object.freeze({
      kind: index % 3 === 0 ? "root" : index % 3 === 1 ? "pillar" : "shelf",
      x,
      y: fromCeiling ? -8 : frame.camera.height - height + 12,
      width,
      height,
      color: index % 2 === 0 ? palette.mid : palette.far,
      depth: 0.35,
    }));
  }

  const decorations: WorldDecoration[] = [];
  const surfaces = frame.solidTiles.filter((tile) => tile.exposedTop);
  surfaces.forEach((tile, surfaceIndex) => {
    const local = mix(seed, tile.tileX * 31 + tile.tileY * 47);
    const x = tile.screenX + (local % 12) + 2;
    const y = tile.screenY;
    const variant = (local % 4) as 0 | 1 | 2 | 3;
    if (surfaceIndex % 3 === 0) {
      decorations.push(Object.freeze({ kind: "grass", x, y, variant, color: palette.surface }));
    }
    if (surfaceIndex % 5 === 1) {
      decorations.push(Object.freeze({ kind: "pebble", x, y, variant, color: palette.accent }));
    }
    if (ambience === "dry_warm" && surfaceIndex % 7 === 2) {
      decorations.push(Object.freeze({ kind: "root", x, y, variant, color: "#5d422d" }));
    }
    if (ambience === "wet_cool" && surfaceIndex % 3 === 1) {
      decorations.push(Object.freeze({ kind: "fungus", x, y, variant, color: "#8eb8a3" }));
    }
    if (ambience === "wet_cool" && surfaceIndex % 4 === 0) {
      decorations.push(Object.freeze({ kind: "wet_streak", x, y: y + 2, variant, color: "#315b60" }));
    }
  });

  return deepFreeze({
    sceneId: scene.sceneId,
    ambience,
    palette,
    farSilhouettes,
    midFormations,
    decorations,
  });
}

function stableHash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function mix(seed: number, value: number): number {
  let result = seed ^ Math.imul(value, 0x9e3779b1);
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  return result >>> 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
