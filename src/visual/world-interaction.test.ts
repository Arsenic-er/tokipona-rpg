import { describe, expect, it } from "vitest";
import { WorldScalePrototypeController } from "./world-scale-controller";
import { projectWorldInteraction } from "./world-interaction";

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

  it("derives exact discover, attune, and manifest prompts from real learning state", () => {
    const controller = WorldScalePrototypeController.fresh("world-interaction.phases");
    moveToGlyph(controller);

    expect(projectWorldInteraction(controller.flowSnapshot())).toEqual({
      visible: true,
      actionable: true,
      phase: "undiscovered",
      prompt: "E · 观察 telo",
    });
    expect(controller.interact().accepted).toBe(true);
    expect(controller.interactionView().prompt).toBe("E · 调谐 telo");
    expect(controller.interact().accepted).toBe(true);
    expect(controller.interactionView().prompt).toBe("E · 显化 telo");
  });

  it("exposes no session, receipt, flags, payload, or physics authority", () => {
    const controller = WorldScalePrototypeController.fresh("world-interaction.boundary");
    moveToGlyph(controller);
    const serialized = JSON.stringify(projectWorldInteraction(controller.flowSnapshot()));

    for (const forbidden of ["session", "receipt", "flag", "payload", "physics", "worldVersion", "currentMp"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

function moveToGlyph(controller: WorldScalePrototypeController): void {
  for (let index = 0; index < 700; index += 1) {
    if (projectWorldInteraction(controller.flowSnapshot()).visible) return;
    controller.advanceTicks(1, { moveX: 1 });
  }
  throw new Error("test could not reach the N01 telo glyph");
}
