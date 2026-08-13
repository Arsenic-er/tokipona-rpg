export interface RuntimeWildlifeSpeciesManifest {
  readonly entityId: string;
  readonly species: "rabbit" | "fox";
  readonly maxHp: number;
  readonly homeSceneId: string;
  readonly spawnAnchor: string;
  readonly realEscapeExit: string;
  readonly warningZoneAnchor: string | null;
  readonly defensiveActionKind: string;
  readonly defensiveDamage: number;
  readonly guardingYoungDamage: number | null;
  readonly defenseOnlyWhen: readonly string[];
  readonly preferredResponse: string;
  readonly returnCondition: string | null;
}

export interface RuntimeEcologyManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly ecologyId: string;
  readonly minimumWarningTelegraphSeconds: number;
  readonly intrusionBeforeDefenseSeconds: number;
  readonly loseSightSeconds: number;
  readonly deescalateSeconds: number;
  readonly mandatoryKills: 0;
  readonly requiredQuestDrops: 0;
  readonly languageEvidenceFromHarmForbidden: true;
  readonly species: Readonly<{
    readonly rabbit: RuntimeWildlifeSpeciesManifest;
    readonly fox: RuntimeWildlifeSpeciesManifest;
  }>;
}

/** Fail-closed boundary for the deliberately narrow N06 ecology projection. */
export function readRuntimeEcologyManifest(candidate: unknown): RuntimeEcologyManifest {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.ecology, "runtime content artifact.ecology");
  const digest = stringValue(raw.sourceDigest, "ecology.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error("ecology.sourceDigest must be a sha256 digest");
  }
  if (raw.ecologyId !== "valley_prologue") {
    throw new Error("ecology.ecologyId must be valley_prologue");
  }
  const warning = finiteNumber(raw.minimumWarningTelegraphSeconds, "ecology.minimumWarningTelegraphSeconds");
  const defense = finiteNumber(raw.intrusionBeforeDefenseSeconds, "ecology.intrusionBeforeDefenseSeconds");
  if (warning < 0.7) throw new Error("ecology warning telegraph must be at least 0.7 seconds");
  if (defense < 1.5) throw new Error("ecology defense delay must be at least 1.5 seconds");
  const loseSight = positiveNumber(raw.loseSightSeconds, "ecology.loseSightSeconds");
  const deescalate = positiveNumber(raw.deescalateSeconds, "ecology.deescalateSeconds");
  if (raw.mandatoryKills !== 0 || raw.requiredQuestDrops !== 0 || raw.languageEvidenceFromHarmForbidden !== true) {
    throw new Error("ecology must preserve zero-kill, zero-drop and no-harm-language contracts");
  }
  const species = record(raw.species, "ecology.species");
  const rabbit = readSpecies(species.rabbit, "rabbit");
  const fox = readSpecies(species.fox, "fox");
  if (rabbit.entityId !== "wildlife.rabbit.valley" || rabbit.defensiveDamage !== 2 || rabbit.realEscapeExit.length === 0) {
    throw new Error("ecology rabbit projection is not canonical");
  }
  if (fox.entityId !== "wildlife.fox.den" || fox.homeSceneId !== "scene.valley.den_bypass" ||
      fox.defensiveDamage !== 6 || fox.guardingYoungDamage !== 8 || fox.warningZoneAnchor === null ||
      fox.returnCondition === null || !fox.returnCondition.includes("fox_den_intact")) {
    throw new Error("ecology fox projection is not canonical");
  }
  return Object.freeze({
    sourceDigest: digest as `sha256:${string}`,
    ecologyId: "valley_prologue",
    minimumWarningTelegraphSeconds: warning,
    intrusionBeforeDefenseSeconds: defense,
    loseSightSeconds: loseSight,
    deescalateSeconds: deescalate,
    mandatoryKills: 0,
    requiredQuestDrops: 0,
    languageEvidenceFromHarmForbidden: true,
    species: Object.freeze({ rabbit, fox }),
  });
}

function readSpecies(value: unknown, expected: "rabbit" | "fox"): RuntimeWildlifeSpeciesManifest {
  const raw = record(value, `ecology.species.${expected}`);
  if (raw.species !== expected) throw new Error(`ecology species ${expected} must identify itself`);
  const guardingYoungDamage = raw.guardingYoungDamage === null
    ? null
    : nonNegativeNumber(raw.guardingYoungDamage, `ecology.species.${expected}.guardingYoungDamage`);
  const warningZoneAnchor = nullableString(raw.warningZoneAnchor, `ecology.species.${expected}.warningZoneAnchor`);
  const returnCondition = nullableString(raw.returnCondition, `ecology.species.${expected}.returnCondition`);
  return Object.freeze({
    entityId: stringValue(raw.entityId, `ecology.species.${expected}.entityId`),
    species: expected,
    maxHp: positiveNumber(raw.maxHp, `ecology.species.${expected}.maxHp`),
    homeSceneId: stringValue(raw.homeSceneId, `ecology.species.${expected}.homeSceneId`),
    spawnAnchor: stringValue(raw.spawnAnchor, `ecology.species.${expected}.spawnAnchor`),
    realEscapeExit: stringValue(raw.realEscapeExit, `ecology.species.${expected}.realEscapeExit`),
    warningZoneAnchor,
    defensiveActionKind: stringValue(raw.defensiveActionKind, `ecology.species.${expected}.defensiveActionKind`),
    defensiveDamage: nonNegativeNumber(raw.defensiveDamage, `ecology.species.${expected}.defensiveDamage`),
    guardingYoungDamage,
    defenseOnlyWhen: stringArray(raw.defenseOnlyWhen, `ecology.species.${expected}.defenseOnlyWhen`),
    preferredResponse: stringValue(raw.preferredResponse, `ecology.species.${expected}.preferredResponse`),
    returnCondition,
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return stringValue(value, label);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result <= 0) throw new Error(`${label} must be positive`);
  return result;
}

function nonNegativeNumber(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result < 0) throw new Error(`${label} must be non-negative`);
  return result;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return Object.freeze([...value]);
}
