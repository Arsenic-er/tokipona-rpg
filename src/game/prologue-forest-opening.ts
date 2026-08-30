import { sha256Canonical, type JsonValue } from "../canonical-json";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeForestOpeningManifest,
  type ForestOpeningSolutionId,
} from "../content/runtime-forest-opening-manifest";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import type { RuntimeInput } from "../runtime";
import type { Aabb } from "../runtime/geometry";
import { commitSessionProposal } from "../session/adapters";
import {
  type GameSessionSave,
  type GameSessionState,
} from "../session/game-session";
import {
  type ForestOpeningInteraction,
  type ForestOpeningObstacleFailureReason,
} from "../world/forest-opening-obstacle";
import {
  ForestOpeningRuntime,
  type ForestOpeningRuntimeSave,
  type ForestOpeningSnapshot,
} from "../world/forest-opening-runtime";
import {
  PROLOGUE_AREA_ID,
  PROLOGUE_ROUTE_FLAGS,
  PROLOGUE_STREAM_SCENE_ID,
} from "./prologue-arrival-stream";
import { PrologueFlowSession } from "./prologue-flow";

export const PROLOGUE_FOREST_OPENING_SAVE_SCHEMA = "tokipona.prologue-forest-opening.v0.1" as const;
const GLYPH_RECEIPT_ID = "forest-opening:glyph:word.telo" as const;
const FLOW_SYNC_TICK_LIMIT = 1_200;
const openingManifest = readRuntimeForestOpeningManifest(generatedRuntimeArtifact);
const spatialManifest = readRuntimeForestSpatialManifest(generatedRuntimeArtifact);

const SOLUTION_ROUTE_FLAG = Object.freeze({
  stone_steps: PROLOGUE_ROUTE_FLAGS.looseStonePushed,
  deadwood_bridge: PROLOGUE_ROUTE_FLAGS.rottenLogPlaced,
  shallow_detour: PROLOGUE_ROUTE_FLAGS.softSoilDug,
} satisfies Readonly<Record<ForestOpeningSolutionId, string>>);

const GLYPH_RECEIPT_HASH = sha256Canonical({
  manifestDigest: openingManifest.sourceDigest,
  wordId: openingManifest.glyphObservation.wordId,
  observationOnly: true,
  grantsMeaning: false,
  grantsPronunciation: false,
  grantsLearningEvidence: false,
  grantsSpellAccess: false,
});

export interface PrologueForestOpeningSave {
  readonly schema: typeof PROLOGUE_FOREST_OPENING_SAVE_SCHEMA;
  readonly manifestDigest: `sha256:${string}`;
  readonly session: GameSessionSave;
  readonly runtime: ForestOpeningRuntimeSave;
  readonly checksum: `sha256:${string}`;
}

export interface PrologueForestOpeningSnapshot {
  readonly mode: "forest_opening" | "settlement_perimeter";
  readonly session: GameSessionState;
  readonly runtime: ForestOpeningSnapshot;
  readonly storyRouteReady: boolean;
  readonly glyphObserved: boolean;
  readonly killCount: 0;
}

export type PrologueForestOpeningActionReason =
  | "committed"
  | "partial"
  | "duplicate"
  | "prerequisite_missing"
  | "out_of_range"
  | "stale_revision"
  | "blocked"
  | "solution_conflict"
  | "story_rejected"
  | "session_rejected";

export interface PrologueForestOpeningActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueForestOpeningActionReason;
  readonly snapshot: PrologueForestOpeningSnapshot;
}

export interface PrologueForestOpeningFreshOptions {
  readonly sessionId: string;
  readonly seed: string;
  readonly currentMp?: number;
  readonly maxMp?: number;
}

/**
 * Compatibility bridge for the opening vertical slice.
 *
 * Continuous-world physics is authoritative for proximity and route outcome;
 * PrologueFlowSession remains authoritative for every durable story, MP,
 * learning and checkpoint result. The legacy scene runtime is advanced only
 * inside bounded synchronization steps and never supplies physical proof.
 */
export class PrologueForestOpeningSession {
  private flow: PrologueFlowSession;
  private runtime: ForestOpeningRuntime;

  private constructor(flow: PrologueFlowSession, runtime: ForestOpeningRuntime) {
    this.flow = flow;
    this.runtime = runtime;
    this.assertConsistent();
  }

  public static fresh(options: PrologueForestOpeningFreshOptions): PrologueForestOpeningSession {
    if (!options.sessionId.trim() || !options.seed.trim()) throw new Error("forest opening IDs must not be empty");
    return new PrologueForestOpeningSession(
      PrologueFlowSession.fresh({
        sessionId: options.sessionId,
        currentMp: options.currentMp,
        maxMp: options.maxMp,
      }),
      ForestOpeningRuntime.fresh({ openingManifest, spatialManifest, seed: options.seed }),
    );
  }

  public static fromSave(candidate: unknown): PrologueForestOpeningSession {
    const save = readSave(candidate);
    return new PrologueForestOpeningSession(
      PrologueFlowSession.fromSave(save.session),
      ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, save.runtime),
    );
  }

  public advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueForestOpeningSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("forest opening ticks must be non-negative");
    if (this.snapshot().mode === "settlement_perimeter") return this.snapshot();
    this.runtime.advanceTicks(ticks, input);
    return this.snapshot();
  }

  public interact(
    operationId: string,
    request: ForestOpeningInteraction,
    expectedObstacleRevision: number,
  ): PrologueForestOpeningActionResult {
    requiredId(operationId, "operationId");
    const beforeSave = this.runtime.save();
    const beforeSolution = this.runtime.snapshot().obstacle.committedSolutionId;
    const physical = this.runtime.interact(operationId, request, expectedObstacleRevision);
    if (!physical.ok) return this.result(false, false, physical.reason);
    if (physical.duplicate) return this.result(true, true, "duplicate");
    const solution = physical.snapshot.committedSolutionId;
    if (solution === null || solution === beforeSolution) return this.result(true, false, "partial");

    const trial = PrologueFlowSession.fromSave(this.flow.toSave());
    if (!synchronizeToStream(trial) || !commitSemanticSolution(trial, solution)) {
      this.runtime = ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, beforeSave);
      return this.result(false, false, "story_rejected");
    }
    this.flow = trial;
    this.assertConsistent();
    return this.result(true, false, "committed");
  }

  public observeGlyph(operationId: string): PrologueForestOpeningActionResult {
    requiredId(operationId, "operationId");
    if (!nearPoint(this.actorBounds(), openingManifest.glyphObservation.positionPx, openingManifest.obstacle.interactionRadiusPx)) {
      return this.result(false, false, "out_of_range");
    }
    const current = this.flow.snapshot().session.receiptIndex[GLYPH_RECEIPT_ID];
    if (current) {
      if (current.domain !== "world" || current.payloadHash !== GLYPH_RECEIPT_HASH) {
        return this.result(false, false, "session_rejected");
      }
      return this.result(true, true, "duplicate");
    }
    const committed = commitSessionProposal(this.flow.session, {
      transactionId: operationId,
      drafts: [{
        eventId: `forest-opening:glyph:${operationId}`,
        type: "receipt_recorded",
        payload: {
          receiptId: GLYPH_RECEIPT_ID,
          domain: "world",
          payloadHash: GLYPH_RECEIPT_HASH,
        },
      }],
    });
    if (!committed.committed) return this.result(false, false, "session_rejected");
    this.flow = PrologueFlowSession.fromSave(committed.session.toSave());
    return this.result(true, false, "committed");
  }

  public enterSettlementPerimeter(operationId: string): PrologueForestOpeningActionResult {
    requiredId(operationId, "operationId");
    const current = this.snapshot();
    if (current.mode === "settlement_perimeter") return this.result(true, true, "duplicate");
    if (current.runtime.obstacle.committedSolutionId === null || !current.storyRouteReady) {
      return this.result(false, false, "prerequisite_missing");
    }
    if (!intersectsStrict(this.actorBounds(), openingManifest.obstacle.settlementEntranceBoundsPx)) {
      return this.result(false, false, "out_of_range");
    }
    const trial = PrologueFlowSession.fromSave(this.flow.toSave());
    if (!synchronizeToSettlement(trial)) return this.result(false, false, "story_rejected");
    try {
      const checkpoint = trial.setCheckpoint(operationId, openingManifest.completion.settlementCheckpointId);
      if (!checkpoint.accepted) return this.result(false, false, "session_rejected");
    } catch {
      return this.result(false, false, "session_rejected");
    }
    this.flow = trial;
    this.assertConsistent();
    return this.result(true, false, "committed");
  }

  public snapshot(): PrologueForestOpeningSnapshot {
    const session = this.flow.snapshot().session;
    const runtime = this.runtime.snapshot();
    return Object.freeze({
      mode: this.flow.snapshot().mode === "settlement" ? "settlement_perimeter" : "forest_opening",
      session,
      runtime,
      storyRouteReady: storyRouteFlags(session).length === 1,
      glyphObserved: session.receiptIndex[GLYPH_RECEIPT_ID]?.payloadHash === GLYPH_RECEIPT_HASH,
      killCount: 0,
    });
  }

  public toSave(): PrologueForestOpeningSave {
    const body = {
      schema: PROLOGUE_FOREST_OPENING_SAVE_SCHEMA,
      manifestDigest: openingManifest.sourceDigest,
      session: this.flow.toSave(),
      runtime: this.runtime.save(),
    };
    return Object.freeze({ ...body, checksum: sha256Canonical(body as unknown as JsonValue) });
  }

  private actorBounds(): Aabb {
    const player = this.runtime.snapshot().spatial.player;
    return Object.freeze({ ...player.position, ...player.body });
  }

  private result(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueForestOpeningActionReason | ForestOpeningObstacleFailureReason,
  ): PrologueForestOpeningActionResult {
    return Object.freeze({ accepted, duplicate, reason, snapshot: this.snapshot() });
  }

  private assertConsistent(): void {
    const flow = this.flow.snapshot();
    if (flow.mode !== "arrival_stream" && flow.mode !== "settlement") {
      throw new Error("forest opening story is outside the supported slice");
    }
    const solution = this.runtime.snapshot().obstacle.committedSolutionId;
    const routeFlags = storyRouteFlags(flow.session);
    if (solution === null && routeFlags.length !== 0) {
      throw new Error("forest opening story route has no physical solution");
    }
    if (solution !== null && (routeFlags.length !== 1 || routeFlags[0] !== SOLUTION_ROUTE_FLAG[solution])) {
      throw new Error("forest opening physical solution does not match story route");
    }
    if (flow.mode === "settlement" && (solution === null || !hasReachedSettlementEntrance(this.actorBounds()))) {
      throw new Error("forest opening settlement story has no physical entrance proof");
    }
    const glyph = flow.session.receiptIndex[GLYPH_RECEIPT_ID];
    if (glyph && (glyph.domain !== "world" || glyph.payloadHash !== GLYPH_RECEIPT_HASH)) {
      throw new Error("forest opening glyph observation receipt is invalid");
    }
  }
}

function commitSemanticSolution(flow: PrologueFlowSession, solution: ForestOpeningSolutionId): boolean {
  const result = solution === "stone_steps"
    ? flow.pushLooseStone(`forest-opening:solution:${solution}`)
    : solution === "deadwood_bridge"
      ? flow.placeRottenLog(`forest-opening:solution:${solution}`)
      : flow.digSoftSoil(`forest-opening:solution:${solution}`);
  return result.accepted && result.result?.accepted === true;
}

function synchronizeToStream(flow: PrologueFlowSession): boolean {
  for (let tick = 0; tick < FLOW_SYNC_TICK_LIMIT; tick += 1) {
    const snapshot = flow.snapshot();
    if (snapshot.mode !== "arrival_stream") return false;
    if (snapshot.runtime.sceneId === PROLOGUE_STREAM_SCENE_ID) return true;
    flow.advanceTicks(1, { moveX: 1 });
  }
  return false;
}

function synchronizeToSettlement(flow: PrologueFlowSession): boolean {
  for (let tick = 0; tick < FLOW_SYNC_TICK_LIMIT; tick += 1) {
    if (flow.snapshot().mode === "settlement") return true;
    flow.advanceTicks(1, { moveX: 1 });
  }
  return flow.snapshot().mode === "settlement";
}

function storyRouteFlags(state: GameSessionState): string[] {
  const expected = new Set(Object.values(SOLUTION_ROUTE_FLAG));
  return Object.values(state.world.flags)
    .filter((flag) => flag.scope === "area" && flag.areaId === PROLOGUE_AREA_ID && flag.value === true)
    .map(({ flagId }) => decodeRuntimeValueFlag(flagId))
    .filter((flagId): flagId is string => flagId !== null && expected.has(flagId));
}

function decodeRuntimeValueFlag(flagId: string): string | null {
  const prefix = "runtime.value:";
  if (!flagId.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(flagId.slice(prefix.length));
    return Array.isArray(value) && value.length === 2 && value[0] === PROLOGUE_STREAM_SCENE_ID &&
      typeof value[1] === "string" ? value[1] : null;
  } catch {
    return null;
  }
}

function nearPoint(actor: Aabb, point: readonly [number, number], radius: number): boolean {
  const x = Math.max(actor.x, Math.min(point[0], actor.x + actor.width));
  const y = Math.max(actor.y, Math.min(point[1], actor.y + actor.height));
  return Math.hypot(point[0] - x, point[1] - y) <= radius;
}

function intersectsStrict(left: Aabb, right: Aabb): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}

function hasReachedSettlementEntrance(actor: Aabb): boolean {
  return intersectsStrict(actor, openingManifest.obstacle.settlementEntranceBoundsPx) ||
    actor.x + actor.width > openingManifest.obstacle.settlementEntranceBoundsPx.x;
}

function readSave(candidate: unknown): PrologueForestOpeningSave {
  const raw = record(candidate, "forest opening coordinator save");
  exactKeys(raw, ["schema", "manifestDigest", "session", "runtime", "checksum"], "forest opening coordinator save");
  if (raw.schema !== PROLOGUE_FOREST_OPENING_SAVE_SCHEMA || raw.manifestDigest !== openingManifest.sourceDigest) {
    throw new Error("forest opening coordinator save identity is invalid");
  }
  const checksum = sha(raw.checksum, "forest opening coordinator checksum");
  const body = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "checksum"));
  if (sha256Canonical(body as JsonValue) !== checksum) throw new Error("forest opening coordinator checksum mismatch");
  return Object.freeze({
    schema: PROLOGUE_FOREST_OPENING_SAVE_SCHEMA,
    manifestDigest: raw.manifestDigest,
    session: structuredClone(raw.session) as GameSessionSave,
    runtime: structuredClone(raw.runtime) as ForestOpeningRuntimeSave,
    checksum,
  });
}

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
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
