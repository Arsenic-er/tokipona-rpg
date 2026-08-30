import { describe, expect, it } from "vitest";
import { PrologueForestOpeningSession } from "../game/prologue-forest-opening";
import { runtimeForestOpeningAssetExport } from "../assets/runtime-forest-opening-assets";
import {
  FOREST_OPENING_VIEWPORT,
  projectForestOpeningView,
  type ForestOpeningPublicView,
} from "./forest-opening-view";

function freshView(): ForestOpeningPublicView {
  const session = PrologueForestOpeningSession.fresh({
    sessionId: "view.forest-opening",
    seed: "view.forest-opening.seed",
    currentMp: 12,
    maxMp: 24,
  });
  session.advanceTicks(2, { moveX: 1 });
  return projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
}

describe("forest opening public view", () => {
  it("projects a fixed 640x360 four-depth candidate with tiny non-glowing traveler", () => {
    const view = freshView();
    expect(FOREST_OPENING_VIEWPORT).toEqual({ width: 640, height: 360 });
    expect(view.presentation).toEqual({ kind: "procedural_candidate", approvedAssetPackId: null });
    expect(view.environment.map(({ layer }) => layer)).toEqual([
      "far_parallax", "mid_parallax", "world_material", "foreground",
    ]);
    expect(view.traveler.visualHeightPx).toBe(20);
    expect(view.traveler.glow).toBe(false);
    expect(view.traveler.animationId).toBe("fall");
    expect(view.hud).toMatchObject({ health: 100, maxHealth: 100, mp: 12, maxMp: 24 });
  });

  it("contains only browser-facing semantic and visual fields", () => {
    const view = freshView();
    expect(Object.keys(view).sort()).toEqual([
      "camera", "creatures", "dialogue", "environment", "hud", "mode", "obstacle",
      "presentation", "tick", "traveler", "worldMinute",
    ]);
    const bytes = JSON.stringify(view);
    for (const forbidden of [
      "receiptIndex", "processedEventPayloads", "learning", "world.flags", "stateDigest",
      "checksum", "topologyDigest", "private", "candidate-export", "damageOverride",
      "teleport", "setPosition", "GameSessionState",
    ]) expect(bytes).not.toContain(forbidden);
  });

  it("projects exact obstacle objects, natural creatures, and unknown-glyph state", () => {
    const view = freshView();
    expect(view.obstacle).toMatchObject({
      solutionId: null,
      visuallyComplete: false,
      glyph: { wordId: "word.telo", observed: false, meaningKnown: false, pronunciationKnown: false },
    });
    expect(view.creatures.map(({ speciesId }) => speciesId)).toEqual([
      "forest.rabbit", "forest.wetland_bird",
    ]);
    expect(view.creatures.every(({ hostile }) => hostile === false)).toBe(true);
    expect(view.environment.find(({ layer }) => layer === "world_material")?.objects.map(({ kind }) => kind))
      .toEqual(["stream", "stone", "stone", "deadwood", "unknown_glyph", "settlement_perimeter"]);
  });

  it("selects idle, run, jump, and fall animations from verified motion only", () => {
    const base = PrologueForestOpeningSession.fresh({ sessionId: "view.motion", seed: "view.motion.seed" }).snapshot();
    const withPlayer = (velocity: { x: number; y: number }, grounded: boolean) => ({
      ...base,
      runtime: {
        ...base.runtime,
        spatial: { ...base.runtime.spatial, player: { ...base.runtime.spatial.player, velocity, grounded } },
      },
    });
    expect(projectForestOpeningView(withPlayer({ x: 0, y: 0 }, true), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("idle");
    expect(projectForestOpeningView(withPlayer({ x: 7, y: 0 }, true), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("run");
    expect(projectForestOpeningView(withPlayer({ x: 0, y: -2 }, false), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("jump");
    expect(projectForestOpeningView(withPlayer({ x: 0, y: 2 }, false), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("fall");
  });
});
