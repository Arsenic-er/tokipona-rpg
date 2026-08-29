import { describe, expect, it } from "vitest";
import type { Aabb } from "./geometry";
import {
  PLAYER_MOTION,
  stepPlayerMotion,
  type PlayerMotionState,
} from "./player-motion";

const EPSILON = 1e-9;
const body = Object.freeze({ width: 12, height: 14 });
const collides = (bounds: Aabb): boolean =>
  bounds.x < 0 || bounds.x + bounds.width > 320 || bounds.y < 0 || bounds.y + bounds.height > 80;

const approach = (value: number, target: number, maximumDelta: number): number => {
  if (value < target) return Math.min(value + maximumDelta, target);
  if (value > target) return Math.max(value - maximumDelta, target);
  return target;
};

function legacyStep(
  state: PlayerMotionState,
  input: Readonly<{ moveX: -1 | 0 | 1; jump: boolean }>,
  previousJump: boolean,
): Readonly<{ state: PlayerMotionState; previousJump: boolean }> {
  const next = { ...state };
  const fixedSeconds = 1 / 60;
  const targetVelocity = input.moveX * 88;
  const acceleration = next.grounded ? 720 : 420;
  const rate = input.moveX === 0 && next.grounded ? 920 : acceleration;
  next.velocityX = approach(next.velocityX, targetVelocity, rate * fixedSeconds);
  if (input.jump && !previousJump && next.grounded) {
    next.velocityY = -190;
    next.grounded = false;
  }
  next.velocityY = Math.min(240, next.velocityY + 560 * fixedSeconds);

  const moveAxis = (delta: number, axis: "x" | "y"): void => {
    let remaining = delta;
    while (Math.abs(remaining) > EPSILON) {
      const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 16 / 4);
      const candidate = {
        x: next.x + (axis === "x" ? step : 0),
        y: next.y + (axis === "y" ? step : 0),
      };
      if (collides({ ...candidate, ...body })) {
        if (axis === "x") next.velocityX = 0;
        else {
          if (step > 0) next.grounded = true;
          next.velocityY = 0;
        }
        return;
      }
      next.x = candidate.x;
      next.y = candidate.y;
      remaining -= step;
    }
  };

  moveAxis(next.velocityX * fixedSeconds, "x");
  next.grounded = false;
  moveAxis(next.velocityY * fixedSeconds, "y");
  return { state: next, previousJump: input.jump };
}

describe("stepPlayerMotion", () => {
  it("preserves the exact pre-refactor constants and 600-tick motion sequence", () => {
    expect(PLAYER_MOTION).toEqual({
      moveSpeed: 88,
      groundAcceleration: 720,
      airAcceleration: 420,
      groundDeceleration: 920,
      gravity: 560,
      maxFallSpeed: 240,
      jumpSpeed: 190,
    });
    let expected = { state: { x: 144, y: 66, velocityX: 0, velocityY: 0, grounded: false }, previousJump: false };
    let actual = structuredClone(expected);

    for (let tick = 0; tick < 600; tick += 1) {
      const input = {
        moveX: tick < 150 ? 1 as const : tick < 300 ? -1 as const : tick < 420 ? 0 as const : 1 as const,
        jump: tick === 30 || tick === 180 || tick === 450,
      };
      expected = legacyStep(expected.state, input, expected.previousJump);
      actual = stepPlayerMotion({
        state: actual.state,
        body,
        input,
        previousJump: actual.previousJump,
        fixedSeconds: 1 / 60,
        collides,
      });
    }

    expect(actual).toEqual(expected);
  });

  it("uses only the injected continuous collision predicate for axis blocking", () => {
    const result = stepPlayerMotion({
      state: { x: 308, y: 66, velocityX: 88, velocityY: 0, grounded: true },
      body,
      input: { moveX: 1, jump: false },
      previousJump: false,
      fixedSeconds: 1 / 60,
      collides,
    });

    expect(result.state.x).toBe(308);
    expect(result.state.velocityX).toBe(0);
    expect(result.state.grounded).toBe(true);
  });
});
