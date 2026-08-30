import { sha256Canonical, type JsonValue } from "../canonical-json";
import {
  isVerifiedRuntimeForestOpeningManifest,
  type RuntimeForestOpeningManifest,
} from "../content/runtime-forest-opening-manifest";
import {
  isVerifiedRuntimeForestSpatialManifest,
  type RuntimeForestSpatialManifest,
} from "../content/runtime-forest-spatial-manifest";
import type { RuntimeInput } from "../runtime";
import {
  ForestOpeningObstacle,
  type ForestOpeningInteraction,
  type ForestOpeningObstacleActionResult,
  type ForestOpeningObstacleSave,
  type ForestOpeningObstacleSnapshot,
} from "./forest-opening-obstacle";
import {
  ForestOpeningEcology,
  type ForestOpeningEcologySave,
  type ForestOpeningEcologySnapshot,
  type ForestOpeningPerceptionFrame,
} from "./forest-opening-ecology";
import {
  ForestGrayboxRuntime,
  type ForestGrayboxCheckpoint,
  type ForestGrayboxSave,
  type ForestGrayboxSnapshot,
} from "./forest-graybox-runtime";
import { generateForestRegion } from "./forest-region-generator";

const OPENING_SCHEMA = "tokipona.forest-opening-runtime.v0.1" as const;
const INITIAL_WORLD_MINUTE = 360;
const TICKS_PER_WORLD_MINUTE = 240;

export interface ForestOpeningRuntimeSave {
  readonly schema: typeof OPENING_SCHEMA;
  readonly manifestDigest: `sha256:${string}`;
  readonly spatial: ForestGrayboxSave;
  readonly obstacle: ForestOpeningObstacleSave;
  readonly ecology: ForestOpeningEcologySave;
  readonly worldMinute: number;
  readonly checksum: `sha256:${string}`;
}

export interface ForestOpeningSnapshot {
  readonly tick: number;
  readonly worldMinute: number;
  readonly spatial: ForestGrayboxSnapshot;
  readonly obstacle: ForestOpeningObstacleSnapshot;
  readonly ecology: ForestOpeningEcologySnapshot;
  readonly stateDigest: `sha256:${string}`;
}

export interface ForestOpeningRuntimeFreshOptions {
  readonly openingManifest: RuntimeForestOpeningManifest;
  readonly spatialManifest: RuntimeForestSpatialManifest;
  readonly seed: string;
}

export interface ForestOpeningRuntimeRestoreOptions {
  readonly openingManifest: RuntimeForestOpeningManifest;
  readonly spatialManifest: RuntimeForestSpatialManifest;
}

export class ForestOpeningRuntime {
  private readonly openingManifest: RuntimeForestOpeningManifest;
  private readonly spatialRuntime: ForestGrayboxRuntime;
  private readonly obstacle: ForestOpeningObstacle;
  private readonly ecology: ForestOpeningEcology;

  private constructor(
    openingManifest: RuntimeForestOpeningManifest,
    spatialRuntime: ForestGrayboxRuntime,
    obstacle: ForestOpeningObstacle,
    ecology: ForestOpeningEcology,
  ) {
    this.openingManifest = openingManifest;
    this.spatialRuntime = spatialRuntime;
    this.obstacle = obstacle;
    this.ecology = ecology;
  }

  public static fresh(options: ForestOpeningRuntimeFreshOptions): ForestOpeningRuntime {
    assertVerifiedManifests(options.openingManifest, options.spatialManifest);
    if (!options.seed.trim()) throw new Error("forest opening seed must not be empty");
    const region = generateForestRegion(options.spatialManifest, options.seed);
    const spatial = new ForestGrayboxRuntime({ manifest: options.spatialManifest, region });
    return new ForestOpeningRuntime(
      options.openingManifest,
      spatial,
      ForestOpeningObstacle.fresh(options.openingManifest),
      ForestOpeningEcology.fresh(options.openingManifest, `${options.seed}:ecology`),
    );
  }

  public static fromSave(
    options: ForestOpeningRuntimeRestoreOptions,
    candidate: unknown,
  ): ForestOpeningRuntime {
    assertVerifiedManifests(options.openingManifest, options.spatialManifest);
    const save = readSave(candidate, options.openingManifest);
    if (save.manifestDigest !== options.openingManifest.sourceDigest) {
      throw new Error("forest opening save manifest mismatch");
    }
    const region = generateForestRegion(options.spatialManifest, save.spatial.seed);
    const spatial = ForestGrayboxRuntime.fromSave(
      { manifest: options.spatialManifest, region },
      save.spatial,
    );
    const obstacle = ForestOpeningObstacle.fromSave(options.openingManifest, save.obstacle);
    assertNoUnsolvedCrossing(options.openingManifest, save.spatial, obstacle.snapshot());
    const expectedWorldMinute = worldMinuteAtTick(save.spatial.tick);
    if (save.worldMinute !== expectedWorldMinute || save.ecology.tick !== save.spatial.tick ||
        obstacle.snapshot().materialPocket.tick !== save.spatial.tick) {
      throw new Error("forest opening save timeline is invalid");
    }
    return new ForestOpeningRuntime(
      options.openingManifest,
      spatial,
      obstacle,
      ForestOpeningEcology.fromSave(options.openingManifest, save.ecology),
    );
  }

  public advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): number {
    const steps = this.spatialRuntime.advanceFrame(elapsedSeconds, input, () => {
      this.ecology.advanceTicks(1, this.currentPerception());
    }, (bounds) => this.obstacle.blocksTraversal(bounds));
    this.obstacle.advanceTicks(steps);
    return steps;
  }

  public advanceTicks(ticks: number, input: RuntimeInput = {}): ForestOpeningSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("forest opening ticks must be non-negative");
    for (let tick = 0; tick < ticks; tick += 1) {
      this.spatialRuntime.advanceTicks(1, input, (bounds) => this.obstacle.blocksTraversal(bounds));
      this.ecology.advanceTicks(1, this.currentPerception());
    }
    this.obstacle.advanceTicks(ticks);
    return this.snapshot();
  }

  public interact(
    operationId: string,
    request: ForestOpeningInteraction,
    expectedObstacleRevision: number,
  ): ForestOpeningObstacleActionResult {
    const player = this.spatialRuntime.playerSnapshot();
    const result = this.obstacle.applyInteraction(operationId, request, {
      actorBounds: { ...player.position, ...player.body },
      expectedRevision: expectedObstacleRevision,
    });
    if (result.ok && !result.duplicate) {
      this.ecology.disturb(this.currentPerception([Object.freeze({
        position: Object.freeze({ ...player.position }),
        strength: request.kind === "enter_shallow_detour" ? 0.7 : 1,
      })]));
    }
    return result;
  }

  public setCheckpoint(id: string): ForestGrayboxCheckpoint {
    return this.spatialRuntime.setCheckpoint(id);
  }

  public resetToCheckpoint(): ForestOpeningSnapshot {
    this.spatialRuntime.resetToCheckpoint();
    const tick = this.spatialRuntime.snapshot().tick;
    this.obstacle.resetToCommittedState(tick);
    this.ecology.resetAtTick(tick);
    return this.snapshot();
  }

  public snapshot(): ForestOpeningSnapshot {
    const spatial = this.spatialRuntime.snapshot();
    const obstacle = this.obstacle.snapshot();
    const ecology = this.ecology.snapshot();
    const worldMinute = worldMinuteAtTick(spatial.tick);
    const stateDigest = sha256Canonical({
      manifestDigest: this.openingManifest.sourceDigest,
      worldMinute,
      spatialStateDigest: spatial.stateDigest,
      obstacleStateDigest: obstacle.stateDigest,
      ecologyStateDigest: ecology.stateDigest,
    });
    return Object.freeze({
      tick: spatial.tick,
      worldMinute,
      spatial,
      obstacle,
      ecology,
      stateDigest,
    });
  }

  public save(): ForestOpeningRuntimeSave {
    const snapshot = this.snapshot();
    const body = {
      schema: OPENING_SCHEMA,
      manifestDigest: this.openingManifest.sourceDigest,
      spatial: this.spatialRuntime.save(),
      obstacle: this.obstacle.save(),
      ecology: this.ecology.save(),
      worldMinute: snapshot.worldMinute,
    };
    return Object.freeze({ ...body, checksum: sha256Canonical(body as unknown as JsonValue) });
  }

  private currentPerception(
    soundEvents: ForestOpeningPerceptionFrame["soundEvents"] = Object.freeze([]),
  ): ForestOpeningPerceptionFrame {
    const player = this.spatialRuntime.snapshot().player;
    const movementSound = Math.abs(player.velocity.x) >= 0.1
      ? [Object.freeze({ position: Object.freeze({ ...player.position }), strength: 1 })]
      : [];
    return Object.freeze({
      playerPosition: player.position,
      playerVelocity: player.velocity,
      soundEvents: Object.freeze([...soundEvents, ...movementSound]),
    });
  }
}

function assertVerifiedManifests(
  opening: RuntimeForestOpeningManifest,
  spatial: RuntimeForestSpatialManifest,
): void {
  if (!isVerifiedRuntimeForestOpeningManifest(opening) || !isVerifiedRuntimeForestSpatialManifest(spatial)) {
    throw new Error("forest opening runtime requires verified manifests");
  }
  const spatialRoute = spatial.districts
    .filter(({ districtId }) => opening.districtIds.includes(districtId as never))
    .map(({ districtId, sceneId }) => [districtId, sceneId]);
  if (JSON.stringify(spatialRoute) !== JSON.stringify(opening.route.map(({ districtId, sceneId }) => [districtId, sceneId]))) {
    throw new Error("forest opening runtime route does not match spatial authority");
  }
}

function readSave(
  candidate: unknown,
  openingManifest: RuntimeForestOpeningManifest,
): ForestOpeningRuntimeSave {
  const raw = record(candidate, "forest opening save");
  exactKeys(raw, ["schema", "manifestDigest", "spatial", "obstacle", "ecology", "worldMinute", "checksum"], "forest opening save");
  if (raw.schema !== OPENING_SCHEMA) throw new Error("forest opening save schema is invalid");
  const checksum = sha(raw.checksum, "forest opening save checksum");
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "checksum"));
  if (sha256Canonical(body as JsonValue) !== checksum) throw new Error("forest opening save checksum mismatch");
  const manifestDigest = sha(raw.manifestDigest, "forest opening manifest digest");
  const spatial = readSpatialSave(raw.spatial);
  const obstacle = ForestOpeningObstacle.fromSave(openingManifest, raw.obstacle).save();
  const ecology = ForestOpeningEcology.fromSave(openingManifest, raw.ecology).save();
  if (!Number.isFinite(raw.worldMinute)) throw new Error("forest opening world minute is invalid");
  return Object.freeze({
    schema: OPENING_SCHEMA,
    manifestDigest,
    spatial,
    obstacle,
    ecology,
    worldMinute: raw.worldMinute as number,
    checksum,
  });
}

function readSpatialSave(value: unknown): ForestGrayboxSave {
  const raw = record(value, "forest opening spatial save");
  exactKeys(raw, ["schema", "seed", "topologyDigest", "fixedHz", "tick", "accumulatorSeconds", "previousJump", "player", "camera", "checkpoint"], "forest opening spatial save");
  exactKeys(record(raw.player, "forest opening player save"), ["x", "y", "velocityX", "velocityY", "grounded"], "forest opening player save");
  exactKeys(record(raw.camera, "forest opening camera save"), ["x", "y", "width", "height", "facing"], "forest opening camera save");
  const checkpoint = record(raw.checkpoint, "forest opening checkpoint save");
  exactKeys(checkpoint, ["id", "position", "tick"], "forest opening checkpoint save");
  exactKeys(record(checkpoint.position, "forest opening checkpoint position"), ["x", "y"], "forest opening checkpoint position");
  return structuredClone(raw) as unknown as ForestGrayboxSave;
}

function worldMinuteAtTick(tick: number): number {
  return INITIAL_WORLD_MINUTE + tick / TICKS_PER_WORLD_MINUTE;
}

function assertNoUnsolvedCrossing(
  manifest: RuntimeForestOpeningManifest,
  spatial: ForestGrayboxSave,
  obstacle: ForestOpeningObstacleSnapshot,
): void {
  if (obstacle.committedSolutionId !== null) return;
  const farEdge = manifest.obstacle.boundsPx.x + manifest.obstacle.boundsPx.width;
  const bodyWidth = 12;
  if (spatial.player.x + bodyWidth > farEdge + 1e-9 ||
      spatial.checkpoint.position.x + bodyWidth > farEdge + 1e-9) {
    throw new Error("forest opening unsolved crossing save is invalid");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function sha(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`${label} is invalid`);
  return value as `sha256:${string}`;
}
