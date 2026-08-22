import type { WorldScaleFrame } from "./world-scale-prototype";

export type GlyphVisualPhase = "undiscovered" | "discovered" | "activated";

export interface WaterVisualBounds {
  readonly leftPx: number;
  readonly rightPx: number;
  readonly surfaceYPx: number;
}

export interface GlyphVisualInput {
  readonly worldPosition: Readonly<{ x: number; y: number }>;
  readonly phase: GlyphVisualPhase;
}

export interface VfxPoint {
  readonly x: number;
  readonly y: number;
}

export interface WaterVisualProjection {
  readonly body: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly surfaceWaves: readonly VfxPoint[];
  readonly foam: readonly Readonly<{ x: number; y: number; width: number }>[];
}

export interface AmbientMote extends VfxPoint {
  readonly size: 1 | 2;
  readonly opacity: number;
  readonly color: string;
}

export interface LightProjection extends VfxPoint {
  readonly kind: "player" | "glyph" | "mineral";
  readonly radius: number;
  readonly color: string;
  readonly strength: number;
}

export interface FogBandProjection {
  readonly y: number;
  readonly height: number;
  readonly opacity: number;
  readonly drift: number;
}

export interface GlyphVisualProjection {
  readonly phase: GlyphVisualPhase;
  readonly screenPosition: VfxPoint;
  readonly slab: Readonly<{ x: number; y: number; width: 22; height: 27 }>;
  readonly strokes: readonly Readonly<{ x: number; y: number; width: number; height: number }>[];
  readonly haloRadius: 0 | 22 | 34;
  readonly color: string;
}

export interface LandingDustProjection extends VfxPoint {
  readonly size: 1 | 2;
  readonly color: string;
}

export interface WorldVfxProjection {
  readonly water: WaterVisualProjection | null;
  readonly motes: readonly AmbientMote[];
  readonly lights: readonly LightProjection[];
  readonly fogBands: readonly FogBandProjection[];
  readonly glyph: GlyphVisualProjection | null;
  readonly landingDust: readonly LandingDustProjection[];
}

export interface ProjectWorldVfxInput {
  readonly frame: WorldScaleFrame;
  readonly waterBounds: WaterVisualBounds | null;
  readonly glyph: GlyphVisualInput | null;
  readonly reducedMotion: boolean;
}

export function projectWorldVfx(input: ProjectWorldVfxInput): WorldVfxProjection {
  const phaseTick = input.reducedMotion ? 0 : input.frame.tick;
  const sceneSeed = stableHash(input.frame.sceneId);
  const motes = Array.from({ length: 24 }, (_, index) => {
    const seed = mix(sceneSeed, index + 1);
    const baseX = seed % input.frame.camera.width;
    const baseY = Math.floor(seed / 17) % input.frame.camera.height;
    const x = modulo(baseX + phaseTick * (index % 3 === 0 ? 0.08 : 0.025), input.frame.camera.width);
    const y = modulo(baseY - phaseTick * (index % 4 === 0 ? 0.04 : 0.0125), input.frame.camera.height);
    return Object.freeze({
      x: round2(x),
      y: round2(y),
      size: (index % 7 === 0 ? 2 : 1) as 1 | 2,
      opacity: round2(0.16 + (seed % 5) * 0.05),
      color: input.frame.sceneId.endsWith("stream_section") ? "#7aa5a0" : "#9b8d63",
    });
  });

  const water = input.waterBounds ? projectWater(input.frame, input.waterBounds, phaseTick) : null;
  const glyph = input.glyph ? projectGlyph(input.frame, input.glyph, phaseTick) : null;
  const lights: LightProjection[] = [Object.freeze({
    kind: "player",
    x: round2(input.frame.character.screenPosition.x + 6),
    y: round2(input.frame.character.screenPosition.y + 6),
    radius: 34,
    color: "#d8c888",
    strength: 0.16,
  })];
  if (glyph && glyph.phase !== "undiscovered") {
    lights.push(Object.freeze({
      kind: "glyph",
      x: glyph.screenPosition.x,
      y: glyph.screenPosition.y - 12,
      radius: glyph.haloRadius,
      color: "#76d8dc",
      strength: glyph.phase === "activated" ? 0.48 : 0.25,
    }));
  }
  for (let index = 0; index < 3; index += 1) {
    const seed = mix(sceneSeed, 200 + index);
    lights.push(Object.freeze({
      kind: "mineral",
      x: seed % input.frame.camera.width,
      y: Math.floor(seed / 13) % input.frame.camera.height,
      radius: 10 + (seed % 8),
      color: "#b99551",
      strength: 0.08,
    }));
  }

  const fogBands = Array.from({ length: 3 }, (_, index) => Object.freeze({
    y: round2(input.frame.camera.height * (0.28 + index * 0.24)),
    height: 18 + index * 6,
    opacity: round2(0.025 + index * 0.012),
    drift: round2(input.reducedMotion ? 0 : modulo(phaseTick * (0.04 + index * 0.015), 32)),
  }));

  const landingDust: LandingDustProjection[] = input.frame.character.animation === "land"
    ? [-5, -2, 3, 7].map((offset, index) => Object.freeze({
      x: round2(input.frame.character.screenPosition.x + 6 + offset),
      y: round2(input.frame.character.screenPosition.y + 14 - (index % 2)),
      size: (index % 2 === 0 ? 2 : 1) as 1 | 2,
      color: "#84765a",
    }))
    : [];

  return deepFreeze({ water, motes, lights, fogBands, glyph, landingDust });
}

function projectWater(
  frame: WorldScaleFrame,
  bounds: WaterVisualBounds,
  phaseTick: number,
): WaterVisualProjection {
  if (![bounds.leftPx, bounds.rightPx, bounds.surfaceYPx].every(Number.isFinite) ||
      bounds.rightPx <= bounds.leftPx) {
    throw new Error("water visual bounds are invalid");
  }
  const x = bounds.leftPx - frame.camera.x;
  const y = bounds.surfaceYPx - frame.camera.y;
  const width = bounds.rightPx - bounds.leftPx;
  const surfaceWaves = Array.from({ length: 9 }, (_, index) => Object.freeze({
    x: round2(x + (index / 8) * width),
    y: round2(y + ((index + Math.floor(phaseTick / 9)) % 3 === 0 ? -1 : 0)),
  }));
  const foam = Array.from({ length: 4 }, (_, index) => Object.freeze({
    x: round2(x + 4 + index * (width - 8) / 4),
    y: round2(y - (index % 2)),
    width: 4 + (index % 3) * 2,
  }));
  return deepFreeze({
    body: {
      x: round2(x),
      y: round2(y),
      width: round2(width),
      height: round2(Math.max(8, frame.worldSizePx.height - bounds.surfaceYPx)),
    },
    surfaceWaves,
    foam,
  });
}

function projectGlyph(
  frame: WorldScaleFrame,
  input: GlyphVisualInput,
  phaseTick: number,
): GlyphVisualProjection {
  const x = input.worldPosition.x - frame.camera.x;
  const y = input.worldPosition.y - frame.camera.y;
  const activatedLift = input.phase === "activated" ? Math.sin(phaseTick / 18) : 0;
  const strokes = input.phase === "undiscovered" ? [] : [
    Object.freeze({ x: round2(x - 2), y: round2(y - 20 + activatedLift), width: 4, height: 11 }),
    Object.freeze({ x: round2(x - 6), y: round2(y - 10 + activatedLift), width: 12, height: 3 }),
    Object.freeze({ x: round2(x - 5), y: round2(y - 17 + activatedLift), width: 10, height: 2 }),
  ];
  return deepFreeze({
    phase: input.phase,
    screenPosition: { x: round2(x), y: round2(y + activatedLift) },
    slab: { x: round2(x - 11), y: round2(y - 26), width: 22, height: 27 },
    strokes,
    haloRadius: input.phase === "activated" ? 34 : input.phase === "discovered" ? 22 : 0,
    color: input.phase === "activated" ? "#b9f4f2" : input.phase === "discovered" ? "#6ca8a7" : "#303a38",
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

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
