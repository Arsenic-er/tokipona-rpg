import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";

const MAIN_SCENE_IDS = [
  "scene.valley.arrival_shelf", "scene.valley.stream_section", "scene.valley.settlement",
  "scene.valley.waterwheel", "scene.valley.high_cistern", "scene.valley.return_channel",
  "scene.valley.underground_order_node",
] as const;
const OPTIONAL_SCENE_IDS = ["scene.valley.den_bypass", "scene.valley.safe_range"] as const;
const ACTIVE_WORD_IDS = ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"] as const;
const SEGMENTS = [
  ["arrival_tools", [0, 30], ["scene.valley.arrival_shelf", "scene.valley.stream_section"], []],
  ["settlement_work", [30, 55], ["scene.valley.settlement"], []],
  ["waterwheel_discovery", [55, 75], ["scene.valley.waterwheel"], []],
  ["hermit_initiation", [75, 95], ["scene.valley.stream_section"], ["word.telo"]],
  ["cistern_motion", [95, 105], ["scene.valley.high_cistern"], ["word.tawa"]],
  ["cistern_scale", [105, 120], ["scene.valley.high_cistern"], ["word.lili", "word.suli"]],
  ["wetland_crisis", [120, 148], ["scene.valley.return_channel"], ["word.wawa"]],
  ["underground_node", [148, 173], ["scene.valley.underground_order_node"], []],
  ["allocation_epilogue", [173, 180], ["scene.valley.settlement"], []],
] as const;
const MEDIUM_EVENTS = ["waterwheel_goal_committed", "forest_medium_discovered", "forest_hermit_route_committed", "forest_telo_initiation_committed"] as const;
const HERMIT_ROUTES = ["medium.tell_facility_worker", "medium.follow_fragment_markers", "medium.ask_external_trader"] as const;
const HERMIT_PRACTICE_ACTIONS = ["observe_natural_water", "predict_manifest_path", "perform_low_mp_telo", "stabilize_with_tool"] as const;
const CREATURE_RESOLUTIONS = ["restore_migration_channel", "guide_with_food_and_scent", "wait_and_yield", "install_nonlethal_barrier", "drive_away_by_combat", "kill"] as const;
const ALLOCATION_EVENTS = ["forest_large_creature_resolution_committed", "forest_site_synchronized", "forest_water_allocation_committed", "forest_site_lead_revealed", "forest_chapter_epilogue_committed"] as const;
const ALLOCATION_MODES = ["settlement_priority", "wetland_priority", "road_trade_priority"] as const;
const BENEFITS = {
  settlement_priority: ["resident_water_stable", "crops_stable"],
  wetland_priority: ["wetland_recovery_started", "creature_habitat_stable"],
  road_trade_priority: ["medicine_salt_metal_route_open", "external_news_route_open"],
} as const;
const COSTS = {
  settlement_priority: ["wetland_decline_continues", "creature_migration_pressure"],
  wetland_priority: ["settlement_rationing", "local_food_price_pressure"],
  road_trade_priority: ["settlement_minimum_supply", "wetland_minimum_supply"],
} as const;

export interface RuntimeForestChapterManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly chapterFlowId: "ch01_world_literacy_prologue";
  readonly contentVersion: "chapter-01.forest.2";
  readonly workingTitleZh: "水往何处";
  readonly targetMedianMinutes: 180;
  readonly firstPlayRangeMinutes: readonly [150, 240];
  readonly mainSceneIds: readonly string[];
  readonly optionalSceneIds: readonly string[];
  readonly postChapterBoundarySceneId: "scene.valley.old_mine_threshold";
  readonly postChapterBoundaryRequiresEpilogue: true;
  readonly activeWordIds: readonly ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"];
  readonly segments: readonly Readonly<{ segmentId: string; minuteRange: readonly [number, number]; sceneIds: readonly string[]; activeNewWordIds: readonly string[]; }>[];
  readonly medium: Readonly<{
    mediumId: "artifact.ancient_medium_frame"; shardId: "artifact.fragment.forest_site";
    discoveryEventId: "forest_medium_discovered"; initiationEventId: "forest_telo_initiation_committed";
    requiredEventIds: readonly string[]; hermitRouteIds: readonly string[];
    practiceSceneId: "scene.valley.stream_section"; practiceActionIds: readonly string[];
    automaticWordMasteryForbidden: true; automaticMpIncreaseForbidden: true;
  }>;
  readonly largeCreature: Readonly<{
    entityId: "wildlife.valley.large_semiaquatic_nester"; resolutionEventId: "forest_large_creature_resolution_committed";
    resolutionIds: readonly string[]; persistent: true; mandatoryKill: false; languageEvidenceFromHarm: false;
  }>;
  readonly allocation: Readonly<{
    commitEventId: "forest_water_allocation_committed"; requiredEventIds: readonly string[]; shardId: "artifact.fragment.forest_site";
    shardSynchronizationNoGrantFlags: Readonly<{ automaticWordMeaningGrantForbidden: true; automaticWordMasteryForbidden: true; automaticMpIncreaseForbidden: true; automaticCastingGrantForbidden: true; automaticUsableSpellGrantForbidden: true; }>;
    modeIds: readonly ["settlement_priority", "wetland_priority", "road_trade_priority"];
    benefitIdsByMode: Readonly<Record<string, readonly string[]>>; costIdsByMode: Readonly<Record<string, readonly string[]>>;
    perfectInitialBalanceForbidden: true; laterUpgradeMode: "balanced_upgrade";
  }>;
}

const verified = new WeakSet<object>();

export function isVerifiedRuntimeForestChapterManifest(value: unknown): value is RuntimeForestChapterManifest {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeForestChapterManifest(candidate: unknown): RuntimeForestChapterManifest {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.forestChapter, "artifact.forestChapter");
  exactKeys(raw, ["sourceDigest", "chapterFlowId", "contentVersion", "workingTitleZh", "targetMedianMinutes", "firstPlayRangeMinutes", "mainSceneIds", "optionalSceneIds", "postChapterBoundarySceneId", "postChapterBoundaryRequiresEpilogue", "activeWordIds", "segments", "medium", "largeCreature", "allocation"], "forest chapter");
  const sourceDigest = string(raw.sourceDigest, "forest chapter sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceDigest)) throw new Error("forest chapter sourceDigest must be sha256");
  if (raw.chapterFlowId !== "ch01_world_literacy_prologue" || raw.contentVersion !== "chapter-01.forest.2" || raw.workingTitleZh !== "水往何处" || raw.targetMedianMinutes !== 180 || !same(raw.firstPlayRangeMinutes, [150, 240])) throw new Error("forest chapter identity is invalid");
  if (!same(raw.mainSceneIds, MAIN_SCENE_IDS)) throw new Error("forest chapter main scene order is invalid");
  if (!same(raw.optionalSceneIds, OPTIONAL_SCENE_IDS)) throw new Error("forest chapter optional scenes are invalid");
  if (raw.postChapterBoundarySceneId !== "scene.valley.old_mine_threshold" || raw.postChapterBoundaryRequiresEpilogue !== true) throw new Error("forest chapter old-mine epilogue guard is invalid");
  if (!same(raw.activeWordIds, ACTIVE_WORD_IDS)) throw new Error("forest chapter active words are invalid");
  validateSegments(raw.segments);
  validateMedium(raw.medium);
  validateLargeCreature(raw.largeCreature);
  validateAllocation(raw.allocation);
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeManifestDigest(payload) !== sourceDigest) throw new Error("forest chapter projection digest mismatch");
  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimeForestChapterManifest;
  verified.add(result);
  return result;
}

function validateSegments(value: unknown): void {
  if (!Array.isArray(value) || value.length !== SEGMENTS.length) throw new Error("forest chapter segments are invalid");
  value.forEach((entry, index) => {
    const expected = SEGMENTS[index]!;
    const segment = record(entry, `forest chapter segment ${index}`);
    exactKeys(segment, ["segmentId", "minuteRange", "sceneIds", "activeNewWordIds"], "forest chapter segment");
    if (segment.segmentId !== expected[0] || !same(segment.minuteRange, expected[1]) || !same(segment.sceneIds, expected[2]) || !same(segment.activeNewWordIds, expected[3])) throw new Error("forest chapter segment contract is invalid");
  });
}
function validateMedium(value: unknown): void {
  const medium = record(value, "forest chapter medium");
  exactKeys(medium, ["mediumId", "shardId", "discoveryEventId", "initiationEventId", "requiredEventIds", "hermitRouteIds", "practiceSceneId", "practiceActionIds", "automaticWordMasteryForbidden", "automaticMpIncreaseForbidden"], "forest chapter medium");
  if (medium.mediumId !== "artifact.ancient_medium_frame" || medium.shardId !== "artifact.fragment.forest_site" || medium.discoveryEventId !== "forest_medium_discovered" || medium.initiationEventId !== "forest_telo_initiation_committed" || !same(medium.requiredEventIds, MEDIUM_EVENTS) || !same(medium.hermitRouteIds, HERMIT_ROUTES) || medium.practiceSceneId !== "scene.valley.stream_section" || !same(medium.practiceActionIds, HERMIT_PRACTICE_ACTIONS) || medium.automaticWordMasteryForbidden !== true || medium.automaticMpIncreaseForbidden !== true) throw new Error("forest chapter medium contract is invalid");
}
function validateLargeCreature(value: unknown): void {
  const creature = record(value, "forest chapter large creature");
  exactKeys(creature, ["entityId", "resolutionEventId", "resolutionIds", "persistent", "mandatoryKill", "languageEvidenceFromHarm"], "forest chapter large creature");
  if (creature.entityId !== "wildlife.valley.large_semiaquatic_nester" || creature.resolutionEventId !== "forest_large_creature_resolution_committed" || !same(creature.resolutionIds, CREATURE_RESOLUTIONS) || creature.persistent !== true || creature.mandatoryKill !== false || creature.languageEvidenceFromHarm !== false) throw new Error("forest chapter large creature contract is invalid");
}
function validateAllocation(value: unknown): void {
  const allocation = record(value, "forest chapter allocation");
  exactKeys(allocation, ["commitEventId", "requiredEventIds", "shardId", "shardSynchronizationNoGrantFlags", "modeIds", "benefitIdsByMode", "costIdsByMode", "perfectInitialBalanceForbidden", "laterUpgradeMode"], "forest chapter allocation");
  if (allocation.commitEventId !== "forest_water_allocation_committed" || !same(allocation.requiredEventIds, ALLOCATION_EVENTS) || allocation.shardId !== "artifact.fragment.forest_site" || !same(allocation.modeIds, ALLOCATION_MODES) || allocation.perfectInitialBalanceForbidden !== true || allocation.laterUpgradeMode !== "balanced_upgrade") throw new Error("forest chapter allocation contract is invalid");
  const flags = record(allocation.shardSynchronizationNoGrantFlags, "forest chapter shard synchronization flags");
  exactKeys(flags, ["automaticWordMeaningGrantForbidden", "automaticWordMasteryForbidden", "automaticMpIncreaseForbidden", "automaticCastingGrantForbidden", "automaticUsableSpellGrantForbidden"], "forest chapter shard synchronization flags");
  if (Object.values(flags).some((flag) => flag !== true)) throw new Error("forest chapter shard synchronization grants are invalid");
  validateStringRecord(allocation.benefitIdsByMode, BENEFITS, "forest chapter allocation benefits");
  validateStringRecord(allocation.costIdsByMode, COSTS, "forest chapter allocation costs");
}
function validateStringRecord(value: unknown, expected: Record<string, readonly string[]>, label: string): void { const recordValue = record(value, label); exactKeys(recordValue, Object.keys(expected), label); for (const [key, items] of Object.entries(expected)) if (!same(recordValue[key], items)) throw new Error(`${label} are invalid`); }
function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object`); return value as Record<string, unknown>; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function same(value: unknown, expected: readonly unknown[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { const keys = Object.keys(value); if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
