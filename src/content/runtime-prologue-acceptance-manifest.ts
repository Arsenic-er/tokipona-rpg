import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";

export const PROLOGUE_TELEMETRY_EVENT_IDS = Object.freeze([
  "prologue_segment_started", "prologue_segment_completed", "world_literacy_observed",
  "world_literacy_intervened", "causal_attribution_submitted", "active_retrieval_submitted",
  "repair_requested", "repair_completed", "unseen_transfer_completed", "delayed_retrieval_completed",
  "alternate_method_used", "wildlife_encountered", "wildlife_provoked", "wildlife_fled",
  "wildlife_harmed", "local_reset_requested", "local_reset_completed", "capacity_milestone_committed",
  "attack_capacity_calibrated", "range_trial_permission_granted", "first_attack_signature_unlocked",
  "attack_qualification_started", "attack_qualification_completed", "safe_range_completed",
] as const);

export const PROLOGUE_INCLUDED_ACTIVITY_KINDS = Object.freeze([
  "world_people_physics", "language", "long_explanation",
] as const);

export const PROLOGUE_EXCLUDED_ACTIVITY_KINDS = Object.freeze([
  "pause", "idle", "settings", "optional_free_roam",
] as const);

export const PROLOGUE_TELEMETRY_REQUIRED_FIELDS = Object.freeze([
  "schemaVersion", "eventId", "sessionId", "sequence", "worldTick", "segmentId",
  "primaryActivity", "contentActiveMs", "semantic",
] as const);

export const PROLOGUE_TELEMETRY_SEMANTIC_FIELDS = Object.freeze([
  "subjectId", "outcomeId", "practiceFamilyId", "promptLevel", "count", "durationMs",
] as const);

export const PROLOGUE_TELEMETRY_FORBIDDEN_FIELDS = Object.freeze([
  "rawUtterance", "rawText", "inventoryLotId", "damageOverride", "worldFlagOverride",
] as const);

export const PROLOGUE_CONSEQUENTIAL_CHOICE_EVENT_IDS = Object.freeze([
  "world_literacy_intervened", "repair_completed", "alternate_method_used",
] as const);

export const PROLOGUE_ACTIVE_RETRIEVAL_EVENT_IDS = Object.freeze([
  "active_retrieval_submitted", "delayed_retrieval_completed",
] as const);

export type PrologueTelemetryEventId = typeof PROLOGUE_TELEMETRY_EVENT_IDS[number];
export type PrologueIncludedActivityKind = typeof PROLOGUE_INCLUDED_ACTIVITY_KINDS[number];
export type PrologueExcludedActivityKind = typeof PROLOGUE_EXCLUDED_ACTIVITY_KINDS[number];
export type PrologueActivityKind = PrologueIncludedActivityKind | PrologueExcludedActivityKind;

export interface RuntimePrologueAcceptanceManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml";
  readonly contentVersion: "chapter-01.prologue.1";
  readonly telemetry: Readonly<{
    schemaVersion: "prologue.telemetry.v0.1";
    eventIds: readonly PrologueTelemetryEventId[];
    includedPrimaryActivities: readonly PrologueIncludedActivityKind[];
    excludedActivities: readonly PrologueExcludedActivityKind[];
    exclusivePrimaryActivity: true;
    payload: Readonly<{
      requiredFields: readonly string[];
      semanticFieldKeys: readonly string[];
      forbiddenFields: readonly string[];
    }>;
    cadence: Readonly<{
      consequentialChoiceEventIds: readonly (typeof PROLOGUE_CONSEQUENTIAL_CHOICE_EVENT_IDS)[number][];
      consequentialChoiceMaximumGapMinutes: 20;
      activeRetrievalEventIds: readonly (typeof PROLOGUE_ACTIVE_RETRIEVAL_EVENT_IDS)[number][];
      activeRetrievalIntervalMinutes: readonly [30, 40];
      activeRetrievalPracticeFamilySemanticField: "practiceFamilyId";
      maximumConsecutiveSamePracticeFamily: 2;
    }>;
  }>;
  readonly acceptance: Readonly<{
    required: Readonly<{
      mandatoryKills: 0;
      safeRangeUsesLivingTargets: false;
      requiredTasksHaveNonAttackSolution: true;
      firstAttackReadsKillCount: false;
      lengthAvailableIsNotMastered: true;
      peacefulProgressWhenAttackLocked: true;
      meaningfulWorldDeltasOnReturnMinimum: 3;
    }>;
    playtest: Readonly<{
      forcedHunts: 0;
      wildlifeProductsRequiredForMainline: false;
      survivalNeedsModifyLanguageOrMp: false;
      prologueNeedsFloorMinimum: 20;
      activityShareUsesExclusivePrimaryTaxonomy: true;
      worldPeoplePhysicsTimeShareMinimum: 0.65;
      languageActivityTimeShareRange: readonly [0.15, 0.25];
      longExplanationPanelTimeShareMaximum: 0.10;
      focusActiveNewWordsPerSegmentMaximum: 2;
      recoveryPathVisibilityDesignMaxSeconds: 60;
      actualSoftFailureRecoverySecondsP90Target: 120;
      rangeTrialPermissionContentMinutesP90Maximum: 180;
      formalAttackUnlockBy180ContentMinutesProportionMinimum: 0.70;
      timeMetricExcludes: readonly PrologueExcludedActivityKind[];
      mandatoryWildlifeHarmEvents: 0;
      survivalUiActiveTimeShareMaximum: 0.03;
      needsInterruptedLanguageInteractionShareMaximum: 0.02;
      freeFoodWaterDiscoverySecondsP95Maximum: 60;
      huntingIncomeVsNonviolentJobMaximum: 0.60;
      duplicateCorpseLotCurrencyCount: 0;
    }>;
  }>;
}

const verified = new WeakSet<object>();

export function computeRuntimePrologueAcceptanceDigest(payload: unknown): `sha256:${string}` {
  return sha256Canonical(payload as JsonValue);
}

export function isVerifiedRuntimePrologueAcceptanceManifest(
  value: unknown,
): value is RuntimePrologueAcceptanceManifest {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimePrologueAcceptanceManifest(candidate: unknown): RuntimePrologueAcceptanceManifest {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.prologueAcceptance, "artifact.prologueAcceptance");
  const digest = string(raw.sourceDigest, "prologueAcceptance.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("prologue acceptance sourceDigest must be sha256");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimePrologueAcceptanceDigest(payload) !== digest) throw new Error("prologue acceptance projection digest mismatch");
  exactKeys(raw, ["sourceDigest", "sourcePath", "contentVersion", "telemetry", "acceptance"], "prologue acceptance");
  if (raw.sourcePath !== "data/chapters/ch01-world-literacy-prologue.v0.1.yaml" || raw.contentVersion !== "chapter-01.prologue.1") throw new Error("prologue acceptance source identity is invalid");

  const telemetry = record(raw.telemetry, "prologue telemetry");
  exactKeys(telemetry, ["schemaVersion", "eventIds", "includedPrimaryActivities", "excludedActivities", "exclusivePrimaryActivity", "payload", "cadence"], "prologue telemetry");
  if (telemetry.schemaVersion !== "prologue.telemetry.v0.1" || telemetry.exclusivePrimaryActivity !== true ||
      !same(telemetry.eventIds, PROLOGUE_TELEMETRY_EVENT_IDS) ||
      !same(telemetry.includedPrimaryActivities, PROLOGUE_INCLUDED_ACTIVITY_KINDS) ||
      !same(telemetry.excludedActivities, PROLOGUE_EXCLUDED_ACTIVITY_KINDS)) {
    throw new Error("prologue telemetry taxonomy is noncanonical");
  }
  const payloadContract = record(telemetry.payload, "prologue telemetry payload");
  exactKeys(payloadContract, ["requiredFields", "semanticFieldKeys", "forbiddenFields"], "prologue telemetry payload");
  if (!same(payloadContract.requiredFields, PROLOGUE_TELEMETRY_REQUIRED_FIELDS) ||
      !same(payloadContract.semanticFieldKeys, PROLOGUE_TELEMETRY_SEMANTIC_FIELDS) ||
      !same(payloadContract.forbiddenFields, PROLOGUE_TELEMETRY_FORBIDDEN_FIELDS)) {
    throw new Error("prologue telemetry payload contract is noncanonical");
  }
  const cadence = record(telemetry.cadence, "prologue telemetry cadence");
  exactKeys(cadence, ["consequentialChoiceEventIds", "consequentialChoiceMaximumGapMinutes", "activeRetrievalEventIds", "activeRetrievalIntervalMinutes", "activeRetrievalPracticeFamilySemanticField", "maximumConsecutiveSamePracticeFamily"], "prologue telemetry cadence");
  if (!same(cadence.consequentialChoiceEventIds, PROLOGUE_CONSEQUENTIAL_CHOICE_EVENT_IDS) ||
      cadence.consequentialChoiceMaximumGapMinutes !== 20 ||
      !same(cadence.activeRetrievalEventIds, PROLOGUE_ACTIVE_RETRIEVAL_EVENT_IDS) ||
      !numberPair(cadence.activeRetrievalIntervalMinutes, 30, 40) ||
      cadence.activeRetrievalPracticeFamilySemanticField !== "practiceFamilyId" ||
      cadence.maximumConsecutiveSamePracticeFamily !== 2) {
    throw new Error("prologue telemetry cadence contract is noncanonical");
  }

  const acceptance = record(raw.acceptance, "prologue acceptance thresholds");
  exactKeys(acceptance, ["required", "playtest"], "prologue acceptance thresholds");
  const required = record(acceptance.required, "prologue required acceptance");
  exactKeys(required, ["mandatoryKills", "safeRangeUsesLivingTargets", "requiredTasksHaveNonAttackSolution", "firstAttackReadsKillCount", "lengthAvailableIsNotMastered", "peacefulProgressWhenAttackLocked", "meaningfulWorldDeltasOnReturnMinimum"], "prologue required acceptance");
  if (required.mandatoryKills !== 0 || required.safeRangeUsesLivingTargets !== false || required.requiredTasksHaveNonAttackSolution !== true || required.firstAttackReadsKillCount !== false || required.lengthAvailableIsNotMastered !== true || required.peacefulProgressWhenAttackLocked !== true || required.meaningfulWorldDeltasOnReturnMinimum !== 3) throw new Error("prologue required acceptance is noncanonical");
  const playtest = record(acceptance.playtest, "prologue playtest acceptance");
  exactKeys(playtest, ["forcedHunts", "wildlifeProductsRequiredForMainline", "survivalNeedsModifyLanguageOrMp", "prologueNeedsFloorMinimum", "activityShareUsesExclusivePrimaryTaxonomy", "worldPeoplePhysicsTimeShareMinimum", "languageActivityTimeShareRange", "longExplanationPanelTimeShareMaximum", "focusActiveNewWordsPerSegmentMaximum", "recoveryPathVisibilityDesignMaxSeconds", "actualSoftFailureRecoverySecondsP90Target", "rangeTrialPermissionContentMinutesP90Maximum", "formalAttackUnlockBy180ContentMinutesProportionMinimum", "timeMetricExcludes", "mandatoryWildlifeHarmEvents", "survivalUiActiveTimeShareMaximum", "needsInterruptedLanguageInteractionShareMaximum", "freeFoodWaterDiscoverySecondsP95Maximum", "huntingIncomeVsNonviolentJobMaximum", "duplicateCorpseLotCurrencyCount"], "prologue playtest acceptance");
  if (playtest.forcedHunts !== 0 || playtest.wildlifeProductsRequiredForMainline !== false || playtest.survivalNeedsModifyLanguageOrMp !== false || playtest.prologueNeedsFloorMinimum !== 20 || playtest.activityShareUsesExclusivePrimaryTaxonomy !== true || playtest.worldPeoplePhysicsTimeShareMinimum !== 0.65 || !numberPair(playtest.languageActivityTimeShareRange, 0.15, 0.25) || playtest.longExplanationPanelTimeShareMaximum !== 0.10 || playtest.focusActiveNewWordsPerSegmentMaximum !== 2 || playtest.recoveryPathVisibilityDesignMaxSeconds !== 60 || playtest.actualSoftFailureRecoverySecondsP90Target !== 120 || playtest.rangeTrialPermissionContentMinutesP90Maximum !== 180 || playtest.formalAttackUnlockBy180ContentMinutesProportionMinimum !== 0.70 || !same(playtest.timeMetricExcludes, PROLOGUE_EXCLUDED_ACTIVITY_KINDS) || playtest.mandatoryWildlifeHarmEvents !== 0 || playtest.survivalUiActiveTimeShareMaximum !== 0.03 || playtest.needsInterruptedLanguageInteractionShareMaximum !== 0.02 || playtest.freeFoodWaterDiscoverySecondsP95Maximum !== 60 || playtest.huntingIncomeVsNonviolentJobMaximum !== 0.60 || playtest.duplicateCorpseLotCurrencyCount !== 0) throw new Error("prologue playtest acceptance is noncanonical");

  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimePrologueAcceptanceManifest;
  verified.add(result);
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function same(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function numberPair(value: unknown, first: number, second: number): boolean { return Array.isArray(value) && value.length === 2 && value[0] === first && value[1] === second; }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
