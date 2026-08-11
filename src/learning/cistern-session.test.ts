import { describe, expect, it } from "vitest";
import { CisternLearningSession, type ReceiverAttemptInput } from "./cistern-session";

const session = (expressionCapacity = 2): CisternLearningSession =>
  new CisternLearningSession({
    playerSaveId: "save.cistern.test",
    expressionCapacity,
  });

const attempt = (
  overrides: Partial<ReceiverAttemptInput> = {},
): ReceiverAttemptInput => ({
  attemptId: "attempt.short.1",
  stage: "short",
  taskId: "ch01_length_cistern",
  taskFamilyId: "cistern.length.short",
  variantHash: "variant.short.receiver-a",
  normalizedEnvironmentFingerprint: "env.cistern.short.receiver-a",
  receiverGoalSatisfied: true,
  selectedActionClass: "short_direct_cast",
  toolBypass: false,
  promptLevel: 0,
  interpretationStatus: "parsed_grounded",
  answerVisible: false,
  fixedSlotOnly: false,
  colorOnlyCue: false,
  activeRetrieval: true,
  ...overrides,
});

const prepareWord = (
  target: CisternLearningSession,
  wordId: "telo" | "lili" | "suli",
): void => {
  target.discoverGlyph({
    wordId,
    occurrenceId: `wall.${wordId}`,
    locationId: `cistern.location.${wordId}`,
  });
  target.attuneGlyph({
    wordId,
    occurrenceId: `attune.${wordId}`,
    environmentalWitnessId: `witness.${wordId}`,
  });
};

describe("CisternLearningSession", () => {
  it("proposes discovered and permanent attunement events for the three cistern words", () => {
    const target = session();

    for (const wordId of ["telo", "lili", "suli"] as const) prepareWord(target, wordId);

    for (const wordId of ["telo", "lili", "suli"] as const) {
      expect(target.snapshot().learning.words[wordId]).toMatchObject({
        discoveryState: "discovered",
        attunementState: "attuned",
        learningState: "discovered",
      });
    }
  });

  it("only proposes grounding and retrieval after the receiver world predicate succeeds", () => {
    const target = session();
    prepareWord(target, "telo");
    prepareWord(target, "lili");

    const failed = target.resolveReceiverAttempt(attempt({ receiverGoalSatisfied: false }));
    const passed = target.resolveReceiverAttempt(attempt());

    expect(failed).toMatchObject({ reason: "receiver_goal_false", proposedEvents: [] });
    expect(passed.proposedEvents.map((event) => `${event.eventType}:${event.wordId}`)).toEqual([
      "grounding_trial_resolved:telo",
      "active_retrieval_submitted:telo",
      "grounding_trial_resolved:lili",
      "active_retrieval_submitted:lili",
    ]);
    expect(target.snapshot().learning.words.telo?.learningState).toBe("grounded");
    expect(target.snapshot().learning.words.lili?.learningState).toBe("grounded");
  });

  it("never proposes language evidence for a tool bypass", () => {
    const target = session();
    prepareWord(target, "telo");
    prepareWord(target, "lili");
    const revisionBefore = target.snapshot().learning.revision;

    const result = target.resolveReceiverAttempt(attempt({
      selectedActionClass: "maintenance_platform_and_bucket",
      toolBypass: true,
    }));

    expect(result).toMatchObject({ reason: "tool_bypass", proposedEvents: [], reductions: [] });
    expect(target.snapshot().learning.revision).toBe(revisionBefore);
    expect(target.snapshot().learning.words.telo?.learningState).toBe("discovered");
  });

  it.each([
    [{ promptLevel: 2 }, "prompt_not_eligible"],
    [{ interpretationStatus: "parsed_ambiguous" }, "interpretation_not_eligible"],
    [{ answerVisible: true }, "answer_support_not_eligible"],
    [{ fixedSlotOnly: true }, "answer_support_not_eligible"],
    [{ colorOnlyCue: true }, "answer_support_not_eligible"],
    [{ selectedActionClass: "wrong_action" }, "action_not_eligible"],
  ] as const)("filters ineligible receiver evidence %j", (overrides, reason) => {
    const target = session();
    prepareWord(target, "telo");
    prepareWord(target, "lili");

    const result = target.resolveReceiverAttempt(attempt(overrides));

    expect(result.reason).toBe(reason);
    expect(result.proposedEvents).toEqual([]);
  });

  it("grounds lili and suli while telo reaches produced across two receiver families", () => {
    const target = session();
    for (const wordId of ["telo", "lili", "suli"] as const) prepareWord(target, wordId);

    target.resolveReceiverAttempt(attempt());
    target.resolveReceiverAttempt(attempt({
      attemptId: "attempt.long.1",
      stage: "long",
      taskFamilyId: "cistern.length.long",
      variantHash: "variant.long.receiver-b",
      normalizedEnvironmentFingerprint: "env.cistern.long.receiver-b",
      selectedActionClass: "long_direct_cast",
    }));

    expect(target.snapshot().learning.words.telo?.learningState).toBe("produced");
    expect(target.snapshot().learning.words.lili?.learningState).toBe("grounded");
    expect(target.snapshot().learning.words.suli?.learningState).toBe("grounded");
    expect(target.snapshot().learning.words.telo?.producedBaselineTaskFamilies).toEqual([
      "cistern.length.long",
      "cistern.length.short",
    ]);
  });

  it("proposes natural recovery without owning an MP balance", () => {
    const target = new CisternLearningSession({
      playerSaveId: "save.recovery.natural",
      expressionCapacity: 2,
      recoveryConfig: { naturalMpPerTick: 0.4 },
    });

    const proposal = target.proposeNaturalRecovery({ recoveryId: "natural.tick.1", ticks: 3 });

    expect(proposal).toMatchObject({
      source: "natural",
      recoveryId: "natural.tick.1",
      amountPolicy: { kind: "fixed", amountMp: 1.2 },
      capPolicy: { kind: "max_mp" },
    });
    expect(target.snapshot()).toEqual({ expressionCapacity: 2, learning: target.snapshot().learning });
    expect(target.snapshot()).not.toHaveProperty("currentMp");
    expect(target.snapshot()).not.toHaveProperty("maxMp");
  });

  it("proposes the same meditation recovery when the answer and evidence are ineligible", () => {
    const target = session();
    const proposal = target.proposeMeditationRecovery({
      recoveryId: "meditation.1",
      answerAccepted: false,
      evidenceEligible: false,
    });

    expect(proposal).toMatchObject({
      amountPolicy: { kind: "fixed", amountMp: 3 },
      answerAccepted: false,
      evidenceEligible: false,
    });
    expect(target.snapshot().expressionCapacity).toBe(2);
  });

  it("keeps recovery proposals independent after a failed receiver attempt", () => {
    const target = session();
    const revision = target.snapshot().learning.revision;
    const failed = target.resolveReceiverAttempt(attempt({ receiverGoalSatisfied: false }));
    const proposal = target.proposeMeditationRecovery({
      recoveryId: "meditation.after-failure",
      answerAccepted: false,
      evidenceEligible: false,
    });

    expect(failed.proposedEvents).toEqual([]);
    expect(target.snapshot().learning.revision).toBe(revision);
    expect(proposal.amountPolicy).toEqual({ kind: "fixed", amountMp: 3 });
  });

  it("describes checkpoint recovery using an authoritative-max formula", () => {
    const target = session();
    const first = target.proposeCheckpointRecovery({ activationId: "checkpoint.entry.1" });
    const replay = target.proposeCheckpointRecovery({ activationId: "checkpoint.entry.1" });

    expect(first).toMatchObject({
      source: "checkpoint",
      amountPolicy: {
        kind: "max_of_fixed_and_max_fraction",
        minimumMp: 3,
        maxMpFraction: 0.15,
        quantum: 0.5,
      },
      capPolicy: { kind: "max_mp_fraction", maxMpFraction: 0.8, quantum: 0.5 },
    });
    expect(replay).toEqual(first);
  });

  it("leaves idempotency to the ledger while producing deterministic IDs", () => {
    const target = session();
    const first = target.proposeNaturalRecovery({ recoveryId: "natural.same", ticks: 2 });
    const replay = target.proposeNaturalRecovery({ recoveryId: "natural.same", ticks: 2 });
    const conflict = target.proposeNaturalRecovery({ recoveryId: "natural.same", ticks: 3 });

    expect(replay).toEqual(first);
    expect(conflict.recoveryId).toBe(first.recoveryId);
    expect(conflict.amountPolicy).not.toEqual(first.amountPolicy);
  });

  it("rejects invalid player and recovery configuration", () => {
    const noMpAuthority = new CisternLearningSession({
      playerSaveId: "save.invalid",
      currentMp: 27,
      maxMp: 26,
      expressionCapacity: 2,
    });
    expect(noMpAuthority.snapshot()).not.toHaveProperty("currentMp");
    expect(() => new CisternLearningSession({
      playerSaveId: "save.invalid",
      currentMp: 10,
      maxMp: 26,
      expressionCapacity: 0,
    })).toThrow(/expressionCapacity/);
    expect(() => new CisternLearningSession({
      playerSaveId: "save.invalid",
      currentMp: 10,
      maxMp: 26,
      expressionCapacity: 2,
      recoveryConfig: { checkpointSoftCapFraction: 1.1 },
    })).toThrow(/recovery configuration/);
  });
});
