import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";

export interface RuntimeConsumptionProfile {
  readonly consumableId: string;
  readonly hydrationDelta: number;
  readonly satietyDelta: number;
  readonly requirements: readonly string[];
}

export interface RuntimeSurvivalConsumptionManifest {
  readonly sourcePath: "data/player/survival-needs.v0.1.yaml";
  readonly sourceDigest: `sha256:${string}`;
  readonly profileId: string;
  readonly eventId: "survival_consumption_committed";
  readonly transactionKind: "consume";
  readonly idempotencyKeyFields: readonly ["player_save_id", "consumable_source_id", "consumption_sequence"];
  readonly wildlifeInventoryConsumableIds: readonly string[];
  readonly profiles: Readonly<Record<string, RuntimeConsumptionProfile>>;
  readonly categoryRejections: Readonly<Record<string, Readonly<{ category: string; rejectionCode: string }>>>;
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const id = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
};
const delta = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative`);
  return value;
};
const ids = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0) ||
      new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`);
  return Object.freeze([...value]);
};

export const computeRuntimeSurvivalConsumptionDigest = (candidate: unknown): `sha256:${string}` => {
  const raw = record(candidate, "survivalConsumption");
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  return sha256Canonical(body as JsonValue) as `sha256:${string}`;
};

export const readRuntimeSurvivalConsumptionManifest = (candidate: unknown): RuntimeSurvivalConsumptionManifest => {
  const root = record(candidate, "runtime artifact");
  const raw = record(root.survivalConsumption, "survivalConsumption");
  if (raw.sourcePath !== "data/player/survival-needs.v0.1.yaml" || raw.eventId !== "survival_consumption_committed" ||
      raw.transactionKind !== "consume") throw new Error("survival consumption identity mismatch");
  const keyFields = ids(raw.idempotencyKeyFields, "idempotencyKeyFields");
  if (JSON.stringify(keyFields) !== JSON.stringify(["player_save_id", "consumable_source_id", "consumption_sequence"])) {
    throw new Error("survival consumption idempotency fields mismatch");
  }
  const profiles = Object.freeze(Object.fromEntries(Object.entries(record(raw.profiles, "profiles")).map(([consumableId, value]) => {
    const profile = record(value, `profiles.${consumableId}`);
    if (profile.consumableId !== consumableId) throw new Error(`consumption profile ${consumableId} identity mismatch`);
    return [consumableId, Object.freeze({
      consumableId,
      hydrationDelta: delta(profile.hydrationDelta, `${consumableId}.hydrationDelta`),
      satietyDelta: delta(profile.satietyDelta, `${consumableId}.satietyDelta`),
      requirements: ids(profile.requirements, `${consumableId}.requirements`),
    })];
  })));
  const categoryRejections = Object.freeze(Object.fromEntries(Object.entries(record(raw.categoryRejections, "categoryRejections")).map(([category, value]) => {
    const rejection = record(value, `categoryRejections.${category}`);
    if (rejection.category !== category) throw new Error(`category rejection ${category} identity mismatch`);
    return [category, Object.freeze({ category, rejectionCode: id(rejection.rejectionCode, `${category}.rejectionCode`) })];
  })));
  const manifest: RuntimeSurvivalConsumptionManifest = Object.freeze({
    sourcePath: raw.sourcePath,
    sourceDigest: id(raw.sourceDigest, "sourceDigest") as `sha256:${string}`,
    profileId: id(raw.profileId, "profileId"),
    eventId: raw.eventId,
    transactionKind: raw.transactionKind,
    idempotencyKeyFields: keyFields as RuntimeSurvivalConsumptionManifest["idempotencyKeyFields"],
    wildlifeInventoryConsumableIds: ids(raw.wildlifeInventoryConsumableIds, "wildlifeInventoryConsumableIds"),
    profiles,
    categoryRejections,
  });
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.sourceDigest) ||
      computeRuntimeSurvivalConsumptionDigest(raw) !== manifest.sourceDigest) throw new Error("survival consumption digest mismatch");
  const cooked = profiles["food.cooked_game_meat"];
  if (JSON.stringify(manifest.wildlifeInventoryConsumableIds) !== JSON.stringify(["food.cooked_game_meat"])) {
    throw new Error("chapter-01 wildlife consumable allowlist mismatch");
  }
  if (!cooked || cooked.satietyDelta !== 35 || cooked.hydrationDelta !== 0 ||
      JSON.stringify(cooked.requirements) !== JSON.stringify(["cooked", "not_spoiled"]) ||
      categoryRejections.raw_meat?.rejectionCode !== "cook_before_eating") {
    throw new Error("chapter-01 cooked game meat consumption contract mismatch");
  }
  return manifest;
};
