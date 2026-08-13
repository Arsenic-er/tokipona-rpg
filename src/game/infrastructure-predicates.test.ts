import { describe, expect, it } from "vitest";
import {
  WATERWHEEL_STABLE_TICKS_REQUIRED,
  advanceWaterwheelPhysicalProgress,
  isDownstreamSafe,
  isStableWaterwheelRpm,
  serviceSolutionWorldReady,
  waterwheelPhysicsReady,
  waterwheelSolutionWorldReady,
} from "./infrastructure-predicates";

describe("typed infrastructure predicates", () => {
  it("requires 600 consecutive safe ticks inside the stable RPM band", () => {
    const first = advanceWaterwheelPhysicalProgress(
      { stableTicks: 0, lastAngularVelocityRpm: 0, downstreamSafe: false },
      { angularVelocityRpm: 12, elapsedTicks: 599, downstreamFlowBand: "safe", overflowContact: false },
    );
    expect(first.stableTicks).toBe(599);
    expect(waterwheelPhysicsReady(first)).toBe(false);

    const ready = advanceWaterwheelPhysicalProgress(first, {
      angularVelocityRpm: 12,
      elapsedTicks: 1,
      downstreamFlowBand: "safe",
      overflowContact: false,
    });
    expect(ready.stableTicks).toBe(WATERWHEEL_STABLE_TICKS_REQUIRED);
    expect(waterwheelPhysicsReady(ready)).toBe(true);

    const unsafe = advanceWaterwheelPhysicalProgress(ready, {
      angularVelocityRpm: 12,
      elapsedTicks: 1,
      downstreamFlowBand: "caution",
      overflowContact: false,
    });
    expect(unsafe.stableTicks).toBe(0);
    expect(unsafe.downstreamSafe).toBe(false);
  });

  it("uses typed facts rather than evaluating authored expressions", () => {
    expect(isStableWaterwheelRpm(7.9)).toBe(false);
    expect(isStableWaterwheelRpm(8)).toBe(true);
    expect(isStableWaterwheelRpm(18)).toBe(true);
    expect(isStableWaterwheelRpm(18.1)).toBe(false);
    expect(isDownstreamSafe({ downstreamFlowBand: "safe", overflowContact: false })).toBe(true);
    expect(isDownstreamSafe({ downstreamFlowBand: "safe", overflowContact: true })).toBe(false);
    expect(waterwheelSolutionWorldReady("waterwheel.repair_axle", {
      axleSupported: true,
      wheelRotatesFreely: true,
      downstreamFlowBandSafe: true,
    })).toBe(true);
    expect(serviceSolutionWorldReady("service.open_bypass_valve", {
      bypassValveOpen: true,
      bypassRouteClear: true,
    })).toBe(true);
  });
});
