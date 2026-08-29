import { sha256Canonical, type JsonValue } from "../canonical-json";
export type RuntimeFreshnessState = "fresh" | "aging" | "spoiled" | "decomposed" | "raw" | "slipping" | "rotten" | "cured" | "stable";
export type RuntimeMatterOrigin = "natural" | "manifested" | "mixed" | "legacy_unknown";

export interface RuntimeWildlifeItem {
  readonly itemId: string;
  readonly category: string;
  readonly preservationProfileId: string | null;
}

export interface RuntimeHarvestSlot {
  readonly tissueSlotId: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface RuntimeHarvestProfile {
  readonly profileId: string;
  readonly species: string;
  readonly adultFullYield: readonly RuntimeHarvestSlot[];
}

export interface RuntimeDamageQuality {
  readonly meatYieldMultiplier: number;
  readonly hideQualityMultiplier: number;
}

export interface RuntimeDecayProfile {
  readonly profileId: string;
  readonly stable: boolean;
  readonly thresholdsSeconds: readonly { readonly state: RuntimeFreshnessState; readonly untilSeconds: number | null }[];
}

export interface RuntimeProcessingInput {
  readonly itemId: string | null;
  readonly category: string | null;
  readonly quantity: number;
}

export interface RuntimeProcessingOutput {
  readonly itemId: string;
  readonly quantity: number;
}

export interface RuntimeProcessingRecipe {
  readonly recipeId: string;
  readonly recipeVersion: string;
  readonly inputs: readonly RuntimeProcessingInput[];
  readonly outputs: readonly RuntimeProcessingOutput[];
  readonly rejectInputStates: readonly RuntimeFreshnessState[];
  readonly requiredDistinctEligibleEvents: number;
  readonly eligibleEventFilter: readonly string[];
  readonly interactionWorkUnits: number;
  readonly stationStorageProfile: string;
  readonly manifestedHeatAllowedAsEnergyOnly: boolean;
  readonly stationOrToolAny: readonly string[];
  readonly energyRequirement: Readonly<{ readonly kind: string; readonly eu: number }> | null;
  readonly completionRule: string;
  readonly outputFreshnessFormula: string | null;
  readonly outputQualityFormula: string;
  readonly genericProcessOutputPathForbidden: boolean;
  readonly transactionKind: string;
}

export interface RuntimeProcessingStationBinding {
  readonly stationId: string;
  readonly sceneId: string;
  readonly targetId: string;
  readonly interactionId: string;
  readonly interactionPointPx: Readonly<{ readonly x: number; readonly y: number }>;
  readonly energyProvision: Readonly<{ readonly kind: string; readonly euPerWork: number; readonly source: string }> | null;
}

export interface RuntimeWildlifeProcessingManifest {
  readonly sourcePath: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly contractRevision: string;
  readonly economyId: "valley_wildlife_products";
  readonly clockId: "active_world_simulation_tick";
  readonly workUnitActiveSeconds: number;
  readonly juvenileHarvestOutputs: 0;
  readonly items: Readonly<Record<string, RuntimeWildlifeItem>>;
  readonly harvestProfiles: Readonly<Record<string, RuntimeHarvestProfile>>;
  readonly damageQuality: Readonly<Record<string, RuntimeDamageQuality>>;
  readonly decayProfiles: Readonly<Record<string, RuntimeDecayProfile>>;
  readonly processingRecipes: Readonly<Record<string, RuntimeProcessingRecipe>>;
  readonly stationBindings: Readonly<Record<string, RuntimeProcessingStationBinding>>;
  readonly wal: {
    readonly sourcePath: string;
    readonly sourceDigest: `sha256:${string}`;
    readonly coordinatorId: "cross_save_wal.v0.1";
    readonly transactionIdFormula: "sha256(coordinator_id, transaction_kind, canonical_idempotency_key)";
    readonly outputIdFormula: "sha256(transaction_id, output_kind, output_index)";
    readonly receiptIdFormula: "sha256(transaction_id, receipt_kind)";
    readonly registeredKinds: readonly string[];
    readonly registeredTransactions: Readonly<Record<string, Readonly<{ readonly kind: string; readonly participants: readonly string[] }>>>;
  };
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
};
const integer = (value: unknown, label: string, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return value;
};
const finite = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be in [0,1]`);
  return value;
};
const stringArray = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) throw new Error(`${label} must be a string array`);
  if (new Set(value).size !== value.length) throw new Error(`${label} must be unique`);
  return Object.freeze([...value]);
};
const sha = (value: unknown, label: string): `sha256:${string}` => {
  const digest = string(value, label);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error(`${label} must be sha256`);
  return digest as `sha256:${string}`;
};

const readItems = (value: unknown): Readonly<Record<string, RuntimeWildlifeItem>> => {
  const raw = record(value, "wildlifeProcessing.items");
  const items = Object.fromEntries(Object.entries(raw).map(([id, candidate]) => {
    const item = record(candidate, `items.${id}`);
    if (string(item.itemId, `items.${id}.itemId`) !== id) throw new Error(`items.${id} identity mismatch`);
    return [id, Object.freeze({
      itemId: id,
      category: string(item.category, `items.${id}.category`),
      preservationProfileId: item.preservationProfileId === null ? null : string(item.preservationProfileId, `items.${id}.preservationProfileId`),
    })];
  }));
  return Object.freeze(items);
};

const readHarvestProfiles = (value: unknown, items: Readonly<Record<string, RuntimeWildlifeItem>>): Readonly<Record<string, RuntimeHarvestProfile>> => {
  const raw = record(value, "wildlifeProcessing.harvestProfiles");
  return Object.freeze(Object.fromEntries(Object.entries(raw).map(([id, candidate]) => {
    const profile = record(candidate, `harvestProfiles.${id}`);
    if (profile.profileId !== id || !Array.isArray(profile.adultFullYield)) throw new Error(`harvestProfiles.${id} is invalid`);
    const slots = profile.adultFullYield.map((slotValue, index) => {
      const slot = record(slotValue, `harvestProfiles.${id}.adultFullYield[${index}]`);
      const itemId = string(slot.itemId, "harvest itemId");
      if (!items[itemId]) throw new Error(`harvestProfiles.${id} references unknown item ${itemId}`);
      return Object.freeze({ tissueSlotId: string(slot.tissueSlotId, "tissueSlotId"), itemId, quantity: integer(slot.quantity, "quantity", 1) });
    });
    if (new Set(slots.map((slot) => slot.tissueSlotId)).size !== slots.length) throw new Error(`harvestProfiles.${id} slot IDs must be unique`);
    return [id, Object.freeze({ profileId: id, species: string(profile.species, "species"), adultFullYield: Object.freeze(slots) })];
  })));
};

const readRecipes = (value: unknown, items: Readonly<Record<string, RuntimeWildlifeItem>>): Readonly<Record<string, RuntimeProcessingRecipe>> => {
  const raw = record(value, "wildlifeProcessing.processingRecipes");
  return Object.freeze(Object.fromEntries(Object.entries(raw).map(([id, candidate]) => {
    const recipe = record(candidate, `processingRecipes.${id}`);
    if (recipe.recipeId !== id || !Array.isArray(recipe.inputs) || !Array.isArray(recipe.outputs)) throw new Error(`processingRecipes.${id} is invalid`);
    const inputs = recipe.inputs.map((inputValue, index) => {
      const input = record(inputValue, `${id}.inputs[${index}]`);
      const itemId = input.itemId === null ? null : string(input.itemId, "input.itemId");
      const category = input.category === null ? null : string(input.category, "input.category");
      if ((itemId === null) === (category === null) || (itemId !== null && !items[itemId])) throw new Error(`${id}.inputs[${index}] selector is invalid`);
      return Object.freeze({ itemId, category, quantity: integer(input.quantity, "input.quantity", 1) });
    });
    const outputs = recipe.outputs.map((outputValue, index) => {
      const output = record(outputValue, `${id}.outputs[${index}]`);
      const itemId = string(output.itemId, "output.itemId");
      if (!items[itemId]) throw new Error(`${id}.outputs[${index}] references unknown item`);
      return Object.freeze({ itemId, quantity: integer(output.quantity, "output.quantity", 1) });
    });
    return [id, Object.freeze({
      recipeId: id,
      recipeVersion: string(recipe.recipeVersion, `${id}.recipeVersion`),
      inputs: Object.freeze(inputs), outputs: Object.freeze(outputs),
      rejectInputStates: stringArray(recipe.rejectInputStates, `${id}.rejectInputStates`) as readonly RuntimeFreshnessState[],
      requiredDistinctEligibleEvents: integer(recipe.requiredDistinctEligibleEvents, `${id}.requiredDistinctEligibleEvents`),
      eligibleEventFilter: stringArray(recipe.eligibleEventFilter, `${id}.eligibleEventFilter`),
      interactionWorkUnits: integer(recipe.interactionWorkUnits, `${id}.interactionWorkUnits`, 1),
      stationStorageProfile: string(recipe.stationStorageProfile, `${id}.stationStorageProfile`),
      manifestedHeatAllowedAsEnergyOnly: recipe.manifestedHeatAllowedAsEnergyOnly === true,
      stationOrToolAny: stringArray(recipe.stationOrToolAny, `${id}.stationOrToolAny`),
      energyRequirement: recipe.energyRequirement === null ? null : (() => { const energy = record(recipe.energyRequirement, `${id}.energyRequirement`); return Object.freeze({ kind: string(energy.kind, `${id}.energy.kind`), eu: integer(energy.eu, `${id}.energy.eu`, 1) }); })(),
      completionRule: string(recipe.completionRule, `${id}.completionRule`),
      outputFreshnessFormula: recipe.outputFreshnessFormula === null ? null : string(recipe.outputFreshnessFormula, `${id}.outputFreshnessFormula`),
      outputQualityFormula: string(recipe.outputQualityFormula, `${id}.outputQualityFormula`),
      genericProcessOutputPathForbidden: recipe.genericProcessOutputPathForbidden === true,
      transactionKind: string(recipe.transactionKind, `${id}.transactionKind`),
    })];
  })));
};

const WILDLIFE_PROVENANCE_CATEGORIES = new Set(["raw_meat", "cooked_meat", "preserved_meat", "raw_hide", "leather"]);
export const requiresWildlifeProvenance = (manifest: RuntimeWildlifeProcessingManifest, itemId: string): boolean => {
  const item = manifest.items[itemId];
  return item !== undefined && WILDLIFE_PROVENANCE_CATEGORIES.has(item.category);
};

export const computeRuntimeWildlifeProcessingDigest = (payload: unknown): `sha256:${string}` => {
  const raw = record(payload, "wildlife processing digest payload");
  return sha256Canonical(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest")) as JsonValue) as `sha256:${string}`;
};

export function readRuntimeWildlifeProcessingManifest(candidate: unknown): RuntimeWildlifeProcessingManifest {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.wildlifeProcessing, "artifact.wildlifeProcessing");
  const items = readItems(raw.items);
  const harvestProfiles = readHarvestProfiles(raw.harvestProfiles, items);
  const damageRaw = record(raw.damageQuality, "damageQuality");
  const damageQuality = Object.freeze(Object.fromEntries(Object.entries(damageRaw).map(([id, candidate]) => {
    const entry = record(candidate, `damageQuality.${id}`);
    return [id, Object.freeze({ meatYieldMultiplier: finite(entry.meatYieldMultiplier, "meatYieldMultiplier"), hideQualityMultiplier: finite(entry.hideQualityMultiplier, "hideQualityMultiplier") })];
  })));
  const decayRaw = record(raw.decayProfiles, "decayProfiles");
  const freshnessStates = new Set<RuntimeFreshnessState>(["fresh", "aging", "spoiled", "decomposed", "raw", "slipping", "rotten", "cured", "stable"]);
  const decayProfiles = Object.freeze(Object.fromEntries(Object.entries(decayRaw).map(([id, candidate]) => {
    const entry = record(candidate, `decayProfiles.${id}`);
    if (!Array.isArray(entry.thresholdsSeconds)) throw new Error(`decayProfiles.${id}.thresholdsSeconds must be an array`);
    const thresholds = entry.thresholdsSeconds.map((thresholdValue) => {
      const threshold = record(thresholdValue, `decayProfiles.${id}.threshold`);
      const state = string(threshold.state, "threshold.state") as RuntimeFreshnessState;
      if (!freshnessStates.has(state)) throw new Error(`decayProfiles.${id} has unknown freshness state ${state}`);
      return Object.freeze({ state, untilSeconds: threshold.untilSeconds === null ? null : integer(threshold.untilSeconds, "threshold.untilSeconds", 1) });
    });
    const terminals = thresholds.filter((threshold) => threshold.untilSeconds === null);
    const finiteThresholds = thresholds.filter((threshold) => threshold.untilSeconds !== null);
    if (entry.stable === true) {
      if (thresholds.length !== 1 || thresholds[0]?.state !== "stable" || thresholds[0].untilSeconds !== null) throw new Error(`decayProfiles.${id} stable invariant invalid`);
    } else if (terminals.length !== 1 || thresholds.at(-1)?.untilSeconds !== null ||
        finiteThresholds.some((threshold, index) => index > 0 && threshold.untilSeconds! <= finiteThresholds[index - 1]!.untilSeconds!)) {
      throw new Error(`decayProfiles.${id} thresholds must strictly increase and end in one terminal state`);
    }
    return [id, Object.freeze({ profileId: id, stable: entry.stable === true, thresholdsSeconds: Object.freeze(thresholds) })];
  })));
  const wal = record(raw.wal, "wildlifeProcessing.wal");
  const manifest: RuntimeWildlifeProcessingManifest = {
    sourcePath: string(raw.sourcePath, "sourcePath"), sourceDigest: sha(raw.sourceDigest, "sourceDigest"),
    contractRevision: string(raw.contractRevision, "contractRevision"),
    economyId: raw.economyId === "valley_wildlife_products" ? raw.economyId : (() => { throw new Error("economyId invalid"); })(),
    clockId: raw.clockId === "active_world_simulation_tick" ? raw.clockId : (() => { throw new Error("clockId invalid"); })(),
    workUnitActiveSeconds: integer(raw.workUnitActiveSeconds, "workUnitActiveSeconds", 1),
    juvenileHarvestOutputs: raw.juvenileHarvestOutputs === 0 ? 0 : (() => { throw new Error("juvenile harvest must be zero"); })(),
    items, harvestProfiles, damageQuality, decayProfiles,
    processingRecipes: readRecipes(raw.processingRecipes, items),
    stationBindings: Object.freeze(Object.fromEntries(Object.entries(record(raw.stationBindings, "stationBindings")).map(([stationId, candidate]) => {
      const binding = record(candidate, `stationBindings.${stationId}`);
      if (binding.stationId !== stationId) throw new Error(`station binding ${stationId} identity mismatch`);
      const point = record(binding.interactionPointPx, `${stationId}.interactionPointPx`);
      const energy = binding.energyProvision === null ? null : (() => { const value = record(binding.energyProvision, `${stationId}.energyProvision`); return Object.freeze({
        kind: string(value.kind, `${stationId}.energy.kind`), euPerWork: integer(value.euPerWork, `${stationId}.energy.euPerWork`, 1),
        source: string(value.source, `${stationId}.energy.source`),
      }); })();
      return [stationId, Object.freeze({ stationId, sceneId: string(binding.sceneId, "binding.sceneId"),
        targetId: string(binding.targetId, "binding.targetId"), interactionId: string(binding.interactionId, "binding.interactionId"),
        interactionPointPx: Object.freeze({ x: integer(point.x, `${stationId}.point.x`), y: integer(point.y, `${stationId}.point.y`) }), energyProvision: energy })];
    }))),
    wal: Object.freeze({
      sourcePath: string(wal.sourcePath, "wal.sourcePath"), sourceDigest: sha(wal.sourceDigest, "wal.sourceDigest"),
      coordinatorId: wal.coordinatorId === "cross_save_wal.v0.1" ? wal.coordinatorId : (() => { throw new Error("WAL coordinator invalid"); })(),
      transactionIdFormula: wal.transactionIdFormula === "sha256(coordinator_id, transaction_kind, canonical_idempotency_key)" ? wal.transactionIdFormula : (() => { throw new Error("WAL transaction formula invalid"); })(),
      outputIdFormula: wal.outputIdFormula === "sha256(transaction_id, output_kind, output_index)" ? wal.outputIdFormula : (() => { throw new Error("WAL output formula invalid"); })(),
      receiptIdFormula: wal.receiptIdFormula === "sha256(transaction_id, receipt_kind)" ? wal.receiptIdFormula : (() => { throw new Error("WAL receipt formula invalid"); })(),
      registeredKinds: stringArray(wal.registeredKinds, "wal.registeredKinds"),
      registeredTransactions: Object.freeze(Object.fromEntries(Object.entries(record(wal.registeredTransactions, "wal.registeredTransactions")).map(([kind, candidate]) => {
        const transaction = record(candidate, `wal.registeredTransactions.${kind}`);
        if (transaction.kind !== kind) throw new Error(`WAL transaction ${kind} identity mismatch`);
        return [kind, Object.freeze({ kind, participants: stringArray(transaction.participants, `${kind}.participants`) })];
      }))),
    }),
  };
  for (const required of ["harvest", "workorder_start", "workorder_work", "workorder_complete", "workorder_claim", "workorder_cancel"]) {
    if (!manifest.wal.registeredKinds.includes(required) || !manifest.wal.registeredTransactions[required]) throw new Error(`WAL kind ${required} is not registered`);
  }
  const transactionKeys = Object.keys(manifest.wal.registeredTransactions).sort();
  if (JSON.stringify(transactionKeys) !== JSON.stringify([...manifest.wal.registeredKinds].sort())) throw new Error("WAL kind/participant projection mismatch");
  const recipeStations = new Set(Object.values(manifest.processingRecipes).flatMap((recipe) => recipe.stationOrToolAny));
  const bindingKeys = Object.keys(manifest.stationBindings);
  if (recipeStations.size !== bindingKeys.length || bindingKeys.some((stationId) => !recipeStations.has(stationId))) {
    throw new Error("processing recipe stations must exactly match station bindings");
  }
  if (computeRuntimeWildlifeProcessingDigest(raw) !== manifest.sourceDigest) throw new Error("wildlife processing source digest mismatch");
  return Object.freeze(manifest);
}
