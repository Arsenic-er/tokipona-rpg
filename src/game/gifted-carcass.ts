import { createWildlifeLifeRecord, type SessionWildlifeLifeRecord } from "./life-corpse-ledger";
import { createStableWildlifeLifeId } from "./wildlife-state-machine";

export const GIFTED_RABBIT_ENTITY_ID = "wildlife.rabbit.gifted_carcass" as const;
export const GIFTED_RABBIT_HARVEST_PROFILE_ID = "harvest.rabbit.v0.1" as const;
export const GIFTED_RABBIT_DEATH_CAUSE_CLASS = "clean_tool" as const;
export const GIFTED_RABBIT_RECEIPT_HASH = "gifted-carcass:rabbit:adult:clean-tool:no-reward:v0.1" as const;

/** Machine-stable life envelope shared by the N02 coordinator and WAL integration. */
export const createGiftedRabbitLife = (input: Readonly<{
  playerSaveId: string;
  regionId: string;
  worldTick: number;
}>): SessionWildlifeLifeRecord => createWildlifeLifeRecord({
  lifeInstanceId: createStableWildlifeLifeId({ regionSaveId: input.playerSaveId, entityId: GIFTED_RABBIT_ENTITY_ID,
    spawnGeneration: 0, spawnSequence: 0 }),
  regionSaveId: input.playerSaveId,
  regionId: input.regionId,
  entityId: GIFTED_RABBIT_ENTITY_ID,
  species: "rabbit",
  ageClass: "adult",
  spawnGeneration: 0,
  spawnSequence: 0,
  harvestProfileId: GIFTED_RABBIT_HARVEST_PROFILE_ID,
  maxHp: 8,
  registeredAtWorldTick: input.worldTick,
});
