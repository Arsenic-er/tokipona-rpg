export const LIFE_CORPSE_LEDGER_SCHEMA = "tokipona.life-corpse-ledger.v0.1" as const;
export const WILDLIFE_ECONOMY_ID = "valley_wildlife_products" as const;

export type WildlifeAgeClass = "adult" | "juvenile";
export type WildlifeLedgerLifeState = "alive" | "dead";
export type CorpseDecayState = "fresh" | "aging" | "spoiled" | "decomposed";
export type WildlifeDamageCauseClass = "clean_tool" | "no_tool" | "fire_or_explosion" | "crushing_impact" | "other_physical";

export interface WildlifeWorldPosition {
  readonly sceneId: string;
  readonly x: number;
  readonly y: number;
}

export interface CorpseTissueSlot {
  readonly tissueSlotId: string;
  readonly itemId: string;
  readonly originalQuantity: number;
  readonly remainingQuantity: number;
  readonly revision: number;
}

export interface SessionWildlifeLifeRecord {
  readonly lifeInstanceId: string;
  readonly regionSaveId: string;
  readonly regionId: string;
  readonly entityId: string;
  readonly species: string;
  readonly ageClass: WildlifeAgeClass;
  readonly spawnGeneration: number;
  readonly spawnSequence: number;
  readonly harvestProfileId: string;
  readonly state: WildlifeLedgerLifeState;
  readonly maxHp: number;
  readonly currentHp: number;
  readonly lifeRevision: number;
  readonly registeredAtWorldTick: number;
  readonly deathTransactionId: string | null;
  readonly deathEventId: string | null;
  readonly corpseId: string | null;
}

export interface SessionWildlifeCorpseRecord {
  readonly corpseId: string;
  readonly lifeInstanceId: string;
  readonly regionId: string;
  readonly entityId: string;
  readonly species: string;
  readonly ageClass: WildlifeAgeClass;
  readonly harvestProfileId: string;
  readonly deathEventId: string;
  readonly deathTick: number;
  readonly causeClass: string;
  readonly position: WildlifeWorldPosition;
  readonly decayState: CorpseDecayState;
  readonly contaminationMu: number;
  readonly lastDecayEvalTick: number;
  readonly tissueSlots: readonly CorpseTissueSlot[];
  /** Audited ecology delta; application to a future population ledger is deliberately deferred. */
  readonly populationDelta: WildlifePopulationDeltaRecord;
  readonly revision: number;
}

export interface SessionLifeCorpseLedger {
  readonly schema: typeof LIFE_CORPSE_LEDGER_SCHEMA;
  readonly revision: number;
  readonly lives: Readonly<Record<string, SessionWildlifeLifeRecord>>;
  readonly corpses: Readonly<Record<string, SessionWildlifeCorpseRecord>>;
  readonly corpseIdByLifeId: Readonly<Record<string, string>>;
}

export interface WildlifeRewardDelta {
  readonly kills: 0;
  readonly drops: 0;
  readonly languageXp: 0;
  readonly learningEvidence: 0;
  readonly expressionCapacityGrowth: 0;
  readonly focusSlotGrowth: 0;
  readonly maxMpGrowth: 0;
  readonly currency: 0;
  readonly questKeys: 0;
}

export const ZERO_WILDLIFE_REWARD_DELTA: WildlifeRewardDelta = Object.freeze({
  kills: 0,
  drops: 0,
  languageXp: 0,
  learningEvidence: 0,
  expressionCapacityGrowth: 0,
  focusSlotGrowth: 0,
  maxMpGrowth: 0,
  currency: 0,
  questKeys: 0,
});

export interface WildlifePopulationDeltaRecord {
  readonly species: string;
  readonly adultLivingDelta: 0 | -1;
  readonly cause: "wildlife_death";
}

export interface WildlifeLifeRegistrationPayload {
  readonly life: SessionWildlifeLifeRecord;
}

export interface WildlifeDamageRequest {
  readonly transactionId: string;
  readonly lifeInstanceId: string;
  readonly expectedLifeRevision: number;
  readonly damage: number;
  readonly causeClass: WildlifeDamageCauseClass;
  readonly worldTick: number;
  readonly position: WildlifeWorldPosition;
}

export interface WildlifeDamageCommitPayload {
  readonly transactionId: string;
  readonly lifeInstanceId: string;
  readonly expectedLifeRevision: number;
  readonly damage: number;
  readonly causeClass: string;
  readonly worldTick: number;
  readonly position: WildlifeWorldPosition;
  readonly rewardDelta: WildlifeRewardDelta;
}

export interface WildlifeDeathCommitPayload extends WildlifeDamageCommitPayload {
  readonly economyId: typeof WILDLIFE_ECONOMY_ID;
  readonly deathEventId: string;
  readonly corpseId: string;
  readonly tissueSlots: readonly CorpseTissueSlot[];
  readonly populationDelta: WildlifePopulationDeltaRecord;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const counter = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const sha256 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const k = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const w = new Uint32Array(64);
  const rotr = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const a = w[index - 15]!;
      const b = w[index - 2]!;
      w[index] = ((rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[index - 16]! +
        (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) + w[index - 7]!) >>> 0;
    }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let index = 0; index < 64; index += 1) {
      const t1 = (hh! + (rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + k[index]! + w[index]!) >>> 0;
      const t2 = ((rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      hh = g; g = f; f = e; e = (d! + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const values = [a,b,c,d,e,f,g,hh];
    for (let index = 0; index < 8; index += 1) h[index] = (h[index]! + values[index]!) >>> 0;
  }
  return [...h].map((value) => value.toString(16).padStart(8, "0")).join("");
};

const canonicalPair = (left: string, right: string): string => JSON.stringify([left, right]);

export const createDeterministicCorpseId = (economyId: string, lifeInstanceId: string): string => {
  if (!nonEmpty(economyId) || !nonEmpty(lifeInstanceId)) throw new Error("economyId and lifeInstanceId are required");
  return `corpse:sha256:${sha256(canonicalPair(economyId, lifeInstanceId))}`;
};

export const createDeterministicDeathEventId = (regionSaveId: string, lifeInstanceId: string): string => {
  if (!nonEmpty(regionSaveId) || !nonEmpty(lifeInstanceId)) throw new Error("regionSaveId and lifeInstanceId are required");
  return `wildlife-death:sha256:${sha256(JSON.stringify([regionSaveId, lifeInstanceId, "life_state_dead"]))}`;
};

export const createEmptyLifeCorpseLedger = (): SessionLifeCorpseLedger => ({
  schema: LIFE_CORPSE_LEDGER_SCHEMA,
  revision: 0,
  lives: {},
  corpses: {},
  corpseIdByLifeId: {},
});

export const createWildlifeLifeRecord = (input: Readonly<{
  lifeInstanceId: string;
  regionSaveId: string;
  regionId: string;
  entityId: string;
  species: string;
  ageClass: WildlifeAgeClass;
  spawnGeneration: number;
  spawnSequence: number;
  harvestProfileId: string;
  maxHp: number;
  registeredAtWorldTick: number;
}>): SessionWildlifeLifeRecord => ({
  ...input,
  state: "alive",
  currentHp: input.maxHp,
  lifeRevision: 0,
  deathTransactionId: null,
  deathEventId: null,
  corpseId: null,
});

export const tissueSlotsForLife = (
  species: string,
  ageClass: WildlifeAgeClass,
): readonly CorpseTissueSlot[] => {
  if (ageClass === "juvenile") return Object.freeze([]);
  const source = species === "rabbit"
    ? [["meat", "food.raw_small_game_meat", 2], ["hide", "material.raw_small_hide", 1]] as const
    : species === "fox"
      ? [["meat", "food.raw_predator_meat", 1], ["hide", "material.raw_medium_pelt", 1]] as const
      : [];
  return Object.freeze(source.map(([tissueSlotId, itemId, quantity]) => Object.freeze({
    tissueSlotId,
    itemId,
    originalQuantity: quantity,
    remainingQuantity: quantity,
    revision: 0,
  })));
};

export const isWildlifeRewardDeltaZero = (value: unknown): value is WildlifeRewardDelta =>
  isRecord(value) && ["kills", "drops", "languageXp", "learningEvidence", "expressionCapacityGrowth",
    "focusSlotGrowth", "maxMpGrowth", "currency", "questKeys"].every((key) => value[key] === 0);

export const isWildlifeWorldPosition = (value: unknown): value is WildlifeWorldPosition =>
  isRecord(value) && nonEmpty(value.sceneId) && typeof value.x === "number" && Number.isFinite(value.x) &&
  typeof value.y === "number" && Number.isFinite(value.y);

export const isCorpseTissueSlot = (value: unknown): value is CorpseTissueSlot =>
  isRecord(value) && nonEmpty(value.tissueSlotId) && nonEmpty(value.itemId) &&
  counter(value.originalQuantity) && counter(value.remainingQuantity) &&
  value.remainingQuantity <= value.originalQuantity && counter(value.revision);

export const isSessionWildlifeLifeRecord = (value: unknown): value is SessionWildlifeLifeRecord => {
  if (!isRecord(value) || !nonEmpty(value.lifeInstanceId) || !nonEmpty(value.regionSaveId) ||
      !nonEmpty(value.regionId) || !nonEmpty(value.entityId) || !nonEmpty(value.species) ||
      (value.ageClass !== "adult" && value.ageClass !== "juvenile") || !counter(value.spawnGeneration) ||
      !counter(value.spawnSequence) || !nonEmpty(value.harvestProfileId) || !positive(value.maxHp) ||
      !finiteNonNegative(value.currentHp) || Object.is(value.currentHp, -0) || value.currentHp > value.maxHp || !counter(value.lifeRevision) ||
      !counter(value.registeredAtWorldTick)) return false;
  if (value.state === "alive") {
    return value.currentHp > 0 && value.deathTransactionId === null && value.deathEventId === null && value.corpseId === null;
  }
  return value.state === "dead" && value.currentHp === 0 && nonEmpty(value.deathTransactionId) &&
    nonEmpty(value.deathEventId) && nonEmpty(value.corpseId);
};

export const isSessionWildlifeCorpseRecord = (value: unknown): value is SessionWildlifeCorpseRecord => {
  if (!isRecord(value) || !nonEmpty(value.corpseId) || !nonEmpty(value.lifeInstanceId) ||
      !nonEmpty(value.regionId) || !nonEmpty(value.entityId) || !nonEmpty(value.species) ||
      (value.ageClass !== "adult" && value.ageClass !== "juvenile") || !nonEmpty(value.harvestProfileId) ||
      !nonEmpty(value.deathEventId) || !counter(value.deathTick) || !nonEmpty(value.causeClass) ||
      !isWildlifeWorldPosition(value.position) || !["fresh", "aging", "spoiled", "decomposed"].includes(String(value.decayState)) ||
      !finiteNonNegative(value.contaminationMu) || !counter(value.lastDecayEvalTick) || !Array.isArray(value.tissueSlots) ||
      !value.tissueSlots.every(isCorpseTissueSlot) || !isRecord(value.populationDelta) ||
      !nonEmpty(value.populationDelta.species) || value.populationDelta.cause !== "wildlife_death" ||
      (value.populationDelta.adultLivingDelta !== 0 && value.populationDelta.adultLivingDelta !== -1) ||
      !counter(value.revision)) return false;
  const slots = value.tissueSlots as readonly CorpseTissueSlot[];
  return new Set(slots.map((slot) => slot.tissueSlotId)).size === slots.length &&
    (value.ageClass !== "juvenile" || slots.length === 0);
};

export const isSessionLifeCorpseLedger = (value: unknown): value is SessionLifeCorpseLedger => {
  if (!isRecord(value) || value.schema !== LIFE_CORPSE_LEDGER_SCHEMA || !counter(value.revision) ||
      !isRecord(value.lives) || !isRecord(value.corpses) || !isRecord(value.corpseIdByLifeId)) return false;
  const lives = value.lives as Record<string, unknown>;
  const corpses = value.corpses as Record<string, unknown>;
  const index = value.corpseIdByLifeId as Record<string, unknown>;
  if (!Object.entries(lives).every(([id, life]) => isSessionWildlifeLifeRecord(life) && life.lifeInstanceId === id) ||
      !Object.entries(corpses).every(([id, corpse]) => isSessionWildlifeCorpseRecord(corpse) && corpse.corpseId === id) ||
      !Object.entries(index).every(([lifeId, corpseId]) => nonEmpty(lifeId) && nonEmpty(corpseId))) return false;
  for (const [lifeId, corpseId] of Object.entries(index)) {
    if (!nonEmpty(corpseId)) return false;
    const life = lives[lifeId];
    const corpse = corpses[corpseId];
    if (!isSessionWildlifeLifeRecord(life) || life.state !== "dead" || life.corpseId !== corpseId ||
        !isSessionWildlifeCorpseRecord(corpse) || corpse.lifeInstanceId !== lifeId ||
        corpse.deathEventId !== life.deathEventId || corpse.regionId !== life.regionId ||
        corpse.entityId !== life.entityId || corpse.species !== life.species || corpse.ageClass !== life.ageClass ||
        corpse.harvestProfileId !== life.harvestProfileId || corpse.populationDelta.species !== life.species ||
        corpse.populationDelta.adultLivingDelta !== (life.ageClass === "adult" ? -1 : 0) ||
        corpseId !== createDeterministicCorpseId(WILDLIFE_ECONOMY_ID, lifeId) ||
        life.deathEventId !== createDeterministicDeathEventId(life.regionSaveId, lifeId)) return false;
  }
  return Object.values(lives).filter((life): life is SessionWildlifeLifeRecord => isSessionWildlifeLifeRecord(life) && life.state === "dead").length === Object.keys(index).length &&
    Object.keys(corpses).length === Object.keys(index).length;
};

export const isWildlifeDamageCommitPayload = (value: unknown): value is WildlifeDamageCommitPayload =>
  isRecord(value) && nonEmpty(value.transactionId) && nonEmpty(value.lifeInstanceId) &&
  counter(value.expectedLifeRevision) && positive(value.damage) &&
  ["clean_tool", "no_tool", "fire_or_explosion", "crushing_impact", "other_physical"].includes(String(value.causeClass)) &&
  counter(value.worldTick) && isWildlifeWorldPosition(value.position) && isWildlifeRewardDeltaZero(value.rewardDelta);

export const isWildlifeDeathCommitPayload = (value: unknown): value is WildlifeDeathCommitPayload => {
  if (!isWildlifeDamageCommitPayload(value)) return false;
  const raw = value as unknown as Record<string, unknown>;
  if (raw.economyId !== WILDLIFE_ECONOMY_ID || !nonEmpty(raw.deathEventId) || !nonEmpty(raw.corpseId) ||
      !Array.isArray(raw.tissueSlots) || !raw.tissueSlots.every(isCorpseTissueSlot) ||
      !isRecord(raw.populationDelta) || !nonEmpty(raw.populationDelta.species) ||
      raw.populationDelta.cause !== "wildlife_death" ||
      (raw.populationDelta.adultLivingDelta !== 0 && raw.populationDelta.adultLivingDelta !== -1)) return false;
  const slots = raw.tissueSlots as readonly CorpseTissueSlot[];
  return new Set(slots.map((slot) => slot.tissueSlotId)).size === slots.length;
};
