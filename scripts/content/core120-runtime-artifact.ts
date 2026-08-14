import { createHash } from "node:crypto";
import { posix } from "node:path";
import type {
  Core120Band,
  Core120VisualDomain,
  RuntimeCore120CurriculumManifest,
  RuntimeCore120Location,
  RuntimeCore120WordManifest,
} from "../../src/content/runtime-core120-curriculum-manifest.ts";
import { computeRuntimeCore120LearningSemanticDigest } from
  "../../src/content/runtime-core120-curriculum-manifest.ts";
import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";

const CORE120_BANDS = ["P0", "P1", "P2", "P3", "P4", "P5"] as const;
const CORE120_ACTION_KINDS = ["discover", "attune", "context_0", "context_1", "repair"] as const;
const CORE120_VISUAL_DOMAINS = [
  "D_SYNTAX_BINDER", "D_QUANTITY_LOGIC", "D_MATTER_ENV", "D_LIFE_ENTITY", "D_CRAFT_OBJECT",
  "D_ENERGY_FIELD", "D_PROPERTY_FORM", "D_ACTION_PROCESS", "D_SPACE_TIME", "D_PERCEPTION_SOCIAL",
] as const;
const EXPECTED_BAND_COUNTS = Object.freeze({ P0: 12, P1: 18, P2: 24, P3: 30, P4: 24, P5: 12 });
const CORE120_COMPATIBLE_LEGACY_CONTRACTS = [
  {
    sourceDigest: "sha256:5d6d824a0c0397b109e5f3934f7f7ec92bdebef912368c5c7ea680b5f3721f2c",
    semanticDigest: "sha256:fba08cdb6158c93ccb08eef9d65fab06621c0c12f04f57ae72e71b194da3e0b8",
  },
] as const;

export function projectCore120Curriculum(manifest: ContentManifest): RuntimeCore120CurriculumManifest {
  const progressionSources = manifest.byKind.glyph_progression;
  const catalogSources = manifest.byKind.glyph_catalog.filter((source) => source.schemaVersion === "pu120.magic-glyph-catalog.v0.2");
  if (progressionSources.length !== 1 || catalogSources.length !== 1) throw new Error("core120 requires exactly one glyph progression and one v0.2 catalog");
  const progression = progressionSources[0]!;
  const catalog = catalogSources[0]!;
  if (progression.path !== "data/language/glyph-progression.v0.1.yaml" || progression.contentVersion !== "core-120.prologue-12" || catalog.path !== "data/language/pu-120-glyph-catalog.v0.2.json" || catalog.contentVersion !== "pu-120.visual-semantic-draft.2") throw new Error("core120 source identity is noncanonical");
  const runtime = object(progression.content.runtime_curriculum, "runtime_curriculum");
  const catalogSourcePath = resolve(progression.path, string(runtime.catalog_ref, "runtime_curriculum.catalog_ref"));
  if (catalogSourcePath !== catalog.path) throw new Error("core120 catalog_ref is invalid");
  exact(runtime.target_state, "produced", "runtime_curriculum.target_state");
  sameExact(strings(runtime.action_kinds, "runtime_curriculum.action_kinds"), CORE120_ACTION_KINDS, "core120 action kinds");
  const compatibleLegacyContracts = objects(runtime.compatible_legacy_learning_contracts,
    "runtime_curriculum.compatible_legacy_learning_contracts");
  if (compatibleLegacyContracts.length !== CORE120_COMPATIBLE_LEGACY_CONTRACTS.length ||
      compatibleLegacyContracts.some((contract, index) =>
        !sameSet(Object.keys(contract), ["source_digest", "semantic_digest"]) ||
        contract.source_digest !== CORE120_COMPATIBLE_LEGACY_CONTRACTS[index]!.sourceDigest ||
        contract.semantic_digest !== CORE120_COMPATIBLE_LEGACY_CONTRACTS[index]!.semanticDigest)) {
    throw new Error("core120 compatible legacy learning contracts are invalid");
  }

  const worldContextAuthoritySource = object(runtime.world_context_authority,
    "runtime_curriculum.world_context_authority");
  const sceneCoordinateOrigins = object(worldContextAuthoritySource.scene_coordinate_origins,
    "runtime_curriculum.world_context_authority.scene_coordinate_origins");
  const expectedSceneCoordinateOrigins = {
    "scene.valley.settlement": "top_left", "scene.valley.den_bypass": "bottom_left",
    "scene.valley.return_channel": "bottom_left", "scene.valley.safe_range": "bottom_left",
    "scene.valley.old_mine_threshold": "bottom_left",
  } as const;
  if (!sameSet(Object.keys(worldContextAuthoritySource),
    ["maximum_distance_px", "recovery_requires_prior_scene_visit", "scene_coordinate_origins"]) ||
      worldContextAuthoritySource.maximum_distance_px !== 16 ||
      worldContextAuthoritySource.recovery_requires_prior_scene_visit !== true ||
      !sameSet(Object.keys(sceneCoordinateOrigins), Object.keys(expectedSceneCoordinateOrigins)) ||
      Object.entries(expectedSceneCoordinateOrigins).some(([sceneId, origin]) =>
        sceneCoordinateOrigins[sceneId] !== origin)) {
    throw new Error("core120 world context authority is invalid");
  }

  const recovery = object(runtime.recovery_station, "runtime_curriculum.recovery_station");
  const recoveryLocation = projectLocation(manifest, progression.path, recovery, "core120 recovery station",
    sceneCoordinateOrigins);
  const recoveryScene = manifest.sources[resolve(progression.path, string(recovery.scene_ref, "recovery.scene_ref"))]!;
  const recoveryInteraction = objects(recoveryScene.content.interactions, "recovery scene interactions").find((entry) => entry.interaction_id === recovery.interaction_id);
  if (recoveryLocation.sceneId !== "scene.valley.settlement" || recoveryLocation.targetId !== "settlement.p0_inscription_archive" || recovery.interaction_id !== "settlement.open_p0_inscription_archive" || recovery.maximum_distance_px !== 16 || !recoveryInteraction || recoveryInteraction.target_id !== recoveryLocation.targetId || recoveryInteraction.verb !== "open_p0_learning_recovery" || recoveryInteraction.tool_or_magic_required !== false) throw new Error("core120 recovery station is invalid");
  const routesSource = object(runtime.domain_routes, "runtime_curriculum.domain_routes");
  if (!sameSet(Object.keys(routesSource), CORE120_VISUAL_DOMAINS)) throw new Error("core120 domain route set is invalid");
  const domainRoutes = {} as Record<Core120VisualDomain, { primary: RuntimeCore120Location; reinforcement: RuntimeCore120Location }>;
  for (const domain of CORE120_VISUAL_DOMAINS) {
    const route = object(routesSource[domain], `domain_routes.${domain}`);
    if (!sameSet(Object.keys(route), ["primary", "reinforcement"])) throw new Error(`${domain} route fields are invalid`);
    const primary = projectLocation(manifest, progression.path, object(route.primary, `${domain}.primary`),
      `${domain}.primary`, sceneCoordinateOrigins);
    const reinforcement = projectLocation(manifest, progression.path,
      object(route.reinforcement, `${domain}.reinforcement`), `${domain}.reinforcement`, sceneCoordinateOrigins);
    if (primary.sceneId === reinforcement.sceneId || primary.targetId === reinforcement.targetId) throw new Error(`${domain} must use distinct context witnesses`);
    domainRoutes[domain] = { primary, reinforcement };
  }

  const canonicalScope = object(catalog.content.canonicalScope, "catalog.canonicalScope");
  const catalogCurriculum = object(catalog.content.curriculum, "catalog.curriculum");
  const bandCounts = object(catalogCurriculum.bandCounts, "catalog.curriculum.bandCounts");
  if (canonicalScope.id !== "pu-120" || canonicalScope.glyphCount !== 120 || !same(canonicalScope.ucsurRange, ["U+F1900", "U+F1977"])) throw new Error("core120 catalog scope is invalid");
  for (const band of CORE120_BANDS) if (bandCounts[band] !== EXPECTED_BAND_COUNTS[band]) throw new Error(`core120 catalog ${band} count is invalid`);
  const glyphs = objects(catalog.content.glyphs, "catalog.glyphs");
  if (glyphs.length !== 120) throw new Error("core120 catalog must contain exactly 120 glyphs");
  const wordIds = glyphs.map((glyph) => string(glyph.canonicalWordId, "glyph.canonicalWordId"));
  if (new Set(wordIds).size !== 120) throw new Error("core120 word IDs must be unique");
  const observedBands: Record<Core120Band, number> = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
  const words = Object.fromEntries(glyphs.map((glyph, index) => {
    const wordId = string(glyph.canonicalWordId, "glyph.canonicalWordId");
    if (!/^[a-z]+$/.test(wordId)) throw new Error(`core120 word ${wordId} is not canonical`);
    const displayCodepoint = string(glyph.displayCodepoint, `${wordId}.displayCodepoint`);
    const expectedCodepoint = `U+${(0xf1900 + index).toString(16).toUpperCase()}`;
    if (displayCodepoint !== expectedCodepoint) throw new Error(`${wordId} display codepoint is noncanonical`);
    const curriculumBand = string(glyph.curriculumBand, `${wordId}.curriculumBand`) as Core120Band;
    const visualDomainId = string(glyph.visualDomainId, `${wordId}.visualDomainId`) as Core120VisualDomain;
    if (!CORE120_BANDS.includes(curriculumBand) || !CORE120_VISUAL_DOMAINS.includes(visualDomainId) || glyph.domainId !== visualDomainId) throw new Error(`${wordId} band/domain is invalid`);
    observedBands[curriculumBand] += 1;
    const semanticFacets = strings(glyph.semanticFacets, `${wordId}.semanticFacets`);
    const availableRoles = strings(glyph.availableRoles, `${wordId}.availableRoles`);
    const cues = pair(glyph.soloCueVariants, `${wordId}.soloCueVariants`);
    const route = domainRoutes[visualDomainId];
    const contexts = cues.map((cueId, contextIndex) => {
      const location = contextIndex === 0 ? route.primary : route.reinforcement;
      return {
        contextId: `core120.${wordId}.context_${contextIndex}`,
        taskFamilyId: `core120.${wordId}.family_${contextIndex}`,
        cueId,
        environmentFingerprint: `${location.sceneId}:${location.targetId}:${cueId}`,
        location,
      };
    }) as [RuntimeCore120WordManifest["contexts"][0], RuntimeCore120WordManifest["contexts"][1]];
    const word: RuntimeCore120WordManifest = {
      wordId,
      displayCodepoint,
      curriculumBand,
      visualDomainId,
      targetState: "produced",
      semanticFacets,
      availableRoles,
      contexts,
      misconceptionRepair: {
        repairId: `core120.${wordId}.single_cue_overreach`,
        kind: "single_cue_overreach",
        cueVariants: cues,
      },
      assetBindings: {
        pronunciationAssetId: `audio.pronunciation.${wordId}.v1`,
        glyphAssetId: `glyph.pu120.${wordId}.v2`,
      },
    };
    return [wordId, word];
  }));
  for (const band of CORE120_BANDS) if (observedBands[band] !== EXPECTED_BAND_COUNTS[band]) throw new Error(`core120 projected ${band} count is invalid`);

  const acceptance = {
    allWordsRecoverable: exact(runtime.all_words_recoverable, true, "all_words_recoverable"),
    contextsPerWord: exact(runtime.contexts_per_word, 2, "contexts_per_word"),
    misconceptionRepairsPerWord: exact(runtime.misconception_repairs_per_word, 1, "misconception_repairs_per_word"),
    distinctTaskFamilyPerContext: exact(runtime.distinct_task_family_per_context, true, "distinct_task_family_per_context"),
    pronunciationAudioRequired: exact(runtime.pronunciation_audio_required, true, "pronunciation_audio_required"),
    communitySemanticReviewRequired: exact(runtime.community_semantic_review_required, true, "community_semantic_review_required"),
    rawStringEqualityAsSuccessForbidden: exact(runtime.raw_string_equality_as_success_forbidden, true, "raw_string_equality_as_success_forbidden"),
    colorOnlyIdentificationForbidden: exact(runtime.color_only_identification_forbidden, true, "color_only_identification_forbidden"),
    fixedSlotOnlyProductionForbidden: exact(runtime.fixed_slot_only_production_forbidden, true, "fixed_slot_only_production_forbidden"),
  } as const;
  const body = {
    sourcePath: progression.path,
    contentVersion: progression.contentVersion,
    catalogSourcePath,
    catalogContentVersion: catalog.contentVersion,
    catalogReviewStatus: exactOne(catalog.content.reviewStatus, ["draft", "approved"] as const, "catalog.reviewStatus"),
    catalogRuntimeReady: boolean(catalog.content.runtimeReady, "catalog.runtimeReady"),
    scope: { corpusId: "pu-120", uniqueWordCount: 120, wordIds, bandCounts: EXPECTED_BAND_COUNTS },
    actionKinds: CORE120_ACTION_KINDS,
    recoveryStation: { ...recoveryLocation, interactionId: "settlement.open_p0_inscription_archive", maximumDistancePx: 16 },
    worldContextAuthority: { maximumDistancePx: 16, recoveryRequiresPriorSceneVisit: true,
      sceneCoordinateOrigins: expectedSceneCoordinateOrigins },
    domainRoutes,
    words,
    acceptance,
  } as const;
  if (body.catalogRuntimeReady && body.catalogReviewStatus !== "approved") throw new Error("core120 catalog cannot be runtime-ready before approval");
  const semanticDigest = computeRuntimeCore120LearningSemanticDigest(body);
  if (CORE120_COMPATIBLE_LEGACY_CONTRACTS.some((contract) =>
    contract.semanticDigest !== semanticDigest)) {
    throw new Error("core120 legacy readers do not match the current semantic contract");
  }
  const learningContract = {
    evidenceIdentityVersion: "core120-learning-evidence.v0.2",
    semanticDigest,
    compatibleLegacyContracts: CORE120_COMPATIBLE_LEGACY_CONTRACTS,
  } as const;
  const projected = { learningContract, ...body } as const;
  return { sourceDigest: `sha256:${createHash("sha256").update(stable(projected)).digest("hex")}`,
    ...projected } as RuntimeCore120CurriculumManifest;
}

function projectLocation(manifest: ContentManifest, sourcePath: string, value: ContentObject, label: string,
  sceneCoordinateOrigins: ContentObject): RuntimeCore120Location {
  const scenePath = resolve(sourcePath, string(value.scene_ref, `${label}.scene_ref`));
  const scene = manifest.sources[scenePath];
  const sceneId = string(value.scene_id, `${label}.scene_id`);
  const targetId = string(value.target_id, `${label}.target_id`);
  const point = numericPair(value.interaction_point_tiles, `${label}.interaction_point_tiles`);
  if (!scene || scene.kind !== "scene" || scene.content.scene_id !== sceneId) throw new Error(`${label} scene_ref is invalid`);
  const target = objects(scene.content.targets, `${label}.targets`).find((entry) => entry.target_id === targetId);
  if (!target || !same(target.interaction_point_tiles, point)) throw new Error(`${label} target binding is invalid`);
  const tileSizePx = scene.content.tile_size_px;
  const sceneSize = object(scene.content.size_tiles, `${label}.scene.size_tiles`);
  if (!Number.isSafeInteger(tileSizePx) || (tileSizePx as number) <= 0 ||
      !Number.isSafeInteger(sceneSize.height) || (sceneSize.height as number) <= point[1]) {
    throw new Error(`${label} scene geometry is invalid`);
  }
  const origin = sceneCoordinateOrigins[sceneId];
  if (origin !== "top_left" && origin !== "bottom_left") throw new Error(`${label} coordinate origin is invalid`);
  return { sceneId, targetId, interactionPointTiles: point, interactionPointPx: {
    x: point[0] * (tileSizePx as number),
    y: origin === "top_left" ? point[1] * (tileSizePx as number) :
      ((sceneSize.height as number) - 1 - point[1]) * (tileSizePx as number),
  } };
}

function resolve(from: string, ref: string): string { return posix.normalize(posix.join(posix.dirname(from), ref)); }
function object(value: ContentValue | undefined, label: string): ContentObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as ContentObject; }
function objects(value: ContentValue | undefined, label: string): ContentObject[] { if (!Array.isArray(value) || !value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry))) throw new Error(`${label} must be an object array`); return value as ContentObject[]; }
function string(value: ContentValue | undefined, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function strings(value: ContentValue | undefined, label: string): string[] { if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string" && entry.length > 0) || new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`); return [...value] as string[]; }
function pair(value: ContentValue | undefined, label: string): [string, string] { const result = strings(value, label); if (result.length !== 2) throw new Error(`${label} must contain exactly two values`); return [result[0]!, result[1]!]; }
function numericPair(value: ContentValue | undefined, label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || !value.every((entry) => Number.isSafeInteger(entry) && (entry as number) >= 0)) throw new Error(`${label} must be a non-negative integer pair`); return [value[0] as number, value[1] as number]; }
function boolean(value: ContentValue | undefined, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`); return value; }
function exact<T extends string | number | boolean>(value: ContentValue | undefined, expected: T, label: string): T { if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`); return expected; }
function exactOne<const T extends readonly string[]>(value: ContentValue | undefined, expected: T, label: string): T[number] { if (typeof value !== "string" || !expected.includes(value)) throw new Error(`${label} is invalid`); return value as T[number]; }
function same(value: unknown, expected: readonly unknown[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function sameSet(value: readonly string[], expected: readonly string[]): boolean { return value.length === expected.length && new Set(value).size === value.length && expected.every((entry) => value.includes(entry)); }
function sameExact(value: readonly string[], expected: readonly string[], label: string): void { if (!same(value, expected)) throw new Error(`${label} is noncanonical`); }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; const entry = value as Record<string, unknown>; return `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${stable(entry[key])}`).join(",")}}`; }
