import { describe, expect, it } from "vitest";
import { SettlementDemoSystem } from "./settlement-demo";

describe("SettlementDemoSystem", () => {
  it("cooks for exactly three safe-zone work minutes without metabolism decay", () => {
    const demo = new SettlementDemoSystem();
    const initial = demo.snapshot().survival;

    demo.startCooking("workorder.cook.1");
    const beforeCompletion = demo.advanceActiveMinutes(2.99);
    const completed = demo.advanceActiveMinutes(0.01);

    expect(beforeCompletion.cookingState).toBe("working");
    expect(completed.cookingState).toBe("completed");
    expect(completed.survival.worldMinutes).toBe(3);
    expect(completed.survival.metabolismMinutes).toBe(0);
    expect(completed.survival.satiety).toBe(initial.satiety);
    expect(completed.survival.hydration).toBe(initial.hydration);
  });

  it("keeps outdoor metabolism on the three-hour baseline", () => {
    const demo = new SettlementDemoSystem();
    demo.setMode("field");

    const snapshot = demo.advanceActiveMinutes(180);

    expect(snapshot.survival.satiety).toBeCloseTo(67, 8);
    expect(snapshot.survival.hydration).toBeCloseTo(60, 8);
  });

  it("claims and sells a cooked lot exactly once", () => {
    const demo = new SettlementDemoSystem();
    demo.startCooking("workorder.cook.1");
    demo.advanceActiveMinutes(3);
    const claim = demo.claimCookedMeat("workorder.claim.1");
    const duplicateClaim = demo.claimCookedMeat("workorder.claim.1");
    const sale = demo.sellCookedMeat("sale.butcher.1");
    const duplicateSale = demo.sellCookedMeat("sale.butcher.1");

    expect(claim.committed).toBe(true);
    expect(duplicateClaim.duplicate).toBe(true);
    expect(sale.snapshot.coins).toBe(2);
    expect(sale.snapshot.cookedMeat).toBe(0);
    expect(duplicateSale.duplicate).toBe(true);
    expect(duplicateSale.snapshot.coins).toBe(2);
  });

  it("round-trips work, inventory, coins and receipts", () => {
    const demo = new SettlementDemoSystem();
    demo.startCooking("workorder.cook.1");
    demo.advanceActiveMinutes(3);
    demo.claimCookedMeat("workorder.claim.1");
    demo.sellCookedMeat("sale.butcher.1");

    const restored = SettlementDemoSystem.fromSave(JSON.parse(JSON.stringify(demo.toSave())));
    const duplicate = restored.sellCookedMeat("sale.butcher.1");

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.snapshot.coins).toBe(2);
    expect(duplicate.snapshot.rawMeat).toBe(0);
  });
});
