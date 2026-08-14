import { createHash } from "node:crypto";
import { posix } from "node:path";
import { P0_WORD_IDS, type P0WordId } from "../../src/learning/progression.ts";
import type { RuntimeP0CurriculumManifest, RuntimeP0TargetState, RuntimeP0WordManifest } from "../../src/content/runtime-p0-curriculum-manifest.ts";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";

const TARGETS = {
  produced: ["telo", "tawa", "lili", "suli"],
  grounded: ["seli", "kiwen", "awen"],
  attuned: ["kon", "kasi", "lukin", "weka", "soweli"],
} as const;

export function projectP0Curriculum(manifest: ContentManifest): RuntimeP0CurriculumManifest {
  const sources = manifest.byKind.p0_curriculum;
  if (sources.length !== 1) throw new Error(`Expected exactly one P0 curriculum source, received ${sources.length}.`);
  const source = sources[0]!;
  if (source.path !== "data/language/p0-curriculum.v0.1.yaml" || source.contentVersion !== "prologue-12.vertical-slice.1") throw new Error("P0 curriculum source identity is noncanonical");
  const progressionSourcePath = resolve(source.path, string(source.content.progression_ref, "progression_ref"));
  const glyphCatalogSourcePath = resolve(source.path, string(source.content.glyph_catalog_ref, "glyph_catalog_ref"));
  if (progressionSourcePath !== "data/language/learning-progression.v0.2.yaml" || manifest.sources[progressionSourcePath]?.kind !== "learning_progression") throw new Error("P0 progression_ref is invalid");
  if (glyphCatalogSourcePath !== "data/language/pu-120-glyph-catalog.v0.2.json" || manifest.sources[glyphCatalogSourcePath]?.kind !== "glyph_catalog") throw new Error("P0 glyph_catalog_ref is invalid");
  const scope = object(source.content.scope, "scope");
  const target = object(source.content.target_state_ceiling_first_three_hours, "target_state_ceiling_first_three_hours");
  for (const key of Object.keys(TARGETS) as RuntimeP0TargetState[]) if (!same(strings(target[key], `target.${key}`), TARGETS[key])) throw new Error(`P0 ${key} target list is noncanonical`);
  const targetByWord = new Map<P0WordId, RuntimeP0TargetState>([
    ...TARGETS.produced.map((word) => [word, "produced"] as const),
    ...TARGETS.grounded.map((word) => [word, "grounded"] as const),
    ...TARGETS.attuned.map((word) => [word, "attuned"] as const),
  ]);
  const authoredWords = objects(source.content.words, "words");
  const wordIds = authoredWords.map((word) => string(word.word_id, "word_id"));
  if (!sameSet(wordIds, P0_WORD_IDS)) throw new Error("P0 curriculum must author the exact 12 word IDs");
  const words = Object.fromEntries(authoredWords.map((word) => {
    const wordId = string(word.word_id, "word_id") as P0WordId;
    const meditation = object(word.meditation, `${wordId}.meditation`);
    const targetState = string(word.target_state, `${wordId}.target_state`) as RuntimeP0TargetState;
    if (targetState !== targetByWord.get(wordId)) throw new Error(`${wordId}.target_state is noncanonical`);
    const semanticFacets = pair(word.semantic_facets, `${wordId}.semantic_facets`);
    const contextContrast = pair(meditation.context_contrast, `${wordId}.meditation.context_contrast`);
    const productionTaskFamilies = word.production_task_families === undefined ? [] : strings(word.production_task_families, `${wordId}.production_task_families`);
    if ((targetState === "produced" && productionTaskFamilies.length !== 2) || (targetState !== "produced" && productionTaskFamilies.length !== 0)) throw new Error(`${wordId}.production_task_families is invalid`);
    const projected: RuntimeP0WordManifest = {
      wordId, firstLocation: string(word.first_location, `${wordId}.first_location`), witness: string(word.witness, `${wordId}.witness`), groundingTask: string(word.grounding_task, `${wordId}.grounding_task`), targetState,
      semanticFacets, misconceptionToRepair: string(word.misconception_to_repair, `${wordId}.misconception_to_repair`), productionTaskFamilies,
      meditation: { recognitionDistractors: strings(meditation.recognition_distractors, `${wordId}.recognition_distractors`), contextContrast },
    };
    return [wordId, projected];
  })) as Record<P0WordId, RuntimeP0WordManifest>;
  const medium = object(source.content.activation_medium, "activation_medium");
  const station = object(source.content.runtime_recovery_station, "runtime_recovery_station");
  const stationSourcePath = resolve(source.path, string(station.scene_ref, "runtime_recovery_station.scene_ref"));
  const stationSource = manifest.sources[stationSourcePath];
  if (!stationSource || stationSource.kind !== "scene" || stationSource.content.scene_id !== "scene.valley.settlement") throw new Error("P0 recovery station scene_ref is invalid");
  const stationTarget = objects(stationSource.content.targets, "settlement.targets").find((entry) => entry.target_id === station.target_id);
  const stationInteraction = objects(stationSource.content.interactions, "settlement.interactions").find((entry) => entry.interaction_id === station.interaction_id);
  if (!stationTarget || stationTarget.target_kind !== "learning_recovery_station" || !stationInteraction || stationInteraction.target_id !== station.target_id || stationInteraction.verb !== "open_p0_learning_recovery" || stationInteraction.tool_or_magic_required !== false) throw new Error("P0 recovery station target/interaction binding is invalid");
  numericPair(stationTarget.interaction_point_tiles, "settlement P0 target point", [38, 28]);
  const acceptance = object(source.content.content_acceptance, "content_acceptance");
  const body = {
    sourcePath: source.path,
    contentVersion: source.contentVersion,
    progressionSourcePath,
    glyphCatalogSourcePath,
    scope: { band: exact(scope.band, "P0", "scope.band"), uniqueWordCount: exact(scope.unique_word_count, 12, "scope.unique_word_count"), wordIds: [...P0_WORD_IDS], firstThreeHoursIsContentBudgetNotRealTimeGate: exact(scope.first_three_hours_is_content_budget_not_real_time_gate, true, "scope.first_three_hours") },
    targetStateCeiling: TARGETS,
    activationMedium: { itemId: exact(medium.item_id, "learning.common_inscription_medium", "activation_medium.item_id"), scarcity: exact(medium.scarcity, "common", "activation_medium.scarcity"), tradeable: exact(medium.tradeable, false, "activation_medium.tradeable"), randomDropRequired: exact(medium.random_drop_required, false, "activation_medium.random_drop_required"), consumedOnFailedOrInterruptedActivation: exact(medium.consumed_on_failed_or_interrupted_activation, false, "activation_medium.consumed") },
    recoveryStation: { sceneId: exact(station.scene_id, "scene.valley.settlement", "recovery_station.scene_id"), targetId: exact(station.target_id, "settlement.p0_inscription_archive", "recovery_station.target_id"), interactionId: exact(station.interaction_id, "settlement.open_p0_inscription_archive", "recovery_station.interaction_id"), interactionPointTiles: numericPair(station.interaction_point_tiles, "recovery_station.interaction_point_tiles", [38, 28]), maximumDistancePx: exact(station.maximum_distance_px, 16, "recovery_station.maximum_distance_px"), recoveryRouteOnlyWhenBelowTarget: exact(station.recovery_route_only_when_below_target, true, "recovery_station.only_below_target") },
    words,
    acceptance: { allWordsRecoverable: exact(acceptance.all_words_recoverable, true, "acceptance.all_words_recoverable"), pronunciationAudio: exact(acceptance.all_words_have_pronunciation_audio, "required", "acceptance.audio"), contextsPerWordMinimum: exact(acceptance.contexts_per_word_minimum, 2, "acceptance.contexts"), misconceptionCounterexamplePerWordMinimum: exact(acceptance.misconception_counterexample_per_word_minimum, 1, "acceptance.misconception"), colorOnlyIdentificationForbidden: exact(acceptance.color_only_identification_forbidden, true, "acceptance.color"), fixedSlotOnlyProductionForbidden: exact(acceptance.fixed_slot_only_production_forbidden, true, "acceptance.slot"), rawStringEqualityAsSuccessForbidden: exact(acceptance.raw_string_equality_as_success_forbidden, true, "acceptance.raw"), communitySemanticReviewRequired: exact(acceptance.community_semantic_review_required, true, "acceptance.community") },
  } as const;
  return { sourceDigest: `sha256:${createHash("sha256").update(stable(body)).digest("hex")}`, ...body } as RuntimeP0CurriculumManifest;
}

function resolve(from: string, ref: string): string { return posix.normalize(posix.join(posix.dirname(from), ref)); }
function object(value: ContentValue | undefined, label: string): ContentObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value; }
function objects(value: ContentValue | undefined, label: string): ContentObject[] { if (!Array.isArray(value) || !value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry))) throw new Error(`${label} must be an object array`); return value as ContentObject[]; }
function string(value: ContentValue | undefined, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function strings(value: ContentValue | undefined, label: string): string[] { if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string" && entry.length > 0) || new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`); return [...value] as string[]; }
function pair(value: ContentValue | undefined, label: string): [string, string] { const result = strings(value, label); if (result.length !== 2) throw new Error(`${label} must contain exactly two values`); return [result[0]!, result[1]!]; }
function exact<T extends string | number | boolean>(value: ContentValue | undefined, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`); return expected; }
function numericPair(value: ContentValue | undefined, label: string, expected: readonly [number, number]): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || value[0] !== expected[0] || value[1] !== expected[1]) throw new Error(`${label} is noncanonical`); return expected; }
function same(value: readonly string[], expected: readonly string[]): boolean { return value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function sameSet(value: readonly string[], expected: readonly string[]): boolean { return value.length === expected.length && new Set(value).size === value.length && expected.every((entry) => value.includes(entry)); }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; const entry = value as Record<string, unknown>; return `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${stable(entry[key])}`).join(",")}}`; }
