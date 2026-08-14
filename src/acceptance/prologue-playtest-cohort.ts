import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json" with { type: "json" };
import {
  PROLOGUE_PLAYTEST_SESSION_FIELDS,
  readRuntimePrologueAcceptanceManifest,
} from "../content/runtime-prologue-acceptance-manifest.ts";
import {
  evaluatePrologueQualificationCohort,
  type PrologueQualificationCohortAcceptanceReport,
} from "./prologue-telemetry.ts";

const CONTRACT = readRuntimePrologueAcceptanceManifest(generatedRuntimeArtifact);
const SUMMARY = CONTRACT.telemetry.playtestSessionSummary;
const PLAYTEST = CONTRACT.acceptance.playtest;
const SEMANTIC_ID = /^[a-z0-9][a-z0-9_.:-]*$/;
const MINUTE_MS = 60_000;

export const PROLOGUE_PLAYTEST_SESSION_SCHEMA = "prologue.playtest-session.v0.1" as const;

export interface ProloguePlaytestSessionSample {
  readonly schemaVersion: typeof PROLOGUE_PLAYTEST_SESSION_SCHEMA;
  readonly sessionId: string;
  readonly contentActiveMs: number;
  readonly worldPeoplePhysicsActiveMs: number;
  readonly languageActiveMs: number;
  readonly longExplanationActiveMs: number;
  readonly survivalUiActiveMs: number;
  readonly languageInteractionCount: number;
  readonly needsInterruptedLanguageInteractionCount: number;
  readonly freeFoodWaterDiscoveryMs: number | null;
  readonly softFailureRecoveryDurationsMs: readonly number[];
  readonly rangeTrialPermissionContentMs: number | null;
  readonly firstAttackSignatureContentMs: number | null;
  readonly forcedHuntCount: number;
  readonly wildlifeHarmEventCount: number;
  readonly huntingIncomeCoin: number;
  readonly huntingActiveMs: number;
  readonly nonviolentJobIncomeCoin: number;
  readonly nonviolentJobActiveMs: number;
  readonly duplicateCorpseLotCurrencyCount: number;
  readonly minimumNeedsValueObserved: number;
  readonly maximumActiveNewWordsInAnySegment: number;
}

export interface ProloguePlaytestCohortAcceptanceReport {
  readonly sampleSize: number;
  readonly observedContentMs: number;
  readonly worldPeoplePhysicsTimeShare: number | null;
  readonly languageActivityTimeShare: number | null;
  readonly longExplanationPanelTimeShare: number | null;
  readonly survivalUiActiveTimeShare: number | null;
  readonly needsInterruptedLanguageInteractionShare: number | null;
  readonly freeFoodWaterDiscoveryMsP95: number | null;
  readonly softFailureRecoveryMsP90: number | null;
  readonly huntingIncomeCoinPerActiveMinute: number | null;
  readonly nonviolentJobIncomeCoinPerActiveMinute: number | null;
  readonly huntingIncomeVsNonviolentJobRatio: number | null;
  readonly forcedHuntCount: number;
  readonly wildlifeHarmEventCount: number;
  readonly duplicateCorpseLotCurrencyCount: number;
  readonly minimumNeedsValueObserved: number | null;
  readonly maximumActiveNewWordsInAnySegment: number | null;
  readonly qualification: PrologueQualificationCohortAcceptanceReport;
  readonly passes: Readonly<{
    sampleCoverage: boolean;
    worldPeoplePhysicsTimeShare: boolean;
    languageActivityTimeShare: boolean;
    longExplanationPanelTimeShare: boolean;
    survivalUiActiveTimeShare: boolean;
    needsInterruptedLanguageInteractionShare: boolean;
    freeFoodWaterDiscoveryP95: boolean;
    softFailureRecoveryP90: boolean;
    qualification: boolean;
    zeroForcedHunts: boolean;
    zeroWildlifeHarm: boolean;
    huntingIncomeBalance: boolean;
    noDuplicateCorpseLotCurrency: boolean;
    needsFloor: boolean;
    activeWordFocus: boolean;
  }>;
  readonly accepted: boolean;
}

export function readProloguePlaytestSessionSample(candidate: unknown): ProloguePlaytestSessionSample {
  const value = record(candidate, "playtest session sample");
  exactKeys(value, PROLOGUE_PLAYTEST_SESSION_FIELDS, "playtest session sample");
  if (value.schemaVersion !== PROLOGUE_PLAYTEST_SESSION_SCHEMA) {
    throw new Error("playtest session schema is invalid");
  }
  const sessionId = semanticId(value.sessionId, "playtest sessionId");
  const contentActiveMs = nonNegativeSafeInteger(value.contentActiveMs, "contentActiveMs");
  if (contentActiveMs < SUMMARY.minimumObservedContentMinutes * MINUTE_MS) {
    throw new Error("playtest sample does not cover the minimum content window");
  }
  const worldPeoplePhysicsActiveMs = nonNegativeSafeInteger(
    value.worldPeoplePhysicsActiveMs,
    "worldPeoplePhysicsActiveMs",
  );
  const languageActiveMs = nonNegativeSafeInteger(value.languageActiveMs, "languageActiveMs");
  const longExplanationActiveMs = nonNegativeSafeInteger(
    value.longExplanationActiveMs,
    "longExplanationActiveMs",
  );
  if (sum([worldPeoplePhysicsActiveMs, languageActiveMs, longExplanationActiveMs]) !== contentActiveMs) {
    throw new Error("exclusive primary activity time must equal observed content time");
  }
  const survivalUiActiveMs = nonNegativeSafeInteger(value.survivalUiActiveMs, "survivalUiActiveMs");
  if (survivalUiActiveMs > contentActiveMs) throw new Error("survival UI time exceeds observed content time");
  const languageInteractionCount = nonNegativeSafeInteger(value.languageInteractionCount, "languageInteractionCount");
  const needsInterruptedLanguageInteractionCount = nonNegativeSafeInteger(
    value.needsInterruptedLanguageInteractionCount,
    "needsInterruptedLanguageInteractionCount",
  );
  if (needsInterruptedLanguageInteractionCount > languageInteractionCount) {
    throw new Error("needs interruptions exceed language interactions");
  }
  const freeFoodWaterDiscoveryMs = optionalBoundedTimestamp(
    value.freeFoodWaterDiscoveryMs,
    contentActiveMs,
    "freeFoodWaterDiscoveryMs",
  );
  if (!Array.isArray(value.softFailureRecoveryDurationsMs)) {
    throw new Error("softFailureRecoveryDurationsMs must be an array");
  }
  const softFailureRecoveryDurationsMs = Object.freeze(value.softFailureRecoveryDurationsMs.map((duration, index) =>
    nonNegativeSafeInteger(duration, `softFailureRecoveryDurationsMs[${index}]`)));
  const rangeTrialPermissionContentMs = optionalBoundedTimestamp(
    value.rangeTrialPermissionContentMs,
    contentActiveMs,
    "rangeTrialPermissionContentMs",
  );
  const firstAttackSignatureContentMs = optionalBoundedTimestamp(
    value.firstAttackSignatureContentMs,
    contentActiveMs,
    "firstAttackSignatureContentMs",
  );
  if (firstAttackSignatureContentMs !== null &&
      (rangeTrialPermissionContentMs === null || firstAttackSignatureContentMs < rangeTrialPermissionContentMs)) {
    throw new Error("first attack signature must follow range-trial permission");
  }
  const forcedHuntCount = nonNegativeSafeInteger(value.forcedHuntCount, "forcedHuntCount");
  const wildlifeHarmEventCount = nonNegativeSafeInteger(value.wildlifeHarmEventCount, "wildlifeHarmEventCount");
  const huntingIncomeCoin = nonNegativeSafeInteger(value.huntingIncomeCoin, "huntingIncomeCoin");
  const huntingActiveMs = nonNegativeSafeInteger(value.huntingActiveMs, "huntingActiveMs");
  const nonviolentJobIncomeCoin = nonNegativeSafeInteger(value.nonviolentJobIncomeCoin, "nonviolentJobIncomeCoin");
  const nonviolentJobActiveMs = nonNegativeSafeInteger(value.nonviolentJobActiveMs, "nonviolentJobActiveMs");
  if ((huntingActiveMs === 0 && huntingIncomeCoin !== 0) ||
      (nonviolentJobActiveMs === 0 && nonviolentJobIncomeCoin !== 0)) {
    throw new Error("income requires a nonzero observed active duration");
  }
  const duplicateCorpseLotCurrencyCount = nonNegativeSafeInteger(
    value.duplicateCorpseLotCurrencyCount,
    "duplicateCorpseLotCurrencyCount",
  );
  const minimumNeedsValueObserved = boundedSafeInteger(value.minimumNeedsValueObserved, 0, 100, "minimumNeedsValueObserved");
  const maximumActiveNewWordsInAnySegment = nonNegativeSafeInteger(
    value.maximumActiveNewWordsInAnySegment,
    "maximumActiveNewWordsInAnySegment",
  );
  return Object.freeze({
    schemaVersion: PROLOGUE_PLAYTEST_SESSION_SCHEMA,
    sessionId,
    contentActiveMs,
    worldPeoplePhysicsActiveMs,
    languageActiveMs,
    longExplanationActiveMs,
    survivalUiActiveMs,
    languageInteractionCount,
    needsInterruptedLanguageInteractionCount,
    freeFoodWaterDiscoveryMs,
    softFailureRecoveryDurationsMs,
    rangeTrialPermissionContentMs,
    firstAttackSignatureContentMs,
    forcedHuntCount,
    wildlifeHarmEventCount,
    huntingIncomeCoin,
    huntingActiveMs,
    nonviolentJobIncomeCoin,
    nonviolentJobActiveMs,
    duplicateCorpseLotCurrencyCount,
    minimumNeedsValueObserved,
    maximumActiveNewWordsInAnySegment,
  });
}

export function evaluateProloguePlaytestCohort(
  candidates: readonly unknown[],
): ProloguePlaytestCohortAcceptanceReport {
  const samples = candidates.map(readProloguePlaytestSessionSample);
  if (new Set(samples.map((sample) => sample.sessionId)).size !== samples.length) {
    throw new Error("playtest cohort contains duplicate session IDs");
  }
  const observedContentMs = sum(samples.map((sample) => sample.contentActiveMs));
  const worldPeoplePhysicsActiveMs = sum(samples.map((sample) => sample.worldPeoplePhysicsActiveMs));
  const languageActiveMs = sum(samples.map((sample) => sample.languageActiveMs));
  const longExplanationActiveMs = sum(samples.map((sample) => sample.longExplanationActiveMs));
  const survivalUiActiveMs = sum(samples.map((sample) => sample.survivalUiActiveMs));
  const languageInteractions = sum(samples.map((sample) => sample.languageInteractionCount));
  const needsInterruptions = sum(samples.map((sample) => sample.needsInterruptedLanguageInteractionCount));
  const worldPeoplePhysicsShare = observedContentMs === 0 ? null : worldPeoplePhysicsActiveMs / observedContentMs;
  const languageShare = observedContentMs === 0 ? null : languageActiveMs / observedContentMs;
  const longExplanationShare = observedContentMs === 0 ? null : longExplanationActiveMs / observedContentMs;
  const survivalUiShare = observedContentMs === 0 ? null : survivalUiActiveMs / observedContentMs;
  const needsInterruptionShare = languageInteractions === 0 ? null : needsInterruptions / languageInteractions;
  const freeFoodP95 = nearestRank(
    samples.map((sample) => sample.freeFoodWaterDiscoveryMs ?? Number.POSITIVE_INFINITY),
    0.95,
  );
  const recoveryP90 = nearestRank(samples.flatMap((sample) => sample.softFailureRecoveryDurationsMs), 0.90);
  const huntingCoin = sum(samples.map((sample) => sample.huntingIncomeCoin));
  const huntingActiveMs = sum(samples.map((sample) => sample.huntingActiveMs));
  const nonviolentCoin = sum(samples.map((sample) => sample.nonviolentJobIncomeCoin));
  const nonviolentActiveMs = sum(samples.map((sample) => sample.nonviolentJobActiveMs));
  const huntingRate = observedRate(huntingCoin, huntingActiveMs, true);
  const nonviolentRate = observedRate(nonviolentCoin, nonviolentActiveMs, false);
  const incomeRatio = huntingRate !== null && nonviolentRate !== null && nonviolentRate > 0
    ? huntingRate / nonviolentRate
    : null;
  const forcedHuntCount = sum(samples.map((sample) => sample.forcedHuntCount));
  const wildlifeHarmEventCount = sum(samples.map((sample) => sample.wildlifeHarmEventCount));
  const duplicateCount = sum(samples.map((sample) => sample.duplicateCorpseLotCurrencyCount));
  const minimumNeeds = samples.length === 0 ? null : Math.min(...samples.map((sample) => sample.minimumNeedsValueObserved));
  const maximumActiveWords = samples.length === 0
    ? null
    : Math.max(...samples.map((sample) => sample.maximumActiveNewWordsInAnySegment));
  const qualification = evaluatePrologueQualificationCohort(samples.map((sample) => ({
    sessionId: sample.sessionId,
    rangeTrialPermissionContentMs: sample.rangeTrialPermissionContentMs,
    firstAttackSignatureContentMs: sample.firstAttackSignatureContentMs,
  })));
  const passes = Object.freeze({
    sampleCoverage: samples.length > 0,
    worldPeoplePhysicsTimeShare: worldPeoplePhysicsShare !== null &&
      worldPeoplePhysicsShare >= PLAYTEST.worldPeoplePhysicsTimeShareMinimum,
    languageActivityTimeShare: languageShare !== null &&
      languageShare >= PLAYTEST.languageActivityTimeShareRange[0] &&
      languageShare <= PLAYTEST.languageActivityTimeShareRange[1],
    longExplanationPanelTimeShare: longExplanationShare !== null &&
      longExplanationShare <= PLAYTEST.longExplanationPanelTimeShareMaximum,
    survivalUiActiveTimeShare: survivalUiShare !== null &&
      survivalUiShare <= PLAYTEST.survivalUiActiveTimeShareMaximum,
    needsInterruptedLanguageInteractionShare: needsInterruptionShare !== null &&
      needsInterruptionShare <= PLAYTEST.needsInterruptedLanguageInteractionShareMaximum,
    freeFoodWaterDiscoveryP95: freeFoodP95 !== null &&
      freeFoodP95 <= PLAYTEST.freeFoodWaterDiscoverySecondsP95Maximum * 1_000,
    softFailureRecoveryP90: recoveryP90 !== null &&
      recoveryP90 <= PLAYTEST.actualSoftFailureRecoverySecondsP90Target * 1_000,
    qualification: qualification.accepted,
    zeroForcedHunts: forcedHuntCount === PLAYTEST.forcedHunts,
    zeroWildlifeHarm: wildlifeHarmEventCount === PLAYTEST.mandatoryWildlifeHarmEvents,
    huntingIncomeBalance: incomeRatio !== null && incomeRatio <= PLAYTEST.huntingIncomeVsNonviolentJobMaximum,
    noDuplicateCorpseLotCurrency: duplicateCount === PLAYTEST.duplicateCorpseLotCurrencyCount,
    needsFloor: minimumNeeds !== null && minimumNeeds >= PLAYTEST.prologueNeedsFloorMinimum,
    activeWordFocus: maximumActiveWords !== null &&
      maximumActiveWords <= PLAYTEST.focusActiveNewWordsPerSegmentMaximum,
  });
  return Object.freeze({
    sampleSize: samples.length,
    observedContentMs,
    worldPeoplePhysicsTimeShare: worldPeoplePhysicsShare,
    languageActivityTimeShare: languageShare,
    longExplanationPanelTimeShare: longExplanationShare,
    survivalUiActiveTimeShare: survivalUiShare,
    needsInterruptedLanguageInteractionShare: needsInterruptionShare,
    freeFoodWaterDiscoveryMsP95: freeFoodP95,
    softFailureRecoveryMsP90: recoveryP90,
    huntingIncomeCoinPerActiveMinute: huntingRate,
    nonviolentJobIncomeCoinPerActiveMinute: nonviolentRate,
    huntingIncomeVsNonviolentJobRatio: incomeRatio,
    forcedHuntCount,
    wildlifeHarmEventCount,
    duplicateCorpseLotCurrencyCount: duplicateCount,
    minimumNeedsValueObserved: minimumNeeds,
    maximumActiveNewWordsInAnySegment: maximumActiveWords,
    qualification,
    passes,
    accepted: Object.values(passes).every(Boolean),
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function semanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMANTIC_ID.test(value)) throw new Error(`${label} must be a semantic identifier`);
  return value;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}

function boundedSafeInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  const result = nonNegativeSafeInteger(value, label);
  if (result < minimum || result > maximum) throw new Error(`${label} is outside its authored bounds`);
  return result;
}

function optionalBoundedTimestamp(value: unknown, maximum: number, label: string): number | null {
  if (value === null) return null;
  const result = nonNegativeSafeInteger(value, label);
  if (result > maximum) throw new Error(`${label} exceeds observed content time`);
  return result;
}

function sum(values: readonly number[]): number {
  const result = values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(result)) throw new Error("playtest aggregate exceeds the safe integer range");
  return result;
}

function nearestRank(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.ceil(sorted.length * percentile) - 1]!;
  return Number.isFinite(value) ? value : null;
}

function observedRate(coin: number, activeMs: number, allowUnobservedZero: boolean): number | null {
  if (activeMs === 0) return allowUnobservedZero && coin === 0 ? 0 : null;
  return coin / (activeMs / MINUTE_MS);
}
