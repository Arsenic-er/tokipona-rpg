import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";
import { computeRuntimeManifestDigest } from "../../src/content/runtime-manifest-digest.ts";
import type { RuntimeForestOpeningManifest } from "../../src/content/runtime-forest-opening-manifest.ts";

const SOURCE_PATH = "data/chapters/ch01-opening-slice.v0.1.yaml" as const;
const ROUTE = [
  ["forest.arrival", "scene.valley.arrival_shelf"],
  ["forest.stream", "scene.valley.stream_section"],
  ["forest.settlement", "scene.valley.settlement"],
] as const;
const SOLUTIONS = [
  ["stone_steps", "pushLooseStone"],
  ["deadwood_bridge", "placeRottenLog"],
  ["shallow_detour", "digSoftSoil"],
] as const;
const SPECIES = [
  ["forest.rabbit", "foraging"],
  ["forest.wetland_bird", "wading"],
] as const;
const AUDIO_ROLES = ["forest_ambience", "stream_ambience", "foley_bank", "dialogue_blip_bank"] as const;
const ASSET_ROLES = [
  "far_parallax_atlas", "mid_parallax_atlas", "environment_atlas", "prop_glyph_atlas",
  "traveler_atlas", "creature_atlas", "animation_manifest", "time_palette", "audio_manifest",
] as const;

export function projectForestOpeningRuntimeManifest(manifest: ContentManifest): RuntimeForestOpeningManifest {
  const sources = manifest.byKind.forest_opening;
  if (sources.length !== 1) throw new Error(`forest opening requires one canonical source, received ${sources.length}`);
  const source = sources[0];
  if (!source || source.path !== SOURCE_PATH || source.schemaVersion !== "g01.forest-opening.v0.1") {
    throw new Error("forest opening source identity is noncanonical");
  }
  const root = source.content;
  exactKeys(root, [
    "schema_version", "content_version", "slice_id", "chapter_flow_id", "duration_minutes",
    "combat_required", "route", "obstacle", "solutions", "glyph_observation", "ecology",
    "audio_roles", "asset_roles", "completion",
  ], "forest opening source");
  if (string(root.slice_id, "slice ID") !== "ch01_forest_opening_vertical_slice" ||
      string(root.chapter_flow_id, "chapter flow ID") !== "ch01_world_literacy_prologue" ||
      root.combat_required !== false || !same(root.duration_minutes, [10, 15])) {
    throw new Error("forest opening identity, duration, or peaceful boundary is noncanonical");
  }

  const route = objects(root.route, "route").map((entry, index) => {
    exactKeys(entry, ["district_id", "scene_id"], `route[${index}]`);
    const projected = {
      districtId: string(entry.district_id, "route district"),
      sceneId: string(entry.scene_id, "route scene"),
    };
    if (!same([projected.districtId, projected.sceneId], ROUTE[index])) {
      throw new Error("forest opening route is noncanonical");
    }
    return projected;
  });
  if (route.length !== ROUTE.length) throw new Error("forest opening route is noncanonical");

  const obstacle = object(root.obstacle, "obstacle");
  exactKeys(obstacle, ["obstacle_id", "bounds_px", "interaction_radius_px", "material_pocket_px", "settlement_entrance_bounds_px", "object_anchors_px"], "obstacle");
  const anchors = object(obstacle.object_anchors_px, "object anchors");
  exactKeys(anchors, ["stone_a", "stone_b", "deadwood", "unknown_glyph"], "object anchors");
  const projectedObstacle = {
    obstacleId: string(obstacle.obstacle_id, "obstacle ID"),
    boundsPx: rect(obstacle.bounds_px, "obstacle bounds"),
    interactionRadiusPx: integer(obstacle.interaction_radius_px, "interaction radius"),
    materialPocketPx: rect(obstacle.material_pocket_px, "material pocket"),
    settlementEntranceBoundsPx: rect(obstacle.settlement_entrance_bounds_px, "settlement entrance"),
    objectAnchorsPx: {
      stoneA: point(anchors.stone_a, "stone A"),
      stoneB: point(anchors.stone_b, "stone B"),
      deadwood: point(anchors.deadwood, "deadwood"),
      unknownGlyph: point(anchors.unknown_glyph, "unknown glyph"),
    },
  };
  if (projectedObstacle.obstacleId !== "damaged_stream_road" || projectedObstacle.interactionRadiusPx !== 48 ||
      !same(projectedObstacle.boundsPx, { x: 1760, y: 688, width: 320, height: 128 }) ||
      !same(projectedObstacle.materialPocketPx, { x: 1808, y: 704, width: 128, height: 64 }) ||
      !same(projectedObstacle.settlementEntranceBoundsPx, { x: 2496, y: 640, width: 32, height: 96 }) ||
      !same(projectedObstacle.objectAnchorsPx, { stoneA: [1840, 704], stoneB: [1888, 704], deadwood: [1968, 688], unknownGlyph: [2144, 672] })) {
    throw new Error("forest opening obstacle geometry is noncanonical");
  }

  const solutions = objects(root.solutions, "solutions").map((entry, index) => {
    exactKeys(entry, ["solution_id", "semantic_action"], `solution[${index}]`);
    const projected = {
      solutionId: string(entry.solution_id, "solution ID"),
      semanticAction: string(entry.semantic_action, "semantic action"),
    };
    if (!same([projected.solutionId, projected.semanticAction], SOLUTIONS[index])) {
      throw new Error("forest opening solutions are noncanonical");
    }
    return projected;
  });
  if (solutions.length !== SOLUTIONS.length) throw new Error("forest opening solutions are noncanonical");

  const glyph = object(root.glyph_observation, "glyph observation");
  exactKeys(glyph, ["word_id", "position_px", "grants_meaning", "grants_pronunciation", "grants_learning_evidence", "grants_spell_access"], "glyph observation");
  const glyphObservation = {
    wordId: string(glyph.word_id, "glyph word"),
    positionPx: point(glyph.position_px, "glyph position"),
    grantsMeaning: boolean(glyph.grants_meaning, "glyph meaning grant"),
    grantsPronunciation: boolean(glyph.grants_pronunciation, "glyph pronunciation grant"),
    grantsLearningEvidence: boolean(glyph.grants_learning_evidence, "glyph learning grant"),
    grantsSpellAccess: boolean(glyph.grants_spell_access, "glyph spell grant"),
  };
  if (!same(glyphObservation, {
    wordId: "word.telo", positionPx: [2144, 672], grantsMeaning: false,
    grantsPronunciation: false, grantsLearningEvidence: false, grantsSpellAccess: false,
  })) throw new Error("forest opening glyph observation is noncanonical");

  const ecology = object(root.ecology, "ecology");
  exactKeys(ecology, ["disturbance_radius_px", "visible_species"], "ecology");
  const visibleSpecies = objects(ecology.visible_species, "visible species").map((entry, index) => {
    exactKeys(entry, ["species_id", "initial_mode", "spawn_px", "escape_anchor_px"], `visible species[${index}]`);
    const projected = {
      speciesId: string(entry.species_id, "species ID"),
      initialMode: string(entry.initial_mode, "species initial mode"),
      spawnPx: point(entry.spawn_px, "species spawn"),
      escapeAnchorPx: point(entry.escape_anchor_px, "species escape anchor"),
    };
    if (!same([projected.speciesId, projected.initialMode], SPECIES[index])) {
      throw new Error("forest opening species are noncanonical");
    }
    return projected;
  });
  if (visibleSpecies.length !== SPECIES.length || integer(ecology.disturbance_radius_px, "disturbance radius") !== 224) {
    throw new Error("forest opening ecology is noncanonical");
  }

  const audioRoles = strings(root.audio_roles, "audio roles");
  const assetRoles = strings(root.asset_roles, "asset roles");
  if (!same(audioRoles, AUDIO_ROLES) || !same(assetRoles, ASSET_ROLES)) {
    throw new Error("forest opening runtime roles are noncanonical");
  }
  const completion = object(root.completion, "completion");
  exactKeys(completion, ["zero_kill_required", "settlement_checkpoint_id"], "completion");
  if (completion.zero_kill_required !== true || string(completion.settlement_checkpoint_id, "checkpoint ID") !== "checkpoint.forest.settlement_perimeter") {
    throw new Error("forest opening zero-kill completion is noncanonical");
  }

  const body = {
    sourcePath: source.path,
    contentVersion: source.contentVersion,
    sliceId: "ch01_forest_opening_vertical_slice" as const,
    chapterFlowId: "ch01_world_literacy_prologue" as const,
    durationMinutes: [10, 15] as const,
    districtIds: ["forest.arrival", "forest.stream", "forest.settlement"] as const,
    sceneIds: ["scene.valley.arrival_shelf", "scene.valley.stream_section", "scene.valley.settlement"] as const,
    route,
    obstacle: projectedObstacle,
    solutions,
    glyphObservation,
    ecology: { disturbanceRadiusPx: 224, visibleSpecies },
    visibleSpeciesIds: ["forest.rabbit", "forest.wetland_bird"] as const,
    audioRoles: AUDIO_ROLES,
    assetRoles: ASSET_ROLES,
    completion: {
      zeroKillRequired: true as const,
      settlementCheckpointId: "checkpoint.forest.settlement_perimeter" as const,
    },
  };
  return { sourceDigest: computeRuntimeManifestDigest(body), ...body } as RuntimeForestOpeningManifest;
}

function object(value: ContentValue | undefined, label: string): ContentObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as ContentObject;
}
function objects(value: ContentValue | undefined, label: string): ContentObject[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => object(entry, `${label}[${index}]`));
}
function string(value: ContentValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function strings(value: ContentValue | undefined, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => string(entry, `${label}[${index}]`));
}
function boolean(value: ContentValue | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}
function integer(value: ContentValue | undefined, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
}
function point(value: ContentValue | undefined, label: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must contain two coordinates`);
  return [integer(value[0], `${label}.x`), integer(value[1], `${label}.y`)];
}
function rect(value: ContentValue | undefined, label: string): { x: number; y: number; width: number; height: number } {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${label} must contain four values`);
  return {
    x: integer(value[0], `${label}.x`), y: integer(value[1], `${label}.y`),
    width: integer(value[2], `${label}.width`), height: integer(value[3], `${label}.height`),
  };
}
function exactKeys(value: ContentObject, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
