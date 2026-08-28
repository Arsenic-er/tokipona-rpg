import { createHash } from "node:crypto";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";
import type { RuntimePrologueAcceptanceManifest } from "../../src/content/runtime-prologue-acceptance-manifest.ts";

const PROLOGUE_TELEMETRY_EVENT_IDS = [
  "prologue_segment_started", "prologue_segment_completed", "world_literacy_observed",
  "world_literacy_intervened", "causal_attribution_submitted", "active_retrieval_submitted",
  "repair_requested", "repair_completed", "unseen_transfer_completed", "delayed_retrieval_completed",
  "alternate_method_used", "wildlife_encountered", "wildlife_provoked", "wildlife_fled",
  "wildlife_harmed", "local_reset_requested", "local_reset_completed", "capacity_milestone_committed",
  "attack_capacity_calibrated", "range_trial_permission_granted", "first_attack_signature_unlocked",
  "attack_qualification_started", "attack_qualification_completed", "safe_range_completed",
] as const;
const PROLOGUE_INCLUDED_ACTIVITY_KINDS = ["world_people_physics", "language", "long_explanation"] as const;
const PROLOGUE_EXCLUDED_ACTIVITY_KINDS = ["pause", "idle", "settings", "optional_free_roam"] as const;
const PROLOGUE_TELEMETRY_REQUIRED_FIELDS = ["schemaVersion", "eventId", "sessionId", "sequence", "worldTick", "segmentId", "primaryActivity", "contentActiveMs", "semantic"] as const;
const PROLOGUE_TELEMETRY_SEMANTIC_FIELDS = ["subjectId", "outcomeId", "practiceFamilyId", "promptLevel", "count", "durationMs"] as const;
const PROLOGUE_TELEMETRY_FORBIDDEN_FIELDS = ["rawUtterance", "rawText", "inventoryLotId", "damageOverride", "worldFlagOverride"] as const;
const PROLOGUE_CONSEQUENTIAL_CHOICE_EVENT_IDS = ["world_literacy_intervened", "repair_completed", "alternate_method_used"] as const;
const PROLOGUE_ACTIVE_RETRIEVAL_EVENT_IDS = ["active_retrieval_submitted", "delayed_retrieval_completed"] as const;
const PROLOGUE_PLAYTEST_SESSION_FIELDS = [
  "schemaVersion", "sessionId", "contentActiveMs", "worldPeoplePhysicsActiveMs", "languageActiveMs",
  "longExplanationActiveMs", "survivalUiActiveMs", "languageInteractionCount",
  "needsInterruptedLanguageInteractionCount", "freeFoodWaterDiscoveryMs", "softFailureRecoveryDurationsMs",
  "rangeTrialPermissionContentMs", "firstAttackSignatureContentMs", "forcedHuntCount", "wildlifeHarmEventCount",
  "huntingIncomeCoin", "huntingActiveMs", "nonviolentJobIncomeCoin", "nonviolentJobActiveMs",
  "duplicateCorpseLotCurrencyCount", "minimumNeedsValueObserved", "maximumActiveNewWordsInAnySegment",
] as const;
const PROLOGUE_PLAYTEST_SESSION_FORBIDDEN_FIELDS = [
  "rawUtterance", "rawText", "inventoryLotIds", "savePayload", "playerIdentifier", "damageOverride", "worldFlagOverride",
] as const;
const PROLOGUE_SEGMENT_FOCUS = [
  { segmentId: "arrival_tools", mapNodeIds: ["valley.arrival_shelf", "valley.stream_section"], activeNewWordIds: [] },
  { segmentId: "settlement_work", mapNodeIds: ["valley.settlement"], activeNewWordIds: [] },
  { segmentId: "waterwheel_discovery", mapNodeIds: ["valley.waterwheel"], activeNewWordIds: [] },
  { segmentId: "hermit_initiation", mapNodeIds: ["valley.stream_section"], activeNewWordIds: ["telo"] },
  { segmentId: "cistern_motion", mapNodeIds: ["valley.high_cistern"], activeNewWordIds: ["tawa"] },
  { segmentId: "cistern_scale", mapNodeIds: ["valley.high_cistern"], activeNewWordIds: ["lili", "suli"] },
  { segmentId: "wetland_crisis", mapNodeIds: ["valley.return_channel"], activeNewWordIds: ["wawa"] },
  { segmentId: "underground_node", mapNodeIds: ["valley.underground_order_node"], activeNewWordIds: [] },
  { segmentId: "allocation_epilogue", mapNodeIds: ["valley.settlement"], activeNewWordIds: [] },
] as const;

export function projectPrologueAcceptance(manifest: ContentManifest): RuntimePrologueAcceptanceManifest {
  const source = manifest.byKind.chapter[0];
  if (!source || manifest.byKind.chapter.length !== 1 ||
      source.path !== "data/chapters/ch01-world-literacy-prologue.v0.1.yaml" ||
      source.contentVersion !== "chapter-01.forest.2") {
    throw new Error("prologue acceptance requires the canonical chapter source");
  }
  const telemetryContract = object(source.content.telemetry_contract, "telemetry_contract");
  const taxonomy = object(telemetryContract.primary_activity_taxonomy, "telemetry primary activity taxonomy");
  const payload = object(telemetryContract.event_payload, "telemetry event payload");
  const cadence = object(telemetryContract.cadence, "telemetry cadence");
  const playtestSession = object(telemetryContract.playtest_session_summary, "playtest session summary");
  exactStrings(source.content.telemetry_events, PROLOGUE_TELEMETRY_EVENT_IDS, "telemetry_events");
  exactStrings(taxonomy.included, PROLOGUE_INCLUDED_ACTIVITY_KINDS, "telemetry included activities");
  exactStrings(taxonomy.excluded, PROLOGUE_EXCLUDED_ACTIVITY_KINDS, "telemetry excluded activities");
  exactStrings(payload.required_fields, PROLOGUE_TELEMETRY_REQUIRED_FIELDS, "telemetry required fields");
  exactStrings(payload.semantic_field_keys, PROLOGUE_TELEMETRY_SEMANTIC_FIELDS, "telemetry semantic fields");
  exactStrings(payload.forbidden_fields, PROLOGUE_TELEMETRY_FORBIDDEN_FIELDS, "telemetry forbidden fields");
  exactStrings(playtestSession.required_fields, PROLOGUE_PLAYTEST_SESSION_FIELDS, "playtest session fields");
  exactStrings(playtestSession.forbidden_fields, PROLOGUE_PLAYTEST_SESSION_FORBIDDEN_FIELDS, "playtest forbidden fields");
  const segments = array(source.content.segments, "chapter segments");
  const segmentFocus = PROLOGUE_SEGMENT_FOCUS.map((expected, index) => {
    const segment = object(segments[index], `chapter segment ${expected.segmentId}`);
    exact(segment.segment_id, expected.segmentId, `chapter segment ${expected.segmentId} identity`);
    return {
      segmentId: expected.segmentId,
      mapNodeIds: exactStrings(segment.map_nodes, expected.mapNodeIds, `${expected.segmentId} map nodes`),
      activeNewWordIds: exactStrings(segment.focus_active_new_words, expected.activeNewWordIds,
        `${expected.segmentId} active word focus`),
    };
  });
  if (segments.length !== PROLOGUE_SEGMENT_FOCUS.length) throw new Error("chapter segment focus is noncanonical");
  const acceptance = object(source.content.acceptance, "acceptance");
  const required = object(acceptance.required, "acceptance.required");
  const playtest = object(acceptance.playtest_targets, "acceptance.playtest_targets");
  const body = {
    sourcePath: source.path,
    contentVersion: source.contentVersion,
    telemetry: {
      schemaVersion: exact(telemetryContract.schema_version, "prologue.telemetry.v0.1", "telemetry schema version"),
      eventIds: [...PROLOGUE_TELEMETRY_EVENT_IDS],
      includedPrimaryActivities: [...PROLOGUE_INCLUDED_ACTIVITY_KINDS],
      excludedActivities: [...PROLOGUE_EXCLUDED_ACTIVITY_KINDS],
      exclusivePrimaryActivity: exact(taxonomy.exclusive_one_of_required, true, "exclusive telemetry taxonomy"),
      payload: {
        requiredFields: [...PROLOGUE_TELEMETRY_REQUIRED_FIELDS],
        semanticFieldKeys: [...PROLOGUE_TELEMETRY_SEMANTIC_FIELDS],
        forbiddenFields: [...PROLOGUE_TELEMETRY_FORBIDDEN_FIELDS],
      },
      cadence: {
        consequentialChoiceEventIds: exactStrings(cadence.consequential_choice_event_ids,
          PROLOGUE_CONSEQUENTIAL_CHOICE_EVENT_IDS, "consequential choice event IDs"),
        consequentialChoiceMaximumGapMinutes: exact(cadence.consequential_choice_maximum_gap_minutes,
          20, "consequential choice maximum gap"),
        activeRetrievalEventIds: exactStrings(cadence.active_retrieval_event_ids,
          PROLOGUE_ACTIVE_RETRIEVAL_EVENT_IDS, "active retrieval event IDs"),
        activeRetrievalIntervalMinutes: exactNumberPair(cadence.active_retrieval_interval_minutes,
          30, 40, "active retrieval interval"),
        activeRetrievalPracticeFamilySemanticField: exact(
          cadence.active_retrieval_practice_family_semantic_field, "practiceFamilyId",
          "active retrieval practice-family field"),
        maximumConsecutiveSamePracticeFamily: exact(cadence.maximum_consecutive_same_practice_family,
          2, "maximum consecutive same practice family"),
      },
      playtestSessionSummary: {
        schemaVersion: exact(playtestSession.schema_version, "prologue.playtest-session.v0.1", "playtest session schema"),
        minimumObservedContentMinutes: exact(playtestSession.minimum_observed_content_minutes,
          180, "playtest observed content minimum"),
        requiredFields: [...PROLOGUE_PLAYTEST_SESSION_FIELDS],
        forbiddenFields: [...PROLOGUE_PLAYTEST_SESSION_FORBIDDEN_FIELDS],
        percentileMethod: exact(playtestSession.percentile_method,
          "nearest_rank_missing_as_failure", "playtest percentile method"),
        shareAggregation: exact(playtestSession.share_aggregation,
          "ratio_of_aggregate_active_time", "playtest share aggregation"),
        rateAggregation: exact(playtestSession.rate_aggregation,
          "ratio_of_aggregate_coin_per_active_minute", "playtest rate aggregation"),
        countAggregation: exact(playtestSession.count_aggregation, "sum", "playtest count aggregation"),
      },
      segmentFocus,
    },
    acceptance: {
      required: {
        mandatoryKills: exact(required.mandatory_kills, 0, "mandatory kills"),
        safeRangeUsesLivingTargets: exact(required.safe_range_uses_living_targets, false, "safe range living targets"),
        requiredTasksHaveNonAttackSolution: exact(required.required_tasks_have_non_attack_solution, true, "required non-attack solutions"),
        firstAttackReadsKillCount: exact(required.first_attack_reads_kill_count, false, "first attack kill count"),
        lengthAvailableIsNotMastered: exact(required.length_available_is_not_mastered, true, "length mastery boundary"),
        peacefulProgressWhenAttackLocked: exact(required.peaceful_progress_when_attack_locked, true, "peaceful locked progress"),
        meaningfulWorldDeltasOnReturnMinimum: exact(required.meaningful_world_deltas_on_return_minimum, 3, "world deltas on return"),
      },
      playtest: {
        forcedHunts: exact(playtest.forced_hunts, 0, "forced hunts"),
        wildlifeProductsRequiredForMainline: exact(playtest.wildlife_products_required_for_mainline, false, "wildlife products mainline"),
        survivalNeedsModifyLanguageOrMp: exact(playtest.survival_needs_modify_language_or_mp, false, "survival language boundary"),
        prologueNeedsFloorMinimum: exact(playtest.prologue_needs_floor_minimum, 20, "prologue needs floor"),
        activityShareUsesExclusivePrimaryTaxonomy: exact(playtest.activity_share_uses_exclusive_primary_taxonomy, true, "exclusive activity share"),
        worldPeoplePhysicsTimeShareMinimum: exact(playtest.world_people_physics_time_share_minimum, 0.65, "world activity share"),
        languageActivityTimeShareRange: exactNumberPair(playtest.language_activity_time_share_range, 0.15, 0.25, "language activity share"),
        longExplanationPanelTimeShareMaximum: exact(playtest.long_explanation_panel_time_share_maximum, 0.10, "long explanation share"),
        focusActiveNewWordsPerSegmentMaximum: exact(playtest.focus_active_new_words_per_segment_maximum, 2, "active words per segment"),
        recoveryPathVisibilityDesignMaxSeconds: exact(playtest.recovery_path_visibility_design_max_seconds, 60, "recovery visibility"),
        actualSoftFailureRecoverySecondsP90Target: exact(playtest.actual_soft_failure_recovery_seconds_p90_target, 120, "soft recovery p90"),
        rangeTrialPermissionContentMinutesP90Maximum: exact(playtest.range_trial_permission_content_minutes_p90_maximum, 180, "range permission p90"),
        formalAttackUnlockBy180ContentMinutesProportionMinimum: exact(playtest.formal_attack_unlock_by_180_content_minutes_proportion_minimum, 0.70, "attack unlock proportion"),
        timeMetricExcludes: exactStrings(playtest.time_metric_excludes, PROLOGUE_EXCLUDED_ACTIVITY_KINDS, "time metric excludes"),
        mandatoryWildlifeHarmEvents: exact(playtest.mandatory_wildlife_harm_events, 0, "mandatory wildlife harm"),
        survivalUiActiveTimeShareMaximum: exact(playtest.survival_ui_active_time_share_maximum, 0.03, "survival UI share"),
        needsInterruptedLanguageInteractionShareMaximum: exact(playtest.needs_interrupted_language_interaction_share_maximum, 0.02, "needs interruption share"),
        freeFoodWaterDiscoverySecondsP95Maximum: exact(playtest.free_food_water_discovery_seconds_p95_maximum, 60, "food water discovery p95"),
        huntingIncomeVsNonviolentJobMaximum: exact(playtest.hunting_income_vs_nonviolent_job_maximum, 0.60, "hunting income ratio"),
        duplicateCorpseLotCurrencyCount: exact(playtest.duplicate_corpse_lot_currency_count, 0, "duplicate corpse currency"),
      },
    },
  } as const;
  return { sourceDigest: `sha256:${createHash("sha256").update(stable(body)).digest("hex")}`, ...body } as RuntimePrologueAcceptanceManifest;
}

function object(value: ContentValue | undefined, label: string): ContentObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value; }
function array(value: ContentValue | undefined, label: string): readonly ContentValue[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function exact<T extends string | number | boolean>(value: ContentValue | undefined, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`); return expected; }
function exactStrings<T extends readonly string[]>(value: ContentValue | undefined, expected: T, label: string): T { if (!Array.isArray(value) || value.length !== expected.length || value.some((entry, index) => entry !== expected[index])) throw new Error(`${label} is noncanonical`); return [...expected] as unknown as T; }
function exactNumberPair(value: ContentValue | undefined, first: number, second: number, label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || value[0] !== first || value[1] !== second) throw new Error(`${label} is noncanonical`); return [first, second]; }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; const entry = value as Record<string, unknown>; return `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${stable(entry[key])}`).join(",")}}`; }
