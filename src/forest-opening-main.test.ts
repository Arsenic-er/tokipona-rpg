import { describe, expect, it } from "vitest";
import mainSource from "./forest-opening-main.ts?raw";
import { PrologueForestOpeningSession } from "./game/prologue-forest-opening";
import { runtimeForestOpeningAssetExport } from "./assets/runtime-forest-opening-assets";
import {
  createForestOpeningPageMarkup,
  fitForestOpeningPresentation,
  projectForestOpeningView,
} from "./visual/forest-opening-view";

describe("forest opening formal browser entry", () => {
  it("renders a full-screen game shell without laboratory or audit controls", () => {
    const session = PrologueForestOpeningSession.fresh({ sessionId: "browser.shell", seed: "browser.shell.seed" });
    const markup = createForestOpeningPageMarkup(projectForestOpeningView(
      session.snapshot(), runtimeForestOpeningAssetExport,
    ));
    expect(markup).toContain('class="forest-opening"');
    expect(markup).toContain('data-surface="game"');
    expect(markup).toContain('data-touch="interact"');
    expect(markup).toContain('data-action="pause"');
    expect(markup).toContain('data-action="mute"');
    expect(markup).toContain('data-recovery="status"');
    for (const forbidden of ["seed", "topology", "digest", "audit", "profile", "setPosition", "teleport", "damage override"])
      expect(markup.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });

  it("keeps desktop and landscape-mobile cover crops full-screen with traveler visible", () => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      const crop = fitForestOpeningPresentation(viewport, { x: 310, y: 266, width: 8, height: 20 });
      expect(crop.width).toBeGreaterThanOrEqual(viewport.width);
      expect(crop.height).toBeGreaterThanOrEqual(viewport.height);
      expect(crop.left + 310 * crop.scale).toBeLessThan(viewport.width);
      expect(crop.left + 318 * crop.scale).toBeGreaterThan(0);
      expect(crop.top + 266 * crop.scale).toBeLessThan(viewport.height);
      expect(crop.top + 286 * crop.scale).toBeGreaterThan(0);
    }
  });

  it("wires only the formal coordinator, narrow view, persistence, and semantic controls", () => {
    const session = PrologueForestOpeningSession.fresh({ sessionId: "browser.boundary", seed: "browser.boundary.seed" });
    const markup = createForestOpeningPageMarkup(projectForestOpeningView(
      session.snapshot(), runtimeForestOpeningAssetExport,
    ));
    expect(mainSource).toContain("PrologueForestOpeningSession");
    expect(mainSource).toContain("BrowserForestOpeningPersistence");
    expect(mainSource).toContain("bindLifecycle");
    expect(mainSource).toContain("projectForestOpeningView");
    expect(mainSource).toContain("renderForestOpeningView");
    expect(mainSource).toContain("loadBrowserForestOpeningVisualAssetsFromDocument");
    expect(mainSource).toContain("createBrowserWebAudioForestOpeningPort");
    expect(mainSource).toContain("projectForestOpeningMovementAudioEvents");
    expect(mainSource).toContain("createBrowserOperationNonce");
    expect(mainSource).not.toContain("crypto.randomUUID");
    expect(mainSource).toContain('pauseDialog.addEventListener("cancel"');
    expect(mainSource).toContain("MUTE_KEY");
    expect(mainSource).toContain("enterSettlementPerimeter");
    expect(mainSource).not.toContain("ForestGrayboxController");
    expect(mainSource).not.toContain("world-scale");
    expect(mainSource).not.toMatch(/private|review\/|candidate-export|relocatePlayer|teleport|setPosition/);
    expect(mainSource).not.toMatch(/dataset\.(mode|travelerScreenX|travelerScreenY)/);
    expect(markup).not.toMatch(/data-(?:mode|traveler-screen)/);
  });
});
