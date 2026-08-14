import { describe, expect, it } from "vitest";
import type { PrologueFlowOldMineView } from "./game/prologue-flow";
import { OLD_MINE_UI_TEMPLATE, deriveOldMineUiModel, resolveOldMineUiIntent } from "./rpg-old-mine-ui";

const view = (overrides: Partial<PrologueFlowOldMineView> = {}): PrologueFlowOldMineView => ({
  mode: "settlement",
  sceneId: "scene.valley.settlement",
  entryAvailable: true,
  inOldMine: false,
  chapterComplete: false,
  peacefulExit: true,
  returnToSettlementAvailable: false,
  killCount: 0,
  ...overrides,
});

describe("RPG old-mine peaceful threshold UI", () => {
  it("shows the N02 gateway only after the return observation prerequisite", () => {
    const available = deriveOldMineUiModel(view());
    expect(available).toMatchObject({ gatewayVisible: true, panelVisible: false, canEnter: true });
    expect(resolveOldMineUiIntent(available, "enter_old_mine")).toEqual({ kind: "enter_old_mine" });
    const early = deriveOldMineUiModel(view({ entryAvailable: false }));
    expect(early.gatewayVisible).toBe(false);
    expect(resolveOldMineUiIntent(early, "enter_old_mine")).toBeNull();
  });

  it("exposes only the peaceful completion and return command inside the old mine", () => {
    const model = deriveOldMineUiModel(view({ mode: "old_mine", sceneId: "scene.valley.old_mine_threshold",
      entryAvailable: false, inOldMine: true, chapterComplete: true, returnToSettlementAvailable: true }));
    expect(model).toEqual({ gatewayVisible: false, panelVisible: true, chapterComplete: true,
      peacefulExit: true, killCount: 0, canEnter: false, canReturn: true });
    expect(resolveOldMineUiIntent(model, "return_settlement")).toEqual({ kind: "return_settlement" });
    expect(Object.keys(resolveOldMineUiIntent(model, "return_settlement")!)).toEqual(["kind"]);
    expect(OLD_MINE_UI_TEMPLATE).toContain('aria-live="polite"');
    expect(OLD_MINE_UI_TEMPLATE).not.toMatch(/attack|damage|reward|world_flag|receipt/i);
  });
});
