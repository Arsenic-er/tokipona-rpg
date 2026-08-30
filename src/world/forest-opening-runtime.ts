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
  ForestGrayboxRuntime,
  type ForestGrayboxCheckpoint,
  type ForestGrayboxSave,
  type ForestGrayboxSnapshot,
} from "./forest-graybox-runtime";
import { generateForestRegion } from "./forest-region-generator";

const OPENING_SCHEMA = "tokipona.forest-opening-runtime.v0.1" as const;
const ECOLOGY_SCHEMA = "tokipona.forest-opening-ecology.v0.1" as const;
const INITIAL_WORLD_MINUTE = 360;
const TICKS_PER_WORLD_MINUTE = 240;

export interface ForestOpeningEcologySave {
  readonly schema: typeof ECOLOGY_SCHEMA;
  readonly revision: number;
  readonly tick: number;
}

export interface ForestOpeningRuntimeSave {
  readonly schema: typeof OPENING_SCHEMA;
  readonly manifestDigest: `sha256:${string}`;
  readonly spatial: ForestGrayboxSave;
  readonly obstacle: ForestOpeningObstacleSave;
  readonly ecology: ForestOpeningEcologySave;
  readonly worldMinute: number;
  readonly checksum: `sha256:${string}`;
}

export interface ForestOpeningEcologySnapshot extends ForestOpeningEcologySave {
  readonly stateDigest: `sha256:${string}`;
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
  private ecologyRevision: number;

  private constructor(
    openingManifest: RuntimeForestOpeningManifest,
    spatialRuntime: ForestGrayboxRuntime,
    obstacle: ForestOpeningObstacle,
    ecologyRevision: number,
  ) {
    this.openingManifest = openingManifest;
    this.spatialRuntime = spatialRuntime;
    this.obstacle = obstacle;
    this.ecologyRevision = ecologyRevision;
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
      0,
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
    const expectedWorldMinute = worldMinuteAtTick(save.spatial.tick);
    if (save.worldMinute !== expectedWorldMinute || save.ecology.tick !== save.spatial.tick) {
      throw new Error("forest opening save timeline is invalid");
    }
    return new ForestOpeningRuntime(
      options.openingManifest,
      spatial,
      ForestOpeningObstacle.fromSave(options.openingManifest, save.obstacle),
      save.ecology.revision,
    );
  }

  public advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): number {
    const steps = this.spatialRuntime.advanceFrame(elapsedSeconds, input);
    this.obstacle.advanceTicks(steps);
    return steps;
  }

  public advanceTicks(ticks: number, input: RuntimeInput = {}): ForestOpeningSnapshot {
    this.spatialRuntime.advanceTicks(ticks, input);
    this.obstacle.advanceTicks(ticks);
    return this.snapshot();
  }

  public interact(
    operationId: string,
    request: ForestOpeningInteraction,
    expectedObstacleRevision: number,
  ): ForestOpeningObstacleActionResult {
    const player = this.spatialRuntime.snapshot().player;
    return this.obstacle.applyInteraction(operationId, request, {
      actorBounds: { ...player.position, ...player.body },
      expectedRevision: expectedObstacleRevision,
    });
  }

  public setCheckpoint(id: string): ForestGrayboxCheckpoint {
    return this.spatialRuntime.setCheckpoint(id);
  }

  public resetToCheckpoint(): ForestOpeningSnapshot {
    this.spatialRuntime.resetToCheckpoint();
    this.obstacle.resetToCommittedState();
    return this.snapshot();
  }

  public snapshot(): ForestOpeningSnapshot {
    const spatial = this.spatialRuntime.snapshot();
    const obstacle = this.obstacle.snapshot();
    const ecology = freezeEcologySnapshot({
      schema: ECOLOGY_SCHEMA,
      revision: this.ecologyRevision,
      tick: spatial.tick,
    });
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
      ecology: freezeEcology({
        schema: ECOLOGY_SCHEMA,
        revision: this.ecologyRevision,
        tick: snapshot.tick,
      }),
      worldMinute: snapshot.worldMinute,
    };
    return Object.freeze({ ...body, checksum: sha256Canonical(body as unknown as JsonValue) });
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
  const ecology = readEcologySave(raw.ecology);
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

function readEcologySave(value: unknown): ForestOpeningEcologySave {
  const raw = record(value, "forest opening ecology save");
  exactKeys(raw, ["schema", "revision", "tick"], "forest opening ecology save");
  if (raw.schema !== ECOLOGY_SCHEMA || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !Number.isSafeInteger(raw.tick) || (raw.tick as number) < 0) {
    throw new Error("forest opening ecology save is invalid");
  }
  return freezeEcology(raw as unknown as ForestOpeningEcologySave);
}

function freezeEcology(value: ForestOpeningEcologySave): ForestOpeningEcologySave {
  return Object.freeze({ schema: ECOLOGY_SCHEMA, revision: value.revision, tick: value.tick });
}

function freezeEcologySnapshot(value: ForestOpeningEcologySave): ForestOpeningEcologySnapshot {
  const body = freezeEcology(value);
  return Object.freeze({ ...body, stateDigest: sha256Canonical(body as unknown as JsonValue) });
}

function worldMinuteAtTick(tick: number): number {
  return INITIAL_WORLD_MINUTE + tick / TICKS_PER_WORLD_MINUTE;
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
