import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import type { RuntimeSnapshot } from "../runtime";
import { projectWorldScaleFrame } from "./world-scale-prototype";
import { projectWorldEnvironment } from "./world-environment";

const scenes = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;

describe("world environment projection", () => {
  it("gives N00 a dry warm layered geology identity", () => {
    const scene = scenes["scene.valley.arrival_shelf"]!;
    const frame = projectWorldScaleFrame({
      profileId: "medium",
      scene,
      runtime: runtime(scene.sceneId, 80, 118),
      previousCharacter: null,
    });

    const environment = projectWorldEnvironment(scene, frame);

    expect(environment.ambience).toBe("dry_warm");
    expect(environment.palette.surface).toBe("#827245");
    expect(environment.farSilhouettes).toHaveLength(3);
    expect(environment.midFormations.length).toBeGreaterThan(2);
    expect(environment.decorations.some((item) => item.kind === "grass")).toBe(true);
    expect(environment.decorations.some((item) => item.kind === "wet_streak")).toBe(false);
  });

  it("gives N01 a wet cool material identity", () => {
    const scene = scenes["scene.valley.stream_section"]!;
    const frame = projectWorldScaleFrame({
      profileId: "medium",
      scene,
      runtime: runtime(scene.sceneId, 112, 82),
      previousCharacter: null,
    });

    const environment = projectWorldEnvironment(scene, frame);

    expect(environment.ambience).toBe("wet_cool");
    expect(environment.palette.surface).toBe("#536a4b");
    expect(environment.decorations.some((item) => item.kind === "wet_streak")).toBe(true);
    expect(environment.decorations.some((item) => item.kind === "fungus")).toBe(true);
  });

  it("is deterministic, deeply frozen, and leaves its authorities unchanged", () => {
    const scene = scenes["scene.valley.stream_section"]!;
    const frame = projectWorldScaleFrame({
      profileId: "wide_world",
      scene,
      runtime: runtime(scene.sceneId, 250, 82),
      previousCharacter: null,
    });
    const beforeScene = structuredClone(scene);
    const beforeFrame = structuredClone(frame);

    const first = projectWorldEnvironment(scene, frame);
    const second = projectWorldEnvironment(scene, frame);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.decorations)).toBe(true);
    expect(first.decorations.every(Object.isFrozen)).toBe(true);
    expect(scene).toEqual(beforeScene);
    expect(frame).toEqual(beforeFrame);
  });
});

function runtime(sceneId: string, x: number, y: number): RuntimeSnapshot {
  return {
    tick: 120,
    sceneId,
    player: {
      position: { x, y },
      velocity: { x: 0, y: 0 },
      grounded: true,
      body: { width: 12, height: 14 },
    },
    camera: { x: 0, y: 0, width: 180, height: 320 },
    checkpoint: { id: "checkpoint.environment", sceneId, position: { x, y }, tick: 0 },
  };
}
