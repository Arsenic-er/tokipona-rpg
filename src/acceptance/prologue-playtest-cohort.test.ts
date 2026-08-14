import { describe, expect, it } from "vitest";
import {
  PROLOGUE_PLAYTEST_SESSION_SCHEMA,
  evaluateProloguePlaytestCohort,
  readProloguePlaytestSessionSample,
  type ProloguePlaytestSessionSample,
} from "./prologue-playtest-cohort";

const MINUTE_MS = 60_000;

describe("prologue playtest cohort acceptance", () => {
  it("accepts a privacy-safe observed cohort at every frozen threshold", () => {
    const samples = Array.from({ length: 10 }, (_, index) => sample(index));
    expect(evaluateProloguePlaytestCohort(samples)).toEqual({
      sampleSize: 10,
      observedContentMs: 10 * 180 * MINUTE_MS,
      worldPeoplePhysicsTimeShare: 0.7,
      languageActivityTimeShare: 0.2,
      longExplanationPanelTimeShare: 0.1,
      survivalUiActiveTimeShare: 0.02,
      needsInterruptedLanguageInteractionShare: 0.02,
      freeFoodWaterDiscoveryMsP95: 50_000,
      softFailureRecoveryMsP90: 90_000,
      huntingIncomeCoinPerActiveMinute: 0.4,
      nonviolentJobIncomeCoinPerActiveMinute: 1,
      huntingIncomeVsNonviolentJobRatio: 0.4,
      forcedHuntCount: 0,
      wildlifeHarmEventCount: 0,
      duplicateCorpseLotCurrencyCount: 0,
      minimumNeedsValueObserved: 20,
      maximumActiveNewWordsInAnySegment: 2,
      qualification: {
        sampleSize: 10,
        rangeTrialPermissionContentMsP90: 170 * MINUTE_MS,
        formalAttackUnlockByDeadlineProportion: 0.7,
        passes: { rangeTrialPermissionP90: true, formalAttackUnlockProportion: true },
        accepted: true,
      },
      passes: {
        sampleCoverage: true,
        worldPeoplePhysicsTimeShare: true,
        languageActivityTimeShare: true,
        longExplanationPanelTimeShare: true,
        survivalUiActiveTimeShare: true,
        needsInterruptedLanguageInteractionShare: true,
        freeFoodWaterDiscoveryP95: true,
        softFailureRecoveryP90: true,
        qualification: true,
        zeroForcedHunts: true,
        zeroWildlifeHarm: true,
        huntingIncomeBalance: true,
        noDuplicateCorpseLotCurrency: true,
        needsFloor: true,
        activeWordFocus: true,
      },
      accepted: true,
    });
  });

  it("rejects unknown/raw fields, incomplete observation windows, impossible ratios, and bad causality", () => {
    expect(() => readProloguePlaytestSessionSample({ ...sample(0), rawText: "answer" })).toThrow(/unknown or missing/);
    expect(() => readProloguePlaytestSessionSample({ ...sample(0), contentActiveMs: 179 * MINUTE_MS })).toThrow(/minimum content/);
    expect(() => readProloguePlaytestSessionSample({
      ...sample(0), worldPeoplePhysicsActiveMs: 125 * MINUTE_MS,
    })).toThrow(/exclusive primary activity/);
    expect(() => readProloguePlaytestSessionSample({
      ...sample(0), languageInteractionCount: 1, needsInterruptedLanguageInteractionCount: 2,
    })).toThrow(/interruptions exceed/);
    expect(() => readProloguePlaytestSessionSample({ ...sample(0), huntingIncomeCoin: 1, huntingActiveMs: 0 })).toThrow(/income requires/);
    expect(() => readProloguePlaytestSessionSample({
      ...sample(0), rangeTrialPermissionContentMs: null, firstAttackSignatureContentMs: 159 * MINUTE_MS,
    })).toThrow(/must follow/);
    expect(() => evaluateProloguePlaytestCohort([sample(0), sample(0)])).toThrow(/duplicate session/);
  });

  it("fails closed for an empty cohort and for missing percentile observations", () => {
    expect(evaluateProloguePlaytestCohort([])).toMatchObject({
      accepted: false,
      sampleSize: 0,
      freeFoodWaterDiscoveryMsP95: null,
      softFailureRecoveryMsP90: null,
      passes: { sampleCoverage: false, freeFoodWaterDiscoveryP95: false, softFailureRecoveryP90: false },
    });
    const missing = Array.from({ length: 10 }, (_, index) => sample(index, {
      freeFoodWaterDiscoveryMs: index === 9 ? null : 50_000,
      softFailureRecoveryDurationsMs: [],
    }));
    expect(evaluateProloguePlaytestCohort(missing)).toMatchObject({
      accepted: false,
      freeFoodWaterDiscoveryMsP95: null,
      softFailureRecoveryMsP90: null,
      passes: { freeFoodWaterDiscoveryP95: false, softFailureRecoveryP90: false },
    });
  });

  it("uses nearest-rank p90/p95 boundaries and does not average away tail failures", () => {
    const p90Pass = Array.from({ length: 10 }, (_, index) => sample(index, {
      softFailureRecoveryDurationsMs: [index === 9 ? 121_000 : 120_000],
    }));
    expect(evaluateProloguePlaytestCohort(p90Pass)).toMatchObject({
      softFailureRecoveryMsP90: 120_000,
      passes: { softFailureRecoveryP90: true },
    });
    const p90Fail = Array.from({ length: 10 }, (_, index) => sample(index, {
      softFailureRecoveryDurationsMs: [index >= 8 ? 121_000 : 120_000],
    }));
    expect(evaluateProloguePlaytestCohort(p90Fail)).toMatchObject({
      accepted: false,
      softFailureRecoveryMsP90: 121_000,
      passes: { softFailureRecoveryP90: false },
    });

    const p95Pass = Array.from({ length: 20 }, (_, index) => sample(index, {
      freeFoodWaterDiscoveryMs: index === 19 ? 61_000 : 60_000,
      rangeTrialPermissionContentMs: 159 * MINUTE_MS,
      firstAttackSignatureContentMs: index < 14 ? 159 * MINUTE_MS : null,
    }));
    expect(evaluateProloguePlaytestCohort(p95Pass)).toMatchObject({
      freeFoodWaterDiscoveryMsP95: 60_000,
      passes: { freeFoodWaterDiscoveryP95: true },
    });
    const p95Fail = p95Pass.map((entry, index) => index === 18 ? { ...entry, freeFoodWaterDiscoveryMs: 61_000 } : entry);
    expect(evaluateProloguePlaytestCohort(p95Fail)).toMatchObject({
      accepted: false,
      freeFoodWaterDiscoveryMsP95: 61_000,
      passes: { freeFoodWaterDiscoveryP95: false },
    });
  });

  it("reports every remaining gameplay threshold instead of hiding failures in a combined score", () => {
    const failing = Array.from({ length: 10 }, (_, index) => sample(index, {
      survivalUiActiveMs: 6 * MINUTE_MS,
      worldPeoplePhysicsActiveMs: 115.2 * MINUTE_MS,
      languageActiveMs: 46.8 * MINUTE_MS,
      longExplanationActiveMs: 18 * MINUTE_MS,
      languageInteractionCount: 10,
      needsInterruptedLanguageInteractionCount: 1,
      forcedHuntCount: index === 0 ? 1 : 0,
      wildlifeHarmEventCount: index === 0 ? 1 : 0,
      huntingIncomeCoin: 7,
      huntingActiveMs: 10 * MINUTE_MS,
      duplicateCorpseLotCurrencyCount: index === 0 ? 1 : 0,
      minimumNeedsValueObserved: 19,
      maximumActiveNewWordsInAnySegment: 3,
      rangeTrialPermissionContentMs: null,
      firstAttackSignatureContentMs: null,
    }));
    expect(evaluateProloguePlaytestCohort(failing)).toMatchObject({
      accepted: false,
      passes: {
        worldPeoplePhysicsTimeShare: false,
        languageActivityTimeShare: false,
        survivalUiActiveTimeShare: false,
        needsInterruptedLanguageInteractionShare: false,
        qualification: false,
        zeroForcedHunts: false,
        zeroWildlifeHarm: false,
        huntingIncomeBalance: false,
        noDuplicateCorpseLotCurrency: false,
        needsFloor: false,
        activeWordFocus: false,
      },
    });
  });
});

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
    softFailureRecoveryDurationsMs: [60_000, 90_000],
    rangeTrialPermissionContentMs: index < 7 ? 159 * MINUTE_MS : index < 9 ? 170 * MINUTE_MS : null,
    firstAttackSignatureContentMs: index < 7 ? 159 * MINUTE_MS : null,
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
