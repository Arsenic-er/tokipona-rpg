export type RuntimeInfrastructureTaskPredicateMode = "all" | "any";
export type RuntimeInfrastructureRouteKind = "non_magic" | "optional_magic";
export type RuntimeCisternLengthClass = "short" | "default" | "long";

export interface RuntimeInfrastructureTaskModeManifest {
  readonly id: string;
  readonly completionValid: boolean;
  readonly persistenceScope: string;
  readonly persistsAcrossReload: boolean;
  readonly patchRecordRef: string | null;
}

export interface RuntimeInfrastructureTaskSolutionManifest {
  readonly id: string;
  readonly routeKind: RuntimeInfrastructureRouteKind;
  readonly chapterSolutionFamily: string;
  readonly mainline: boolean;
  readonly resultMode: string;
  readonly requiredActions: readonly string[];
  readonly requiredWorldPredicates: readonly string[];
}

export interface RuntimeInfrastructureLanguageExposureManifest {
  readonly wordId: string;
  readonly discoveryTrigger: string;
  readonly learningPrompt: string;
  readonly eligibleStateProposals: readonly string[];
  readonly automaticMasteryForbidden: boolean;
  readonly toolSolutionStillAllowsObservation: boolean;
}

export interface RuntimeInfrastructureGrammarContactManifest {
  readonly token: string;
  readonly contactKind: string;
  readonly automaticStateGrant: boolean;
  readonly productionRequired: boolean;
  readonly masteryEvidenceAllowed: boolean;
}

export interface RuntimeCisternStageManifest {
  readonly id: RuntimeCisternLengthClass;
  readonly familyId: string;
  readonly canonicalWordIds: readonly string[];
  readonly resolvedLengthClass: RuntimeCisternLengthClass;
  readonly activationMp: number;
  readonly receiverWorldPredicates: readonly string[];
}

export interface RuntimeCisternFamilyManifest {
  readonly id: string;
  readonly independentCompletion: boolean;
  readonly completionPredicate: string;
  readonly stageIds: readonly RuntimeCisternLengthClass[];
  readonly toolBypassSolutionId: string;
  readonly languageEvidenceFromToolBypass: false;
}

export interface RuntimeCisternTaskManifest {
  readonly stages: readonly RuntimeCisternStageManifest[];
  readonly families: readonly RuntimeCisternFamilyManifest[];
  readonly h0H1AnswerTokenIdsVisible: false;
  readonly legalWrongLengthCastCompletesStage: false;
  readonly maximumSoftlockRecoverySeconds: number;
  readonly capacityMilestoneRef: {
    readonly sourcePath: string;
    readonly milestoneId: string;
    readonly writerEvent: string;
  };
  readonly completionFlags: readonly string[];
}

export interface RuntimeReturnFlowEvidenceManifest {
  readonly wordId: "word.wawa";
  readonly sourceTargetId: "return_flow.inert_force_indicator";
  readonly sourceTargetClass: "inert_return_flow_mechanism";
  readonly prerequisiteGraphId: "attack.water.forceful_motion.prerequisite_graph";
  readonly prerequisiteNodeId: "use.intensity.inert";
  readonly evidenceType: "noncombat_intensity";
  readonly concept: "word.wawa";
  readonly minimumEvidence: 1;
  readonly eligibleEvidenceKinds: readonly ["discovery", "attunement", "grounding"];
  readonly maximumPromptLevel: 1;
  readonly answerTokenIdsVisible: false;
  readonly fixedSlotCueVisible: false;
  readonly colorOnlyCueAllowed: false;
  readonly independentFromSolution: true;
  readonly taskCompletionReadsEvidence: false;
  readonly toolBypassCountsAsEvidence: false;
  readonly wildlifeActionsCountAsEvidence: false;
  readonly harmCountsAsEvidence: false;
  readonly forbiddenTargetClasses: readonly string[];
  readonly forbiddenOutputs: readonly string[];
}

export interface RuntimeReturnFlowTaskManifest {
  readonly familyId: "ecology_and_return_flow";
  readonly sceneId: "scene.valley.return_channel";
  readonly regionId: "valley_prologue";
  readonly maximumSoftlockRecoverySeconds: number;
  readonly entryPrerequisiteFlag: "exit_ladder_lowered";
  readonly exitPrerequisiteFlag: "settlement_supply_stable";
  readonly solutions: readonly Readonly<{ readonly id: string; readonly routeKind: "non_magic"; readonly mainline: true; readonly requiredActions: readonly string[] }>[];
  readonly sceneSizeTiles: readonly [30, 26];
  readonly targetIds: readonly string[];
  readonly solutionIds: readonly string[];
  readonly sharedPredicateExpectations: Readonly<Record<string, boolean>>;
  readonly completionEvent: "return_flow_committed";
  readonly completionFlags: readonly ["settlement_supply_stable", "wet_meadow_restored"];
  readonly patchRecordRef: "patch.valley.return_flow.v0.1";
  readonly wawaEvidence: RuntimeReturnFlowEvidenceManifest;
  readonly ecologyReturn: Readonly<{ readonly ecologyId: "valley_prologue"; readonly eventId: "wildlife_return_after_flow"; readonly triggerStates: readonly ["settlement_supply_stable", "wet_meadow_restored"]; readonly persistentWrite: null; readonly firstReturnChannelVisitVisible: true; readonly rabbitHomeSceneId: "scene.valley.return_channel"; readonly frogReturnCondition: string }>;
  readonly zeroAttack: Readonly<{ readonly zeroAttackMainline: true; readonly mandatoryKills: 0; readonly requiredQuestDrops: 0; readonly languageEvidenceFromHarmForbidden: true; readonly attackQualificationEvidenceFromReturn: false; readonly attackUnlockFromReturn: false; readonly mandatoryCombatEncounters: 0; readonly formalAttackFirstValidationTarget: "safe_range_inert_targets" }>;
}

export interface RuntimeInfrastructureTaskManifest {
  readonly id: string;
  readonly sourcePath: string;
  readonly familyId: string;
  readonly chapterFlowId: string;
  readonly chapterSegmentId: string;
  readonly regionId: string;
  readonly regionNodeId: string;
  readonly sceneId: string;
  readonly implementationBoundary: string;
  readonly predicateMode: RuntimeInfrastructureTaskPredicateMode;
  readonly worldGoalPredicates: readonly Readonly<{ id: string; expression: string }>[];
  readonly modes: readonly RuntimeInfrastructureTaskModeManifest[];
  readonly validResultModes: readonly string[];
  readonly solutions: readonly RuntimeInfrastructureTaskSolutionManifest[];
  readonly nonMagicMainlineSolutionIds: readonly string[];
  readonly entryGuardAny: readonly string[];
  readonly exitGuardAny: readonly string[];
  readonly materialPatchRefs: readonly string[];
  readonly languageExposure: readonly RuntimeInfrastructureLanguageExposureManifest[];
  readonly grammarContacts: readonly RuntimeInfrastructureGrammarContactManifest[];
  readonly materialReactionKinds: readonly string[];
  readonly maximumSoftlockRecoverySeconds: number;
  readonly recoveryActions: readonly string[];
  readonly recoveryPreserves: readonly string[];
  readonly cistern: RuntimeCisternTaskManifest | null;
  readonly returnFlow: RuntimeReturnFlowTaskManifest | null;
}

export interface RuntimeInfrastructureTaskManifestIndex {
  readonly sourceDigest: `sha256:${string}`;
  readonly byId: Readonly<Record<string, RuntimeInfrastructureTaskManifest>>;
}

/** Fail-closed runtime boundary for generated infrastructure task contracts. */
export function readRuntimeInfrastructureTaskManifestIndex(
  candidate: unknown,
): RuntimeInfrastructureTaskManifestIndex {
  const root = record(candidate, "runtime content artifact");
  const tasks = record(root.infrastructureTasks, "runtime content artifact.infrastructureTasks");
  const digest = stringValue(tasks.sourceDigest, "infrastructureTasks.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error("infrastructureTasks.sourceDigest must be a sha256 digest");
  }
  const rawById = record(tasks.byId, "infrastructureTasks.byId");
  const byId: Record<string, RuntimeInfrastructureTaskManifest> = {};
  for (const [taskId, value] of Object.entries(rawById)) {
    const raw = record(value, `infrastructureTasks.byId.${taskId}`);
    if (raw.id !== taskId) throw new Error(`infrastructure task key ${taskId} does not match id`);
    for (const name of [
      "worldGoalPredicates", "modes", "validResultModes", "solutions",
      "nonMagicMainlineSolutionIds", "entryGuardAny", "exitGuardAny",
      "materialPatchRefs", "languageExposure", "grammarContacts",
      "materialReactionKinds", "recoveryActions", "recoveryPreserves",
    ] as const) {
      if (!Array.isArray(raw[name])) throw new Error(`infrastructure task ${taskId}.${name} must be an array`);
    }
    if (raw.predicateMode !== "all" && raw.predicateMode !== "any") {
      throw new Error(`infrastructure task ${taskId}.predicateMode must be all or any`);
    }
    if (typeof raw.maximumSoftlockRecoverySeconds !== "number" ||
        raw.maximumSoftlockRecoverySeconds <= 0 || raw.maximumSoftlockRecoverySeconds > 60) {
      throw new Error(`infrastructure task ${taskId} must recover within 60 seconds`);
    }
    if (raw.cistern !== null) validateRuntimeCisternManifest(raw.cistern, taskId);
    if (taskId === "ch01_length_cistern" && raw.cistern === null) {
      throw new Error("ch01_length_cistern requires its dedicated runtime cistern contract");
    }
    if (raw.returnFlow !== null) validateRuntimeReturnFlowManifest(raw.returnFlow, taskId);
    if (taskId === "ch01_return_flow") {
      if (raw.returnFlow === null) throw new Error("ch01_return_flow requires its dedicated runtime return-flow contract");
      if (raw.sceneId !== "scene.valley.return_channel" || raw.predicateMode !== "all" || !sameStrings(raw.nonMagicMainlineSolutionIds, ["return_flow.repair_overflow", "return_flow.clear_mud", "return_flow.reuse_old_channel"]) || !sameStrings(raw.entryGuardAny, ["exit_ladder_lowered == true"]) || !sameStrings(raw.exitGuardAny, ["settlement_supply_stable == true"])) throw new Error("ch01_return_flow task envelope is noncanonical");
      const goals = objectArray(raw.worldGoalPredicates, "ch01_return_flow.worldGoalPredicates").map((goal) => goal.expression);
      if (!sameStrings(goals, ["settlement_supply_stable == true", "wet_meadow_restored == true"])) throw new Error("ch01_return_flow goals are noncanonical");
      const solutions = objectArray(raw.solutions, "ch01_return_flow.solutions");
      if (solutions.length !== 3 || solutions.some((solution) => solution.routeKind !== "non_magic" || solution.mainline !== true || solution.resultMode !== "restored")) throw new Error("ch01_return_flow solutions are noncanonical");
    }
    byId[taskId] = value as RuntimeInfrastructureTaskManifest;
  }
  return Object.freeze({
    sourceDigest: digest as `sha256:${string}`,
    byId: Object.freeze(byId),
  });
}

/** Returns and validates the dedicated N07 return-flow and inert-wawa evidence contract. */
export function readRuntimeReturnFlowTaskManifest(candidate: unknown): RuntimeReturnFlowTaskManifest {
  const task = readRuntimeInfrastructureTaskManifestIndex(candidate).byId.ch01_return_flow;
  if (!task?.returnFlow) throw new Error("runtime ch01_return_flow contract is missing");
  validateRuntimeReturnFlowManifest(task.returnFlow, task.id);
  return task.returnFlow;
}

function validateRuntimeReturnFlowManifest(candidate: unknown, taskId: string): asserts candidate is RuntimeReturnFlowTaskManifest {
  const flow = record(candidate, taskId + ".returnFlow");
  if (flow.entryPrerequisiteFlag !== "exit_ladder_lowered" || flow.exitPrerequisiteFlag !== "settlement_supply_stable" || flow.familyId !== "ecology_and_return_flow" || flow.sceneId !== "scene.valley.return_channel" || flow.regionId !== "valley_prologue" || typeof flow.maximumSoftlockRecoverySeconds !== "number" || flow.maximumSoftlockRecoverySeconds <= 0 || flow.maximumSoftlockRecoverySeconds > 60) throw new Error("return flow identity/recovery contract is invalid");
  const projectedSolutions = objectArray(flow.solutions, "returnFlow.solutions");
  if (!sameStrings(projectedSolutions.map(x => x.id), ["return_flow.repair_overflow", "return_flow.clear_mud", "return_flow.reuse_old_channel"]) || projectedSolutions.some(x => x.routeKind !== "non_magic" || x.mainline !== true || !nonEmptyStringArray(x.requiredActions) || new Set(x.requiredActions).size !== x.requiredActions.length)) throw new Error("return flow executable solution projection is invalid");
  if (!Array.isArray(flow.sceneSizeTiles) || flow.sceneSizeTiles.length !== 2 || flow.sceneSizeTiles[0] !== 30 || flow.sceneSizeTiles[1] !== 26) throw new Error("return flow scene must remain 30x26");
  if (!sameStrings(flow.targetIds, ["return_flow.inert_force_indicator", "return_flow.overflow_gate", "return_flow.mud_blockage", "return_flow.old_channel", "return_flow.split_flow_gauge", "return_flow.return_spout", "return_wetland.large_creature.nest_trace", "return_wetland.large_creature.young_trace", "return_wetland.large_creature.migration_channel", "return_wetland.large_creature.food_scent_guide", "return_wetland.large_creature.nonlethal_barrier"])) throw new Error("return flow targets are noncanonical");
  if (!sameStrings(flow.solutionIds, ["return_flow.repair_overflow", "return_flow.clear_mud", "return_flow.reuse_old_channel"])) throw new Error("return flow solutions are noncanonical");
  const expectations = record(flow.sharedPredicateExpectations, "returnFlow.sharedPredicateExpectations");
  if (Object.keys(expectations).sort().join("|") !== "overflowContact|settlementSupplyFlowInBand|wetMeadowFlowInBand" || expectations.settlementSupplyFlowInBand !== true || expectations.wetMeadowFlowInBand !== true || expectations.overflowContact !== false) throw new Error("return flow shared predicate polarity is invalid");
  if (flow.completionEvent !== "return_flow_committed" || flow.patchRecordRef !== "patch.valley.return_flow.v0.1" || !sameStrings(flow.completionFlags, ["settlement_supply_stable", "wet_meadow_restored"])) throw new Error("return flow completion contract is invalid");
  const evidence = record(flow.wawaEvidence, "returnFlow.wawaEvidence");
  if (!sameStrings(evidence.forbiddenTargetClasses, ["wildlife", "living", "corpse", "harvested_product", "processing_station"]) || !sameStrings(evidence.forbiddenOutputs, ["expression_capacity_growth", "artifact_surface_slot_growth", "mp_growth", "attack_qualification", "attack_unlock", "direct_damage"]) || evidence.wordId !== "word.wawa" || evidence.sourceTargetId !== "return_flow.inert_force_indicator" || evidence.sourceTargetClass !== "inert_return_flow_mechanism" || evidence.prerequisiteGraphId !== "attack.water.forceful_motion.prerequisite_graph" || evidence.prerequisiteNodeId !== "use.intensity.inert" || evidence.evidenceType !== "noncombat_intensity" || evidence.concept !== "word.wawa" || evidence.minimumEvidence !== 1 || !sameStrings(evidence.eligibleEvidenceKinds, ["discovery", "attunement", "grounding"]) || evidence.maximumPromptLevel !== 1 || evidence.answerTokenIdsVisible !== false || evidence.fixedSlotCueVisible !== false || evidence.colorOnlyCueAllowed !== false || evidence.independentFromSolution !== true || evidence.taskCompletionReadsEvidence !== false || evidence.toolBypassCountsAsEvidence !== false || evidence.wildlifeActionsCountAsEvidence !== false || evidence.harmCountsAsEvidence !== false) throw new Error("return flow wawa evidence contract is invalid");
  const ecology = record(flow.ecologyReturn, "returnFlow.ecologyReturn");
  if (ecology.ecologyId !== "valley_prologue" || ecology.eventId !== "wildlife_return_after_flow" || !sameStrings(ecology.triggerStates, ["settlement_supply_stable", "wet_meadow_restored"]) || ecology.persistentWrite !== null || ecology.firstReturnChannelVisitVisible !== true || ecology.rabbitHomeSceneId !== "scene.valley.return_channel" || typeof ecology.frogReturnCondition !== "string" || !ecology.frogReturnCondition.includes("settlement_supply_stable") || !ecology.frogReturnCondition.includes("wet_meadow_restored")) throw new Error("return flow ecology-return contract is invalid");
  const zero = record(flow.zeroAttack, "returnFlow.zeroAttack");
  if (zero.zeroAttackMainline !== true || zero.mandatoryKills !== 0 || zero.requiredQuestDrops !== 0 || zero.languageEvidenceFromHarmForbidden !== true || zero.attackQualificationEvidenceFromReturn !== false || zero.attackUnlockFromReturn !== false || zero.mandatoryCombatEncounters !== 0 || zero.formalAttackFirstValidationTarget !== "safe_range_inert_targets") throw new Error("return flow zero-attack contract is invalid");
}

/** Returns the dedicated N05 receiver contract after full infrastructure-index validation. */
export function readRuntimeCisternTaskManifest(
  candidate: unknown,
  taskId = "ch01_length_cistern",
): RuntimeCisternTaskManifest {
  const task = readRuntimeInfrastructureTaskManifestIndex(candidate).byId[taskId];
  if (!task) throw new Error(`runtime cistern task ${taskId} is missing`);
  if (!task.cistern) throw new Error(`runtime task ${taskId} has no cistern contract`);
  validateRuntimeCisternManifest(task.cistern, taskId);
  return task.cistern;
}

function validateRuntimeCisternManifest(candidate: unknown, taskId: string): asserts candidate is RuntimeCisternTaskManifest {
  const cistern = record(candidate, `${taskId}.cistern`);
  const stages = objectArray(cistern.stages, `${taskId}.cistern.stages`);
  const expectedStages = [
    { id: "short", familyId: "cistern.family_a.calibration", words: ["word.telo", "word.lili"], mp: 6 },
    { id: "default", familyId: "cistern.family_a.calibration", words: ["word.telo"], mp: 5 },
    { id: "long", familyId: "cistern.family_b.transfer", words: ["word.telo", "word.suli"], mp: 10 },
  ] as const;
  if (stages.length !== expectedStages.length) throw new Error(`${taskId}.cistern requires exactly three stages`);
  expectedStages.forEach((expected, index) => {
    const stage = stages[index];
    if (!stage || stage.id !== expected.id || stage.familyId !== expected.familyId || stage.resolvedLengthClass !== expected.id || stage.activationMp !== expected.mp ||
        !sameStrings(stage.canonicalWordIds, expected.words) || !nonEmptyStringArray(stage.receiverWorldPredicates)) {
      throw new Error(`${taskId}.cistern stage ${expected.id} is invalid`);
    }
  });
  const families = objectArray(cistern.families, `${taskId}.cistern.families`);
  if (families.length !== 2 || families[0]?.id !== "cistern.family_a.calibration" ||
      !sameStrings(families[0]?.stageIds, ["short", "default"]) || typeof families[0]?.completionPredicate !== "string" || families[0].completionPredicate.length === 0 || families[0]?.toolBypassSolutionId !== "cistern.calibration_tool_bypass" || families[0]?.independentCompletion !== true || families[0]?.languageEvidenceFromToolBypass !== false ||
      families[1]?.id !== "cistern.family_b.transfer" || !sameStrings(families[1]?.stageIds, ["long"]) || typeof families[1]?.completionPredicate !== "string" || families[1].completionPredicate.length === 0 || families[1]?.toolBypassSolutionId !== "cistern.transfer_tool_bypass" ||
      families[1]?.independentCompletion !== true || families[1]?.languageEvidenceFromToolBypass !== false) {
    throw new Error(`${taskId}.cistern families must remain independent calibration and transfer contracts`);
  }
  if (cistern.h0H1AnswerTokenIdsVisible !== false || cistern.legalWrongLengthCastCompletesStage !== false) {
    throw new Error(`${taskId}.cistern must not reveal answer tokens or pass legal wrong-length casts`);
  }
  if (typeof cistern.maximumSoftlockRecoverySeconds !== "number" || cistern.maximumSoftlockRecoverySeconds <= 0 || cistern.maximumSoftlockRecoverySeconds > 60) {
    throw new Error(`${taskId}.cistern must recover within 60 seconds`);
  }
  const ref = record(cistern.capacityMilestoneRef, `${taskId}.cistern.capacityMilestoneRef`);
  for (const field of ["sourcePath", "milestoneId", "writerEvent"] as const) stringValue(ref[field], `${taskId}.cistern.capacityMilestoneRef.${field}`);
  if (ref.sourcePath !== "data/chapters/ch01-world-literacy-prologue.v0.1.yaml" || ref.milestoneId !== "pre_cistern_length_phrase" || ref.writerEvent !== "first_evidence_package_committed") {
    throw new Error(`${taskId}.cistern capacity milestone reference is not canonical`);
  }
  if (!sameStrings(cistern.completionFlags, ["high_cistern_reconnected", "upper_channel_available", "exit_ladder_lowered"])) {
    throw new Error(`${taskId}.cistern completion flags are invalid`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function objectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => record(entry, `${label}[${index}]`));
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function nonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}
