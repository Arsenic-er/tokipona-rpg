import { type Aabb, type Vec2, WORLD_TILE_SIZE_PX } from "./geometry";
import type { PlayerBody } from "./scene";

export const PLAYER_WALK_SPEED = 40;
const PLAYER_RUN_ACCELERATION = 96;

export const PLAYER_MOTION = Object.freeze({
  moveSpeed: 88,
  groundAcceleration: 300,
  airAcceleration: 220,
  groundDeceleration: 520,
  airDeceleration: 72,
  turnAcceleration: 840,
  gravity: 560,
  maxFallSpeed: 240,
  jumpSpeed: 190,
  jumpReleaseGravityMultiplier: 2.4,
  fallGravityMultiplier: 1.25,
});

export interface PlayerMotionState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly grounded: boolean;
}

export interface PlayerMotionInput {
  readonly moveX: number;
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
  const reversing = options.input.moveX !== 0 && Math.sign(targetVelocity) !== Math.sign(state.velocityX) &&
    Math.abs(state.velocityX) > EPSILON;
  const rate = reversing
    ? state.grounded ? PLAYER_MOTION.turnAcceleration : PLAYER_MOTION.airAcceleration
    : options.input.moveX === 0
      ? state.grounded ? PLAYER_MOTION.groundDeceleration : PLAYER_MOTION.airDeceleration
      : state.grounded ? groundedAcceleration(state.velocityX, targetVelocity) : PLAYER_MOTION.airAcceleration;
  state.velocityX = approach(state.velocityX, targetVelocity, rate * options.fixedSeconds);
  if (options.input.jump && !options.previousJump && state.grounded) {
    state.velocityY = -PLAYER_MOTION.jumpSpeed;
    state.grounded = false;
  }
  const gravityMultiplier = state.velocityY < 0 && options.previousJump && !options.input.jump
    ? PLAYER_MOTION.jumpReleaseGravityMultiplier
    : state.velocityY > 0
      ? PLAYER_MOTION.fallGravityMultiplier
      : 1;
  state.velocityY = Math.min(
    PLAYER_MOTION.maxFallSpeed,
    state.velocityY + PLAYER_MOTION.gravity * gravityMultiplier * options.fixedSeconds,
  );

  moveAxis(state, state.velocityX * options.fixedSeconds, "x", options.body, options.collides);
  state.grounded = false;
  moveAxis(state, state.velocityY * options.fixedSeconds, "y", options.body, options.collides);
  return Object.freeze({ state: Object.freeze(state), previousJump: options.input.jump });
}

export function normalizeMoveAxis(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function groundedAcceleration(currentVelocity: number, targetVelocity: number): number {
  const sameDirection = Math.sign(currentVelocity) === Math.sign(targetVelocity);
  const buildingBeyondWalk = sameDirection &&
    Math.abs(currentVelocity) >= PLAYER_WALK_SPEED &&
    Math.abs(targetVelocity) > PLAYER_WALK_SPEED;
  return buildingBeyondWalk ? PLAYER_RUN_ACCELERATION : PLAYER_MOTION.groundAcceleration;
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
