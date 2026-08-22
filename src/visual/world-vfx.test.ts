import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import type { RuntimeSnapshot } from "../runtime";
import { projectWorldScaleFrame, type PrototypeCharacterHistory } from "./world-scale-prototype";
import { projectWorldVfx, type GlyphVisualPhase } from "./world-vfx";

const scenes = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;

describe("world visual effects projection", () => {
  it("keeps N00 dry while still projecting bounded atmosphere and player light", () => {
    const frame = frameFor("scene.valley.arrival_shelf", 120, true, null);
    const vfx = projectWorldVfx({ frame, waterBounds: null, glyph: null, reducedMotion: false });

    expect(vfx.water).toBeNull();
    expect(vfx.motes).toHaveLength(24);
    expect(vfx.fogBands).toHaveLength(3);
    expect(vfx.lights.some((light) => light.kind === "player")).toBe(true);
    expect(allFinite(vfx)).toBe(true);
  });

  it("projects bounded N01 water waves and shoreline foam", () => {
    const frame = frameFor("scene.valley.stream_section", 180, true, null);
    const vfx = projectWorldVfx({
      frame,
      waterBounds: { leftPx: 192, rightPx: 304, surfaceYPx: 352 },
      glyph: { worldPosition: { x: 144, y: 100 }, phase: "discovered" },
      reducedMotion: false,
    });

    expect(vfx.water).not.toBeNull();
    expect(vfx.water?.surfaceWaves.length).toBeGreaterThan(6);
    expect(vfx.water?.foam.length).toBeGreaterThan(2);
    expect(vfx.water?.body.width).toBe(112);
    expect(vfx.lights.some((light) => light.kind === "glyph")).toBe(true);
    expect(allFinite(vfx)).toBe(true);
  });

  it.each(["undiscovered", "discovered", "activated"] as readonly GlyphVisualPhase[])(
    "creates a distinct immutable %s glyph presentation",
    (phase) => {
      const frame = frameFor("scene.valley.stream_section", 60, true, null);
      const glyph = projectWorldVfx({
        frame,
        waterBounds: null,
        glyph: { worldPosition: { x: 144, y: 100 }, phase },
        reducedMotion: false,
      }).glyph!;

      expect(glyph.phase).toBe(phase);
      expect(glyph.strokes.length).toBe(phase === "undiscovered" ? 0 : 3);
      expect(glyph.haloRadius).toBe(phase === "activated" ? 34 : phase === "discovered" ? 22 : 0);
      expect(Object.isFrozen(glyph)).toBe(true);
    },
  );

  it("freezes time-varying phases in reduced-motion mode", () => {
    const first = projectWorldVfx({
      frame: frameFor("scene.valley.stream_section", 20, true, null),
      waterBounds: { leftPx: 192, rightPx: 304, surfaceYPx: 352 },
      glyph: { worldPosition: { x: 144, y: 100 }, phase: "activated" },
      reducedMotion: true,
    });
    const second = projectWorldVfx({
      frame: frameFor("scene.valley.stream_section", 220, true, null),
      waterBounds: { leftPx: 192, rightPx: 304, surfaceYPx: 352 },
      glyph: { worldPosition: { x: 144, y: 100 }, phase: "activated" },
      reducedMotion: true,
    });

    expect(second.motes).toEqual(first.motes);
    expect(second.water).toEqual(first.water);
    expect(second.glyph).toEqual(first.glyph);
  });

  it("emits landing dust only for a grounded transition", () => {
    const prior: PrototypeCharacterHistory = { grounded: false, facing: "right", tick: 9 };
    const landed = projectWorldVfx({
      frame: frameFor("scene.valley.arrival_shelf", 10, true, prior),
      waterBounds: null,
      glyph: null,
      reducedMotion: false,
    });
    const idle = projectWorldVfx({
      frame: frameFor("scene.valley.arrival_shelf", 11, true, { grounded: true, facing: "right", tick: 10 }),
      waterBounds: null,
      glyph: null,
      reducedMotion: false,
    });

    expect(landed.landingDust).toHaveLength(4);
    expect(idle.landingDust).toEqual([]);
  });
});

function frameFor(
  sceneId: string,
  tick: number,
  grounded: boolean,
  previousCharacter: PrototypeCharacterHistory | null,
) {
  const scene = scenes[sceneId]!;
  return projectWorldScaleFrame({
    profileId: "medium",
    scene,
    runtime: runtime(sceneId, tick, grounded),
    previousCharacter,
  });
}

function runtime(sceneId: string, tick: number, grounded: boolean): RuntimeSnapshot {
  return {
    tick,
    sceneId,
    player: {
      position: { x: 96, y: sceneId.endsWith("stream_section") ? 82 : 118 },
      velocity: { x: 0, y: 0 },
      grounded,
      body: { width: 12, height: 14 },
    },
    camera: { x: 0, y: 0, width: 180, height: 320 },
    checkpoint: { id: "checkpoint.vfx", sceneId, position: { x: 96, y: 118 }, tick: 0 },
  };
}

function allFinite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (typeof value === "object" && value !== null) return Object.values(value).every(allFinite);
  return true;
}
