import { describe, expect, it } from "vitest";
import {
  advanceForestGrayboxAuditFrame,
  ForestGrayboxController,
} from "./visual/forest-graybox-controller";
import {
  createForestGrayboxPageMarkup,
  projectForestGrayboxView,
} from "./visual/forest-graybox-view";

describe("world scale browser surface", () => {
  it("projects the continuous controller into the fixed full-screen graybox shell", () => {
    const snapshot = ForestGrayboxController.fresh({ seed: "forest.chapter-one.audit" }).snapshot();
    const view = projectForestGrayboxView(snapshot);
    const markup = createForestGrayboxPageMarkup(view, snapshot.diagnostics.regionId);

    expect(view.viewport).toEqual({ width: 640, height: 360 });
    expect(markup).toContain('class="forest-graybox"');
    expect(markup).toContain('data-region-id="valley_prologue"');
    expect(markup).toContain('data-district-id="forest.arrival"');
    expect(markup).not.toContain("data-profile");
    expect(markup).not.toContain("world-review__audit");
    expect(snapshot.diagnostics.laterGates).toEqual([
      { anchorId: "forest.safe_range", blocked: true },
      { anchorId: "forest.old_mine", blocked: true },
    ]);
  });

  it("keeps browser movement semantic and the camera fixed while the HUD advances", () => {
    const controller = ForestGrayboxController.fresh({ seed: "forest.chapter-one.audit" });
    const before = projectForestGrayboxView(controller.snapshot());
    const after = projectForestGrayboxView(controller.advanceTicks(30, { moveX: 1 }));

    expect(after.traveler.worldPosition.x).toBeGreaterThan(before.traveler.worldPosition.x);
    expect(after.viewport).toEqual(before.viewport);
    expect(after.hud.tick).toBe(before.hud.tick + 30);
  });

  it("resets through the graybox checkpoint without adding interaction UI", () => {
    const controller = ForestGrayboxController.fresh({ seed: "forest.chapter-one.audit" });
    const initial = controller.snapshot();
    controller.advanceTicks(90, { moveX: 1 });

    const reset = controller.resetToCheckpoint();
    const markup = createForestGrayboxPageMarkup(
      projectForestGrayboxView(reset),
      reset.diagnostics.regionId,
    );

    expect(reset.runtime.player.position).toEqual(initial.runtime.player.position);
    expect(markup).toContain('data-action="reset"');
    expect(markup).not.toContain('data-touch="interact"');
  });

  it("batches at most one audit second through all exact fixed steps", () => {
    const oneSecond = ForestGrayboxController.fresh({ seed: "forest.audit.catchup" });
    const directTicks = ForestGrayboxController.fresh({ seed: "forest.audit.catchup" });
    const capped = ForestGrayboxController.fresh({ seed: "forest.audit.catchup" });

    const batched = advanceForestGrayboxAuditFrame(oneSecond, 1, { moveX: 1 });
    const direct = directTicks.advanceTicks(60, { moveX: 1 });
    const overLimit = advanceForestGrayboxAuditFrame(capped, 4, { moveX: 1 });

    expect(batched.runtime.tick).toBe(60);
    expect(batched).toEqual(direct);
    expect(overLimit).toEqual(direct);
  });
});
