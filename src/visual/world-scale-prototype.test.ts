import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import { PrologueFlowSession } from "../game/prologue-flow";
import type { RuntimeSnapshot } from "../runtime";
import {
  WORLD_SCALE_PROFILE_IDS,
  derivePrototypeCharacterPose,
  projectWorldScaleFrame,
  readWorldScaleProfile,
} from "./world-scale-prototype";

const scenes = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;

describe("world scale prototype", () => {
  it("defines three display-only scales over the unchanged runtime grid", () => {
    expect(WORLD_SCALE_PROFILE_IDS).toEqual(["current", "medium", "wide_world"]);
    expect(WORLD_SCALE_PROFILE_IDS.map((id) => readWorldScaleProfile(id))).toEqual([
      expect.objectContaining({ id: "current", viewportPx: { width: 180, height: 320 } }),
      expect.objectContaining({ id: "medium", viewportPx: { width: 270, height: 480 } }),
      expect.objectContaining({ id: "wide_world", viewportPx: { width: 360, height: 640 } }),
    ]);
    for (const id of WORLD_SCALE_PROFILE_IDS) {
      const profile = readWorldScaleProfile(id);
      expect(profile.macroTilePx).toBe(16);
      expect(profile.materialCellPx).toBe(2);
      expect(profile.particleCellPx).toBe(1);
      expect(Object.isFrozen(profile)).toBe(true);
    }
    expect(() => readWorldScaleProfile("giant" as never)).toThrow(/unknown world scale profile/);
  });

  it("projects the real N00 manifest without changing world or save state", () => {
    const flow = PrologueFlowSession.fresh({ sessionId: "world-scale.non-mutating" });
    const beforeSnapshot = structuredClone(flow.snapshot());
    const beforeSave = structuredClone(flow.toSave());
    const scene = scenes[beforeSnapshot.runtime.sceneId]!;
    const beforeScene = structuredClone(scene);

    const frame = projectWorldScaleFrame({
      profileId: "current",
      scene,
      runtime: beforeSnapshot.runtime,
      previousCharacter: null,
    });

    expect(frame.sceneId).toBe("scene.valley.arrival_shelf");
    expect(frame.profile.viewportPx).toEqual({ width: 180, height: 320 });
    expect(frame.character.worldBody).toEqual(beforeSnapshot.runtime.player.body);
    expect(frame.solidTiles.length).toBeGreaterThan(0);
    expect(frame.solidTiles.every((tile) => scene.collisionRows[tile.tileY]?.[tile.tileX] === "#")).toBe(true);
    expect(frame.materialCells.every((cell) => cell.size === 2)).toBe(true);
    expect(flow.snapshot()).toEqual(beforeSnapshot);
    expect(flow.toSave()).toEqual(beforeSave);
    expect(scene).toEqual(beforeScene);
  });

  it("changes only the camera extent when the display scale changes", () => {
    const flow = PrologueFlowSession.fresh({ sessionId: "world-scale.profile-parity" });
    const runtime = flow.snapshot().runtime;
    const scene = scenes[runtime.sceneId]!;
    const frames = WORLD_SCALE_PROFILE_IDS.map((profileId) => projectWorldScaleFrame({
      profileId,
      scene,
      runtime,
      previousCharacter: null,
    }));

    expect(frames.map((frame) => frame.camera.width)).toEqual([180, 270, 360]);
    expect(frames.map((frame) => frame.camera.height)).toEqual([320, 480, 640]);
    expect(frames.map((frame) => frame.character.worldPosition)).toEqual([
      runtime.player.position,
      runtime.player.position,
      runtime.player.position,
    ]);
    expect(frames.map((frame) => frame.character.worldBody)).toEqual([
      { width: 12, height: 14 },
      { width: 12, height: 14 },
      { width: 12, height: 14 },
    ]);
  });

  it.each([
    ["idle", runtime({ velocity: { x: 0, y: 0 }, grounded: true }), null, "idle"],
    ["run", runtime({ velocity: { x: 40, y: 0 }, grounded: true }), null, "run"],
    ["rise", runtime({ velocity: { x: 0, y: -25 }, grounded: false }), null, "rise"],
    ["fall", runtime({ velocity: { x: 0, y: 30 }, grounded: false }), null, "fall"],
    [
      "land",
      runtime({ velocity: { x: 0, y: 0 }, grounded: true }),
      { grounded: false, facing: "right" as const, tick: 9 },
      "land",
    ],
  ])("derives the %s pose from runtime state", (_label, state, previous, expected) => {
    expect(derivePrototypeCharacterPose(state, previous).animation).toBe(expected);
  });
});

function runtime(overrides: {
  readonly velocity: Readonly<{ x: number; y: number }>;
  readonly grounded: boolean;
}): RuntimeSnapshot {
  return {
    tick: 10,
    sceneId: "scene.valley.arrival_shelf",
    player: {
      position: { x: 48, y: 120 },
      velocity: overrides.velocity,
      grounded: overrides.grounded,
      body: { width: 12, height: 14 },
    },
    camera: { x: 0, y: 0, width: 180, height: 320 },
    checkpoint: {
      id: "checkpoint.test",
      sceneId: "scene.valley.arrival_shelf",
      position: { x: 48, y: 120 },
      tick: 0,
    },
  };
}
