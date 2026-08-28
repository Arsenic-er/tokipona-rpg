import { describe, expect, it } from "vitest";
import { WorldScalePrototypeController } from "./world-scale-controller";
import { projectWorldInteraction, WORLD_SCALE_TELO_GLYPH_POSITION } from "./world-interaction";

describe("world contextual interaction projection", () => {
  it("stays hidden outside N01 and outside glyph range", () => {
    const controller = WorldScalePrototypeController.fresh("world-interaction.hidden");
    expect(controller.interactionView()).toEqual({
      visible: false,
      actionable: false,
      phase: "undiscovered",
      prompt: null,
    });

    controller.advanceTicks(220, { moveX: 1 });
    const view = projectWorldInteraction(controller.flowSnapshot());
    if (controller.flowSnapshot().runtime.sceneId === "scene.valley.stream_section") {
      expect(view.visible).toBe(false);
    }
  });

  it("does not project a pre-hermit discover, attune, or manifest prompt in N01", () => {
    const controller = WorldScalePrototypeController.fresh("world-interaction.phases");
    moveToLegacyGlyphPosition(controller);
    expect(controller.flowSnapshot().runtime.sceneId).toBe("scene.valley.stream_section");
    expect(projectWorldInteraction(controller.flowSnapshot())).toEqual({
      visible: false,
      actionable: false,
      phase: "undiscovered",
      prompt: null,
    });
  });

  it("exposes no session, receipt, flags, payload, or physics authority", () => {
    const controller = WorldScalePrototypeController.fresh("world-interaction.boundary");
    const serialized = JSON.stringify(projectWorldInteraction(controller.flowSnapshot()));

    for (const forbidden of ["session", "receipt", "flag", "payload", "physics", "worldVersion", "currentMp"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
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
