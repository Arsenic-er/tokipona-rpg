import { describe, expect, it } from "vitest";
import {
  LEARNING_SAVE_SCHEMA,
  type LearningProgressionSnapshot,
  type WordLearningProgress,
} from "../learning/progression";
import { commitSessionProposal } from "../session/adapters";
import { GameSession } from "../session/game-session";
import { RANGE_TRIAL_PERMISSION_FLAG_ID } from "./attack-qualification";
import { PrologueFlowSession } from "./prologue-flow";
import {
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
  PrologueReturnFlowSession,
} from "./prologue-return-flow";
import { authoritativePostEpilogueSettlement } from "./test-helpers/authoritative-post-epilogue-settlement";
import {
  PROLOGUE_SAFE_RANGE_SCENE_ID,
  PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID,
} from "./prologue-safe-range";
import { safeRangeInteractionPointPx } from "./safe-range-authority";
import { SAFE_RANGE_TARGET_CLASSES, type SafeRangeTargetClass } from "./safe-range-physics";

const progress = (
  wordId: string,
  learningState: WordLearningProgress["learningState"],
): WordLearningProgress => ({
  wordId,
  discoveryState: "discovered",
  attunementState: "attuned",
  learningState,
  evidence: [],
  productionTaskFamilies: [],
  producedBaselineTaskFamilies: [],
  producedBaselineEnvironmentFingerprints: [],
  demonstratedSemanticFacets: [],
});

const preparedLearning = (): LearningProgressionSnapshot => ({
  schema: LEARNING_SAVE_SCHEMA,
  revision: 0,
  words: {
    telo: progress("telo", "produced"),
    tawa: progress("tawa", "produced"),
    wawa: progress("wawa", "grounded"),
  },
  processedEventPayloads: {},
});

/** Builds N02 only through the trusted N07 and semantic N02 coordinators. */
const qualifiedSettlement = (permission = true): GameSession => {
  if (!permission) {
    return GameSession.create({
      sessionId: "flow.safe-range.early",
      mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID,
      learning: preparedLearning(),
    });
  }

  const source = GameSession.create({
    sessionId: "flow.safe-range.qualified",
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: "scene.valley.high_cistern",
    learning: preparedLearning(),
  });
  const ladder = commitSessionProposal(source, {
    transactionId: "fixture.ladder",
    drafts: [{
      eventId: "fixture.ladder",
      type: "world_flag_set",
      payload: {
        flagId: "exit_ladder_lowered",
        value: true,
        scope: "region",
        regionId: "valley_prologue",
      },
    }],
  });
  if (!ladder.committed) throw new Error(`fixture ladder rejected: ${ladder.reason}`);

  const entered = PrologueReturnFlowSession.enterFromCistern(ladder.session, "fixture.return.entry");
  if (!entered.accepted || !entered.returnFlow) {
    throw new Error(`fixture N07 entry rejected: ${entered.reason}`);
  }
  const returnFlow = entered.returnFlow;
  const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
  expect(returnFlow.completeSolution("fixture.return.complete", solution.id, {
    completedActionIds: solution.requiredActions,
    world: {
      settlementSupplyFlowInBand: true,
      wetMeadowFlowInBand: true,
      overflowContact: false,
      overflowGateSeated: true,
      overflowSealIntact: true,
      overflowConduitClear: true,
      mudMassBelowLimit: true,
      channelGradeContinuous: true,
      returnIntakeClear: true,
      oldChannelConnected: true,
      oldChannelClear: true,
      oldChannelBankStable: true,
    },
  }).accepted).toBe(true);
  expect(returnFlow.groundWawa("fixture.return.wawa", {
    solutionId: solution.id,
    promptLevel: 0,
    predictedForceContrastCorrect: true,
    worldOutcomeContribution: true,
  }).accepted).toBe(true);
  const flow = PrologueFlowSession.fromSave(authoritativePostEpilogueSettlement(returnFlow.session).toSave());
  for (let tick = 0; tick < 700 && flow.snapshot().runtime.player.position.x < 576; tick += 1) {
    flow.advanceTicks(1, { moveX: 1 });
  }
  const actions = [
    "settlement.telo.h0",
    "settlement.telo.h1",
    "settlement.tawa.h0",
    "settlement.tawa.h1",
    "settlement.repair.motion_h0",
    "settlement.calibration.unrelated_delivery_commit",
    "settlement.calibration.unrelated_route_commit",
    "settlement.delayed_retrieval_h0",
  ] as const;
  for (const [index, actionId] of actions.entries()) {
    expect(
      flow.performAttackQualificationAction(`fixture.action.${index}`, actionId).accepted,
      actionId,
    ).toBe(true);
  }
  expect(flow.calibrateAttackCapacity("fixture.calibration").accepted).toBe(true);
  expect(flow.grantRangeTrialPermission("fixture.permission").accepted).toBe(true);
  return GameSession.fromSave(flow.toSave());
};

const compile = (
  flow: PrologueFlowSession,
  targetClass: SafeRangeTargetClass,
  promptLevel: 0 | 1 = 0,
) => {
  const result = flow.compileSafeRange({ targetClass, promptLevel, waterSource: "bound_existing" });
  expect(result).toMatchObject({ accepted: true, reason: "delegated", result: { ok: true } });
  const preview = result.result?.preview;
  if (!preview) throw new Error("safe-range flow did not return an opaque preview");
  return preview;
};

const refillAtSettlement = (flow: PrologueFlowSession, prefix: string): void => {
  expect(flow.safeRangeToSettlement(`${prefix}.return`)).toMatchObject({ accepted: true });
  let attempts = 0;
  while (flow.snapshot().session.mp.currentMp < flow.snapshot().session.mp.maxMp && attempts < 20) {
    expect(flow.meditate(`${prefix}.meditate.${attempts}`, false)).toMatchObject({ accepted: true });
    attempts += 1;
  }
  expect(flow.snapshot().session.mp.currentMp).toBe(flow.snapshot().session.mp.maxMp);
  expect(flow.enterSafeRange(`${prefix}.reenter`)).toMatchObject({ accepted: true });
};

const walkNear = (
  flow: PrologueFlowSession,
  targetId: SafeRangeTargetClass | "material_collision_table",
): void => {
  const point = safeRangeInteractionPointPx(targetId);
  if (!point) throw new Error(`missing safe-range interaction point for ${targetId}`);
  for (let tick = 0; tick < 1200; tick += 1) {
    const position = flow.snapshot().runtime.player.position;
    if (Math.hypot(position.x - point.x, position.y - point.y) <= 16) return;
    flow.advanceTicks(1, { moveX: position.x < point.x ? 1 : -1 });
  }
  const position = flow.snapshot().runtime.player.position;
  expect(Math.hypot(position.x - point.x, position.y - point.y), targetId).toBeLessThanOrEqual(16);
};

describe("PrologueFlowSession N02/N08 integration", () => {
  it("fails closed before permission and leaves the existing N02 flow untouched", () => {
    const flow = PrologueFlowSession.fromSave(qualifiedSettlement(false).toSave());
    expect(flow.enterSafeRange("early.safe-range")).toMatchObject({
      accepted: false,
      reason: "delegate_rejected",
      result: { accepted: false, reason: "permission_denied", safeRange: null },
    });
    expect(flow.snapshot()).toMatchObject({
      mode: "settlement",
      runtime: { sceneId: PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID },
      safeRange: null,
      killCount: 0,
    });
    expect(flow.snapshot().session.world.flags[`global:${RANGE_TRIAL_PERMISSION_FLAG_ID}`]).toBeUndefined();
  });

  it("runs the formal N02 -> N08 four-target/table -> N02 chain with opaque reload-safe previews", () => {
    let flow = PrologueFlowSession.fromSave(qualifiedSettlement().toSave());
    expect(flow.snapshot().session.world.flags[`global:${RANGE_TRIAL_PERMISSION_FLAG_ID}`]?.value).toBe(true);
    expect(flow.snapshot().session.world.flags["global:first_attack_signature_available"]).toBeUndefined();
    expect(flow.meditate("chain.preflight.meditate.0", false)).toMatchObject({ accepted: true });
    expect(flow.meditate("chain.preflight.meditate.1", false)).toMatchObject({ accepted: true });
    expect(flow.snapshot().session.mp.currentMp).toBe(30);
    expect(flow.enterSafeRange("chain.enter")).toMatchObject({ accepted: true, reason: "delegated" });
    expect(flow.snapshot()).toMatchObject({
      mode: "safe_range",
      runtime: { sceneId: PROLOGUE_SAFE_RANGE_SCENE_ID },
      settlement: null,
      safeRange: { firstAttackSignatureAvailable: false, firstAttackSignatureCompleted: false },
      killCount: 0,
    });

    walkNear(flow, "wood_dummy");
    const stale = compile(flow, "wood_dummy");
    expect(Object.keys(stale).sort()).toEqual([
      "canonicalAst",
      "effect",
      "previewId",
      "promptLevel",
      "quotedMp",
      "targetClass",
      "waterSource",
    ]);
    expect(JSON.stringify(stale)).not.toMatch(/direction|currentHp|living|collision|worldVersion|decisionMaterial|physics/);
    flow = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    expect(flow.executeSafeRange("chain.stale", stale.previewId)).toMatchObject({
      accepted: false,
      reason: "delegate_rejected",
      result: { accepted: false, reason: "untrusted_preview" },
    });

    SAFE_RANGE_TARGET_CLASSES.forEach((targetClass, index) => {
      if (flow.snapshot().session.mp.currentMp < 13) refillAtSettlement(flow, `chain.refill.${index}`);
      walkNear(flow, targetClass);
      const preview = compile(flow, targetClass, index % 2 as 0 | 1);
      expect(flow.executeSafeRange(`chain.transfer.${targetClass}`, preview.previewId)).toMatchObject({
        accepted: true,
        reason: "delegated",
        result: { accepted: true, duplicate: false, reason: "committed" },
      });
      if (index === 0) {
        expect(flow.resetSafeRangeCheckpoint("chain.reset")).toMatchObject({ accepted: true });
        expect(flow.recoverSafeRangeSoftLock("chain.recover")).toMatchObject({ accepted: true });
        expect(flow.snapshot().safeRange?.targets.wood_dummy.completed).toBe(true);
      }
    });
    expect(flow.snapshot().safeRange).toMatchObject({
      firstAttackSignatureAvailable: true,
      firstAttackSignatureCompleted: false,
    });
    for (const targetClass of SAFE_RANGE_TARGET_CLASSES) {
      expect(flow.snapshot().safeRange?.targets[targetClass].completed).toBe(true);
    }

    walkNear(flow, "material_collision_table");
    expect(flow.inspectSafeRangeMaterialTable("chain.table")).toMatchObject({
      accepted: true,
      result: { accepted: true, reason: "committed" },
    });
    expect(flow.snapshot().safeRange?.firstAttackSignatureCompleted).toBe(true);

    const persisted = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    expect(persisted.snapshot()).toMatchObject({
      mode: "safe_range",
      safeRange: { firstAttackSignatureAvailable: true, firstAttackSignatureCompleted: true },
      killCount: 0,
    });
    for (const targetClass of SAFE_RANGE_TARGET_CLASSES) {
      expect(persisted.snapshot().safeRange?.targets[targetClass].completed).toBe(true);
    }
    expect(persisted.safeRangeToSettlement("chain.final-return")).toMatchObject({ accepted: true });
    expect(persisted.snapshot()).toMatchObject({
      mode: "settlement",
      runtime: { sceneId: PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID },
      safeRange: null,
      killCount: 0,
    });
  }, 15_000);
});
