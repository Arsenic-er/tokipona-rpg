import { describe, expect, it } from "vitest";
import {
  PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
  PROLOGUE_PLAYTEST_COHORT_REPORT_SCHEMA,
  PROLOGUE_PLAYTEST_COLLECTION_MODE,
  evaluateProloguePlaytestCohortFile,
  mergeProloguePlaytestCohortFiles,
  readProloguePlaytestCohortFile,
} from "./prologue-playtest-cohort-file";
import { PROLOGUE_PLAYTEST_SESSION_SCHEMA, type ProloguePlaytestSessionSample } from "./prologue-playtest-cohort";

const MINUTE_MS = 60_000;

describe("portable prologue playtest cohort files", () => {
  it("evaluates anonymized observed samples without echoing session records", () => {
    const report = evaluateProloguePlaytestCohortFile(cohort(Array.from({ length: 10 }, (_, index) => sample(index))));
    expect(report).toMatchObject({
      schemaVersion: PROLOGUE_PLAYTEST_COHORT_REPORT_SCHEMA,
      collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
      cohortId: "cohort.prologue.alpha",
      status: "accepted",
      acceptance: { accepted: true, sampleSize: 10 },
    });
    expect(JSON.stringify(report)).not.toContain("playtest.session.0");
    expect(JSON.stringify(report)).not.toContain("samples");
  });

  it("rejects runner-shaped, unidentified, unknown-field, and duplicate-session input", () => {
    expect(() => readProloguePlaytestCohortFile({ contentMinutes: 180, telemetryEvents: [] })).toThrow(/unknown or missing/);
    expect(() => readProloguePlaytestCohortFile({
      ...cohort([]), collectionMode: "deterministic_runner",
    })).toThrow(/anonymized observed/);
    expect(() => readProloguePlaytestCohortFile({ ...cohort([]), rawText: "answer" })).toThrow(/unknown or missing/);
    expect(() => evaluateProloguePlaytestCohortFile(cohort([sample(0), sample(0)]))).toThrow(/duplicate session/);
  });

  it("emits a rejected report, rather than converting failed thresholds into invalid input", () => {
    const report = evaluateProloguePlaytestCohortFile(cohort([sample(0, {
      forcedHuntCount: 1,
      wildlifeHarmEventCount: 1,
      minimumNeedsValueObserved: 0,
    })]));
    expect(report).toMatchObject({
      status: "rejected",
      acceptance: {
        accepted: false,
        passes: { zeroForcedHunts: false, zeroWildlifeHarm: false, needsFloor: false },
      },
    });
  });

  it("strictly merges observed exports in deterministic pseudonymous-session order", () => {
    const merged = mergeProloguePlaytestCohortFiles({
      cohortId: "cohort.prologue.merged",
      cohorts: [cohort([sample(2), sample(0)]), { ...cohort([sample(1)]), cohortId: "cohort.local.export" }],
    });
    expect(merged).toMatchObject({
      schemaVersion: PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
      collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
      cohortId: "cohort.prologue.merged",
    });
    expect(merged.samples.map((entry) => entry.sessionId)).toEqual([
      "playtest.session.0", "playtest.session.1", "playtest.session.2",
    ]);
  });

  it("rejects empty, duplicate, and privacy-expanding merge inputs", () => {
    expect(() => mergeProloguePlaytestCohortFiles({ cohortId: "cohort.empty", cohorts: [] }))
      .toThrow(/at least one/);
    expect(() => mergeProloguePlaytestCohortFiles({ cohortId: "cohort.empty", cohorts: [cohort([])] }))
      .toThrow(/no samples/);
    expect(() => mergeProloguePlaytestCohortFiles({
      cohortId: "cohort.duplicate",
      cohorts: [cohort([sample(0)]), cohort([sample(0)])],
    })).toThrow(/duplicate session/);
    expect(() => mergeProloguePlaytestCohortFiles({
      cohortId: "cohort.private",
      cohorts: [cohort([{ ...sample(0), rawText: "telo" }])],
    })).toThrow(/unknown or missing/);
  });
});

function cohort(samples: readonly unknown[]): Record<string, unknown> {
  return {
    schemaVersion: PROLOGUE_PLAYTEST_COHORT_FILE_SCHEMA,
    collectionMode: PROLOGUE_PLAYTEST_COLLECTION_MODE,
    cohortId: "cohort.prologue.alpha",
    samples,
  };
}

function sample(index: number, overrides: Partial<ProloguePlaytestSessionSample> = {}): ProloguePlaytestSessionSample {
  return {
    schemaVersion: PROLOGUE_PLAYTEST_SESSION_SCHEMA,
    sessionId: `playtest.session.${index}`,
    contentActiveMs: 180 * MINUTE_MS,
    worldPeoplePhysicsActiveMs: 126 * MINUTE_MS,
    languageActiveMs: 36 * MINUTE_MS,
    longExplanationActiveMs: 18 * MINUTE_MS,
    survivalUiActiveMs: 216_000,
    languageInteractionCount: 100,
    needsInterruptedLanguageInteractionCount: 2,
    freeFoodWaterDiscoveryMs: 50_000,
    softFailureRecoveryDurationsMs: [90_000],
    rangeTrialPermissionContentMs: 159 * MINUTE_MS,
    firstAttackSignatureContentMs: 159 * MINUTE_MS,
    forcedHuntCount: 0,
    wildlifeHarmEventCount: 0,
    huntingIncomeCoin: 6,
    huntingActiveMs: 15 * MINUTE_MS,
    nonviolentJobIncomeCoin: 10,
    nonviolentJobActiveMs: 10 * MINUTE_MS,
    duplicateCorpseLotCurrencyCount: 0,
    minimumNeedsValueObserved: 20,
    maximumActiveNewWordsInAnySegment: 2,
    ...overrides,
  };
}
