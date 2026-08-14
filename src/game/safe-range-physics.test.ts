import { describe, expect, it } from "vitest";
import {
  SAFE_RANGE_CANONICAL_AST,
  SAFE_RANGE_TARGET_CLASSES,
  compileSafeRangePhysics,
  executeSafeRangePhysics,
  type SafeRangeCompileInput,
  type SafeRangePhysicsContract,
  type SafeRangePhysicsPreview,
  type SafeRangeTargetClass,
} from "./safe-range-physics";

const contract: SafeRangePhysicsContract = {
  signatureId: "attack.water.forceful_motion.v0.1",
  allowedSceneId: "scene.valley.safe_range",
  capacity: { minExpressionCapacityWords: 4, minFocusSlots: 4 },
  mpQuotes: { boundExistingWater: 13, shapedWater: 18 },
  effect: {
    phase: "liquid",
    massMu: 2,
    kineticEu: 8,
    speedBand: { min: 3, max: 5 },
    solidDamageBonusHp: 0,
    kineticEuPerHpAfterAbsorption: 4,
  },
  targets: {
    wood_dummy: { targetClass: "wood_dummy", materialClass: "wood", initialHp: 6, absorptionEu: 1.5, coupling: 0.8 },
    sandbag: { targetClass: "sandbag", materialClass: "fiber_and_sand", initialHp: 8, absorptionEu: 2.5, coupling: 0.55 },
    minecart: { targetClass: "minecart", materialClass: "metal", initialHp: 10, absorptionEu: 1, coupling: 0.7 },
    hanging_stone: { targetClass: "hanging_stone", materialClass: "stone", initialHp: 8, absorptionEu: 2, coupling: 0.9 },
  },
};

const input = (targetClass: SafeRangeTargetClass = "wood_dummy", overrides: Partial<SafeRangeCompileInput> = {}): SafeRangeCompileInput => ({
  permission: "granted",
  sceneId: "scene.valley.safe_range",
  expressionCapacityWords: 4,
  focusSlots: 4,
  target: { targetId: targetClass, targetClass, currentHp: contract.targets[targetClass].initialHp },
  livingOverlap: false,
  sweptLivingCollision: false,
  useBoundExistingWater: true,
  currentMp: 30,
  worldVersion: 7,
  promptLevel: 0,
  direction: { x: 3, y: 4 },
  ...overrides,
});

const preview = (request = input(), authored = contract): SafeRangePhysicsPreview => {
  const result = compileSafeRangePhysics(authored, request);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.preview;
};

describe("safe-range forceful-water physics", () => {
  it("has no raw command-string input surface", () => {
    expect(Object.keys(input()).some((key) => key.toLowerCase().includes("raw"))).toBe(false);
  });

  it("compiles only the canonical structured AST and immutable 2 MU / 8 EU preview", () => {
    expect(SAFE_RANGE_CANONICAL_AST).toEqual({
      subject_head: "word.telo", command_particle: "o", action: "word.tawa", manner: "word.wawa",
    });
    const plan = preview();
    expect(plan.effect).toEqual({ phase: "liquid", massMu: 2, kineticEu: 8,
      speedBand: { min: 3, max: 5 }, solidDamageBonusHp: 0 });
    expect(plan.decisionMaterial.direction).toEqual({ x: 0.6, y: 0.8 });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.decisionMaterial)).toBe(true);
    expect(Object.keys(input()).some((key) => key.toLowerCase().includes("raw"))).toBe(false);
  });

  it("fails closed without mutation or MP charge at every compile gate", () => {
    const cases: Array<[Partial<SafeRangeCompileInput>, string]> = [
      [{ permission: "denied" }, "permission_denied"],
      [{ sceneId: "scene.valley.settlement" }, "wrong_scene"],
      [{ expressionCapacityWords: 3 }, "insufficient_expression_capacity"],
      [{ focusSlots: 3 }, "insufficient_focus_slots"],
      [{ target: { targetId: "wrong", targetClass: "wood_dummy", currentHp: 6 } }, "invalid_target_binding"],
      [{ target: { targetId: "wood_dummy", targetClass: "wood_dummy", currentHp: 0 } }, "invalid_target_binding"],
      [{ target: { targetId: "wood_dummy", targetClass: "wood_dummy", currentHp: 7 } }, "invalid_target_binding"],
      [{ livingOverlap: true }, "living_overlap"],
      [{ sweptLivingCollision: true }, "swept_living_collision"],
      [{ currentMp: 12 }, "insufficient_mp"],
      [{ worldVersion: -1 }, "invalid_world_version"],
      [{ promptLevel: -1 }, "invalid_prompt_level"],
      [{ direction: { x: 0, y: 0 } }, "invalid_direction"],
      [{ direction: { x: Number.NaN, y: 1 } }, "invalid_direction"],
    ];
    for (const [override, reason] of cases) {
      const request = input("wood_dummy", override);
      const before = structuredClone(request);
      expect(compileSafeRangePhysics(contract, request)).toEqual({ ok: false, reason, chargedMp: 0, mutated: false });
      expect(request).toEqual(before);
    }
  });

  it("rejects drift in every fixed authored contract constant", () => {
    const invalid = [
      { ...contract, signatureId: "wrong" },
      { ...contract, allowedSceneId: "wrong" },
      { ...contract, capacity: { ...contract.capacity, minExpressionCapacityWords: 5 } },
      { ...contract, capacity: { ...contract.capacity, minFocusSlots: 5 } },
      { ...contract, mpQuotes: { ...contract.mpQuotes, boundExistingWater: 12 } },
      { ...contract, mpQuotes: { ...contract.mpQuotes, shapedWater: 19 } },
      { ...contract, effect: { ...contract.effect, massMu: 3 } },
      { ...contract, effect: { ...contract.effect, kineticEu: 7 } },
      { ...contract, effect: { ...contract.effect, speedBand: { min: 2, max: 5 } } },
      { ...contract, targets: { ...contract.targets, wood_dummy: { ...contract.targets.wood_dummy, initialHp: 0 } } },
    ] as SafeRangePhysicsContract[];
    for (const authored of invalid) expect(compileSafeRangePhysics(authored, input())).toMatchObject({ ok: false, reason: "invalid_contract" });
  });

  it("quotes existing and shaped water exactly at 13 and 18 MP", () => {
    expect(preview(input("wood_dummy", { useBoundExistingWater: true, currentMp: 13 })).quotedMp).toBe(13);
    expect(preview(input("wood_dummy", { useBoundExistingWater: false, currentMp: 18 })).quotedMp).toBe(18);
    expect(compileSafeRangePhysics(contract, input("wood_dummy", { useBoundExistingWater: false, currentMp: 17 })))
      .toMatchObject({ ok: false, reason: "insufficient_mp", chargedMp: 0 });
  });

  it("derives all inert-target outcomes only from authored absorption and coupling", () => {
    const expected: Record<SafeRangeTargetClass, { transferred: number; damageBearing: number; loss: number }> = {
      wood_dummy: { transferred: 6.4, damageBearing: 4.9, loss: 1 },
      sandbag: { transferred: 4.4, damageBearing: 1.9000000000000004, loss: 0 },
      minecart: { transferred: 5.6, damageBearing: 4.6, loss: 1 },
      hanging_stone: { transferred: 7.2, damageBearing: 5.2, loss: 1 },
    };
    for (const targetClass of SAFE_RANGE_TARGET_CLASSES) {
      const result = executeSafeRangePhysics(preview(input(targetClass)), { worldVersion: 7, currentMp: 30 });
      expect(result.executed).toBe(true);
      if (!result.executed) continue;
      expect(result.value.physics).toMatchObject({ massMu: 2, kineticEu: 8,
        coupledEu: expected[targetClass].transferred, transferredEu: expected[targetClass].transferred,
        damageBearingEu: expected[targetClass].damageBearing,
        solidDamageBonusHp: 0 });
      expect(result.value.target.kineticHpLoss).toBe(expected[targetClass].loss);
      expect(result.value.remainingMp).toBe(17);
    }
  });

  it("keeps prompt H0/H1 evidence eligibility independent from damage", () => {
    const h0Damage = executeSafeRangePhysics(preview(input("wood_dummy", { promptLevel: 0 })), { worldVersion: 7, currentMp: 30 });
    const h1NoDamage = executeSafeRangePhysics(preview(input("sandbag", { promptLevel: 1 })), { worldVersion: 7, currentMp: 30 });
    const coached = executeSafeRangePhysics(preview(input("wood_dummy", { promptLevel: 2 })), { worldVersion: 7, currentMp: 30 });
    expect(h0Damage.executed && h0Damage.value.evidenceEligibility).toEqual({ eligible: true, promptLevel: 0, qualification: "H0" });
    expect(h1NoDamage.executed && h1NoDamage.value.evidenceEligibility).toEqual({ eligible: true, promptLevel: 1, qualification: "H1" });
    expect(coached.executed && coached.value.evidenceEligibility).toEqual({ eligible: false, promptLevel: 2, qualification: null });
  });

  it("requires a trusted unconsumed plan at the same world version and charges once", () => {
    const plan = preview();
    expect(executeSafeRangePhysics(plan, { worldVersion: 8, currentMp: 30 })).toEqual({ executed: false, reason: "world_version_conflict" });
    expect(executeSafeRangePhysics({ ...plan } as SafeRangePhysicsPreview, { worldVersion: 7, currentMp: 30 }))
      .toEqual({ executed: false, reason: "untrusted_plan" });
    expect(executeSafeRangePhysics(plan, { worldVersion: 7, currentMp: 12 })).toEqual({ executed: false, reason: "insufficient_mp" });
    const first = executeSafeRangePhysics(plan, { worldVersion: 7, currentMp: 30 });
    expect(first.executed && first.value.chargedMp).toBe(13);
    expect(executeSafeRangePhysics(plan, { worldVersion: 7, currentMp: 30 })).toEqual({ executed: false, reason: "plan_already_executed" });
  });

  it("ignores language mastery and produces stable idempotent decision material", () => {
    const ordinary = input();
    const withMastery = { ...input(), languageMastery: 999 };
    const left = preview(ordinary);
    const right = preview(withMastery);
    expect(right.decisionMaterial).toEqual(left.decisionMaterial);
    const a = executeSafeRangePhysics(left, { worldVersion: 7, currentMp: 30 });
    const b = executeSafeRangePhysics(right, { worldVersion: 7, currentMp: 30 });
    expect(a.executed && a.value.target.kineticHpLoss).toBe(1);
    expect(b.executed && b.value.target.kineticHpLoss).toBe(1);
  });
});
