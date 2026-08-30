import { computeRuntimeManifestDigest } from "./runtime-manifest-digest";

export type ForestOpeningSolutionId = "stone_steps" | "deadwood_bridge" | "shallow_detour";

export interface RuntimeForestOpeningManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/chapters/ch01-opening-slice.v0.1.yaml";
  readonly contentVersion: string;
  readonly sliceId: "ch01_forest_opening_vertical_slice";
  readonly chapterFlowId: "ch01_world_literacy_prologue";
  readonly durationMinutes: readonly [10, 15];
  readonly districtIds: readonly ["forest.arrival", "forest.stream", "forest.settlement"];
  readonly sceneIds: readonly [
    "scene.valley.arrival_shelf",
    "scene.valley.stream_section",
    "scene.valley.settlement",
  ];
  readonly route: readonly Readonly<{
    districtId: string;
    sceneId: string;
  }>[];
  readonly obstacle: Readonly<{
    obstacleId: "damaged_stream_road";
    boundsPx: Readonly<{ x: number; y: number; width: number; height: number }>;
    interactionRadiusPx: 48;
    materialPocketPx: Readonly<{ x: number; y: number; width: 128; height: 64 }>;
    settlementEntranceBoundsPx: Readonly<{ x: number; y: number; width: number; height: number }>;
    objectAnchorsPx: Readonly<{
      stoneA: readonly [number, number];
      stoneB: readonly [number, number];
      deadwood: readonly [number, number];
      unknownGlyph: readonly [number, number];
    }>;
  }>;
  readonly solutions: readonly Readonly<{
    solutionId: ForestOpeningSolutionId;
    semanticAction: "pushLooseStone" | "placeRottenLog" | "digSoftSoil";
  }>[];
  readonly glyphObservation: Readonly<{
    wordId: "word.telo";
    positionPx: readonly [number, number];
    grantsMeaning: false;
    grantsPronunciation: false;
    grantsLearningEvidence: false;
    grantsSpellAccess: false;
  }>;
  readonly ecology: Readonly<{
    disturbanceRadiusPx: number;
    visibleSpecies: readonly Readonly<{
      speciesId: "forest.rabbit" | "forest.wetland_bird";
      initialMode: "foraging" | "wading";
      spawnPx: readonly [number, number];
      escapeAnchorPx: readonly [number, number];
    }>[];
  }>;
  readonly visibleSpeciesIds: readonly ["forest.rabbit", "forest.wetland_bird"];
  readonly audioRoles: readonly ["forest_ambience", "stream_ambience", "foley_bank", "dialogue_blip_bank"];
  readonly assetRoles: readonly [
    "far_parallax_atlas",
    "mid_parallax_atlas",
    "environment_atlas",
    "prop_glyph_atlas",
    "traveler_atlas",
    "creature_atlas",
    "animation_manifest",
    "time_palette",
    "audio_manifest",
  ];
  readonly completion: Readonly<{
    zeroKillRequired: true;
    settlementCheckpointId: "checkpoint.forest.settlement_perimeter";
  }>;
}

const verified = new WeakSet<object>();
const EXPECTED_ROUTE = [
  ["forest.arrival", "scene.valley.arrival_shelf"],
  ["forest.stream", "scene.valley.stream_section"],
  ["forest.settlement", "scene.valley.settlement"],
] as const;
const EXPECTED_SOLUTIONS = [
  ["stone_steps", "pushLooseStone"],
  ["deadwood_bridge", "placeRottenLog"],
  ["shallow_detour", "digSoftSoil"],
] as const;
const EXPECTED_SPECIES = [
  ["forest.rabbit", "foraging", [768, 480], [960, 480]],
  ["forest.wetland_bird", "wading", [1488, 672], [1664, 544]],
] as const;
const EXPECTED_AUDIO = ["forest_ambience", "stream_ambience", "foley_bank", "dialogue_blip_bank"];
const EXPECTED_ASSETS = [
  "far_parallax_atlas", "mid_parallax_atlas", "environment_atlas", "prop_glyph_atlas",
  "traveler_atlas", "creature_atlas", "animation_manifest", "time_palette", "audio_manifest",
];

export function isVerifiedRuntimeForestOpeningManifest(
  value: unknown,
): value is RuntimeForestOpeningManifest {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeForestOpeningManifest(candidate: unknown): RuntimeForestOpeningManifest {
  const artifact = record(candidate, "runtime content artifact");
  const raw = record(artifact.forestOpening, "artifact.forestOpening");
  exactKeys(raw, [
    "sourceDigest", "sourcePath", "contentVersion", "sliceId", "chapterFlowId", "durationMinutes",
    "districtIds", "sceneIds", "route", "obstacle", "solutions", "glyphObservation", "ecology", "visibleSpeciesIds",
    "audioRoles", "assetRoles", "completion",
  ], "forest opening manifest");
  const digest = text(raw.sourceDigest, "forest opening sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("forest opening sourceDigest must be sha256");
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeManifestDigest(body) !== digest) throw new Error("forest opening projection digest mismatch");
  validateCanonical(raw);
  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimeForestOpeningManifest;
  verified.add(result);
  return result;
}

function validateCanonical(raw: Record<string, unknown>): void {
  if (raw.sourcePath !== "data/chapters/ch01-opening-slice.v0.1.yaml" ||
      raw.contentVersion !== "forest-opening.0.1" ||
      raw.sliceId !== "ch01_forest_opening_vertical_slice" ||
      raw.chapterFlowId !== "ch01_world_literacy_prologue" || !same(raw.durationMinutes, [10, 15])) {
    throw new Error("forest opening identity is noncanonical");
  }
  if (!same(raw.districtIds, EXPECTED_ROUTE.map(([districtId]) => districtId)) ||
      !same(raw.sceneIds, EXPECTED_ROUTE.map(([, sceneId]) => sceneId))) {
    throw new Error("forest opening route identity is noncanonical");
  }
  const route = records(raw.route, "forest opening route");
  if (route.length !== EXPECTED_ROUTE.length) throw new Error("forest opening route is noncanonical");
  route.forEach((entry, index) => {
    exactKeys(entry, ["districtId", "sceneId"], `forest opening route[${index}]`);
    if (!same([entry.districtId, entry.sceneId], EXPECTED_ROUTE[index])) throw new Error("forest opening route is noncanonical");
  });

  const obstacle = record(raw.obstacle, "forest opening obstacle");
  exactKeys(obstacle, ["obstacleId", "boundsPx", "interactionRadiusPx", "materialPocketPx", "settlementEntranceBoundsPx", "objectAnchorsPx"], "forest opening obstacle");
  const anchors = record(obstacle.objectAnchorsPx, "forest opening object anchors");
  exactKeys(anchors, ["stoneA", "stoneB", "deadwood", "unknownGlyph"], "forest opening object anchors");
  if (obstacle.obstacleId !== "damaged_stream_road" || obstacle.interactionRadiusPx !== 48 ||
      !same(obstacle.boundsPx, { x: 1760, y: 688, width: 320, height: 128 }) ||
      !same(obstacle.materialPocketPx, { x: 1808, y: 704, width: 128, height: 64 }) ||
      !same(obstacle.settlementEntranceBoundsPx, { x: 2496, y: 640, width: 32, height: 96 }) ||
      !same(anchors, { stoneA: [1840, 704], stoneB: [1888, 704], deadwood: [1968, 688], unknownGlyph: [2144, 672] })) {
    throw new Error("forest opening obstacle is noncanonical");
  }

  const solutions = records(raw.solutions, "forest opening solutions");
  if (solutions.length !== EXPECTED_SOLUTIONS.length) throw new Error("forest opening solutions are noncanonical");
  solutions.forEach((entry, index) => {
    exactKeys(entry, ["solutionId", "semanticAction"], `forest opening solution[${index}]`);
    if (!same([entry.solutionId, entry.semanticAction], EXPECTED_SOLUTIONS[index])) throw new Error("forest opening solutions are noncanonical");
  });

  const glyph = record(raw.glyphObservation, "forest opening glyph");
  exactKeys(glyph, ["wordId", "positionPx", "grantsMeaning", "grantsPronunciation", "grantsLearningEvidence", "grantsSpellAccess"], "forest opening glyph");
  if (!same(glyph, {
    wordId: "word.telo", positionPx: [2144, 672], grantsMeaning: false,
    grantsPronunciation: false, grantsLearningEvidence: false, grantsSpellAccess: false,
  })) throw new Error("forest opening glyph is noncanonical");

  const ecology = record(raw.ecology, "forest opening ecology");
  exactKeys(ecology, ["disturbanceRadiusPx", "visibleSpecies"], "forest opening ecology");
  if (ecology.disturbanceRadiusPx !== 224) throw new Error("forest opening ecology is noncanonical");
  const species = records(ecology.visibleSpecies, "forest opening species");
  if (species.length !== EXPECTED_SPECIES.length ||
      !same(raw.visibleSpeciesIds, EXPECTED_SPECIES.map(([speciesId]) => speciesId))) {
    throw new Error("forest opening species are noncanonical");
  }
  species.forEach((entry, index) => {
    exactKeys(entry, ["speciesId", "initialMode", "spawnPx", "escapeAnchorPx"], `forest opening species[${index}]`);
    if (!same([entry.speciesId, entry.initialMode, entry.spawnPx, entry.escapeAnchorPx], EXPECTED_SPECIES[index])) {
      throw new Error("forest opening species are noncanonical");
    }
  });
  if (!same(raw.audioRoles, EXPECTED_AUDIO) || !same(raw.assetRoles, EXPECTED_ASSETS)) {
    throw new Error("forest opening runtime roles are noncanonical");
  }
  const completion = record(raw.completion, "forest opening completion");
  exactKeys(completion, ["zeroKillRequired", "settlementCheckpointId"], "forest opening completion");
  if (completion.zeroKillRequired !== true || completion.settlementCheckpointId !== "checkpoint.forest.settlement_perimeter") {
    throw new Error("forest opening zero-kill completion is noncanonical");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function records(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => record(entry, `${label}[${index}]`));
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
