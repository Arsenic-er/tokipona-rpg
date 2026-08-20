import { createHash } from "node:crypto";
import { projectSafeRangeQualification } from "./safe-range-runtime-artifact.ts";
import { projectProceduralDialogueAudio } from "./dialogue-audio-runtime-artifact.ts";
import { projectP0Curriculum } from "./p0-runtime-artifact.ts";
import { projectCore120Curriculum } from "./core120-runtime-artifact.ts";
import {
  projectCorpusExpansionRegistry,
  projectLearningCorpusArtifacts,
} from "./corpus-expansion-runtime-artifact.ts";
import { projectPrologueAcceptance } from "./prologue-acceptance-runtime-artifact.ts";
import type { RuntimeSafeRangeManifest } from "../../src/content/runtime-safe-range-manifest.ts";
import type { RuntimeP0CurriculumManifest } from "../../src/content/runtime-p0-curriculum-manifest.ts";
import type { RuntimeCore120CurriculumManifest } from "../../src/content/runtime-core120-curriculum-manifest.ts";
import {
  readRuntimeCorpusExpansionRegistry,
  type RuntimeCorpusExpansionRegistry,
} from "../../src/content/runtime-corpus-expansion-registry.ts";
import type { RuntimeLearningCorpusCatalogHeader } from
  "../../src/content/runtime-learning-corpus-catalog-header.ts";
import type { RuntimeLearningCorpusPackageBundle } from
  "../../src/content/runtime-learning-corpus-package-bundle.ts";
import type { RuntimePortraitCameraProfile } from "../../src/content/runtime-camera-profile.ts";
import type { RuntimePrologueAcceptanceManifest } from "../../src/content/runtime-prologue-acceptance-manifest.ts";
import type { RuntimeProceduralDialogueAudioManifest } from "../../src/content/runtime-dialogue-audio-manifest.ts";
import { posix } from "node:path";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";
import type { CapabilityMilestoneMachineProjection } from "../../src/session/capability-contract.ts";
import type { RuntimeFreshnessState, RuntimeWildlifeProcessingManifest } from "../../src/content/runtime-wildlife-processing-manifest.ts";
import type { RuntimeTradeManifest } from "../../src/content/runtime-trade-manifest.ts";
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
  RuntimeReturnFlowTaskManifest,
} from "../../src/content/runtime-task-manifest.ts";

export const RUNTIME_CONTENT_SCHEMA_VERSION = "tokipona.runtime-content.v0.1" as const;
export const RUNTIME_CONTENT_OUTPUT_PATH = "src/generated/content-runtime.v0.1.json" as const;
export const RUNTIME_LEARNING_CORPUS_PACKAGE_OUTPUT_PATH =
  "src/generated/learning-corpus-packages.v0.1.json" as const;
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
  readonly safeRangeQualification: RuntimeSafeRangeManifest;
  readonly proceduralDialogueAudio: RuntimeProceduralDialogueAudioManifest;
  readonly p0Curriculum: RuntimeP0CurriculumManifest;
  readonly core120Curriculum: RuntimeCore120CurriculumManifest;
  readonly corpusExpansionRegistry: RuntimeCorpusExpansionRegistry;
  readonly learningCorpusCatalog: Omit<RuntimeLearningCorpusCatalogHeader,
    "registry" | "packageCount">;
  readonly cameraProfile: RuntimePortraitCameraProfile;
  readonly prologueAcceptance: RuntimePrologueAcceptanceManifest;
  readonly capabilityProgression: CapabilityMilestoneMachineProjection;
  readonly ecology: RuntimeEcologyManifest;
  readonly wildlifeProcessing: RuntimeWildlifeProcessingManifest;
  readonly trade: RuntimeTradeManifest;
  readonly survivalConsumption: {
    readonly sourcePath: string;
    readonly sourceDigest: `sha256:${string}`;
    readonly profileId: string;
    readonly eventId: "survival_consumption_committed";
    readonly transactionKind: "consume";
    readonly idempotencyKeyFields: readonly string[];
    readonly wildlifeInventoryConsumableIds: readonly string[];
    readonly profiles: Readonly<Record<string, Readonly<{ readonly consumableId: string; readonly hydrationDelta: number; readonly satietyDelta: number; readonly requirements: readonly string[] }>>>;
    readonly categoryRejections: Readonly<Record<string, Readonly<{ readonly category: string; readonly rejectionCode: string }>>>;
  };
}

export function buildRuntimeContentArtifact(manifest: ContentManifest): RuntimeContentArtifact {
  const lengthSources = manifest.byKind.length_profiles;
  if (lengthSources.length !== 1) throw new Error(`Expected exactly one validated length profile source, received ${lengthSources.length}.`);
  const source = lengthSources[0];
  const cameraProfile = projectPortraitCameraProfile(manifest);
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
  const prologueAcceptance = projectPrologueAcceptance(manifest);
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
  const ecologyReturnEvent = requireObjectArray(ecologyContent, ["events"]).find((event) => event.event_id === "wildlife_return_after_flow");
  const ecologyRabbit = ecologyEntities.find((entity) => entity.entity_id === "wildlife.rabbit.valley");
  const ecologyFrog = ecologyEntities.find((entity) => entity.entity_id === "wildlife.frog.wet_meadow");
  if (!ecologyReturnEvent || !ecologyRabbit || !ecologyFrog) throw new Error("Ecology return-after-flow source is incomplete.");
  const ecologyReturnTriggers = requireStringArray(requireObject(ecologyReturnEvent, ["trigger"]), ["all"]);
  if (ecologyReturnTriggers.join("|") !== "settlement_supply_stable == true|wet_meadow_restored == true") throw new Error("Ecology return-after-flow triggers are noncanonical.");
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
    returnAfterFlow: { eventId: requireExactString(ecologyReturnEvent, ["event_id"], "wildlife_return_after_flow"), triggerStateIds: ["settlement_supply_stable", "wet_meadow_restored"] as const, persistentWrite: readPath(ecologyReturnEvent, ["persistent_write"]) === null ? null : (() => { throw new Error("Ecology return persistent_write must be null."); })(), firstVisitVisible: requireExactBoolean(ecologyReturnEvent, ["first_return_channel_visit_visible"], true), learningEvidenceFromHarm: requireExactBoolean(ecologyReturnEvent, ["learning_evidence_from_harm"], false), attackQualificationEvidence: requireExactBoolean(ecologyReturnEvent, ["attack_qualification_evidence"], false), attackUnlock: requireExactBoolean(ecologyReturnEvent, ["attack_unlock"], false), rabbitHomeSceneId: requireExactString(ecologyRabbit, ["home_scene"], "scene.valley.return_channel"), frogReturnCondition: requireString(ecologyFrog, ["cross_scene_return_condition"]) },
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
    }));
    const tradeEntries: RuntimeSceneTradeEntryManifest[] = optionalObjectArray(scene, ["trade_entries"]).map((entry) => ({
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
  const safeRangeQualification = projectSafeRangeQualification(manifest);
  const proceduralDialogueAudio = projectProceduralDialogueAudio(manifest);
  const p0Curriculum = projectP0Curriculum(manifest);
  const core120Curriculum = projectCore120Curriculum(manifest);
  const corpusExpansionRegistry = projectCorpusExpansionRegistry(manifest);
  const verifiedCorpusExpansionRegistry = readRuntimeCorpusExpansionRegistry({
    scenes: { byId: scenes },
    core120Curriculum,
    corpusExpansionRegistry,
  });
  const runtimeScenes: RuntimeSceneManifestIndex = {
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(sceneSources.map((item) => item.content))).digest("hex")}`,
    byId: scenes,
  };
  const learningCorpusCatalog = projectLearningCorpusArtifacts(
    manifest, verifiedCorpusExpansionRegistry, runtimeScenes).header;
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
    const returnFlow: RuntimeReturnFlowTaskManifest | null = id === "ch01_return_flow" ? (() => {
      const contract = requireObject(task, ["return_flow_contract"]);
      const graphSourcePath = resolveRepositoryContentPath(taskSource.path, requireString(task, ["evidence_graph_ref"]));
      const graphSource = manifest.sources[graphSourcePath];
      if (!graphSource || graphSource.kind !== "attack_signatures") throw new Error("ch01_return_flow.evidence_graph_ref must resolve to attack signatures");
      const prerequisiteGraph = requireObjectArray(graphSource.content, ["prerequisite_graphs"]).find(graph => graph.graph_id === "attack.water.forceful_motion.prerequisite_graph");
      const intensityNode = prerequisiteGraph ? requireObjectArray(prerequisiteGraph, ["required_nodes"]).find(node => node.node_id === "use.intensity.inert") : undefined;
      if (!intensityNode) throw new Error("canonical inert intensity graph node is missing");
      const ecologySourcePath = resolveRepositoryContentPath(taskSource.path, requireString(task, ["ecology_ref"]));
      const ecologySource = manifest.sources[ecologySourcePath];
      if (!ecologySource || ecologySource.kind !== "ecology") throw new Error("ch01_return_flow.ecology_ref must resolve to ecology");
      const returnEvent = requireObjectArray(ecologySource.content, ["events"]).find((event) => event.event_id === "wildlife_return_after_flow");
      if (!returnEvent) throw new Error("wildlife_return_after_flow is missing");
      const rabbit = requireObjectArray(ecologySource.content, ["entities"]).find((entity) => entity.entity_id === "wildlife.rabbit.valley");
      const frog = requireObjectArray(ecologySource.content, ["entities"]).find((entity) => entity.entity_id === "wildlife.frog.wet_meadow");
      if (!rabbit || !frog) throw new Error("return-flow wildlife entities are missing");
      const regionSource = manifest.byKind.region[0];
      const returnChapterSource = manifest.byKind.chapter[0];
      if (!regionSource || !returnChapterSource) throw new Error("return-flow region/chapter is missing");
      const ecologyContracts = requireObject(ecologySource.content, ["contracts"]);
      const evidence = requireObject(contract, ["wawa_evidence"]);
      const sceneSize = requireNumberPair(contract, ["scene_size_tiles"]);
      return {
        familyId: requireExactString(task, ["task_family_id"], "ecology_and_return_flow"), sceneId: requireExactString(sceneSource.content, ["scene_id"], "scene.valley.return_channel"), regionId: requireExactString(task, ["region_id"], "valley_prologue"), maximumSoftlockRecoverySeconds: requirePositiveNumber(task, ["recovery", "maximum_softlock_recovery_seconds"]), entryPrerequisiteFlag: (() => { const guards=requireStringArray(task,["entry_guard_any"]); if(guards.join("|")!=="exit_ladder_lowered == true") throw new Error("return-flow entry guard is noncanonical"); return "exit_ladder_lowered" as const; })(), exitPrerequisiteFlag: (() => { const guards=requireStringArray(task,["exit_guard_any"]); if(guards.join("|")!=="settlement_supply_stable == true") throw new Error("return-flow exit guard is noncanonical"); return "settlement_supply_stable" as const; })(),
        solutions: solutions.map(solution => ({ id: solution.id, routeKind: requireExactString({ routeKind: solution.routeKind } as ContentObject, ["routeKind"], "non_magic"), mainline: requireExactBoolean({ mainline: solution.mainline } as ContentObject, ["mainline"], true), requiredActions: solution.requiredActions })),
        sceneSizeTiles: [requireExactNumber({ value: sceneSize[0] } as ContentObject, ["value"], 30), requireExactNumber({ value: sceneSize[1] } as ContentObject, ["value"], 26)] as const,
        targetIds: requireObjectArray(sceneSource.content, ["targets"]).map((target) => requireString(target, ["target_id"])),
        solutionIds: requireStringArray(contract, ["solution_ids"]),
        sharedPredicateExpectations: Object.freeze({
          settlementSupplyFlowInBand: requireExactBoolean(requireObject(contract, ["shared_predicate_expectations"]), ["settlementSupplyFlowInBand"], true),
          wetMeadowFlowInBand: requireExactBoolean(requireObject(contract, ["shared_predicate_expectations"]), ["wetMeadowFlowInBand"], true),
          overflowContact: requireExactBoolean(requireObject(contract, ["shared_predicate_expectations"]), ["overflowContact"], false),
        }),
        completionEvent: requireExactString(contract, ["completion_event"], "return_flow_committed"),
        completionFlags: requireStringArray(contract, ["completion_flags"]) as unknown as readonly ["settlement_supply_stable", "wet_meadow_restored"],
        patchRecordRef: requireExactString(contract, ["patch_record_ref"], "patch.valley.return_flow.v0.1"),
        wawaEvidence: {
          wordId: requireExactString(evidence, ["word_id"], "word.wawa"), sourceTargetId: requireExactString(contract, ["source_target_id"], "return_flow.inert_force_indicator"), sourceTargetClass: requireExactString(evidence, ["source_object_class"], "inert_return_flow_mechanism"),
          prerequisiteGraphId: requireExactString(evidence, ["prerequisite_graph_id"], "attack.water.forceful_motion.prerequisite_graph"), prerequisiteNodeId: requireExactString(evidence, ["prerequisite_node_id"], "use.intensity.inert"), evidenceType: requireExactString(evidence, ["evidence_type"], "noncombat_intensity"), concept: requireExactString(evidence, ["concept"], "word.wawa"), minimumEvidence: requireExactNumber(intensityNode, ["minimum"], 1) as 1,
          eligibleEvidenceKinds: requireStringArray(evidence, ["eligible_evidence_kinds"]) as unknown as readonly ["discovery", "attunement", "grounding"], maximumPromptLevel: requireExactNumber(evidence, ["maximum_prompt_level"], 1) as 1, answerTokenIdsVisible: requireExactBoolean(evidence, ["answer_token_ids_visible"], false), fixedSlotCueVisible: requireExactBoolean(evidence, ["fixed_slot_cue_visible"], false), colorOnlyCueAllowed: requireExactBoolean(evidence, ["color_only_cue_allowed"], false),
          independentFromSolution: requireExactBoolean(evidence, ["independent_from_solution"], true), taskCompletionReadsEvidence: requireExactBoolean(evidence, ["task_completion_reads_evidence"], false), toolBypassCountsAsEvidence: requireExactBoolean(evidence, ["tool_bypass_counts_as_evidence"], false), wildlifeActionsCountAsEvidence: requireExactBoolean(evidence, ["wildlife_actions_count_as_evidence"], false), harmCountsAsEvidence: requireExactBoolean(evidence, ["harm_counts_as_evidence"], false),
          forbiddenTargetClasses: requireStringArray(evidence, ["forbidden_target_classes"]), forbiddenOutputs: requireStringArray(evidence, ["forbidden_outputs"]),
        },
        ecologyReturn: { ecologyId: requireExactString(ecologySource.content, ["ecology_id"], "valley_prologue"), eventId: requireExactString(returnEvent, ["event_id"], "wildlife_return_after_flow"), triggerStates: (() => { const triggers=requireStringArray(requireObject(returnEvent, ["trigger"]), ["all"]); if (triggers.join("|")!=="settlement_supply_stable == true|wet_meadow_restored == true") throw new Error("return event triggers are noncanonical"); return ["settlement_supply_stable", "wet_meadow_restored"] as const; })(), persistentWrite: readPath(returnEvent, ["persistent_write"]) === null ? null : (() => { throw new Error("return event persistent_write must be null"); })(), firstReturnChannelVisitVisible: requireExactBoolean(returnEvent, ["first_return_channel_visit_visible"], true), rabbitHomeSceneId: requireExactString(rabbit, ["home_scene"], "scene.valley.return_channel"), frogReturnCondition: requireString(frog, ["cross_scene_return_condition"]) },
        zeroAttack: { zeroAttackMainline: requireExactBoolean(requireObject(regionSource.content, ["contracts"]), ["zero_attack_mainline"], true), mandatoryKills: requireExactNumber(ecologyContracts, ["mandatory_kills"], 0) as 0, requiredQuestDrops: requireExactNumber(ecologyContracts, ["required_quest_drops"], 0) as 0, languageEvidenceFromHarmForbidden: requireExactBoolean(ecologyContracts, ["language_evidence_from_harm_forbidden"], true), attackQualificationEvidenceFromReturn: requireExactBoolean(returnEvent, ["attack_qualification_evidence"], false), attackUnlockFromReturn: requireExactBoolean(returnEvent, ["attack_unlock"], false), mandatoryCombatEncounters: requireExactNumber(requireObject(returnChapterSource.content, ["prologue_contract"]), ["mandatory_combat_encounters"], 0) as 0, formalAttackFirstValidationTarget: requireExactString(requireObject(returnChapterSource.content, ["prologue_contract"]), ["formal_attack_first_validation_target"], "safe_range_inert_targets") },
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
      returnFlow,
    };
    return [id, result];
  }));
  const cisternCapacitySourcePath = infrastructureTasks.ch01_length_cistern?.cistern?.capacityMilestoneRef.sourcePath;
  if (cisternCapacitySourcePath !== capabilityProgression.sourcePath) {
    throw new Error("Cistern capacity milestone source must match the generated capability progression source.");
  }
  const wildlifeProcessing = projectWildlifeProcessing(manifest);
  const trade = projectSettlementTrade(manifest, scenes);
  const survivalSources = manifest.byKind.survival;
  if (survivalSources.length !== 1) throw new Error(`Expected exactly one survival source, received ${survivalSources.length}.`);
  const survivalSource = survivalSources[0]!;
  const survivalContent = survivalSource.content;
  const consumptionEntries = requireObjectArray(survivalContent, ["consumption_profiles"]);
  const consumptionProfiles = Object.fromEntries(consumptionEntries.flatMap((entry) => {
    const consumableId = optionalString(entry, ["consumable_id"]);
    if (!consumableId) return [];
    return [[consumableId, {
      consumableId, hydrationDelta: requireNonNegativeNumber(entry, ["hydration_delta"]),
      satietyDelta: requireNonNegativeNumber(entry, ["satiety_delta"]),
      requirements: requireStringArray(entry, ["requirements"]),
    }]];
  }));
  const categoryRejections = Object.fromEntries(consumptionEntries.flatMap((entry) => {
    const category = optionalString(entry, ["consumable_category"]);
    if (!category) return [];
    if (optionalBoolean(entry, ["direct_consumption_allowed_in_prologue"]) !== false) throw new Error(`consumption category ${category} must be explicitly rejected`);
    return [[category, { category, rejectionCode: requireString(entry, ["rejection_code"]) }]];
  }));
  const consumptionContract = requireObject(survivalContent, ["transaction_contract"]);
  const wildlifeInventoryConsumableIds = Object.keys(consumptionProfiles).filter((itemId) => {
    const wildlifeItem = wildlifeProcessing.items[itemId];
    const profile = consumptionProfiles[itemId];
    return wildlifeItem !== undefined && profile !== undefined && wildlifeItem.category !== "raw_meat" &&
      profile.requirements.includes("cooked") && profile.requirements.includes("not_spoiled");
  });
  const survivalConsumptionBody = {
    sourcePath: survivalSource.path,
    profileId: requireString(survivalContent, ["profile_id"]),
    eventId: requireExactString(consumptionContract, ["event_id"], "survival_consumption_committed"),
    transactionKind: requireExactString(consumptionContract, ["transaction_kind"], "consume"),
    idempotencyKeyFields: requireStringArray(consumptionContract, ["idempotency_key_fields"]),
    wildlifeInventoryConsumableIds,
    profiles: consumptionProfiles, categoryRejections,
  } as const;
  const survivalConsumption = {
    ...survivalConsumptionBody,
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(survivalConsumptionBody)).digest("hex")}` as `sha256:${string}`,
  };  return {
    schemaVersion: RUNTIME_CONTENT_SCHEMA_VERSION,
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(content)).digest("hex")}`,
    source: { path: source.path, schemaVersion: source.schemaVersion, contentVersion: source.contentVersion },
    telo: { pixelsPerTile, profiles },
    scenes: runtimeScenes,
    infrastructureTasks: {
      sourceDigest: `sha256:${createHash("sha256").update(stableStringify(infrastructureTaskSources.map((item) => item.content))).digest("hex")}`,
      byId: infrastructureTasks,
    },
    safeRangeQualification,
    proceduralDialogueAudio,
    p0Curriculum,
    core120Curriculum,
    corpusExpansionRegistry,
    learningCorpusCatalog,
    cameraProfile,
    prologueAcceptance,
    capabilityProgression,
    ecology,
    wildlifeProcessing,
    trade,
    survivalConsumption,
  };
}

function projectPortraitCameraProfile(manifest: ContentManifest): RuntimePortraitCameraProfile {
  const regions = manifest.byKind.region;
  if (regions.length !== 1) throw new Error(`Expected exactly one region source, received ${regions.length}.`);
  const source = regions[0]!;
  if (source.path !== "data/world/regions/valley-prologue.v0.1.yaml") throw new Error("portrait camera region source is noncanonical");
  const coordinateSystem = requireObject(source.content, ["coordinate_system"]);
  const camera = requireObject(coordinateSystem, ["camera_profile"]);
  const viewport = requireObject(camera, ["viewport_px"]);
  const anchor = requireObject(camera, ["focus_anchor_normalized"]);
  const body = {
    sourcePath: source.path,
    profileId: requireExactString(coordinateSystem, ["camera_profile_id"], "portrait_scroll.v0.1"),
    viewportPx: {
      width: requireExactNumber(viewport, ["width"], 180),
      height: requireExactNumber(viewport, ["height"], 320),
    },
    focusAnchorNormalized: {
      x: requireExactNumber(anchor, ["x"], 0.5),
      y: requireExactNumber(anchor, ["y"], 0.62),
    },
    clampToSceneBounds: requireExactBoolean(camera, ["clamp_to_scene_bounds"], true),
    pixelSnap: requireExactBoolean(camera, ["pixel_snap"], true),
    sceneSizeIndependentFromCamera: requireExactBoolean(coordinateSystem, ["scene_size_independent_from_camera"], true),
  } as const;
  return {
    ...body,
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(body)).digest("hex")}`,
  };
}

function projectSettlementTrade(
  manifest: ContentManifest,
  scenes: Readonly<Record<string, RuntimeSceneManifest>>,
): RuntimeTradeManifest {
  const sources = manifest.byKind.settlement_trade;
  if (sources.length !== 1) throw new Error(`Expected exactly one settlement trade source, received ${sources.length}.`);
  const source = sources[0]!;
  const content = source.content;
  const wildlifeSource = manifest.byKind.wildlife_economy[0];
  if (!wildlifeSource) throw new Error("Wildlife economy is required by settlement trade.");
  const walSource = manifest.byKind.persistence.find((candidate) => candidate.schemaVersion === "w04.cross-save-wal.v0.1");
  if (!walSource) throw new Error("Cross-save WAL is required by settlement trade.");
  const wildlifeItems = new Map(requireObjectArray(wildlifeSource.content, ["item_definitions"]).map((entry) =>
    [requireString(entry, ["item_id"]), entry] as const));
  const activeMerchants = Object.fromEntries(requireObjectArray(content, ["merchants"]).flatMap((entry) => {
    if (requireString(entry, ["runtime"]) !== "active") return [];
    const merchantId = requireString(entry, ["id"]);
    const conditionalBuys = optionalObjectArray(entry, ["conditional_buys"]).map((condition) => requireString(condition, ["category"]));
    return [[merchantId, {
      merchantId, status: "active" as const, buys: requireStringArray(entry, ["buys"]), conditionalBuys,
      fullPriceUnitsPerRestock: requirePositiveInteger(entry, ["full_price_units_per_restock"]),
      excessPolicy: requireExactString(entry, ["excess_policy"], optionalString(entry, ["excess_policy"]) === "reject" ? "reject" : "quarter_price") as "quarter_price" | "reject",
      ownershipPolicy: (optionalString(entry, ["ownership_policy"]) ?? "legal_only") as "legal_only" | "fence",
    }]];
  }));
  const items = Object.fromEntries(requireObjectArray(content, ["prologue_items"]).map((entry) => {
    const itemId = requireString(entry, ["id"]);
    const category = requireString(entry, ["category"]);
    const basePlayerSellCoin = requireNonNegativeNumber(entry, ["base_player_sell_coin"]);
    const playerCanSell = optionalBoolean(entry, ["player_can_sell"]) === true;
    const authoredWildlife = wildlifeItems.get(itemId);
    if (authoredWildlife && (requireString(authoredWildlife, ["category"]) !== category ||
        (playerCanSell && requireNonNegativeNumber(authoredWildlife, ["base_buy_price_coin"]) !== basePlayerSellCoin))) {
      throw new Error(`Trade item ${itemId} conflicts with the authoritative wildlife catalog.`);
    }
    const buyer = optionalString(entry, ["buyer"]);
    if (buyer && !activeMerchants[buyer]) throw new Error(`Trade item ${itemId} buyer ${buyer} is not active.`);
    return [itemId, { itemId, category, basePlayerSellCoin, playerCanSell, buyer }];
  }));
  const authoredPrice = requireObject(content, ["price", "freshness_multiplier"]);
  const wildlifePrice = requireObject(wildlifeSource.content, ["settlement_market", "freshness_multipliers"]);
  const freshnessMultipliers: Record<string, number | null> = {};
  for (const [state, value] of [...Object.entries(authoredPrice), ...Object.entries(wildlifePrice)]) {
    const projected = value === "forbidden" ? null : typeof value === "number" ? value : (() => { throw new Error(`Invalid trade freshness multiplier ${state}.`); })();
    if (state in freshnessMultipliers && freshnessMultipliers[state] !== projected) {
      const existing = freshnessMultipliers[state];
      if ((existing === null && projected === 0) || (existing === 0 && projected === null)) freshnessMultipliers[state] = null;
      else throw new Error(`Trade freshness multiplier ${state} conflicts across sources.`);
    } else freshnessMultipliers[state] = projected;
  }
  const quoteContract = requireObject(wildlifeSource.content, ["settlement_market", "quote_contract"]);
  if (requirePositiveInteger(content, ["flow", "quote_lifetime_active_seconds"]) !==
      requirePositiveInteger(quoteContract, ["expires_after_active_seconds"])) throw new Error("Trade quote lifetime conflicts across sources.");
  const stationAuthorities = Object.values(scenes).flatMap((scene) => scene.tradeEntries.flatMap((entry) => {
    if (entry.authoritativeEconomySourcePath !== source.path) return [];
    if (entry.merchantIds.some((merchantId) => !activeMerchants[merchantId])) throw new Error(`Trade entry ${entry.id} references an inactive merchant.`);
    const interaction = scene.interactions.find((candidate) => candidate.id === entry.interactionId);
    const target = interaction ? scene.targets.find((candidate) => candidate.id === interaction.targetId) : undefined;
    if (!interaction || !target?.interactionPointTiles) throw new Error(`Trade entry ${entry.id} requires an authored interaction point.`);
    return [{ sceneId: scene.sceneId, tradeEntryId: entry.id, npcId: entry.npcId, interactionId: entry.interactionId, merchantIds: [...entry.merchantIds],
      targetId: target.id, interactionPointPx: { x: target.interactionPointTiles[0] * 16 + 8, y: target.interactionPointTiles[1] * 16 + 8 } }];
  }));
  const sellContract = requireObject(wildlifeSource.content, ["transaction_contracts", "sell"]);
  const sellWal = requireObjectArray(walSource.content, ["registered_transaction_kinds"])
    .find((entry) => optionalString(entry, ["kind"]) === "sell");
  if (!sellWal) throw new Error("Sell WAL transaction is not registered.");
  const body = {
    sourcePath: source.path as "data/economy/settlement-trade.v0.1.yaml", contentVersion: source.contentVersion,
    priceTableVersion: requireString(content, ["price_table_version"]),
    quoteLifetimeActiveSeconds: requirePositiveInteger(content, ["flow", "quote_lifetime_active_seconds"]),
    quoteClock: requireExactString(content, ["flow", "quote_clock"], "session_monotonic_active_seconds"),
    transactionKind: requireExactString(sellContract, ["transaction_kind"], "sell"),
    idempotencyKeyFields: requireStringArray(sellContract, ["idempotency_key_fields"]),
    quote: {
      requiredFields: requireStringArray(quoteContract, ["required_fields"]),
      lineItemFields: requireStringArray(quoteContract, ["line_item_fields"]),
      quoteIdFormula: requireExactString(quoteContract, ["quote_id_formula"], "sha256(merchant_id, player_save_id, demand_revision, sorted_lot_revisions, quote_sequence)"),
      singleConsumption: requireExactBoolean(quoteContract, ["single_consumption"], true),
    },
    activeMerchants, items, freshnessMultipliers, stationAuthorities,
    priceFormula: requireExactString(content, ["price", "formula"], "floor(base * freshness * quality * demand * full_units) + floor(base * freshness * quality * demand * 0.25 * excess_units)"),
    quarterPriceMultiplier: .25 as const,
    qualityMultiplierRange: requireFiniteNumberPair(wildlifeSource.content, ["settlement_market", "quality_multiplier_range"]),
    minimumSellQuality: .5, demandMultiplierRange: requireFiniteNumberPair(wildlifeSource.content, ["settlement_market", "demand_multiplier_range"]),
    currentDemandMultiplier: requirePositiveNumber(content, ["price", "demand_multiplier", "current"]),
    restrictions: (() => { const value = requireObject(wildlifeSource.content, ["settlement_market", "raw_or_spoiled_restrictions"]); return {
      spoiledMeatAccepted: requireExactBoolean(value, ["spoiled_meat_accepted"], false), rottenHideAccepted: requireExactBoolean(value, ["rotten_hide_accepted"], false),
      rawHideAcceptedInPrologue: requireExactBoolean(value, ["raw_hide_accepted_in_prologue"], false),
    }; })(),
    restock: (() => { const value = requireObject(wildlifeSource.content, ["settlement_market", "restock_contract"]); return {
      requiredDistinctEligibleEvents: requirePositiveInteger(value, ["required_distinct_eligible_events"]), eligibleEventFilter: requireStringArray(value, ["eligible_event_filter"]),
      reloadRestocks: requireExactBoolean(value, ["reload_restocks"], false), checkpointResetRestocks: requireExactBoolean(value, ["checkpoint_reset_restocks"], false),
      repeatedEventRestocks: requireExactBoolean(value, ["repeated_event_restocks"], false),
    }; })(),
    walParticipants: requireStringArray(sellWal, ["participants"]),
  } as const;
  return { sourceDigest: `sha256:${createHash("sha256").update(stableStringify(body)).digest("hex")}`, ...body } as RuntimeTradeManifest;
}
function projectWildlifeProcessing(manifest: ContentManifest): RuntimeWildlifeProcessingManifest {
  const sources = manifest.byKind.wildlife_economy;
  if (sources.length !== 1) throw new Error(`Expected exactly one wildlife economy source, received ${sources.length}.`);
  const source = sources[0]!;
  const walSource = manifest.byKind.persistence.find((candidate) => candidate.schemaVersion === "w04.cross-save-wal.v0.1");
  if (!walSource) throw new Error("Cross-save WAL source is required by wildlife processing.");
  const content = source.content;
  const walContent = walSource.content;
  const items = Object.fromEntries(requireObjectArray(content, ["item_definitions"]).map((entry) => {
    const itemId = requireString(entry, ["item_id"]);
    return [itemId, {
      itemId,
      category: requireString(entry, ["category"]),
      preservationProfileId: optionalString(entry, ["preservation_profile_id"]),
    }];
  }));
  const harvestProfiles = Object.fromEntries(requireObjectArray(content, ["harvest_profiles"]).map((entry) => {
    const profileId = requireString(entry, ["profile_id"]);
    return [profileId, {
      profileId,
      species: requireString(entry, ["species"]),
      adultFullYield: requireObjectArray(entry, ["adult_full_yield"]).map((slot) => ({
        tissueSlotId: requireString(slot, ["tissue_slot_id"]),
        itemId: requireString(slot, ["item_id"]),
        quantity: requirePositiveInteger(slot, ["quantity"]),
      })),
    }];
  }));
  const damageQuality = Object.fromEntries(Object.entries(requireObject(content, ["damage_quality"])).map(([cause, raw]) => {
    if (!isContentObject(raw)) throw new Error(`damage_quality.${cause} must be an object.`);
    return [cause, {
      meatYieldMultiplier: requireNonNegativeNumber(raw, ["meat_yield_multiplier"]),
      hideQualityMultiplier: requireNonNegativeNumber(raw, ["hide_quality_multiplier"]),
    }];
  }));
  const decayProfiles = Object.fromEntries(Object.entries(requireObject(content, ["time_and_decay", "profiles"])).map(([profileId, raw]) => {
    if (!isContentObject(raw)) throw new Error(`time_and_decay.profiles.${profileId} must be an object.`);
    if (raw.stable === true) return [profileId, { profileId, stable: true, thresholdsSeconds: [{ state: "stable" as const, untilSeconds: null }] }];
    const stages: { state: RuntimeFreshnessState; untilSeconds: number | null }[] = [];
    let cumulative = 0;
    for (const [field, value] of Object.entries(raw)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${profileId}.${field} must be positive hours.`);
      const seconds = exactProduct(value, 3600, `${profileId}.${field}.seconds`);
      if (field.endsWith("_after_hours")) {
        stages.push({ state: field.slice(0, -"_after_hours".length) as RuntimeFreshnessState, untilSeconds: null });
      } else if (field.endsWith("_hours")) {
        cumulative += seconds;
        stages.push({ state: field.slice(0, -"_hours".length) as RuntimeFreshnessState, untilSeconds: cumulative });
      } else throw new Error(`${profileId}.${field} is not a supported decay threshold.`);
    }
    if (!stages.some((stage) => stage.untilSeconds === null)) throw new Error(`${profileId} must define a terminal decay state.`);
    return [profileId, { profileId, stable: false, thresholdsSeconds: stages }];
  }));
  const processingRecipes = Object.fromEntries(requireObjectArray(content, ["processing_recipes"])
    .map((entry) => {
      const recipeId = requireString(entry, ["recipe_id"]);
      const stationOrToolAny = readPath(entry, ["station_or_tool_any"]) !== undefined
        ? requireStringArray(entry, ["station_or_tool_any"])
        : readPath(entry, ["station_any"]) !== undefined
          ? requireStringArray(entry, ["station_any"])
          : [requireString(entry, ["station"])];
      const station = optionalString(entry, ["station"])
        ?? (readPath(entry, ["station_any"]) === undefined ? null : requireStringArray(entry, ["station_any"])[0])
        ?? "unspecified_station";
      return [recipeId, {
        recipeId,
        recipeVersion: source.contentVersion,
        inputs: readPath(entry, ["inputs"]) === undefined ? [] : requireObjectArray(entry, ["inputs"]).map((input) => ({
          itemId: optionalString(input, ["item_id"]),
          category: optionalString(input, ["category"]),
          quantity: requirePositiveInteger(input, ["quantity"]),
        })),
        outputs: readPath(entry, ["outputs"]) === undefined ? [] : requireObjectArray(entry, ["outputs"]).map((output) => ({
          itemId: requireString(output, ["item_id"]), quantity: requirePositiveInteger(output, ["quantity"]),
        })),
        rejectInputStates: readPath(entry, ["reject_input_states"]) === undefined ? [] : requireStringArray(entry, ["reject_input_states"]),
        requiredDistinctEligibleEvents: readPath(entry, ["required_distinct_eligible_events"]) === undefined
          ? 0 : requireNonNegativeInteger(entry, ["required_distinct_eligible_events"]),
        eligibleEventFilter: readPath(entry, ["eligible_event_filter"]) === undefined ? [] : requireStringArray(entry, ["eligible_event_filter"]),
        interactionWorkUnits: requirePositiveInteger(entry, ["interaction_work_units"]),
        stationStorageProfile: station,
        manifestedHeatAllowedAsEnergyOnly: optionalBoolean(entry, ["manifested_heat_allowed_as_energy_only"]) ?? false,
        stationOrToolAny,
        energyRequirement: readPath(entry, ["energy_requirement"]) === undefined ? null : (() => { const energy = requireObject(entry, ["energy_requirement"]); return { kind: requireString(energy, ["kind"]), eu: requirePositiveInteger(energy, ["eu"]) }; })(),
        completionRule: optionalString(entry, ["completion_rule"]) ?? "immediate_after_active_work",
        outputFreshnessFormula: optionalString(entry, ["output_freshness_formula"]),
        outputQualityFormula: requireString(content, ["provenance_contract", "processed_output_quality_formula"]),
        genericProcessOutputPathForbidden: optionalBoolean(entry, ["generic_process_output_path_forbidden"]) ?? false,
        transactionKind: optionalString(entry, ["transaction_kind"]) ?? "process_workorder",
      }];
    }));
  const sceneSources = manifest.byKind.scene;
  const stationBindings = Object.fromEntries(requireObjectArray(content, ["processing_contract", "station_interaction_bindings"]).map((entry) => {
    const stationId = requireString(entry, ["station_id"]), sceneId = requireString(entry, ["scene_id"]);
    const targetId = requireString(entry, ["target_id"]), interactionId = requireString(entry, ["interaction_id"]);
    const scene = sceneSources.find((candidate) => requireString(candidate.content, ["scene_id"]) === sceneId)?.content;
    if (!scene) throw new Error(`processing station ${stationId} references missing scene ${sceneId}`);
    const target = requireObjectArray(scene, ["targets"]).find((candidate) => requireString(candidate, ["target_id"]) === targetId);
    if (!target) throw new Error(`processing station ${stationId} target missing`);
    const point = requireNumberPair(target, ["interaction_point_tiles"]);
    if (!requireObjectArray(scene, ["interactions"]).some((interaction) => requireString(interaction, ["interaction_id"]) === interactionId && requireString(interaction, ["target_id"]) === targetId)) throw new Error(`processing station ${stationId} interaction missing`);
    const facility = requireObjectArray(scene, ["facilities"]).find((candidate) => requireString(candidate, ["target_id"]) === targetId);
    const energy = facility && readPath(facility, ["energy_provision"]) !== undefined
      ? (() => { const provision = requireObject(facility, ["energy_provision"]); return {
        kind: requireString(provision, ["kind"]), euPerWork: requirePositiveInteger(provision, ["eu_per_work"]),
        source: requireString(provision, ["source"]),
      }; })() : null;
    return [stationId, { stationId, sceneId, targetId, interactionId,
      interactionPointPx: { x: point[0] * 16 + 8, y: point[1] * 16 + 8 }, energyProvision: energy }];
  }));
  const stationIds = requireObjectArray(content, ["processing_contract", "station_interaction_bindings"])
    .map((entry) => requireString(entry, ["station_id"]));
  if (new Set(stationIds).size !== stationIds.length) throw new Error("processing station binding IDs must be unique");
  const authoredStationIds = new Set(Object.values(processingRecipes).flatMap((recipe) => recipe.stationOrToolAny));
  if (authoredStationIds.size !== stationIds.length || stationIds.some((stationId) => !authoredStationIds.has(stationId))) {
    throw new Error("processing recipe stations must exactly match station interaction bindings");
  }
  const identity = requireObject(walContent, ["transaction_identity"]);
  const registeredTransactionEntries = requireObjectArray(walContent, ["registered_transaction_kinds"]);
  const registeredTransactionKinds = registeredTransactionEntries.map((entry) => requireString(entry, ["kind"]));
  if (new Set(registeredTransactionKinds).size !== registeredTransactionKinds.length) throw new Error("WAL registered kinds must be unique");
  const registeredTransactions = Object.fromEntries(registeredTransactionEntries
    .map((entry) => { const kind = requireString(entry, ["kind"]); return [kind, { kind, participants: requireStringArray(entry, ["participants"]) }]; }));
  const registeredKinds = Object.keys(registeredTransactions);
  const body = {
    sourcePath: source.path,
    contractRevision: source.contentVersion,
    economyId: requireExactString(content, ["economy_id"], "valley_wildlife_products"),
    clockId: requireExactString(content, ["time_and_decay", "clock_id"], "active_world_simulation_tick"),
    workUnitActiveSeconds: requirePositiveInteger(content, ["processing_contract", "work_unit_active_seconds"]),
    juvenileHarvestOutputs: requireExactNumber(content, ["contracts", "juvenile_harvest_outputs"], 0) as 0,
    items, harvestProfiles, damageQuality, decayProfiles, processingRecipes, stationBindings,
    wal: {
      sourcePath: walSource.path,
      sourceDigest: `sha256:${createHash("sha256").update(stableStringify(walContent)).digest("hex")}` as `sha256:${string}`,
      coordinatorId: requireExactString(walContent, ["coordinator_id"], "cross_save_wal.v0.1"),
      transactionIdFormula: requireExactString(identity, ["transaction_id_formula"], "sha256(coordinator_id, transaction_kind, canonical_idempotency_key)"),
      outputIdFormula: requireExactString(identity, ["output_id_formula"], "sha256(transaction_id, output_kind, output_index)"),
      receiptIdFormula: requireExactString(identity, ["receipt_id_formula"], "sha256(transaction_id, receipt_kind)"),
      registeredKinds, registeredTransactions,
    },
  };
  return {
    sourceDigest: `sha256:${createHash("sha256").update(stableStringify(body)).digest("hex")}`,
    ...body,
  };
}

export function serializeRuntimeContentArtifact(artifact: RuntimeContentArtifact): string { return `${JSON.stringify(artifact, null, 2)}\n`; }
export function buildRuntimeLearningCorpusPackageBundle(
  manifest: ContentManifest,
): RuntimeLearningCorpusPackageBundle {
  const artifact = buildRuntimeContentArtifact(manifest);
  const registry = readRuntimeCorpusExpansionRegistry(artifact);
  return projectLearningCorpusArtifacts(manifest, registry, artifact.scenes).bundle;
}
export function serializeRuntimeLearningCorpusPackageBundle(
  bundle: RuntimeLearningCorpusPackageBundle,
): string { return `${JSON.stringify(bundle, null, 2)}\n`; }
export function assertRuntimeArtifactCurrent(actual: string, expected: string): void {
  const normalizeLineEndings = (value: string): string => value.replaceAll("\r\n", "\n");
  if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
    throw new Error("Generated runtime content is stale. Run the content runtime generator to refresh checked-in artifacts.");
  }
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
function requireFiniteNumberPair(root: ContentObject, path: readonly string[]): readonly [number, number] { const value = readPath(root, path); if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0)) throw new Error(`${path.join(".")} must be a non-negative finite number pair.`); return [value[0] as number, value[1] as number]; }
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
