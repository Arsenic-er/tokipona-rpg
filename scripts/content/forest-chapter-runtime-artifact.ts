import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";
import { computeRuntimeManifestDigest } from "../../src/content/runtime-manifest-digest.ts";
import type { RuntimeForestChapterManifest } from "../../src/content/runtime-forest-chapter-manifest.ts";

const MAIN_SCENES = [
  "scene.valley.arrival_shelf", "scene.valley.stream_section", "scene.valley.settlement",
  "scene.valley.waterwheel", "scene.valley.high_cistern", "scene.valley.return_channel",
  "scene.valley.underground_order_node",
] as const;
const OPTIONAL_SCENES = ["scene.valley.den_bypass", "scene.valley.safe_range"] as const;
const ACTIVE_WORD_IDS = ["word.telo", "word.tawa", "word.lili", "word.suli", "word.wawa"] as const;
const MEDIUM_EVENTS = ["waterwheel_goal_committed", "forest_medium_discovered", "forest_hermit_route_committed", "forest_telo_initiation_committed"] as const;
const HERMIT_ROUTES = ["medium.tell_facility_worker", "medium.follow_fragment_markers", "medium.ask_external_trader"] as const;
const HERMIT_PRACTICE_ACTIONS = ["observe_natural_water", "predict_manifest_path", "perform_low_mp_telo", "stabilize_with_tool"] as const;
const CREATURE_RESOLUTIONS = ["restore_migration_channel", "guide_with_food_and_scent", "wait_and_yield", "install_nonlethal_barrier", "drive_away_by_combat", "kill"] as const;
const ALLOCATION_EVENTS = ["forest_large_creature_resolution_committed", "forest_site_synchronized", "forest_water_allocation_committed", "forest_site_lead_revealed", "forest_chapter_epilogue_committed"] as const;
const ALLOCATION_MODES = ["settlement_priority", "wetland_priority", "road_trade_priority"] as const;

export function projectForestChapterRuntimeManifest(manifest: ContentManifest): RuntimeForestChapterManifest {
  const chapterSource = one(manifest.byKind.chapter, "chapter source");
  if (chapterSource.path !== "data/chapters/ch01-world-literacy-prologue.v0.1.yaml" || chapterSource.contentVersion !== "chapter-01.forest.2") {
    throw new Error("forest chapter runtime requires the canonical chapter source");
  }
  const chapter = chapterSource.content;
  const chapterContract = object(chapter.forest_chapter_contract, "forest chapter contract");
  const mediumTask = task(manifest, "ch01_medium_hermit_initiation");
  const creatureTask = task(manifest, "ch01_large_creature_crisis");
  const allocationTask = task(manifest, "ch01_underground_water_allocation");
  const oldMine = scene(manifest, "scene.valley.old_mine_threshold");
  const allocationModes = objectArray(allocationTask.allocation_modes, "allocation modes");

  const body = {
    chapterFlowId: exact(chapter.chapter_flow_id, "ch01_world_literacy_prologue", "chapter flow ID"),
    contentVersion: exact(chapterSource.contentVersion, "chapter-01.forest.2", "chapter content version"),
    workingTitleZh: exact(chapterContract.working_title_zh, "水往何处", "chapter working title"),
    targetMedianMinutes: exact(chapterContract.target_median_minutes, 180, "chapter target minutes"),
    firstPlayRangeMinutes: tuple(chapterContract.first_play_range_minutes, 150, 240, "chapter first-play range"),
    mainSceneIds: exactStrings(chapterContract.main_scene_ids, MAIN_SCENES, "main scene IDs"),
    optionalSceneIds: exactStrings(chapterContract.optional_scene_ids, OPTIONAL_SCENES, "optional scene IDs"),
    postChapterBoundarySceneId: exact(chapterContract.post_chapter_boundary_scene_id, "scene.valley.old_mine_threshold", "post-chapter boundary scene"),
    postChapterBoundaryRequiresEpilogue: oldMineEpilogueGuard(oldMine),
    activeWordIds: [...ACTIVE_WORD_IDS],
    segments: projectSegments(chapter.segments),
    medium: {
      mediumId: exact(object(mediumTask.medium, "medium").medium_id, "artifact.ancient_medium_frame", "medium ID"),
      shardId: exact(object(mediumTask.medium, "medium").shard_id, "artifact.fragment.forest_site", "shard ID"),
      discoveryEventId: exact(object(mediumTask.medium, "medium").discovery_event, "forest_medium_discovered", "medium discovery event"),
      initiationEventId: exact(object(mediumTask.hermit_practice, "hermit practice").completion_event, "forest_telo_initiation_committed", "medium initiation event"),
      requiredEventIds: exactStrings(mediumTask.required_event_sequence, MEDIUM_EVENTS, "medium event sequence"),
      hermitRouteIds: exactStrings(objectArray(mediumTask.hermit_routes, "hermit routes").map((route) => string(route.route_id, "hermit route ID")), HERMIT_ROUTES, "hermit routes"),
      practiceSceneId: exact(object(mediumTask.hermit_practice, "hermit practice").authority_scene_id, "scene.valley.stream_section", "hermit practice scene"),
      practiceActionIds: exactStrings(object(mediumTask.hermit_practice, "hermit practice").required_actions, HERMIT_PRACTICE_ACTIONS, "hermit practice actions"),
      automaticWordMasteryForbidden: exact(mediumTask.automatic_word_mastery_forbidden, true, "medium automatic mastery"),
      automaticMpIncreaseForbidden: exact(mediumTask.automatic_mp_increase_forbidden, true, "medium automatic MP"),
    },
    largeCreature: {
      entityId: exact(creatureTask.wildlife_entity_id, "wildlife.valley.large_semiaquatic_nester", "large creature ID"),
      resolutionEventId: exact(creatureTask.resolution_event, "forest_large_creature_resolution_committed", "large creature resolution event"),
      resolutionIds: exactStrings(creatureTask.resolution_ids, CREATURE_RESOLUTIONS, "large creature resolutions"),
      persistent: largeCreaturePersistent(manifest),
      mandatoryKill: exact(creatureTask.mandatory_kill, false, "large creature mandatory kill"),
      languageEvidenceFromHarm: exact(creatureTask.language_evidence_from_harm, false, "large creature harm language evidence"),
    },
    allocation: {
      commitEventId: exact(object(allocationTask.completion_events, "allocation completion events").allocation_commit, "forest_water_allocation_committed", "allocation commit event"),
      requiredEventIds: exactStrings(allocationTask.required_event_sequence, ALLOCATION_EVENTS, "allocation event sequence"),
      shardId: exact(allocationTask.required_artifact_id, "artifact.fragment.forest_site", "allocation shard"),
      shardSynchronizationNoGrantFlags: {
        automaticWordMeaningGrantForbidden: exact(allocationTask.automatic_word_meaning_grant_forbidden, true, "shard automatic word meaning"),
        automaticWordMasteryForbidden: exact(allocationTask.automatic_word_mastery_forbidden, true, "shard automatic mastery"),
        automaticMpIncreaseForbidden: exact(allocationTask.automatic_mp_increase_forbidden, true, "shard automatic MP"),
        automaticCastingGrantForbidden: exact(allocationTask.automatic_casting_grant_forbidden, true, "shard automatic casting"),
        automaticUsableSpellGrantForbidden: exact(allocationTask.automatic_usable_spell_grant_forbidden, true, "shard automatic usable spell"),
      },
      modeIds: exactStrings(allocationModes.map((mode) => string(mode.mode_id, "allocation mode ID")), ALLOCATION_MODES, "allocation modes"),
      benefitIdsByMode: Object.fromEntries(allocationModes.map((mode) => [string(mode.mode_id, "allocation mode ID"), strings(mode.benefit_ids, "allocation benefits")])),
      costIdsByMode: Object.fromEntries(allocationModes.map((mode) => [string(mode.mode_id, "allocation mode ID"), strings(mode.cost_ids, "allocation costs")])),
      perfectInitialBalanceForbidden: exact(allocationTask.perfect_initial_balance_forbidden, true, "perfect allocation"),
      laterUpgradeMode: exact(allocationTask.later_upgrade_mode, "balanced_upgrade", "allocation later upgrade"),
    },
  } as const;
  return { sourceDigest: computeRuntimeManifestDigest(body), ...body } as RuntimeForestChapterManifest;
}

function projectSegments(value: ContentValue | undefined) {
  const segments = objectArray(value, "chapter segments");
  if (segments.length !== 9) throw new Error("forest chapter must contain exactly nine segments");
  const result = segments.map((segment) => ({
    segmentId: string(segment.segment_id, "segment ID"),
    minuteRange: numberTuple(segment.content_budget_minutes, "segment timing"),
    sceneIds: strings(segment.map_nodes, "segment scene IDs").map((node) => `scene.${node}`),
    activeNewWordIds: strings(segment.focus_active_new_words, "segment active word IDs").map((word) => `word.${word}`),
  }));
  let priorEnd = 0;
  for (const segment of result) {
    if (segment.minuteRange[0] !== priorEnd || segment.minuteRange[1] <= segment.minuteRange[0]) throw new Error("forest chapter segment timing must be contiguous");
    priorEnd = segment.minuteRange[1];
  }
  if (priorEnd !== 180) throw new Error("forest chapter must end at 180 minutes");
  const active = result.flatMap((segment) => segment.activeNewWordIds);
  if (active.join("|") !== ACTIVE_WORD_IDS.join("|")) throw new Error("forest chapter active words are noncanonical");
  return result;
}

function oldMineEpilogueGuard(value: ContentObject): true {
  const exits = objectArray(value.exits, "old-mine exits");
  const exit = exits.find((candidate) => candidate.exit_id === "old_mine.to_settlement");
  if (!exit || object(exit.traversal_guard, "old-mine guard").predicate !== "forest_chapter_epilogue_committed == true") throw new Error("old-mine epilogue guard is invalid");
  return true;
}
function largeCreaturePersistent(manifest: ContentManifest): true {
  const ecology = manifest.indexes.ecologies.valley_prologue;
  const entity = ecology && objectArray(ecology.entities, "ecology entities").find((candidate) => candidate.entity_id === "wildlife.valley.large_semiaquatic_nester");
  if (!entity || string(entity.life_state_ref, "large creature persistence") !== "valley_ecology_save.life_instances") throw new Error("large creature persistence is invalid");
  return true;
}
function one<T>(items: readonly T[], label: string): T { if (items.length !== 1 || !items[0]) throw new Error(`expected exactly one ${label}`); return items[0]; }
function task(manifest: ContentManifest, id: string): ContentObject { const value = manifest.indexes.tasks[id]; if (!value) throw new Error(`missing task ${id}`); return value; }
function scene(manifest: ContentManifest, id: string): ContentObject { const value = manifest.indexes.scenes[id]; if (!value) throw new Error(`missing scene ${id}`); return value; }
function object(value: ContentValue | undefined, label: string): ContentObject { if (!isContentObject(value)) throw new Error(`${label} must be an object`); return value; }
function objectArray(value: ContentValue | undefined, label: string): ContentObject[] { if (!Array.isArray(value) || !value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry))) throw new Error(`${label} must be an object array`); return value as ContentObject[]; }
function isContentObject(value: ContentValue | undefined): value is ContentObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function string(value: ContentValue | undefined, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function strings(value: ContentValue | undefined, label: string): string[] { if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) throw new Error(`${label} must be a string array`); return [...value] as string[]; }
function exact<T extends string | number | boolean>(value: ContentValue | undefined, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`); return expected; }
function exactStrings<T extends readonly string[]>(value: ContentValue | undefined | readonly string[], expected: T, label: string): T { const actual = Array.isArray(value) ? value : []; if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) throw new Error(`${label} is noncanonical`); return [...expected] as unknown as T; }
function tuple(value: ContentValue | undefined, left: number, right: number, label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || value[0] !== left || value[1] !== right) throw new Error(`${label} is noncanonical`); return [left, right]; }
function numberTuple(value: ContentValue | undefined, label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || value.some((entry) => typeof entry !== "number" || !Number.isInteger(entry))) throw new Error(`${label} must be an integer pair`); return [value[0] as number, value[1] as number]; }
