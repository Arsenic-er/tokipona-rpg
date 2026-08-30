import { describe, expect, it } from "vitest";
import type { ForestGrayboxControllerSnapshot } from "./forest-graybox-controller";
import { ForestGrayboxController } from "./forest-graybox-controller";
import {
  bindForestGrayboxTouchControl,
  createForestGrayboxPageMarkup,
  projectForestGrayboxView,
  renderForestGrayboxView,
  type ForestGrayboxTouchPort,
} from "./forest-graybox-view";

const seed = "forest.graybox.view.audit";

describe("forest graybox view", () => {
  it("keeps the logical surface fixed and makes terrain continue through the frame", () => {
    const view = projectForestGrayboxView(snapshotAt({
      cameraX: 192,
      cameraY: 304,
      districtId: "forest.arrival",
      sceneId: "scene.valley.arrival_shelf",
    }));

    expect(view.viewport).toEqual({ width: 640, height: 360 });
    expect(view.edgeContinuations).toEqual(["left", "right", "bottom"]);
    expect(view.commands.filter((command) => command.kind === "material-pixels")).toHaveLength(1);
  });

  it("projects the settlement ground as one level meadow band across the crop", () => {
    const view = projectForestGrayboxView(snapshotAt({
      cameraX: 2_752,
      cameraY: 496,
      districtId: "forest.settlement",
      sceneId: "scene.valley.settlement",
    }));

    expect(view.meadow).toEqual({
      x: 0,
      y: 208,
      width: 640,
      height: 16,
      isLevel: true,
    });
  });

  it("reveals different subsets of the larger-than-screen waterwheel from each approach", () => {
    const west = projectForestGrayboxView(snapshotAt({
      cameraX: 4_544,
      cameraY: 1_120,
      districtId: "forest.waterwheel",
      sceneId: "scene.valley.waterwheel",
    })).landmarks[0]!;
    const east = projectForestGrayboxView(snapshotAt({
      cameraX: 5_568,
      cameraY: 1_480,
      districtId: "forest.waterwheel",
      sceneId: "scene.valley.waterwheel",
    })).landmarks[0]!;

    expect(west.worldBounds).toEqual({ x: 4_800, y: 1_120, width: 1_408, height: 1_024 });
    expect(west.worldBounds.width).toBeGreaterThan(640);
    expect(west.worldBounds.height).toBeGreaterThan(360);
    expect(west.fullyVisible).toBe(false);
    expect(east.fullyVisible).toBe(false);
    expect(west.visibleComponentIds.length).toBeGreaterThan(0);
    expect(east.visibleComponentIds.length).toBeGreaterThan(0);
    expect(west.visibleComponentIds).not.toEqual(east.visibleComponentIds);
    expect(west.visibleComponentIds.length).toBeLessThan(west.totalComponentCount);
    expect(east.visibleComponentIds.length).toBeLessThan(east.totalComponentCount);
  });

  it("keeps the placeholder traveler unlit and independent from the collision-body contract", () => {
    const snapshot = snapshotAt({
      cameraX: 192,
      cameraY: 304,
      districtId: "forest.arrival",
      sceneId: "scene.valley.arrival_shelf",
    });
    const view = projectForestGrayboxView(snapshot);

    expect(view.traveler.glow).toBe(false);
    expect(view.traveler.provisional).toBe(true);
    expect(view.traveler.visualBounds).not.toMatchObject(snapshot.runtime.player.body);
    expect(view.commands.some((command) => String(command.kind) === "player-glow")).toBe(false);
  });

  it("limits the semantic HUD to location help, seed, tick, and reset", () => {
    const view = projectForestGrayboxView(snapshotAt({
      cameraX: 2_752,
      cameraY: 496,
      districtId: "forest.settlement",
      sceneId: "scene.valley.settlement",
    }));

    expect(Object.keys(view.hud)).toEqual([
      "districtLabel",
      "movementHelp",
      "seed",
      "tick",
      "auditResetAction",
    ]);
    expect(view.hud).toEqual({
      districtLabel: "林间聚落",
      movementHelp: "A/D 或 ←/→ 移动 · W/↑/空格 跳跃",
      seed,
      tick: 0,
      auditResetAction: "返回检查点",
    });
  });

  it("uploads the streamed material pixels exactly once per rendered frame", () => {
    const view = projectForestGrayboxView(snapshotAt({
      cameraX: 192,
      cameraY: 304,
      districtId: "forest.arrival",
      sceneId: "scene.valley.arrival_shelf",
    }));
    const target = fakeCanvasTarget();

    renderForestGrayboxView(target.context, view);

    expect(target.uploads()).toBe(1);
  });

  it("reuses one caller-owned RGBA buffer and one per-context ImageData across frames", () => {
    const snapshot = snapshotAt({
      cameraX: 192,
      cameraY: 304,
      districtId: "forest.arrival",
      sceneId: "scene.valley.arrival_shelf",
    });
    const rgba = new Uint8ClampedArray(640 * 360 * 4);
    const first = projectForestGrayboxView(snapshot, { materialPixels: rgba });
    const second = projectForestGrayboxView(snapshot, { materialPixels: rgba });
    const firstPixels = first.commands.find((command) => command.kind === "material-pixels")!;
    const secondPixels = second.commands.find((command) => command.kind === "material-pixels")!;
    const target = fakeCanvasTarget();

    expect(firstPixels.kind === "material-pixels" && firstPixels.pixels === rgba).toBe(true);
    expect(secondPixels.kind === "material-pixels" && secondPixels.pixels === rgba).toBe(true);
    renderForestGrayboxView(target.context, first);
    renderForestGrayboxView(target.context, second);

    expect(target.imageDataAllocations()).toBe(1);
    expect(target.uploads()).toBe(2);
    expect(() => projectForestGrayboxView(snapshot, {
      materialPixels: new Uint8ClampedArray(640 * 360 * 4 - 1),
    })).toThrow(/640×360 RGBA/);
  });

  it("builds a full-screen page shell without the retired scale controls or audit drawer", () => {
    const view = projectForestGrayboxView(snapshotAt({
      cameraX: 192,
      cameraY: 304,
      districtId: "forest.arrival",
      sceneId: "scene.valley.arrival_shelf",
    }));
    const markup = createForestGrayboxPageMarkup(view, "valley_prologue");

    expect(markup).toContain('class="forest-graybox"');
    expect(markup).toContain('width="640" height="360"');
    expect(markup).toContain('data-region-id="valley_prologue"');
    expect(markup).toContain('data-district-id="forest.arrival"');
    expect(markup).toContain('aria-label="向左移动"');
    expect(markup).toContain('aria-label="向右移动"');
    expect(markup).toContain('aria-label="跳跃"');
    expect(markup).toContain('aria-label="返回最近的灰盒检查点"');
    expect(markup).not.toContain("data-profile");
    expect(markup).not.toContain("world-audit");
    expect(markup).not.toContain("视觉审计");
  });

  it("gives pointer and keyboard or AT click one equivalent touch activation", () => {
    const pointer = touchHarness();
    bindForestGrayboxTouchControl(pointer.button, "left", pointer.port);
    pointer.dispatch("pointerdown", { pointerId: 7 });
    pointer.dispatch("pointerup", { pointerId: 7 });
    pointer.dispatch("click", { detail: 1 });

    const accessibleClick = touchHarness();
    bindForestGrayboxTouchControl(accessibleClick.button, "left", accessibleClick.port);
    accessibleClick.dispatch("click", { detail: 0 });

    expect(pointer.activations).toEqual(["left"]);
    expect(accessibleClick.activations).toEqual(pointer.activations);
    expect(pointer.holds).toEqual(["left:on", "left:off"]);
    expect(accessibleClick.holds).toEqual([]);
  });
});

function snapshotAt(options: {
  readonly cameraX: number;
  readonly cameraY: number;
  readonly districtId: string;
  readonly sceneId: string;
}): ForestGrayboxControllerSnapshot {
  const source = ForestGrayboxController.fresh({ seed }).snapshot();
  return Object.freeze({
    ...source,
    runtime: Object.freeze({
      ...source.runtime,
      player: Object.freeze({
        ...source.runtime.player,
        position: Object.freeze({ x: options.cameraX + 320, y: options.cameraY + 180 }),
      }),
      camera: Object.freeze({ ...source.runtime.camera, x: options.cameraX, y: options.cameraY }),
    }),
    location: Object.freeze({
      ...source.location,
      districtId: options.districtId,
      sceneId: options.sceneId,
      position: Object.freeze({ x: options.cameraX + 320, y: options.cameraY + 180 }),
    }),
  });
}

function fakeCanvasTarget(): {
  readonly context: CanvasRenderingContext2D;
  readonly uploads: () => number;
  readonly imageDataAllocations: () => number;
} {
  let uploadCount = 0;
  let imageDataAllocationCount = 0;
  const materialContext = {
    createImageData: (width: number, height: number) => {
      imageDataAllocationCount += 1;
      return { data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: "srgb" };
    },
    putImageData: () => { uploadCount += 1; },
  };
  const surface = { width: 0, height: 0, getContext: () => materialContext };
  const noop = () => undefined;
  const context = {
    canvas: { ownerDocument: { createElement: () => surface } },
    fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, globalAlpha: 1,
    imageSmoothingEnabled: false,
    fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arc: noop, fill: noop, stroke: noop, save: noop, restore: noop, drawImage: noop,
  } as unknown as CanvasRenderingContext2D;
  return {
    context,
    uploads: () => uploadCount,
    imageDataAllocations: () => imageDataAllocationCount,
  };
}

function touchHarness(): {
  readonly button: HTMLButtonElement;
  readonly port: ForestGrayboxTouchPort;
  readonly activations: string[];
  readonly holds: string[];
  readonly dispatch: (type: string, event: Readonly<Record<string, number>>) => void;
} {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const activations: string[] = [];
  const holds: string[] = [];
  const button = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const entries = listeners.get(type) ?? [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    setPointerCapture: () => undefined,
    hasPointerCapture: () => true,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLButtonElement;
  const port: ForestGrayboxTouchPort = {
    activate: (action) => activations.push(action),
    setHeld: (action, active) => holds.push(`${action}:${active ? "on" : "off"}`),
  };
  return {
    button,
    port,
    activations,
    holds,
    dispatch: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}
