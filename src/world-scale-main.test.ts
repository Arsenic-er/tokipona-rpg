import { describe, expect, it } from "vitest";
import { WorldScalePrototypeController } from "./visual/world-scale-controller";
import { ForestGrayboxController } from "./visual/forest-graybox-controller";
import { WORLD_SCALE_TELO_GLYPH_POSITION } from "./visual/world-interaction";

describe("world scale browser controller", () => {
  it("provides the continuous forest audit controller without changing the legacy page yet", () => {
    const snapshot = ForestGrayboxController.fresh({ seed: "world-scale.continuous.contract" }).snapshot();

    expect(snapshot.runtime.camera).toMatchObject({ width: 640, height: 360 });
    expect(snapshot.location).toMatchObject({
      districtId: "forest.arrival",
      sceneId: "scene.valley.arrival_shelf",
    });
    expect(snapshot.diagnostics.regionId).toBe("valley_prologue");
  });

  it("uses the approved medium world scale as the audit baseline", () => {
    expect(WorldScalePrototypeController.fresh("world-scale.controller.default").snapshot().profileId)
      .toBe("medium");
  });

  it("switches display profiles without changing the live flow or save", () => {
    const controller = WorldScalePrototypeController.fresh("world-scale.controller.profile");
    const beforeFlow = structuredClone(controller.flowSnapshot());
    const beforeSave = structuredClone(controller.toSave());

    expect(controller.setProfile("medium").frame.profile.id).toBe("medium");
    expect(controller.setProfile("wide_world").frame.profile.id).toBe("wide_world");
    expect(controller.setProfile("current").frame.profile.id).toBe("current");
    expect(controller.flowSnapshot()).toEqual(beforeFlow);
    expect(controller.toSave()).toEqual(beforeSave);
  });

  it("drives the real fixed-step player with semantic movement input", () => {
    const controller = WorldScalePrototypeController.fresh("world-scale.controller.motion");
    const before = controller.flowSnapshot().runtime;
    controller.advanceTicks(30, { moveX: 1 });
    const landed = controller.snapshot();
    controller.advanceTicks(1, { moveX: 1 });
    const after = controller.flowSnapshot().runtime;

    expect(after.tick).toBe(before.tick + 31);
    expect(after.player.position.x).toBeGreaterThan(before.player.position.x);
    expect(landed.frame.character.animation).toBe("land");
    expect(controller.snapshot().frame.character.worldPosition).toEqual(after.player.position);
    expect(controller.snapshot().frame.character.animation).toBe("run");
  });

  it("keeps runtime and save results identical across rendered profiles", () => {
    const controllers = ["current", "medium", "wide_world"].map((profile, index) => {
      const controller = WorldScalePrototypeController.fresh("world-scale.controller.parity");
      controller.setProfile(profile as "current" | "medium" | "wide_world");
      controller.advanceTicks(45, { moveX: 1 });
      controller.advanceTicks(1, { moveX: 1, jump: true });
      controller.advanceTicks(24, { moveX: 1 });
      controller.snapshot();
      expect(index).toBeGreaterThanOrEqual(0);
      return controller;
    });

    expect(controllers[1]!.flowSnapshot()).toEqual(controllers[0]!.flowSnapshot());
    expect(controllers[2]!.flowSnapshot()).toEqual(controllers[0]!.flowSnapshot());
    expect(controllers[1]!.toSave()).toEqual(controllers[0]!.toSave());
    expect(controllers[2]!.toSave()).toEqual(controllers[0]!.toSave());
  });

  it("crosses from the real N00 scene into the real N01 scene", () => {
    const controller = WorldScalePrototypeController.fresh("world-scale.controller.n00-n01");
    expect(controller.flowSnapshot().runtime.sceneId).toBe("scene.valley.arrival_shelf");

    controller.setProfile("medium");
    controller.advanceTicks(360, { moveX: 1 });

    expect(controller.flowSnapshot().runtime.sceneId).toBe("scene.valley.stream_section");
    expect(controller.flowSnapshot().mode).toBe("arrival_stream");
    expect(controller.snapshot().frame.sceneId).toBe("scene.valley.stream_section");
  });

  it("does not expose pre-hermit telo learning or casting through the world UI controller", () => {
    const controller = WorldScalePrototypeController.fresh("world-scale.controller.telo", 12, 24);
    moveToLegacyGlyphPosition(controller);
    const before = structuredClone(controller.toSave());

    expect(controller.interactionView()).toMatchObject({ visible: false, actionable: false, prompt: null });
    expect(controller.interact()).toMatchObject({ accepted: false, reason: "not_available" });
    expect(controller.toSave()).toEqual(before);
    expect(controller.flowSnapshot().session.learning.words.telo).toBeUndefined();
    expect(controller.flowSnapshot().session.mp.currentMp).toBe(12);
    expect(controller.flowSnapshot().arrival?.manifestedWater).toEqual([]);
  });

  it("rejects remote interaction without changing the save", () => {
    const controller = WorldScalePrototypeController.fresh("world-scale.controller.remote");
    const before = structuredClone(controller.toSave());

    expect(controller.interact()).toEqual(expect.objectContaining({
      accepted: false,
      reason: "not_available",
    }));
    expect(controller.toSave()).toEqual(before);
  });

  it("keeps the pre-hermit route closed regardless of available MP", () => {
    const controller = WorldScalePrototypeController.fresh("world-scale.controller.no-mp", 0, 24);
    moveToLegacyGlyphPosition(controller);
    expect(controller.interact()).toMatchObject({
      accepted: false,
      reason: "not_available",
    });
    expect(controller.flowSnapshot().arrival?.manifestedWater).toHaveLength(0);
  });
});

function moveToLegacyGlyphPosition(controller: WorldScalePrototypeController): void {
  for (let index = 0; index < 700; index += 1) {
    const runtime = controller.flowSnapshot().runtime;
    const centerX = runtime.player.position.x + runtime.player.body.width / 2;
    if (runtime.sceneId === "scene.valley.stream_section" &&
        Math.abs(centerX - WORLD_SCALE_TELO_GLYPH_POSITION.x) <= 4) return;
    controller.advanceTicks(1, { moveX: 1 });
  }
  throw new Error("test could not reach the legacy N01 glyph position");
}
