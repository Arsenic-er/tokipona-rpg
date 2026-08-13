import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";
import type { CapabilityMilestoneMachineProjection } from "../../src/session/capability-contract.ts";
import type { RuntimeEcologyManifest, RuntimeWildlifeSpeciesManifest } from "../../src/content/runtime-ecology-manifest.ts";
import type {
  RuntimeSceneEntranceManifest,
  RuntimeSceneExitManifest,
  RuntimeSceneFacilityManifest,
  RuntimeSceneInboundRouteManifest,
  RuntimeSceneInteractionManifest,
  RuntimeSceneManifest,
  RuntimeSceneManifestIndex,
  RuntimeSceneNpcManifest,
  RuntimeSceneRecoveryManifest,
  RuntimeSceneRouteManifest,
  RuntimeSceneRouteObjectiveManifest,
  RuntimeSceneSoftFailureRecoveryManifest,
  RuntimeSceneTargetManifest,
  RuntimeSceneTaskManifest,
  RuntimeSceneTaskRefManifest,
  RuntimeSceneTradeEntryManifest,
  RuntimeTileRect,
} from "../../src/content/runtime-scene-manifest.ts";
import type {
  RuntimeCisternFamilyManifest,
  RuntimeCisternStageManifest,
  RuntimeCisternTaskManifest,
  RuntimeInfrastructureGrammarContactManifest,
  RuntimeInfrastructureLanguageExposureManifest,
  RuntimeInfrastructureTaskManifest,
  RuntimeInfrastructureTaskManifestIndex,
  RuntimeInfrastructureTaskModeManifest,
  RuntimeInfrastructureTaskSolutionManifest,
} from "../../src/content/runtime-task-manifest.ts";

export const RUNTIME_CONTENT_SCHEMA_VERSION = "tokipona.runtime-content.v0.1" as const;
export const RUNTIME_CONTENT_OUTPUT_PATH = "src/generated/content-runtime.v0.1.json" as const;
export const RUNTIME_SCENE_PLAYER_HEIGHT_PX = 14 as const;

export type RuntimeTeloLengthClass = "short" | "default" | "long";

export interface RuntimeTeloLengthProfile {
  readonly profileVersion: string;
  readonly nominalLengthPx: number;
  readonly minimumRealizedLengthPx: number;
  readonly activationMp: number;
  readonly crossSectionWidthPx: number;
}

export interface RuntimeContentArtifact {
  readonly schemaVersion: typeof RUNTIME_CONTENT_SCHEMA_VERSION;
  readonly sourceDigest: `sha256:${string}`;
  readonly source: { readonly path: string; readonly schemaVersion: string; readonly contentVersion: string };
  readonly telo: {
    readonly pixelsPerTile: number;
    readonly profiles: Readonly<Record<RuntimeTeloLengthClass, RuntimeTeloLengthProfile>>;
  };
  readonly scenes: RuntimeSceneManifestIndex;
  readonly infrastructureTasks: RuntimeInfrastructureTaskManifestIndex;
  readonly capabilityProgression: CapabilityMilestoneMachineProjection;
  readonly ecology: RuntimeEcologyManifest;
}

export function buildRuntimeContentArtifact(manifest: ContentManifest): RuntimeContentArtifact {
  const lengthSources = manifest.byKind.length_profiles;
  if (lengthSources.length !== 1) throw new Error(`Expected exactly one validated length profile source, received ${lengthSources.length}.`);
  const source = lengthSources[0];
  if (!source) throw new Error("Validated length profile source is unavailable.");
  const content = source.content;
  const pixelsPerTile = requirePositiveNumber(content, ["world_units", "pixels_per_tile"]);
  const lengthClasses = requireObject(content, ["length_classes"]);
  const telo = requireObject(content, ["element_profiles", "word.telo"]);
  const baseLengthTiles = requirePositiveNumber(telo, ["base_length_tiles"]);
  const crossSectionWidthPx = requirePositiveNumber(telo, ["cross_section_width_px"]);
  const expectedActivationMp = requireObject(telo, ["expected_activation_mp"]);
  const lengthTileFields: Readonly<Record<RuntimeTeloLengthClass, string>> = {
    short: "short_length_tiles", default: "base_length_tiles", long: "long_length_tiles",
  };
  const profiles = Object.fromEntries(([
    "short", "default", "long",
  ] as const).map((lengthClass) => {
    const nominalLengthTiles = requirePositiveNumber(telo, [lengthTileFields[lengthClass]]);
    const classContract = requireObject(lengthClasses, [lengthClass]);
    const minimumRatio = requirePositiveNumber(classContract, ["minimum_realized_ratio_to_base"]);
    const activationMp = requireNonNegativeNumber(expectedActivationMp, [lengthClass]);
    return [lengthClass, {
      profileVersion: source.schemaVersion,
      nominalLengthPx: exactProduct(nominalLengthTiles, pixelsPerTile, `${lengthClass}.nominalLengthPx`),
      minimumRealizedLengthPx: exactProduct(baseLengthTiles, pixelsPerTile, minimumRatio, `${lengthClass}.minimumRealizedLengthPx`),
      activationMp,
      crossSectionWidthPx,
    }];
  })) as unknown as Record<RuntimeTeloLengthClass, RuntimeTeloLengthProfile>;

  const chapterSources = manifest.byKind.chapter;
  if (chapterSources.length !== 1) throw new Error(`Expected exactly one validated chapter source, received ${chapterSources.length}.`);
  const chapterSource = chapterSources[0];
  if (!chapterSource) throw new Error("Validated chapter source is unavailable.");
  const authoredMilestones = requireObjectArray(chapterSource.content, ["capacity_progression", "milestones"]);
  const capacityMilestones = authoredMilestones.flatMap((milestone) => {
    const resultingState = requireObject(milestone, ["resulting_state"]);
    const capacityKeys = [
      "player_expression_capacity_meaningful_tokens",
      "artifact_surface_slot_capacity",
      "player_max_mp",
    ] as const;
    const presentCount = capacityKeys.filter((key) => readPath(resultingState, [key]) !== undefined).length;
    if (presentCount === 0) return [];
    if (presentCount !== capacityKeys.length) {
      throw new Error(`${requireString(milestone, ["milestone_id"])} must author all three capability result values.`);
    }
    return [{
      milestoneId: requireString(milestone, ["milestone_id"]),
      writerEvent: requireString(milestone, ["unique_writer_event"]),
      resultingState: {
        expressionCapacityWords: requirePositiveInteger(resultingState, [capacityKeys[0]]),
        focusSlots: requirePositiveInteger(resultingState, [capacityKeys[1]]),
        maxMp: requirePositiveNumber(resultingState, [capacityKeys[2]]),
      },
    }];
  });
  if (capacityMilestones.length !== 3) {
    throw new Error(`Capability progression must project exactly three complete milestones, received ${capacityMilestones.length}.`);
  }
  const capabilityProgression: CapabilityMilestoneMachineProjection = {
    sourcePath: chapterSource.path,
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(requireObject(chapterSource.content, ["capacity_progression"]))).digest("hex")}`,
    contractRevision: chapterSource.contentVersion,
    capacityMilestones,
  };

  const ecologySources = manifest.byKind.ecology;
  if (ecologySources.length !== 1) throw new Error(`Expected exactly one validated ecology source, received ${ecologySources.length}.`);
  const ecologySource = ecologySources[0];
  if (!ecologySource) throw new Error("Validated ecology source is unavailable.");
  const ecologyContent = ecologySource.content;
  const ecologyTiming = requireObject(ecologyContent, ["shared_behavior", "timing_seconds"]);
  const ecologyContracts = requireObject(ecologyContent, ["contracts"]);
  requireExactNumber(ecologyContracts, ["mandatory_kills"], 0);
  requireExactNumber(ecologyContracts, ["required_quest_drops"], 0);
  requireExactBoolean(ecologyContracts, ["language_evidence_from_harm_forbidden"], true);
  const ecologyEntities = requireObjectArray(ecologyContent, ["entities"]);
  const projectWildlife = (entityId: string, species: "rabbit" | "fox"): RuntimeWildlifeSpeciesManifest => {
    const entity = ecologyEntities.find((candidate) => requireString(candidate, ["entity_id"]) === entityId);
    if (!entity) throw new Error(`Ecology entity ${entityId} is unavailable.`);
    const action = requireObject(entity, ["defensive_action"]);
    const guardingYoungDamage = species === "fox"
      ? requireNonNegativeNumber(action, ["guarding_young_damage_provisional"])
      : null;
    return {
      entityId,
      species,
      maxHp: requirePositiveNumber(entity, ["max_hp_provisional"]),
      homeSceneId: requireString(entity, ["home_scene"]),
      spawnAnchor: requireString(entity, ["spawn_anchor"]),
      realEscapeExit: requireString(entity, ["real_escape_exit"]),
      warningZoneAnchor: optionalString(entity, ["warning_zone_anchor"]),
      defensiveActionKind: requireString(action, ["kind"]),
      defensiveDamage: requireNonNegativeNumber(action, ["damage_provisional"]),
      guardingYoungDamage,
      defenseOnlyWhen: requireStringArray(entity, ["defense_only_when"]),
      preferredResponse: requireString(entity, ["preferred_response"]),
      returnCondition: optionalString(entity, ["cross_scene_return_condition"]),
    };
  };
  const denSceneSource = manifest.byKind.scene.find((candidate) => candidate.content.scene_id === "scene.valley.den_bypass");
  if (!denSceneSource) throw new Error("N06 scene is required for the fox spatial projection.");
  const foxBindings = requireObjectArray(denSceneSource.content, ["wildlife_bindings"])
    .filter((candidate) => candidate.entity_id === "wildlife.fox.den");
  if (foxBindings.length !== 1) throw new Error(`N06 requires exactly one canonical fox wildlife binding; received ${foxBindings.length}.`);
  const foxBinding = foxBindings[0]!;
  const spatialRect = (field: string) => {
    const value = requireObject(foxBinding, [field]);
    return {
      x: requireNonNegativeNumber(value, ["x"]),
      y: requireNonNegativeNumber(value, ["y"]),
      width: requirePositiveNumber(value, ["width"]),
      height: requirePositiveNumber(value, ["height"]),
    };
  };
  const ecologyBody = {
    ecologyId: requireExactString(ecologyContent, ["ecology_id"], "valley_prologue"),
    minimumWarningTelegraphSeconds: requirePositiveNumber(ecologyTiming, ["minimum_warning_telegraph"]),
    intrusionBeforeDefenseSeconds: requirePositiveNumber(ecologyTiming, ["intrusion_before_defense"]),
    loseSightSeconds: requirePositiveNumber(ecologyTiming, ["lose_sight"]),
    deescalateSeconds: requirePositiveNumber(ecologyTiming, ["deescalate"]),
    perceptionTiles: requireExactNumber(requireObject(ecologyContent, ["shared_behavior", "distance_tiles"]), ["perception"], 8),
    defensiveContactTiles: requirePositiveNumber(requireObject(ecologyContent, ["shared_behavior", "distance_tiles"]), ["defensive_contact"]),
    staffFear: requireExactNumber(requireObjectArray(requireObject(ecologyContent, ["shared_behavior", "deterrence"]), ["sources"]).find((source) => source.action === "weapon_swing_without_hit") ?? {}, ["fear"], 15),
    noiseFear: requireExactNumber(requireObjectArray(requireObject(ecologyContent, ["shared_behavior", "deterrence"]), ["sources"]).find((source) => source.action === "ground_impact_or_loud_sound") ?? {}, ["fear"], 20),
    lifeIdAlgorithm: requireExactString(requireObject(ecologyContent, ["life_cycle_contract"]), ["life_instance_id_formula"], "sha256(region_id, entity_id, spawn_generation, spawn_sequence)")
      .replaceAll(", ", ",") as "sha256(region_id,entity_id,spawn_generation,spawn_sequence)",
    mandatoryKills: 0 as const,
    requiredQuestDrops: 0 as const,
    languageEvidenceFromHarmForbidden: true as const,
    species: {
      rabbit: projectWildlife("wildlife.rabbit.valley", "rabbit"),
      fox: projectWildlife("wildlife.fox.den", "fox"),
    },
    foxSpatialBinding: {
      sceneId: "scene.valley.den_bypass" as const,
      entityId: "wildlife.fox.den" as const,
      spawnPositionTiles: requireNumberPair(foxBinding, ["spawn_position_tiles"]),
      escapeBoundsTiles: spatialRect("escape_bounds_tiles"),
      warningBoundsTiles: spatialRect("warning_bounds_tiles"),
      denBoundsTiles: spatialRect("den_bounds_tiles"),
    },
  };
  const ecology: RuntimeEcologyManifest = {
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(ecologyBody)).digest("hex")}`,
    ...ecologyBody,
  };

  const sceneSources = [...manifest.byKind.scene].sort((left, right) => left.path.localeCompare(right.path));
  const scenes = Object.fromEntries(sceneSources.map((sceneSource) => {
    const scene = sceneSource.content;
    const sceneId = requireString(scene, ["scene_id"]);
    const tileSizePx = requireExactNumber(scene, ["tile_size_px"], 16) as 16;
    const sizeTiles = {
      width: requirePositiveInteger(scene, ["size_tiles", "width"]),
      height: requirePositiveInteger(scene, ["size_tiles", "height"]),
    };
    const entrances: RuntimeSceneEntranceManifest[] = requireObjectArray(scene, ["entrances"]).map((entry) => {
      const spawnTile = requireNumberPair(entry, ["spawn_tile"]);
      return {
        id: requireString(entry, ["entrance_id"]),
        spawnTile,
        spawnPx: {
          x: exactProduct(spawnTile[0], tileSizePx, "entrance.spawnPx.x"),
          y: exactDifference(exactProduct(sizeTiles.height - spawnTile[1], tileSizePx, "entrance.bottomToTopPx"), RUNTIME_SCENE_PLAYER_HEIGHT_PX, "entrance.spawnPx.y"),
        },
        recoveryEntry: requireBoolean(entry, ["recovery_entry"]),
        checkpointPolicy: requireString(entry, ["checkpoint_policy"]),
      };
    });
    const exits: RuntimeSceneExitManifest[] = requireObjectArray(scene, ["exits"]).map((exit) => {
      const boundsTiles = requireTileRect(exit, ["trigger_rect_tiles"]);
      const boundsPx: RuntimeTileRect = {
        x: exactProduct(boundsTiles.x, tileSizePx, "exit.boundsPx.x"),
        y: exactProduct(sizeTiles.height - boundsTiles.y - boundsTiles.height, tileSizePx, "exit.boundsPx.y"),
        width: exactProduct(boundsTiles.width, tileSizePx, "exit.boundsPx.width"),
        height: exactProduct(boundsTiles.height, tileSizePx, "exit.boundsPx.height"),
      };
      const targetSceneId = optionalString(exit, ["target_scene_id"]);
      const target = targetSceneId !== null
        ? { kind: "scene" as const, sceneId: targetSceneId, entranceId: requireString(exit, ["target_entrance_id"]) }
        : { kind: "region_node" as const, regionNodeId: requireString(exit, ["target_region_node_id"]) };
      return {
        id: requireString(exit, ["exit_id"]), boundsTiles, boundsPx, target,
        firstTraverseCommit: optionalString(exit, ["on_first_traverse_commit"]),
        traversalGuardAny: readGuardAny(exit, ["traversal_guard"]),
      };
    });
    const routeObjectives: RuntimeSceneRouteObjectiveManifest[] = requireObjectArray(scene, ["route_objectives"]).map((objective) => ({
      id: requireString(objective, ["objective_id"]), predicate: requireString(objective, ["predicate"]),
    }));
    const routes: RuntimeSceneRouteManifest[] = requireObjectArray(scene, ["routes"]).map((route) => ({
      id: requireString(route, ["route_id"]),
      kind: requireRouteKind(route, ["route_kind"]),
      solutionFamily: requireString(route, ["solution_family"]),
      fromEntranceId: requireString(route, ["from_entrance_id"]),
      toExitId: requireString(route, ["to_exit_id"]),
      objectiveIds: requireStringArray(route, ["objective_ids"]),
    }));
    const targets: RuntimeSceneTargetManifest[] = requireObjectArray(scene, ["targets"]).map((target) => ({
      id: requireString(target, ["target_id"]), kind: requireString(target, ["target_kind"]), material: requireString(target, ["material"]),
      interactionPointTiles: target.interaction_point_tiles === undefined ? null : requireNumberPair(target, ["interaction_point_tiles"]),
    }));
    const interactions: RuntimeSceneInteractionManifest[] = requireObjectArray(scene, ["interactions"]).map((interaction) => ({
      id: requireString(interaction, ["interaction_id"]), targetId: requireString(interaction, ["target_id"]), verb: requireString(interaction, ["verb"]),
      toolOrMagicRequired: optionalBoolean(interaction, ["tool_or_magic_required"]), optionalWordId: optionalString(interaction, ["optional_word_id"]),
      npcId: optionalString(interaction, ["npc_id"]), facilityId: optionalString(interaction, ["facility_id"]), taskId: optionalString(interaction, ["task_id"]),
    }));
    const npcs: RuntimeSceneNpcManifest[] = optionalObjectArray(scene, ["npcs"]).map((npc) => ({
      id: requireString(npc, ["npc_id"]), professionId: requireString(npc, ["profession_id"]),
      professionLabelZh: requireString(npc, ["profession_label_zh"]), functions: requireStringArray(npc, ["functions"]),
      interactionIds: requireStringArray(npc, ["interaction_ids"]),
    }));
    const facilities: RuntimeSceneFacilityManifest[] = optionalObjectArray(scene, ["facilities"]).map((facility) => ({
      id: requireString(facility, ["facility_id"]), kind: requireString(facility, ["facility_kind"]),
      targetId: requireString(facility, ["target_id"]), interactionIds: requireStringArray(facility, ["interaction_ids"]),
      publicRelief: requireBoolean(facility, ["public_relief"]), economyEligible: requireBoolean(facility, ["economy_eligible"]),
    }));
    const tasks: RuntimeSceneTaskManifest[] = optionalObjectArray(scene, ["tasks"]).map((task) => ({
      id: requireString(task, ["task_id"]), familyId: requireString(task, ["task_family_id"]),
      assignmentNpcId: requireString(task, ["assignment_npc_id"]), objectiveIds: requireStringArray(task, ["objective_ids"]),
      interactionIds: requireStringArray(task, ["interaction_ids"]), nonviolent: requireBoolean(task, ["nonviolent"]),
      magicRequired: requireBoolean(task, ["magic_required"]), requiredForMainline: requireBoolean(task, ["required_for_mainline"]),
      solutionFamilies: requireStringArray(task, ["solution_families"]),
      reward: {
        currency: requireString(task, ["reward", "currency"]), amount: requireNonNegativeNumber(task, ["reward", "amount"]),
        claimOnce: requireBoolean(task, ["reward", "claim_once"]), receiptRequired: requireBoolean(task, ["reward", "receipt_required"]),
      },
      rewardIdempotencyKeyFields: requireStringArray(task, ["reward_idempotency_key_fields"]),
      recoveryActions: requireStringArray(task, ["recovery_actions"]),
    }));
    const taskRefs: RuntimeSceneTaskRefManifest[] = optionalObjectArray(scene, ["task_refs"]).map((entry) => ({
      id: requireString(entry, ["task_id"]),
      authoritativeTaskSourcePath: resolveRepositoryContentPath(sceneSource.path, requireString(entry, ["task_ref"])),
      objectiveIds: requireStringArray(entry, ["objective_ids"]),
    }));    const tradeEntries: RuntimeSceneTradeEntryManifest[] = optionalObjectArray(scene, ["trade_entries"]).map((entry) => ({
      id: requireString(entry, ["trade_entry_id"]), npcId: requireString(entry, ["npc_id"]),
      interactionId: requireString(entry, ["interaction_id"]),
      authoritativeEconomySourcePath: resolveRepositoryContentPath(sceneSource.path, requireString(entry, ["authoritative_economy_ref"])),
      merchantIds: requireStringArray(entry, ["merchant_ids"]),
    }));
    const inboundRoutes: RuntimeSceneInboundRouteManifest[] = optionalObjectArray(scene, ["inbound_route_refs"]).map((route) => ({
      id: requireString(route, ["inbound_ref_id"]), sourceSceneId: requireString(route, ["source_scene_id"]),
      sourceExitId: requireString(route, ["source_exit_id"]), entranceId: requireString(route, ["entrance_id"]),
    }));
    const softFailureRecoveries: RuntimeSceneSoftFailureRecoveryManifest[] = optionalObjectArray(scene, ["soft_failure_recoveries"]).map((recovery) => ({
      id: requireString(recovery, ["failure_id"]), action: requireString(recovery, ["action"]),
      preserves: requireStringArray(recovery, ["preserves"]),
    }));
    const recovery: RuntimeSceneRecoveryManifest = {
      entryEntranceId: requireString(scene, ["recovery", "entry_entrance_id"]),
      maximumSoftlockRecoverySeconds: requirePositiveNumber(scene, ["recovery", "maximum_softlock_recovery_seconds"]),
      actions: requireStringArray(scene, ["recovery", "actions"]), preserves: requireStringArray(scene, ["recovery", "preserves"]),
    };
    const result: RuntimeSceneManifest = {
      sceneId, sourcePath: sceneSource.path,
      regionId: requireString(scene, ["region_id"]), regionNodeId: requireString(scene, ["region_node_id"]),
      chapterFlowId: requireString(scene, ["chapter_flow_id"]), chapterSegmentId: requireString(scene, ["chapter_segment_id"]),
      tileSizePx, sizeTiles, collisionRows: requireStringArray(scene, ["collision_rows_top_down"]), entrances, exits, recovery,
      routeObjectives, routes, nonMagicAlternativeRouteIds: routes.filter((route) => route.kind === "non_magic").map((route) => route.id),
      targets, interactions, npcs, facilities, tasks, taskRefs, tradeEntries, inboundRoutes, softFailureRecoveries,
      materialPatchRecordRefs: requireObjectArray(scene, ["material_patches"]).map((patch) => optionalString(patch, ["patch_record_ref"])).filter((value): value is string => value !== null),
    };
    return [sceneId, result];
  }));
  const infrastructureTaskSources = [...manifest.byKind.task]
    .filter((taskSource) => taskSource.content.task_type === "infrastructure_world_predicate")
    .sort((left, right) => left.path.localeCompare(right.path));
  const infrastructureTasks = Object.fromEntries(infrastructureTaskSources.map((taskSource) => {
    const task = taskSource.content;
    const id = requireString(task, ["task_id"]);
    const sceneSourcePath = resolveRepositoryContentPath(taskSource.path, requireString(task, ["scene_ref"]));
    const sceneSource = manifest.sources[sceneSourcePath];
    if (!sceneSource || sceneSource.kind !== "scene") throw new Error(`${id}.scene_ref must resolve to a validated scene`);
    const modes: RuntimeInfrastructureTaskModeManifest[] = requireObjectArray(task, ["result_modes"]).map((mode) => ({
      id: requireString(mode, ["mode_id"]),
      completionValid: requireBoolean(mode, ["completion_valid"]),
      persistenceScope: requireString(mode, ["persistence_scope"]),
      persistsAcrossReload: requireBoolean(mode, ["persists_across_reload"]),
      patchRecordRef: nullableString(mode, ["patch_record_ref"]),
    }));
    const solutions: RuntimeInfrastructureTaskSolutionManifest[] = requireObjectArray(task, ["solution_families"]).map((solution) => ({
      id: requireString(solution, ["solution_id"]),
      routeKind: requireRouteKind(solution, ["route_kind"]),
      chapterSolutionFamily: requireString(solution, ["chapter_solution_family"]),
      mainline: requireBoolean(solution, ["mainline"]),
      resultMode: requireString(solution, ["result_mode"]),
      requiredActions: requireStringArray(solution, ["required_actions"]),
      requiredWorldPredicates: requireStringArray(solution, ["required_world_predicates"]),
    }));
    const languageExposure: RuntimeInfrastructureLanguageExposureManifest[] = optionalObjectArray(task, ["language_exposure"]).map((exposure) => ({
      wordId: requireString(exposure, ["word_id"]),
      discoveryTrigger: requireString(exposure, ["discovery_trigger"]),
      learningPrompt: requireString(exposure, ["learning_prompt"]),
      eligibleStateProposals: requireStringArray(exposure, ["eligible_state_proposals"]),
      automaticMasteryForbidden: requireBoolean(exposure, ["automatic_mastery_forbidden"]),
      toolSolutionStillAllowsObservation: requireBoolean(exposure, ["tool_solution_still_allows_observation"]),
    }));
    const grammarContacts: RuntimeInfrastructureGrammarContactManifest[] = optionalObjectArray(task, ["grammar_contacts"]).map((contact) => ({
      token: requireString(contact, ["token"]),
      contactKind: requireString(contact, ["contact_kind"]),
      automaticStateGrant: requireBoolean(contact, ["automatic_state_grant"]),
      productionRequired: requireBoolean(contact, ["production_required"]),
      masteryEvidenceAllowed: requireBoolean(contact, ["mastery_evidence_allowed"]),
    }));
    const cistern: RuntimeCisternTaskManifest | null = id === "ch01_length_cistern" ? (() => {
      const familySources = requireObjectArray(task, ["task_families"]);
      const families: RuntimeCisternFamilyManifest[] = familySources.map((family) => ({
        id: requireString(family, ["family_id"]),
        independentCompletion: requireBoolean(family, ["independent_completion"]),
        completionPredicate: requireString(family, ["completion_predicate"]),
        stageIds: requireStringArray(family, ["stage_ids"]) as RuntimeCisternFamilyManifest["stageIds"],
        toolBypassSolutionId: requireString(family, ["tool_bypass_solution_id"]),
        languageEvidenceFromToolBypass: requireExactBoolean(family, ["language_evidence_from_tool_bypass"], false),
      }));
      const familyIdByStage = new Map(families.flatMap((family) => family.stageIds.map((stageId) => [stageId, family.id] as const)));
      const stages: RuntimeCisternStageManifest[] = (["short", "default", "long"] as const).map((stageId) => {
        const stage = requireObject(task, ["stage_contracts", stageId]);
        const direct = requireObject(stage, ["direct_teaching_solution"]);
        const familyId = familyIdByStage.get(stageId);
        if (!familyId) throw new Error(`${id}.task_families must own stage ${stageId}`);
        return {
          id: stageId,
          familyId,
          canonicalWordIds: requireStringArray(direct, ["canonical_word_ids"]),
          resolvedLengthClass: requireExactString(direct, ["resolved_length_class"], stageId),
          activationMp: requireNonNegativeNumber(direct, ["activation_mp"]),
          receiverWorldPredicates: requireStringArray(stage, ["world_goal_predicates"]),
        };
      });
      const h0 = requireObject(task, ["hint_ladder", "levels", "H0"]);
      const h1 = requireObject(task, ["hint_ladder", "levels", "H1"]);
      requireExactBoolean(h0, ["answer_token_ids_visible"], false);
      requireExactBoolean(h1, ["answer_token_ids_visible"], false);
      const capacity = requireObject(task, ["capacity_milestone_binding"]);
      const setFlags = requireObject(task, ["completion", "world_transition", "set_flags"]);
      const completionFlags = ["high_cistern_reconnected", "upper_channel_available", "exit_ladder_lowered"]
        .map((flag) => {
          requireExactBoolean(setFlags, [flag], true);
          return flag;
        });
      requireExactBoolean(task, ["semantic_acceptance", "legal_wrong_length_cast_executes_but_never_completes_stage"], true);
      return {
        stages,
        families,
        h0H1AnswerTokenIdsVisible: false,
        legalWrongLengthCastCompletesStage: false,
        maximumSoftlockRecoverySeconds: requirePositiveNumber(task, ["recovery", "maximum_softlock_recovery_seconds"]),
        capacityMilestoneRef: {
          sourcePath: resolveRepositoryContentPath(taskSource.path, requireString(capacity, ["source_ref"])),
          milestoneId: requireString(capacity, ["milestone_id"]),
          writerEvent: requireString(capacity, ["writer_event"]),
        },
        completionFlags,
      };
    })() : null;
    const result: RuntimeInfrastructureTaskManifest = {
      id,
      sourcePath: taskSource.path,
      familyId: requireString(task, ["task_family_id"]),
      chapterFlowId: requireString(task, ["chapter_flow_id"]),
      chapterSegmentId: requireString(task, ["chapter_segment_id"]),
      regionId: requireString(task, ["region_id"]),
      regionNodeId: requireString(task, ["region_node_id"]),
      sceneId: requireString(sceneSource.content, ["scene_id"]),
      implementationBoundary: requireString(task, ["implementation_boundary"]),
      predicateMode: requirePredicateMode(task, ["world_goal", "predicate_mode"]),
      worldGoalPredicates: requireObjectArray(task, ["world_goal", "predicates"]).map((predicate) => ({
        id: requireString(predicate, ["predicate_id"]), expression: requireString(predicate, ["expression"]),
      })),
      modes,
      validResultModes: requireStringArray(task, ["completion", "valid_result_modes"]),
      solutions,
      nonMagicMainlineSolutionIds: solutions.filter((solution) => solution.routeKind === "non_magic" && solution.mainline).map((solution) => solution.id),
      entryGuardAny: requireStringArray(task, ["entry_guard_any"]),
      exitGuardAny: requireStringArray(task, ["exit_guard_any"]),
      materialPatchRefs: requireStringArray(task, ["material_patch_refs"]),
      languageExposure,
      grammarContacts,
      materialReactionKinds: optionalObjectArray(task, ["material_reactions"]).map((reaction) => requireString(reaction, ["material"])),
      maximumSoftlockRecoverySeconds: requirePositiveNumber(task, ["recovery", "maximum_softlock_recovery_seconds"]),
      recoveryActions: requireStringArray(task, ["recovery", "actions"]),
      recoveryPreserves: requireStringArray(task, ["recovery", "preserves"]),
      cistern,
    };
    return [id, result];
  }));
  const cisternCapacitySourcePath = infrastructureTasks.ch01_length_cistern?.cistern?.capacityMilestoneRef.sourcePath;
  if (cisternCapacitySourcePath !== capabilityProgression.sourcePath) {
    throw new Error("Cistern capacity milestone source must match the generated capability progression source.");
  }
  return {
    schemaVersion: RUNTIME_CONTENT_SCHEMA_VERSION,
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(content)).digest("hex")}`,
    source: { path: source.path, schemaVersion: source.schemaVersion, contentVersion: source.contentVersion },
    telo: { pixelsPerTile, profiles },
    scenes: {
      sourceDigest: `sha256:${createHash("sha256").update(stableStringify(sceneSources.map((item) => item.content))).digest("hex")}`,
      byId: scenes,
    },
    infrastructureTasks: {
      sourceDigest: `sha256:${createHash("sha256").update(stableStringify(infrastructureTaskSources.map((item) => item.content))).digest("hex")}`,
      byId: infrastructureTasks,
    },
    capabilityProgression,
    ecology,
  };
}

export function serializeRuntimeContentArtifact(artifact: RuntimeContentArtifact): string { return `${JSON.stringify(artifact, null, 2)}\n`; }
export function assertRuntimeArtifactCurrent(actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`Generated runtime content is stale. Run the content runtime generator to refresh ${RUNTIME_CONTENT_OUTPUT_PATH}.`);
}
function stableStringify(value: ContentValue): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] as ContentValue)}`).join(",")}}`;
}
function exactProduct(...valuesAndLabel: readonly (number | string)[]): number {
  const label = valuesAndLabel.at(-1); const values = valuesAndLabel.slice(0, -1) as number[];
  const result = values.reduce((product, value) => product * value, 1);
  if (!Number.isSafeInteger(result)) throw new Error(`${String(label)} must resolve to an integer number of logical pixels, received ${result}.`);
  return result;
}
function exactDifference(left: number, right: number, label: string): number {
  const result = left - right;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label} must resolve inside the scene, received ${result}.`);
  return result;
}
function requireString(root: ContentObject, path: readonly string[]): string {
  const value = readPath(root, path); if (typeof value !== "string" || value.length === 0) throw new Error(`${path.join(".")} must be a non-empty string.`); return value;
}
function optionalString(root: ContentObject, path: readonly string[]): string | null {
  const value = readPath(root, path); if (value === undefined) return null; if (typeof value !== "string" || value.length === 0) throw new Error(`${path.join(".")} must be a non-empty string.`); return value;
}
function requireBoolean(root: ContentObject, path: readonly string[]): boolean {
  const value = readPath(root, path); if (typeof value !== "boolean") throw new Error(`${path.join(".")} must be boolean.`); return value;
}
function requireExactBoolean(root: ContentObject, path: readonly string[], expected: boolean): boolean {
  const value = requireBoolean(root, path);
  if (value !== expected) throw new Error(`${path.join(".")} must equal ${expected}.`);
  return value;
}
function requireExactString<T extends string>(root: ContentObject, path: readonly string[], expected: T): T {
  const value = requireString(root, path);
  if (value !== expected) throw new Error(`${path.join(".")} must equal ${expected}.`);
  return expected;
}
function optionalBoolean(root: ContentObject, path: readonly string[]): boolean | null {
  const value = readPath(root, path); if (value === undefined) return null; if (typeof value !== "boolean") throw new Error(`${path.join(".")} must be boolean.`); return value;
}
function nullableString(root: ContentObject, path: readonly string[]): string | null {
  const value = readPath(root, path);
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path.join(".")} must be a non-empty string or null.`);
  return value;
}
function readGuardAny(root: ContentObject, path: readonly string[]): string[] {
  const value = readPath(root, path);
  if (value === undefined) return [];
  if (!isContentObject(value)) throw new Error(`${path.join(".")} must be an object when provided.`);
  const predicate = optionalString(value, ["predicate"]);
  if (predicate !== null) return [predicate];
  return requireStringArray(value, ["any"]);
}
function requirePredicateMode(root: ContentObject, path: readonly string[]): "all" | "any" {
  const value = requireString(root, path);
  if (value !== "all" && value !== "any") throw new Error(`${path.join(".")} must be all or any.`);
  return value;
}function requireRouteKind(root: ContentObject, path: readonly string[]): "non_magic" | "optional_magic" {
  const value = requireString(root, path); if (value !== "non_magic" && value !== "optional_magic") throw new Error(`${path.join(".")} has unknown route kind ${value}.`); return value;
}
function requireExactNumber(root: ContentObject, path: readonly string[], expected: number): number { const value = readPath(root, path); if (value !== expected) throw new Error(`${path.join(".")} must equal ${expected}.`); return value; }
function requireObjectArray(root: ContentObject, path: readonly string[]): ContentObject[] { const value = readPath(root, path); if (!Array.isArray(value) || !value.every(isContentObject)) throw new Error(`${path.join(".")} must be an object array.`); return value; }
function optionalObjectArray(root: ContentObject, path: readonly string[]): ContentObject[] { const value = readPath(root, path); if (value === undefined) return []; if (!Array.isArray(value) || !value.every(isContentObject)) throw new Error(`${path.join(".")} must be an object array when provided.`); return value; }
function requireStringArray(root: ContentObject, path: readonly string[]): string[] { const value = readPath(root, path); if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) throw new Error(`${path.join(".")} must be a string array.`); return value; }
function requireNumberPair(root: ContentObject, path: readonly string[]): readonly [number, number] { const value = readPath(root, path); if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0)) throw new Error(`${path.join(".")} must be a non-negative integer pair.`); return [value[0] as number, value[1] as number]; }
function requireTileRect(root: ContentObject, path: readonly string[]): RuntimeTileRect { const value = requireObject(root, path); return { x: requireNonNegativeInteger(value, ["x"]), y: requireNonNegativeInteger(value, ["y"]), width: requirePositiveInteger(value, ["width"]), height: requirePositiveInteger(value, ["height"]) }; }
function requireObject(root: ContentObject, path: readonly string[]): ContentObject { const value = readPath(root, path); if (!isContentObject(value)) throw new Error(`${path.join(".")} must be an object.`); return value; }
function requirePositiveInteger(root: ContentObject, path: readonly string[]): number { const value = requirePositiveNumber(root, path); if (!Number.isInteger(value)) throw new Error(`${path.join(".")} must be an integer.`); return value; }
function requireNonNegativeInteger(root: ContentObject, path: readonly string[]): number { const value = readPath(root, path); if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${path.join(".")} must be a non-negative integer.`); return value; }
function requirePositiveNumber(root: ContentObject, path: readonly string[]): number { const value = readPath(root, path); if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${path.join(".")} must be a finite positive number.`); return value; }
function requireNonNegativeNumber(root: ContentObject, path: readonly string[]): number { const value = readPath(root, path); if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${path.join(".")} must be a finite non-negative number.`); return value; }
function readPath(root: ContentObject, path: readonly string[]): ContentValue | undefined { let value: ContentValue | undefined = root; for (const key of path) { if (!isContentObject(value)) return undefined; value = value[key]; } return value; }
function isContentObject(value: ContentValue | undefined): value is ContentObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function resolveRepositoryContentPath(sourcePath: string, reference: string): string {
  const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), reference));
  if (!resolved.startsWith("data/") || resolved.startsWith("../")) throw new Error(`content reference escapes data/: ${reference}`);
  return resolved;
}
