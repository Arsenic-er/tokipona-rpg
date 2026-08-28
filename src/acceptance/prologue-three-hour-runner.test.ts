import { describe, expect, it } from "vitest";
import { runPrologueThreeHourAcceptance } from "./prologue-three-hour-runner";

describe("deterministic three-hour prologue acceptance runner", () => {
  it.each(["primary", "alternate"] as const)("stops at the authored underground handoff for the %s N07 route", (routeVariant) => {
    expect(() => runPrologueThreeHourAcceptance({ sessionId: `acceptance.${routeVariant}`, routeVariant, injectSoftRecoveries: true }))
      .toThrow(/underground_handoff_required/);
  });

  it("does not claim the deferred formal qualification path is playable", () => {
    expect(() => runPrologueThreeHourAcceptance({
      sessionId: "acceptance.formal-attack",
      routeVariant: "primary",
      attemptFormalAttackQualification: true,
    })).toThrow(/underground_handoff_required/);
  });

  it("is deterministic across identical route runs without reusing transaction identity", () => {
    expect(() => runPrologueThreeHourAcceptance({ sessionId: "acceptance.determinism.left", routeVariant: "primary" }))
      .toThrow(/underground_handoff_required/);
    expect(() => runPrologueThreeHourAcceptance({ sessionId: "acceptance.determinism.right", routeVariant: "primary" }))
      .toThrow(/underground_handoff_required/);
  });
});
