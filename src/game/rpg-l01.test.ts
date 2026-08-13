import { describe, expect, it } from "vitest";
import { CisternLearningSession } from "../learning/cistern-session";
import type { LearningProgressionSnapshot } from "../learning/progression";
import type { LivingSafetyZone } from "../spells/cast-plan";
import {
  RPG_L01_DIRECT_EXPRESSIONS,
  RPG_L01_QUEST_ID,
  RPG_L01_WORLD_FLAGS,
  RpgL01RoomSession,
  createRpgL01InitialSession,
} from "./rpg-l01";

const preparedLearning = (sessionId: string): LearningProgressionSnapshot => {
  const learning = new CisternLearningSession({ playerSaveId: sessionId, expressionCapacity: 2 });
  for (const wordId of ["telo", "lili", "suli"] as const) {
    learning.discoverGlyph({
      wordId,
      occurrenceId: `l01.wall.${wordId}`,
      locationId: `chapter01.high-cistern.${wordId}`,
    });
    learning.attuneGlyph({
      wordId,
      occurrenceId: `l01.attune.${wordId}`,
      environmentalWitnessId: `l01.witness.${wordId}`,
    });
  }
  return learning.snapshot().learning;
};

const room = (options: { readonly currentMp?: number; readonly prepared?: boolean } = {}): RpgL01RoomSession => {
  const sessionId = `save.rpg-l01.${options.currentMp ?? 24}.${options.prepared === false ? "fresh" : "prepared"}`;
  return new RpgL01RoomSession(createRpgL01InitialSession({
    sessionId,
    currentMp: options.currentMp,
    maxMp: 24,
    learning: options.prepared === false ? undefined : preparedLearning(sessionId),
  }));
};

const castCurrentStage = (
  target: RpgL01RoomSession,
  stage: "short" | "default" | "long",
  transactionId: string,
) => {
  target.setExpression(RPG_L01_DIRECT_EXPRESSIONS[stage]);
  target.setDirection("east");
  target.targetCurrentReceiver();
  const preview = target.beginPreview();
  expect(preview.plan).toMatchObject({ canConfirm: true });
  return target.confirmPending(transactionId);
};

const flagIsTrue = (target: RpgL01RoomSession, flagId: string): boolean =>
  Object.values(target.snapshot().session.world.flags).some((flag) =>
    flag.flagId === flagId && flag.value === true
  );

describe("RpgL01RoomSession", () => {
  it("completes the direct three-receiver route for exactly 21 MP and writes the exit flags", () => {
    const target = room();
    expect(target.entryRecoveryReceipt).toMatchObject({ source: "checkpoint", restoredMp: 0, beforeMp: 24, afterMp: 24 });
    const learningBefore = target.snapshot().session.learning.revision;
    const charges = [
      castCurrentStage(target, "short", "l01.cast.short.001"),
      castCurrentStage(target, "default", "l01.cast.default.001"),
      castCurrentStage(target, "long", "l01.cast.long.001"),
    ].map((result) => result.confirmation?.execution?.mpCharge);

    expect(charges).toEqual([6, 5, 10]);
    expect(target.snapshot()).toMatchObject({
      completed: true,
      resolutionMode: "direct_language",
      session: {
        mp: { currentMp: 3, maxMp: 24, worldVersion: 3 },
        quests: { [RPG_L01_QUEST_ID]: { stageId: "completed", stageOrdinal: 4 } },
      },
      cistern: { completed: true, stage: "completed", mp: 3 },
    });
    expect(target.snapshot().session.learning.revision).toBeGreaterThan(learningBefore);
    expect(flagIsTrue(target, RPG_L01_WORLD_FLAGS.highCisternReconnected)).toBe(true);
    expect(flagIsTrue(target, RPG_L01_WORLD_FLAGS.upperChannelAvailable)).toBe(true);
    expect(flagIsTrue(target, RPG_L01_WORLD_FLAGS.exitLadderLowered)).toBe(true);
  });

  it("keeps an unaffordable long request long instead of silently downgrading it", () => {
    const target = room({ currentMp: 4 });
    // Entry recovery is deliberately light: it cannot make the 10 MP long cast affordable.
    expect(target.snapshot().session.mp.currentMp).toBe(7.5);
    target.setExpression("telo_suli");
    target.setTargetAnchorPx({ x: 20, y: 20 });
    const preview = target.beginPreview();

    expect(preview.plan).toMatchObject({
      requestedLengthClass: "long",
      resolvedLengthClass: "long",
      canConfirm: false,
      rejectionCode: "requested_class_requires_more_mp",
    });
    const result = target.confirmPending("l01.cast.unaffordable-long");
    expect(result).toMatchObject({ accepted: false, reason: "cast_rejected" });
    expect(target.snapshot()).toMatchObject({
      cistern: { selectedExpression: "telo_suli", stage: "short" },
      session: { mp: { currentMp: 7.5, worldVersion: 0 } },
    });
  });

  it("charges a legal wrong-length cast without advancing the receiver, quest, or evidence", () => {
    const target = room();
    const before = target.snapshot().session;
    target.setExpression("telo");
    target.setDirection("east");
    target.setTargetAnchorPx({ x: 20, y: 20 });
    const preview = target.beginPreview();
    expect(preview.plan).toMatchObject({ canConfirm: true, resolvedLengthClass: "default" });

    const result = target.confirmPending("l01.cast.legal-wrong-length");

    expect(result).toMatchObject({ accepted: true, reason: "confirmed", evidence: null });
    expect(result.snapshot.session.mp).toMatchObject({ currentMp: 19, maxMp: 24, worldVersion: 1 });
    expect(result.snapshot.session.learning).toEqual(before.learning);
    expect(result.snapshot.session.quests).toEqual(before.quests);
    expect(result.snapshot.cistern).toMatchObject({ stage: "short", mp: 19, pendingPlan: null });
    expect(flagIsTrue(target, RPG_L01_WORLD_FLAGS.shortReceiverSatisfied)).toBe(false);
  });
  it("rechecks living safety at confirmation and commits no MP, water, quest, or evidence on rejection", () => {
    const target = room();
    const before = target.snapshot().session;
    target.setExpression("telo_lili");
    target.setTargetAnchorPx({ x: 20, y: 20 });
    const preview = target.beginPreview();
    const cell = preview.plan!.preview.geometry.simulationCellGeometry.manifestationCells[0]!;
    const newLivingZone: LivingSafetyZone = {
      entityId: "creature.rabbit.entered-late",
      boundsPx: { x: cell.x * 2, y: cell.y * 2, width: 2, height: 2 },
      marginPx: 0,
    };

    const result = target.confirmPending("l01.cast.recheck.001", [newLivingZone]);

    expect(result).toMatchObject({
      accepted: false,
      reason: "cast_rejected",
      confirmation: { execution: { committed: false, rejectionCode: "world_mutation_rejected" } },
    });
    expect(target.snapshot().session.mp).toEqual(before.mp);
    expect(target.snapshot().session.learning).toEqual(before.learning);
    expect(target.snapshot().session.quests).toEqual(before.quests);
    expect(target.snapshot().cistern.stage).toBe("short");
  });

  it("uses the maintenance route to advance the quest while producing zero language evidence and charging zero MP", () => {
    const target = room();
    const before = target.snapshot().session;

    const result = target.useMaintenanceToolBypass("l01.tool-bypass.001");

    expect(result).toMatchObject({ accepted: true, reason: "completed" });
    expect(result.snapshot).toMatchObject({
      completed: true,
      resolutionMode: "tool_bypass",
      session: { quests: { [RPG_L01_QUEST_ID]: { stageId: "completed", stageOrdinal: 4 } } },
      cistern: { stage: "short", completed: false },
    });
    expect(result.snapshot.session.mp).toEqual(before.mp);
    expect(result.snapshot.session.learning).toEqual(before.learning);
    expect(flagIsTrue(target, RPG_L01_WORLD_FLAGS.toolBypassUsed)).toBe(true);
  });

  it("rebuilds filled water, spent MP, evidence, and checkpoint recovery receipts through reset and save/load", () => {
    const target = room();
    castCurrentStage(target, "short", "l01.cast.persist.short");
    const beforeReset = target.snapshot();
    const beforeLearningReceipts = Object.values(beforeReset.session.receiptIndex)
      .filter((receipt) => receipt.domain === "learning").length;

    const reset = target.resetToEntryCheckpoint("l01.reset.entry.001");
    expect(reset.resetApplied).toBe(true);
    expect(reset.snapshot.session.mp).toEqual(beforeReset.session.mp);
    expect(reset.snapshot.session.learning).toEqual(beforeReset.session.learning);
    expect(reset.snapshot.cistern).toMatchObject({ stage: "default", mp: beforeReset.session.mp.currentMp });
    expect(reset.snapshot.cistern.receivers[0]).toMatchObject({ latched: true, satisfied: true });
    expect(Object.values(reset.snapshot.session.receiptIndex)
      .filter((receipt) => receipt.domain === "learning")).toHaveLength(beforeLearningReceipts);

    const loaded = RpgL01RoomSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.entryRecoveryReceipt).toBeNull();
    expect(loaded.snapshot().session).toEqual(target.snapshot().session);
    expect(loaded.snapshot().cistern).toMatchObject({ stage: "default", mp: target.snapshot().session.mp.currentMp });
    expect(loaded.snapshot().cistern.receivers[0]).toMatchObject({ latched: true, satisfied: true });
  });

  it("rejects a replayed cast transaction before mutation and preserves the next required stage", () => {
    const target = room();
    const first = castCurrentStage(target, "short", "l01.cast.replay-key");
    expect(first.accepted).toBe(true);
    const afterFirst = target.snapshot().session;

    target.setExpression("telo");
    target.targetCurrentReceiver();
    target.beginPreview();
    const replay = target.confirmPending("l01.cast.replay-key");

    expect(replay).toMatchObject({ accepted: false, reason: "duplicate_transaction" });
    expect(target.snapshot().session).toEqual(afterFirst);
    expect(target.snapshot().cistern).toMatchObject({ stage: "default", pendingPlan: null, mp: 18 });

    const replayedSave = RpgL01RoomSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(replayedSave.snapshot().session).toEqual(afterFirst);
    expect(replayedSave.snapshot().cistern.stage).toBe("default");
  });
});
