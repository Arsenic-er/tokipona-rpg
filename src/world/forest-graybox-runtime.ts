import type { RuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import { clamp, type Aabb, type Vec2 } from "../runtime/geometry";
import { stepPlayerMotion, type PlayerMotionState } from "../runtime/player-motion";
import type {
  CameraState,
  NormalizedRuntimeInput,
  PlayerState,
  RuntimeInput,
} from "../runtime/runtime";
import { DEFAULT_PLAYER_BODY, type PlayerBody } from "../runtime/scene";
import { ForestChunkStream, type ForestChunkStreamOptions } from "./forest-chunk-stream";
import { type ForestRegion, validateForestRegion } from "./forest-region-generator";

export interface ForestGrayboxCheckpoint {
  readonly id: string;
  readonly position: Vec2;
  readonly tick: number;
}

export interface ForestGrayboxSnapshot {
  readonly tick: number;
  readonly seed: string;
  readonly topologyDigest: `sha256:${string}`;
  readonly player: PlayerState;
  readonly camera: CameraState;
  readonly checkpoint: ForestGrayboxCheckpoint;
  readonly stateDigest: `sha256:${string}`;
}

export interface ForestGrayboxCameraStepInput {
  readonly previous: CameraState;
  readonly player: PlayerState;
  readonly input: NormalizedRuntimeInput;
  readonly regionBoundsPx: Readonly<{ width: number; height: number }>;
  readonly viewportPx: Readonly<{ width: number; height: number }>;
}

export type ForestGrayboxCameraStep = (input: ForestGrayboxCameraStepInput) => CameraState;

export interface ForestGrayboxRuntimeOptions extends ForestChunkStreamOptions {
  readonly manifest: RuntimeForestSpatialManifest;
  readonly region: ForestRegion;
  readonly initialPosition?: Vec2;
  readonly playerBody?: PlayerBody;
  readonly fixedHz?: number;
  readonly cameraStep?: ForestGrayboxCameraStep;
}

const MAX_FRAME_SECONDS = 1;
const EPSILON = 1e-9;

export class ForestGrayboxRuntime {
  readonly fixedHz: number;
  readonly fixedSeconds: number;
  readonly seed: string;
  readonly topologyDigest: `sha256:${string}`;
  readonly chunkStream: ForestChunkStream;

  private readonly manifest: RuntimeForestSpatialManifest;
  private readonly body: PlayerBody;
  private readonly cameraStep: ForestGrayboxCameraStep;
  private readonly recoveryClearanceVolumes: readonly ForestRegion["criticalRouteClearances"][number]["volumesPx"][number][];
  private player: PlayerMotionState;
  private previousJump = false;
  private tickId = 0;
  private accumulatorSeconds = 0;
  private checkpoint: ForestGrayboxCheckpoint;
  private camera: CameraState;

  public constructor(options: ForestGrayboxRuntimeOptions) {
    validateForestRegion(options.manifest, options.region);
    this.manifest = options.manifest;
    this.seed = options.region.seed;
    this.topologyDigest = options.region.topologyDigest;
    this.fixedHz = options.fixedHz ?? 60;
    if (!Number.isInteger(this.fixedHz) || this.fixedHz <= 0 || this.fixedHz > 240) {
      throw new Error("fixedHz must be an integer from 1 through 240");
    }
    this.fixedSeconds = 1 / this.fixedHz;
    this.body = Object.freeze({ ...(options.playerBody ?? DEFAULT_PLAYER_BODY) });
    if (this.body.width <= 0 || this.body.height <= 0) {
      throw new Error("player body dimensions must be positive");
    }
    const arrival = this.manifest.anchors.find((anchor) => anchor.anchorId === "forest.arrival")!;
    const initialPosition = options.initialPosition ?? { x: arrival.positionPx[0], y: arrival.positionPx[1] };
    if (!Number.isFinite(initialPosition.x) || !Number.isFinite(initialPosition.y)) {
      throw new Error("initialPosition must be finite");
    }
    this.player = {
      x: initialPosition.x,
      y: initialPosition.y,
      velocityX: 0,
      velocityY: 0,
      grounded: false,
    };
    this.chunkStream = new ForestChunkStream(options.manifest, options.region, {
      maxRetainedChunks: options.maxRetainedChunks,
    });
    this.recoveryClearanceVolumes = arrivalRecoveryComponent(options.region, this.body);
    this.cameraStep = options.cameraStep ?? centeredForestCameraStep;
    this.checkpoint = freezeCheckpoint({
      id: "checkpoint.initial",
      position: initialPosition,
      tick: 0,
    });
    const viewport = this.manifest.viewportPx;
    this.camera = this.nextCamera(
      { x: 0, y: 0, width: viewport.width, height: viewport.height },
      { moveX: 0, jump: false },
    );
  }

  public advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): number {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > MAX_FRAME_SECONDS) {
      throw new Error(`elapsedSeconds must be between 0 and ${MAX_FRAME_SECONDS}`);
    }
    this.accumulatorSeconds += elapsedSeconds;
    const normalized = normalizeInput(input);
    let steps = 0;
    while (this.accumulatorSeconds + EPSILON >= this.fixedSeconds) {
      this.accumulatorSeconds -= this.fixedSeconds;
      if (this.accumulatorSeconds < 0 && this.accumulatorSeconds > -EPSILON) this.accumulatorSeconds = 0;
      this.stepFixed(normalized);
      steps += 1;
    }
    return steps;
  }

  public advanceTicks(ticks: number, input: RuntimeInput = {}): void {
    if (!Number.isInteger(ticks) || ticks < 0) throw new Error("ticks must be a non-negative integer");
    const normalized = normalizeInput(input);
    for (let tick = 0; tick < ticks; tick += 1) this.stepFixed(normalized);
  }

  public snapshot(): ForestGrayboxSnapshot {
    const player = freezePlayer(this.player, this.body);
    const camera = Object.freeze({ ...this.camera });
    const checkpoint = freezeCheckpoint(this.checkpoint);
    const digestPayload = {
      tick: this.tickId,
      topologyDigest: this.topologyDigest,
      player: {
        position: player.position,
        velocity: player.velocity,
        grounded: player.grounded,
        body: player.body,
      },
      camera,
    };
    return Object.freeze({
      tick: this.tickId,
      seed: this.seed,
      topologyDigest: this.topologyDigest,
      player,
      camera,
      checkpoint,
      stateDigest: sha256Canonical(digestPayload as unknown as JsonValue),
    });
  }

  public setCheckpoint(id: string): ForestGrayboxCheckpoint {
    if (!id.trim()) throw new Error("checkpoint id must not be empty");
    const position = { x: this.player.x, y: this.player.y };
    if (this.chunkStream.isSolid({ ...position, ...this.body }) || !this.hasRecoveryRoute(position)) {
      throw new Error("checkpoint position has no safe recovery route");
    }
    this.checkpoint = freezeCheckpoint({ id, position, tick: this.tickId });
    return freezeCheckpoint(this.checkpoint);
  }

  public resetToCheckpoint(): ForestGrayboxSnapshot {
    if (
      this.chunkStream.isSolid({ ...this.checkpoint.position, ...this.body }) ||
      !this.hasRecoveryRoute(this.checkpoint.position)
    ) {
      throw new Error("checkpoint position has no safe recovery route");
    }
    this.player = {
      x: this.checkpoint.position.x,
      y: this.checkpoint.position.y,
      velocityX: 0,
      velocityY: 0,
      grounded: false,
    };
    this.previousJump = false;
    this.accumulatorSeconds = 0;
    this.camera = this.nextCamera(this.camera, { moveX: 0, jump: false });
    return this.snapshot();
  }

  private stepFixed(input: NormalizedRuntimeInput): void {
    this.tickId += 1;
    const motion = stepPlayerMotion({
      state: this.player,
      body: this.body,
      input,
      previousJump: this.previousJump,
      fixedSeconds: this.fixedSeconds,
      collides: (bounds) => this.chunkStream.isSolid(bounds),
    });
    this.player = motion.state;
    this.previousJump = motion.previousJump;
    this.camera = this.nextCamera(this.camera, input);
  }

  private nextCamera(previous: CameraState, input: NormalizedRuntimeInput): CameraState {
    const viewport = this.manifest.viewportPx;
    const candidate = this.cameraStep({
      previous,
      player: freezePlayer(this.player, this.body),
      input,
      regionBoundsPx: this.manifest.regionBoundsPx,
      viewportPx: viewport,
    });
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
      throw new Error("camera step must return a finite camera");
    }
    return Object.freeze({
      x: clamp(candidate.x, 0, this.manifest.regionBoundsPx.width - viewport.width),
      y: clamp(candidate.y, 0, this.manifest.regionBoundsPx.height - viewport.height),
      width: viewport.width,
      height: viewport.height,
    });
  }

  private hasRecoveryRoute(position: Vec2): boolean {
    return aabbCoveredByVolumes(
      { ...position, ...this.body },
      this.recoveryClearanceVolumes,
    );
  }
}

export const centeredForestCameraStep: ForestGrayboxCameraStep = ({
  player,
  regionBoundsPx,
  viewportPx,
}) => Object.freeze({
  x: clamp(
    player.position.x + player.body.width / 2 - viewportPx.width / 2,
    0,
    regionBoundsPx.width - viewportPx.width,
  ),
  y: clamp(
    player.position.y + player.body.height / 2 - viewportPx.height / 2,
    0,
    regionBoundsPx.height - viewportPx.height,
  ),
  width: viewportPx.width,
  height: viewportPx.height,
});

function normalizeInput(input: RuntimeInput): NormalizedRuntimeInput {
  return Object.freeze({
    moveX: input.moveX === undefined || input.moveX === 0 ? 0 : input.moveX < 0 ? -1 : 1,
    jump: input.jump === true,
  });
}

function freezePlayer(state: PlayerMotionState, body: PlayerBody): PlayerState {
  return Object.freeze({
    position: Object.freeze({ x: state.x, y: state.y }),
    velocity: Object.freeze({ x: state.velocityX, y: state.velocityY }),
    grounded: state.grounded,
    body,
  });
}

function freezeCheckpoint(checkpoint: ForestGrayboxCheckpoint): ForestGrayboxCheckpoint {
  return Object.freeze({
    id: checkpoint.id,
    position: Object.freeze({ ...checkpoint.position }),
    tick: checkpoint.tick,
  });
}

function arrivalRecoveryComponent(
  region: ForestRegion,
  body: PlayerBody,
): readonly ForestRegion["criticalRouteClearances"][number]["volumesPx"][number][] {
  const adjacent = new Map<string, string[]>();
  for (const link of region.cellLinks) {
    if (link.capability !== null) continue;
    const from = adjacent.get(link.fromCellId) ?? [];
    from.push(link.toCellId);
    adjacent.set(link.fromCellId, from);
    const to = adjacent.get(link.toCellId) ?? [];
    to.push(link.fromCellId);
    adjacent.set(link.toCellId, to);
  }
  const found = new Set<string>([region.anchorCellIds["forest.arrival"]!]);
  const queue = [...found];
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of adjacent.get(queue[index]!) ?? []) {
      if (found.has(next)) continue;
      found.add(next);
      queue.push(next);
    }
  }
  const accessibleEdgeIds = new Set(region.routeCorridors
    .filter((corridor) => corridor.capability === null && corridor.cellIds.some((cellId) => found.has(cellId)))
    .map((corridor) => corridor.edgeId));
  const volumes = region.criticalRouteClearances
    .filter((clearance) => accessibleEdgeIds.has(clearance.edgeId))
    .flatMap((clearance) => clearance.volumesPx);
  const arrival = region.traversableCells.find((cell) => cell.cellId === region.anchorCellIds["forest.arrival"])!;
  const connectedIndexes = new Set<number>();
  const volumeQueue: number[] = [];
  volumes.forEach((volume, index) => {
    if (pointInside(volume, arrival.positionPx)) {
      connectedIndexes.add(index);
      volumeQueue.push(index);
    }
  });
  for (let queueIndex = 0; queueIndex < volumeQueue.length; queueIndex += 1) {
    const currentIndex = volumeQueue[queueIndex]!;
    for (let candidateIndex = 0; candidateIndex < volumes.length; candidateIndex += 1) {
      if (
        connectedIndexes.has(candidateIndex) ||
        !supportsBodyPassage(volumes[currentIndex]!, volumes[candidateIndex]!, body)
      ) continue;
      connectedIndexes.add(candidateIndex);
      volumeQueue.push(candidateIndex);
    }
  }
  return Object.freeze(volumes.filter((_, index) => connectedIndexes.has(index)));
}

function aabbCoveredByVolumes(
  bounds: Aabb,
  volumes: readonly ForestRegion["criticalRouteClearances"][number]["volumesPx"][number][],
): boolean {
  const intersecting = volumes.filter((volume) => overlapsAabb(bounds, volume));
  if (intersecting.length === 0) return false;
  const xStops = uniqueSorted([
    bounds.x,
    bounds.x + bounds.width,
    ...intersecting.flatMap((volume) => [volume.x, volume.x + volume.width]
      .filter((value) => value > bounds.x && value < bounds.x + bounds.width)),
  ]);
  const yStops = uniqueSorted([
    bounds.y,
    bounds.y + bounds.height,
    ...intersecting.flatMap((volume) => [volume.y, volume.y + volume.height]
      .filter((value) => value > bounds.y && value < bounds.y + bounds.height)),
  ]);
  for (let xIndex = 0; xIndex < xStops.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < yStops.length - 1; yIndex += 1) {
      const sample = {
        x: (xStops[xIndex]! + xStops[xIndex + 1]!) / 2,
        y: (yStops[yIndex]! + yStops[yIndex + 1]!) / 2,
      };
      if (!intersecting.some((volume) => pointInside(volume, sample))) return false;
    }
  }
  return true;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function pointInside(rect: Aabb, point: Vec2): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
}

function overlapsAabb(left: Aabb, right: Aabb): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width &&
    left.y < right.y + right.height && right.y < left.y + left.height;
}

function supportsBodyPassage(left: Aabb, right: Aabb, body: PlayerBody): boolean {
  const overlapWidth = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const overlapHeight = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return overlapWidth >= body.width && overlapHeight >= body.height;
}
