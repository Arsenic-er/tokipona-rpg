import { describe, expect, it } from "vitest";
import { CisternLearningSession } from "../learning/cistern-session";
import { Material } from "../sim/materials";
import {
  CISTERN_DIRECTIONS,
  CisternDemoController,
  type CisternExpressionId,
} from "./cistern-demo";

const selectDirectSolution = (
  demo: CisternDemoController,
  expression: CisternExpressionId,
): void => {
  demo.setExpression(expression);
  demo.setDirection("east");
  demo.targetCurrentReceiver();
};

describe("CisternDemoController", () => {
  it("snaps target anchors to the 2px grid and freezes controls while preview is pending", () => {
    const demo = new CisternDemoController();
    demo.setExpression("telo");
    demo.setDirection("north_east");
    const positioned = demo.setTargetAnchorPx({ x: 49, y: 71 });

    expect(positioned.targetAnchorPx).toEqual({ x: 50, y: 72 });
    const preview = demo.beginPreview();
    expect(preview).toMatchObject({ accepted: true, rejectionCode: null });
    expect(preview.plan?.preview.geometry).toBe(preview.plan?.execution.geometry);
    expect(demo.beginPreview()).toMatchObject({
      accepted: false,
      rejectionCode: "pending_preview_exists",
    });
    expect(() => demo.setExpression("telo_suli")).toThrow(/preview is pending/);
    expect(() => demo.setDirection("west")).toThrow(/preview is pending/);
    expect(() => demo.setTargetAnchorPx({ x: 20, y: 20 })).toThrow(/preview is pending/);

    expect(demo.cancelPending().pendingPlan).toBeNull();
    expect(demo.setExpression("telo_suli").selectedExpression).toBe("telo_suli");
  });

  it("completes short, default, and long receivers from world predicates", () => {
    const demo = new CisternDemoController();
    expect(demo.snapshot()).toMatchObject({ mp: 24, worldVersion: 1, stage: "short" });

    selectDirectSolution(demo, "telo_lili");
    demo.beginPreview();
    const short = demo.confirmPending("cistern.cast.short");
    expect(short.execution).toMatchObject({ committed: true, mpCharge: 6 });
    expect(short.snapshot).toMatchObject({ mp: 18, worldVersion: 2, stage: "default" });
    expect(short.snapshot.receivers[0]).toMatchObject({ satisfied: true, latched: true });

    selectDirectSolution(demo, "telo");
    demo.beginPreview();
    const middle = demo.confirmPending("cistern.cast.default");
    expect(middle.execution).toMatchObject({ committed: true, mpCharge: 5 });
    expect(middle.snapshot).toMatchObject({ mp: 13, worldVersion: 3, stage: "long" });

    selectDirectSolution(demo, "telo_suli");
    demo.beginPreview();
    const long = demo.confirmPending("cistern.cast.long");
    expect(long.execution).toMatchObject({ committed: true, mpCharge: 10 });
    expect(long.snapshot).toMatchObject({ mp: 3, worldVersion: 4, stage: "completed", completed: true });
    expect(long.snapshot.receivers.every((receiver) => receiver.latched)).toBe(true);
  });

  it("keeps the ledger as the sole MP truth and restores after a wrong meditation answer", () => {
    const learning = new CisternLearningSession({
      playerSaveId: "save.demo.recovery",
      expressionCapacity: 2,
    });
    const demo = new CisternDemoController({ initialMp: 24, maxMp: 26 });
    selectDirectSolution(demo, "telo_lili");
    demo.beginPreview();
    demo.confirmPending("cistern.cast.before-meditation");
    const worldVersion = demo.snapshot().worldVersion;

    const result = demo.applyMpRecovery(learning.proposeMeditationRecovery({
      recoveryId: "meditation.demo.wrong",
      answerAccepted: false,
      evidenceEligible: false,
    }));

    expect(learning.snapshot()).not.toHaveProperty("currentMp");
    expect(result).toMatchObject({
      accepted: true,
      receipt: { restoredMp: 3, afterMp: 21, answerAccepted: false },
      snapshot: { mp: 21, maxMp: 26, worldVersion },
    });
  });

  it("applies natural recovery once and rejects recovery during a pending preview", () => {
    const learning = new CisternLearningSession({ playerSaveId: "save.demo.natural", expressionCapacity: 2 });
    const demo = new CisternDemoController({ initialMp: 20, maxMp: 26 });
    const proposal = learning.proposeNaturalRecovery({ recoveryId: "natural.demo.1", ticks: 4 });
    const worldVersion = demo.snapshot().worldVersion;

    expect(demo.applyMpRecovery(proposal)).toMatchObject({
      accepted: true,
      receipt: { restoredMp: 1, afterMp: 21 },
      snapshot: { worldVersion },
    });
    expect(demo.applyMpRecovery(proposal)).toMatchObject({
      accepted: true,
      receipt: { reason: "duplicate", restoredMp: 0, afterMp: 21 },
    });
    demo.beginPreview();
    expect(demo.applyMpRecovery(learning.proposeNaturalRecovery({ recoveryId: "natural.demo.2", ticks: 4 })))
      .toMatchObject({ accepted: false, receipt: null, rejectionCode: "pending_preview_exists" });
    expect(demo.snapshot().mp).toBe(21);
  });

  it("blocks physics while a preview is pending and advances after cancellation", () => {
    const demo = new CisternDemoController();
    const before = demo.snapshot();
    demo.beginPreview();

    const blocked = demo.advancePhysics(3);
    expect(blocked).toMatchObject({
      advanced: false,
      ticks: 0,
      rejectionCode: "pending_preview_exists",
    });
    expect(blocked.snapshot.worldVersion).toBe(before.worldVersion);

    demo.cancelPending();
    const advanced = demo.advancePhysics(3);
    expect(advanced).toMatchObject({ advanced: true, ticks: 3, rejectionCode: null });
    expect(advanced.snapshot.worldVersion).toBe(before.worldVersion + 1);
  });

  it("rescans living safety zones at confirmation and clears the rejected preview", () => {
    const demo = new CisternDemoController();
    demo.beginPreview([]);
    const plan = demo.snapshot().pendingPlan!;
    const anchor = plan.execution.geometry.worldPixelGeometry.anchorPx;

    const result = demo.confirmPending("cistern.cast.fox", [{
      entityId: "creature.fox.moved",
      boundsPx: { x: anchor.x + 4, y: anchor.y - 2, width: 4, height: 4 },
    }]);

    expect(result).toMatchObject({
      accepted: false,
      execution: { committed: false, mpCharge: 0, rejectionCode: "world_mutation_rejected" },
      snapshot: { mp: 24, worldVersion: 1, stage: "short", pendingPlan: null },
    });
    expect(plan.execution.geometry.simulationCells.every((cell) =>
      demo.materialAtCell(cell.x, cell.y) === Material.Air,
    )).toBe(true);
  });

  it("supports all eight directions with one deterministic manifestation footprint", () => {
    const demo = new CisternDemoController();
    demo.setTargetAnchorPx({ x: 100, y: 30 });
    demo.setExpression("telo_lili");

    for (const direction of Object.keys(CISTERN_DIRECTIONS) as Array<keyof typeof CISTERN_DIRECTIONS>) {
      demo.setDirection(direction);
      const plan = demo.beginPreview().plan!;
      expect(plan.execution.geometry.simulationCellGeometry.manifestationCells).toHaveLength(48);
      expect(plan.execution.geometry.worldPixelGeometry.areaPx2).toBe(192);
      demo.cancelPending();
    }
  });

  it("keeps a latched receiver complete after its instantaneous predicate changes", () => {
    const demo = new CisternDemoController();
    selectDirectSolution(demo, "telo_lili");
    demo.beginPreview();
    demo.confirmPending("cistern.cast.latch");

    for (let batch = 0; batch < 8; batch += 1) demo.advancePhysics(20);
    const snapshot = demo.snapshot();

    expect(snapshot.stage).toBe("default");
    expect(snapshot.receivers[0]?.latched).toBe(true);
  });

  it("rebuilds the same deterministic scene, controls, MP, revision, and predicates", () => {
    const fresh = new CisternDemoController();
    const initial = fresh.snapshot();
    const initialSamples = [
      fresh.materialAtCell(0, 39),
      fresh.materialAtCell(50, 39),
      fresh.materialAtCell(99, 39),
      fresh.materialAtCell(10, 10),
    ];

    selectDirectSolution(fresh, "telo_lili");
    fresh.beginPreview();
    fresh.confirmPending("cistern.cast.before-reset");
    fresh.advancePhysics(10);
    fresh.setDirection("north");
    fresh.setTargetAnchorPx({ x: 33, y: 17 });

    const reset = fresh.reset();
    const resetSamples = [
      fresh.materialAtCell(0, 39),
      fresh.materialAtCell(50, 39),
      fresh.materialAtCell(99, 39),
      fresh.materialAtCell(10, 10),
    ];

    expect(reset).toEqual(initial);
    expect(resetSamples).toEqual(initialSamples);
    expect(resetSamples).toEqual([Material.Rock, Material.Rock, Material.Rock, Material.Air]);
  });

  it("reports confirm without pending as a no-op", () => {
    const demo = new CisternDemoController();
    const before = demo.snapshot();

    const result = demo.confirmPending("cistern.cast.none");

    expect(result).toMatchObject({
      accepted: false,
      execution: null,
      rejectionCode: "no_pending_preview",
      snapshot: { mp: before.mp, worldVersion: before.worldVersion },
    });
  });
});
