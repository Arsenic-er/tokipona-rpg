import { describe, expect, it } from "vitest";
import {
  ExclusivePrologueActivityTimer,
  PrologueTelemetryRecorder,
  emptyPrologueTelemetrySemantic,
  evaluatePrologueActivityAcceptance,
  evaluatePrologueQualificationCohort,
} from "./prologue-telemetry";

describe("prologue acceptance telemetry", () => {
  it("measures exactly one primary activity and excludes pause/idle/settings/free-roam", () => {
    const timer = new ExclusivePrologueActivityTimer();
    timer.start("world_people_physics", 0);
    timer.switchTo("language", 65_000);
    timer.switchTo("long_explanation", 90_000);
    timer.switchTo("pause", 100_000);
    timer.switchTo("settings", 110_000);
    timer.stop(120_000);
    const snapshot = timer.snapshot(120_000);
    expect(snapshot).toMatchObject({ contentActiveMs: 100_000, excludedMs: 20_000, activeKind: null });
    expect(snapshot.totalsMs).toMatchObject({ world_people_physics: 65_000, language: 25_000, long_explanation: 10_000, pause: 10_000, settings: 10_000 });
    expect(evaluatePrologueActivityAcceptance(snapshot)).toMatchObject({
      accepted: true,
      shares: { world_people_physics: 0.65, language: 0.25, long_explanation: 0.10 },
      passes: { worldPeoplePhysicsMinimum: true, languageRange: true, longExplanationMaximum: true, exclusiveTaxonomy: true },
    });
  });

  it("rejects overlap, backward time, unknown categories, and empty evidence windows", () => {
    const timer = new ExclusivePrologueActivityTimer();
    timer.start("language", 10);
    expect(() => timer.start("language", 10)).toThrow(/already has/);
    expect(() => timer.switchTo("language", 9)).toThrow(/monotonic/);
    expect(() => timer.switchTo("combat" as any, 20)).toThrow(/outside/);
    timer.stop(20);
    expect(() => timer.stop(21)).toThrow(/no activity/);
    expect(evaluatePrologueActivityAcceptance(new ExclusivePrologueActivityTimer().snapshot(0)).accepted).toBe(false);
  });

  it("derives event sequence, activity, and content time while enforcing the privacy-safe payload", () => {
    const timer = new ExclusivePrologueActivityTimer();
    timer.start("world_people_physics", 0);
    const recorder = new PrologueTelemetryRecorder("session.acceptance", timer);
    const first = recorder.record({ eventId: "prologue_segment_started", worldTick: 0, segmentId: "arrival_and_contact", atMs: 1_000, semantic: emptyPrologueTelemetrySemantic({ subjectId: "scene.valley.arrival_shelf" }) });
    timer.switchTo("language", 2_000);
    const second = recorder.record({ eventId: "active_retrieval_submitted", worldTick: 120, segmentId: "world_literacy_tasks", atMs: 3_000, semantic: emptyPrologueTelemetrySemantic({ subjectId: "word.telo", outcomeId: "retrieval.correct", promptLevel: 0, count: 1, durationMs: 900 }) });
    expect(first).toMatchObject({ sequence: 1, primaryActivity: "world_people_physics", contentActiveMs: 1_000 });
    expect(second).toMatchObject({ sequence: 2, primaryActivity: "language", contentActiveMs: 3_000 });
    expect(recorder.events()).toEqual([first, second]);
    expect(Object.keys(second)).toEqual(["schemaVersion", "eventId", "sessionId", "sequence", "worldTick", "segmentId", "primaryActivity", "contentActiveMs", "semantic"]);
    expect(() => recorder.record({ eventId: "repair_completed", worldTick: 121, segmentId: "world_literacy_tasks", atMs: 3_100, semantic: { ...emptyPrologueTelemetrySemantic(), rawText: "answer" } as any })).toThrow(/unknown or missing/);
    expect(() => emptyPrologueTelemetrySemantic({ subjectId: "raw sentence with spaces" })).toThrow(/semantic identifier/);
  });

  it("fails the generated share gate when explanation dominates or language is outside range", () => {
    const timer = new ExclusivePrologueActivityTimer();
    timer.start("world_people_physics", 0);
    timer.switchTo("language", 50);
    timer.switchTo("long_explanation", 60);
    timer.stop(100);
    expect(evaluatePrologueActivityAcceptance(timer.snapshot(100))).toMatchObject({ accepted: false, passes: { worldPeoplePhysicsMinimum: false, languageRange: false, longExplanationMaximum: false } });
  });

  it("evaluates observed qualification cohorts without treating missing sessions as successes", () => {
    const minute = (value: number): number => value * 60_000;
    const passing = Array.from({ length: 10 }, (_, index) => ({
      sessionId: `cohort.pass.${index}`,
      rangeTrialPermissionContentMs: index < 7 ? minute(159) : index < 9 ? minute(170) : null,
      firstAttackSignatureContentMs: index < 7 ? minute(159) : null,
    }));
    expect(evaluatePrologueQualificationCohort(passing)).toEqual({
      sampleSize: 10,
      rangeTrialPermissionContentMsP90: minute(170),
      formalAttackUnlockByDeadlineProportion: 0.7,
      passes: { rangeTrialPermissionP90: true, formalAttackUnlockProportion: true },
      accepted: true,
    });

    const missing = passing.map((sample, index) => index === 6
      ? { ...sample, rangeTrialPermissionContentMs: null, firstAttackSignatureContentMs: null }
      : sample);
    expect(evaluatePrologueQualificationCohort(missing)).toMatchObject({
      rangeTrialPermissionContentMsP90: null,
      formalAttackUnlockByDeadlineProportion: 0.6,
      passes: { rangeTrialPermissionP90: false, formalAttackUnlockProportion: false },
      accepted: false,
    });
    expect(evaluatePrologueQualificationCohort([])).toMatchObject({ accepted: false, sampleSize: 0 });
    expect(() => evaluatePrologueQualificationCohort([{
      sessionId: "cohort.bad.order",
      rangeTrialPermissionContentMs: minute(160),
      firstAttackSignatureContentMs: minute(159),
    }])).toThrow(/must follow/);
  });
});
