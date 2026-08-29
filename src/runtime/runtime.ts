import {
  type Aabb,
  clamp,
  intersects,
  type Vec2,
  WORLD_TILE_SIZE_PX,
} from "./geometry";
import {
  DEFAULT_PLAYER_BODY,
  type PlayerBody,
  type SceneDefinition,
  SceneRegistry,
} from "./scene";
import { stepPlayerMotion } from "./player-motion";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface RuntimeInput {
  readonly moveX?: number;
  readonly jump?: boolean;
}

export interface NormalizedRuntimeInput {
  readonly moveX: -1 | 0 | 1;
  readonly jump: boolean;
}

export interface PlayerState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly grounded: boolean;
  readonly body: PlayerBody;
}

export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RuntimeCheckpoint {
  readonly id: string;
  readonly sceneId: string;
  readonly position: Vec2;
  readonly tick: number;
}

export interface RuntimeSceneTransition {
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly exitId: string;
  readonly targetEntranceId: string;
  readonly tick: number;
}

export interface RuntimeSnapshot {
  readonly tick: number;
  readonly sceneId: string;
  readonly player: PlayerState;
  readonly camera: CameraState;
  readonly checkpoint: RuntimeCheckpoint;
}

export interface PersistentSceneDiffSnapshot {
  readonly sceneId: string;
  readonly values: Readonly<Record<string, JsonValue>>;
  readonly tileSolidity: Readonly<Record<string, boolean>>;
}

export interface TransientParticle {
  readonly id: string;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly ttlTicks: number;
}

export interface RuntimeReplay {
  readonly schema: "tokipona.runtime-replay.v0.1";
  readonly fixedHz: number;
  readonly startSignature: string;
  readonly inputs: readonly NormalizedRuntimeInput[];
}

export interface PersistentTileEditResult {
  readonly accepted: boolean;
  readonly rejectionCode: "out_of_bounds" | "recovery_route_blocked" | null;
}

export interface RuntimeOptions<TGlobalProgress> {
  readonly scenes: readonly SceneDefinition[];
  readonly initialSceneId: string;
  readonly initialEntranceId?: string;
  readonly globalProgress: TGlobalProgress;
  readonly viewportPx?: Vec2;
  readonly fixedHz?: number;
  readonly playerBody?: PlayerBody;
}

interface MutablePlayerState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
}

interface MutableParticle {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  ttlTicks: number;
}

interface ScenePersistentState {
  readonly values: Map<string, JsonValue>;
  readonly tileSolidity: Map<string, boolean>;
}

const EXIT_COOLDOWN_TICKS = 2;
const MAX_FRAME_SECONDS = 1;
const EPSILON = 1e-9;

const normalizeInput = (input: RuntimeInput): NormalizedRuntimeInput => ({
  moveX: input.moveX === undefined || input.moveX === 0 ? 0 : input.moveX < 0 ? -1 : 1,
  jump: input.jump === true,
});

const cloneJson = <T extends JsonValue>(value: T): T => {
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]),
    ) as T;
  }
  return value;
};

const tileKey = (tileX: number, tileY: number): string => `${tileX},${tileY}`;

export class FixedStepRpgRuntime<TGlobalProgress> {
  readonly registry: SceneRegistry;
  readonly fixedHz: number;
  readonly fixedSeconds: number;
  readonly globalProgress: TGlobalProgress;

  private readonly viewport: Vec2;
  private readonly persistentScenes = new Map<string, ScenePersistentState>();
  private readonly particles = new Map<string, MutableParticle>();
  private readonly sceneTransitions: RuntimeSceneTransition[] = [];
  private readonly player: MutablePlayerState;
  private sceneId: string;
  private checkpoint: RuntimeCheckpoint;
  private camera: CameraState;
  private tickId = 0;
  private accumulatorSeconds = 0;
  private exitCooldown = EXIT_COOLDOWN_TICKS;
  private previousJump = false;
  private recordingInputs: NormalizedRuntimeInput[] | null = null;
  private recordingStartSignature: string | null = null;

  constructor(options: RuntimeOptions<TGlobalProgress>) {
    this.registry = new SceneRegistry(options.scenes, options.playerBody ?? DEFAULT_PLAYER_BODY);
    this.fixedHz = options.fixedHz ?? 60;
    if (!Number.isInteger(this.fixedHz) || this.fixedHz <= 0 || this.fixedHz > 240) {
      throw new Error("fixedHz must be an integer from 1 through 240");
    }
    this.fixedSeconds = 1 / this.fixedHz;
    this.globalProgress = options.globalProgress;
    this.viewport = Object.freeze({ ...(options.viewportPx ?? { x: 160, y: 90 }) });
    if (this.viewport.x <= 0 || this.viewport.y <= 0) throw new Error("viewport dimensions must be positive");

    const entrance = this.registry.entrance(options.initialSceneId, options.initialEntranceId);
    this.sceneId = options.initialSceneId;
    this.player = {
      x: entrance.position.x,
      y: entrance.position.y,
      velocityX: 0,
      velocityY: 0,
      grounded: false,
    };
    this.checkpoint = Object.freeze({
      id: "checkpoint.initial",
      sceneId: this.sceneId,
      position: Object.freeze({ ...entrance.position }),
      tick: 0,
    });
    this.camera = this.followCamera();
  }

  snapshot(): RuntimeSnapshot {
    return Object.freeze({
      tick: this.tickId,
      sceneId: this.sceneId,
      player: Object.freeze({
        position: Object.freeze({ x: this.player.x, y: this.player.y }),
        velocity: Object.freeze({ x: this.player.velocityX, y: this.player.velocityY }),
        grounded: this.player.grounded,
        body: this.registry.playerBody,
      }),
      camera: Object.freeze({ ...this.camera }),
      checkpoint: Object.freeze({
        ...this.checkpoint,
        position: Object.freeze({ ...this.checkpoint.position }),
      }),
    });
  }

  advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): number {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > MAX_FRAME_SECONDS) {
      throw new Error(`elapsedSeconds must be between 0 and ${MAX_FRAME_SECONDS}`);
    }
    this.accumulatorSeconds += elapsedSeconds;
    let steps = 0;
    const normalized = normalizeInput(input);
    while (this.accumulatorSeconds + EPSILON >= this.fixedSeconds) {
      this.accumulatorSeconds -= this.fixedSeconds;
      if (this.accumulatorSeconds < 0 && this.accumulatorSeconds > -EPSILON) this.accumulatorSeconds = 0;
      this.stepFixed(normalized);
      steps += 1;
    }
    return steps;
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): void {
    if (!Number.isInteger(ticks) || ticks < 0) throw new Error("ticks must be a non-negative integer");
    const normalized = normalizeInput(input);
    for (let tick = 0; tick < ticks; tick += 1) this.stepFixed(normalized);
  }

  setCheckpoint(id: string): RuntimeCheckpoint {
    if (!id.trim()) throw new Error("checkpoint id must not be empty");
    const position = { x: this.player.x, y: this.player.y };
    if (this.collidesAt(this.sceneId, this.playerBounds(position)) || !this.hasRecoveryRoute(this.sceneId, position)) {
      throw new Error("checkpoint position has no safe recovery route");
    }
    this.checkpoint = Object.freeze({
      id,
      sceneId: this.sceneId,
      position: Object.freeze(position),
      tick: this.tickId,
    });
    return this.checkpoint;
  }

  /** Hydrates a checkpoint already accepted by the persistent session. */
  restoreCheckpoint(checkpoint: RuntimeCheckpoint): RuntimeCheckpoint {
    if (!checkpoint.id.trim() || !Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
      throw new Error("invalid persisted checkpoint");
    }
    this.registry.get(checkpoint.sceneId);
    const position = { ...checkpoint.position };
    if (
      !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
      this.collidesAt(checkpoint.sceneId, this.playerBounds(position)) ||
      !this.hasRecoveryRoute(checkpoint.sceneId, position)
    ) {
      throw new Error("persisted checkpoint has no safe recovery route");
    }
    this.checkpoint = Object.freeze({
      ...checkpoint,
      position: Object.freeze(position),
    });
    return this.checkpoint;
  }

  resetToCheckpoint(): RuntimeSnapshot {
    const recovered = this.findRecoveryPosition(this.checkpoint.sceneId, this.checkpoint.position);
    if (!recovered) {
      throw new Error(`scene ${this.checkpoint.sceneId} has no valid recovery position`);
    }
    this.sceneId = this.checkpoint.sceneId;
    this.player.x = recovered.x;
    this.player.y = recovered.y;
    this.player.velocityX = 0;
    this.player.velocityY = 0;
    this.player.grounded = false;
    this.previousJump = false;
    this.exitCooldown = EXIT_COOLDOWN_TICKS;
    this.accumulatorSeconds = 0;
    this.particles.clear();
    this.camera = this.followCamera();
    return this.snapshot();
  }

  setPersistentValue(sceneId: string, key: string, value: JsonValue): void {
    this.registry.get(sceneId);
    if (!key.trim()) throw new Error("persistent value key must not be empty");
    this.persistentState(sceneId).values.set(key, cloneJson(value));
  }

  persistentValue(sceneId: string, key: string): JsonValue | undefined {
    const value = this.persistentState(sceneId).values.get(key);
    return value === undefined ? undefined : cloneJson(value);
  }

  setPersistentTileSolid(
    sceneId: string,
    tileX: number,
    tileY: number,
    solid: boolean,
  ): PersistentTileEditResult {
    const scene = this.registry.get(sceneId);
    if (
      !Number.isInteger(tileX) ||
      !Number.isInteger(tileY) ||
      tileX < 0 ||
      tileY < 0 ||
      tileY >= scene.collisionRows.length ||
      tileX >= scene.collisionRows[0]!.length
    ) {
      return { accepted: false, rejectionCode: "out_of_bounds" };
    }
    const overrides = this.persistentState(sceneId).tileSolidity;
    const key = tileKey(tileX, tileY);
    const previous = overrides.get(key);
    overrides.set(key, solid);

    const hasRecoveryEntrance = scene.entrances.some((entrance) =>
      !this.collidesAt(sceneId, this.playerBounds(entrance.position)) &&
      this.hasRecoveryRoute(sceneId, entrance.position),
    );
    const checkpointSafe = this.checkpoint.sceneId !== sceneId || (
      !this.collidesAt(sceneId, this.playerBounds(this.checkpoint.position)) &&
      this.hasRecoveryRoute(sceneId, this.checkpoint.position)
    );
    if (!hasRecoveryEntrance || !checkpointSafe) {
      if (previous === undefined) overrides.delete(key);
      else overrides.set(key, previous);
      return { accepted: false, rejectionCode: "recovery_route_blocked" };
    }
    return { accepted: true, rejectionCode: null };
  }

  persistentDiff(sceneId: string): PersistentSceneDiffSnapshot {
    const state = this.persistentState(sceneId);
    return Object.freeze({
      sceneId,
      values: Object.freeze(Object.fromEntries(
        [...state.values.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, cloneJson(value)]),
      )),
      tileSolidity: Object.freeze(Object.fromEntries(
        [...state.tileSolidity.entries()].sort(([left], [right]) => left.localeCompare(right)),
      )),
    });
  }

  /** Replaces the local mirror with a diff read from the persistent session. */
  restorePersistentDiff(snapshot: PersistentSceneDiffSnapshot): void {
    this.registry.get(snapshot.sceneId);
    const replacement: ScenePersistentState = { values: new Map(), tileSolidity: new Map() };
    for (const [key, value] of Object.entries(snapshot.values)) {
      if (!key.trim()) throw new Error("persistent value key must not be empty");
      replacement.values.set(key, cloneJson(value));
    }
    for (const [key, solid] of Object.entries(snapshot.tileSolidity)) {
      const match = /^(0|[1-9]\d*),(0|[1-9]\d*)$/u.exec(key);
      if (!match || typeof solid !== "boolean") throw new Error(`invalid persistent tile key: ${key}`);
      const tileX = Number(match[1]);
      const tileY = Number(match[2]);
      const scene = this.registry.get(snapshot.sceneId);
      if (tileY >= scene.collisionRows.length || tileX >= scene.collisionRows[0]!.length) {
        throw new Error(`persistent tile is out of bounds: ${key}`);
      }
      replacement.tileSolidity.set(key, solid);
    }
    this.persistentScenes.set(snapshot.sceneId, replacement);
  }

  clearPersistentDiff(sceneId: string): void {
    this.registry.get(sceneId);
    this.persistentScenes.delete(sceneId);
  }

  consumeSceneTransitions(): readonly RuntimeSceneTransition[] {
    const transitions = this.sceneTransitions.map((transition) => Object.freeze({ ...transition }));
    this.sceneTransitions.length = 0;
    return Object.freeze(transitions);
  }

  spawnTransientParticle(particle: TransientParticle): void {
    if (!particle.id.trim() || this.particles.has(particle.id)) {
      throw new Error(`invalid or duplicate transient particle: ${particle.id}`);
    }
    if (!Number.isInteger(particle.ttlTicks) || particle.ttlTicks <= 0) {
      throw new Error("particle ttlTicks must be a positive integer");
    }
    this.particles.set(particle.id, {
      id: particle.id,
      x: particle.position.x,
      y: particle.position.y,
      velocityX: particle.velocity.x,
      velocityY: particle.velocity.y,
      ttlTicks: particle.ttlTicks,
    });
  }

  transientParticles(): readonly TransientParticle[] {
    return Object.freeze([...this.particles.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((particle) => Object.freeze({
        id: particle.id,
        position: Object.freeze({ x: particle.x, y: particle.y }),
        velocity: Object.freeze({ x: particle.velocityX, y: particle.velocityY }),
        ttlTicks: particle.ttlTicks,
      })));
  }

  startRecording(): void {
    if (this.recordingInputs) throw new Error("input recording is already active");
    this.recordingInputs = [];
    this.recordingStartSignature = this.stateSignature();
  }

  stopRecording(): RuntimeReplay {
    if (!this.recordingInputs || this.recordingStartSignature === null) {
      throw new Error("input recording is not active");
    }
    const replay: RuntimeReplay = Object.freeze({
      schema: "tokipona.runtime-replay.v0.1",
      fixedHz: this.fixedHz,
      startSignature: this.recordingStartSignature,
      inputs: Object.freeze(this.recordingInputs.map((input) => Object.freeze({ ...input }))),
    });
    this.recordingInputs = null;
    this.recordingStartSignature = null;
    return replay;
  }

  playReplay(replay: RuntimeReplay): RuntimeSnapshot {
    if (replay.schema !== "tokipona.runtime-replay.v0.1" || replay.fixedHz !== this.fixedHz) {
      throw new Error("replay is incompatible with this runtime");
    }
    if (this.stateSignature() !== replay.startSignature) {
      throw new Error("replay start state does not match this runtime");
    }
    for (const input of replay.inputs) this.stepFixed(normalizeInput(input));
    return this.snapshot();
  }

  private stepFixed(input: NormalizedRuntimeInput): void {
    if (this.recordingInputs) this.recordingInputs.push(Object.freeze({ ...input }));
    this.tickId += 1;
    if (this.exitCooldown > 0) this.exitCooldown -= 1;

    const motion = stepPlayerMotion({
      state: this.player,
      body: this.registry.playerBody,
      input,
      previousJump: this.previousJump,
      fixedSeconds: this.fixedSeconds,
      collides: (bounds) => this.collidesAt(this.sceneId, bounds),
    });
    this.player.x = motion.state.x;
    this.player.y = motion.state.y;
    this.player.velocityX = motion.state.velocityX;
    this.player.velocityY = motion.state.velocityY;
    this.player.grounded = motion.state.grounded;
    this.previousJump = motion.previousJump;
    this.updateParticles();
    this.checkSceneExit();
    this.camera = this.followCamera();
  }

  private checkSceneExit(): void {
    if (this.exitCooldown > 0) return;
    const scene = this.registry.get(this.sceneId);
    const playerBounds = this.playerBounds({ x: this.player.x, y: this.player.y });
    const exit = scene.exits.find((candidate) => intersects(playerBounds, candidate.bounds));
    if (!exit) return;

    const fromSceneId = this.sceneId;
    const target = this.registry.entrance(exit.targetSceneId, exit.targetEntranceId);
    const recovered = this.findRecoveryPosition(exit.targetSceneId, target.position);
    if (!recovered) return;
    this.sceneId = exit.targetSceneId;
    this.player.x = recovered.x;
    this.player.y = recovered.y;
    this.player.velocityY = 0;
    this.player.grounded = false;
    this.exitCooldown = EXIT_COOLDOWN_TICKS;
    this.particles.clear();
    this.sceneTransitions.push(Object.freeze({
      fromSceneId,
      toSceneId: exit.targetSceneId,
      exitId: exit.id,
      targetEntranceId: exit.targetEntranceId,
      tick: this.tickId,
    }));
  }

  private updateParticles(): void {
    for (const particle of this.particles.values()) {
      particle.x += particle.velocityX * this.fixedSeconds;
      particle.y += particle.velocityY * this.fixedSeconds;
      particle.ttlTicks -= 1;
      if (particle.ttlTicks <= 0) this.particles.delete(particle.id);
    }
  }

  private persistentState(sceneId: string): ScenePersistentState {
    this.registry.get(sceneId);
    let state = this.persistentScenes.get(sceneId);
    if (!state) {
      state = { values: new Map(), tileSolidity: new Map() };
      this.persistentScenes.set(sceneId, state);
    }
    return state;
  }

  private tileSolid(sceneId: string, tileX: number, tileY: number): boolean {
    const override = this.persistentState(sceneId).tileSolidity.get(tileKey(tileX, tileY));
    return override ?? this.registry.isStaticSolid(sceneId, tileX, tileY);
  }

  private collidesAt(sceneId: string, bounds: Aabb): boolean {
    const epsilon = 1e-7;
    const dimensions = this.registry.dimensionsPx(sceneId);
    if (
      bounds.x < 0 || bounds.y < 0 ||
      bounds.x + bounds.width > dimensions.x ||
      bounds.y + bounds.height > dimensions.y
    ) return true;

    const left = Math.floor(bounds.x / WORLD_TILE_SIZE_PX);
    const right = Math.floor((bounds.x + bounds.width - epsilon) / WORLD_TILE_SIZE_PX);
    const top = Math.floor(bounds.y / WORLD_TILE_SIZE_PX);
    const bottom = Math.floor((bounds.y + bounds.height - epsilon) / WORLD_TILE_SIZE_PX);
    for (let tileY = top; tileY <= bottom; tileY += 1) {
      for (let tileX = left; tileX <= right; tileX += 1) {
        if (this.tileSolid(sceneId, tileX, tileY)) return true;
      }
    }
    return false;
  }

  private playerBounds(position: Vec2): Aabb {
    return { ...position, ...this.registry.playerBody };
  }

  private findRecoveryPosition(sceneId: string, preferred: Vec2): Vec2 | null {
    const candidates: Vec2[] = [{ ...preferred }];
    const simulationStep = 2;
    const maximumRadius = WORLD_TILE_SIZE_PX * 8;
    for (let radius = simulationStep; radius <= maximumRadius; radius += simulationStep) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += simulationStep) {
        candidates.push({ x: preferred.x + offsetX, y: preferred.y - radius });
        candidates.push({ x: preferred.x + offsetX, y: preferred.y + radius });
      }
      for (let offsetY = -radius + simulationStep; offsetY < radius; offsetY += simulationStep) {
        candidates.push({ x: preferred.x - radius, y: preferred.y + offsetY });
        candidates.push({ x: preferred.x + radius, y: preferred.y + offsetY });
      }
    }
    for (const candidate of candidates) {
      if (!this.collidesAt(sceneId, this.playerBounds(candidate)) && this.hasRecoveryRoute(sceneId, candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private hasRecoveryRoute(sceneId: string, position: Vec2): boolean {
    const scene = this.registry.get(sceneId);
    if (scene.exits.length === 0) return !this.collidesAt(sceneId, this.playerBounds(position));
    const widthTiles = scene.collisionRows[0]!.length;
    const heightTiles = scene.collisionRows.length;
    const startX = clamp(Math.floor((position.x + this.registry.playerBody.width / 2) / WORLD_TILE_SIZE_PX), 0, widthTiles - 1);
    const startY = clamp(Math.floor((position.y + this.registry.playerBody.height / 2) / WORLD_TILE_SIZE_PX), 0, heightTiles - 1);
    const queue: Array<readonly [number, number]> = [[startX, startY]];
    const visited = new Set<string>();
    for (let index = 0; index < queue.length; index += 1) {
      const [tileX, tileY] = queue[index]!;
      const key = tileKey(tileX, tileY);
      if (visited.has(key)) continue;
      visited.add(key);
      const navPosition = {
        x: tileX * WORLD_TILE_SIZE_PX + (WORLD_TILE_SIZE_PX - this.registry.playerBody.width) / 2,
        y: tileY * WORLD_TILE_SIZE_PX + WORLD_TILE_SIZE_PX - this.registry.playerBody.height,
      };
      const bounds = this.playerBounds(navPosition);
      if (this.collidesAt(sceneId, bounds)) continue;
      if (scene.exits.some((exit) => intersects(bounds, exit.bounds))) return true;
      const neighbors: Array<readonly [number, number]> = [
        [tileX - 1, tileY], [tileX + 1, tileY], [tileX, tileY - 1], [tileX, tileY + 1],
      ];
      for (const [neighborX, neighborY] of neighbors) {
        if (
          neighborX >= 0 && neighborY >= 0 &&
          neighborX < widthTiles && neighborY < heightTiles &&
          !visited.has(tileKey(neighborX, neighborY))
        ) queue.push([neighborX, neighborY]);
      }
    }
    return false;
  }

  private followCamera(): CameraState {
    const dimensions = this.registry.dimensionsPx(this.sceneId);
    const centeredX = this.player.x + this.registry.playerBody.width / 2 - this.viewport.x / 2;
    const centeredY = this.player.y + this.registry.playerBody.height / 2 - this.viewport.y / 2;
    return Object.freeze({
      x: clamp(centeredX, 0, Math.max(0, dimensions.x - this.viewport.x)),
      y: clamp(centeredY, 0, Math.max(0, dimensions.y - this.viewport.y)),
      width: this.viewport.x,
      height: this.viewport.y,
    });
  }

  private stateSignature(): string {
    return JSON.stringify({
      tick: this.tickId,
      sceneId: this.sceneId,
      player: [this.player.x, this.player.y, this.player.velocityX, this.player.velocityY, this.player.grounded],
      checkpoint: this.checkpoint,
      persistent: [...this.persistentScenes.keys()].sort().map((sceneId) => this.persistentDiff(sceneId)),
    });
  }
}
