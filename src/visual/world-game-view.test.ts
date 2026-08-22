import { describe, expect, it } from "vitest";
import { WorldScalePrototypeController } from "./world-scale-controller";
import { projectWorldGameView } from "./world-game-view";

describe("world game presentation view", () => {
  it("projects a game-first overlay with the audit controls collapsed", () => {
    const controller = WorldScalePrototypeController.fresh("world-game-view.collapsed");
    const view = projectWorldGameView({
      snapshot: controller.snapshot(),
      interaction: controller.interactionView(),
      auditOpen: false,
      toast: null,
    });

    expect(view).toMatchObject({
      sceneTitle: "N00 · 到达崖台",
      interactionPrompt: null,
      toast: null,
      audit: { open: false, selectedProfileId: "medium" },
      touchControls: ["left", "right", "jump", "interact"],
    });
    expect(view.audit.diagnostics).toBeNull();
  });

  it("reveals scale diagnostics only inside the optional audit drawer", () => {
    const controller = WorldScalePrototypeController.fresh("world-game-view.audit");
    const view = projectWorldGameView({
      snapshot: controller.snapshot(),
      interaction: controller.interactionView(),
      auditOpen: true,
      toast: "这是一条场景反馈。",
    });

    expect(view.audit.diagnostics).toEqual({
      viewport: "270×480",
      macroTilePx: 16,
      materialCellPx: 2,
      collisionBody: "12×14",
      tick: 0,
    });
    expect(view.toast).toBe("这是一条场景反馈。");
  });

  it("does not expose session, save, receipt, flags, or physics authority", () => {
    const controller = WorldScalePrototypeController.fresh("world-game-view.boundary");
    const serialized = JSON.stringify(projectWorldGameView({
      snapshot: controller.snapshot(),
      interaction: controller.interactionView(),
      auditOpen: true,
      toast: null,
    })).toLowerCase();

    for (const forbidden of ["session", "save", "receipt", "flags", "payload", "worldversion", "physics"])
      expect(serialized).not.toContain(forbidden);
  });
});
