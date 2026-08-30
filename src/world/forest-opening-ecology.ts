import { sha256Canonical, type JsonValue } from "../canonical-json";
import {
  isVerifiedRuntimeForestOpeningManifest,
  type RuntimeForestOpeningManifest,
} from "../content/runtime-forest-opening-manifest";
import type { Vec2 } from "../runtime/geometry";

export type RabbitMode = "foraging" | "alert" | "fleeing" | "sheltered";
export type WetlandBirdMode = "wading" | "alert" | "taking_off" | "departed";

export interface ForestOpeningSoundEvent {
  readonly position: Vec2;
  readonly strength: number;
}

export interface ForestOpeningPerceptionFrame {
  readonly playerPosition: Vec2;
  readonly playerVelocity: Vec2;
  readonly soundEvents: readonly ForestOpeningSoundEvent[];
}

export interface ForestOpeningRabbitState {
  readonly mode: RabbitMode;
  readonly position: Vec2;
  readonly modeTick: number;
}

export interface ForestOpeningWetlandBirdState {
  readonly mode: WetlandBirdMode;
  readonly position: Vec2;
  readonly modeTick: number;
}

export interface ForestOpeningEcologySave {
  readonly schema: "tokipona.forest-opening-ecology.v0.1";
  readonly manifestDigest: `sha256:${string}`;
  readonly seed: string;
  readonly revision: number;
  readonly tick: number;
  readonly rabbit: ForestOpeningRabbitState;
  readonly wetlandBird: ForestOpeningWetlandBirdState;
  readonly checksum: `sha256:${string}`;
}

export interface ForestOpeningEcologySnapshot {
  readonly revision: number;
  readonly tick: number;
  readonly rabbit: ForestOpeningRabbitState;
  readonly wetlandBird: ForestOpeningWetlandBirdState;
  readonly stateDigest: `sha256:${string}`;
}

const SCHEMA = "tokipona.forest-opening-ecology.v0.1" as const;
const RABBIT_SIGHT_RADIUS_PX = 168;
const RABBIT_SPEED_PX_PER_TICK = 2;
const BIRD_SPEED_PX_PER_TICK = 3;

export class ForestOpeningEcology {
  private readonly manifest: RuntimeForestOpeningManifest;
  private readonly seed: string;
  private readonly rabbitSpawn: Vec2;
  private readonly rabbitRefuge: Vec2;
  private readonly birdSpawn: Vec2;
  private readonly birdExit: Vec2;
  private readonly idlePhase: number;
  private revision: number;
  private tick: number;
  private rabbit: ForestOpeningRabbitState;
  private wetlandBird: ForestOpeningWetlandBirdState;

  private constructor(
    manifest: RuntimeForestOpeningManifest,
    save: Omit<ForestOpeningEcologySave, "checksum" | "manifestDigest" | "schema">,
  ) {
    this.manifest = manifest;
    this.seed = save.seed;
    const rabbit = manifest.ecology.visibleSpecies.find(({ speciesId }) => speciesId === "forest.rabbit")!;
    const bird = manifest.ecology.visibleSpecies.find(({ speciesId }) => speciesId === "forest.wetland_bird")!;
    this.rabbitSpawn = point(rabbit.spawnPx);
    this.rabbitRefuge = point(rabbit.escapeAnchorPx);
    this.birdSpawn = point(bird.spawnPx);
    this.birdExit = point(bird.escapeAnchorPx);
    this.idlePhase = seedPhase(save.seed);
    this.revision = save.revision;
    this.tick = save.tick;
    this.rabbit = freezeRabbit(save.rabbit);
    this.wetlandBird = freezeBird(save.wetlandBird);
  }

  public static fresh(manifest: RuntimeForestOpeningManifest, seed: string): ForestOpeningEcology {
    assertManifest(manifest);
    if (!seed.trim()) throw new Error("forest opening ecology seed must not be empty");
    const rabbit = manifest.ecology.visibleSpecies.find(({ speciesId }) => speciesId === "forest.rabbit")!;
    const bird = manifest.ecology.visibleSpecies.find(({ speciesId }) => speciesId === "forest.wetland_bird")!;
    return new ForestOpeningEcology(manifest, {
      seed,
      revision: 0,
      tick: 0,
      rabbit: { mode: "foraging", position: point(rabbit.spawnPx), modeTick: 0 },
      wetlandBird: { mode: "wading", position: point(bird.spawnPx), modeTick: 0 },
    });
  }

  public static fromSave(
    manifest: RuntimeForestOpeningManifest,
    candidate: unknown,
  ): ForestOpeningEcology {
    assertManifest(manifest);
    const save = readEcologySave(candidate);
    if (save.manifestDigest !== manifest.sourceDigest) throw new Error("forest opening ecology manifest mismatch");
    return new ForestOpeningEcology(manifest, save);
  }

  public advanceTicks(
    ticks: number,
    perception: ForestOpeningPerceptionFrame,
  ): ForestOpeningEcologySnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("forest opening ecology ticks must be non-negative");
    validatePerception(perception);
    for (let index = 0; index < ticks; index += 1) {
      this.tick += 1;
      this.stepRabbit(perception);
      this.stepBird(perception);
    }
    return this.snapshot();
  }

  public resetAtTick(tick: number): ForestOpeningEcologySnapshot {
    if (!Number.isSafeInteger(tick) || tick < this.tick) throw new Error("forest opening ecology reset tick is invalid");
    this.tick = tick;
    this.revision = 0;
    this.rabbit = freezeRabbit({ mode: "foraging", position: this.rabbitSpawn, modeTick: 0 });
    this.wetlandBird = freezeBird({ mode: "wading", position: this.birdSpawn, modeTick: 0 });
    return this.snapshot();
  }

  public snapshot(): ForestOpeningEcologySnapshot {
    const body = {
      revision: this.revision,
      tick: this.tick,
      rabbit: freezeRabbit(this.rabbit),
      wetlandBird: freezeBird(this.wetlandBird),
    };
    return Object.freeze({ ...body, stateDigest: sha256Canonical(body as unknown as JsonValue) });
  }

  public save(): ForestOpeningEcologySave {
    const snapshot = this.snapshot();
    const body = {
      schema: SCHEMA,
      manifestDigest: this.manifest.sourceDigest,
      seed: this.seed,
      revision: snapshot.revision,
      tick: snapshot.tick,
      rabbit: snapshot.rabbit,
      wetlandBird: snapshot.wetlandBird,
    };
    return Object.freeze({ ...body, checksum: sha256Canonical(body as unknown as JsonValue) });
  }

  private stepRabbit(perception: ForestOpeningPerceptionFrame): void {
    if (this.rabbit.mode === "foraging") {
      if (perceives(this.rabbit.position, perception, RABBIT_SIGHT_RADIUS_PX, this.manifest.ecology.disturbanceRadiusPx)) {
        this.rabbit = freezeRabbit({ ...this.rabbit, mode: "alert", modeTick: 0 });
        this.revision += 1;
        return;
      }
      const offset = Math.round(Math.sin((this.tick + this.idlePhase) / 30) * 12);
      this.rabbit = freezeRabbit({
        ...this.rabbit,
        position: { x: this.rabbitSpawn.x + offset, y: this.rabbitSpawn.y },
        modeTick: this.rabbit.modeTick + 1,
      });
      return;
    }
    if (this.rabbit.mode === "alert") {
      this.rabbit = freezeRabbit({ ...this.rabbit, mode: "fleeing", modeTick: 0 });
      this.revision += 1;
      return;
    }
    if (this.rabbit.mode === "fleeing") {
      const moved = moveToward(this.rabbit.position, this.rabbitRefuge, RABBIT_SPEED_PX_PER_TICK);
      const arrived = samePoint(moved, this.rabbitRefuge);
      this.rabbit = freezeRabbit({
        mode: arrived ? "sheltered" : "fleeing",
        position: moved,
        modeTick: arrived ? 0 : this.rabbit.modeTick + 1,
      });
      if (arrived) this.revision += 1;
    }
  }

  private stepBird(perception: ForestOpeningPerceptionFrame): void {
    if (this.wetlandBird.mode === "wading") {
      if (perceives(this.wetlandBird.position, perception, RABBIT_SIGHT_RADIUS_PX, this.manifest.ecology.disturbanceRadiusPx)) {
        this.wetlandBird = freezeBird({ ...this.wetlandBird, mode: "alert", modeTick: 0 });
        this.revision += 1;
        return;
      }
      const offset = Math.round(Math.sin((this.tick + this.idlePhase * 3) / 45) * 4);
      this.wetlandBird = freezeBird({
        ...this.wetlandBird,
        position: { x: this.birdSpawn.x + offset, y: this.birdSpawn.y },
        modeTick: this.wetlandBird.modeTick + 1,
      });
      return;
    }
    if (this.wetlandBird.mode === "alert") {
      const moved = moveToward(this.wetlandBird.position, this.birdExit, BIRD_SPEED_PX_PER_TICK);
      this.wetlandBird = freezeBird({ mode: "taking_off", position: moved, modeTick: 0 });
      this.revision += 1;
      return;
    }
    if (this.wetlandBird.mode === "taking_off") {
      const moved = moveToward(this.wetlandBird.position, this.birdExit, BIRD_SPEED_PX_PER_TICK);
      const arrived = samePoint(moved, this.birdExit);
      this.wetlandBird = freezeBird({
        mode: arrived ? "departed" : "taking_off",
        position: moved,
        modeTick: arrived ? 0 : this.wetlandBird.modeTick + 1,
      });
      if (arrived) this.revision += 1;
    }
  }
}

function perceives(
  entity: Vec2,
  frame: ForestOpeningPerceptionFrame,
  sightRadius: number,
  soundRadius: number,
): boolean {
  if (distance(entity, frame.playerPosition) <= sightRadius) return true;
  return frame.soundEvents.some(({ position, strength }) =>
    distance(entity, position) <= soundRadius * strength);
}

function moveToward(from: Vec2, to: Vec2, maximum: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distanceToTarget = Math.hypot(dx, dy);
  if (distanceToTarget <= maximum) return point([to.x, to.y]);
  return point([
    from.x + dx / distanceToTarget * maximum,
    from.y + dy / distanceToTarget * maximum,
  ]);
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function samePoint(left: Vec2, right: Vec2): boolean {
  return left.x === right.x && left.y === right.y;
}

function seedPhase(seed: string): number {
  const digest = sha256Canonical(seed);
  return Number.parseInt(digest.slice(7, 15), 16) % 360;
}

function validatePerception(frame: ForestOpeningPerceptionFrame): void {
  const raw = record(frame, "forest opening perception frame");
  exactKeys(raw, ["playerPosition", "playerVelocity", "soundEvents"], "forest opening perception frame");
  validatePoint(frame.playerPosition, "player position");
  validatePoint(frame.playerVelocity, "player velocity");
  if (!Array.isArray(frame.soundEvents)) throw new Error("forest opening sound events must be an array");
  frame.soundEvents.forEach((event, index) => {
    const entry = record(event, `forest opening sound event[${index}]`);
    exactKeys(entry, ["position", "strength"], `forest opening sound event[${index}]`);
    validatePoint(event.position, `sound event[${index}] position`);
    if (!Number.isFinite(event.strength) || event.strength <= 0 || event.strength > 1) {
      throw new Error("forest opening sound strength must be within 0..1");
    }
  });
}

function readEcologySave(candidate: unknown): ForestOpeningEcologySave {
  const raw = record(candidate, "forest opening ecology save");
  exactKeys(raw, ["schema", "manifestDigest", "seed", "revision", "tick", "rabbit", "wetlandBird", "checksum"], "forest opening ecology save");
  if (raw.schema !== SCHEMA || typeof raw.seed !== "string" || !raw.seed.trim() ||
      !safeNonNegative(raw.revision) || !safeNonNegative(raw.tick)) {
    throw new Error("forest opening ecology save header is invalid");
  }
  const checksum = sha(raw.checksum, "forest opening ecology checksum");
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "checksum"));
  if (sha256Canonical(body as JsonValue) !== checksum) throw new Error("forest opening ecology checksum mismatch");
  const rabbit = readRabbit(raw.rabbit);
  const wetlandBird = readBird(raw.wetlandBird);
  return Object.freeze({
    schema: SCHEMA,
    manifestDigest: sha(raw.manifestDigest, "forest opening ecology manifest digest"),
    seed: raw.seed,
    revision: raw.revision as number,
    tick: raw.tick as number,
    rabbit,
    wetlandBird,
    checksum,
  });
}

function readRabbit(value: unknown): ForestOpeningRabbitState {
  const raw = record(value, "forest opening rabbit save");
  exactKeys(raw, ["mode", "position", "modeTick"], "forest opening rabbit save");
  if (!["foraging", "alert", "fleeing", "sheltered"].includes(raw.mode as string) || !safeNonNegative(raw.modeTick)) {
    throw new Error("forest opening rabbit save is invalid");
  }
  return freezeRabbit({
    mode: raw.mode as RabbitMode,
    position: readPoint(raw.position, "rabbit position"),
    modeTick: raw.modeTick as number,
  });
}

function readBird(value: unknown): ForestOpeningWetlandBirdState {
  const raw = record(value, "forest opening wetland bird save");
  exactKeys(raw, ["mode", "position", "modeTick"], "forest opening wetland bird save");
  if (!["wading", "alert", "taking_off", "departed"].includes(raw.mode as string) || !safeNonNegative(raw.modeTick)) {
    throw new Error("forest opening wetland bird save is invalid");
  }
  return freezeBird({
    mode: raw.mode as WetlandBirdMode,
    position: readPoint(raw.position, "wetland bird position"),
    modeTick: raw.modeTick as number,
  });
}

function freezeRabbit(state: ForestOpeningRabbitState): ForestOpeningRabbitState {
  return Object.freeze({ mode: state.mode, position: point([state.position.x, state.position.y]), modeTick: state.modeTick });
}

function freezeBird(state: ForestOpeningWetlandBirdState): ForestOpeningWetlandBirdState {
  return Object.freeze({ mode: state.mode, position: point([state.position.x, state.position.y]), modeTick: state.modeTick });
}

function point(value: readonly [number, number]): Vec2 {
  return Object.freeze({ x: value[0], y: value[1] });
}

function readPoint(value: unknown, label: string): Vec2 {
  const raw = record(value, label);
  exactKeys(raw, ["x", "y"], label);
  const result = { x: raw.x as number, y: raw.y as number };
  validatePoint(result, label);
  return Object.freeze(result);
}

function validatePoint(value: Vec2, label: string): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error(`${label} must be finite`);
}

function assertManifest(manifest: RuntimeForestOpeningManifest): void {
  if (!isVerifiedRuntimeForestOpeningManifest(manifest)) throw new Error("forest opening ecology requires a verified manifest");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`);
}

function safeNonNegative(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function sha(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${label} is invalid`);
  return value as `sha256:${string}`;
}
