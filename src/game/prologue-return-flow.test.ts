import { describe, expect, it } from "vitest";
import { commitSessionProposal } from "../session/adapters";
import { GameSession } from "../session/game-session";
import {
  PROLOGUE_RETURN_FLOW_ENTRY_CHECKPOINT_ID,
  PROLOGUE_RETURN_FLOW_FLAGS,
  PROLOGUE_RETURN_FLOW_PATCH_ID,
  PROLOGUE_RETURN_FLOW_SCENE_ID,
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
  PROLOGUE_RETURN_FLOW_TASK_ID,
  RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS,
  PrologueReturnFlowSession,
  type ReturnFlowSolutionEvidence,
} from "./prologue-return-flow";
import type { ReturnFlowSolutionId, ReturnFlowWorldFacts } from "./return-flow-predicates";

const CISTERN_SCENE_ID = "scene.valley.high_cistern";

const allWorldFacts = (): ReturnFlowWorldFacts => ({
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
});

const sourceSession = (sessionId: string, ladderLowered = true): GameSession => {
  const source = GameSession.create({
    sessionId,
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: CISTERN_SCENE_ID,
  });
  if (!ladderLowered) return source;
  const committed = commitSessionProposal(source, {
    transactionId: `${sessionId}.ladder`,
    drafts: [{
      eventId: `${sessionId}.ladder`,
      type: "world_flag_set",
      payload: { flagId: "exit_ladder_lowered", value: true, scope: "region", regionId: "valley_prologue" },
    }],
  });
  if (!committed.committed) throw new Error(`fixture rejected: ${committed.reason}`);
  return committed.session;
};

const enter = (sessionId: string): PrologueReturnFlowSession => {
  const result = PrologueReturnFlowSession.enterFromCistern(sourceSession(sessionId), `${sessionId}.entry`);
  if (!result.accepted || !result.returnFlow) throw new Error(`entry rejected: ${result.reason}`);
  return result.returnFlow;
};

const evidenceFor = (solutionId: ReturnFlowSolutionId): ReturnFlowSolutionEvidence => {
  const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.find((candidate) => candidate.id === solutionId);
  if (!solution) throw new Error(`missing solution ${solutionId}`);
  return { completedActionIds: solution.requiredActions, world: allWorldFacts() };
};

describe("production prologue return-flow coordinator", () => {
  it("consumes the generated exact three-solution contract", () => {
    expect(PROLOGUE_RETURN_FLOW_TASK_ID).toBe("ch01_return_flow");
    expect(PROLOGUE_RETURN_FLOW_PATCH_ID).toBe("patch.valley.return_flow.v0.1");
    expect(PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.map((solution) => solution.id)).toEqual([
      "return_flow.repair_overflow",
      "return_flow.clear_mud",
      "return_flow.reuse_old_channel",
    ]);
    expect(PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.map((solution) => solution.requiredActions)).toEqual([
      [
        "return_flow.repair_overflow.inspect_indicator",
        "return_flow.repair_overflow.reseat_gate",
        "return_flow.repair_overflow.repair_seal",
        "return_flow.repair_overflow.clear_conduit",
      ],
      [
        "return_flow.clear_mud.inspect_indicator",
        "return_flow.clear_mud.loosen_blockage",
        "return_flow.clear_mud.remove_mud",
        "return_flow.clear_mud.restore_grade",
        "return_flow.clear_mud.clear_intake",
      ],
      [
        "return_flow.reuse_old_channel.inspect_indicator",
        "return_flow.reuse_old_channel.connect_channel",
        "return_flow.reuse_old_channel.clear_channel",
        "return_flow.reuse_old_channel.brace_bank",
        "return_flow.reuse_old_channel.set_split_gauge",
      ],
    ]);
  });

  it("guards, commits, retries, and adopts the N05 to N07 handoff", () => {
    expect(PrologueReturnFlowSession.enterFromCistern(sourceSession("return.blocked", false), "entry.blocked"))
      .toMatchObject({ accepted: false, reason: "entry_guard_failed" });

    const source = sourceSession("return.entry");
    const entered = PrologueReturnFlowSession.enterFromCistern(source, "entry.direct");
    expect(entered).toMatchObject({ accepted: true, duplicate: false, entryMode: "direct_transition" });
    expect(entered.returnFlow?.snapshot().session.world.currentSceneId).toBe(PROLOGUE_RETURN_FLOW_SCENE_ID);
    expect(entered.returnFlow?.snapshot().session.checkpoint.id).toBe(PROLOGUE_RETURN_FLOW_ENTRY_CHECKPOINT_ID);
    expect(PrologueReturnFlowSession.enterFromCistern(entered.returnFlow!.session, "entry.direct"))
      .toMatchObject({ accepted: true, duplicate: true });
    expect(PrologueReturnFlowSession.adoptRuntimeEntry(entered.returnFlow!.session, "entry.direct"))
      .toMatchObject({ accepted: false, reason: "transaction_conflict" });

    const runtimeSource = sourceSession("return.adopt");
    const runtimeTransition = commitSessionProposal(runtimeSource, {
      transactionId: "runtime.return.entry",
      drafts: [{
        eventId: `runtime.return.entry.${CISTERN_SCENE_ID}->${PROLOGUE_RETURN_FLOW_SCENE_ID}`,
        type: "scene_entered",
        payload: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
      }],
    });
    expect(runtimeTransition.committed).toBe(true);
    const adopted = PrologueReturnFlowSession.adoptRuntimeEntry(runtimeTransition.session, "entry.adopt");
    expect(adopted).toMatchObject({ accepted: true, entryMode: "adopted_runtime_transition" });
    expect(adopted.returnFlow?.snapshot().session.checkpoint.id).toBe(PROLOGUE_RETURN_FLOW_ENTRY_CHECKPOINT_ID);

    const forgedLatest = commitSessionProposal(runtimeTransition.session, {
      transactionId: "runtime.return.forged-latest",
      drafts: [{
        eventId: `runtime.return.forged-latest.scene.valley.den_bypass->${PROLOGUE_RETURN_FLOW_SCENE_ID}`,
        type: "scene_entered",
        payload: { sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID },
      }],
    });
    expect(forgedLatest.committed).toBe(true);
    expect(PrologueReturnFlowSession.adoptRuntimeEntry(forgedLatest.session, "entry.adopt.forged"))
      .toMatchObject({ accepted: false, reason: "wrong_source_scene" });
  });

  it.each([
    "return_flow.repair_overflow",
    "return_flow.clear_mud",
    "return_flow.reuse_old_channel",
  ] as const)("atomically completes %s from manifest actions and exact facts", (solutionId) => {
    const flow = enter(`complete.${solutionId}`);
    const evidence = evidenceFor(solutionId);
    const before = flow.session.events().length;
    expect(flow.completeSolution("complete.missing", solutionId, {
      ...evidence,
      completedActionIds: evidence.completedActionIds.slice(1),
    })).toMatchObject({ accepted: false, reason: "prerequisite_missing" });
    expect(flow.session.events()).toHaveLength(before);

    const completed = flow.completeSolution("complete.ok", solutionId, evidence);
    expect(completed).toMatchObject({ accepted: true, duplicate: false, reason: "committed" });
    expect(completed.snapshot).toMatchObject({
      settlementSupplyStable: true,
      wetMeadowRestored: true,
      solutionId,
      materialPatchApplied: true,
      taskCompleted: true,
      prologueReturnObserved: false,
    });
    const committedEvents = flow.session.events().slice(before);
    expect(committedEvents.map((event) => event.type)).toEqual([
      "world_flag_set", "world_flag_set", "world_flag_set", "world_flag_set", "quest_stage_set", "receipt_recorded",
    ]);
    expect(committedEvents[4]?.eventId).toContain("return_flow_committed");
    expect(flow.completeSolution("complete.ok", solutionId, evidence)).toMatchObject({ accepted: true, duplicate: true });
    expect(flow.completeSolution("complete.changed", solutionId, evidence)).toMatchObject({ accepted: true, duplicate: true });
    expect(flow.session.snapshot().receiptIndex[`world:${flow.session.sessionId}:return-flow-operation:complete.changed`])
      .toBeDefined();
    const other = solutionId === "return_flow.repair_overflow" ? "return_flow.clear_mud" : "return_flow.repair_overflow";
    expect(flow.completeSolution("complete.other", other, evidenceFor(other)))
      .toMatchObject({ accepted: false, reason: "transaction_conflict" });
  });

  it("derives inert wawa provenance and a stable non-transaction variant internally", () => {
    const flow = enter("return.wawa");
    expect(flow.attuneWawa("wawa.attune.early"))
      .toMatchObject({ accepted: false, reason: "learning_prerequisite_missing" });
    expect(flow.discoverWawa("wawa.discover"))
      .toMatchObject({ accepted: true, evidenceGranted: true });
    expect(flow.attuneWawa("wawa.attune"))
      .toMatchObject({ accepted: true, evidenceGranted: true });

    const attempt = {
      solutionId: "return_flow.repair_overflow" as const,
      promptLevel: 1 as const,
      predictedForceContrastCorrect: true,
      worldOutcomeContribution: true,
    };
    expect(flow.groundWawa("wawa.ground.before", attempt))
      .toMatchObject({ accepted: false, reason: "ineligible_evidence" });
    expect(flow.completeSolution("wawa.route", attempt.solutionId, evidenceFor(attempt.solutionId)).accepted).toBe(true);
    expect(flow.groundWawa("wawa.ground.prompt", { ...attempt, promptLevel: 2 }))
      .toMatchObject({ accepted: false, reason: "ineligible_evidence" });
    expect(flow.groundWawa("wawa.ground.answer", { ...attempt, answerVisible: true }))
      .toMatchObject({ accepted: false, reason: "ineligible_evidence" });
    expect(flow.groundWawa("wawa.ground.prediction", { ...attempt, predictedForceContrastCorrect: false }))
      .toMatchObject({ accepted: false, reason: "ineligible_evidence" });

    const grounded = flow.groundWawa("wawa.ground.ok", attempt);
    expect(grounded).toMatchObject({ accepted: true, evidenceGranted: true });
    const evidence = grounded.snapshot.session.learning.words.wawa!.evidence
      .find((entry) => entry.eventType === "grounding_trial_resolved")!;
    expect(evidence.sourceObjectClass).toBe(RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS);
    expect(evidence.variantHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(evidence.variantHash).not.toContain("wawa.ground.ok");
    const count = grounded.snapshot.wawa.inertMechanismEvidenceCount;
    expect(flow.groundWawa("wawa.ground.retry", attempt)).toMatchObject({ accepted: true, duplicate: true });
    expect(flow.snapshot().wawa.inertMechanismEvidenceCount).toBe(count);
    expect(flow.groundWawa("wawa.ground.h0", { ...attempt, promptLevel: 0 }))
      .toMatchObject({ accepted: true, duplicate: false, evidenceGranted: true });
    expect(flow.snapshot().wawa.groundedPromptLevels).toEqual([0, 1]);
    expect(flow.groundWawa("wawa.ground.ok", { ...attempt, worldOutcomeContribution: false }))
      .toMatchObject({ accepted: false, reason: "transaction_conflict" });
  });

  it("preserves committed route and learning state through reset, softlock recovery, and reload", () => {
    const flow = enter("return.recovery");
    expect(flow.discoverWawa("recovery.discover").accepted).toBe(true);
    expect(flow.completeSolution("recovery.complete", "return_flow.clear_mud",
      evidenceFor("return_flow.clear_mud")).accepted).toBe(true);
    expect(flow.resetToCheckpoint("recovery.reset").accepted).toBe(true);
    const recovered = flow.recoverSoftLock("recovery.softlock");
    expect(recovered).toMatchObject({ accepted: true });
    expect(recovered.snapshot).toMatchObject({
      settlementSupplyStable: true,
      wetMeadowRestored: true,
      solutionId: "return_flow.clear_mud",
      materialPatchApplied: true,
    });
    expect(recovered.snapshot.wawa.discoveryState).toBe("discovered");
    expect(recovered.snapshot.session.checkpoint.sceneId).toBe(PROLOGUE_RETURN_FLOW_SCENE_ID);

    const reloaded = PrologueReturnFlowSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    expect(reloaded.snapshot()).toMatchObject({
      settlementSupplyStable: true,
      wetMeadowRestored: true,
      solutionId: "return_flow.clear_mud",
      materialPatchApplied: true,
      taskCompleted: true,
    });
    expect(reloaded.snapshot().wawa.discoveryState).toBe("discovered");
  });

  it("fails closed at the authored underground handoff without mutating the completed N07 session", () => {
    const flow = enter("return.exit");
    expect(flow.returnToSettlement("return.exit.early"))
      .toMatchObject({ accepted: false, reason: "prerequisite_missing" });
    expect(flow.snapshot().prologueReturnObserved).toBe(false);
    expect(flow.completeSolution("return.exit.complete", "return_flow.reuse_old_channel",
      evidenceFor("return_flow.reuse_old_channel")).accepted).toBe(true);
    const before = flow.toSave();
    const returned = flow.returnToSettlement("return.exit.ok");
    expect(returned).toMatchObject({ accepted: false, duplicate: false, reason: "underground_handoff_required", session: null });
    expect(flow.toSave()).toEqual(before);
    expect(flow.snapshot()).toMatchObject({ sceneId: PROLOGUE_RETURN_FLOW_SCENE_ID, prologueReturnObserved: false });
    const reloaded = GameSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    expect(reloaded.snapshot().world.currentSceneId).toBe(PROLOGUE_RETURN_FLOW_SCENE_ID);
    expect(reloaded.snapshot().world.flags[`global:${PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved}`]).toBeUndefined();
  });
});
