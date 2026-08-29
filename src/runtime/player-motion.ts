import { type Aabb, type Vec2, WORLD_TILE_SIZE_PX } from "./geometry";
import type { PlayerBody } from "./scene";

export const PLAYER_MOTION = Object.freeze({
  moveSpeed: 88,
  groundAcceleration: 720,
  airAcceleration: 420,
  groundDeceleration: 920,
  gravity: 560,
  maxFallSpeed: 240,
  jumpSpeed: 190,
});

export interface PlayerMotionState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly grounded: boolean;
}

export interface PlayerMotionInput {
  readonly moveX: -1 | 0 | 1;
  readonly jump: boolean;
}

export interface PlayerMotionStepOptions {
  readonly state: PlayerMotionState;
  readonly body: PlayerBody;
  readonly input: PlayerMotionInput;
  readonly previousJump: boolean;
  readonly fixedSeconds: number;
  readonly collides: (bounds: Aabb) => boolean;
}

export interface PlayerMotionStepResult {
  readonly state: PlayerMotionState;
  readonly previousJump: boolean;
}

const EPSILON = 1e-9;

export function stepPlayerMotion(options: PlayerMotionStepOptions): PlayerMotionStepResult {
  const state = { ...options.state };
  const targetVelocity = options.input.moveX * PLAYER_MOTION.moveSpeed;
  const acceleration = state.grounded
    ? PLAYER_MOTION.groundAcceleration
    : PLAYER_MOTION.airAcceleration;
  const rate = options.input.moveX === 0 && state.grounded
    ? PLAYER_MOTION.groundDeceleration
    : acceleration;
  state.velocityX = approach(state.velocityX, targetVelocity, rate * options.fixedSeconds);
  if (options.input.jump && !options.previousJump && state.grounded) {
    state.velocityY = -PLAYER_MOTION.jumpSpeed;
    state.grounded = false;
  }
  state.velocityY = Math.min(
    PLAYER_MOTION.maxFallSpeed,
    state.velocityY + PLAYER_MOTION.gravity * options.fixedSeconds,
  );

  moveAxis(state, state.velocityX * options.fixedSeconds, "x", options.body, options.collides);
  state.grounded = false;
  moveAxis(state, state.velocityY * options.fixedSeconds, "y", options.body, options.collides);
  return Object.freeze({ state: Object.freeze(state), previousJump: options.input.jump });
}

function approach(value: number, target: number, maximumDelta: number): number {
  if (value < target) return Math.min(value + maximumDelta, target);
  if (value > target) return Math.max(value - maximumDelta, target);
  return target;
}

function moveAxis(
  state: { x: number; y: number; velocityX: number; velocityY: number; grounded: boolean },
  delta: number,
  axis: "x" | "y",
  body: PlayerBody,
  collides: (bounds: Aabb) => boolean,
): void {
  const maximumStep = WORLD_TILE_SIZE_PX / 4;
  let remaining = delta;
  while (Math.abs(remaining) > EPSILON) {
    const step = Math.sign(remaining) * Math.min(Math.abs(remaining), maximumStep);
    const candidate: Vec2 = {
      x: state.x + (axis === "x" ? step : 0),
      y: state.y + (axis === "y" ? step : 0),
    };
    if (collides({ ...candidate, ...body })) {
      if (axis === "x") state.velocityX = 0;
      else {
        if (step > 0) state.grounded = true;
        state.velocityY = 0;
      }
      return;
    }
    state.x = candidate.x;
    state.y = candidate.y;
    remaining -= step;
  }
}
