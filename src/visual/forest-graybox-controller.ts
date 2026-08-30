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
import { FOREST_MATERIAL, type ForestMaterialChunk } from "../world/forest-chunk-stream";
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
  readonly laterGates: readonly Readonly<{
    anchorId: "forest.safe_range" | "forest.old_mine";
    blocked: boolean;
  }>[];
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

export const FOREST_GRAYBOX_AUDIT_CATCHUP_SECONDS = 1 as const;

export function advanceForestGrayboxAuditFrame(
  controller: ForestGrayboxController,
  elapsedSeconds: number,
  input: RuntimeInput = {},
): ForestGrayboxControllerSnapshot {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("forest graybox audit elapsedSeconds must be finite and non-negative");
  }
  return controller.advanceFrame(
    Math.min(FOREST_GRAYBOX_AUDIT_CATCHUP_SECONDS, elapsedSeconds),
    input,
  );
}

/** Browser-facing, graybox-only owner. It has no GameSession or semantic action bridge. */
export class ForestGrayboxController {
  private observedDistrictId: string;

  private constructor(private state: ForestGrayboxControllerState) {
    this.observedDistrictId = locationFor(state).districtId;
  }

  public static fresh(options: ForestGrayboxControllerOptions): ForestGrayboxController {
    validateSeedOptions(options);
    return new ForestGrayboxController(createState(options.seed));
  }

  public advanceTicks(ticks: number, input: RuntimeInput = {}): ForestGrayboxControllerSnapshot {
    validateRuntimeInput(input);
    this.state.runtime.advanceTicks(ticks, input);
    this.registerReachedDistrictCheckpoint();
    return this.snapshot();
  }

  public advanceFrame(elapsedSeconds: number, input: RuntimeInput = {}): ForestGrayboxControllerSnapshot {
    validateRuntimeInput(input);
    this.state.runtime.advanceFrame(elapsedSeconds, input);
    this.registerReachedDistrictCheckpoint();
    return this.snapshot();
  }

  public snapshot(): ForestGrayboxControllerSnapshot {
    const runtime = this.state.runtime.snapshot();
    const streamedChunks = this.state.runtime.chunkStream.visible(runtime.camera);
    const location = projectForestSpatialLocation(
      this.state.manifest,
      runtime,
      (bounds) => this.state.runtime.chunkStream.isSolid(bounds),
    );
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
        laterGates: laterGateDiagnostics(this.state),
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
    this.observedDistrictId = locationFor(this.state).districtId;
    return this.snapshot();
  }

  private registerReachedDistrictCheckpoint(): void {
    const location = locationFor(this.state);
    if (location.districtId === this.observedDistrictId) return;
    const checkpointDistricts = new Set(this.state.region.protectedZones
      .filter((zone) => zone.kind === "checkpoint_clearance")
      .map((zone) => zone.zoneId.replace(/\.checkpoint$/, "")));
    if (!checkpointDistricts.has(location.districtId)) {
      this.observedDistrictId = location.districtId;
      return;
    }
    if (!this.state.runtime.snapshot().player.grounded) return;
    try {
      this.state.runtime.setCheckpoint(`checkpoint.${location.districtId}`);
      this.observedDistrictId = location.districtId;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("safe recovery route")) throw error;
    }
  }
}

function locationFor(state: ForestGrayboxControllerState): ForestSpatialLocation {
  return projectForestSpatialLocation(
    state.manifest,
    state.runtime.snapshot(),
    (bounds) => state.runtime.chunkStream.isSolid(bounds),
  );
}

function laterGateDiagnostics(
  state: ForestGrayboxControllerState,
): ForestGrayboxDiagnostics["laterGates"] {
  return Object.freeze(([
    ["forest.safe_range", "sealed_safe_range_gate"],
    ["forest.old_mine", "sealed_old_mine_gate"],
  ] as const).map(([anchorId, kind]) => {
    const gate = state.region.terrainPrimitives.find((primitive) => primitive.kind === kind);
    if (!gate) throw new Error(`forest graybox later gate is missing: ${anchorId}`);
    const samples = [
      [gate.boundsPx.x, gate.boundsPx.y],
      [gate.boundsPx.x + gate.boundsPx.width - 1, gate.boundsPx.y],
      [gate.boundsPx.x, gate.boundsPx.y + gate.boundsPx.height - 1],
      [gate.boundsPx.x + gate.boundsPx.width - 1, gate.boundsPx.y + gate.boundsPx.height - 1],
      [gate.boundsPx.x + gate.boundsPx.width / 2, gate.boundsPx.y + gate.boundsPx.height / 2],
    ] as const;
    return Object.freeze({
      anchorId,
      blocked: samples.every(([x, y]) =>
        state.runtime.chunkStream.materialAt(x, y) === FOREST_MATERIAL.protected_mass),
    });
  }));
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
