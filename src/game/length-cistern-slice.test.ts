import { describe, expect, it } from "vitest";
import type { MpRecoveryProposal, PointPx, TeloCanonicalAst } from "../spells/cast-plan";
import { Material } from "../sim/materials";
import { LengthCisternSlice, type WorldMaterialEdit } from "./length-cistern-slice";

const ast = (lengthModifier: TeloCanonicalAst["lengthModifier"]): TeloCanonicalAst => ({
  head: "word.telo",
  lengthModifier,
});

const rockColumn = (cellX: number, startY: number, height: number): WorldMaterialEdit[] =>
  Array.from({ length: height }, (_, offset) => ({
    cellX,
    cellY: startY + offset,
    material: Material.Rock,
  }));

describe("LengthCisternSlice", () => {
  it.each([
    ["word.lili", 48, 6, 18],
    [null, 96, 5, 19],
    ["word.suli", 192, 10, 14],
  ] as const)("manifests the exact %s footprint and charges once", (modifier, cells, cost, remainingMp) => {
    const slice = new LengthCisternSlice(80, 40);
    const plan = slice.preview({
      canonicalAst: ast(modifier),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
    });

    expect(plan.preview.geometry).toBe(plan.execution.geometry);
    expect(plan.preview.geometry.simulationCellGeometry.manifestationCells).toHaveLength(cells);
    const first = slice.confirm(plan, `cast.${modifier ?? "default"}`, []);
    const duplicate = slice.confirm(plan, `cast.${modifier ?? "default"}`, []);

    expect(first).toMatchObject({ committed: true, duplicate: false, mpCharge: cost });
    expect(duplicate).toMatchObject({ committed: true, duplicate: true, mpCharge: 0 });
    expect(slice.snapshot()).toEqual({ mp: remainingMp, worldVersion: 1 });
    expect(plan.execution.geometry.simulationCellGeometry.manifestationCells.every((cell) =>
      slice.materialAtCell(cell.x, cell.y) === Material.Water,
    )).toBe(true);
  });

  it("uses the ledger as the only MP source for recovery and later previews", () => {
    const slice = new LengthCisternSlice(80, 40, 18, 123, 26);
    const proposal: MpRecoveryProposal = {
      schema: "cistern.mp-recovery.v0.1",
      source: "natural",
      recoveryId: "natural.slice.1",
      amountPolicy: { kind: "fixed", amountMp: 1.25 },
      capPolicy: { kind: "max_mp" },
      answerAccepted: null,
      evidenceEligible: null,
    };

    const receipt = slice.applyMpRecovery(proposal);

    expect(receipt).toMatchObject({ restoredMp: 1.25, afterMp: 19.25 });
    expect(slice.mpSnapshot()).toEqual({ mp: 19.25, currentMp: 19.25, maxMp: 26, worldVersion: 0 });
    expect(slice.preview({
      canonicalAst: ast("word.suli"),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
    }).quotedCurrentMp).toBe(19.25);
  });

  it("truncates preview to the nearest free endpoint without changing class", () => {
    const slice = new LengthCisternSlice(80, 40);
    slice.applyWorldEdits(rockColumn(24, 7, 7));

    const plan = slice.preview({
      canonicalAst: ast(null),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
    });

    expect(plan.requestedLengthClass).toBe("default");
    expect(plan.resolvedLengthClass).toBe("default");
    expect(plan.preview.geometry.worldPixelGeometry.realizedLengthPx).toBe(28);
    expect(plan.canConfirm).toBe(true);
    expect(plan.blockingObjectId).toBe("material.cell.24.7");
  });

  it("rejects a below-minimum footprint before any world mutation or charge", () => {
    const slice = new LengthCisternSlice(80, 40);
    slice.applyWorldEdits(rockColumn(20, 7, 7));
    const plan = slice.preview({
      canonicalAst: ast(null),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
    });

    const result = slice.confirm(plan, "cast.blocked", []);
    expect(plan.canConfirm).toBe(false);
    expect(plan.rejectionCode).toBe("requested_class_cannot_be_realized_here");
    expect(result).toMatchObject({ committed: false, mpCharge: 0 });
    expect(slice.snapshot()).toEqual({ mp: 24, worldVersion: 1 });
  });

  it("invalidates previews after a controlled external world edit", () => {
    const slice = new LengthCisternSlice(80, 40);
    const plan = slice.preview({
      canonicalAst: ast("word.lili"),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
    });
    slice.applyWorldEdits([{ cellX: 70, cellY: 30, material: Material.Rock }]);

    const result = slice.confirm(plan, "cast.changed-world", []);

    expect(result).toMatchObject({ committed: false, mpCharge: 0, rejectionCode: "world_version_mismatch" });
    expect(slice.snapshot()).toEqual({ mp: 24, worldVersion: 1 });
    expect(plan.execution.geometry.simulationCellGeometry.manifestationCells.every((cell) =>
      slice.materialAtCell(cell.x, cell.y) === Material.Air,
    )).toBe(true);
  });

  it("rechecks current living zones when a fox moves in after preview", () => {
    const slice = new LengthCisternSlice(80, 40);
    const plan = slice.preview({
      canonicalAst: ast("word.lili"),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
      livingSafetyZones: [],
    });

    const result = slice.confirm(plan, "cast.fox-moved", [{
      entityId: "creature.fox.1",
      boundsPx: { x: 28, y: 18, width: 4, height: 4 },
    }]);

    expect(result).toMatchObject({ committed: false, mpCharge: 0, rejectionCode: "world_mutation_rejected" });
    expect(slice.snapshot()).toEqual({ mp: 24, worldVersion: 0 });
    expect(plan.execution.geometry.simulationCellGeometry.manifestationCells.every((cell) =>
      slice.materialAtCell(cell.x, cell.y) === Material.Air,
    )).toBe(true);
  });

  it("keeps living entities outside the manifestation safety volume at preview", () => {
    const slice = new LengthCisternSlice(80, 40);
    const zones = [{
      entityId: "creature.fox.1",
      boundsPx: { x: 52, y: 18, width: 4, height: 4 },
    }] as const;
    const plan = slice.preview({
      canonicalAst: ast("word.suli"),
      anchorPx: { x: 20, y: 20 },
      direction: { x: 1, y: 0 },
      livingSafetyZones: zones,
    });

    expect(plan).toMatchObject({
      canConfirm: false,
      rejectionCode: "living_safety_volume_blocked",
      blockedLivingEntityId: "creature.fox.1",
    });
    expect(slice.confirm(plan, "cast.fox-safe", zones)).toMatchObject({ committed: false, mpCharge: 0 });
  });

  it("keeps manifestation cell count fixed across eight directions", () => {
    const directions: readonly PointPx[] = [
      { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
      { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    ];
    const slice = new LengthCisternSlice(100, 100);

    for (const direction of directions) {
      const plan = slice.preview({ canonicalAst: ast(null), anchorPx: { x: 80, y: 80 }, direction });
      expect(plan.canConfirm).toBe(true);
      expect(plan.preview.geometry.simulationCellGeometry.manifestationCellCount).toBe(96);
      expect(plan.preview.geometry.worldPixelGeometry.areaPx2).toBe(384);
    }
  });

  it("prevalidates a world edit batch and advances physics revisions", () => {
    const slice = new LengthCisternSlice(20, 20);
    expect(() => slice.applyWorldEdits([
      { cellX: 2, cellY: 2, material: Material.Rock },
      { cellX: 20, cellY: 2, material: Material.Rock },
    ])).toThrow(/inside the grid/);
    expect(slice.materialAtCell(2, 2)).toBe(Material.Air);
    expect(slice.snapshot().worldVersion).toBe(0);

    slice.applyWorldEdits([{ cellX: 2, cellY: 2, material: Material.Water }]);
    expect(slice.snapshot().worldVersion).toBe(1);
    slice.advancePhysics();
    expect(slice.snapshot().worldVersion).toBe(2);
  });

  it("evaluates completion from bounded water cells rather than the utterance", () => {
    const slice = new LengthCisternSlice(20, 20);
    const receiver = {
      receiverId: "receiver.short",
      boundsCells: { x: 4, y: 5, width: 4, height: 2 },
      minimumWaterCells: 5,
    } as const;
    slice.applyWorldEdits(Array.from({ length: 5 }, (_, offset) => ({
      cellX: 4 + offset,
      cellY: 5,
      material: Material.Water,
    })));

    expect(slice.evaluateReceiver(receiver)).toEqual({
      receiverId: "receiver.short",
      waterCells: 4,
      minimumWaterCells: 5,
      satisfied: false,
    });
    slice.applyWorldEdits([{ cellX: 7, cellY: 6, material: Material.Water }]);
    expect(slice.evaluateReceiver(receiver)).toMatchObject({ waterCells: 5, satisfied: true });
  });

  it("rejects unsafe, out-of-bounds and impossible receiver specifications", () => {
    const slice = new LengthCisternSlice(20, 20);
    expect(() => slice.evaluateReceiver({
      receiverId: "receiver.extreme",
      boundsCells: {
        x: Number.MAX_SAFE_INTEGER,
        y: 0,
        width: Number.MAX_SAFE_INTEGER,
        height: 1,
      },
      minimumWaterCells: 1,
    })).toThrow(/safe integer/);
    expect(() => slice.evaluateReceiver({
      receiverId: "receiver.outside",
      boundsCells: { x: 19, y: 19, width: 2, height: 1 },
      minimumWaterCells: 1,
    })).toThrow(/fully inside/);
    expect(() => slice.evaluateReceiver({
      receiverId: "receiver.zero",
      boundsCells: { x: 1, y: 1, width: 2, height: 2 },
      minimumWaterCells: 0,
    })).toThrow(/positive/);
    expect(() => slice.evaluateReceiver({
      receiverId: "receiver.impossible",
      boundsCells: { x: 1, y: 1, width: 2, height: 2 },
      minimumWaterCells: 5,
    })).toThrow(/capacity/);
  });
});
