import { describe, expect, it } from "vitest";
import {
  PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA,
  runPrologueThreeHourReleaseGate,
} from "../../src/acceptance/prologue-three-hour-release-gate";

describe("three-hour prologue release certification", () => {
  it("certifies the complete authored chapter", () => {
    expect(runPrologueThreeHourReleaseGate()).toMatchObject({
      schemaVersion: PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA,
      status: "passed",
    });
  });
});
