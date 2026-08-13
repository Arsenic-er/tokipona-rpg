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
      break;
    case "task":
      validateArrayIds(source, "learning_state_event_contracts", "event_id", issues);
      validateArrayIds(source, "golden_tests", "id", issues);
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
    "task",
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
      validateTaskExpectedProfiles(source, issues);
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
  });  validateSceneStaticReachability(source, collisionRows, width, height, issues);

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
  else if (readString(node, "scene_id") !== readString(source.content, "scene_id")) addIssue(issues, "ref.mismatch", source.path, "scene_id", `region node ${nodeId} declares scene ${readString(node, "scene_id")}`);
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
  for (const [index, entry] of readObjectArray(source.content, "trade_entries").entries()) {
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
