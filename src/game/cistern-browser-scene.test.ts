import { describe, expect, it } from "vitest";
import { Material } from "../sim/materials";
import { createCisternBrowserScene } from "./cistern-browser-scene";
import {
  CisternDemoController,
  type CisternExpressionId,
} from "./cistern-demo";

const directExpressions: readonly CisternExpressionId[] = ["telo_lili", "telo", "telo_suli"];

describe("cistern browser scene", () => {
  it("keeps all three receiver interiors empty and completes the shared 135x240 scene", () => {
    const scene = createCisternBrowserScene();
    expect(scene).toMatchObject({
      widthCells: 135,
      heightCells: 240,
      cellSizePx: 2,
      canvasWidthPx: 270,
      canvasHeightPx: 480,
    });

    const demo = new CisternDemoController({
      widthCells: scene.widthCells,
      heightCells: scene.heightCells,
      initialMp: 24,
      maxMp: 26,
      stageSpecs: scene.stageSpecs,
      initialWorldEdits: scene.initialWorldEdits,
    });

    for (const stage of scene.stageSpecs) {
      const { x, y, width, height } = stage.boundsCells;
      for (let cellY = y; cellY < y + height; cellY += 1) {
        for (let cellX = x; cellX < x + width; cellX += 1) {
          expect(demo.materialAtCell(cellX, cellY)).toBe(Material.Air);
        }
      }
    }

    const initialMp = demo.snapshot().mp;
    const charges: number[] = [];
    directExpressions.forEach((expression, index) => {
      demo.setExpression(expression);
      demo.setDirection("east");
      demo.targetCurrentReceiver();
      const preview = demo.beginPreview();
      expect(preview).toMatchObject({ accepted: true, rejectionCode: null });
      expect(preview.plan?.canConfirm).toBe(true);
      const confirmation = demo.confirmPending(`cistern.browser.cast.${index}`);
      expect(confirmation).toMatchObject({ accepted: true, rejectionCode: null });
      expect(confirmation.execution?.committed).toBe(true);
      charges.push(confirmation.execution?.mpCharge ?? 0);
    });

    const completed = demo.snapshot();
    expect(charges).toEqual([6, 5, 10]);
    expect(initialMp - completed.mp).toBe(21);
    expect(completed).toMatchObject({ stage: "completed", completed: true, mp: 3, maxMp: 26 });
    expect(completed.receivers.every((receiver) => receiver.latched)).toBe(true);
  });
});
