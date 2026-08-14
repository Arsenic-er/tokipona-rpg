import { createHash } from "node:crypto";
import type { ContentManifest } from "../../src/content/types.ts";
import type { RuntimeSafeRangeManifest, RuntimeSafeRangeTargetPhysics } from "../../src/content/runtime-safe-range-manifest.ts";

type Obj = Record<string, unknown>;

export function projectSafeRangeQualification(manifest: ContentManifest): RuntimeSafeRangeManifest {
  const taskSource = manifest.byKind.task.find((source) => source.content.task_id === "ch01_first_attack_qualification");
  const sceneSource = manifest.byKind.scene.find((source) => source.content.scene_id === "scene.valley.safe_range");
  const attackSource = manifest.byKind.attack_signatures[0];
  if (!taskSource || !sceneSource || !attackSource) throw new Error("safe-range task, scene and attack source are required");
  const task = taskSource.content as Obj, scene = sceneSource.content as Obj, attack = attackSource.content as Obj;
  const graph = objects(attack.prerequisite_graphs, "prerequisite_graphs").find((item) => string(item.graph_id, "graph_id") === "attack.water.forceful_motion.prerequisite_graph");
  const signature = objects(attack.signatures, "signatures").find((item) => string(item.signature_id, "signature_id") === "attack.water.forceful_motion.v0.1");
  const physics = objects(attack.physics_damage_models, "physics_damage_models").find((item) => string(item.damage_formula_id, "damage_formula_id") === "physics.impact.transfer.v0.1");
  if (!graph || !signature || !physics) throw new Error("safe-range authoritative attack contracts are missing");
  const nodes = new Map(objects(graph.required_nodes, "required_nodes").map((node) => [string(node.node_id, "node_id"), node]));
  if (nodes.size !== 5) throw new Error("safe-range prerequisite graph requires five unique nodes");
  const retrieval = required(nodes, "retrieve.telo.two_families"), motion = required(nodes, "use.motion.noncombat"), intensity = required(nodes, "use.intensity.inert"), repair = required(nodes, "repair.related_graph"), delayed = required(nodes, "retrieve.delayed");
  const taskStages = new Map(objects(task.ordered_state_progression, "ordered_state_progression").map((stage) => [string(stage.stage_id, "stage_id"), stage]));
  if (taskStages.size !== 4) throw new Error("safe-range qualification requires four unique stages");
  const calibration = required(taskStages, "calibration"), permission = required(taskStages, "permission"), first = required(taskStages, "first_eligible_unseen_transfer"), table = required(taskStages, "complete_material_table");
  const targetMap = new Map(objects(scene.targets, "scene.targets").map((target) => [string(target.target_id, "target_id"), target]));
  const sceneInteractionMap = new Map(objects(scene.interactions, "scene.interactions").map((interaction) => [string(interaction.interaction_id, "interaction_id"), interaction]));
  const interactionBindings = strings(task.interaction_ids, "interaction_ids").map((interactionId) => { const interaction = required(sceneInteractionMap, interactionId); return { interactionId, targetId: string(interaction.target_id, `${interactionId}.target_id`), verb: string(interaction.verb, `${interactionId}.verb`), toolOrMagicRequired: boolean(interaction.tool_or_magic_required, `${interactionId}.tool_or_magic_required`) }; });
  if (targetMap.size !== 5) throw new Error("safe-range scene requires five unique targets");
  const targetPhysics = object(signature.safe_range_target_physics, "safe_range_target_physics");
  const authoredProfiles = objects(targetPhysics.profiles, "safe_range_target_physics.profiles");
  if (new Set(authoredProfiles.map((profile) => string(profile.target_class, "target_class"))).size !== authoredProfiles.length) throw new Error("safe-range target physics contains duplicates");
  const profiles: RuntimeSafeRangeTargetPhysics[] = authoredProfiles.map((profile) => {
    const targetClass = string(profile.target_class, "target_class") as RuntimeSafeRangeTargetPhysics["targetClass"];
    const target = required(targetMap, targetClass);
    const point = numberPair(target.interaction_point_tiles, `${targetClass}.interaction_point_tiles`);
    const bounds = object(target.collision_bounds_tiles, `${targetClass}.collision_bounds_tiles`);
    return {
      targetClass,
      materialClass: string(profile.material_class, `${targetClass}.material_class`),
      targetAbsorptionEu: nonNegative(profile.target_absorption_eu, `${targetClass}.target_absorption_eu`),
      kineticCouplingRatio: positive(profile.kinetic_coupling_ratio, `${targetClass}.kinetic_coupling_ratio`),
      initialHp: positiveSafeInteger(profile.initial_hp, `${targetClass}.initial_hp`),
      initialStateBand: string(profile.initial_state_band, `${targetClass}.initial_state_band`),
      interactionPointTiles: point,
      collisionBoundsTiles: { x: nonNegativeSafeInteger(bounds.x, `${targetClass}.bounds.x`), y: nonNegativeSafeInteger(bounds.y, `${targetClass}.bounds.y`), width: positiveSafeInteger(bounds.width, `${targetClass}.bounds.width`), height: positiveSafeInteger(bounds.height, `${targetClass}.bounds.height`) },
    };
  });
  const capacity = object(signature.capacity_requirements, "capacity_requirements"), mp = object(signature.mp_quote, "mp_quote"), output = object(signature.material_output, "material_output"), motionOutput = object(signature.motion_output, "motion_output"), trial = object(signature.trial_execution, "trial_execution"), damage = object(signature.damage_resolution, "damage_resolution");
  const parallel = object(task.parallel_calibration_station, "parallel_calibration_station");
  const parallelReceipt = object(parallel.receipt_contract, "parallel calibration receipt");
  const parallelActions = objects(parallel.actions, "parallel calibration actions").map((action) => ({
    actionId: string(action.action_id, "parallel action id"),
    authoritySceneId: string(action.authority_scene_id, "parallel authority scene") as "scene.valley.settlement" | "scene.valley.return_channel",
    authorityTaskId: string(action.authority_task_id, "parallel authority task"),
    taskFamilyId: string(action.task_family_id, "parallel task family"),
    evidenceType: string(action.evidence_type, "parallel evidence type") as "active_retrieval" | "noncombat_action" | "noncombat_intensity" | "repair" | "delayed_retrieval",
    prerequisiteNodeId: string(action.prerequisite_node_id, "parallel node"),
    concept: nullableString(action.concept, "parallel concept"),
    promptLevel: action.prompt_level === 0 || action.prompt_level === 1 ? action.prompt_level : (() => { throw new Error("parallel prompt level must be 0 or 1"); })(),
    canonicalAst: nullableCanonicalAst(action.canonical_ast, "parallel canonical AST"),
    canonicalAstShape: nullableString(action.canonical_ast_shape, "parallel AST shape"),
    outcome: string(action.outcome, "parallel outcome"),
    eligibleTargetNodeIds: optionalStrings(action.eligible_target_node_ids, "parallel repair targets"),
    requiredUnrelatedActionIds: optionalStrings(action.required_unrelated_action_ids, "parallel unrelated actions"),
    existingDomainEventMappingOnly: boolean(action.existing_domain_event_mapping_only, "parallel existing event mapping"),
  }));
  if (new Set(parallelActions.map((action) => action.actionId)).size !== parallelActions.length) throw new Error("parallel calibration action IDs must be unique");
  const unrelatedActions = objects(parallel.unrelated_semantic_world_actions, "parallel unrelated actions").map((action) => ({
    actionId: string(action.action_id, "unrelated action id"), authoritySceneId: exactString(action.authority_scene_id, "scene.valley.settlement", "unrelated authority scene"), authorityTaskId: string(action.authority_task_id, "unrelated authority task"), taskFamilyId: exactString(action.task_family_id, "settlement_calibration_context", "unrelated family"), outcome: string(action.outcome, "unrelated outcome"), qualificationEvidence: exactBoolean(action.qualification_evidence, false, "unrelated evidence"),
  }));
  if (new Set(unrelatedActions.map((action) => action.actionId)).size !== unrelatedActions.length) throw new Error("unrelated semantic action IDs must be unique");  const ast = (value: unknown): RuntimeSafeRangeManifest["canonicalAst"] => { const shape = object(value, "canonical_ast_shape"); return { subjectHead: exactString(shape.subject_head, "word.telo", "subject_head"), commandParticle: exactString(shape.command_particle, "o", "command_particle"), action: exactString(shape.action, "word.tawa", "action"), manner: exactString(shape.manner, "word.wawa", "manner") }; };
  const expectedUnrelatedActions = [["settlement.calibration.unrelated_delivery_commit", "calibration.unrelated.delivery", "delivery_committed"], ["settlement.calibration.unrelated_route_commit", "calibration.unrelated.route", "route_committed"]] as const;
  unrelatedActions.forEach((action, index) => { const expected = expectedUnrelatedActions[index]; if (!expected || action.actionId !== expected[0] || action.authorityTaskId !== expected[1] || action.outcome !== expected[2]) throw new Error(`unrelated semantic action ${expected?.[0] ?? index} is noncanonical`); });
  const body = {
    taskId: exactString(task.task_id, "ch01_first_attack_qualification", "task_id"),
    sourcePath: exactString(taskSource.path, "data/tasks/ch01-first-attack-qualification.v0.1.yaml", "sourcePath"),
    familyId: exactString(task.task_family_id, "safe_range_unseen_transfer", "task_family_id"),
    optional: exactBoolean(task.optional, true, "optional"),
    scene: {
      sceneId: exactString(scene.scene_id, "scene.valley.safe_range", "scene_id"), regionId: exactString(scene.region_id, "valley_prologue", "region_id"), regionNodeId: exactString(scene.region_node_id, "valley.safe_range", "region_node_id"), sizeTiles: [exactNumber(object(scene.size_tiles, "size_tiles").width, 24, "width"), exactNumber(object(scene.size_tiles, "size_tiles").height, 18, "height")] as const,
      entranceId: exactString(objects(scene.entrances, "entrances")[0]?.entrance_id, "safe_range.from_settlement", "entrance_id"), exitId: exactString(objects(scene.exits, "exits")[0]?.exit_id, "safe_range.to_settlement", "exit_id"), entryPermissionStateId: exactString(object(task.entry_guard, "entry_guard").state_id, "range_trial_permission", "entry guard"), exitPermissionStateId: exactString(object(task.exit_guard, "exit_guard").state_id, "range_trial_permission", "exit guard"),
      targetIds: strings(task.target_ids, "target_ids") as RuntimeSafeRangeManifest["scene"]["targetIds"], interactionIds: strings(task.interaction_ids, "interaction_ids") as RuntimeSafeRangeManifest["scene"]["interactionIds"], materialTableInteractionPointTiles: exactNumberPair(required(targetMap, "material_collision_table").interaction_point_tiles, [20, 1], "material collision table interaction point") as readonly [20, 1], interactionBindings, livingTargetCount: objects(scene.targets, "targets").filter((target) => string(target.target_kind, "target_kind").includes("living")).length as 0,
    },
    canonicalAst: ast(task.canonical_ast), rawUtteranceStringMatchingForbidden: exactBoolean(task.raw_utterance_string_matching_forbidden, true, "raw utterance"),
    progression: {
      calibration: { stageId: exactString(calibration.stage_id, "calibration", "calibration.stage_id"), stateId: exactString(calibration.prerequisite_state_id, "attack_capacity_calibration_complete", "calibration.state"), writerEvent: exactString(calibration.writer_event, "attack_capacity_calibrated", "calibration.writer") },
      permission: { stageId: exactString(permission.stage_id, "permission", "permission.stage_id"), stateId: exactString(permission.prerequisite_state_id, "range_trial_permission", "permission.state"), writerEvent: exactString(permission.writer_event, "attack_prerequisites_verified", "permission.writer") },
      firstTransfer: { stageId: exactString(first.stage_id, "first_eligible_unseen_transfer", "first.stage_id"), evidenceType: exactString(first.evidence_type, "safe_range_unseen_transfer", "first.evidence_type"), promptLevels: strings(first.eligible_prompt_levels, "prompt levels") as readonly ["H0", "H1"], targetClass: exactString(first.target_class, "inert", "first.target_class"), livingOverlapRejectedBeforeCommit: exactBoolean(first.living_overlap_rejected_before_commit, true, "first living overlap"), resultStateId: exactString(first.result_state_id, "first_attack_signature_available", "first.result"), writerEvent: exactString(first.writer_event, "safe_range_transfer_passed", "first.writer") },
      materialTable: { stageId: exactString(table.stage_id, "complete_material_table", "table.stage_id"), targetClasses: strings(table.required_target_classes, "table targets") as readonly ["wood_dummy", "sandbag", "minecart", "hanging_stone"], tableTargetId: exactString(table.table_target_id, "material_collision_table", "table target"), resultStateId: exactString(table.result_state_id, "first_attack_signature_completed", "table.result"), writerEvent: exactString(table.writer_event, "safe_range_material_table_completed", "table.writer") },
    },
    prerequisiteGraph: {
      graphId: exactString(graph.graph_id, "attack.water.forceful_motion.prerequisite_graph", "graph_id"), version: string(graph.version, "graph.version"), canonicalAst: ast(graph.canonical_ast_shape),
      nodes: {
        retrieval: { nodeId: exactString(retrieval.node_id, "retrieve.telo.two_families", "retrieval.id"), evidenceType: exactString(retrieval.evidence_type, "active_retrieval", "retrieval.type"), concept: exactString(retrieval.concept, "word.telo", "retrieval.concept"), distinctTaskFamilies: exactNumber(retrieval.distinct_task_families, 2, "retrieval families"), maxHintLevel: exactNumber(retrieval.max_hint_level, 1, "retrieval hint") },
        motion: { nodeId: exactString(motion.node_id, "use.motion.noncombat", "motion.id"), evidenceType: exactString(motion.evidence_type, "noncombat_action", "motion.type"), astShape: exactString(motion.ast_shape, "N o tawa", "motion.ast"), distinctTaskFamilies: exactNumber(motion.distinct_task_families, 2, "motion families"), maxHintLevel: exactNumber(motion.max_hint_level, 1, "motion hint") },
        intensity: { nodeId: exactString(intensity.node_id, "use.intensity.inert", "intensity.id"), evidenceType: exactString(intensity.evidence_type, "noncombat_intensity", "intensity.type"), concept: exactString(intensity.concept, "word.wawa", "intensity.concept"), sourceObjectClass: exactString(intensity.source_object_class, "inert_return_flow_mechanism", "intensity class"), minimum: exactNumber(intensity.minimum, 1, "intensity minimum"), maxHintLevel: exactNumber(intensity.max_hint_level, 1, "intensity hint") },
        repair: { nodeId: exactString(repair.node_id, "repair.related_graph", "repair.id"), evidenceType: exactString(repair.evidence_type, "repair", "repair.type"), targetGraphId: exactString(repair.target_graph_id, "attack.water.forceful_motion.prerequisite_graph", "repair graph"), eligibleTargetNodeIds: strings(repair.eligible_target_node_ids, "repair targets") as readonly ["use.motion.noncombat", "use.intensity.inert"], minimum: exactNumber(repair.minimum, 1, "repair minimum"), maxHintLevelAfterRepair: exactNumber(repair.max_hint_level_after_repair, 1, "repair hint") },
        delayed: { nodeId: exactString(delayed.node_id, "retrieve.delayed", "delayed.id"), evidenceType: exactString(delayed.evidence_type, "delayed_retrieval", "delayed.type"), targetGraphId: exactString(delayed.target_graph_id, "attack.water.forceful_motion.prerequisite_graph", "delayed graph"), retrievalTarget: exactString(delayed.retrieval_target, "canonical_ast_shape_or_declared_paraphrase_equivalence", "delayed target"), minimum: exactNumber(delayed.minimum, 1, "delayed minimum"), unrelatedWorldEventsBetween: exactNumber(delayed.unrelated_world_events_between, 2, "delayed ordering"), maxHintLevel: exactNumber(delayed.max_hint_level, 1, "delayed hint") },
      }, completionEvent: exactString(graph.completion_event, "attack_capacity_calibrated", "graph completion"), forbiddenInputs: strings(graph.forbidden_inputs, "graph forbidden inputs") as RuntimeSafeRangeManifest["prerequisiteGraph"]["forbiddenInputs"],
    },
    signature: {
      signatureId: exactString(signature.signature_id, "attack.water.forceful_motion.v0.1", "signature id"), version: string(signature.version, "signature version"), prerequisiteGraphId: exactString(signature.prerequisite_graph_id, "attack.water.forceful_motion.prerequisite_graph", "signature graph"), canonicalAst: ast(signature.canonical_ast_shape),
      capacity: { playerMeaningfulTokensMinimum: exactNumber(capacity.player_expression_capacity_meaningful_tokens_minimum, 4, "capacity tokens"), artifactSlotsMinimum: exactNumber(capacity.artifact_surface_slot_capacity_minimum, 4, "capacity slots") }, mp: { boundExistingWater: exactNumber(mp.use_bound_existing_water, 13, "bound MP"), manifestDefaultWater: exactNumber(mp.manifest_default_water, 18, "manifest MP") }, output: { phase: exactString(output.phase, "liquid", "output phase"), massMu: exactNumber(output.default_manifested_mass_mu, 2, "output mass"), paidKineticBudgetEu: exactNumber(motionOutput.paid_kinetic_budget_eu, 8, "kinetic budget"), initialSpeedBandMps: exactNumberPair(motionOutput.initial_speed_band_mps, [3, 5], "initial speed band"), gravityAfterRelease: exactBoolean(output.gravity_after_release, true, "gravity after release"), persistenceScope: exactString(output.persistence_scope, "ephemeral", "persistence scope"), economyExportForbidden: exactBoolean(output.economy_export_forbidden, true, "economy export") },
      trial: { permissionStateId: exactString(trial.required_permission_state, "range_trial_permission", "trial permission"), sceneId: exactString(trial.allowed_scene, "scene.valley.safe_range", "trial scene"), targetClass: exactString(trial.allowed_target_class, "inert", "trial target class"), livingOverlapRejectedBeforeCommit: exactBoolean(trial.living_overlap_rejected_before_commit, true, "living overlap"), sweptVolumeCollisionCheck: exactBoolean(trial.swept_volume_collision_check, true, "swept collision") },
      damage: { formulaId: exactString(damage.damage_formula_id, "physics.impact.transfer.v0.1", "damage formula"), liquidSolidMassComponent: exactNumber(damage.liquid_solid_mass_damage_component, 0, "liquid mass component"), signatureDamageConstantForbidden: exactBoolean(damage.damage_constant_in_signature_forbidden, true, "damage constant"), languageEvidenceReadByDamageFormula: exactBoolean(damage.language_evidence_read_by_damage_formula, false, "language evidence read") },
    },
    physicsModel: { formulaId: exactString(physics.damage_formula_id, "physics.impact.transfer.v0.1", "physics id"), kineticComponentHpFormula: exactString(physics.kinetic_component_hp_formula, "floor(max(0, transferred_kinetic_eu - target_absorption_eu) / 4)", "kinetic formula"), solidMassComponentHpFormula: string(physics.solid_mass_component_hp_formula, "solid formula"), totalImpactHpFormula: exactString(physics.total_impact_hp_formula, "kinetic_component_hp + solid_mass_component_hp", "total formula"), liquidAndGasUseKineticComponentOnly: exactBoolean(physics.liquid_and_gas_use_kinetic_component_only, true, "liquid kinetic only") },
    parallelCalibration: {
      authoritySceneId: exactString(parallel.authority_scene_id, "scene.valley.settlement", "parallel station scene"), targetId: exactString(parallel.target_id, "settlement.attack_calibration_table", "parallel station target"), interactionId: exactString(parallel.interaction_id, "settlement.open_attack_calibration", "parallel station interaction"), interactionPointTiles: numberPair(parallel.interaction_point_tiles, "parallel station point") as readonly [36, 28],
      receipt: { receiptRequired: exactBoolean(parallelReceipt.receipt_required, true, "parallel receipt required"), idempotencyKeyFields: strings(parallelReceipt.idempotency_key_fields, "parallel idempotency fields") as readonly ["player_save_id", "action_id", "normalized_variant_hash"], duplicateEvidenceAwardForbidden: exactBoolean(parallelReceipt.duplicate_evidence_award_forbidden, true, "parallel duplicate evidence") },
      actions: parallelActions, unrelatedSemanticWorldActions: unrelatedActions,
    },    targetPhysics: { authority: exactString(targetPhysics.authority, "authored_per_target_class", "physics authority"), balanceStatus: exactString(targetPhysics.balance_status, "provisional_authored_values", "balance status"), runtimeGuessingForbidden: exactBoolean(targetPhysics.runtime_target_physics_guessing_forbidden, true, "runtime guessing"), transferredKineticEuFormula: exactString(targetPhysics.transferred_kinetic_eu_formula, "min(paid_kinetic_budget_eu, paid_kinetic_budget_eu * kinetic_coupling_ratio)", "transfer formula"), damageFormulaId: exactString(targetPhysics.damage_formula_id, "physics.impact.transfer.v0.1", "target damage formula"), profiles },
  } as const satisfies Omit<RuntimeSafeRangeManifest, "sourceDigest">;
  return { sourceDigest: `sha256:${createHash("sha256").update(stableStringify(body)).digest("hex")}`, ...body };
}

function required(map: Map<string, Obj>, id: string): Obj { const value = map.get(id); if (!value) throw new Error(`missing canonical ${id}`); return value; }
function object(value: unknown, label: string): Obj { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Obj; }
function objects(value: unknown, label: string): Obj[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value.map((item, index) => object(item, `${label}[${index}]`)); }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`); return value; }
function strings(value: unknown, label: string): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) throw new Error(`${label} must be a string array`); return value as string[]; }
function exactString<const T extends string>(value: unknown, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must be ${expected}`); return expected; }
function exactNumber<const T extends number>(value: unknown, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must be ${expected}`); return expected; }
function exactBoolean<const T extends boolean>(value: unknown, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must be ${expected}`); return expected; }
function nonNegative(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be nonnegative`); return value; }
function positive(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`); return value; }
function positiveSafeInteger(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive safe integer`); return value as number; }
function nonNegativeSafeInteger(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a nonnegative safe integer`); return value as number; }
function exactNumberPair(value: unknown, expected: readonly [number, number], label: string): readonly [number, number] { const pair = numberPair(value, label); if (pair[0] !== expected[0] || pair[1] !== expected[1]) throw new Error(`${label} must be [${expected.join(",")}]`); return pair; }
function numberPair(value: unknown, label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isSafeInteger(item))) throw new Error(`${label} must be an integer pair`); return [value[0] as number, value[1] as number]; }
function nullableString(value: unknown, label: string): string | null { if (value === undefined || value === null) return null; return string(value, label); }
function optionalStrings(value: unknown, label: string): string[] { if (value === undefined || value === null) return []; return strings(value, label); }
function boolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} must be boolean`); return value; }
function nullableCanonicalAst(value: unknown, label: string): Readonly<Record<string, string>> | null {
  if (value === undefined || value === null) return null;
  const source = object(value, label);
  const result: Record<string, string> = {};
  for (const [sourceKey, targetKey] of [["subject_head", "subjectHead"], ["command_particle", "commandParticle"], ["action", "action"], ["manner", "manner"]] as const) {
    if (source[sourceKey] !== undefined) result[targetKey] = string(source[sourceKey], `${label}.${sourceKey}`);
  }
  if (Object.keys(result).length < 3) throw new Error(`${label} must contain at least subject, command particle and action`);
  return result;
}function nullableObjectStringRecord(value: unknown, label: string): Readonly<Record<string, string>> | null { if (value === undefined || value === null) return null; const result = object(value, label); if (Object.values(result).some((item) => typeof item !== "string")) throw new Error(`${label} values must be strings`); return result as Record<string, string>; }function stableStringify(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
