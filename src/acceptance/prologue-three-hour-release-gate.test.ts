import { describe, expect, it } from "vitest";
import { runPrologueThreeHourReleaseGate } from "./prologue-three-hour-release-gate";

describe("three-hour prologue release gate", () => {
  it("truthfully rejects release certification until the authored underground handoff exists", () => {
    expect(() => runPrologueThreeHourReleaseGate()).toThrow(/underground_handoff_required/);
  });
});
