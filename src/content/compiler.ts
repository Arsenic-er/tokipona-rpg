import type {
  CompiledSource,
  ContentIssue,
  ContentKind,
  ContentManifest,
  ContentObject,
  ContentSource,
  ContentValue,
  SerializableManifestIndex,
} from "./types";

const MANIFEST_SCHEMA_VERSION = "tokipona.content-manifest.v0.1" as const;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SOURCE_FILE_PATTERN = /\.(?:ya?ml|json)(?:#.*)?$/i;

const REQUIRED_KINDS: readonly ContentKind[] = [
  "single_word_spells",
  "length_profiles",
  "attack_signatures",
  "chapter",
  "region",
  "ecology",
  "wildlife_economy",
  "settlement_trade",
  "persistence",
  "learning_progression",
  "p0_curriculum",
  "task",
];

const ALL_KINDS: readonly ContentKind[] = [
  "attack_signatures",
  "chapter",
  "ecology",
  "glyph_catalog",
  "glyph_progression",
  "learning_progression",
  "length_profiles",
  "p0_curriculum",
  "persistence",
  "region",
  "scene",
  "settlement_trade",
  "single_word_spells",
  "survival",
  "task",
  "visual_surface_profiles",
  "wildlife_economy",
];

export class ContentValidationError extends Error {
  readonly issues: readonly ContentIssue[];

  constructor(issues: readonly ContentIssue[]) {
    super(formatContentIssues(issues));
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

export function formatContentIssues(issues: readonly ContentIssue[]): string {
  const heading = `Content validation failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`;
  return [
    heading,
    ...issues.map(
      (issue) =>
        `- [${issue.code}] ${issue.sourcePath}${issue.fieldPath ? `:${issue.fieldPath}` : ""} ${issue.message}`,
    ),
  ].join("\n");
}

export function compileContent(sources: readonly ContentSource[]): ContentManifest {
  const issues: ContentIssue[] = [];
  const normalized = normalizeSources(sources, issues);
  const byPath = new Map(normalized.map((source) => [source.path, source]));

  for (const source of normalized) {
    validateSource(source, byPath, issues);
  }

  validateRequiredKinds(normalized, issues);

  const indexes = buildIndexes(normalized, issues);
  validateCrossDomainReferences(normalized, indexes, issues);

  if (issues.length > 0) {
    throw new ContentValidationError(issues);
  }

  const sourceRecord: Record<string, CompiledSource> = {};
  const byKind = Object.fromEntries(ALL_KINDS.map((kind) => [kind, []])) as unknown as Record<
    ContentKind,
    CompiledSource[]
  >;
  for (const source of normalized) {
    sourceRecord[source.path] = source;
    byKind[source.kind].push(source);
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    sources: Object.freeze(sourceRecord),
    byKind: Object.freeze(
      Object.fromEntries(
        ALL_KINDS.map((kind) => [kind, Object.freeze([...byKind[kind]])]),
      ) as unknown as Record<ContentKind, readonly CompiledSource[]>,
    ),
    indexes: freezeIndexes(indexes),
  };
}

export function createSerializableManifestIndex(
  manifest: ContentManifest,
): SerializableManifestIndex {
  const ids = Object.fromEntries(
    Object.entries(manifest.indexes).map(([name, index]) => [name, Object.keys(index).sort()]),
  ) as unknown as SerializableManifestIndex["ids"];

  return {
    schemaVersion: "tokipona.content-index.v0.1",
    sources: Object.values(manifest.sources)
      .map(({ path, kind, schemaVersion, contentVersion }) => ({
        path,
        kind,
        schemaVersion,
        contentVersion,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    ids,
  };
}

interface MutableIndexes {
  words: Record<string, ContentObject>;
  lengthElements: Record<string, ContentObject>;
  attackGraphs: Record<string, ContentObject>;
  attackSignatures: Record<string, ContentObject>;
  chapters: Record<string, ContentObject>;
  regions: Record<string, ContentObject>;
  scenes: Record<string, ContentObject>;
  ecologies: Record<string, ContentObject>;
  economies: Record<string, ContentObject>;
  persistenceCoordinators: Record<string, ContentObject>;
  tasks: Record<string, ContentObject>;
  p0Words: Record<string, ContentObject>;
  glyphs: Record<string, ContentObject>;
}

function normalizeSources(
  sources: readonly ContentSource[],
  issues: ContentIssue[],
): CompiledSource[] {
  const paths = new Set<string>();
  const result: CompiledSource[] = [];

  for (const source of sources) {
    const path = normalizeRepositoryPath(source.path);
    if (!path.startsWith("data/") || !SOURCE_FILE_PATTERN.test(path)) {
      addIssue(issues, "source.path", path, "", "source must be a data/**/*.yaml|yml|json path");
      continue;
    }
    if (paths.has(path)) {
      addIssue(issues, "id.duplicate", path, "", `duplicate source path ${path}`);
      continue;
    }
    paths.add(path);

    if (!isContentObject(source.data)) {
      addIssue(issues, "schema.object", path, "", "top-level content must be an object");
      continue;
    }
    const schemaVersion = readStringAlias(source.data, "schema_version", "schemaVersion");
    const contentVersion = readStringAlias(source.data, "content_version", "contentVersion");
    const kind = classifySchema(schemaVersion);
    if (kind === null) {
      addIssue(
        issues,
        "schema.unsupported",
        path,
        "schema_version",
        `unsupported schema version ${JSON.stringify(schemaVersion)}`,
      );
      continue;
    }
    result.push({ path, kind, schemaVersion, contentVersion, content: source.data });
  }
  return result;
}

function validateSource(
  source: CompiledSource,
  byPath: ReadonlyMap<string, CompiledSource>,
  issues: ContentIssue[],
): void {
  requireVersion(source.schemaVersion, source, "schema_version", issues);
  requireVersion(source.contentVersion, source, "content_version", issues);
  validateFiniteNumbers(source.content, source.path, "", issues);
  validateNonNegativeMeasurements(source.content, source.path, "", issues);
  validateFileReferences(source, byPath, issues);

  switch (source.kind) {
    case "single_word_spells":
      validateSingleWordSource(source, issues);
      break;
    case "length_profiles":
      validateLengthSource(source, issues);
      break;
    case "attack_signatures":
      validateAttackSource(source, issues);
      break;
    case "chapter":
      validateArrayIds(source, "segments", "segment_id", issues);
      validatePrologueAcceptanceSource(source, issues);
      break;
    case "scene":
      validateSceneSource(source, issues);
      break;
    case "region":
      validateArrayIds(source, "nodes", "node_id", issues);
      validateArrayIds(source, "state_registry", "state_id", issues);
      validateNestedArrayIds(
        source,
        ["meaningful_material_patch_records", "records"],
        "patch_id",
        issues,
      );
      break;
    case "ecology":
      validateArrayIds(source, "entities", "entity_id", issues);
      validateArrayIds(source, "events", "event_id", issues);
      validateArrayIds(source, "golden_tests", "id", issues);
      validateEcologySource(source, issues);
      break;
    case "wildlife_economy":
      validateArrayIds(source, "item_definitions", "item_id", issues);
      validateArrayIds(source, "harvest_profiles", "profile_id", issues);
      validateArrayIds(source, "processing_recipes", "recipe_id", issues);
      validateArrayIds(source, "golden_tests", "id", issues);
      break;
    case "settlement_trade":
      validateArrayIds(source, "merchants", "id", issues);
      validateArrayIds(source, "prologue_items", "id", issues);
      validateScalarArrayUnique(source, "never_trade", issues);
      break;
    case "persistence":
      validateArrayIds(source, "registered_transaction_kinds", "kind", issues);
      validateArrayIds(source, "golden_tests", "id", issues);
      break;
    case "survival":
      validateArrayIds(source, "state_registry", "state_id", issues);
      validateArrayIds(source, "golden_tests", "id", issues);
      break;
    case "glyph_progression":
      validateArrayIds(source, "prologue_first_12", "word_id", issues);
      break;
    case "p0_curriculum":
      validateArrayIds(source, "words", "word_id", issues);
      validateArrayIds(source, "meditation_families", "id", issues);
      validateP0CurriculumSource(source, issues);
      break;
    case "task":
      validateArrayIds(source, "learning_state_event_contracts", "event_id", issues, false);
      validateArrayIds(source, "golden_tests", "id", issues);
      if (readString(source.content, "task_type") === "infrastructure_world_predicate") {
        validateInfrastructureTaskSource(source, issues);
      }
      if (readString(source.content, "task_type") === "safe_range_attack_qualification") {
        validateSafeRangeTaskSource(source, issues);
      }
      break;
    case "glyph_catalog":
      validateArrayIds(source, "glyphs", "canonicalWordId", issues);
      break;
    case "visual_surface_profiles":
      if (!isContentObject(source.content.profiles)) {
        addIssue(
          issues,
          "schema.object",
          source.path,
          "profiles",
          "profiles must be an object keyed by surface ID",
        );
      }
      break;
    case "learning_progression":
      validateLearningProgression(source, issues);
      break;
  }
}

function validatePrologueAcceptanceSource(source: CompiledSource, issues: ContentIssue[]): void {
  if (readString(source.content, "chapter_flow_id") !== "ch01_world_literacy_prologue") return;
  const expectedEvents = [
    "prologue_segment_started", "prologue_segment_completed", "world_literacy_observed",
    "world_literacy_intervened", "causal_attribution_submitted", "active_retrieval_submitted",
    "repair_requested", "repair_completed", "unseen_transfer_completed", "delayed_retrieval_completed",
    "alternate_method_used", "wildlife_encountered", "wildlife_provoked", "wildlife_fled",
    "wildlife_harmed", "local_reset_requested", "local_reset_completed", "capacity_milestone_committed",
    "attack_capacity_calibrated", "range_trial_permission_granted", "first_attack_signature_unlocked",
    "attack_qualification_started", "attack_qualification_completed", "safe_range_completed",
  ];
  const same = (actual: readonly string[], expected: readonly string[]): boolean =>
    actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
  if (!same(readStringArray(source.content, "telemetry_events"), expectedEvents)) {
    addIssue(issues, "chapter.telemetry_events", source.path, "telemetry_events", "chapter telemetry event IDs and order are noncanonical");
  }
  const contract = readObject(source.content, "telemetry_contract");
  const taxonomy = readObject(contract, "primary_activity_taxonomy");
  const payload = readObject(contract, "event_payload");
  if (readString(contract, "schema_version") !== "prologue.telemetry.v0.1" ||
      !same(readStringArray(taxonomy, "included"), ["world_people_physics", "language", "long_explanation"]) ||
      !same(readStringArray(taxonomy, "excluded"), ["pause", "idle", "settings", "optional_free_roam"]) ||
      taxonomy.exclusive_one_of_required !== true ||
      !same(readStringArray(payload, "required_fields"), ["schemaVersion", "eventId", "sessionId", "sequence", "worldTick", "segmentId", "primaryActivity", "contentActiveMs", "semantic"]) ||
      !same(readStringArray(payload, "semantic_field_keys"), ["subjectId", "outcomeId", "promptLevel", "count", "durationMs"]) ||
      !same(readStringArray(payload, "forbidden_fields"), ["rawUtterance", "rawText", "inventoryLotId", "damageOverride", "worldFlagOverride"])) {
    addIssue(issues, "chapter.telemetry_contract", source.path, "telemetry_contract", "telemetry taxonomy and privacy-safe payload schema are noncanonical");
  }
  const acceptance = readObject(source.content, "acceptance");
  const required = readObject(acceptance, "required");
  const playtest = readObject(acceptance, "playtest_targets");
  const languageRange = playtest.language_activity_time_share_range;
  if (required.mandatory_kills !== 0 || required.safe_range_uses_living_targets !== false ||
      required.required_tasks_have_non_attack_solution !== true || required.first_attack_reads_kill_count !== false ||
      required.length_available_is_not_mastered !== true || required.peaceful_progress_when_attack_locked !== true ||
      required.meaningful_world_deltas_on_return_minimum !== 3 || playtest.forced_hunts !== 0 ||
      playtest.wildlife_products_required_for_mainline !== false || playtest.survival_needs_modify_language_or_mp !== false ||
      playtest.prologue_needs_floor_minimum !== 20 || playtest.activity_share_uses_exclusive_primary_taxonomy !== true ||
      playtest.world_people_physics_time_share_minimum !== 0.65 || !Array.isArray(languageRange) || languageRange.length !== 2 ||
      languageRange[0] !== 0.15 || languageRange[1] !== 0.25 || playtest.long_explanation_panel_time_share_maximum !== 0.10 ||
      playtest.focus_active_new_words_per_segment_maximum !== 2 || playtest.recovery_path_visibility_design_max_seconds !== 60 ||
      playtest.actual_soft_failure_recovery_seconds_p90_target !== 120 || playtest.range_trial_permission_content_minutes_p90_maximum !== 180 ||
      playtest.formal_attack_unlock_by_180_content_minutes_proportion_minimum !== 0.70 ||
      !same(readStringArray(playtest, "time_metric_excludes"), ["pause", "idle", "settings", "optional_free_roam"]) ||
      playtest.mandatory_wildlife_harm_events !== 0 || playtest.survival_ui_active_time_share_maximum !== 0.03 ||
      playtest.needs_interrupted_language_interaction_share_maximum !== 0.02 || playtest.free_food_water_discovery_seconds_p95_maximum !== 60 ||
      playtest.hunting_income_vs_nonviolent_job_maximum !== 0.60 || playtest.duplicate_corpse_lot_currency_count !== 0) {
    addIssue(issues, "chapter.acceptance_contract", source.path, "acceptance", "chapter acceptance thresholds are noncanonical");
  }
}

function validateP0CurriculumSource(source: CompiledSource, issues: ContentIssue[]): void {
  const expectedTargets = {
    produced: ["telo", "tawa", "lili", "suli"],
    grounded: ["seli", "kiwen", "awen"],
    attuned: ["kon", "kasi", "lukin", "weka", "soweli"],
  } as const;
  const expectedWords = [...expectedTargets.produced, ...expectedTargets.grounded, ...expectedTargets.attuned];
  const words = readObjectArray(source.content, "words");
  const wordIds = words.map((word) => readString(word, "word_id"));
  if (wordIds.length !== 12 || new Set(wordIds).size !== 12 || expectedWords.some((word) => !wordIds.includes(word))) {
    addIssue(issues, "contract.p0_words", source.path, "words", "P0 curriculum must contain the exact 12 canonical words");
  }
  const scope = readObject(source.content, "scope");
  if (readString(scope, "band") !== "P0" || readNumber(scope, "unique_word_count") !== 12 || scope.first_three_hours_is_content_budget_not_real_time_gate !== true) {
    addIssue(issues, "contract.p0_scope", source.path, "scope", "P0 scope and 12-word content budget are noncanonical");
  }
  const target = readObject(source.content, "target_state_ceiling_first_three_hours");
  const targetByWord = new Map<string, string>();
  for (const [state, expected] of Object.entries(expectedTargets)) {
    const actual = readStringArray(target, state);
    if (actual.join("|") !== expected.join("|")) addIssue(issues, "contract.p0_target", source.path, `target_state_ceiling_first_three_hours.${state}`, `${state} target list is noncanonical`);
    for (const word of expected) targetByWord.set(word, state);
  }
  for (const [index, word] of words.entries()) {
    const wordId = readString(word, "word_id");
    if (readString(word, "target_state") !== targetByWord.get(wordId)) addIssue(issues, "contract.p0_target", source.path, `words[${index}].target_state`, `${wordId} target state does not match the ceiling`);
    for (const key of ["first_location", "witness", "grounding_task", "misconception_to_repair"] as const) if (!readString(word, key)) addIssue(issues, "contract.p0_field", source.path, `words[${index}].${key}`, `${wordId}.${key} must be authored`);
    const facets = readStringArray(word, "semantic_facets");
    const meditation = readObject(word, "meditation");
    const contexts = readStringArray(meditation, "context_contrast");
    const distractors = readStringArray(meditation, "recognition_distractors");
    if (facets.length !== 2 || new Set(facets).size !== 2) addIssue(issues, "contract.p0_context", source.path, `words[${index}].semantic_facets`, `${wordId} must author two semantic facets`);
    if (contexts.length !== 2 || new Set(contexts).size !== 2) addIssue(issues, "contract.p0_context", source.path, `words[${index}].meditation.context_contrast`, `${wordId} must author two distinct contexts`);
    if (distractors.length === 0 || new Set(distractors).size !== distractors.length) addIssue(issues, "contract.p0_distractors", source.path, `words[${index}].meditation.recognition_distractors`, `${wordId} distractors must be non-empty and unique`);
    const families = readStringArray(word, "production_task_families");
    if ((targetByWord.get(wordId) === "produced" && (families.length !== 2 || new Set(families).size !== 2)) || (targetByWord.get(wordId) !== "produced" && families.length !== 0)) addIssue(issues, "contract.p0_production", source.path, `words[${index}].production_task_families`, `${wordId} production families do not match its target state`);
  }
  const medium = readObject(source.content, "activation_medium");
  if (readString(medium, "item_id") !== "learning.common_inscription_medium" || readString(medium, "scarcity") !== "common" || medium.tradeable !== false || medium.random_drop_required !== false || medium.consumed_on_failed_or_interrupted_activation !== false) addIssue(issues, "contract.p0_medium", source.path, "activation_medium", "P0 activation medium must remain common, nontradeable, and non-consuming on failure");
  const station = readObject(source.content, "runtime_recovery_station");
  const stationPoint = station.interaction_point_tiles;
  if (readString(station, "scene_ref") !== "../scenes/valley-settlement.v0.1.yaml" || readString(station, "scene_id") !== "scene.valley.settlement" || readString(station, "target_id") !== "settlement.p0_inscription_archive" || readString(station, "interaction_id") !== "settlement.open_p0_inscription_archive" || !Array.isArray(stationPoint) || stationPoint.length !== 2 || stationPoint[0] !== 38 || stationPoint[1] !== 28 || readNumber(station, "maximum_distance_px") !== 16 || station.recovery_route_only_when_below_target !== true) addIssue(issues, "contract.p0_recovery_station", source.path, "runtime_recovery_station", "P0 recovery station binding is noncanonical");
  const acceptance = readObject(source.content, "content_acceptance");
  if (acceptance.all_words_recoverable !== true || acceptance.all_words_have_pronunciation_audio !== "required" || acceptance.contexts_per_word_minimum !== 2 || acceptance.misconception_counterexample_per_word_minimum !== 1 || acceptance.color_only_identification_forbidden !== true || acceptance.fixed_slot_only_production_forbidden !== true || acceptance.raw_string_equality_as_success_forbidden !== true || acceptance.community_semantic_review_required !== true) addIssue(issues, "contract.p0_acceptance", source.path, "content_acceptance", "P0 recovery, audio, context, misconception, cue, and community-review requirements are noncanonical");
}

function validateRequiredKinds(sources: readonly CompiledSource[], issues: ContentIssue[]): void {
  const counts = new Map<ContentKind, number>();
  for (const source of sources) counts.set(source.kind, (counts.get(source.kind) ?? 0) + 1);
  for (const kind of REQUIRED_KINDS) {
    if ((counts.get(kind) ?? 0) === 0) {
      addIssue(issues, "source.missing", "data", "", `required content kind ${kind} is missing`);
    }
  }
  for (const kind of [
    "single_word_spells",
    "length_profiles",
    "attack_signatures",
    "chapter",
    "region",
    "ecology",
    "wildlife_economy",
    "settlement_trade",
    "persistence",
    "learning_progression",
    "p0_curriculum",
  ] satisfies readonly ContentKind[]) {
    const count = counts.get(kind) ?? 0;
    if (count > 1) {
      addIssue(issues, "source.ambiguous", "data", "", `content kind ${kind} has ${count} sources`);
    }
  }
}

function buildIndexes(sources: readonly CompiledSource[], issues: ContentIssue[]): MutableIndexes {
  const indexes: MutableIndexes = {
    words: {},
    lengthElements: {},
    attackGraphs: {},
    attackSignatures: {},
    chapters: {},
    regions: {},
    scenes: {},
    ecologies: {},
    economies: {},
    persistenceCoordinators: {},
    tasks: {},
    p0Words: {},
    glyphs: {},
  };

  for (const source of sources) {
    switch (source.kind) {
      case "single_word_spells":
        indexArray(source, "entries", "id", indexes.words, issues);
        break;
      case "length_profiles":
        indexObject(source, "element_profiles", indexes.lengthElements, issues);
        break;
      case "attack_signatures":
        indexArray(source, "prerequisite_graphs", "graph_id", indexes.attackGraphs, issues);
        indexArray(source, "signatures", "signature_id", indexes.attackSignatures, issues);
        break;
      case "chapter":
        indexRoot(source, "chapter_flow_id", indexes.chapters, issues);
        break;
      case "region":
        indexRoot(source, "region_id", indexes.regions, issues);
        break;
      case "scene":
        indexRoot(source, "scene_id", indexes.scenes, issues);
        break;
      case "ecology":
        indexRoot(source, "ecology_id", indexes.ecologies, issues);
        break;
      case "wildlife_economy":
        indexRoot(source, "economy_id", indexes.economies, issues);
        break;
      case "settlement_trade":
        indexById("settlement_trade", source.content, indexes.economies, source, "runtime_scope", issues);
        break;
      case "persistence":
        indexRoot(source, "coordinator_id", indexes.persistenceCoordinators, issues);
        break;
      case "task":
        indexRoot(source, "task_id", indexes.tasks, issues);
        break;
      case "p0_curriculum":
        indexArray(source, "words", "word_id", indexes.p0Words, issues);
        break;
      case "glyph_catalog":
        if (source.schemaVersion.endsWith(".v0.2")) {
          indexArray(source, "glyphs", "canonicalWordId", indexes.glyphs, issues);
        }
        break;
      default:
        break;
    }
  }
  return indexes;
}

function validateCrossDomainReferences(
  sources: readonly CompiledSource[],
  indexes: MutableIndexes,
  issues: ContentIssue[],
): void {
  const wordIds = new Set(Object.keys(indexes.words));
  const lengthIds = new Set(Object.keys(indexes.lengthElements));
  const graphIds = new Set(Object.keys(indexes.attackGraphs));
  const signatureIds = new Set(Object.keys(indexes.attackSignatures));
  const p0Ids = new Set(Object.keys(indexes.p0Words));
  const glyphIds = new Set(Object.keys(indexes.glyphs));
  const damageFormulaIds = new Set<string>();

  for (const source of sources.filter((item) => item.kind === "attack_signatures")) {
    for (const model of readObjectArray(source.content, "physics_damage_models")) {
      const id = readString(model, "damage_formula_id");
      if (id) damageFormulaIds.add(id);
    }
  }

  for (const source of sources) {
    if (source.kind === "single_word_spells") {
      for (const [index, entry] of readObjectArray(source.content, "entries").entries()) {
        const ref = readNestedString(entry, ["world", "geometry", "length_profile_ref"]);
        if (ref && !lengthIds.has(ref)) {
          addIssue(issues, "ref.missing", source.path, `entries[${index}].world.geometry.length_profile_ref`, `unknown length element ${ref}`);
        }
      }
    }
    if (source.kind === "length_profiles") {
      const profiles = readObject(source.content, "element_profiles");
      for (const [id, value] of Object.entries(profiles)) {
        if (!isContentObject(value)) continue;
        const entryId = readString(value, "geometry_entry_id");
        if (!wordIds.has(entryId)) {
          addIssue(issues, "ref.missing", source.path, `element_profiles.${id}.geometry_entry_id`, `unknown word ${entryId}`);
        }
        if (entryId && entryId !== id) {
          addIssue(issues, "ref.mismatch", source.path, `element_profiles.${id}.geometry_entry_id`, `expected ${id}, received ${entryId}`);
        }
      }
      for (const [name, mapping] of Object.entries(readObject(source.content, "language_mapping"))) {
        if (!isContentObject(mapping)) continue;
        const modifier = mapping.modifier_word_id;
        if (typeof modifier === "string" && !wordIds.has(modifier)) {
          addIssue(issues, "ref.missing", source.path, `language_mapping.${name}.modifier_word_id`, `unknown word ${modifier}`);
        }
      }
    }
    if (source.kind === "attack_signatures") {
      for (const [index, signature] of readObjectArray(source.content, "signatures").entries()) {
        const graphId = readString(signature, "prerequisite_graph_id");
        if (!graphIds.has(graphId)) {
          addIssue(issues, "ref.missing", source.path, `signatures[${index}].prerequisite_graph_id`, `unknown graph ${graphId}`);
        }
        const formulaId = readNestedString(signature, ["damage_resolution", "damage_formula_id"]);
        if (formulaId && !damageFormulaIds.has(formulaId)) {
          addIssue(issues, "ref.missing", source.path, `signatures[${index}].damage_resolution.damage_formula_id`, `unknown damage formula ${formulaId}`);
        }
        validateCanonicalWordRefs(signature.canonical_ast_shape, source, `signatures[${index}].canonical_ast_shape`, wordIds, issues);
      }
      for (const [index, graph] of readObjectArray(source.content, "prerequisite_graphs").entries()) {
        validateCanonicalWordRefs(graph.canonical_ast_shape, source, `prerequisite_graphs[${index}].canonical_ast_shape`, wordIds, issues);
        const nodes = asObjectArray(graph.required_nodes);
        const nodeIds = new Set(nodes.map((node) => readString(node, "node_id")));
        reportDuplicates(nodes, "node_id", source, `prerequisite_graphs[${index}].required_nodes`, issues);
        for (const [nodeIndex, node] of nodes.entries()) {
          const targetGraph = readString(node, "target_graph_id");
          if (targetGraph && !graphIds.has(targetGraph)) {
            addIssue(issues, "ref.missing", source.path, `prerequisite_graphs[${index}].required_nodes[${nodeIndex}].target_graph_id`, `unknown graph ${targetGraph}`);
          }
          for (const eligible of readStringArray(node, "eligible_target_node_ids")) {
            if (!nodeIds.has(eligible)) {
              addIssue(issues, "ref.missing", source.path, `prerequisite_graphs[${index}].required_nodes[${nodeIndex}].eligible_target_node_ids`, `unknown prerequisite node ${eligible}`);
            }
          }
        }
      }
    }
    if (source.kind === "task") {
      for (const [index, wordId] of readStringArray(readObject(source.content, "enabled_content"), "word_ids").entries()) {
        if (!wordIds.has(wordId)) addIssue(issues, "ref.missing", source.path, `enabled_content.word_ids[${index}]`, `unknown word ${wordId}`);
      }
      if (Object.keys(readNestedObject(source.content, ["enabled_content", "expected_profiles"])).length > 0) {
        validateTaskExpectedProfiles(source, issues);
      }
      if (readString(source.content, "task_type") === "infrastructure_world_predicate") {
        validateInfrastructureTaskReferences(source, sources, indexes, wordIds, issues);
      }
      if (readString(source.content, "task_type") === "safe_range_attack_qualification") {
        validateSafeRangeTaskReferences(source, sources, indexes, issues);
      }
    }
    if (source.kind === "p0_curriculum") {
      for (const wordId of p0Ids) {
        if (glyphIds.size > 0 && !glyphIds.has(wordId)) {
          addIssue(issues, "ref.missing", source.path, `words.${wordId}`, `P0 word is absent from the v0.2 glyph catalog`);
        }
      }
      const declared = readNestedNumber(source.content, ["scope", "unique_word_count"]);
      if (declared !== null && declared !== p0Ids.size) {
        addIssue(issues, "range.count", source.path, "scope.unique_word_count", `declares ${declared}, compiled ${p0Ids.size}`);
      }
    }
    if (source.kind === "chapter") {
      const regionSource = resolveReferencedSource(source, readString(source.content, "region_ref"), sources);
      const regionNodes = new Set(regionSource ? readObjectArray(regionSource.content, "nodes").map((node) => readString(node, "node_id")) : []);
      for (const [segmentIndex, segment] of readObjectArray(source.content, "segments").entries()) {
        for (const [nodeIndex, nodeId] of readStringArray(segment, "map_nodes").entries()) {
          if (!regionNodes.has(nodeId)) addIssue(issues, "ref.missing", source.path, `segments[${segmentIndex}].map_nodes[${nodeIndex}]`, `unknown region node ${nodeId}`);
        }
      }
      validateKnownIdFields(source.content, source, graphIds, signatureIds, issues);
    }
    if (source.kind === "region") {
      validateRegionReferences(source, graphIds, issues);
    }
    if (source.kind === "scene") {
      validateSceneReferences(source, sources, indexes, issues);
    }
    if (source.kind === "wildlife_economy") {
      validateEconomyItemReferences(source, issues);
    }
    if (source.kind === "settlement_trade") {
      validateTradeReferences(source, sources, issues);
    }
    if (source.kind === "glyph_progression") {
      for (const [index, entry] of readObjectArray(source.content, "prologue_first_12").entries()) {
        const word = readString(entry, "word_id");
        if (glyphIds.size > 0 && !glyphIds.has(word)) addIssue(issues, "ref.missing", source.path, `prologue_first_12[${index}].word_id`, `unknown glyph ${word}`);
      }
    }
  }
}

type Obj = Record<string, unknown>;

const TARGET_IDS = ["wood_dummy", "sandbag", "minecart", "hanging_stone", "material_collision_table"];
const INTERACTION_IDS = ["safe_range.test_wood_dummy", "safe_range.test_sandbag", "safe_range.test_minecart", "safe_range.test_hanging_stone", "safe_range.inspect_material_collision_table"];
const NODE_IDS = ["retrieve.telo.two_families", "use.motion.noncombat", "use.intensity.inert", "repair.related_graph", "retrieve.delayed"];
const FORBIDDEN_INPUTS = ["kill_count", "wildlife_harm", "elapsed_real_time", "repeated_cast_count", "currency", "streak"];

function validateSafeRangeTaskSource(source: CompiledSource, issues: ContentIssue[]): void {
  const content = source.content as Obj;
  const fail = (code: string, fieldPath: string, message: string): void => { issues.push({ code, sourcePath: source.path, fieldPath, message }); };
  if (source.schemaVersion !== "g01.task.safe-range.v0.1" || str(content.task_id) !== "ch01_first_attack_qualification" || str(content.task_family_id) !== "safe_range_unseen_transfer" || str(content.chapter_segment_id) !== "return_and_safe_range" || str(content.region_node_id) !== "valley.safe_range" || content.optional !== true || content.living_targets_forbidden !== true) fail("task.safe_range_identity", "task_id", "N08 identity, optionality and inert-only boundary are noncanonical");
  const entry = obj(content.entry_guard), exit = obj(content.exit_guard);
  if (!exact(entry, { state_id: "range_trial_permission", expected: true }) || !exact(exit, { state_id: "range_trial_permission", expected: true })) fail("task.safe_range_guard", "entry_guard", "N08 entry and exit require range_trial_permission only");
  if (!same(content.target_ids, TARGET_IDS) || !same(content.interaction_ids, INTERACTION_IDS)) fail("task.safe_range_bindings", "target_ids", "N08 target and interaction bindings must be exact ordered sets");
  if (!canonicalAst(obj(content.canonical_ast)) || content.raw_utterance_string_matching_forbidden !== true) fail("task.safe_range_ast", "canonical_ast", "N08 must use canonical structured AST and forbid raw utterance matching");
  const stages = arr(content.ordered_state_progression);
  if (stages.length !== 4 || !same(stages.map((stage) => str(stage.stage_id)), ["calibration", "permission", "first_eligible_unseen_transfer", "complete_material_table"])) fail("task.safe_range_progression", "ordered_state_progression", "N08 progression order is noncanonical");
  const calibration = stages[0] ?? {}, permission = stages[1] ?? {}, first = stages[2] ?? {}, table = stages[3] ?? {};
  if (str(calibration.prerequisite_state_id) !== "attack_capacity_calibration_complete" || str(calibration.writer_event) !== "attack_capacity_calibrated" || str(permission.prerequisite_state_id) !== "range_trial_permission" || str(permission.writer_event) !== "attack_prerequisites_verified" || str(first.evidence_type) !== "safe_range_unseen_transfer" || !same(first.eligible_prompt_levels, ["H0", "H1"]) || str(first.target_class) !== "inert" || first.living_overlap_rejected_before_commit !== true || str(first.result_state_id) !== "first_attack_signature_available" || str(first.writer_event) !== "safe_range_transfer_passed" || !same(table.required_target_classes, TARGET_IDS.slice(0, 4)) || str(table.table_target_id) !== "material_collision_table" || str(table.result_state_id) !== "first_attack_signature_completed" || str(table.writer_event) !== "safe_range_material_table_completed") fail("task.safe_range_progression", "ordered_state_progression", "N08 calibration, permission, H0/H1 transfer and material-table stages are invalid");
  const execution = obj(content.execution_contract);
  if (str(execution.output_phase) !== "liquid" || num(execution.output_mass_mu) !== 2 || num(execution.paid_kinetic_budget_eu) !== 8 || num(execution.bound_existing_water_mp) !== 13 || num(execution.manifested_water_mp) !== 18 || execution.swept_volume_collision_check !== true || execution.living_overlap_rejected_before_commit !== true || str(execution.target_physics_authority) !== "attack_signature.safe_range_target_physics" || execution.runtime_target_physics_guessing_forbidden !== true || str(execution.target_state_initialization_source) !== "attack_signature.safe_range_target_physics.profiles.initial_hp" || str(execution.collision_geometry_source) !== "scene.targets.collision_bounds_tiles" || str(execution.living_overlap_source) !== "runtime_actor_aabb_vs_authored_target_and_swept_volume" || execution.mp_charged_only_after_valid_commit !== true) fail("task.safe_range_execution", "execution_contract", "N08 execution must bind authored costs, target state, swept collision and living overlap rejection");
  const completion = obj(content.completion);
  if (str(completion.first_transfer_event) !== "safe_range_transfer_passed" || str(completion.first_transfer_state_id) !== "first_attack_signature_available" || str(completion.material_table_event) !== "safe_range_material_table_completed" || str(completion.material_table_state_id) !== "first_attack_signature_completed" || completion.requires_all_target_classes_and_table !== true || completion.raw_expression_never_read_for_success !== true || completion.living_target_never_required !== true || JSON.stringify(completion).includes("prologue_return_observed")) fail("task.safe_range_completion", "completion", "N08 completion writes only its two qualification states and never reads raw utterances or living targets");
  const parallel = obj(content.parallel_calibration_station), parallelReceipt = obj(parallel.receipt_contract), parallelActions = arr(parallel.actions), unrelatedActions = arr(parallel.unrelated_semantic_world_actions);
  const expectedActionRows = [
    ["settlement.telo.h0", "scene.valley.settlement", "calibration.telo.delivery", "settlement_water_delivery", "active_retrieval", "retrieve.telo.two_families", 0, "retrieved_water_concept", false],
    ["settlement.telo.h1", "scene.valley.settlement", "calibration.telo.irrigation", "settlement_irrigation_review", "active_retrieval", "retrieve.telo.two_families", 1, "retrieved_water_concept", false],
    ["settlement.tawa.h0", "scene.valley.settlement", "calibration.tawa.courier", "settlement_courier_motion", "noncombat_action", "use.motion.noncombat", 0, "noncombat_movement", false],
    ["settlement.tawa.h1", "scene.valley.settlement", "calibration.tawa.channel", "settlement_channel_navigation", "noncombat_action", "use.motion.noncombat", 1, "noncombat_movement", false],
    ["return_flow.wawa.inert_h0", "scene.valley.return_channel", "ch01_return_flow", "ecology_and_return_flow", "noncombat_intensity", "use.intensity.inert", 0, "grounded_inert_intensity", true],
    ["return_flow.wawa.inert_h1", "scene.valley.return_channel", "ch01_return_flow", "ecology_and_return_flow", "noncombat_intensity", "use.intensity.inert", 1, "grounded_inert_intensity", true],
    ["settlement.repair.motion_h0", "scene.valley.settlement", "calibration.repair.motion", "settlement_calibration_repair", "repair", "repair.related_graph", 0, "repaired_motion_graph", false],
    ["settlement.delayed_retrieval_h0", "scene.valley.settlement", "calibration.delayed.ast", "settlement_delayed_retrieval", "delayed_retrieval", "retrieve.delayed", 0, "retrieved_canonical_ast_after_two_events", false],
  ] as const;
  if (str(parallel.authority_scene_id) !== "scene.valley.settlement" || str(parallel.target_id) !== "settlement.attack_calibration_table" || str(parallel.interaction_id) !== "settlement.open_attack_calibration" || !same(parallel.interaction_point_tiles, [36, 28]) || parallelReceipt.receipt_required !== true || !same(parallelReceipt.idempotency_key_fields, ["player_save_id", "action_id", "normalized_variant_hash"]) || parallelReceipt.duplicate_evidence_award_forbidden !== true || parallelActions.length !== 8 || new Set(parallelActions.map((action) => str(action.action_id))).size !== 8 || parallelActions.some((action, index) => { const expected = expectedActionRows[index]!; return str(action.action_id) !== expected[0] || str(action.authority_scene_id) !== expected[1] || str(action.authority_task_id) !== expected[2] || str(action.task_family_id) !== expected[3] || str(action.evidence_type) !== expected[4] || str(action.prerequisite_node_id) !== expected[5] || num(action.prompt_level) !== expected[6] || str(action.outcome) !== expected[7] || action.existing_domain_event_mapping_only !== expected[8]; }) || !same(obj(parallelActions[2]?.canonical_ast) && Object.values(obj(parallelActions[2]?.canonical_ast)), ["word.jan", "o", "word.tawa"]) || str(parallelActions[2]?.canonical_ast_shape) !== "subject_o_predicate" || !same(obj(parallelActions[3]?.canonical_ast) && Object.values(obj(parallelActions[3]?.canonical_ast)), ["word.jan", "o", "word.tawa"]) || str(parallelActions[3]?.canonical_ast_shape) !== "subject_o_predicate" || !same(parallelActions[6]?.eligible_target_node_ids, ["use.motion.noncombat", "use.intensity.inert"]) || !canonicalAst(obj(parallelActions[7]?.canonical_ast)) || !same(parallelActions[7]?.required_unrelated_action_ids, ["settlement.calibration.unrelated_delivery_commit", "settlement.calibration.unrelated_route_commit"]) || !same(unrelatedActions.map((action) => str(action.action_id)), ["settlement.calibration.unrelated_delivery_commit", "settlement.calibration.unrelated_route_commit"]) || unrelatedActions.some((action, index) => { const expected = [["settlement.calibration.unrelated_delivery_commit", "calibration.unrelated.delivery", "delivery_committed"], ["settlement.calibration.unrelated_route_commit", "calibration.unrelated.route", "route_committed"]] as const; const row = expected[index]!; return str(action.action_id) !== row[0] || str(action.authority_scene_id) !== "scene.valley.settlement" || str(action.authority_task_id) !== row[1] || str(action.task_family_id) !== "settlement_calibration_context" || str(action.outcome) !== row[2] || action.qualification_evidence !== false; })) fail("task.safe_range_parallel_calibration", "parallel_calibration_station", "N08 parallel calibration action authority, family, AST, outcome, receipt and unrelated-event catalog must remain exact");  const recovery = obj(content.recovery);
  if (num(recovery.maximum_softlock_recovery_seconds) === null || num(recovery.maximum_softlock_recovery_seconds)! <= 0 || num(recovery.maximum_softlock_recovery_seconds)! > 60 || !same(recovery.actions, ["discard_preview_without_mp_charge", "reject_before_commit_and_reposition_trial_volume", "restore_task_local_inert_targets", "expose_peaceful_return"]) || !same(recovery.preserves, ["learning_evidence", "global_progress", "completed_target_classes", "attack_qualification_state"]) || recovery.duplicate_evidence_forbidden !== true) fail("task.safe_range_recovery", "recovery", "N08 recovery must be local, <=60 seconds and preserve committed learning state");
}

function validateSafeRangeTaskReferences(source: CompiledSource, sources: readonly CompiledSource[], _indexes: unknown, issues: ContentIssue[]): void {
  const content = source.content as Obj;
  const fail = (code: string, fieldPath: string, message: string): void => { issues.push({ code, sourcePath: source.path, fieldPath, message }); };
  const scene = sources.find((item) => item.path === "data/scenes/valley-safe-range.v0.1.yaml");
  const settlement = sources.find((item) => item.path === "data/scenes/valley-settlement.v0.1.yaml");
  const attack = sources.find((item) => item.path === "data/spells/attack-signatures.v0.1.yaml");
  const region = sources.find((item) => item.path === "data/world/regions/valley-prologue.v0.1.yaml");
  const chapter = sources.find((item) => item.path === "data/chapters/ch01-world-literacy-prologue.v0.1.yaml");
  if (str(content.scene_ref) !== "../scenes/valley-safe-range.v0.1.yaml" || str(content.attack_signature_ref) !== "../spells/attack-signatures.v0.1.yaml" || !scene || !settlement || !attack || !region || !chapter) return fail("task.safe_range_refs", "scene_ref", "N08 canonical scene, settlement, region, chapter and attack sources are required");
  const sceneContent = scene.content as Obj, settlementContent = settlement.content as Obj, attackContent = attack.content as Obj, regionContent = region.content as Obj, chapterContent = chapter.content as Obj;
  const settlementCalibrationTarget = arr(settlementContent.targets).find((item) => str(item.target_id) === "settlement.attack_calibration_table"), settlementCalibrationInteraction = arr(settlementContent.interactions).find((item) => str(item.interaction_id) === "settlement.open_attack_calibration");
  if (!settlementCalibrationTarget || str(settlementCalibrationTarget.target_kind) !== "inert_learning_station" || !same(settlementCalibrationTarget.interaction_point_tiles, [36, 28]) || !settlementCalibrationInteraction || str(settlementCalibrationInteraction.target_id) !== "settlement.attack_calibration_table" || str(settlementCalibrationInteraction.verb) !== "open_parallel_attack_calibration") fail("task.safe_range_parallel_station", "parallel_calibration_station", "N02 must author the exact inert parallel-calibration target, position and interaction");  const size = obj(sceneContent.size_tiles), targets = arr(sceneContent.targets), interactions = arr(sceneContent.interactions);
  const expectedSafeRangeInteractionBindings = [["safe_range.test_wood_dummy", "wood_dummy", "execute_controlled_attack_transfer", true], ["safe_range.test_sandbag", "sandbag", "execute_controlled_attack_transfer", true], ["safe_range.test_minecart", "minecart", "execute_controlled_attack_transfer", true], ["safe_range.test_hanging_stone", "hanging_stone", "execute_controlled_attack_transfer", true], ["safe_range.inspect_material_collision_table", "material_collision_table", "inspect_authored_material_collision_results", false]] as const;
  const safeRangeInteractionBindingsValid = interactions.length === expectedSafeRangeInteractionBindings.length && interactions.every((interaction, index) => { const expected = expectedSafeRangeInteractionBindings[index]!; return str(interaction.interaction_id) === expected[0] && str(interaction.target_id) === expected[1] && str(interaction.verb) === expected[2] && interaction.tool_or_magic_required === expected[3]; });
  if (!safeRangeInteractionBindingsValid || str(sceneContent.scene_id) !== "scene.valley.safe_range" || str(sceneContent.region_node_id) !== "valley.safe_range" || num(size.width) !== 24 || num(size.height) !== 18 || !same(targets.map((target) => str(target.target_id)), TARGET_IDS) || !same(targets.map((target) => str(target.target_kind)), TARGET_IDS) || !same(interactions.map((interaction) => str(interaction.interaction_id)), INTERACTION_IDS) || !same(targets[4]?.interaction_point_tiles, [20, 1]) || targets.some((target) => str(target.target_kind).includes("living"))) fail("task.safe_range_scene", "scene_ref", "N08 scene must remain 24x18 with exactly five inert targets and interactions");
  const authoredBounds = targets.slice(0, 4).map((target) => obj(target.collision_bounds_tiles));
  for (const [index, target] of targets.slice(0, 4).entries()) {
    const point = target.interaction_point_tiles, bounds = authoredBounds[index]!;
    const x = num(bounds.x), y = num(bounds.y), width = num(bounds.width), height = num(bounds.height);
    if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isSafeInteger(value)) || x === null || y === null || width === null || height === null || ![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 24 || y + height > 18) fail("task.safe_range_geometry", `targets[${index}]`, "each trial target requires an in-scene authored interaction point and collision AABB");
  }
  for (let left = 0; left < authoredBounds.length; left += 1) for (let right = left + 1; right < authoredBounds.length; right += 1) {
    if (safeRangeRectsOverlap(authoredBounds[left]!, authoredBounds[right]!)) fail("task.safe_range_geometry_overlap", "scene_ref", "N08 trial target collision AABBs must be pairwise non-overlapping");
  }  const graph = arr(attackContent.prerequisite_graphs).find((item) => str(item.graph_id) === "attack.water.forceful_motion.prerequisite_graph");
  const signature = arr(attackContent.signatures).find((item) => str(item.signature_id) === "attack.water.forceful_motion.v0.1");
  const model = arr(attackContent.physics_damage_models).find((item) => str(item.damage_formula_id) === "physics.impact.transfer.v0.1");
  if (!graph || !signature || !model) return fail("task.safe_range_attack", "attack_signature_ref", "authoritative graph, signature and physical damage model are required");
  const nodes = arr(graph.required_nodes), repair = nodes[3] ?? {}, delayed = nodes[4] ?? {};
  if (!canonicalAst(obj(graph.canonical_ast_shape)) || !same(nodes.map((node) => str(node.node_id)), NODE_IDS) || str(graph.completion_event) !== "attack_capacity_calibrated" || !same(graph.forbidden_inputs, FORBIDDEN_INPUTS) || !same(repair.eligible_target_node_ids, ["use.motion.noncombat", "use.intensity.inert"]) || str(repair.target_graph_id) !== str(graph.graph_id) || num(repair.minimum) !== 1 || num(repair.max_hint_level_after_repair) !== 1 || str(delayed.target_graph_id) !== str(graph.graph_id) || str(delayed.retrieval_target) !== "canonical_ast_shape_or_declared_paraphrase_equivalence" || num(delayed.unrelated_world_events_between) !== 2 || num(delayed.minimum) !== 1 || num(delayed.max_hint_level) !== 1) fail("task.safe_range_graph", "attack_signature_ref", "N08 prerequisite graph exact nodes, repair binding, delayed ordering and forbidden inputs are required");
  const capacity = obj(signature.capacity_requirements), mp = obj(signature.mp_quote), output = obj(signature.material_output), motion = obj(signature.motion_output), trial = obj(signature.trial_execution), damage = obj(signature.damage_resolution), targetPhysics = obj(signature.safe_range_target_physics), profiles = arr(targetPhysics.profiles);
  const profileClasses = profiles.map((profile) => str(profile.target_class));
  const attackEnvelopeShapesValid = same(Object.keys(output), ["phase", "default_manifested_mass_mu", "solid_mass_impact_component", "gravity_after_release", "persistence_scope", "economy_export_forbidden"]) && same(Object.keys(motion), ["paid_kinetic_budget_eu", "initial_speed_band_mps", "direction_source", "mouse_speed_to_kinetic_energy_forbidden", "auto_target_lock_forbidden"]) && same(Object.keys(trial), ["required_permission_state", "allowed_scene", "allowed_target_class", "living_overlap_rejected_before_commit", "swept_volume_collision_check"]) && same(Object.keys(targetPhysics), ["authority", "balance_status", "runtime_target_physics_guessing_forbidden", "transferred_kinetic_eu_formula", "damage_formula_id", "profiles"]) && profiles.every((profile) => same(Object.keys(profile), ["target_class", "material_class", "target_absorption_eu", "kinetic_coupling_ratio", "initial_hp", "initial_state_band"]));
  if (!attackEnvelopeShapesValid || !canonicalAst(obj(signature.canonical_ast_shape)) || str(signature.prerequisite_graph_id) !== str(graph.graph_id) || num(capacity.player_expression_capacity_meaningful_tokens_minimum) !== 4 || num(capacity.artifact_surface_slot_capacity_minimum) !== 4 || num(mp.use_bound_existing_water) !== 13 || num(mp.manifest_default_water) !== 18 || str(output.phase) !== "liquid" || num(output.default_manifested_mass_mu) !== 2 || num(motion.paid_kinetic_budget_eu) !== 8 || !same(motion.initial_speed_band_mps, [3, 5]) || output.gravity_after_release !== true || str(output.persistence_scope) !== "ephemeral" || output.economy_export_forbidden !== true || str(trial.required_permission_state) !== "range_trial_permission" || str(trial.allowed_scene) !== "scene.valley.safe_range" || str(trial.allowed_target_class) !== "inert" || trial.living_overlap_rejected_before_commit !== true || trial.swept_volume_collision_check !== true || str(damage.damage_formula_id) !== "physics.impact.transfer.v0.1" || num(damage.liquid_solid_mass_damage_component) !== 0 || damage.damage_constant_in_signature_forbidden !== true || damage.language_evidence_read_by_damage_formula !== false || str(targetPhysics.authority) !== "authored_per_target_class" || str(targetPhysics.balance_status) !== "provisional_authored_values" || targetPhysics.runtime_target_physics_guessing_forbidden !== true || str(targetPhysics.transferred_kinetic_eu_formula) !== "min(paid_kinetic_budget_eu, paid_kinetic_budget_eu * kinetic_coupling_ratio)" || str(targetPhysics.damage_formula_id) !== "physics.impact.transfer.v0.1" || !same(profileClasses, TARGET_IDS.slice(0, 4)) || new Set(profileClasses).size !== 4 || profiles.some((profile) => num(profile.target_absorption_eu) === null || num(profile.target_absorption_eu)! < 0 || num(profile.kinetic_coupling_ratio) === null || num(profile.kinetic_coupling_ratio)! <= 0 || num(profile.kinetic_coupling_ratio)! > 1 || !Number.isSafeInteger(profile.initial_hp) || num(profile.initial_hp)! <= 0 || !str(profile.material_class) || !str(profile.initial_state_band))) fail("task.safe_range_attack", "attack_signature_ref", "N08 signature, costs, capacity, liquid output, safety and authored target state are noncanonical");
  if (str(model.kinetic_component_hp_formula) !== "floor(max(0, transferred_kinetic_eu - target_absorption_eu) / 4)" || str(model.total_impact_hp_formula) !== "kinetic_component_hp + solid_mass_component_hp" || model.liquid_and_gas_use_kinetic_component_only !== true) fail("task.safe_range_physics", "attack_signature_ref", "N08 authoritative physical damage formula is invalid");
  const regionNodes = arr(regionContent.nodes), safeNode = regionNodes.find((item) => str(item.node_id) === "valley.safe_range"), oldMine = regionNodes.find((item) => str(item.node_id) === "valley.old_mine_threshold"), connection = arr(regionContent.connections).find((item) => str(item.from) === "valley.settlement" && str(item.to) === "valley.safe_range"), reciprocalConnection = arr(regionContent.connections).find((item) => str(item.from) === "valley.safe_range" && str(item.to) === "valley.settlement");
  const settlementExit = arr(settlementContent.exits).find((item) => str(item.exit_id) === "settlement.to_safe_range"), settlementEntrance = arr(settlementContent.entrances).find((item) => str(item.entrance_id) === "settlement.from_safe_range"), safeExit = arr(sceneContent.exits).find((item) => str(item.exit_id) === "safe_range.to_settlement"), safeEntrance = arr(sceneContent.entrances).find((item) => str(item.entrance_id) === "safe_range.from_settlement");
  if (guard(safeNode) !== "range_trial_permission == true" || guardConnection(connection) !== "range_trial_permission == true" || guardConnection(reciprocalConnection) !== "range_trial_permission == true" || guardExit(settlementExit) !== "range_trial_permission == true" || guardExit(safeExit) !== "range_trial_permission == true" || str(settlementExit?.target_scene_id) !== "scene.valley.safe_range" || str(settlementExit?.target_entrance_id) !== "safe_range.from_settlement" || !settlementEntrance || str(safeExit?.target_scene_id) !== "scene.valley.settlement" || str(safeExit?.target_entrance_id) !== "settlement.from_safe_range" || !safeEntrance) fail("task.safe_range_topology", "scene_ref", "N02 <-> N08 must be direct and guarded by range_trial_permission on both directions");
  if (guard(oldMine) !== "prologue_return_observed == true") fail("task.safe_range_old_mine_guard", "region_id", "old mine must remain guarded only by prologue_return_observed");
  const segment = arr(chapterContent.segments).find((item) => str(item.segment_id) === "return_and_safe_range");
  if (!segment || !arrStrings(segment.optional_task_ids).includes("ch01_first_attack_qualification")) fail("task.safe_range_optional", "chapter_segment_id", "N08 qualification must remain optional");
  const commits = obj(regionContent.event_commit_points), returnWriter = obj(commits.return_observation_committed), transferWriter = obj(commits.safe_range_transfer_passed), tableWriter = obj(commits.safe_range_material_table_completed);
  if (str(returnWriter.owner) !== "ch01_return_observation" || !same(Object.keys(obj(returnWriter.atomic_writes)), ["prologue_return_observed"]) || str(transferWriter.owner) !== "ch01_first_attack_qualification" || !same(Object.keys(obj(transferWriter.atomic_writes)), ["first_attack_signature_available"]) || str(tableWriter.owner) !== "ch01_first_attack_qualification" || !same(Object.keys(obj(tableWriter.atomic_writes)), ["first_attack_signature_completed"])) fail("task.safe_range_writer_boundary", "completion", "N08 may own only its two qualification states; prologue_return_observed stays protected");
}

function obj(value: unknown): Obj { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Obj : {}; }
function arr(value: unknown): Obj[] { return Array.isArray(value) ? value.map(obj) : []; }
function arrStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function same(value: unknown, expected: readonly unknown[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]); }
function exact(value: Obj, expected: Obj): boolean { return same(Object.keys(value), Object.keys(expected)) && Object.keys(expected).every((key) => value[key] === expected[key]); }
function canonicalAst(value: Obj): boolean { return exact(value, { subject_head: "word.telo", command_particle: "o", action: "word.tawa", manner: "word.wawa" }); }
function safeRangeRectsOverlap(left: Obj, right: Obj): boolean {
  const lx = num(left.x), ly = num(left.y), lw = num(left.width), lh = num(left.height), rx = num(right.x), ry = num(right.y), rw = num(right.width), rh = num(right.height);
  if ([lx, ly, lw, lh, rx, ry, rw, rh].some((value) => value === null)) return false;
  return lx! < rx! + rw! && lx! + lw! > rx! && ly! < ry! + rh! && ly! + lh! > ry!;
}function guard(node: Obj | undefined): string { return str(obj(node?.entry_condition).predicate); }
function guardConnection(connection: Obj | undefined): string { return str(obj(connection?.traversal).predicate); }
function guardExit(exit: Obj | undefined): string { return str(obj(exit?.traversal_guard).predicate); }

function validateInfrastructureTaskReferences(
  source: CompiledSource,
  sources: readonly CompiledSource[],
  indexes: MutableIndexes,
  wordIds: ReadonlySet<string>,
  issues: ContentIssue[],
): void {
  const taskId = readString(source.content, "task_id");
  const chapterId = readString(source.content, "chapter_flow_id");
  const segmentId = readString(source.content, "chapter_segment_id");
  const regionId = readString(source.content, "region_id");
  const nodeId = readString(source.content, "region_node_id");
  const chapter = indexes.chapters[chapterId];
  const region = indexes.regions[regionId];
  const segment = chapter ? readObjectArray(chapter, "segments").find((candidate) => readString(candidate, "segment_id") === segmentId) : undefined;
  if (!chapter) addIssue(issues, "ref.missing", source.path, "chapter_flow_id", `unknown chapter ${chapterId}`);
  if (!segment) addIssue(issues, "ref.missing", source.path, "chapter_segment_id", `unknown chapter segment ${segmentId}`);
  if (segment) {
    const declaredTaskIds = new Set([
      ...readStringArray(segment, "task_ids"), ...readStringArray(segment, "required_task_ids"), ...readStringArray(segment, "optional_task_ids"),
    ]);
    if (!declaredTaskIds.has(taskId)) addIssue(issues, "ref.missing", source.path, "task_id", `task ${taskId} is not declared by chapter segment ${segmentId}`);
    if (readString(segment, "task_family_id") !== readString(source.content, "task_family_id")) addIssue(issues, "ref.mismatch", source.path, "task_family_id", `chapter segment ${segmentId} declares another task family`);
    const chapterSolutions = new Set(readStringArray(segment, "solution_families"));
    for (const [index, solution] of readObjectArray(source.content, "solution_families").entries()) {
      const family = readString(solution, "chapter_solution_family");
      if (!chapterSolutions.has(family) && family !== "guided_material_change") addIssue(issues, "ref.missing", source.path, `solution_families[${index}].chapter_solution_family`, `solution family ${family} is not declared by chapter segment ${segmentId}`);
    }
  }

  const node = region ? readObjectArray(region, "nodes").find((candidate) => readString(candidate, "node_id") === nodeId) : undefined;
  if (!region) addIssue(issues, "ref.missing", source.path, "region_id", `unknown region ${regionId}`);
  if (!node) addIssue(issues, "ref.missing", source.path, "region_node_id", `unknown region node ${nodeId}`);

  const sceneRef = readString(source.content, "scene_ref");
  const sceneSource = resolveReferencedSource(source, sceneRef, sources);
  if (!sceneSource || sceneSource.kind !== "scene") addIssue(issues, "ref.mismatch", source.path, "scene_ref", "infrastructure task must reference a scene document");
  else {
    if (readString(sceneSource.content, "region_node_id") !== nodeId) addIssue(issues, "ref.mismatch", source.path, "scene_ref", `scene must belong to region node ${nodeId}`);
    if (readString(sceneSource.content, "chapter_segment_id") !== segmentId) addIssue(issues, "ref.mismatch", source.path, "scene_ref", `scene must belong to chapter segment ${segmentId}`);
  }

  for (const [index, exposure] of readObjectArray(source.content, "language_exposure").entries()) {
    const wordId = readString(exposure, "word_id");
    if (!wordIds.has(wordId)) addIssue(issues, "ref.missing", source.path, `language_exposure[${index}].word_id`, `unknown word ${wordId}`);
  }

  const patchIds = new Set(sources.filter((item) => item.kind === "region").flatMap((item) => readObjectArray(readNestedObject(item.content, ["meaningful_material_patch_records"]), "records")).map((patch) => readString(patch, "patch_id")));
  const referencedPatches = [
    ...readStringArray(source.content, "material_patch_refs"),
    ...readObjectArray(source.content, "result_modes").map((mode) => readString(mode, "patch_record_ref")).filter(Boolean),
  ];
  for (const [index, patchId] of referencedPatches.entries()) {
    if (!patchIds.has(patchId)) addIssue(issues, "ref.missing", source.path, `material_patch_refs[${index}]`, `unknown material patch record ${patchId}`);
  }

  if (node) {
    const authoredEntry = new Set(readStringArray(source.content, "entry_guard_any"));
    const authoritativeEntry = new Set(guardStrings(readObject(node, "entry_condition")));
    if (!sameStringSet(authoredEntry, authoritativeEntry)) addIssue(issues, "ref.mismatch", source.path, "entry_guard_any", "task entry guards must equal the region node entry condition");
  }
  if (region) {
    const guardedOutbound = readObjectArray(region, "connections")
      .filter((connection) => readString(connection, "from") === nodeId)
      .flatMap((connection) => guardStrings(readObject(connection, "traversal")));
    const authoredExit = new Set(readStringArray(source.content, "exit_guard_any"));
    if (!sameStringSet(authoredExit, new Set(guardedOutbound))) addIssue(issues, "ref.mismatch", source.path, "exit_guard_any", "task exit guards must equal guarded outbound region traversal predicates");
  }
  if (taskId === "ch01_length_cistern") {
    validateCisternTaskReferences(source, sources, sceneSource, chapter, region, issues);
  }
  if (taskId === "ch01_den_bypass") {
    validateDenBypassTaskReferences(source, sources, sceneSource, segment, region, issues);
  }
  if (taskId === "ch01_return_flow") validateReturnFlowTaskReferences(source, sources, sceneSource, region, issues);
}

function validateReturnFlowTaskReferences(source: CompiledSource, sources: readonly CompiledSource[], sceneSource: CompiledSource | undefined, region: ContentObject | undefined, issues: ContentIssue[]): void {
  const targets = sceneSource ? readObjectArray(sceneSource.content, "targets").map(x => readString(x, "target_id")) : [];
  const sceneTargets=sceneSource?readObjectArray(sceneSource.content,"targets"):[]; const indicator=sceneTargets.find(x=>readString(x,"target_id")==="return_flow.inert_force_indicator");
  if (!sceneSource || readString(sceneSource.content, "scene_id") !== "scene.valley.return_channel" || readString(indicator??{},"target_kind")!=="inert_return_flow_mechanism" || !sameStringArray(targets, ["return_flow.inert_force_indicator", "return_flow.overflow_gate", "return_flow.mud_blockage", "return_flow.old_channel", "return_flow.split_flow_gauge", "return_flow.return_spout"])) addIssue(issues, "task.return_flow_scene", source.path, "scene_ref", "N07 scene identity and six targets must remain canonical");
  const ecology = resolveReferencedSource(source, readString(source.content, "ecology_ref"), sources), graph = resolveReferencedSource(source, readString(source.content, "evidence_graph_ref"), sources);
  const event = ecology?.kind === "ecology" ? readObjectArray(ecology.content, "events").find(x => readString(x, "event_id") === "wildlife_return_after_flow") : undefined;
  if (!ecology || ecology.kind !== "ecology" || !event || !sameStringArray(readStringArray(readObject(event, "trigger"), "all"), ["settlement_supply_stable == true", "wet_meadow_restored == true"]) || event.persistent_write !== null || event.attack_qualification_evidence !== false || event.attack_unlock !== false) addIssue(issues, "task.return_flow_ecology", source.path, "ecology_ref", "N07 ecology return event must be typed, zero-attack and nonpersistent");
  if (!graph || graph.kind !== "attack_signatures") addIssue(issues, "task.return_flow_wawa", source.path, "evidence_graph_ref", "N07 must reference the authoritative attack evidence graph source");
  else { const graphContract=readObjectArray(graph.content,"prerequisite_graphs").find(x=>readString(x,"graph_id")==="attack.water.forceful_motion.prerequisite_graph"), node=graphContract?readObjectArray(graphContract,"required_nodes").find(x=>readString(x,"node_id")==="use.intensity.inert"):undefined; if(!node || readString(node,"evidence_type")!=="noncombat_intensity" || readString(node,"concept")!=="word.wawa" || readString(node,"source_object_class")!=="inert_return_flow_mechanism" || readNumber(node,"minimum")!==1 || readNumber(node,"max_hint_level")!==1) addIssue(issues,"task.return_flow_wawa",source.path,"evidence_graph_ref","authoritative inert wawa graph node is invalid"); }
  if (region) { const writer=readNestedObject(region,["event_commit_points","return_flow_committed"]), writes=readObject(writer,"atomic_writes"), contract=readObject(region,"contracts"); if (readString(writer,"owner")!=="ch01_return_flow" || writes.settlement_supply_stable!==true || writes.wet_meadow_restored!==true || Object.keys(writes).length!==2 || !sameStringArray(readStringArray(writer,"atomic_patch_records"),["patch.valley.return_flow.v0.1"]) || contract.zero_attack_mainline!==true) addIssue(issues,"task.return_flow_region",source.path,"completion","N07 region commit and zero-attack contract are invalid"); }
  const chapter=sources.find(item=>item.kind==="chapter"); const chapterContracts=chapter?readObject(chapter.content,"prologue_contract"):{}; if(readNumber(chapterContracts,"mandatory_combat_encounters")!==0 || readString(chapterContracts,"formal_attack_first_validation_target")!=="safe_range_inert_targets") addIssue(issues,"task.return_flow_zero_attack",source.path,"chapter_flow_id","N07 must remain before zero-combat safe-range-only attack validation");
  const cistern=sources.find(item=>item.kind==="scene"&&readString(item.content,"scene_id")==="scene.valley.high_cistern"), settlement=sources.find(item=>item.kind==="scene"&&readString(item.content,"scene_id")==="scene.valley.settlement");
  const cisternExit=cistern?readObjectArray(cistern.content,"exits").find(x=>readString(x,"exit_id")==="cistern.to_return_channel"):undefined, settlementInbound=settlement?readObjectArray(settlement.content,"inbound_route_refs").find(x=>readString(x,"inbound_ref_id")==="settlement.inbound_from_return"):undefined;
  if(!cisternExit || readString(cisternExit,"target_scene_id")!=="scene.valley.return_channel" || readString(cisternExit,"target_entrance_id")!=="return.from_cistern" || !settlementInbound || readString(settlementInbound,"source_scene_id")!=="scene.valley.return_channel" || readString(settlementInbound,"source_exit_id")!=="return.to_settlement" || readString(settlementInbound,"entrance_id")!=="settlement.from_return") addIssue(issues,"task.return_flow_topology",source.path,"scene_ref","N05 -> N07 -> N02 direct topology is noncanonical");
  if(sceneSource){const preserves=new Set(readStringArray(readObject(sceneSource.content,"recovery"),"preserves")); for(const required of ["survival_state","life_state","corpse_ledger","processing_ledger"]){if(!preserves.has(required))addIssue(issues,"task.return_flow_recovery",source.path,"scene_ref",`N07 recovery must preserve ${required}`);} const taskRef=readObjectArray(sceneSource.content,"task_refs").find(x=>readString(x,"task_id")==="ch01_return_flow"); if(!taskRef || !sameStringArray(readStringArray(taskRef,"objective_ids"),["return_flow.settlement_delivery","return_flow.wet_meadow"])) addIssue(issues,"task.return_flow_scene",source.path,"scene_ref","N07 task objectives are noncanonical");}
}

function validateDenBypassTaskReferences(
  source: CompiledSource,
  sources: readonly CompiledSource[],
  sceneSource: CompiledSource | undefined,
  segment: ContentObject | undefined,
  region: ContentObject | undefined,
  issues: ContentIssue[],
): void {
  if (!segment || !readStringArray(segment, "optional_task_ids").includes("ch01_den_bypass")) {
    addIssue(issues, "task.den_optional_only", source.path, "chapter_segment_id", "N06 den bypass must remain an optional chapter task");
  }
  if (sceneSource) {
    const size = readObject(sceneSource.content, "size_tiles");
    if (readString(sceneSource.content, "scene_id") !== "scene.valley.den_bypass" || readNumber(size, "width") !== 28 || readNumber(size, "height") !== 28) {
      addIssue(issues, "task.den_scene_contract", source.path, "scene_ref", "N06 must remain canonical scene.valley.den_bypass at 28x28 tiles");
    }
    const exitIds = new Set(readObjectArray(sceneSource.content, "exits").map((entry) => readString(entry, "exit_id")));
    const inboundIds = new Set(readObjectArray(sceneSource.content, "inbound_route_refs").map((entry) => readString(entry, "inbound_ref_id")));
    if (!exitIds.has("den.to_service") || !exitIds.has("den.to_cistern") ||
        !inboundIds.has("den.inbound_from_service") || !inboundIds.has("den.inbound_from_cistern")) {
      addIssue(issues, "task.den_bidirectional_topology", source.path, "scene_ref", "N06 requires explicit service and cistern inbound/outbound references");
    }
  }
  const serviceScene = sources.find((item) => item.kind === "scene" && readString(item.content, "scene_id") === "scene.valley.service_channel");
  const cisternScene = sources.find((item) => item.kind === "scene" && readString(item.content, "scene_id") === "scene.valley.high_cistern");
  const serviceDirectExit = serviceScene ? readObjectArray(serviceScene.content, "exits").find((entry) => readString(entry, "exit_id") === "service.to_high_cistern") : undefined;
  const serviceDenExit = serviceScene ? readObjectArray(serviceScene.content, "exits").find((entry) => readString(entry, "exit_id") === "service.to_den_bypass") : undefined;
  const cisternDenExit = cisternScene ? readObjectArray(cisternScene.content, "exits").find((entry) => readString(entry, "exit_id") === "cistern.to_den_bypass") : undefined;
  if (!serviceDirectExit || readString(serviceDirectExit, "target_scene_id") !== "scene.valley.high_cistern" || readString(serviceDirectExit, "target_entrance_id") !== "cistern.from_service") {
    addIssue(issues, "task.den_preserve_direct_mainline", source.path, "scene_ref", "N04 service.to_high_cistern must remain the direct N05 mainline edge");
  }
  if (!serviceDenExit || readString(serviceDenExit, "target_scene_id") !== "scene.valley.den_bypass" ||
      !cisternDenExit || readString(cisternDenExit, "target_scene_id") !== "scene.valley.den_bypass") {
    addIssue(issues, "task.den_bidirectional_topology", source.path, "scene_ref", "optional N06 requires direct scene references from N04 and N05");
  }
  if (region) {
    const optionalNodes = new Set(readStringArray(readObject(region, "route_completion_contract"), "optional_nodes"));
    if (!optionalNodes.has("valley.den_bypass")) {
      addIssue(issues, "task.den_optional_only", source.path, "region_node_id", "valley.den_bypass must remain optional in the required loop");
    }
    const writer = readNestedObject(region, ["event_commit_points", "non_destructive_den_route_committed"]);
    if (readString(writer, "owner") !== "ch01_den_bypass" || readNestedObject(writer, ["atomic_writes"]).den_route_open !== true ||
        !readStringArray(writer, "forbidden_writes").includes("fox_den_intact")) {
      addIssue(issues, "task.den_independent_commit", source.path, "completion", "den_route_open must commit independently without writing fox_den_intact");
    }
  }
  const ecologySource = resolveReferencedSource(source, readString(source.content, "ecology_ref"), sources);
  if (!ecologySource || ecologySource.kind !== "ecology" || readString(ecologySource.content, "ecology_id") !== "valley_prologue") {
    addIssue(issues, "task.den_ecology_ref", source.path, "ecology_ref", "N06 must reference the authoritative valley ecology source");
  }
}

function validateCisternTaskReferences(
  source: CompiledSource,
  sources: readonly CompiledSource[],
  sceneSource: CompiledSource | undefined,
  chapter: ContentObject | undefined,
  region: ContentObject | undefined,
  issues: ContentIssue[],
): void {
  const binding = readObject(source.content, "capacity_milestone_binding");
  const bindingSource = resolveReferencedSource(source, readString(binding, "source_ref"), sources);
  if (!bindingSource || bindingSource.kind !== "chapter" || bindingSource.content !== chapter) {
    addIssue(issues, "task.cistern_capacity_ref", source.path, "capacity_milestone_binding.source_ref", "capacity milestone must reference the authoritative chapter contract");
  } else {
    const milestoneId = readString(binding, "milestone_id");
    const milestone = readObjectArray(readObject(bindingSource.content, "capacity_progression"), "milestones")
      .find((candidate) => readString(candidate, "milestone_id") === milestoneId);
    if (!milestone) addIssue(issues, "task.cistern_capacity_ref", source.path, "capacity_milestone_binding.milestone_id", `unknown capacity milestone ${milestoneId}`);
    else if (readString(milestone, "unique_writer_event") !== readString(binding, "writer_event")) {
      addIssue(issues, "task.cistern_capacity_ref", source.path, "capacity_milestone_binding.writer_event", "capacity writer must match the authoritative chapter milestone");
    }
  }

  if (sceneSource) {
    const size = readObject(sceneSource.content, "size_tiles");
    if (readString(sceneSource.content, "scene_id") !== "scene.valley.high_cistern" || readNumber(size, "width") !== 30 || readNumber(size, "height") !== 48) {
      addIssue(issues, "task.cistern_scene_contract", source.path, "scene_ref", "high cistern scene must remain canonical scene.valley.high_cistern at 30x48 tiles");
    }
    const inbound = readObjectArray(sceneSource.content, "inbound_route_refs")
      .find((route) => readString(route, "inbound_ref_id") === "cistern.inbound_from_service");
    const serviceScene = sources.find((item) => item.kind === "scene" && readString(item.content, "scene_id") === "scene.valley.service_channel");
    const serviceExit = serviceScene ? readObjectArray(serviceScene.content, "exits").find((exit) => readString(exit, "exit_id") === "service.to_high_cistern") : undefined;
    if (!inbound || !serviceExit || readString(serviceExit, "target_scene_id") !== "scene.valley.high_cistern" || readString(serviceExit, "target_entrance_id") !== "cistern.from_service") {
      addIssue(issues, "task.cistern_direct_inbound", source.path, "scene_ref", "N04 service.to_high_cistern must directly target the canonical N05 entrance");
    }
  }

  if (region) {
    const states = new Set(readObjectArray(region, "state_registry").map((state) => readString(state, "state_id")));
    const writer = readNestedObject(region, ["event_commit_points", "cistern_world_transition_committed"]);
    const writes = readObject(writer, "atomic_writes");
    for (const flag of ["high_cistern_reconnected", "upper_channel_available", "exit_ladder_lowered"]) {
      if (!states.has(flag) || writes[flag] !== true) addIssue(issues, "task.cistern_region_commit", source.path, "completion.world_transition", `${flag} must be registered and atomically committed by the authoritative region event`);
    }
  }
}

function guardStrings(contract: ContentObject): string[] {
  const predicate = readString(contract, "predicate");
  if (predicate) return [predicate];
  return readStringArray(contract, "any");
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
function validateSceneSource(source: CompiledSource, issues: ContentIssue[]): void {
  validateArrayIds(source, "entrances", "entrance_id", issues);
  validateArrayIds(source, "exits", "exit_id", issues);
  validateArrayIds(source, "targets", "target_id", issues);
  validateArrayIds(source, "interactions", "interaction_id", issues);
  validateArrayIds(source, "route_objectives", "objective_id", issues);
  validateArrayIds(source, "routes", "route_id", issues);
  validateArrayIds(source, "material_patches", "patch_id", issues);
  validateArrayIds(source, "npcs", "npc_id", issues, false);
  validateArrayIds(source, "facilities", "facility_id", issues, false);
  validateArrayIds(source, "tasks", "task_id", issues, false);
  validateArrayIds(source, "task_refs", "task_id", issues, false);
  validateArrayIds(source, "trade_entries", "trade_entry_id", issues, false);
  validateArrayIds(source, "inbound_route_refs", "inbound_ref_id", issues, false);
  validateArrayIds(source, "soft_failure_recoveries", "failure_id", issues, false);
  const sceneId = readString(source.content, "scene_id");
  if (!sceneId.startsWith("scene.")) addIssue(issues, "scene.id", source.path, "scene_id", "scene_id must start with scene.");
  if (readNumber(source.content, "tile_size_px") !== 16) addIssue(issues, "scene.tile_size", source.path, "tile_size_px", "scene tile size must be exactly 16 logical pixels");
  const size = readObject(source.content, "size_tiles");
  for (const field of ["width", "height"] as const) {
    const value = readNumber(size, field);
    if (value === null || !Number.isInteger(value) || value <= 0) addIssue(issues, "scene.size", source.path, `size_tiles.${field}`, "scene dimension must be a positive integer tile count");
  }
  const collisionRows = readStringArray(source.content, "collision_rows_top_down");
  const width = readNumber(size, "width");
  const height = readNumber(size, "height");
  if (height !== null && collisionRows.length !== height) {
    addIssue(issues, "scene.collision_height", source.path, "collision_rows_top_down", `expected ${height} collision rows, received ${collisionRows.length}`);
  }
  collisionRows.forEach((row, index) => {
    if (width !== null && row.length !== width) addIssue(issues, "scene.collision_width", source.path, `collision_rows_top_down[${index}]`, `expected row width ${width}, received ${row.length}`);
    if (/[^.#]/u.test(row)) addIssue(issues, "scene.collision_symbol", source.path, `collision_rows_top_down[${index}]`, "collision row may contain only . and #");
  });
  validateDenWildlifeSpatial(source, collisionRows, width, height, issues);
  validateSceneStaticReachability(source, collisionRows, width, height, issues);

  const entrances = readObjectArray(source.content, "entrances");
  const exits = readObjectArray(source.content, "exits");
  if (entrances.length === 0) addIssue(issues, "scene.entrance_required", source.path, "entrances", "at least one entrance is required");
  if (exits.length === 0) addIssue(issues, "scene.exit_required", source.path, "exits", "at least one exit is required");
  const entranceIds = new Set(entrances.map((entry) => readString(entry, "entrance_id")));
  const exitIds = new Set(exits.map((entry) => readString(entry, "exit_id")));
  const targetIds = new Set(readObjectArray(source.content, "targets").map((target) => readString(target, "target_id")));
  const objectiveIds = new Set(readObjectArray(source.content, "route_objectives").map((objective) => readString(objective, "objective_id")));
  const interactions = readObjectArray(source.content, "interactions");
  const interactionIds = new Set(interactions.map((interaction) => readString(interaction, "interaction_id")));
  const npcs = readObjectArray(source.content, "npcs");
  const npcIds = new Set(npcs.map((npc) => readString(npc, "npc_id")));
  const facilities = readObjectArray(source.content, "facilities");
  const facilityIds = new Set(facilities.map((facility) => readString(facility, "facility_id")));
  const tasks = readObjectArray(source.content, "tasks");
  const taskIds = new Set(tasks.map((task) => readString(task, "task_id")));
  if (!entrances.some((entry) => entry.recovery_entry === true)) addIssue(issues, "scene.recovery_entrance_missing", source.path, "entrances", "at least one entrance must declare recovery_entry: true");
  for (const [index, interaction] of interactions.entries()) {
    const target = readString(interaction, "target_id");
    if (!targetIds.has(target)) addIssue(issues, "ref.missing", source.path, `interactions[${index}].target_id`, `unknown scene target ${target}`);
    const npcId = readString(interaction, "npc_id");
    const facilityId = readString(interaction, "facility_id");
    const taskId = readString(interaction, "task_id");
    if (npcId && !npcIds.has(npcId)) addIssue(issues, "ref.missing", source.path, `interactions[${index}].npc_id`, `unknown scene NPC ${npcId}`);
    if (facilityId && !facilityIds.has(facilityId)) addIssue(issues, "ref.missing", source.path, `interactions[${index}].facility_id`, `unknown scene facility ${facilityId}`);
    if (taskId && !taskIds.has(taskId)) addIssue(issues, "ref.missing", source.path, `interactions[${index}].task_id`, `unknown scene task ${taskId}`);
  }
  for (const [index, npc] of npcs.entries()) {
    for (const [refIndex, interactionId] of readStringArray(npc, "interaction_ids").entries()) {
      if (!interactionIds.has(interactionId)) addIssue(issues, "ref.missing", source.path, `npcs[${index}].interaction_ids[${refIndex}]`, `unknown interaction ${interactionId}`);
    }
  }
  for (const [index, facility] of facilities.entries()) {
    const targetId = readString(facility, "target_id");
    if (!targetIds.has(targetId)) addIssue(issues, "ref.missing", source.path, `facilities[${index}].target_id`, `unknown scene target ${targetId}`);
    for (const [refIndex, interactionId] of readStringArray(facility, "interaction_ids").entries()) {
      if (!interactionIds.has(interactionId)) addIssue(issues, "ref.missing", source.path, `facilities[${index}].interaction_ids[${refIndex}]`, `unknown interaction ${interactionId}`);
    }
    if (facility.public_relief === true && facility.economy_eligible !== false) {
      addIssue(issues, "scene.public_relief_trade_forbidden", source.path, `facilities[${index}].economy_eligible`, "public relief facilities must be economy-ineligible");
    }
  }
  for (const [index, task] of tasks.entries()) {
    const npcId = readString(task, "assignment_npc_id");
    if (!npcIds.has(npcId)) addIssue(issues, "ref.missing", source.path, `tasks[${index}].assignment_npc_id`, `unknown assignment NPC ${npcId}`);
    for (const [refIndex, objectiveId] of readStringArray(task, "objective_ids").entries()) {
      if (!objectiveIds.has(objectiveId)) addIssue(issues, "ref.missing", source.path, `tasks[${index}].objective_ids[${refIndex}]`, `unknown route objective ${objectiveId}`);
    }
    for (const [refIndex, interactionId] of readStringArray(task, "interaction_ids").entries()) {
      if (!interactionIds.has(interactionId)) addIssue(issues, "ref.missing", source.path, `tasks[${index}].interaction_ids[${refIndex}]`, `unknown interaction ${interactionId}`);
    }
    if (sceneId === "scene.valley.settlement") {
      if (task.nonviolent !== true || task.magic_required !== false) {
        addIssue(issues, "scene.orientation_job_contract", source.path, `tasks[${index}]`, "settlement orientation jobs must be explicitly nonviolent and must not require magic");
      }
      const reward = readObject(task, "reward");
      if (reward.claim_once !== true || reward.receipt_required !== true) {
        addIssue(issues, "scene.reward_receipt_required", source.path, `tasks[${index}].reward`, "settlement currency rewards must be claim-once and receipt-backed");
      }
    }
  }
  for (const [index, trade] of readObjectArray(source.content, "trade_entries").entries()) {
    const npcId = readString(trade, "npc_id");
    const interactionId = readString(trade, "interaction_id");
    if (!npcIds.has(npcId)) addIssue(issues, "ref.missing", source.path, `trade_entries[${index}].npc_id`, `unknown scene NPC ${npcId}`);
    if (!interactionIds.has(interactionId)) addIssue(issues, "ref.missing", source.path, `trade_entries[${index}].interaction_id`, `unknown interaction ${interactionId}`);
    if (trade.scene_defines_catalog_or_prices !== false) addIssue(issues, "scene.trade_truth_duplicated", source.path, `trade_entries[${index}].scene_defines_catalog_or_prices`, "scene trade entries must defer catalogs and prices to the economy source");
  }
  const routes = readObjectArray(source.content, "routes");
  if (!routes.some((route) => readString(route, "route_kind") === "non_magic")) addIssue(issues, "scene.non_magic_route_missing", source.path, "routes", "at least one route must declare route_kind: non_magic");
  for (const [index, route] of routes.entries()) {
    const entrance = readString(route, "from_entrance_id");
    const exit = readString(route, "to_exit_id");
    if (!entranceIds.has(entrance)) addIssue(issues, "ref.missing", source.path, `routes[${index}].from_entrance_id`, `unknown entrance ${entrance}`);
    if (!exitIds.has(exit)) addIssue(issues, "ref.missing", source.path, `routes[${index}].to_exit_id`, `unknown exit ${exit}`);
    for (const [objectiveIndex, objective] of readStringArray(route, "objective_ids").entries()) {
      if (!objectiveIds.has(objective)) addIssue(issues, "ref.missing", source.path, `routes[${index}].objective_ids[${objectiveIndex}]`, `unknown route objective ${objective}`);
    }
  }
  const recoveryEntrance = readNestedString(source.content, ["recovery", "entry_entrance_id"]);
  if (!entranceIds.has(recoveryEntrance)) addIssue(issues, "ref.missing", source.path, "recovery.entry_entrance_id", `unknown recovery entrance ${recoveryEntrance}`);
  const recoverySeconds = readNestedNumber(source.content, ["recovery", "maximum_softlock_recovery_seconds"]);
  if (recoverySeconds === null || recoverySeconds <= 0 || recoverySeconds > 60) addIssue(issues, "scene.recovery_duration", source.path, "recovery.maximum_softlock_recovery_seconds", "scene softlock recovery must be available within 60 seconds");
}

function validateDenWildlifeSpatial(
  source: CompiledSource,
  collisionRows: readonly string[],
  width: number | null,
  height: number | null,
  issues: ContentIssue[],
): void {
  if (readString(source.content, "scene_id") !== "scene.valley.den_bypass") return;
  const bindings = readObjectArray(source.content, "wildlife_bindings").filter((item) => readString(item, "entity_id") === "wildlife.fox.den");
  if (bindings.length !== 1) {
    addIssue(issues, "scene.fox_spatial_binding", source.path, "wildlife_bindings", `N06 requires exactly one canonical fox spatial binding; received ${bindings.length}`);
    return;
  }
  const binding = bindings[0]!;
  const targets = new Map(readObjectArray(source.content, "targets").map((target) => [readString(target, "target_id"), readString(target, "target_kind")]));
  for (const targetId of ["den.noise_surface", "den.staff_marker", "den.old_service_latch", "den.upper_dig_line"]) {
    const target = readObjectArray(source.content, "targets").find((candidate) => readString(candidate, "target_id") === targetId);
    const point = target?.interaction_point_tiles;
    if (!Array.isArray(point) || point.length !== 2 || !point.every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 28)) addIssue(issues, "scene.wildlife_interaction_point", source.path, `targets.${targetId}.interaction_point_tiles`, `${targetId} requires one in-bounds integer interaction point`);
  }
  const expectedTargets = [
    ["spawn_target_id", "wildlife_home_anchor"],
    ["escape_target_id", "real_wildlife_escape_exit"],
    ["warning_target_id", "wildlife_warning_zone"],
    ["protected_structure_target_id", "protected_wildlife_structure"],
  ] as const;
  for (const [field, kind] of expectedTargets) {
    const id = readString(binding, field);
    if (!id || targets.get(id) !== kind) addIssue(issues, "scene.fox_spatial_target", source.path, `wildlife_bindings.${field}`, `${field} must reference one ${kind} target`);
  }
  if (width === null || height === null || !Number.isInteger(width) || !Number.isInteger(height) || collisionRows.length !== height || collisionRows.some((row) => row.length !== width)) return;
  const spawn = binding.spawn_position_tiles;
  let spawnPoint: { x: number; y: number; row: number } | null = null;
  if (!Array.isArray(spawn) || spawn.length !== 2 || !spawn.every((value) => typeof value === "number" && Number.isInteger(value))) {
    addIssue(issues, "scene.fox_spawn_bounds", source.path, "wildlife_bindings.spawn_position_tiles", "fox spawn must be an integer pair inside N06");
  } else {
    const x = spawn[0] as number; const y = spawn[1] as number; const row = height - y - 1; const supportRow = row + 1;
    if (x < 0 || x >= width || y < 0 || y >= height || row < 0 || supportRow >= height || collisionRows[row]?.[x] !== "." || collisionRows[supportRow]?.[x] !== "#") {
      addIssue(issues, "scene.fox_spawn_bounds", source.path, "wildlife_bindings.spawn_position_tiles", "fox spawn must occupy an empty tile with collision support directly below");
    } else spawnPoint = { x, y, row };
  }
  type Rect = { x: number; y: number; width: number; height: number };
  const rects = new Map<string, Rect>();
  for (const field of ["escape_bounds_tiles", "warning_bounds_tiles", "den_bounds_tiles"] as const) {
    const raw = readObject(binding, field); const x = readNumber(raw, "x"), y = readNumber(raw, "y"), rectWidth = readNumber(raw, "width"), rectHeight = readNumber(raw, "height");
    if ([x, y, rectWidth, rectHeight].some((value) => value === null || !Number.isInteger(value)) || x === null || y === null || rectWidth === null || rectHeight === null || x < 0 || y < 0 || rectWidth <= 0 || rectHeight <= 0 || x + rectWidth > width || y + rectHeight > height) {
      addIssue(issues, "scene.fox_spatial_bounds", source.path, `wildlife_bindings.${field}`, `${field} must be a positive integer rectangle inside N06`);
    } else rects.set(field, { x, y, width: rectWidth, height: rectHeight });
  }
  const overlaps = (left: Rect, right: Rect): boolean => left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
  const contains = (rect: Rect, point: { x: number; y: number }): boolean => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
  const escape = rects.get("escape_bounds_tiles"); const den = rects.get("den_bounds_tiles");
  if (escape && den && overlaps(escape, den)) addIssue(issues, "scene.fox_escape_geometry", source.path, "wildlife_bindings.escape_bounds_tiles", "fox escape bounds must not overlap the protected den bounds");
  if (escape && spawnPoint && contains(escape, spawnPoint)) addIssue(issues, "scene.fox_escape_geometry", source.path, "wildlife_bindings.escape_bounds_tiles", "fox escape bounds must not contain the home spawn");
  if (escape && spawnPoint) {
    const reachable = floodEmptyTiles(collisionRows, width, height, spawnPoint.x, spawnPoint.row);
    let touchesReachable = false;
    for (let authoredY = escape.y; authoredY < escape.y + escape.height && !touchesReachable; authoredY += 1) for (let x = escape.x; x < escape.x + escape.width; x += 1) {
      if (reachable.has(`${x},${height - authoredY - 1}`)) { touchesReachable = true; break; }
    }
    if (!touchesReachable) addIssue(issues, "scene.fox_escape_unreachable", source.path, "wildlife_bindings.escape_bounds_tiles", "fox escape AABB must have an empty-tile route from the home spawn");
  }
}

function validateSceneStaticReachability(
  source: CompiledSource,
  collisionRows: readonly string[],
  width: number | null,
  height: number | null,
  issues: ContentIssue[],
): void {
  if (width === null || height === null || !Number.isInteger(width) || !Number.isInteger(height) || collisionRows.length !== height || collisionRows.some((row) => row.length !== width)) return;
  const starts: Array<{ readonly id: string; readonly x: number; readonly row: number }> = [];
  for (const [index, entrance] of readObjectArray(source.content, "entrances").entries()) {
    const spawn = entrance.spawn_tile;
    if (!Array.isArray(spawn) || spawn.length !== 2 || !spawn.every((value) => typeof value === "number" && Number.isInteger(value))) {
      addIssue(issues, "scene.spawn_tile", source.path, `entrances[${index}].spawn_tile`, "spawn tile must be an integer [x, y] pair");
      continue;
    }
    const x = spawn[0] as number;
    const authoredY = spawn[1] as number;
    const supportRow: number = height - authoredY;
    const standingRow = supportRow - 1;
    if (x < 0 || x >= width || standingRow < 0 || supportRow >= height || collisionRows[standingRow]?.[x] !== "." || collisionRows[supportRow]?.[x] !== "#") {
      addIssue(issues, "scene.entrance_unsupported", source.path, `entrances[${index}].spawn_tile`, "entrance must stand in an empty tile directly above collision support");
      continue;
    }
    starts.push({ id: readString(entrance, "entrance_id"), x, row: standingRow });
  }
  const reachableByStart = starts.map((start) => ({ start, cells: floodEmptyTiles(collisionRows, width, height, start.x, start.row) }));
  for (const [index, exit] of readObjectArray(source.content, "exits").entries()) {
    const rect = readObject(exit, "trigger_rect_tiles");
    const x = readNumber(rect, "x");
    const y = readNumber(rect, "y");
    const rectWidth = readNumber(rect, "width");
    const rectHeight = readNumber(rect, "height");
    if ([x, y, rectWidth, rectHeight].some((value) => value === null || !Number.isInteger(value)) || x === null || y === null || rectWidth === null || rectHeight === null || rectWidth <= 0 || rectHeight <= 0 || x < 0 || y < 0 || x + rectWidth > width || y + rectHeight > height) {
      addIssue(issues, "scene.exit_bounds", source.path, `exits[${index}].trigger_rect_tiles`, "exit trigger must be a positive integer rectangle inside the scene");
      continue;
    }
    const topRow = height - y - rectHeight;
    const bottomRow = height - y - 1;
    const targetKeys = new Set<string>();
    for (let row = topRow; row <= bottomRow; row += 1) {
      for (let column = x; column < x + rectWidth; column += 1) {
        if (collisionRows[row]?.[column] === ".") targetKeys.add(`${column},${row}`);
      }
    }
    const reachable = targetKeys.size > 0 && reachableByStart.some(({ cells }) => [...targetKeys].some((key) => cells.has(key)));
    if (!reachable) addIssue(issues, "scene.exit_unreachable", source.path, `exits[${index}].trigger_rect_tiles`, "no supported entrance has a static empty-tile route to this exit trigger");
  }
}

function floodEmptyTiles(rows: readonly string[], width: number, height: number, startX: number, startRow: number): ReadonlySet<string> {
  const visited = new Set<string>();
  const queue: Array<readonly [number, number]> = [[startX, startRow]];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, row] = queue[cursor]!;
    const key = `${x},${row}`;
    if (visited.has(key) || x < 0 || x >= width || row < 0 || row >= height || rows[row]?.[x] !== ".") continue;
    visited.add(key);
    queue.push([x - 1, row], [x + 1, row], [x, row - 1], [x, row + 1]);
  }
  return visited;
}
function validateSceneReferences(source: CompiledSource, sources: readonly CompiledSource[], indexes: MutableIndexes, issues: ContentIssue[]): void {
  if (readString(source.content, "scene_id") === "scene.valley.old_mine_threshold") {
    validateOldMineThresholdSource(source, sources, issues);
  }
  if (readString(source.content, "scene_id") === "scene.valley.den_bypass") {
    const ecology = resolveReferencedSource(source, readString(source.content, "ecology_ref"), sources);
    const fox = ecology?.kind === "ecology" ? readObjectArray(ecology.content, "entities").find((entity) => readString(entity, "entity_id") === "wildlife.fox.den") : undefined;
    const binding = readObjectArray(source.content, "wildlife_bindings").filter((item) => readString(item, "entity_id") === "wildlife.fox.den")[0];
    if (!fox || !binding || readString(binding, "spawn_target_id") !== readString(fox, "spawn_anchor") || readString(binding, "escape_target_id") !== readString(fox, "real_escape_exit") || readString(binding, "warning_target_id") !== readString(fox, "warning_zone_anchor")) {
      addIssue(issues, "scene.fox_ecology_binding", source.path, "wildlife_bindings", "fox spatial target IDs must equal the authoritative ecology anchors");
    }
  }
  const regionId = readString(source.content, "region_id");
  const chapterId = readString(source.content, "chapter_flow_id");
  const segmentId = readString(source.content, "chapter_segment_id");
  const nodeId = readString(source.content, "region_node_id");
  const region = indexes.regions[regionId];
  const chapter = indexes.chapters[chapterId];
  if (!region) addIssue(issues, "ref.missing", source.path, "region_id", `unknown region ${regionId}`);
  if (!chapter) addIssue(issues, "ref.missing", source.path, "chapter_flow_id", `unknown chapter ${chapterId}`);
  const regionNodes = new Map((region ? readObjectArray(region, "nodes") : []).map((node) => [readString(node, "node_id"), node]));
  const node = regionNodes.get(nodeId);
  if (!node) addIssue(issues, "ref.missing", source.path, "region_node_id", `unknown region node ${nodeId}`);
  else {
    if (readString(node, "scene_id") !== readString(source.content, "scene_id")) addIssue(issues, "ref.mismatch", source.path, "scene_id", `region node ${nodeId} declares scene ${readString(node, "scene_id")}`);
    const authoredSize = readObject(source.content, "size_tiles");
    const suggested = node.suggested_size_tiles;
    if (!Array.isArray(suggested) || suggested.length !== 2 || readNumber(authoredSize, "width") !== suggested[0] || readNumber(authoredSize, "height") !== suggested[1]) {
      addIssue(issues, "scene.region_size_mismatch", source.path, "size_tiles", `scene size must equal region node ${nodeId} suggested_size_tiles`);
    }
  }
  const segments = chapter ? readObjectArray(chapter, "segments") : [];
  const segment = segments.find((candidate) => readString(candidate, "segment_id") === segmentId);
  if (!segment) addIssue(issues, "ref.missing", source.path, "chapter_segment_id", `unknown chapter segment ${segmentId}`);
  const declaredTaskIds = new Set(segment ? [
    ...readStringArray(segment, "task_ids"),
    ...readStringArray(segment, "required_task_ids"),
    ...readStringArray(segment, "optional_task_ids"),
  ] : []);
  for (const [index, task] of readObjectArray(source.content, "tasks").entries()) {
    const taskId = readString(task, "task_id");
    if (!declaredTaskIds.has(taskId)) addIssue(issues, "ref.missing", source.path, `tasks[${index}].task_id`, `task ${taskId} is not declared by chapter segment ${segmentId}`);
    const familyId = readString(task, "task_family_id");
    if (segment && familyId !== readString(segment, "task_family_id")) addIssue(issues, "ref.mismatch", source.path, `tasks[${index}].task_family_id`, `chapter segment declares task family ${readString(segment, "task_family_id")}`);
  }
  const regionConnections = region ? readObjectArray(region, "connections") : [];
  for (const [index, exit] of readObjectArray(source.content, "exits").entries()) {
    const targetSceneId = readString(exit, "target_scene_id");
    const targetNodeId = readString(exit, "target_region_node_id");
    if (targetSceneId) {
      const targetScene = indexes.scenes[targetSceneId];
      if (!targetScene) addIssue(issues, "ref.missing", source.path, `exits[${index}].target_scene_id`, `unknown target scene ${targetSceneId}`);
      else {
        const targetEntranceId = readString(exit, "target_entrance_id");
        const targetEntrances = new Set(readObjectArray(targetScene, "entrances").map((entry) => readString(entry, "entrance_id")));
        if (!targetEntrances.has(targetEntranceId)) addIssue(issues, "ref.missing", source.path, `exits[${index}].target_entrance_id`, `unknown target entrance ${targetEntranceId}`);
      }
    } else if (targetNodeId) {
      if (!regionNodes.has(targetNodeId)) addIssue(issues, "ref.missing", source.path, `exits[${index}].target_region_node_id`, `unknown target region node ${targetNodeId}`);
    } else addIssue(issues, "scene.exit_target_required", source.path, `exits[${index}]`, "exit must declare target_scene_id or target_region_node_id");
    const targetNode = targetNodeId || (targetSceneId ? readString(indexes.scenes[targetSceneId] ?? {}, "region_node_id") : "");
    const connection = regionConnections.find((candidate) =>
      (readString(candidate, "from") === nodeId && readString(candidate, "to") === targetNode) ||
      (readString(candidate, "from") === targetNode && readString(candidate, "to") === nodeId)
    );
    if (targetNode && !connection) addIssue(issues, "ref.missing", source.path, `exits[${index}]`, `no authoritative region connection joins ${nodeId} and ${targetNode}`);
    if (connection) {
      const authoritativeGuards = new Set(guardStrings(readObject(connection, "traversal")));
      const authoredGuards = new Set(guardStrings(readObject(exit, "traversal_guard")));
      if (!sameStringSet(authoredGuards, authoritativeGuards)) addIssue(issues, "scene.traversal_guard_mismatch", source.path, `exits[${index}].traversal_guard`, "exit traversal guard must equal the authoritative region connection guard");
    }
  }
  const localEntranceIds = new Set(readObjectArray(source.content, "entrances").map((entry) => readString(entry, "entrance_id")));
  for (const [index, inbound] of readObjectArray(source.content, "inbound_route_refs").entries()) {
    const sourceSceneId = readString(inbound, "source_scene_id");
    const sourceScene = indexes.scenes[sourceSceneId];
    if (!sourceScene) {
      addIssue(issues, "ref.missing", source.path, `inbound_route_refs[${index}].source_scene_id`, `unknown source scene ${sourceSceneId}`);
      continue;
    }
    const sourceExitId = readString(inbound, "source_exit_id");
    const sourceExit = readObjectArray(sourceScene, "exits").find((exit) => readString(exit, "exit_id") === sourceExitId);
    if (!sourceExit) addIssue(issues, "ref.missing", source.path, `inbound_route_refs[${index}].source_exit_id`, `unknown source exit ${sourceExitId}`);
    else {
      const directSceneId = readString(sourceExit, "target_scene_id");
      const targetRegionNodeId = readString(sourceExit, "target_region_node_id");
      const currentSceneId = readString(source.content, "scene_id");
      if (directSceneId !== currentSceneId && targetRegionNodeId !== nodeId) {
        addIssue(issues, "ref.mismatch", source.path, `inbound_route_refs[${index}].source_exit_id`, `source exit does not target scene ${currentSceneId} or region node ${nodeId}`);
      }
    }
    const entranceId = readString(inbound, "entrance_id");
    if (!localEntranceIds.has(entranceId)) addIssue(issues, "ref.missing", source.path, `inbound_route_refs[${index}].entrance_id`, `unknown local entrance ${entranceId}`);
  }
  for (const [index, taskRef] of readObjectArray(source.content, "task_refs").entries()) {
    const taskId = readString(taskRef, "task_id");
    const task = indexes.tasks[taskId];
    if (!task) addIssue(issues, "ref.missing", source.path, `task_refs[${index}].task_id`, `unknown task ${taskId}`);
    const referencedSource = resolveReferencedSource(source, readString(taskRef, "task_ref"), sources);
    if (!referencedSource || referencedSource.kind !== "task") addIssue(issues, "ref.mismatch", source.path, `task_refs[${index}].task_ref`, "task_ref must resolve to a task document");
    else if (readString(referencedSource.content, "task_id") !== taskId) addIssue(issues, "ref.mismatch", source.path, `task_refs[${index}].task_ref`, `task_ref does not declare ${taskId}`);
    if (task) {
      if (readString(task, "region_node_id") !== nodeId || readString(task, "chapter_segment_id") !== segmentId) addIssue(issues, "ref.mismatch", source.path, `task_refs[${index}]`, "scene and task must share region node and chapter segment");
    }
    const objectiveIds = new Set(readObjectArray(source.content, "route_objectives").map((objective) => readString(objective, "objective_id")));
    for (const [objectiveIndex, objectiveId] of readStringArray(taskRef, "objective_ids").entries()) {
      if (!objectiveIds.has(objectiveId)) addIssue(issues, "ref.missing", source.path, `task_refs[${index}].objective_ids[${objectiveIndex}]`, `unknown scene objective ${objectiveId}`);
    }
  }  for (const [index, entry] of readObjectArray(source.content, "trade_entries").entries()) {
    const economyRef = readString(entry, "authoritative_economy_ref");
    const economySource = resolveReferencedSource(source, economyRef, sources);
    if (!economySource || economySource.kind !== "settlement_trade") {
      addIssue(issues, "ref.mismatch", source.path, `trade_entries[${index}].authoritative_economy_ref`, "trade entry must reference the settlement trade authority");
      continue;
    }
    const merchantIds = new Set(readObjectArray(economySource.content, "merchants").map((merchant) => readString(merchant, "id")));
    for (const [merchantIndex, merchantId] of readStringArray(entry, "merchant_ids").entries()) {
      if (!merchantIds.has(merchantId)) addIssue(issues, "ref.missing", source.path, `trade_entries[${index}].merchant_ids[${merchantIndex}]`, `unknown authoritative merchant ${merchantId}`);
    }
  }
  const patchIds = new Set(sources.filter((item) => item.kind === "region").flatMap((item) => readObjectArray(readNestedObject(item.content, ["meaningful_material_patch_records"]), "records")).map((patch) => readString(patch, "patch_id")));
  for (const [index, patch] of readObjectArray(source.content, "material_patches").entries()) {
    const record = readString(patch, "patch_record_ref");
    if (record && !patchIds.has(record)) addIssue(issues, "ref.missing", source.path, `material_patches[${index}].patch_record_ref`, `unknown material patch record ${record}`);
  }
}

function validateOldMineThresholdSource(
  source: CompiledSource,
  sources: readonly CompiledSource[],
  issues: ContentIssue[],
): void {
  const size = readObject(source.content, "size_tiles");
  const entrances = readObjectArray(source.content, "entrances");
  const exits = readObjectArray(source.content, "exits");
  const routes = readObjectArray(source.content, "routes");
  const targets = readObjectArray(source.content, "targets");
  const interactions = readObjectArray(source.content, "interactions");
  const entrance = entrances.find((item) => readString(item, "entrance_id") === "old_mine.from_settlement");
  const exit = exits.find((item) => readString(item, "exit_id") === "old_mine.to_settlement");
  const route = routes.find((item) => readString(item, "route_id") === "old_mine.peaceful_chapter_threshold");
  const target = targets.find((item) => readString(item, "target_id") === "old_mine.threshold_marker");
  const interaction = interactions.find((item) => readString(item, "interaction_id") === "old_mine.inspect_threshold_marker");
  if (readString(source.content, "region_node_id") !== "valley.old_mine_threshold" ||
      readString(source.content, "chapter_segment_id") !== "return_and_safe_range" ||
      readNumber(size, "width") !== 24 || readNumber(size, "height") !== 20 ||
      entrances.length !== 1 || exits.length !== 1 || routes.length !== 1 ||
      !entrance || !exit || !route || !target || !interaction) {
    addIssue(issues, "scene.old_mine_identity", source.path, "scene_id", "old-mine threshold identity, 24x20 geometry, and peaceful route are noncanonical");
  }
  if (readString(exit ?? {}, "target_scene_id") !== "scene.valley.settlement" ||
      readString(exit ?? {}, "target_entrance_id") !== "settlement.from_old_mine" ||
      readString(readObject(exit ?? {}, "traversal_guard"), "predicate") !== "prologue_return_observed == true" ||
      readString(route ?? {}, "route_kind") !== "non_magic" ||
      readString(route ?? {}, "solution_family") !== "peaceful_chapter_transition" ||
      readString(route ?? {}, "from_entrance_id") !== "old_mine.from_settlement" ||
      readString(route ?? {}, "to_exit_id") !== "old_mine.to_settlement" ||
      readString(interaction ?? {}, "target_id") !== "old_mine.threshold_marker" ||
      readString(interaction ?? {}, "verb") !== "inspect_peaceful_chapter_transition" ||
      interaction?.tool_or_magic_required !== false) {
    addIssue(issues, "scene.old_mine_peaceful_exit", source.path, "routes", "old-mine threshold must remain non-magic, returnable, and guarded only by prologue return observation");
  }
  const settlement = sources.find((item) => item.kind === "scene" &&
    readString(item.content, "scene_id") === "scene.valley.settlement");
  const settlementEntrance = settlement && readObjectArray(settlement.content, "entrances")
    .find((item) => readString(item, "entrance_id") === "settlement.from_old_mine");
  const settlementExit = settlement && readObjectArray(settlement.content, "exits")
    .find((item) => readString(item, "exit_id") === "settlement.to_old_mine");
  if (!settlementEntrance || !settlementExit ||
      readString(settlementExit, "target_scene_id") !== "scene.valley.old_mine_threshold" ||
      readString(settlementExit, "target_entrance_id") !== "old_mine.from_settlement" ||
      readString(readObject(settlementExit, "traversal_guard"), "predicate") !== "prologue_return_observed == true") {
    addIssue(issues, "scene.old_mine_topology", source.path, "inbound_route_refs", "N02 and the old-mine threshold require reciprocal authored scene bindings with the return-observed guard");
  }
  const region = sources.find((item) => item.kind === "region" &&
    readString(item.content, "region_id") === "valley_prologue");
  const regionConnections = region ? readObjectArray(region.content, "connections") : [];
  const outbound = regionConnections.find((item) => readString(item, "from") === "valley.settlement" &&
    readString(item, "to") === "valley.old_mine_threshold");
  const inbound = regionConnections.find((item) => readString(item, "from") === "valley.old_mine_threshold" &&
    readString(item, "to") === "valley.settlement");
  const connectionGuard = (item: ContentObject | undefined): string =>
    readString(readObject(item ?? {}, "traversal"), "predicate");
  if (connectionGuard(outbound) !== "prologue_return_observed == true" ||
      connectionGuard(inbound) !== "prologue_return_observed == true") {
    addIssue(issues, "scene.old_mine_region_topology", source.path, "region_node_id", "old-mine region edges must be explicit, reciprocal, and guarded by prologue return observation");
  }
}
function validateSingleWordSource(source: CompiledSource, issues: ContentIssue[]): void {
  validateArrayIds(source, "entries", "id", issues);
  const minimum = readNestedNumber(source.content, ["shared_rules", "minimum_tokens_for_direct_attack"]);
  requireIntegerRange(minimum, 1, 32, source, "shared_rules.minimum_tokens_for_direct_attack", issues);
  for (const [index, entry] of readObjectArray(source.content, "entries").entries()) {
    requireVersion(readString(entry, "entry_version"), source, `entries[${index}].entry_version`, issues);
  }
}

function validateLengthSource(source: CompiledSource, issues: ContentIssue[]): void {
  const classes = readObject(source.content, "length_classes");
  const short = readNestedNumber(classes, ["short", "ratio_to_base"]);
  const normal = readNestedNumber(classes, ["default", "ratio_to_base"]);
  const long = readNestedNumber(classes, ["long", "ratio_to_base"]);
  if (short === null || normal === null || long === null || !(short > 0 && short < normal && normal === 1 && long > normal)) {
    addIssue(issues, "range.length_ladder", source.path, "length_classes", "expected 0 < short < default == 1 < long");
  }
  const snap = readNestedNumber(source.content, ["geometry_contract", "direction_snap_count"]);
  requireIntegerRange(snap, 1, 64, source, "geometry_contract.direction_snap_count", issues);
  for (const [id, value] of Object.entries(readObject(source.content, "element_profiles"))) {
    if (!isContentObject(value)) {
      addIssue(issues, "schema.object", source.path, `element_profiles.${id}`, "profile must be an object");
      continue;
    }
    const base = readNumber(value, "base_length_tiles");
    const longLength = readNumber(value, "long_length_tiles");
    const cap = readNumber(value, "hard_cap_length_tiles");
    if (base === null || base <= 0 || longLength === null || longLength < base || cap === null || cap < longLength) {
      addIssue(issues, "range.geometry", source.path, `element_profiles.${id}`, "expected 0 < base_length <= long_length <= hard_cap_length");
    }
  }
}

function validateAttackSource(source: CompiledSource, issues: ContentIssue[]): void {
  validateArrayIds(source, "prerequisite_graphs", "graph_id", issues);
  validateArrayIds(source, "physics_damage_models", "damage_formula_id", issues);
  validateArrayIds(source, "signatures", "signature_id", issues);
  const minimum = readNestedNumber(source.content, ["contracts", "minimum_meaningful_tokens_for_direct_attack"]);
  requireIntegerRange(minimum, 1, 32, source, "contracts.minimum_meaningful_tokens_for_direct_attack", issues);
  for (const [index, graph] of readObjectArray(source.content, "prerequisite_graphs").entries()) {
    requireVersion(readString(graph, "version"), source, `prerequisite_graphs[${index}].version`, issues);
  }
  for (const [index, signature] of readObjectArray(source.content, "signatures").entries()) {
    requireVersion(readString(signature, "version"), source, `signatures[${index}].version`, issues);
  }
}

function validateLearningProgression(source: CompiledSource, issues: ContentIssue[]): void {
  const transitions = readObject(source.content, "state_transitions");
  if (Object.keys(transitions).length === 0) addIssue(issues, "schema.required", source.path, "state_transitions", "at least one learning transition is required");
  const states = new Set(readStringArray(readObject(source.content, "axes"), "language_state"));
  if (states.size > 0) {
    for (const state of Object.keys(transitions)) {
      if (!states.has(state)) addIssue(issues, "ref.missing", source.path, `state_transitions.${state}`, `transition state is not declared in axes.language_state`);
    }
  }
}

function validateInfrastructureTaskSource(source: CompiledSource, issues: ContentIssue[]): void {
  validateArrayIds(source, "result_modes", "mode_id", issues);
  validateArrayIds(source, "solution_families", "solution_id", issues);
  validateArrayIds(source, "language_exposure", "word_id", issues, false);
  validateArrayIds(source, "grammar_contacts", "token", issues, false);
  validateArrayIds(source, "material_reactions", "material", issues, false);

  for (const field of ["task_id", "task_family_id", "chapter_flow_id", "chapter_segment_id", "region_id", "region_node_id", "scene_ref"] as const) {
    if (!readString(source.content, field)) addIssue(issues, "schema.required", source.path, field, `${field} must be a non-empty string`);
  }

  const goal = readObject(source.content, "world_goal");
  const predicateMode = readString(goal, "predicate_mode");
  if (predicateMode !== "all" && predicateMode !== "any") {
    addIssue(issues, "task.predicate_mode", source.path, "world_goal.predicate_mode", "predicate_mode must be all or any");
  }
  if (readString(goal, "evaluation") !== "world_state_predicates_only" || goal.raw_utterance_string_matching_forbidden !== true) {
    addIssue(issues, "task.world_predicate_authority", source.path, "world_goal", "infrastructure success must read world predicates and forbid raw utterance matching");
  }
  const predicates = readObjectArray(goal, "predicates");
  if (predicates.length === 0) addIssue(issues, "task.predicate_required", source.path, "world_goal.predicates", "at least one world predicate is required");
  reportDuplicates(predicates, "predicate_id", source, "world_goal.predicates", issues);
  for (const [index, predicate] of predicates.entries()) {
    if (!readString(predicate, "expression")) addIssue(issues, "schema.required", source.path, `world_goal.predicates[${index}].expression`, "predicate expression must be non-empty");
  }

  const modes = readObjectArray(source.content, "result_modes");
  const modeIds = new Set(modes.map((mode) => readString(mode, "mode_id")));
  if (!modes.some((mode) => mode.completion_valid === true)) addIssue(issues, "task.completion_mode_missing", source.path, "result_modes", "at least one result mode must be completion-valid");
  for (const [index, mode] of modes.entries()) {
    if (typeof mode.completion_valid !== "boolean" || typeof mode.persists_across_reload !== "boolean") {
      addIssue(issues, "task.mode_boolean", source.path, `result_modes[${index}]`, "completion_valid and persists_across_reload must be boolean");
    }
    const patch = mode.patch_record_ref;
    if (mode.persists_across_reload === true && (typeof patch !== "string" || patch.length === 0)) {
      addIssue(issues, "task.persistent_mode_patch", source.path, `result_modes[${index}].patch_record_ref`, "a persistent result mode requires a material patch record");
    }
    if (mode.persists_across_reload === false && patch !== null) {
      addIssue(issues, "task.transient_mode_patch", source.path, `result_modes[${index}].patch_record_ref`, "a non-persistent result mode must not name a persistent patch record");
    }
  }

  const solutions = readObjectArray(source.content, "solution_families");
  const nonMagicMainline = solutions.filter((solution) => readString(solution, "route_kind") === "non_magic" && solution.mainline === true);
  if (nonMagicMainline.length < 2) addIssue(issues, "task.non_magic_solution_minimum", source.path, "solution_families", "at least two non-magic mainline solutions are required");
  for (const [index, solution] of solutions.entries()) {
    const kind = readString(solution, "route_kind");
    if (kind !== "non_magic" && kind !== "optional_magic") addIssue(issues, "task.solution_kind", source.path, `solution_families[${index}].route_kind`, "route kind must be non_magic or optional_magic");
    const resultMode = readString(solution, "result_mode");
    if (!modeIds.has(resultMode)) addIssue(issues, "ref.missing", source.path, `solution_families[${index}].result_mode`, `unknown result mode ${resultMode}`);
    if (readStringArray(solution, "required_actions").length === 0 || readStringArray(solution, "required_world_predicates").length === 0) {
      addIssue(issues, "task.solution_contract", source.path, `solution_families[${index}]`, "solution requires authored actions and world predicates");
    }
  }

  const completion = readObject(source.content, "completion");
  for (const [index, modeId] of readStringArray(completion, "valid_result_modes").entries()) {
    const mode = modes.find((candidate) => readString(candidate, "mode_id") === modeId);
    if (!mode) addIssue(issues, "ref.missing", source.path, `completion.valid_result_modes[${index}]`, `unknown result mode ${modeId}`);
    else if (mode.completion_valid !== true) addIssue(issues, "ref.mismatch", source.path, `completion.valid_result_modes[${index}]`, `mode ${modeId} is not completion-valid`);
  }
  if (completion.raw_expression_never_read_for_success !== true) addIssue(issues, "task.raw_expression_forbidden", source.path, "completion.raw_expression_never_read_for_success", "completion must explicitly ignore raw expression strings");

  const recovery = readObject(source.content, "recovery");
  const recoverySeconds = readNumber(recovery, "maximum_softlock_recovery_seconds");
  if (recoverySeconds === null || recoverySeconds <= 0 || recoverySeconds > 60) addIssue(issues, "task.recovery_duration", source.path, "recovery.maximum_softlock_recovery_seconds", "softlock recovery must be available within 60 seconds");
  if (readStringArray(recovery, "actions").length === 0 || readStringArray(recovery, "preserves").length === 0) addIssue(issues, "task.recovery_contract", source.path, "recovery", "recovery must declare actions and preserved state");

  const entryGuards = readStringArray(source.content, "entry_guard_any");
  const exitGuards = readStringArray(source.content, "exit_guard_any");
  if (entryGuards.length === 0 || exitGuards.length === 0) addIssue(issues, "task.guard_required", source.path, "entry_guard_any", "infrastructure tasks require authored entry and exit guards");

  if (readString(source.content, "task_id") === "ch01_waterwheel") {
    const expectedModes = ["stopped", "temporary_driven", "structurally_restored"];
    if (expectedModes.some((mode) => !modeIds.has(mode)) || modeIds.size !== expectedModes.length) addIssue(issues, "task.waterwheel_modes", source.path, "result_modes", "waterwheel modes must be stopped, temporary_driven and structurally_restored");
    const temporary = modes.find((mode) => readString(mode, "mode_id") === "temporary_driven");
    const structural = modes.find((mode) => readString(mode, "mode_id") === "structurally_restored");
    if (temporary?.persists_across_reload !== false || structural?.persists_across_reload !== true) addIssue(issues, "task.waterwheel_persistence", source.path, "result_modes", "only structurally_restored may persist across reload");
  }
  if (readString(source.content, "task_id") === "ch01_service_channel") {
    const materials = new Set(readObjectArray(source.content, "material_reactions").map((reaction) => readString(reaction, "material")));
    for (const material of ["water", "wet_soil", "stone", "wood", "thin_ice"]) {
      if (!materials.has(material)) addIssue(issues, "task.material_missing", source.path, "material_reactions", `service channel must author ${material}`);
    }
    const oContact = readObjectArray(source.content, "grammar_contacts").find((contact) => readString(contact, "token") === "o");
    if (!oContact || oContact.automatic_state_grant !== false || oContact.mastery_evidence_allowed !== false) addIssue(issues, "task.o_contact_only", source.path, "grammar_contacts", "o must remain receptive grammar contact with no automatic grant or mastery evidence");
  }
  if (readString(source.content, "task_id") === "ch01_length_cistern") {
    validateCisternTaskSource(source, issues);
  }
  if (readString(source.content, "task_id") === "ch01_den_bypass") {
    validateDenBypassTaskSource(source, issues);
  }
  if (readString(source.content, "task_id") === "ch01_return_flow") validateReturnFlowTaskSource(source, issues);
}

function validateReturnFlowTaskSource(source: CompiledSource, issues: ContentIssue[]): void {
  const modes=readObjectArray(source.content,"result_modes");
  if(!sameStringArray(modes.map(x=>readString(x,"mode_id")),["blocked","restored"]) || modes[0]?.completion_valid!==false || modes[0]?.persists_across_reload!==false || modes[0]?.patch_record_ref!==null || modes[1]?.completion_valid!==true || modes[1]?.persists_across_reload!==true || readString(modes[1]!,"persistence_scope")!=="region_persistent" || readString(modes[1]!,"patch_record_ref")!=="patch.valley.return_flow.v0.1") addIssue(issues,"task.return_flow_modes",source.path,"result_modes","N07 result modes must remain blocked and region-persistent restored");
  const exactSolutions = ["return_flow.repair_overflow", "return_flow.clear_mud", "return_flow.reuse_old_channel"];
  const solutions = readObjectArray(source.content, "solution_families");
  if (!sameStringArray(solutions.map(x => readString(x, "solution_id")), exactSolutions) || solutions.some(x => readString(x, "route_kind") !== "non_magic" || x.mainline !== true || readString(x, "result_mode") !== "restored")) addIssue(issues, "task.return_flow_solutions", source.path, "solution_families", "N07 requires exactly three canonical non-magic mainline solutions");
  const expectedActions: Record<string, readonly string[]> = {
    "return_flow.repair_overflow": ["return_flow.repair_overflow.inspect_indicator", "return_flow.repair_overflow.reseat_gate", "return_flow.repair_overflow.repair_seal", "return_flow.repair_overflow.clear_conduit"],
    "return_flow.clear_mud": ["return_flow.clear_mud.inspect_indicator", "return_flow.clear_mud.loosen_blockage", "return_flow.clear_mud.remove_mud", "return_flow.clear_mud.restore_grade", "return_flow.clear_mud.clear_intake"],
    "return_flow.reuse_old_channel": ["return_flow.reuse_old_channel.inspect_indicator", "return_flow.reuse_old_channel.connect_channel", "return_flow.reuse_old_channel.clear_channel", "return_flow.reuse_old_channel.brace_bank", "return_flow.reuse_old_channel.set_split_gauge"],
  };
  const expectedFacts: Record<string, readonly string[]> = {
    "return_flow.repair_overflow": ["settlementSupplyFlowInBand", "wetMeadowFlowInBand", "overflowContact", "overflowGateSeated", "overflowSealIntact", "overflowConduitClear"],
    "return_flow.clear_mud": ["settlementSupplyFlowInBand", "wetMeadowFlowInBand", "overflowContact", "mudMassBelowLimit", "channelGradeContinuous", "returnIntakeClear"],
    "return_flow.reuse_old_channel": ["settlementSupplyFlowInBand", "wetMeadowFlowInBand", "overflowContact", "oldChannelConnected", "oldChannelClear", "oldChannelBankStable"],
  };
  for (const solution of solutions) { const id=readString(solution,"solution_id"); if (!sameStringArray(readStringArray(solution,"required_actions"), expectedActions[id] ?? []) || !sameStringArray(readStringArray(solution,"required_world_predicates"), expectedFacts[id] ?? [])) addIssue(issues,"task.return_flow_solution_contract",source.path,"solution_families","N07 solution actions/facts are noncanonical"); }
  const goal = readObject(source.content, "world_goal");
  if (readString(goal, "predicate_mode") !== "all" || !sameStringArray(readObjectArray(goal, "predicates").map(x => readString(x, "expression")), ["settlement_supply_stable == true", "wet_meadow_restored == true"])) addIssue(issues, "task.return_flow_goals", source.path, "world_goal", "N07 requires exactly the two authoritative flow goals");
  const completion = readObject(source.content, "completion");
  if (readString(readObject(completion, "result_events"), "restored") !== "return_flow_committed" || readString(completion, "patch_record_ref") !== "patch.valley.return_flow.v0.1" || readNestedObject(completion, ["atomic_set_flags"]).settlement_supply_stable !== true || readNestedObject(completion, ["atomic_set_flags"]).wet_meadow_restored !== true || !sameStringArray(readStringArray(completion, "valid_result_modes"),["restored"]) || !sameStringArray(readStringArray(completion, "forbidden_writes"),["prologue_return_observed"]) || Object.keys(readNestedObject(completion,["atomic_set_flags"])).length!==2) addIssue(issues, "task.return_flow_commit", source.path, "completion", "N07 completion must atomically author only canonical flow state and patch");
  const exposure=readObjectArray(source.content,"language_exposure"); if(exposure.length!==1 || readString(exposure[0]!,"word_id")!=="word.wawa" || exposure[0]!.tool_solution_still_allows_observation!==true || exposure[0]!.automatic_mastery_forbidden!==true) addIssue(issues,"task.return_flow_wawa",source.path,"language_exposure","N07 tool routes must preserve separate inert wawa observation without automatic mastery");
  const contract = readObject(source.content, "return_flow_contract"), evidence = readObject(contract, "wawa_evidence"), expectations = readObject(contract, "shared_predicate_expectations");
  if (expectations.settlementSupplyFlowInBand !== true || expectations.wetMeadowFlowInBand !== true || expectations.overflowContact !== false || Object.keys(expectations).length !== 3) addIssue(issues,"task.return_flow_predicate_polarity",source.path,"return_flow_contract.shared_predicate_expectations","N07 common predicate polarity must explicitly reject overflow contact");
  if (!sameStringArray(readStringArray(evidence,"eligible_evidence_kinds"),["discovery","attunement","grounding"]) || !sameStringArray(readStringArray(evidence,"forbidden_target_classes"),["wildlife","living","corpse","harvested_product","processing_station"]) || !sameStringArray(readStringArray(evidence,"forbidden_outputs"),["expression_capacity_growth","artifact_surface_slot_growth","mp_growth","attack_qualification","attack_unlock","direct_damage"]) || evidence.answer_token_ids_visible !== false || evidence.fixed_slot_cue_visible !== false || evidence.color_only_cue_allowed !== false || evidence.independent_from_solution !== true || readString(contract, "source_target_id") !== "return_flow.inert_force_indicator" || readString(contract, "source_target_class") !== "inert_return_flow_mechanism" || readString(evidence, "prerequisite_graph_id") !== "attack.water.forceful_motion.prerequisite_graph" || readString(evidence, "prerequisite_node_id") !== "use.intensity.inert" || readString(evidence, "source_object_class") !== "inert_return_flow_mechanism" || readNumber(evidence, "maximum_prompt_level") !== 1 || evidence.tool_bypass_counts_as_evidence !== false || evidence.wildlife_actions_count_as_evidence !== false || evidence.harm_counts_as_evidence !== false || evidence.task_completion_reads_evidence !== false) addIssue(issues, "task.return_flow_wawa", source.path, "return_flow_contract.wawa_evidence", "wawa evidence must remain independent, inert, noncombat and non-wildlife");
}

function validateDenBypassTaskSource(source: CompiledSource, issues: ContentIssue[]): void {
  const modes = readObjectArray(source.content, "result_modes");
  const modeIds = modes.map((mode) => readString(mode, "mode_id"));
  if (!sameStringArray(modeIds, ["closed", "non_destructive_route_open"])) {
    addIssue(issues, "task.den_modes", source.path, "result_modes", "N06 modes must remain closed and non_destructive_route_open");
  }
  const valid = modes.find((mode) => readString(mode, "mode_id") === "non_destructive_route_open");
  if (!valid || valid.persists_across_reload !== true || readString(valid, "patch_record_ref") !== "patch.valley.den_route.v0.1") {
    addIssue(issues, "task.den_persistence", source.path, "result_modes", "N06 open route must use the canonical region-persistent patch");
  }
  const solutionIds = new Set(readObjectArray(source.content, "solution_families").map((solution) => readString(solution, "solution_id")));
  for (const id of ["den.wait_and_observe", "den.dig_upper_bypass", "den.low_force_noise", "den.low_force_staff"]) {
    if (!solutionIds.has(id)) addIssue(issues, "task.den_solution_missing", source.path, "solution_families", `N06 is missing ${id}`);
  }
  const completion = readObject(source.content, "completion");
  if (readNestedObject(completion, ["set_flags"]).den_route_open !== true ||
      !readStringArray(completion, "forbidden_writes").includes("fox_den_intact")) {
    addIssue(issues, "task.den_independent_commit", source.path, "completion", "route completion must set only den_route_open and forbid fox_den_intact writes");
  }
  const rewards = readObject(source.content, "wildlife_reward_contract");
  for (const field of ["mandatory_kills", "required_drops", "language_xp", "learning_evidence", "expression_capacity_growth", "artifact_surface_slot_growth", "mp_growth", "direct_currency"]) {
    if (readNumber(rewards, field) !== 0) addIssue(issues, "task.den_zero_reward", source.path, `wildlife_reward_contract.${field}`, `${field} must remain zero`);
  }
  if (rewards.combat_required !== false || rewards.den_destruction_opens_route !== false || rewards.harm_never_satisfies_world_goal !== true) {
    addIssue(issues, "task.den_zero_combat", source.path, "wildlife_reward_contract", "N06 must remain zero-combat and den destruction must never open the route");
  }
  const projection = readObject(source.content, "ecology_runtime_projection");
  const requiredFields = new Set(readStringArray(projection, "required_fields"));
  for (const field of ["minimum_warning_telegraph_seconds", "intrusion_before_defense_seconds", "rabbit_defensive_damage", "fox_defensive_damage", "real_escape_exit", "return_condition"]) {
    if (!requiredFields.has(field)) addIssue(issues, "task.den_ecology_projection", source.path, "ecology_runtime_projection.required_fields", `typed ecology projection is missing ${field}`);
  }
  if (readString(projection, "projection_mode") !== "typed_fields_only" || projection.raw_document_runtime_interpretation_forbidden !== true) {
    addIssue(issues, "task.den_ecology_projection", source.path, "ecology_runtime_projection", "runtime may consume only the narrow typed ecology projection");
  }
}

function validateEcologySource(source: CompiledSource, issues: ContentIssue[]): void {
  const timing = readNestedObject(source.content, ["shared_behavior", "timing_seconds"]);
  const warning = readNumber(timing, "minimum_warning_telegraph");
  const defense = readNumber(timing, "intrusion_before_defense");
  const loseSight = readNumber(timing, "lose_sight");
  const deescalate = readNumber(timing, "deescalate");
  if (warning === null || warning < 0.7 || warning > 60) addIssue(issues, "ecology.warning_window", source.path, "shared_behavior.timing_seconds.minimum_warning_telegraph", "warning telegraph must be within 0.7..60 seconds");
  if (defense === null || defense < 1.5 || defense > 60) addIssue(issues, "ecology.defense_window", source.path, "shared_behavior.timing_seconds.intrusion_before_defense", "defense delay must be within 1.5..60 seconds");
  if (loseSight === null || loseSight <= 0 || loseSight > 60 || deescalate === null || deescalate <= 0 || deescalate > 60) addIssue(issues, "ecology.timing_bounds", source.path, "shared_behavior.timing_seconds", "lose-sight and deescalation timing must be within (0,60] seconds");
  if (readNestedNumber(source.content, ["shared_behavior", "distance_tiles", "defensive_contact"]) !== 1.5) addIssue(issues, "ecology.defensive_contact", source.path, "shared_behavior.distance_tiles.defensive_contact", "defensive contact must remain exactly 1.5 tiles");
  if (readNestedNumber(source.content, ["shared_behavior", "distance_tiles", "perception"]) !== 8) addIssue(issues, "ecology.perception", source.path, "shared_behavior.distance_tiles.perception", "perception must remain exactly 8 tiles");
  const deterrence = readObjectArray(readNestedObject(source.content, ["shared_behavior", "deterrence"]), "sources");
  const fearOf = (action: string): number | null => readNumber(deterrence.find((source) => readString(source, "action") === action) ?? {}, "fear");
  if (fearOf("weapon_swing_without_hit") !== 15 || fearOf("ground_impact_or_loud_sound") !== 20) addIssue(issues, "ecology.deterrence_fear", source.path, "shared_behavior.deterrence.sources", "staff/noise fear must remain canonical 15/20");
  const contracts = readObject(source.content, "contracts");
  if (readNumber(contracts, "mandatory_kills") !== 0 || readNumber(contracts, "required_quest_drops") !== 0 || contracts.language_evidence_from_harm_forbidden !== true) {
    addIssue(issues, "ecology.zero_kill_contract", source.path, "contracts", "ecology must preserve zero required kills/drops and forbid language evidence from harm");
  }
  const entities = readObjectArray(source.content, "entities");
  const rabbit = entities.find((entity) => readString(entity, "entity_id") === "wildlife.rabbit.valley");
  const fox = entities.find((entity) => readString(entity, "entity_id") === "wildlife.fox.den");
  const canonicalGuards = (entity: ContentObject | undefined, expected: readonly string[], label: string): void => {
    if (!entity || !sameStringArray(readStringArray(entity, "defense_only_when"), expected)) addIssue(issues, "ecology.defense_guards", source.path, `entities.${label}.defense_only_when`, `${label} defense guards must be canonical`);
  };
  canonicalGuards(rabbit, ["cornered", "young_threatened"], "rabbit");
  canonicalGuards(fox, ["cornered", "young_threatened", "escape_blocked"], "fox");
  if (!rabbit || readNestedNumber(rabbit, ["defensive_action", "damage_provisional"]) !== 2 || !readString(rabbit, "real_escape_exit")) {
    addIssue(issues, "ecology.rabbit_runtime_fields", source.path, "entities", "rabbit requires canonical defensive damage and a real escape exit");
  }
  if (!fox || readNestedNumber(fox, ["defensive_action", "damage_provisional"]) !== 6 ||
      readNestedNumber(fox, ["defensive_action", "guarding_young_damage_provisional"]) !== 8 || !readString(fox, "real_escape_exit") ||
      !readString(fox, "cross_scene_return_condition").includes("fox_den_intact")) {
    addIssue(issues, "ecology.fox_runtime_fields", source.path, "entities", "fox requires canonical defense, real escape, and den-aware return fields");
  }
}

function validateCisternTaskSource(source: CompiledSource, issues: ContentIssue[]): void {
  const expected = {
    short: { tokens: ["word.telo", "word.lili"], modifier: "word.lili", mp: 6 },
    default: { tokens: ["word.telo"], modifier: "", mp: 5 },
    long: { tokens: ["word.telo", "word.suli"], modifier: "word.suli", mp: 10 },
  } as const;
  const stageContracts = readObject(source.content, "stage_contracts");
  for (const [stageId, contract] of Object.entries(expected)) {
    const stage = readObject(stageContracts, stageId);
    const direct = readObject(stage, "direct_teaching_solution");
    if (readString(direct, "resolved_length_class") !== stageId || readNumber(direct, "activation_mp") !== contract.mp) {
      addIssue(issues, "task.cistern_stage_profile", source.path, `stage_contracts.${stageId}.direct_teaching_solution`, `${stageId} must retain its canonical length class and ${contract.mp} MP quote`);
    }
    if (readString(direct, "length_modifier_id") !== contract.modifier || !sameStringArray(readStringArray(direct, "canonical_word_ids"), contract.tokens)) {
      addIssue(issues, "task.cistern_stage_expression", source.path, `stage_contracts.${stageId}.direct_teaching_solution`, `${stageId} must compile from the canonical ${contract.tokens.join(" ")} expression`);
    }
    if (readStringArray(stage, "world_goal_predicates").length === 0) {
      addIssue(issues, "task.cistern_receiver_predicate", source.path, `stage_contracts.${stageId}.world_goal_predicates`, "stage completion requires receiver world predicates");
    }
  }

  const families = readObjectArray(source.content, "task_families");
  const expectedFamilies = new Map<string, readonly string[]>([
    ["cistern.family_a.calibration", ["short", "default"]],
    ["cistern.family_b.transfer", ["long"]],
  ]);
  const seenStages = new Set<string>();
  for (const [familyId, expectedStages] of expectedFamilies) {
    const family = families.find((candidate) => readString(candidate, "family_id") === familyId);
    if (!family || family.independent_completion !== true || !readString(family, "completion_predicate") || family.language_evidence_from_tool_bypass !== false ||
        !sameStringArray(readStringArray(family, "stage_ids"), expectedStages)) {
      addIssue(issues, "task.cistern_family_contract", source.path, "task_families", `${familyId} must remain independently completable with its canonical stages and evidence-safe tool bypass`);
      continue;
    }
    for (const stage of readStringArray(family, "stage_ids")) {
      if (seenStages.has(stage)) addIssue(issues, "task.cistern_family_overlap", source.path, "task_families", `stage ${stage} belongs to more than one cistern family`);
      seenStages.add(stage);
    }
  }
  if (families.length !== 2 || seenStages.size !== 3) addIssue(issues, "task.cistern_family_contract", source.path, "task_families", "cistern requires exactly independent family A calibration and family B transfer");
  const aggregate = readObject(source.content, "family_completion_contract");
  if (!sameStringArray(readStringArray(aggregate, "required_family_ids"), [...expectedFamilies.keys()]) || readString(aggregate, "aggregate_mode") !== "all" ||
      readString(aggregate, "commit_event_after_all") !== "cistern_world_transition_committed" || aggregate.no_single_family_may_set_region_completion_flags !== true ||
      readObjectArray(source.content, "solution_families").some((solution) => readString(solution, "result_mode") === "reconnected")) {
    addIssue(issues, "task.cistern_family_atomicity", source.path, "family_completion_contract", "both independent families must complete before the cistern region transition commits");
  }

  const hintLevels = readNestedObject(source.content, ["hint_ladder", "levels"]);
  for (const levelId of ["H0", "H1"] as const) {
    const level = readObject(hintLevels, levelId);
    if (level.answer_token_ids_visible !== false || level.independent_evidence_allowed !== true) {
      addIssue(issues, "task.cistern_nonanswer_hint", source.path, `hint_ladder.levels.${levelId}`, `${levelId} must expose receiver information without answer token IDs`);
    }
  }
  const semantic = readObject(source.content, "semantic_acceptance");
  if (readString(semantic, "stage_pass_authority") !== "receiver_world_predicates_only" || semantic.legal_wrong_length_cast_executes_but_never_completes_stage !== true) {
    addIssue(issues, "task.cistern_world_predicate_authority", source.path, "semantic_acceptance", "legal wrong casts may execute but stage success must be receiver-predicate-only");
  }
  const completion = readObject(source.content, "completion");
  const setFlags = readNestedObject(completion, ["world_transition", "set_flags"]);
  for (const flag of ["high_cistern_reconnected", "upper_channel_available", "exit_ladder_lowered"]) {
    if (setFlags[flag] !== true) addIssue(issues, "task.cistern_completion_flag", source.path, `completion.world_transition.set_flags.${flag}`, `completion must atomically set ${flag}`);
  }
  const binding = readObject(source.content, "capacity_milestone_binding");
  if (readString(binding, "runtime_projection") !== "reference_only" || binding.hardcoded_resulting_state_forbidden !== true || binding.resulting_state !== undefined) {
    addIssue(issues, "task.cistern_capacity_reference", source.path, "capacity_milestone_binding", "runtime capacity output must remain a reference-only machine contract");
  }
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateTaskExpectedProfiles(source: CompiledSource, issues: ContentIssue[]): void {
  const profiles = readNestedObject(source.content, ["enabled_content", "expected_profiles"]);
  const ledger = readNestedObject(source.content, ["completion", "expected_direct_mp_ledger"]);
  let sum = 0;
  for (const name of ["short", "default", "long"] as const) {
    const mp = readNestedNumber(profiles, [name, "activation_mp"]);
    const ledgerMp = readNumber(ledger, name);
    if (mp === null || ledgerMp === null || mp !== ledgerMp) {
      addIssue(issues, "ref.mismatch", source.path, `completion.expected_direct_mp_ledger.${name}`, "ledger MP must equal the enabled expected profile MP");
    } else sum += mp;
  }
  const total = readNumber(ledger, "total");
  if (total !== null && total !== sum) addIssue(issues, "range.total", source.path, "completion.expected_direct_mp_ledger.total", `expected ${sum}, received ${total}`);
}

function validateRegionReferences(source: CompiledSource, graphIds: ReadonlySet<string>, issues: ContentIssue[]): void {
  const nodes = new Set(readObjectArray(source.content, "nodes").map((node) => readString(node, "node_id")));
  const states = new Set(readObjectArray(source.content, "state_registry").map((state) => readString(state, "state_id")));
  for (const [index, connection] of readObjectArray(source.content, "connections").entries()) {
    for (const field of ["from", "to"] as const) {
      const node = readString(connection, field);
      if (!nodes.has(node)) addIssue(issues, "ref.missing", source.path, `connections[${index}].${field}`, `unknown node ${node}`);
    }
  }
  for (const [index, id] of readStringArray(source.content, "protected_state_ids").entries()) {
    if (!states.has(id)) addIssue(issues, "ref.missing", source.path, `protected_state_ids[${index}]`, `unknown state ${id}`);
  }
  for (const [index, id] of readStringArray(readObject(source.content, "route_completion_contract"), "required_loop").entries()) {
    if (!nodes.has(id)) addIssue(issues, "ref.missing", source.path, `route_completion_contract.required_loop[${index}]`, `unknown node ${id}`);
  }
  validateKnownIdFields(source.content, source, graphIds, new Set(), issues);
}

function validateEconomyItemReferences(source: CompiledSource, issues: ContentIssue[]): void {
  const items = new Set(readObjectArray(source.content, "item_definitions").map((item) => readString(item, "item_id")));
  const checkItem = (id: string, path: string): void => {
    if (id && !items.has(id)) addIssue(issues, "ref.missing", source.path, path, `unknown economy item ${id}`);
  };
  for (const [profileIndex, profile] of readObjectArray(source.content, "harvest_profiles").entries()) {
    checkItem(readString(profile, "carcass_item_id"), `harvest_profiles[${profileIndex}].carcass_item_id`);
    for (const [slotIndex, slot] of readObjectArray(profile, "tissue_slots").entries()) checkItem(readString(slot, "item_id"), `harvest_profiles[${profileIndex}].tissue_slots[${slotIndex}].item_id`);
  }
  for (const [recipeIndex, recipe] of readObjectArray(source.content, "processing_recipes").entries()) {
    for (const field of ["inputs", "outputs"] as const) {
      for (const [lineIndex, line] of readObjectArray(recipe, field).entries()) {
        const item = readString(line, "item_id");
        if (item) checkItem(item, `processing_recipes[${recipeIndex}].${field}[${lineIndex}].item_id`);
      }
    }
  }
}

function validateTradeReferences(source: CompiledSource, sources: readonly CompiledSource[], issues: ContentIssue[]): void {
  const merchants = new Set(readObjectArray(source.content, "merchants").map((merchant) => readString(merchant, "id")));
  const catalogRef = readString(source.content, "authoritative_item_catalog");
  const catalog = resolveReferencedSource(source, catalogRef, sources);
  const catalogItems = new Set(catalog ? readObjectArray(catalog.content, "item_definitions").map((item) => readString(item, "item_id")) : []);
  for (const [index, item] of readObjectArray(source.content, "prologue_items").entries()) {
    for (const field of ["buyer", "seller"] as const) {
      const merchant = readString(item, field);
      if (merchant && !merchants.has(merchant)) addIssue(issues, "ref.missing", source.path, `prologue_items[${index}].${field}`, `unknown merchant ${merchant}`);
    }
    const id = readString(item, "id");
    if (catalogItems.size > 0 && !catalogItems.has(id) && id !== "food.travel_ration") {
      addIssue(issues, "ref.missing", source.path, `prologue_items[${index}].id`, `item ${id} is absent from authoritative catalog`);
    }
  }
}

function validateKnownIdFields(value: ContentValue, source: CompiledSource, graphIds: ReadonlySet<string>, signatureIds: ReadonlySet<string>, issues: ContentIssue[], path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateKnownIdFields(item, source, graphIds, signatureIds, issues, `${path}[${index}]`));
    return;
  }
  if (!isContentObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (typeof child === "string") {
      if ((key === "prerequisite_graph_id" || key === "required_graph_id" || key === "graph_id") && graphIds.size > 0 && !graphIds.has(child)) addIssue(issues, "ref.missing", source.path, childPath, `unknown attack graph ${child}`);
      if (key === "attack_signature_id" && signatureIds.size > 0 && !signatureIds.has(child)) addIssue(issues, "ref.missing", source.path, childPath, `unknown attack signature ${child}`);
    }
    validateKnownIdFields(child, source, graphIds, signatureIds, issues, childPath);
  }
}

function validateCanonicalWordRefs(value: ContentValue | undefined, source: CompiledSource, path: string, words: ReadonlySet<string>, issues: ContentIssue[]): void {
  if (!isContentObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && child.startsWith("word.") && !words.has(child)) addIssue(issues, "ref.missing", source.path, `${path}.${key}`, `unknown word ${child}`);
  }
}

function validateFileReferences(source: CompiledSource, byPath: ReadonlyMap<string, CompiledSource>, issues: ContentIssue[]): void {
  walkContent(source.content, (value, fieldPath) => {
    if (typeof value !== "string" || !SOURCE_FILE_PATTERN.test(value) || /^https?:\/\//i.test(value)) return;
    const resolved = resolvePath(source.path, value);
    if (!byPath.has(resolved)) addIssue(issues, "ref.file_missing", source.path, fieldPath, `cannot resolve ${value} (${resolved})`);
  });
}

function validateFiniteNumbers(value: ContentValue, sourcePath: string, fieldPath: string, issues: ContentIssue[]): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) addIssue(issues, "range.finite", sourcePath, fieldPath, "number must be finite");
    return;
  }
  if (Array.isArray(value)) return value.forEach((child, index) => validateFiniteNumbers(child, sourcePath, `${fieldPath}[${index}]`, issues));
  if (!isContentObject(value)) return;
  for (const [key, child] of Object.entries(value)) validateFiniteNumbers(child, sourcePath, fieldPath ? `${fieldPath}.${key}` : key, issues);
}

function validateNonNegativeMeasurements(value: ContentValue, sourcePath: string, fieldPath: string, issues: ContentIssue[]): void {
  if (Array.isArray(value)) return value.forEach((child, index) => validateNonNegativeMeasurements(child, sourcePath, `${fieldPath}[${index}]`, issues));
  if (!isContentObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = fieldPath ? `${fieldPath}.${key}` : key;
    if (typeof child === "number" && /(?:^|_)(?:mp|cost|price|coin|quantity|count|capacity|duration|seconds|minutes|hours|days|mass|energy|mu|eu|length|width|height|radius|range)(?:_|$)/i.test(key) && child < 0) {
      addIssue(issues, "range.non_negative", sourcePath, childPath, `${key} cannot be negative`);
    }
    if (typeof child === "number" && /probability/i.test(key) && (child < 0 || child > 1)) addIssue(issues, "range.probability", sourcePath, childPath, "probability must be between 0 and 1");
    validateNonNegativeMeasurements(child, sourcePath, childPath, issues);
  }
}

function validateArrayIds(source: CompiledSource, key: string, idKey: string, issues: ContentIssue[], required = true): void {
  const value = source.content[key];
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    addIssue(issues, "schema.array", source.path, key, "must be an array");
    return;
  }
  reportDuplicates(asObjectArray(value), idKey, source, key, issues);
}

function validateNestedArrayIds(source: CompiledSource, keys: readonly string[], idKey: string, issues: ContentIssue[]): void {
  const value = readNestedValue(source.content, keys);
  const path = keys.join(".");
  if (!Array.isArray(value)) return addIssue(issues, "schema.array", source.path, path, "must be an array");
  reportDuplicates(asObjectArray(value), idKey, source, path, issues);
}

function validateScalarArrayUnique(source: CompiledSource, key: string, issues: ContentIssue[]): void {
  const values = readStringArray(source.content, key);
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) addIssue(issues, "id.duplicate", source.path, `${key}[${index}]`, `duplicate value ${value}`);
    seen.add(value);
  });
}

function reportDuplicates(items: readonly ContentObject[], idKey: string, source: CompiledSource, path: string, issues: ContentIssue[]): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const id = readString(item, idKey);
    if (!id) return addIssue(issues, "id.required", source.path, `${path}[${index}].${idKey}`, "non-empty ID is required");
    if (seen.has(id)) addIssue(issues, "id.duplicate", source.path, `${path}[${index}].${idKey}`, `duplicate ID ${id}`);
    seen.add(id);
  });
}

function indexArray(source: CompiledSource, arrayKey: string, idKey: string, target: Record<string, ContentObject>, issues: ContentIssue[]): void {
  for (const item of readObjectArray(source.content, arrayKey)) indexById(readString(item, idKey), item, target, source, `${arrayKey}.${idKey}`, issues);
}

function indexObject(source: CompiledSource, objectKey: string, target: Record<string, ContentObject>, issues: ContentIssue[]): void {
  for (const [id, value] of Object.entries(readObject(source.content, objectKey))) if (isContentObject(value)) indexById(id, value, target, source, objectKey, issues);
}

function indexRoot(source: CompiledSource, idKey: string, target: Record<string, ContentObject>, issues: ContentIssue[]): void {
  indexById(readString(source.content, idKey), source.content, target, source, idKey, issues);
}

function indexById(id: string, value: ContentObject, target: Record<string, ContentObject>, source: CompiledSource, path: string, issues: ContentIssue[]): void {
  if (!id) return addIssue(issues, "id.required", source.path, path, "non-empty ID is required");
  if (target[id]) return addIssue(issues, "id.duplicate", source.path, path, `duplicate manifest ID ${id}`);
  target[id] = value;
}

function requireVersion(value: string, source: CompiledSource, path: string, issues: ContentIssue[]): void {
  if (!value || !VERSION_PATTERN.test(value) || !/\d/.test(value)) addIssue(issues, "version.invalid", source.path, path, `invalid version ${JSON.stringify(value)}`);
}

function requireIntegerRange(value: number | null, minimum: number, maximum: number, source: CompiledSource, path: string, issues: ContentIssue[]): void {
  if (value === null || !Number.isInteger(value) || value < minimum || value > maximum) addIssue(issues, "range.integer", source.path, path, `expected integer ${minimum}..${maximum}`);
}

function classifySchema(schema: string): ContentKind | null {
  if (schema.startsWith("g02.single-word-spell.")) return "single_word_spells";
  if (schema.startsWith("g02.length-profiles.")) return "length_profiles";
  if (schema.startsWith("g02.attack-signatures.")) return "attack_signatures";
  if (schema.startsWith("g01.chapter-flow.")) return "chapter";
  if (schema.startsWith("g01.region.")) return "region";
  if (schema.startsWith("g01.scene.")) return "scene";
  if (schema.startsWith("w03.ecology.")) return "ecology";
  if (schema.startsWith("w03.wildlife-economy.")) return "wildlife_economy";
  if (schema.startsWith("economy.settlement-trade.")) return "settlement_trade";
  if (schema.startsWith("w04.cross-save-wal.")) return "persistence";
  if (schema.startsWith("g04.player-survival.")) return "survival";
  if (schema.startsWith("language.learning-progression.")) return "learning_progression";
  if (schema.startsWith("language.glyph-progression.")) return "glyph_progression";
  if (schema.startsWith("language.p0-curriculum.")) return "p0_curriculum";
  if (schema.startsWith("pu120.magic-glyph-catalog.")) return "glyph_catalog";
  if (schema.startsWith("magic-glyph-surface-profiles.")) return "visual_surface_profiles";
  if (schema.startsWith("g01.task.")) return "task";
  return null;
}

function resolveReferencedSource(source: CompiledSource, reference: string, sources: readonly CompiledSource[]): CompiledSource | undefined {
  if (!reference) return undefined;
  const resolved = resolvePath(source.path, reference);
  return sources.find((candidate) => candidate.path === resolved);
}

function resolvePath(sourcePath: string, reference: string): string {
  const cleanReference = reference.split("#", 1)[0] ?? reference;
  if (cleanReference.replaceAll("\\", "/").startsWith("data/")) {
    return normalizeRepositoryPath(cleanReference);
  }
  const base = sourcePath.split("/").slice(0, -1);
  const parts = cleanReference.replaceAll("\\", "/").split("/");
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

function normalizeRepositoryPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").replace(/^\.\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function freezeIndexes(indexes: MutableIndexes): ContentManifest["indexes"] {
  return Object.freeze(
    Object.fromEntries(Object.entries(indexes).map(([name, index]) => [name, Object.freeze(index)])),
  ) as unknown as ContentManifest["indexes"];
}

function walkContent(value: ContentValue, visitor: (value: ContentValue, path: string) => void, path = ""): void {
  visitor(value, path);
  if (Array.isArray(value)) return value.forEach((child, index) => walkContent(child, visitor, `${path}[${index}]`));
  if (!isContentObject(value)) return;
  for (const [key, child] of Object.entries(value)) walkContent(child, visitor, path ? `${path}.${key}` : key);
}

function isContentObject(value: unknown): value is ContentObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringAlias(object: ContentObject, snake: string, camel: string): string {
  const value = object[snake] ?? object[camel];
  return typeof value === "string" ? value : "";
}

function readString(object: ContentObject, key: string): string {
  const value = object[key];
  return typeof value === "string" ? value : "";
}

function readNumber(object: ContentObject, key: string): number | null {
  const value = object[key];
  return typeof value === "number" ? value : null;
}

function readObject(object: ContentObject, key: string): ContentObject {
  const value = object[key];
  return isContentObject(value) ? value : {};
}

function readNestedObject(object: ContentObject, keys: readonly string[]): ContentObject {
  const value = readNestedValue(object, keys);
  return isContentObject(value) ? value : {};
}

function readNestedValue(object: ContentObject, keys: readonly string[]): ContentValue | undefined {
  let value: ContentValue | undefined = object;
  for (const key of keys) {
    if (!isContentObject(value)) return undefined;
    value = value[key];
  }
  return value;
}

function readNestedString(object: ContentObject, keys: readonly string[]): string {
  const value = readNestedValue(object, keys);
  return typeof value === "string" ? value : "";
}

function readNestedNumber(object: ContentObject, keys: readonly string[]): number | null {
  const value = readNestedValue(object, keys);
  return typeof value === "number" ? value : null;
}

function readObjectArray(object: ContentObject, key: string): ContentObject[] {
  return asObjectArray(object[key]);
}

function asObjectArray(value: ContentValue | undefined): ContentObject[] {
  return Array.isArray(value) ? value.filter(isContentObject) : [];
}

function readStringArray(object: ContentObject, key: string): string[] {
  const value = object[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function addIssue(issues: ContentIssue[], code: string, sourcePath: string, fieldPath: string, message: string): void {
  issues.push({ code, sourcePath, fieldPath, message });
}
