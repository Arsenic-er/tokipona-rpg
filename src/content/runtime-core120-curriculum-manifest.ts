import { computeRuntimeManifestDigest } from "./runtime-manifest-digest";

export const CORE120_BANDS = ["P0", "P1", "P2", "P3", "P4", "P5"] as const;
export const CORE120_ACTION_KINDS = ["discover", "attune", "context_0", "context_1", "repair"] as const;
export const CORE120_VISUAL_DOMAINS = [
  "D_SYNTAX_BINDER",
  "D_QUANTITY_LOGIC",
  "D_MATTER_ENV",
  "D_LIFE_ENTITY",
  "D_CRAFT_OBJECT",
  "D_ENERGY_FIELD",
  "D_PROPERTY_FORM",
  "D_ACTION_PROCESS",
  "D_SPACE_TIME",
  "D_PERCEPTION_SOCIAL",
] as const;

export type Core120Band = (typeof CORE120_BANDS)[number];
export type Core120ActionKind = (typeof CORE120_ACTION_KINDS)[number];
export type Core120VisualDomain = (typeof CORE120_VISUAL_DOMAINS)[number];

export interface RuntimeCore120Location {
  readonly sceneId: string;
  readonly targetId: string;
  readonly interactionPointTiles: readonly [number, number];
}

export interface RuntimeCore120Context {
  readonly contextId: string;
  readonly taskFamilyId: string;
  readonly cueId: string;
  readonly environmentFingerprint: string;
  readonly location: RuntimeCore120Location;
}

export interface RuntimeCore120WordManifest {
  readonly wordId: string;
  readonly displayCodepoint: string;
  readonly curriculumBand: Core120Band;
  readonly visualDomainId: Core120VisualDomain;
  readonly targetState: "produced";
  readonly semanticFacets: readonly string[];
  readonly availableRoles: readonly string[];
  readonly contexts: readonly [RuntimeCore120Context, RuntimeCore120Context];
  readonly misconceptionRepair: Readonly<{
    readonly repairId: string;
    readonly kind: "single_cue_overreach";
    readonly cueVariants: readonly [string, string];
  }>;
  readonly assetBindings: Readonly<{
    readonly pronunciationAssetId: string;
    readonly glyphAssetId: string;
  }>;
}

export interface RuntimeCore120CurriculumManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/language/glyph-progression.v0.1.yaml";
  readonly contentVersion: "core-120.prologue-12";
  readonly catalogSourcePath: "data/language/pu-120-glyph-catalog.v0.2.json";
  readonly catalogContentVersion: "pu-120.visual-semantic-draft.2";
  readonly catalogReviewStatus: "draft" | "approved";
  readonly catalogRuntimeReady: boolean;
  readonly scope: Readonly<{
    readonly corpusId: "pu-120";
    readonly uniqueWordCount: 120;
    readonly wordIds: readonly string[];
    readonly bandCounts: Readonly<Record<Core120Band, number>>;
  }>;
  readonly actionKinds: typeof CORE120_ACTION_KINDS;
  readonly recoveryStation: RuntimeCore120Location & Readonly<{
    readonly interactionId: "settlement.open_p0_inscription_archive";
    readonly maximumDistancePx: 16;
  }>;
  readonly domainRoutes: Readonly<Record<Core120VisualDomain, Readonly<{
    readonly primary: RuntimeCore120Location;
    readonly reinforcement: RuntimeCore120Location;
  }>>>;
  readonly words: Readonly<Record<string, RuntimeCore120WordManifest>>;
  readonly acceptance: Readonly<{
    readonly allWordsRecoverable: true;
    readonly contextsPerWord: 2;
    readonly misconceptionRepairsPerWord: 1;
    readonly distinctTaskFamilyPerContext: true;
    readonly pronunciationAudioRequired: true;
    readonly communitySemanticReviewRequired: true;
    readonly rawStringEqualityAsSuccessForbidden: true;
    readonly colorOnlyIdentificationForbidden: true;
    readonly fixedSlotOnlyProductionForbidden: true;
  }>;
}

const EXPECTED_BAND_COUNTS = Object.freeze({ P0: 12, P1: 18, P2: 24, P3: 30, P4: 24, P5: 12 });
const REQUIRED_P0_WORD_IDS = ["telo", "tawa", "lili", "suli", "seli", "kiwen", "awen", "kon", "kasi", "lukin", "weka", "soweli"] as const;
const verified = new WeakSet<object>();

export function computeRuntimeCore120CurriculumDigest(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedRuntimeCore120CurriculumManifest(value: unknown): value is RuntimeCore120CurriculumManifest {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeCore120CurriculumManifest(candidate: unknown): RuntimeCore120CurriculumManifest {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.core120Curriculum, "artifact.core120Curriculum");
  exactKeys(raw, ["sourceDigest", "sourcePath", "contentVersion", "catalogSourcePath", "catalogContentVersion", "catalogReviewStatus", "catalogRuntimeReady", "scope", "actionKinds", "recoveryStation", "domainRoutes", "words", "acceptance"], "core120 curriculum");
  const digest = string(raw.sourceDigest, "core120 sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("core120 sourceDigest must be sha256");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeCore120CurriculumDigest(payload) !== digest) throw new Error("core120 curriculum projection digest mismatch");
  if (raw.sourcePath !== "data/language/glyph-progression.v0.1.yaml" || raw.contentVersion !== "core-120.prologue-12" || raw.catalogSourcePath !== "data/language/pu-120-glyph-catalog.v0.2.json" || raw.catalogContentVersion !== "pu-120.visual-semantic-draft.2") throw new Error("core120 source identity is invalid");
  if ((raw.catalogReviewStatus !== "draft" && raw.catalogReviewStatus !== "approved") || typeof raw.catalogRuntimeReady !== "boolean" || (raw.catalogRuntimeReady && raw.catalogReviewStatus !== "approved")) throw new Error("core120 catalog release status is inconsistent");

  const scope = record(raw.scope, "core120 scope");
  exactKeys(scope, ["corpusId", "uniqueWordCount", "wordIds", "bandCounts"], "core120 scope");
  const wordIds = stringArray(scope.wordIds, "core120 wordIds", 120);
  if (scope.corpusId !== "pu-120" || scope.uniqueWordCount !== 120 || !sameSet(wordIds.filter((word) => (REQUIRED_P0_WORD_IDS as readonly string[]).includes(word)), REQUIRED_P0_WORD_IDS)) throw new Error("core120 scope is invalid");
  const bandCounts = record(scope.bandCounts, "core120 bandCounts");
  exactKeys(bandCounts, CORE120_BANDS, "core120 bandCounts");
  for (const band of CORE120_BANDS) if (bandCounts[band] !== EXPECTED_BAND_COUNTS[band]) throw new Error(`core120 ${band} count is invalid`);
  if (!same(raw.actionKinds, CORE120_ACTION_KINDS)) throw new Error("core120 action kinds are invalid");

  const recoveryStation = readLocation(raw.recoveryStation, "core120 recovery station");
  const recoveryRaw = record(raw.recoveryStation, "core120 recovery station");
  exactKeys(recoveryRaw, ["sceneId", "targetId", "interactionPointTiles", "interactionId", "maximumDistancePx"], "core120 recovery station");
  if (recoveryStation.sceneId !== "scene.valley.settlement" || recoveryStation.targetId !== "settlement.p0_inscription_archive" || recoveryRaw.interactionId !== "settlement.open_p0_inscription_archive" || recoveryRaw.maximumDistancePx !== 16) throw new Error("core120 recovery station is noncanonical");

  const routesRaw = record(raw.domainRoutes, "core120 domain routes");
  exactKeys(routesRaw, CORE120_VISUAL_DOMAINS, "core120 domain routes");
  const domainRoutes = {} as Record<Core120VisualDomain, { primary: RuntimeCore120Location; reinforcement: RuntimeCore120Location }>;
  for (const domain of CORE120_VISUAL_DOMAINS) {
    const route = record(routesRaw[domain], `core120 route ${domain}`);
    exactKeys(route, ["primary", "reinforcement"], `core120 route ${domain}`);
    const primary = readLocation(route.primary, `${domain}.primary`);
    const reinforcement = readLocation(route.reinforcement, `${domain}.reinforcement`);
    if (primary.sceneId === reinforcement.sceneId || primary.targetId === reinforcement.targetId) throw new Error(`${domain} contexts must use distinct world witnesses`);
    domainRoutes[domain] = { primary, reinforcement };
  }

  const wordsRaw = record(raw.words, "core120 words");
  if (!sameSet(Object.keys(wordsRaw), wordIds)) throw new Error("core120 words must match the exact corpus IDs");
  const codepoints = new Set<string>();
  const observedBands: Record<Core120Band, number> = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
  for (const [index, wordId] of wordIds.entries()) {
    if (!/^[a-z]+$/.test(wordId)) throw new Error(`core120 word ${wordId} is not canonical`);
    const word = record(wordsRaw[wordId], `core120 word ${wordId}`);
    exactKeys(word, ["wordId", "displayCodepoint", "curriculumBand", "visualDomainId", "targetState", "semanticFacets", "availableRoles", "contexts", "misconceptionRepair", "assetBindings"], `core120 word ${wordId}`);
    const expectedCodepoint = `U+${(0xf1900 + index).toString(16).toUpperCase()}`;
    if (word.wordId !== wordId || word.displayCodepoint !== expectedCodepoint || codepoints.has(expectedCodepoint) || !CORE120_BANDS.includes(word.curriculumBand as Core120Band) || !CORE120_VISUAL_DOMAINS.includes(word.visualDomainId as Core120VisualDomain) || word.targetState !== "produced") throw new Error(`core120 word ${wordId} identity is invalid`);
    codepoints.add(expectedCodepoint);
    observedBands[word.curriculumBand as Core120Band] += 1;
    stringArray(word.semanticFacets, `${wordId}.semanticFacets`);
    stringArray(word.availableRoles, `${wordId}.availableRoles`);
    if (!Array.isArray(word.contexts) || word.contexts.length !== 2) throw new Error(`${wordId} must contain exactly two contexts`);
    const expectedRoute = domainRoutes[word.visualDomainId as Core120VisualDomain];
    const contexts = word.contexts.map((value, contextIndex) => readContext(value, wordId, contextIndex, contextIndex === 0 ? expectedRoute.primary : expectedRoute.reinforcement));
    if (contexts[0]!.cueId === contexts[1]!.cueId || contexts[0]!.taskFamilyId === contexts[1]!.taskFamilyId) throw new Error(`${wordId} context cues and task families must be distinct`);
    const repair = record(word.misconceptionRepair, `${wordId}.misconceptionRepair`);
    exactKeys(repair, ["repairId", "kind", "cueVariants"], `${wordId}.misconceptionRepair`);
    if (repair.repairId !== `core120.${wordId}.single_cue_overreach` || repair.kind !== "single_cue_overreach" || !same(repair.cueVariants, contexts.map((context) => context.cueId))) throw new Error(`${wordId} misconception repair is invalid`);
    const assets = record(word.assetBindings, `${wordId}.assetBindings`);
    exactKeys(assets, ["pronunciationAssetId", "glyphAssetId"], `${wordId}.assetBindings`);
    if (assets.pronunciationAssetId !== `audio.pronunciation.${wordId}.v1` || assets.glyphAssetId !== `glyph.pu120.${wordId}.v2`) throw new Error(`${wordId} asset bindings are invalid`);
  }
  for (const band of CORE120_BANDS) if (observedBands[band] !== EXPECTED_BAND_COUNTS[band]) throw new Error(`core120 projected ${band} count is invalid`);

  const acceptance = record(raw.acceptance, "core120 acceptance");
  exactKeys(acceptance, ["allWordsRecoverable", "contextsPerWord", "misconceptionRepairsPerWord", "distinctTaskFamilyPerContext", "pronunciationAudioRequired", "communitySemanticReviewRequired", "rawStringEqualityAsSuccessForbidden", "colorOnlyIdentificationForbidden", "fixedSlotOnlyProductionForbidden"], "core120 acceptance");
  if (acceptance.allWordsRecoverable !== true || acceptance.contextsPerWord !== 2 || acceptance.misconceptionRepairsPerWord !== 1 || acceptance.distinctTaskFamilyPerContext !== true || acceptance.pronunciationAudioRequired !== true || acceptance.communitySemanticReviewRequired !== true || acceptance.rawStringEqualityAsSuccessForbidden !== true || acceptance.colorOnlyIdentificationForbidden !== true || acceptance.fixedSlotOnlyProductionForbidden !== true) throw new Error("core120 acceptance contract is invalid");

  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimeCore120CurriculumManifest;
  verified.add(result);
  return result;
}

function readContext(value: unknown, wordId: string, index: number, expectedLocation: RuntimeCore120Location): RuntimeCore120Context {
  const context = record(value, `${wordId}.contexts[${index}]`);
  exactKeys(context, ["contextId", "taskFamilyId", "cueId", "environmentFingerprint", "location"], `${wordId}.contexts[${index}]`);
  const cueId = string(context.cueId, `${wordId}.contexts[${index}].cueId`);
  const location = readLocation(context.location, `${wordId}.contexts[${index}].location`);
  if (context.contextId !== `core120.${wordId}.context_${index}` || context.taskFamilyId !== `core120.${wordId}.family_${index}` || context.environmentFingerprint !== `${location.sceneId}:${location.targetId}:${cueId}` || !sameLocation(location, expectedLocation)) throw new Error(`${wordId} context ${index} is invalid`);
  return context as unknown as RuntimeCore120Context;
}

function readLocation(value: unknown, label: string): RuntimeCore120Location {
  const location = record(value, label);
  const allowed = label === "core120 recovery station" ? ["sceneId", "targetId", "interactionPointTiles", "interactionId", "maximumDistancePx"] : ["sceneId", "targetId", "interactionPointTiles"];
  exactKeys(location, allowed, label);
  const point = location.interactionPointTiles;
  if (typeof location.sceneId !== "string" || !/^scene\.[a-z0-9_.]+$/.test(location.sceneId) || typeof location.targetId !== "string" || !/^[a-z0-9_.]+$/.test(location.targetId) || !Array.isArray(point) || point.length !== 2 || !point.every((entry) => Number.isSafeInteger(entry) && entry >= 0)) throw new Error(`${label} is invalid`);
  const interactionPointTiles: readonly [number, number] = [point[0] as number, point[1] as number];
  return Object.freeze({ sceneId: location.sceneId, targetId: location.targetId, interactionPointTiles });
}

function sameLocation(left: RuntimeCore120Location, right: RuntimeCore120Location): boolean {
  return left.sceneId === right.sceneId && left.targetId === right.targetId && left.interactionPointTiles[0] === right.interactionPointTiles[0] && left.interactionPointTiles[1] === right.interactionPointTiles[1];
}

function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function stringArray(value: unknown, label: string, exactLength?: number): string[] { if (!Array.isArray(value) || (exactLength !== undefined && value.length !== exactLength) || value.length === 0 || !value.every((entry) => typeof entry === "string" && entry.length > 0) || new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`); return [...value]; }
function same(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function sameSet(value: readonly string[] | unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && expected.every((entry) => value.includes(entry)); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { if (!sameSet(Object.keys(value), expected)) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
