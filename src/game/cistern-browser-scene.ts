import { Material } from "../sim/materials";
import {
  createDefaultCisternStages,
  type CisternReceiverStageSpec,
} from "./cistern-demo";
import type { WorldMaterialEdit } from "./length-cistern-slice";

export const CISTERN_BROWSER_WIDTH_CELLS = 135;
export const CISTERN_BROWSER_HEIGHT_CELLS = 240;
export const CISTERN_BROWSER_CELL_SIZE_PX = 2;

export interface CisternBrowserScene {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly cellSizePx: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly stageSpecs: readonly [
    CisternReceiverStageSpec,
    CisternReceiverStageSpec,
    CisternReceiverStageSpec,
  ];
  readonly initialWorldEdits: readonly WorldMaterialEdit[];
}

export const createCisternBrowserScene = (): CisternBrowserScene => {
  const widthCells = CISTERN_BROWSER_WIDTH_CELLS;
  const heightCells = CISTERN_BROWSER_HEIGHT_CELLS;
  const cellSizePx = CISTERN_BROWSER_CELL_SIZE_PX;
  const stageSpecs = createDefaultCisternStages(widthCells, heightCells);
  return Object.freeze({
    widthCells,
    heightCells,
    cellSizePx,
    canvasWidthPx: widthCells * cellSizePx,
    canvasHeightPx: heightCells * cellSizePx,
    stageSpecs,
    initialWorldEdits: createInitialWorldEdits(widthCells, heightCells, stageSpecs),
  });
};

const createInitialWorldEdits = (
  widthCells: number,
  heightCells: number,
  stageSpecs: readonly [
    CisternReceiverStageSpec,
    CisternReceiverStageSpec,
    CisternReceiverStageSpec,
  ],
): readonly WorldMaterialEdit[] => {
  const edits = new Map<string, WorldMaterialEdit>();
  const setMaterial = (cellX: number, cellY: number, material: Material): void => {
    if (cellX < 0 || cellY < 0 || cellX >= widthCells || cellY >= heightCells) {
      return;
    }
    edits.set(`${cellX}:${cellY}`, Object.freeze({ cellX, cellY, material }));
  };

  for (let cellY = 0; cellY < heightCells; cellY += 1) {
    const leftDepth = 8 + Math.floor(3 * Math.sin(cellY * 0.12));
    const rightDepth = 9 + Math.floor(3 * Math.sin(cellY * 0.09 + 1.3));
    for (let cellX = 0; cellX < widthCells; cellX += 1) {
      if (cellX >= leftDepth && cellX < widthCells - rightDepth) {
        continue;
      }
      setMaterial(cellX, cellY, pixelNoise(cellX, cellY) > 76 ? Material.Soil : Material.Rock);
    }
  }

  const floorCellY = heightCells - 1;
  for (let cellX = 0; cellX < widthCells; cellX += 1) {
    setMaterial(
      cellX,
      floorCellY,
      pixelNoise(cellX, floorCellY) > 84 ? Material.Soil : Material.Rock,
    );
  }

  for (const spec of stageSpecs) {
    const bounds = spec.boundsCells;
    const left = bounds.x - 1;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;

    // Receiver predicates own the interior. Cave walls must never pre-fill it.
    for (let cellY = bounds.y; cellY < bottom; cellY += 1) {
      for (let cellX = bounds.x; cellX < right; cellX += 1) {
        edits.delete(`${cellX}:${cellY}`);
      }
    }

    for (let cellY = bounds.y - 1; cellY <= bottom; cellY += 1) {
      setMaterial(left, cellY, Material.Rock);
      setMaterial(right, cellY, Material.Rock);
    }
    for (let cellX = left; cellX <= right; cellX += 1) {
      setMaterial(cellX, bottom, Material.Rock);
    }
  }

  return Object.freeze([...edits.values()]);
};

const pixelNoise = (x: number, y: number): number => {
  let value = Math.imul(x + 13, 374761393) ^ Math.imul(y + 29, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) & 127;
};
