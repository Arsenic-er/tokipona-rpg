import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeForestSpatialManifest,
  type RuntimeForestSpatialManifest,
} from "../content/runtime-forest-spatial-manifest";
import {
  projectForestSpatialLocation,
  type ForestSpatialLocation,
} from "../game/forest-spatial-projection";
import type { RuntimeInput } from "../runtime";
import {
  ForestGrayboxRuntime,
  type ForestGrayboxCheckpoint,
  type ForestGrayboxSnapshot,
} from "../world/forest-graybox-runtime";
import type { ForestMaterialChunk } from "../world/forest-chunk-stream";
import { generateForestRegion, type ForestRegion } from "../world/forest-region-generator";

export interface ForestGrayboxControllerOptions {
  readonly seed: string;
}

export interface ForestGrayboxDiagnostics {
  readonly regionId: "valley_prologue";
  readonly profileId: "forest_side_scroll.v0.1";
  readonly seed: string;
  readonly topologyDigest: `sha256:${string}`;
  readonly cache: Readonly<{ materialized: number; retained: number }>;
}

export interface ForestGrayboxControllerSnapshot {
  readonly runtime: ForestGrayboxSnapshot;
  readonly location: ForestSpatialLocation;
  readonly streamedChunks: readonly ForestMaterialChunk[];
  readonly diagnostics: ForestGrayboxDiagnostics;
}

interface ForestGrayboxControllerState {
  readonly manifest: RuntimeForestSpatialManifest;
  readonly region: ForestRegion;
  readonly runtime: ForestGrayboxRuntime;
}

/** Browser-facing, graybox-only owner. It has no GameSession or semantic action bridge. */
export class ForestGrayboxController {
  private constructor(private state: ForestGrayboxControllerState) {}

  public static fresh(options: ForestGrayboxControllerOptions): ForestGrayboxController {
    validateSeedOptions(options);
    return new ForestGrayboxController(createState(options.seed));
  }

  public advanceTicks(ticks: number, input: RuntimeInput = {}): ForestGrayboxControllerSnapshot {
    validateRuntimeInput(input);
    this.state.runtime.advanceTicks(ticks, input);
    return this.snapshot();
  }

  public advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): ForestGrayboxControllerSnapshot {
    validateRuntimeInput(input);
    this.state.runtime.advanceFrame(elapsedSeconds, input);
    return this.snapshot();
  }

  public snapshot(): ForestGrayboxControllerSnapshot {
    const runtime = this.state.runtime.snapshot();
    const streamedChunks = this.state.runtime.chunkStream.visible(runtime.camera);
    const location = projectForestSpatialLocation(this.state.manifest, runtime);
    return Object.freeze({
      runtime,
      location,
      streamedChunks,
      diagnostics: Object.freeze({
        regionId: "valley_prologue" as const,
        profileId: this.state.manifest.profileId,
        seed: runtime.seed,
        topologyDigest: runtime.topologyDigest,
        cache: this.state.runtime.chunkStream.cacheStats(),
      }),
    });
  }

  public setCheckpoint(id: string): ForestGrayboxCheckpoint {
    return this.state.runtime.setCheckpoint(id);
  }

  public resetToCheckpoint(): ForestGrayboxControllerSnapshot {
    this.state.runtime.resetToCheckpoint();
    return this.snapshot();
  }

  public reset(options: ForestGrayboxControllerOptions): ForestGrayboxControllerSnapshot {
    validateSeedOptions(options);
    this.state = createState(options.seed);
    return this.snapshot();
  }
}

function createState(seed: string): ForestGrayboxControllerState {
  const manifest = readRuntimeForestSpatialManifest(generatedRuntimeArtifact);
  const region = generateForestRegion(manifest, seed);
  const runtime = new ForestGrayboxRuntime({ manifest, region });
  return Object.freeze({ manifest, region, runtime });
}

function validateSeedOptions(options: ForestGrayboxControllerOptions): void {
  if (typeof options !== "object" || options === null || Array.isArray(options) ||
      Object.keys(options).length !== 1 || !("seed" in options) ||
      typeof options.seed !== "string" || options.seed.trim().length === 0) {
    throw new Error("forest graybox options must contain a non-empty seed only");
  }
}

function validateRuntimeInput(input: RuntimeInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "moveX" && key !== "jump") ||
      (input.moveX !== undefined && !Number.isFinite(input.moveX)) ||
      (input.jump !== undefined && typeof input.jump !== "boolean")) {
    throw new Error("forest graybox accepts RuntimeInput movement fields only");
  }
}
