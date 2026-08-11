import { describe, expect, it } from "vitest";
import { SURVIVAL_RULES, SurvivalSystem } from "./survival";

const FIELD = { worldAdvances: true, metabolismExempt: false } as const;
const SAFE_ZONE = { worldAdvances: true, metabolismExempt: true } as const;
const PAUSED = { worldAdvances: false, metabolismExempt: true } as const;

describe("SurvivalSystem", () => {
  it("matches the three-hour baseline", () => {
    const survival = new SurvivalSystem();

    const snapshot = survival.advanceActiveMinutes(180, FIELD);

    expect(snapshot.satiety).toBeCloseTo(67, 8);
    expect(snapshot.hydration).toBeCloseTo(60, 8);
    expect(snapshot.worldMinutes).toBe(180);
    expect(snapshot.metabolismMinutes).toBe(180);
  });

  it("advances only the world clock for safe-zone work", () => {
    const survival = new SurvivalSystem();

    const snapshot = survival.advanceActiveMinutes(10, SAFE_ZONE);

    expect(snapshot.worldMinutes).toBe(10);
    expect(snapshot.metabolismMinutes).toBe(0);
    expect(snapshot.satiety).toBe(SURVIVAL_RULES.initialSatiety);
    expect(snapshot.hydration).toBe(SURVIVAL_RULES.initialHydration);
  });

  it("freezes both clocks while paused", () => {
    const survival = new SurvivalSystem();

    const snapshot = survival.advanceActiveMinutes(180, PAUSED);

    expect(snapshot.worldTicks).toBe(0);
    expect(snapshot.metabolismTicks).toBe(0);
  });

  it("applies a consumption transaction exactly once", () => {
    const survival = new SurvivalSystem();
    survival.advanceActiveMinutes(180, FIELD);

    const first = survival.consume("container.field_canteen", "consume.canteen.1");
    const duplicate = survival.consume("container.field_canteen", "consume.canteen.1");

    expect(first.committed).toBe(true);
    expect(first.hydrationDelta).toBe(25);
    expect(first.snapshot.canteenCharges).toBe(2);
    expect(duplicate.committed).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.snapshot.hydration).toBe(first.snapshot.hydration);
    expect(duplicate.snapshot.canteenCharges).toBe(2);
  });

  it("keeps meters at the prologue floor until its idempotent release", () => {
    const survival = new SurvivalSystem();
    survival.advanceActiveMinutes(1_000, FIELD);

    expect(survival.snapshot().satiety).toBe(20);
    expect(survival.snapshot().hydration).toBe(20);

    const first = survival.releasePrologueFloor("chapter.prologue.floor-release.1");
    const duplicate = survival.releasePrologueFloor("chapter.prologue.floor-release.1");
    survival.advanceActiveMinutes(60, FIELD);

    expect(first.committed).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(survival.snapshot().satiety).toBeLessThan(20);
    expect(survival.snapshot().hydration).toBeLessThan(20);
  });

  it("restores first public relief to at least 90 without language or MP state", () => {
    const survival = new SurvivalSystem();
    survival.advanceActiveMinutes(1_000, FIELD);

    const relief = survival.usePublicRelief("relief.settlement.1");

    expect(relief.snapshot.satiety).toBeGreaterThanOrEqual(90);
    expect(relief.snapshot.hydration).toBeGreaterThanOrEqual(90);
    expect(Object.keys(relief.snapshot)).not.toContain("mp");
    expect(Object.keys(relief.snapshot)).not.toContain("languageEvidence");
  });

  it("round-trips fractional clocks and transaction receipts", () => {
    const survival = new SurvivalSystem();
    survival.advanceSeconds(0.25, FIELD);
    survival.consume("food.travel_ration", "consume.ration.1");

    const restored = SurvivalSystem.fromSave(JSON.parse(JSON.stringify(survival.toSave())));
    const duplicate = restored.consume("food.travel_ration", "consume.ration.1");
    restored.advanceSeconds(0.75, FIELD);

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.snapshot.travelRations).toBe(0);
    expect(restored.snapshot().worldTicks).toBe(1);
    expect(restored.snapshot().metabolismTicks).toBe(1);
  });
});
