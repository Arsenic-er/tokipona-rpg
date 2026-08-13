import { describe, expect, it } from "vitest";
import {
  LIFE_CORPSE_LEDGER_SCHEMA,
  WILDLIFE_ECONOMY_ID,
  createDeterministicCorpseId,
  createDeterministicDeathEventId,
  createEmptyLifeCorpseLedger,
  createWildlifeLifeRecord,
  isSessionLifeCorpseLedger,
  tissueSlotsForLife,
} from "./life-corpse-ledger";

describe("life/corpse ledger domain", () => {
  it("derives canonical SHA-256 identities and validates an empty ledger", () => {
    const lifeId = "wildlife-life:test-rabbit";
    const first = createDeterministicCorpseId(WILDLIFE_ECONOMY_ID, lifeId);
    expect(first).toMatch(/^corpse:sha256:[0-9a-f]{64}$/);
    expect(createDeterministicCorpseId(WILDLIFE_ECONOMY_ID, lifeId)).toBe(first);
    expect(createDeterministicCorpseId(WILDLIFE_ECONOMY_ID, lifeId + ".other")).not.toBe(first);
    expect(createDeterministicDeathEventId("region-save.valley", lifeId))
      .toMatch(/^wildlife-death:sha256:[0-9a-f]{64}$/);
    expect(createEmptyLifeCorpseLedger()).toEqual({
      schema: LIFE_CORPSE_LEDGER_SCHEMA,
      revision: 0,
      lives: {},
      corpses: {},
      corpseIdByLifeId: {},
    });
    expect(isSessionLifeCorpseLedger(createEmptyLifeCorpseLedger())).toBe(true);
  });

  it("defines only canonical adult rabbit/fox slots and zero juvenile slots", () => {
    expect(tissueSlotsForLife("rabbit", "adult")).toMatchObject([
      { tissueSlotId: "meat", originalQuantity: 2, remainingQuantity: 2 },
      { tissueSlotId: "hide", originalQuantity: 1, remainingQuantity: 1 },
    ]);
    expect(tissueSlotsForLife("fox", "adult")).toMatchObject([
      { tissueSlotId: "meat", originalQuantity: 1, remainingQuantity: 1 },
      { tissueSlotId: "hide", originalQuantity: 1, remainingQuantity: 1 },
    ]);
    expect(tissueSlotsForLife("rabbit", "juvenile")).toEqual([]);
  });

  it("creates a validated initial life without smuggling death state", () => {
    const life = createWildlifeLifeRecord({
      lifeInstanceId: "life.rabbit.1",
      regionSaveId: "region-save.valley",
      regionId: "valley_prologue",
      entityId: "wildlife.rabbit.valley",
      species: "rabbit",
      ageClass: "adult",
      spawnGeneration: 0,
      spawnSequence: 1,
      harvestProfileId: "harvest.rabbit.v0.1",
      maxHp: 8,
      registeredAtWorldTick: 12,
    });
    expect(life).toMatchObject({ state: "alive", currentHp: 8, lifeRevision: 0, corpseId: null });
  });
});
