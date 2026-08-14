export interface RuntimeSafeRangeAstShape {
  readonly subjectHead: "word.telo";
  readonly commandParticle: "o";
  readonly action: "word.tawa";
  readonly manner: "word.wawa";
}

export interface RuntimeSafeRangeTargetPhysics {
  readonly targetClass: "wood_dummy" | "sandbag" | "minecart" | "hanging_stone";
  readonly materialClass: string;
  readonly targetAbsorptionEu: number;
  readonly initialHp: number;
  readonly interactionPointTiles: readonly [number, number];
  readonly collisionBoundsTiles: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly kineticCouplingRatio: number;
  readonly initialStateBand: string;
}

export interface RuntimeSafeRangeManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly taskId: "ch01_first_attack_qualification";
  readonly sourcePath: "data/tasks/ch01-first-attack-qualification.v0.1.yaml";
  readonly familyId: "safe_range_unseen_transfer";
  readonly optional: true;
  readonly scene: Readonly<{
    sceneId: "scene.valley.safe_range";
    regionId: "valley_prologue";
    regionNodeId: "valley.safe_range";
    sizeTiles: readonly [24, 18];
    entranceId: "safe_range.from_settlement";
    exitId: "safe_range.to_settlement";
    entryPermissionStateId: "range_trial_permission";
    exitPermissionStateId: "range_trial_permission";
    targetIds: readonly ["wood_dummy", "sandbag", "minecart", "hanging_stone", "material_collision_table"];
    interactionIds: readonly ["safe_range.test_wood_dummy", "safe_range.test_sandbag", "safe_range.test_minecart", "safe_range.test_hanging_stone", "safe_range.inspect_material_collision_table"];
    materialTableInteractionPointTiles: readonly [20, 1];
    interactionBindings: readonly Readonly<{ interactionId: string; targetId: string; verb: string; toolOrMagicRequired: boolean }>[];
    livingTargetCount: 0;
  }>;
  readonly canonicalAst: RuntimeSafeRangeAstShape;
  readonly rawUtteranceStringMatchingForbidden: true;
  readonly progression: Readonly<{
    calibration: Readonly<{ stageId: "calibration"; stateId: "attack_capacity_calibration_complete"; writerEvent: "attack_capacity_calibrated" }>;
    permission: Readonly<{ stageId: "permission"; stateId: "range_trial_permission"; writerEvent: "attack_prerequisites_verified" }>;
    firstTransfer: Readonly<{ stageId: "first_eligible_unseen_transfer"; evidenceType: "safe_range_unseen_transfer"; promptLevels: readonly ["H0", "H1"]; targetClass: "inert"; livingOverlapRejectedBeforeCommit: true; resultStateId: "first_attack_signature_available"; writerEvent: "safe_range_transfer_passed" }>;
    materialTable: Readonly<{ stageId: "complete_material_table"; targetClasses: readonly ["wood_dummy", "sandbag", "minecart", "hanging_stone"]; tableTargetId: "material_collision_table"; resultStateId: "first_attack_signature_completed"; writerEvent: "safe_range_material_table_completed" }>;
  }>;
  readonly prerequisiteGraph: Readonly<{
    graphId: "attack.water.forceful_motion.prerequisite_graph";
    version: string;
    canonicalAst: RuntimeSafeRangeAstShape;
    nodes: Readonly<{
      retrieval: Readonly<{ nodeId: "retrieve.telo.two_families"; evidenceType: "active_retrieval"; concept: "word.telo"; distinctTaskFamilies: 2; maxHintLevel: 1 }>;
      motion: Readonly<{ nodeId: "use.motion.noncombat"; evidenceType: "noncombat_action"; astShape: "N o tawa"; distinctTaskFamilies: 2; maxHintLevel: 1 }>;
      intensity: Readonly<{ nodeId: "use.intensity.inert"; evidenceType: "noncombat_intensity"; concept: "word.wawa"; sourceObjectClass: "inert_return_flow_mechanism"; minimum: 1; maxHintLevel: 1 }>;
      repair: Readonly<{ nodeId: "repair.related_graph"; evidenceType: "repair"; targetGraphId: "attack.water.forceful_motion.prerequisite_graph"; eligibleTargetNodeIds: readonly ["use.motion.noncombat", "use.intensity.inert"]; minimum: 1; maxHintLevelAfterRepair: 1 }>;
      delayed: Readonly<{ nodeId: "retrieve.delayed"; evidenceType: "delayed_retrieval"; targetGraphId: "attack.water.forceful_motion.prerequisite_graph"; retrievalTarget: "canonical_ast_shape_or_declared_paraphrase_equivalence"; minimum: 1; unrelatedWorldEventsBetween: 2; maxHintLevel: 1 }>;
    }>;
    completionEvent: "attack_capacity_calibrated";
    forbiddenInputs: readonly ["kill_count", "wildlife_harm", "elapsed_real_time", "repeated_cast_count", "currency", "streak"];
  }>;
  readonly signature: Readonly<{
    signatureId: "attack.water.forceful_motion.v0.1";
    version: string;
    prerequisiteGraphId: "attack.water.forceful_motion.prerequisite_graph";
    canonicalAst: RuntimeSafeRangeAstShape;
    capacity: Readonly<{ playerMeaningfulTokensMinimum: 4; artifactSlotsMinimum: 4 }>;
    mp: Readonly<{ boundExistingWater: 13; manifestDefaultWater: 18 }>;
    output: Readonly<{ phase: "liquid"; massMu: 2; paidKineticBudgetEu: 8; initialSpeedBandMps: readonly [3, 5]; gravityAfterRelease: true; persistenceScope: "ephemeral"; economyExportForbidden: true }>;
    trial: Readonly<{ permissionStateId: "range_trial_permission"; sceneId: "scene.valley.safe_range"; targetClass: "inert"; livingOverlapRejectedBeforeCommit: true; sweptVolumeCollisionCheck: true }>;
    damage: Readonly<{ formulaId: "physics.impact.transfer.v0.1"; liquidSolidMassComponent: 0; signatureDamageConstantForbidden: true; languageEvidenceReadByDamageFormula: false }>;
  }>;
  readonly physicsModel: Readonly<{
    formulaId: "physics.impact.transfer.v0.1";
    kineticComponentHpFormula: "floor(max(0, transferred_kinetic_eu - target_absorption_eu) / 4)";
    solidMassComponentHpFormula: string;
    totalImpactHpFormula: "kinetic_component_hp + solid_mass_component_hp";
    liquidAndGasUseKineticComponentOnly: true;
  }>;
  readonly parallelCalibration: Readonly<{
    authoritySceneId: "scene.valley.settlement";
    targetId: "settlement.attack_calibration_table";
    interactionId: "settlement.open_attack_calibration";
    interactionPointTiles: readonly [36, 28];
    receipt: Readonly<{ receiptRequired: true; idempotencyKeyFields: readonly ["player_save_id", "action_id", "normalized_variant_hash"]; duplicateEvidenceAwardForbidden: true }>;
    actions: readonly Readonly<{
      actionId: string;
      authoritySceneId: "scene.valley.settlement" | "scene.valley.return_channel";
      authorityTaskId: string;
      taskFamilyId: string;
      evidenceType: "active_retrieval" | "noncombat_action" | "noncombat_intensity" | "repair" | "delayed_retrieval";
      prerequisiteNodeId: string;
      concept: string | null;
      promptLevel: 0 | 1;
      canonicalAst: Readonly<Record<string, string>> | null;
      canonicalAstShape: string | null;
      outcome: string;
      eligibleTargetNodeIds: readonly string[];
      requiredUnrelatedActionIds: readonly string[];
      existingDomainEventMappingOnly: boolean;
    }>[];
    unrelatedSemanticWorldActions: readonly Readonly<{ actionId: string; authoritySceneId: "scene.valley.settlement"; authorityTaskId: "calibration.unrelated.delivery" | "calibration.unrelated.route"; taskFamilyId: "settlement_calibration_context"; outcome: "delivery_committed" | "route_committed"; qualificationEvidence: false }>[];
  }>;  readonly targetPhysics: Readonly<{
    authority: "authored_per_target_class";
    balanceStatus: "provisional_authored_values";
    runtimeGuessingForbidden: true;
    transferredKineticEuFormula: "min(paid_kinetic_budget_eu, paid_kinetic_budget_eu * kinetic_coupling_ratio)";
    damageFormulaId: "physics.impact.transfer.v0.1";
    profiles: readonly RuntimeSafeRangeTargetPhysics[];
  }>;
}

const TARGETS = ["wood_dummy", "sandbag", "minecart", "hanging_stone", "material_collision_table"] as const;
const PHYSICS_TARGETS = TARGETS.slice(0, 4);
const INTERACTIONS = ["safe_range.test_wood_dummy", "safe_range.test_sandbag", "safe_range.test_minecart", "safe_range.test_hanging_stone", "safe_range.inspect_material_collision_table"] as const;
const FORBIDDEN_INPUTS = ["kill_count", "wildlife_harm", "elapsed_real_time", "repeated_cast_count", "currency", "streak"] as const;

const verifiedSafeRangeManifests = new WeakSet<object>();

export function isVerifiedRuntimeSafeRangeManifest(value: unknown): value is RuntimeSafeRangeManifest {
  return typeof value === "object" && value !== null && verifiedSafeRangeManifests.has(value);
}

export function assertVerifiedRuntimeSafeRangeManifest(value: unknown): asserts value is RuntimeSafeRangeManifest {
  if (!isVerifiedRuntimeSafeRangeManifest(value)) throw new Error("safe-range manifest was not produced by readRuntimeSafeRangeManifest");
}
/** Fail-closed boundary for the generated N08 qualification contract. */
export function readRuntimeSafeRangeManifest(candidate: unknown): RuntimeSafeRangeManifest {
  const root = record(candidate, "runtime content artifact");
  const value = record(root.safeRangeQualification, "safeRangeQualification");
  const digest = string(value.sourceDigest, "safeRangeQualification.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("safe-range sourceDigest must be a sha256 digest");
  if (value.taskId !== "ch01_first_attack_qualification" || value.sourcePath !== "data/tasks/ch01-first-attack-qualification.v0.1.yaml" || value.familyId !== "safe_range_unseen_transfer" || value.optional !== true) throw new Error("safe-range identity contract is invalid");

  const scene = record(value.scene, "safeRangeQualification.scene");
  if (scene.sceneId !== "scene.valley.safe_range" || scene.regionId !== "valley_prologue" || scene.regionNodeId !== "valley.safe_range" || !same(scene.sizeTiles, [24, 18]) || scene.entranceId !== "safe_range.from_settlement" || scene.exitId !== "safe_range.to_settlement" || scene.entryPermissionStateId !== "range_trial_permission" || scene.exitPermissionStateId !== "range_trial_permission" || scene.livingTargetCount !== 0 || !same(scene.targetIds, TARGETS) || !same(scene.interactionIds, INTERACTIONS) || !same(scene.materialTableInteractionPointTiles, [20, 1])) throw new Error("safe-range scene/topology contract is invalid");
  const interactionBindings = objectArray(scene.interactionBindings, "safe-range scene interaction bindings");
  const expectedInteractionBindings = [["safe_range.test_wood_dummy", "wood_dummy", "execute_controlled_attack_transfer", true], ["safe_range.test_sandbag", "sandbag", "execute_controlled_attack_transfer", true], ["safe_range.test_minecart", "minecart", "execute_controlled_attack_transfer", true], ["safe_range.test_hanging_stone", "hanging_stone", "execute_controlled_attack_transfer", true], ["safe_range.inspect_material_collision_table", "material_collision_table", "inspect_authored_material_collision_results", false]] as const;
  if (interactionBindings.length !== expectedInteractionBindings.length) throw new Error("safe-range interaction bindings are incomplete");
  interactionBindings.forEach((binding, index) => { const expected = expectedInteractionBindings[index]!; if (!same(Object.keys(binding), ["interactionId", "targetId", "verb", "toolOrMagicRequired"]) || binding.interactionId !== expected[0] || binding.targetId !== expected[1] || binding.verb !== expected[2] || binding.toolOrMagicRequired !== expected[3]) throw new Error(`safe-range interaction binding ${expected[0]} is invalid`); });
  exactAst(value.canonicalAst, "safeRangeQualification.canonicalAst");
  if (value.rawUtteranceStringMatchingForbidden !== true) throw new Error("safe-range raw utterance matching must stay forbidden");

  const progression = record(value.progression, "safeRangeQualification.progression");
  exactObject(progression.calibration, { stageId: "calibration", stateId: "attack_capacity_calibration_complete", writerEvent: "attack_capacity_calibrated" }, "safe-range calibration");
  exactObject(progression.permission, { stageId: "permission", stateId: "range_trial_permission", writerEvent: "attack_prerequisites_verified" }, "safe-range permission");
  const first = record(progression.firstTransfer, "safe-range first transfer");
  if (first.stageId !== "first_eligible_unseen_transfer" || first.evidenceType !== "safe_range_unseen_transfer" || !same(first.promptLevels, ["H0", "H1"]) || first.targetClass !== "inert" || first.livingOverlapRejectedBeforeCommit !== true || first.resultStateId !== "first_attack_signature_available" || first.writerEvent !== "safe_range_transfer_passed") throw new Error("safe-range first unseen transfer contract is invalid");
  const table = record(progression.materialTable, "safe-range material table");
  if (table.stageId !== "complete_material_table" || !same(table.targetClasses, PHYSICS_TARGETS) || table.tableTargetId !== "material_collision_table" || table.resultStateId !== "first_attack_signature_completed" || table.writerEvent !== "safe_range_material_table_completed") throw new Error("safe-range material-table contract is invalid");

  const graph = record(value.prerequisiteGraph, "safeRangeQualification.prerequisiteGraph");
  if (graph.graphId !== "attack.water.forceful_motion.prerequisite_graph" || typeof graph.version !== "string" || graph.version.length === 0 || graph.completionEvent !== "attack_capacity_calibrated" || !same(graph.forbiddenInputs, FORBIDDEN_INPUTS)) throw new Error("safe-range prerequisite graph envelope is invalid");
  exactAst(graph.canonicalAst, "safe-range graph canonicalAst");
  const nodes = record(graph.nodes, "safe-range graph nodes");
  exactObject(nodes.retrieval, { nodeId: "retrieve.telo.two_families", evidenceType: "active_retrieval", concept: "word.telo", distinctTaskFamilies: 2, maxHintLevel: 1 }, "safe-range retrieval node");
  exactObject(nodes.motion, { nodeId: "use.motion.noncombat", evidenceType: "noncombat_action", astShape: "N o tawa", distinctTaskFamilies: 2, maxHintLevel: 1 }, "safe-range motion node");
  exactObject(nodes.intensity, { nodeId: "use.intensity.inert", evidenceType: "noncombat_intensity", concept: "word.wawa", sourceObjectClass: "inert_return_flow_mechanism", minimum: 1, maxHintLevel: 1 }, "safe-range intensity node");
  const repair = record(nodes.repair, "safe-range repair node");
  if (repair.nodeId !== "repair.related_graph" || repair.evidenceType !== "repair" || repair.targetGraphId !== graph.graphId || !same(repair.eligibleTargetNodeIds, ["use.motion.noncombat", "use.intensity.inert"]) || repair.minimum !== 1 || repair.maxHintLevelAfterRepair !== 1) throw new Error("safe-range repair node is invalid");
  exactObject(nodes.delayed, { nodeId: "retrieve.delayed", evidenceType: "delayed_retrieval", targetGraphId: "attack.water.forceful_motion.prerequisite_graph", retrievalTarget: "canonical_ast_shape_or_declared_paraphrase_equivalence", minimum: 1, unrelatedWorldEventsBetween: 2, maxHintLevel: 1 }, "safe-range delayed node");

  const signature = record(value.signature, "safeRangeQualification.signature");
  if (signature.signatureId !== "attack.water.forceful_motion.v0.1" || typeof signature.version !== "string" || signature.version.length === 0 || signature.prerequisiteGraphId !== graph.graphId) throw new Error("safe-range signature identity is invalid");
  exactAst(signature.canonicalAst, "safe-range signature canonicalAst");
  exactObject(signature.capacity, { playerMeaningfulTokensMinimum: 4, artifactSlotsMinimum: 4 }, "safe-range signature capacity");
  exactObject(signature.mp, { boundExistingWater: 13, manifestDefaultWater: 18 }, "safe-range signature MP");
  if (!same(Object.keys(signature), ["signatureId", "version", "prerequisiteGraphId", "canonicalAst", "capacity", "mp", "output", "trial", "damage"])) throw new Error("safe-range signature envelope contains unknown or missing fields");
  const signatureOutput = record(signature.output, "safe-range signature output");
  if (!same(Object.keys(signatureOutput), ["phase", "massMu", "paidKineticBudgetEu", "initialSpeedBandMps", "gravityAfterRelease", "persistenceScope", "economyExportForbidden"]) || signatureOutput.phase !== "liquid" || signatureOutput.massMu !== 2 || signatureOutput.paidKineticBudgetEu !== 8 || !same(signatureOutput.initialSpeedBandMps, [3, 5]) || signatureOutput.gravityAfterRelease !== true || signatureOutput.persistenceScope !== "ephemeral" || signatureOutput.economyExportForbidden !== true) throw new Error("safe-range signature output envelope is invalid");
  exactObject(signature.trial, { permissionStateId: "range_trial_permission", sceneId: "scene.valley.safe_range", targetClass: "inert", livingOverlapRejectedBeforeCommit: true, sweptVolumeCollisionCheck: true }, "safe-range trial execution");
  exactObject(signature.damage, { formulaId: "physics.impact.transfer.v0.1", liquidSolidMassComponent: 0, signatureDamageConstantForbidden: true, languageEvidenceReadByDamageFormula: false }, "safe-range damage binding");

  const parallel = record(value.parallelCalibration, "safeRangeQualification.parallelCalibration");
  if (parallel.authoritySceneId !== "scene.valley.settlement" || parallel.targetId !== "settlement.attack_calibration_table" || parallel.interactionId !== "settlement.open_attack_calibration" || !same(parallel.interactionPointTiles, [36, 28])) throw new Error("safe-range parallel calibration station is invalid");
  const receipt = record(parallel.receipt, "safe-range parallel calibration receipt");
  if (receipt.receiptRequired !== true || !same(receipt.idempotencyKeyFields, ["player_save_id", "action_id", "normalized_variant_hash"]) || receipt.duplicateEvidenceAwardForbidden !== true) throw new Error("safe-range parallel calibration receipt contract is invalid");
  const calibrationActions = objectArray(parallel.actions, "safe-range parallel calibration actions");
  const expectedCalibrationActions = [
    ["settlement.telo.h0", "scene.valley.settlement", "calibration.telo.delivery", "settlement_water_delivery", "active_retrieval", "retrieve.telo.two_families", "word.telo", 0, "retrieved_water_concept", false],
    ["settlement.telo.h1", "scene.valley.settlement", "calibration.telo.irrigation", "settlement_irrigation_review", "active_retrieval", "retrieve.telo.two_families", "word.telo", 1, "retrieved_water_concept", false],
    ["settlement.tawa.h0", "scene.valley.settlement", "calibration.tawa.courier", "settlement_courier_motion", "noncombat_action", "use.motion.noncombat", null, 0, "noncombat_movement", false],
    ["settlement.tawa.h1", "scene.valley.settlement", "calibration.tawa.channel", "settlement_channel_navigation", "noncombat_action", "use.motion.noncombat", null, 1, "noncombat_movement", false],
    ["return_flow.wawa.inert_h0", "scene.valley.return_channel", "ch01_return_flow", "ecology_and_return_flow", "noncombat_intensity", "use.intensity.inert", "word.wawa", 0, "grounded_inert_intensity", true],
    ["return_flow.wawa.inert_h1", "scene.valley.return_channel", "ch01_return_flow", "ecology_and_return_flow", "noncombat_intensity", "use.intensity.inert", "word.wawa", 1, "grounded_inert_intensity", true],
    ["settlement.repair.motion_h0", "scene.valley.settlement", "calibration.repair.motion", "settlement_calibration_repair", "repair", "repair.related_graph", null, 0, "repaired_motion_graph", false],
    ["settlement.delayed_retrieval_h0", "scene.valley.settlement", "calibration.delayed.ast", "settlement_delayed_retrieval", "delayed_retrieval", "retrieve.delayed", null, 0, "retrieved_canonical_ast_after_two_events", false],
  ] as const;
  if (calibrationActions.length !== expectedCalibrationActions.length || new Set(calibrationActions.map((action) => action.actionId)).size !== calibrationActions.length) throw new Error("safe-range parallel calibration action IDs must be unique and complete");
  calibrationActions.forEach((action, index) => { const expected = expectedCalibrationActions[index]!; if (action.actionId !== expected[0] || action.authoritySceneId !== expected[1] || action.authorityTaskId !== expected[2] || action.taskFamilyId !== expected[3] || action.evidenceType !== expected[4] || action.prerequisiteNodeId !== expected[5] || action.concept !== expected[6] || action.promptLevel !== expected[7] || action.outcome !== expected[8] || action.existingDomainEventMappingOnly !== expected[9]) throw new Error(`safe-range parallel calibration action ${expected[0]} is invalid`); });
  if (!same(calibrationActions[2]?.canonicalAst && Object.values(record(calibrationActions[2].canonicalAst, "tawa h0 AST")), ["word.jan", "o", "word.tawa"]) || calibrationActions[2]?.canonicalAstShape !== "subject_o_predicate" || !same(calibrationActions[3]?.canonicalAst && Object.values(record(calibrationActions[3].canonicalAst, "tawa h1 AST")), ["word.jan", "o", "word.tawa"]) || calibrationActions[3]?.canonicalAstShape !== "subject_o_predicate" || !same(calibrationActions[6]?.eligibleTargetNodeIds, ["use.motion.noncombat", "use.intensity.inert"]) || !same(calibrationActions[7]?.requiredUnrelatedActionIds, ["settlement.calibration.unrelated_delivery_commit", "settlement.calibration.unrelated_route_commit"])) throw new Error("safe-range parallel calibration AST/repair/delayed bindings are invalid");
  exactAst(calibrationActions[7]?.canonicalAst, "safe-range delayed calibration AST");
  const unrelated = objectArray(parallel.unrelatedSemanticWorldActions, "safe-range unrelated semantic actions");
  const expectedUnrelated = [["settlement.calibration.unrelated_delivery_commit", "calibration.unrelated.delivery", "delivery_committed"], ["settlement.calibration.unrelated_route_commit", "calibration.unrelated.route", "route_committed"]] as const;
  if (unrelated.length !== expectedUnrelated.length || unrelated.some((action, index) => { const expected = expectedUnrelated[index]!; return !same(Object.keys(action), ["actionId", "authoritySceneId", "authorityTaskId", "taskFamilyId", "outcome", "qualificationEvidence"]) || action.actionId !== expected[0] || action.authoritySceneId !== "scene.valley.settlement" || action.authorityTaskId !== expected[1] || action.taskFamilyId !== "settlement_calibration_context" || action.outcome !== expected[2] || action.qualificationEvidence !== false; })) throw new Error("safe-range unrelated semantic actions are invalid");  const physics = record(value.physicsModel, "safeRangeQualification.physicsModel");
  if (physics.formulaId !== "physics.impact.transfer.v0.1" || physics.kineticComponentHpFormula !== "floor(max(0, transferred_kinetic_eu - target_absorption_eu) / 4)" || typeof physics.solidMassComponentHpFormula !== "string" || physics.solidMassComponentHpFormula.length === 0 || physics.totalImpactHpFormula !== "kinetic_component_hp + solid_mass_component_hp" || physics.liquidAndGasUseKineticComponentOnly !== true) throw new Error("safe-range physics formula is invalid");
  const targetPhysics = record(value.targetPhysics, "safeRangeQualification.targetPhysics");
  if (targetPhysics.authority !== "authored_per_target_class" || targetPhysics.balanceStatus !== "provisional_authored_values" || targetPhysics.runtimeGuessingForbidden !== true || targetPhysics.transferredKineticEuFormula !== "min(paid_kinetic_budget_eu, paid_kinetic_budget_eu * kinetic_coupling_ratio)" || targetPhysics.damageFormulaId !== physics.formulaId) throw new Error("safe-range target physics authority is invalid");
  const profiles = objectArray(targetPhysics.profiles, "safeRangeQualification.targetPhysics.profiles");
  if (profiles.length !== PHYSICS_TARGETS.length || new Set(profiles.map((profile) => profile.targetClass)).size !== profiles.length || !same(profiles.map((profile) => profile.targetClass), PHYSICS_TARGETS)) throw new Error("safe-range target physics must cover each inert class exactly once");
  const runtimeBounds = profiles.map((profile, index) => record(profile.collisionBoundsTiles, `safe-range target bounds[${index}]`));
  if (runtimeBounds.some((bounds) => !safeRangeRuntimeRectInsideScene(bounds, 24, 18))) throw new Error("safe-range target collision AABBs must stay inside the 24x18 scene");
  for (let left = 0; left < runtimeBounds.length; left += 1) for (let right = left + 1; right < runtimeBounds.length; right += 1) {
    if (safeRangeRuntimeRectsOverlap(runtimeBounds[left]!, runtimeBounds[right]!)) throw new Error("safe-range target collision AABBs must be pairwise non-overlapping");
  }  const expectedProfiles = [
    ["wood_dummy", "wood", 1.5, 0.8, 6, "anchored_at_rest", 5, 1, 5, 1, 1, 2],
    ["sandbag", "fiber_and_sand", 2.5, 0.55, 8, "settled_at_rest", 9, 1, 9, 1, 1, 2],
    ["minecart", "metal", 1, 0.7, 10, "braked_on_rail", 13, 1, 13, 1, 2, 1],
    ["hanging_stone", "stone", 2, 0.9, 8, "suspended_at_rest", 17, 1, 17, 2, 1, 2],
  ] as const;
  profiles.forEach((profile, index) => {
    const expected = expectedProfiles[index]!;
    if (profile.targetClass !== expected[0] || profile.materialClass !== expected[1] || profile.targetAbsorptionEu !== expected[2] || profile.kineticCouplingRatio !== expected[3] || profile.initialHp !== expected[4] || profile.initialStateBand !== expected[5] || !same(profile.interactionPointTiles, [expected[6], expected[7]]) || !sameRect(profile.collisionBoundsTiles, expected.slice(8) as readonly number[]) || typeof profile.targetAbsorptionEu !== "number" || !(profile.targetAbsorptionEu >= 0) || typeof profile.initialHp !== "number" || !Number.isSafeInteger(profile.initialHp) || profile.initialHp <= 0 || typeof profile.kineticCouplingRatio !== "number" || !(profile.kineticCouplingRatio > 0 && profile.kineticCouplingRatio <= 1)) throw new Error(`safe-range target physics profile ${expected[0]} is invalid`);
  });
  const { sourceDigest: _sourceDigest, ...body } = value;
  const recomputed = `sha256:${sha256Hex(stableStringify(body))}`;
  if (digest !== recomputed) throw new Error("safe-range sourceDigest does not match the projected contract");
  const verified = deepFreeze(structuredClone(value)) as unknown as RuntimeSafeRangeManifest;
  verifiedSafeRangeManifests.add(verified);
  return verified;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

function sha256Hex(text: string): string {
  const source = new TextEncoder().encode(text);
  const bitLength = source.length * 8;
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const constants = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const words = new Uint32Array(64);
  const rotate = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) { const a = words[index - 15]!, b = words[index - 2]!; const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3); const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10); words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0; }
    let [a,b,c,d,e,f,g,h] = state;
    for (let index = 0; index < 64; index += 1) { const s1=rotate(e!,6)^rotate(e!,11)^rotate(e!,25), choose=(e!&f!)^(~e!&g!), t1=(h!+s1+choose+constants[index]!+words[index]!)>>>0, s0=rotate(a!,2)^rotate(a!,13)^rotate(a!,22), majority=(a!&b!)^(a!&c!)^(b!&c!), t2=(s0+majority)>>>0; h=g;g=f;f=e;e=(d!+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    state[0]=(state[0]!+a!)>>>0;state[1]=(state[1]!+b!)>>>0;state[2]=(state[2]!+c!)>>>0;state[3]=(state[3]!+d!)>>>0;state[4]=(state[4]!+e!)>>>0;state[5]=(state[5]!+f!)>>>0;state[6]=(state[6]!+g!)>>>0;state[7]=(state[7]!+h!)>>>0;
  }
  return [...state].map((word) => word.toString(16).padStart(8, "0")).join("");
}
function safeRangeRuntimeRectInsideScene(rect: Record<string, unknown>, sceneWidth: number, sceneHeight: number): boolean {
  const { x, y, width, height } = rect;
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) && Number.isSafeInteger(width) && Number.isSafeInteger(height) && (x as number) >= 0 && (y as number) >= 0 && (width as number) > 0 && (height as number) > 0 && (x as number) + (width as number) <= sceneWidth && (y as number) + (height as number) <= sceneHeight;
}
function safeRangeRuntimeRectsOverlap(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const lx = left.x as number, ly = left.y as number, lw = left.width as number, lh = left.height as number, rx = right.x as number, ry = right.y as number, rw = right.width as number, rh = right.height as number;
  return lx < rx + rw && lx + lw > rx && ly < ry + rh && ly + lh > ry;
}function sameRect(value: unknown, expected: readonly number[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const rect = value as Record<string, unknown>;
  return Object.keys(rect).join("|") === "x|y|width|height" && rect.x === expected[0] && rect.y === expected[1] && rect.width === expected[2] && rect.height === expected[3];
}
function exactAst(value: unknown, label: string): void {
  exactObject(value, { subjectHead: "word.telo", commandParticle: "o", action: "word.tawa", manner: "word.wawa" }, label);
}

function exactObject(value: unknown, expected: Readonly<Record<string, unknown>>, label: string): void {
  const actual = record(value, label);
  const keys = Object.keys(expected);
  if (!same(Object.keys(actual), keys) || keys.some((key) => actual[key] !== expected[key])) throw new Error(`${label} is invalid`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function objectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => record(item, `${label}[${index}]`));
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function same(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}
