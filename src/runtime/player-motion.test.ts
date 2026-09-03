import { describe, expect, it } from "vitest";
import type { Aabb } from "./geometry";
import {
  normalizeMoveAxis,
  PLAYER_MOTION,
  PLAYER_WALK_SPEED,
  stepPlayerMotion,
  type PlayerMotionState,
} from "./player-motion";

const body = Object.freeze({ width: 12, height: 14 });
const fixedSeconds = 1 / 60;
const collides = (bounds: Aabb): boolean =>
  bounds.x < 0 || bounds.x + bounds.width > 320 || bounds.y < 0 || bounds.y + bounds.height > 80;

function step(
  state: PlayerMotionState,
  input: Readonly<{ moveX: number; jump: boolean }>,
  previousJump = false,
) {
  return stepPlayerMotion({ state, body, input, previousJump, fixedSeconds, collides });
}

describe("stepPlayerMotion", () => {
  it("reaches walking speed quickly, then builds into a run", () => {
    let state: PlayerMotionState = { x: 144, y: 66, velocityX: 0, velocityY: 0, grounded: true };
    const samples: number[] = [];
    for (let tick = 0; tick < 42; tick += 1) {
      state = step(state, { moveX: 1, jump: false }).state;
      samples.push(state.velocityX);
    }

    expect(samples[0]).toBeGreaterThan(0);
    expect(samples[0]).toBeLessThan(PLAYER_MOTION.moveSpeed * 0.12);
    expect(samples[7]).toBe(PLAYER_WALK_SPEED);
    expect(samples[7]).toBeLessThan(74);
    const firstRunTick = samples.findIndex((speed) => speed >= 74);
    expect(firstRunTick).toBeGreaterThan(25);
    expect(firstRunTick).toBeLessThan(36);
    expect(samples.at(-1)).toBe(PLAYER_MOTION.moveSpeed);
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1]!)).toBe(true);
  });

  it("preserves analog stick strength so a light tilt remains a walk", () => {
    let state: PlayerMotionState = { x: 144, y: 66, velocityX: 0, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 90; tick += 1) {
      state = step(state, { moveX: 0.35, jump: false }).state;
    }

    expect(state.velocityX).toBeCloseTo(PLAYER_MOTION.moveSpeed * 0.35);
    expect(state.velocityX).toBeLessThan(74);
    expect(normalizeMoveAxis(1.7)).toBe(1);
    expect(normalizeMoveAxis(-1.7)).toBe(-1);
    expect(normalizeMoveAxis(Number.NaN)).toBe(0);
  });

  it("brakes quickly when reversing but still crosses through zero", () => {
    let state: PlayerMotionState = { x: 144, y: 66, velocityX: 88, velocityY: 0, grounded: true };
    const samples: number[] = [];
    for (let tick = 0; tick < 8; tick += 1) {
      state = step(state, { moveX: -1, jump: false }).state;
      samples.push(state.velocityX);
    }

    expect(samples[0]).toBeGreaterThan(0);
    expect(samples.some((value) => value < 0)).toBe(true);
    expect(samples.at(-1)).toBeGreaterThan(-PLAYER_MOTION.moveSpeed);
  });

  it("coasts to a stop rather than dropping horizontal velocity instantly", () => {
    let state: PlayerMotionState = { x: 144, y: 66, velocityX: 88, velocityY: 0, grounded: true };
    state = step(state, { moveX: 0, jump: false }).state;

    expect(state.velocityX).toBeGreaterThan(0);
    expect(state.velocityX).toBeLessThan(88);
  });

  it("supports a shorter released jump than a held jump", () => {
    const takeoff = step(
      { x: 144, y: 66, velocityX: 0, velocityY: 0, grounded: true },
      { moveX: 0, jump: true },
    );
    const held = step(takeoff.state, { moveX: 0, jump: true }, true);
    const released = step(takeoff.state, { moveX: 0, jump: false }, true);

    expect(held.state.velocityY).toBeLessThan(released.state.velocityY);
    expect(held.state.y).toBeLessThan(released.state.y);
  });

  it("keeps air steering weaker than grounded acceleration", () => {
    const ground = step(
      { x: 144, y: 66, velocityX: 0, velocityY: 0, grounded: true },
      { moveX: 1, jump: false },
    );
    const air = step(
      { x: 144, y: 40, velocityX: 0, velocityY: 0, grounded: false },
      { moveX: 1, jump: false },
    );

    expect(air.state.velocityX).toBeGreaterThan(0);
    expect(air.state.velocityX).toBeLessThan(ground.state.velocityX);
  });

  it("uses only the injected continuous collision predicate for axis blocking", () => {
    const result = step(
      { x: 308, y: 66, velocityX: 88, velocityY: 0, grounded: true },
      { moveX: 1, jump: false },
    );

    expect(result.state.x).toBe(308);
    expect(result.state.velocityX).toBe(0);
    expect(result.state.grounded).toBe(true);
  });
});
