import { describe, expect, it, vi } from "vitest";
import {
  drawForestOpeningLocalTraveler,
  loadBrowserLocalTravelerAtlas,
  localTravelerBounds,
} from "./browser-local-traveler-atlas";
import type { ForestOpeningPublicView } from "./forest-opening-view";

const fakeImage = (width = 192, height = 96) => ({
  naturalWidth: width,
  naturalHeight: height,
}) as never;

const view = (facing: -1 | 1 = 1): ForestOpeningPublicView => ({
  mode: "forest_opening",
  tick: 18,
  worldMinute: 360,
  presentation: { kind: "procedural_candidate", approvedAssetPackId: null },
  camera: { x: 100, y: 200, width: 640, height: 360, facing: "right" },
  traveler: {
    position: { x: 120, y: 240 }, facing, animationId: "run", frame: 2,
    visualHeightPx: 19, glow: false,
  },
  environment: [],
  obstacle: {
    solutionId: null, interactionId: null, interactionPrompt: null, visuallyComplete: false,
    glyph: { wordId: "word.telo", observed: false, meaningKnown: false, pronunciationKnown: false },
  },
  creatures: [],
  dialogue: null,
  hud: { health: 100, maxHealth: 100, mp: 12, maxMp: 24, objective: "" },
});

describe("browser local traveler atlas", () => {
  it("loads only the exact reviewed 192x96 development atlas", async () => {
    expect(await loadBrowserLocalTravelerAtlas(false, vi.fn())).toEqual({ status: "unavailable" });
    expect((await loadBrowserLocalTravelerAtlas(true, async () => fakeImage())).status).toBe("ready");
    expect(await loadBrowserLocalTravelerAtlas(true, async () => fakeImage(191, 96)))
      .toEqual({ status: "unavailable" });
  });

  it("anchors the 24px frame to the unchanged 12x14 collision feet and mirrors left", () => {
    expect(localTravelerBounds(view())).toEqual({ x: 14, y: 32, width: 24, height: 24 });
    const context = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    drawForestOpeningLocalTraveler(context, view(-1), { image: fakeImage(), version: "v0.3" });
    expect(context.translate).toHaveBeenCalledWith(52, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledOnce();
  });
});
