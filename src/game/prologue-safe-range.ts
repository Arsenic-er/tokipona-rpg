import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeSafeRangeManifest,
  type RuntimeSafeRangeManifest,
  type RuntimeSafeRangeTargetPhysics,
} from "../content/runtime-safe-range-manifest";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  commitTrustedSafeRangeProposal,
  commitSessionProposal,
  proposeSafeRangeMaterialTableCompletion,
  proposeSafeRangeRuntimeFrame,
  proposeSafeRangeTransfer,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionApplyReason,
} from "../session/game-session";
import {
  SAFE_RANGE_TARGET_CLASSES,
  compileSafeRangePhysics,
  executeSafeRangePhysics,
  type SafeRangeCompileFailureReason,
  type SafeRangePhysicsContract,
  type SafeRangePhysicsPreview,
  type SafeRangeTargetClass,
} from "./safe-range-physics";
import {
  createSafeRangeRuntimeFramePayload,
  safeRangeInteractionPointPx,
  safeRangeTargetBoundsPx,
} from "./safe-range-authority";

const MANIFEST = readRuntimeSafeRangeManifest(generatedRuntimeArtifact);
const SETTLEMENT_SCENE_ID = "scene.valley.settlement" as const;
const TILE_SIZE_PX = 16;
const ENTRY_POSITION_PX = Object.freeze({ x: 2 * TILE_SIZE_PX, y: 1 * TILE_SIZE_PX });
const RETURN_POSITION_PX = Object.freeze({ x: 37 * TILE_SIZE_PX, y: 1 * TILE_SIZE_PX });
const TABLE_INTERACTION_RADIUS_PX = TILE_SIZE_PX;

export const PROLOGUE_SAFE_RANGE_SCENE_ID = MANIFEST.scene.sceneId;
export const PROLOGUE_SAFE_RANGE_SETTLEMENT_SCENE_ID = SETTLEMENT_SCENE_ID;
export const PROLOGUE_SAFE_RANGE_ENTRY_CHECKPOINT_ID = "checkpoint.valley.safe_range.entry";
export const PROLOGUE_SAFE_RANGE_RETURN_CHECKPOINT_ID = "checkpoint.valley.settlement.safe-range-return";

interface PointPx { readonly x: number; readonly y: number }
interface RectPx { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface SafeRangeRuntimeActor {
  readonly actorId: string;
  readonly kind: "living" | "inert";
  readonly boundsPx: RectPx;
}

interface SafeRangeRuntimeWorldSnapshot {
  readonly revision: number;
  readonly playerPositionPx: PointPx;
  readonly actors: readonly SafeRangeRuntimeActor[];
}

const RUNTIME_FRAME_READ_TOKEN = Symbol("safe-range-runtime-frame-read");

const finitePoint = (point: PointPx): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);
const validRect = (rect: RectPx): boolean => finitePoint(rect) &&
  Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0;
const cloneActor = (actor: SafeRangeRuntimeActor): SafeRangeRuntimeActor => Object.freeze({
  actorId: actor.actorId,
  kind: actor.kind,
  boundsPx: Object.freeze({ ...actor.boundsPx }),
});

/**
 * Privileged runtime-side state. UI/action requests never carry actors, target HP, or collision verdicts.
 * The game runtime owns this object and advances its revision whenever a world fact changes.
 */
export class SafeRangeRuntimeWorld {
  private revisionValue = 0;
  private playerPosition: PointPx;
  private actorsValue: readonly SafeRangeRuntimeActor[];
  private readonly initialActors: readonly SafeRangeRuntimeActor[];

  public constructor(initial?: Readonly<{
    playerPositionPx?: PointPx;
    actors?: readonly SafeRangeRuntimeActor[];
  }>) {
    const player = initial?.playerPositionPx ?? ENTRY_POSITION_PX;
    if (!finitePoint(player)) throw new Error("safe-range runtime player position must be finite");
    const actors = initial?.actors ?? [];
    if (!this.validActors(actors)) throw new Error("safe-range runtime actors are invalid");
    this.playerPosition = Object.freeze({ ...player });
    this.initialActors = Object.freeze(actors.map(cloneActor));
    this.actorsValue = this.initialActors;
  }

  /** The module-private token confines frame reads to this coordinator. */
  public readAuthoritativeFrame(token: symbol): SafeRangeRuntimeWorldSnapshot {
    if (token !== RUNTIME_FRAME_READ_TOKEN) throw new Error("safe-range runtime frame read is not authorized");
    return Object.freeze({
      revision: this.revisionValue,
      playerPositionPx: Object.freeze({ ...this.playerPosition }),
      actors: Object.freeze(this.actorsValue.map(cloneActor)),
    });
  }

  /** Privileged runtime synchronization; this is intentionally not part of compile/execute requests. */
  public synchronize(playerPositionPx: PointPx, actors: readonly SafeRangeRuntimeActor[]): void {
    if (!finitePoint(playerPositionPx) || !this.validActors(actors)) {
      throw new Error("safe-range runtime frame is invalid");
    }
    const unchangedPlayer = this.playerPosition.x === playerPositionPx.x && this.playerPosition.y === playerPositionPx.y;
    const unchangedActors = this.actorsValue.length === actors.length && this.actorsValue.every((current, index) => {
      const next = actors[index];
      return next !== undefined && current.actorId === next.actorId && current.kind === next.kind &&
        current.boundsPx.x === next.boundsPx.x && current.boundsPx.y === next.boundsPx.y &&
        current.boundsPx.width === next.boundsPx.width && current.boundsPx.height === next.boundsPx.height;
    });
    if (unchangedPlayer && unchangedActors) return;
    this.playerPosition = Object.freeze({ ...playerPositionPx });
    this.actorsValue = Object.freeze(actors.map(cloneActor));
    this.revisionValue += 1;
  }

  public relocatePlayer(playerPositionPx: PointPx): void {
    if (!finitePoint(playerPositionPx)) throw new Error("safe-range runtime player position must be finite");
    this.playerPosition = Object.freeze({ ...playerPositionPx });
    this.revisionValue += 1;
  }

  public resetLocalScene(): void {
    this.playerPosition = ENTRY_POSITION_PX;
    this.actorsValue = this.initialActors;
    this.revisionValue += 1;
  }

  private validActors(actors: readonly SafeRangeRuntimeActor[]): boolean {
    return new Set(actors.map((actor) => actor.actorId)).size === actors.length && actors.every((actor) =>
      actor.actorId.trim().length > 0 && (actor.kind === "living" || actor.kind === "inert") && validRect(actor.boundsPx));
  }
}

export interface PrologueSafeRangeCompileRequest {
  readonly targetClass: SafeRangeTargetClass;
  readonly promptLevel: 0 | 1;
  readonly waterSource: "bound_existing" | "manifest_default";
}

export interface PrologueSafeRangePreview {
  readonly targetClass: SafeRangeTargetClass;
  readonly promptLevel: 0 | 1;
  readonly waterSource: "bound_existing" | "manifest_default";
  readonly quotedMp: 13 | 18;
  readonly canonicalAst: Readonly<{
    subjectHead: "word.telo";
    commandParticle: "o";
    action: "word.tawa";
    manner: "word.wawa";
  }>;
  readonly effect: Readonly<{
    phase: "liquid";
    massMu: 2;
    kineticEu: 8;
    speedBandMps: readonly [3, 5];
  }>;
}

export type PrologueSafeRangeReason =
  | "committed"
  | "duplicate"
  | "transaction_conflict"
  | "permission_denied"
  | "wrong_scene"
  | "wrong_source_scene"
  | "invalid_request"
  | "untrusted_preview"
  | "preview_already_executed"
  | "world_version_conflict"
  | "target_already_completed"
  | "table_prerequisites_missing"
  | "table_out_of_range"
  | "session_rejected"
  | SafeRangeCompileFailureReason;

export type PrologueSafeRangeCompileResult =
  | Readonly<{ ok: true; preview: PrologueSafeRangePreview; reason: null; snapshot: PrologueSafeRangeSnapshot }>
  | Readonly<{ ok: false; preview: null; reason: PrologueSafeRangeReason; snapshot: PrologueSafeRangeSnapshot }>;

export interface PrologueSafeRangeActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueSafeRangeReason;
  readonly sessionReason: SessionApplyReason | null;
  readonly snapshot: PrologueSafeRangeSnapshot;
}

export interface PrologueSafeRangeEntryResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueSafeRangeReason;
  readonly entryMode: "direct_transition" | "adopted_runtime_transition" | null;
  readonly safeRange: PrologueSafeRangeSession | null;
}

export interface PrologueSafeRangeReturnResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueSafeRangeReason;
  readonly session: GameSession | null;
}

export interface PrologueSafeRangeSnapshot {
  readonly sceneId: string;
  readonly permissionGranted: boolean;
  readonly firstAttackSignatureAvailable: boolean;
  readonly firstAttackSignatureCompleted: boolean;
  readonly targets: Readonly<Record<SafeRangeTargetClass, Readonly<{
    materialClass: string;
    completed: boolean;
  }>>>;
}

interface TrustedPlan {
  readonly physics: SafeRangePhysicsPreview;
  readonly request: PrologueSafeRangeCompileRequest;
  readonly requestHash: string;
  readonly sessionWorldRevision: number;
  readonly mpWorldVersion: number;
  readonly runtimeRevision: number;
}

const trustedPlans = new WeakMap<object, TrustedPlan>();
const executedPublicPlans = new WeakSet<object>();

declare const safeRangeCommitProofBrand: unique symbol;
export interface SafeRangeCommitProof {
  readonly kind: "transfer" | "material_table";
  readonly batch: SessionProposalBatch;
  readonly requestHash: string;
  readonly runtimeRevision: number;
  readonly [safeRangeCommitProofBrand]: true;
}
const trustedCommitProofs = new WeakSet<object>();
export const isTrustedSafeRangeCommitProof = (value: unknown): value is SafeRangeCommitProof =>
  typeof value === "object" && value !== null && trustedCommitProofs.has(value);
const createSafeRangeCommitProof = (
  kind: SafeRangeCommitProof["kind"],
  batch: SessionProposalBatch,
  requestHash: string,
  runtimeRevision: number,
): SafeRangeCommitProof => {
  const proof = Object.freeze({ kind, batch, requestHash, runtimeRevision }) as unknown as SafeRangeCommitProof;
  trustedCommitProofs.add(proof);
  return proof;
};

const requiredId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const targetClass = (value: unknown): value is SafeRangeTargetClass =>
  typeof value === "string" && (SAFE_RANGE_TARGET_CLASSES as readonly string[]).includes(value);
const globalTrue = (state: GameSessionState, flagId: string): boolean =>
  state.world.flags[`global:${flagId}`]?.scope === "global" && state.world.flags[`global:${flagId}`]?.value === true;
const operationReceiptId = (sessionId: string, transactionId: string): string =>
  `world:${sessionId}:safe-range-operation:${transactionId}`;
const operationReceiptDraft = (sessionId: string, transactionId: string, payloadHash: string): SessionEventDraft => ({
  eventId: `session.safe-range.operation.${transactionId}`,
  type: "receipt_recorded",
  payload: { receiptId: operationReceiptId(sessionId, transactionId), domain: "world", payloadHash },
});
const classify = (session: GameSession, transactionId: string, payloadHash: string): "absent" | "duplicate" | "conflict" => {
  const receipt = session.snapshot().receiptIndex[operationReceiptId(session.sessionId, transactionId)];
  if (!receipt) return "absent";
  return receipt.domain === "world" && receipt.payloadHash === payloadHash ? "duplicate" : "conflict";
};
const checkpoint = (state: GameSessionState, id: string, sceneId: string, position: PointPx) => ({
  id,
  sceneId,
  position: { ...position },
  revision: state.checkpoint.revision + 1,
});
const pxRect = (profile: RuntimeSafeRangeTargetPhysics): RectPx => ({
  ...(safeRangeTargetBoundsPx(profile.targetClass) ?? {
    x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN,
  }),
});
const interactionPointPx = (profile: RuntimeSafeRangeTargetPhysics): PointPx => ({
  ...(safeRangeInteractionPointPx(profile.targetClass) ?? { x: Number.NaN, y: Number.NaN }),
});
const near = (left: PointPx, right: PointPx, radiusPx = TILE_SIZE_PX): boolean =>
  finitePoint(left) && finitePoint(right) && Math.hypot(left.x - right.x, left.y - right.y) <= radiusPx;
const rectsOverlap = (left: RectPx, right: RectPx): boolean =>
  left.x < right.x + right.width && left.x + left.width > right.x &&
  left.y < right.y + right.height && left.y + left.height > right.y;
const pointInRect = (point: PointPx, rect: RectPx): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

// Liang-Barsky segment/AABB test. A small authored projectile radius keeps the check conservative.
const segmentIntersectsRect = (start: PointPx, end: PointPx, rect: RectPx): boolean => {
  const projectileRadiusPx = 4;
  const expanded = {
    x: rect.x - projectileRadiusPx,
    y: rect.y - projectileRadiusPx,
    width: rect.width + projectileRadiusPx * 2,
    height: rect.height + projectileRadiusPx * 2,
  };
  if (pointInRect(start, expanded) || pointInRect(end, expanded)) return true;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minimum = 0;
  let maximum = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const ratio = q / p;
    if (p < 0) {
      if (ratio > maximum) return false;
      if (ratio > minimum) minimum = ratio;
    } else {
      if (ratio < minimum) return false;
      if (ratio < maximum) maximum = ratio;
    }
    return true;
  };
  return clip(-dx, start.x - expanded.x) && clip(dx, expanded.x + expanded.width - start.x) &&
    clip(-dy, start.y - expanded.y) && clip(dy, expanded.y + expanded.height - start.y);
};

const physicsContract = (manifest: RuntimeSafeRangeManifest): SafeRangePhysicsContract => {
  const profiles = Object.fromEntries(manifest.targetPhysics.profiles.map((profile) => [profile.targetClass, {
    targetClass: profile.targetClass,
    materialClass: profile.materialClass,
    initialHp: profile.initialHp,
    absorptionEu: profile.targetAbsorptionEu,
    coupling: profile.kineticCouplingRatio,
  }])) as unknown as SafeRangePhysicsContract["targets"];
  return Object.freeze({
    signatureId: manifest.signature.signatureId,
    allowedSceneId: manifest.scene.sceneId,
    capacity: Object.freeze({
      minExpressionCapacityWords: manifest.signature.capacity.playerMeaningfulTokensMinimum,
      minFocusSlots: manifest.signature.capacity.artifactSlotsMinimum,
    }),
    mpQuotes: Object.freeze({
      boundExistingWater: manifest.signature.mp.boundExistingWater,
      shapedWater: manifest.signature.mp.manifestDefaultWater,
    }),
    effect: Object.freeze({
      phase: manifest.signature.output.phase,
      massMu: manifest.signature.output.massMu,
      kineticEu: manifest.signature.output.paidKineticBudgetEu,
      speedBand: Object.freeze({ min: manifest.signature.output.initialSpeedBandMps[0], max: manifest.signature.output.initialSpeedBandMps[1] }),
      solidDamageBonusHp: manifest.signature.damage.liquidSolidMassComponent,
      kineticEuPerHpAfterAbsorption: 4,
    }),
    targets: Object.freeze(profiles),
  });
};

const PHYSICS_CONTRACT = physicsContract(MANIFEST);
const variantHash = (klass: SafeRangeTargetClass): string => sha256Canonical({
  familyId: MANIFEST.familyId,
  targetClass: klass,
  targetId: klass,
  normalizedEnvironmentFingerprint: `${MANIFEST.scene.sceneId}:${klass}`,
  canonicalAst: MANIFEST.canonicalAst,
} as unknown as JsonValue);

export class PrologueSafeRangeSession {
  private authoritativeSession: GameSession;

  private constructor(session: GameSession, private readonly runtimeWorld: SafeRangeRuntimeWorld) {
    const state = session.snapshot();
    if (state.world.currentSceneId !== MANIFEST.scene.sceneId ||
        !globalTrue(state, MANIFEST.scene.entryPermissionStateId)) {
      throw new Error("safe-range coordinator requires the permitted generated N08 scene");
    }
    this.authoritativeSession = session;
  }

  /** Adopts a same-scene authoritative Session update while preserving target and runtime state. */
  public adoptSession(session: GameSession): void {
    if (session.sessionId !== this.authoritativeSession.sessionId ||
        session.snapshot().world.currentSceneId !== MANIFEST.scene.sceneId) {
      throw new Error("safe-range session adoption requires the same N08 session");
    }
    this.authoritativeSession = session;
  }

  public static enterFromSettlement(session: GameSession, transactionId: string,
    runtimeWorld = new SafeRangeRuntimeWorld()): PrologueSafeRangeEntryResult {
    return this.commitEntry(session, transactionId, runtimeWorld, "direct_transition");
  }

  public static adoptRuntimeEntry(session: GameSession, transactionId: string,
    runtimeWorld = new SafeRangeRuntimeWorld()): PrologueSafeRangeEntryResult {
    return this.commitEntry(session, transactionId, runtimeWorld, "adopted_runtime_transition");
  }

  private static commitEntry(session: GameSession, transactionId: string, runtimeWorld: SafeRangeRuntimeWorld,
    mode: "direct_transition" | "adopted_runtime_transition"): PrologueSafeRangeEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = sha256Canonical({ kind: "safe_range_entry", mode,
      sourceSceneId: SETTLEMENT_SCENE_ID, sourceExitId: "settlement.to_safe_range",
      targetSceneId: MANIFEST.scene.sceneId, targetEntranceId: MANIFEST.scene.entranceId } as JsonValue);
    const prior = classify(session, id, payloadHash);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") {
      const arrived = session.snapshot().world.currentSceneId === MANIFEST.scene.sceneId;
      return this.entryResult(arrived, arrived, arrived ? "duplicate" : "wrong_source_scene",
        arrived ? mode : null, arrived ? new PrologueSafeRangeSession(session, runtimeWorld) : null);
    }
    const state = session.snapshot();
    if (!globalTrue(state, MANIFEST.scene.entryPermissionStateId)) {
      return this.entryResult(false, false, "permission_denied", null, null);
    }
    const drafts: SessionEventDraft[] = [];
    if (mode === "direct_transition") {
      if (state.world.currentSceneId !== SETTLEMENT_SCENE_ID) {
        return this.entryResult(false, false, "wrong_source_scene", null, null);
      }
      drafts.push({
        eventId: `session.safe-range.entry.${id}.${SETTLEMENT_SCENE_ID}->${MANIFEST.scene.sceneId}`,
        type: "scene_entered",
        payload: { sceneId: MANIFEST.scene.sceneId },
      });
    } else {
      const sceneEvents = session.events().filter((event) => event.type === "scene_entered");
      const latest = sceneEvents.at(-1);
      const previous = sceneEvents.at(-2);
      const sourceEstablished = previous?.type === "scene_entered"
        ? previous.payload.sceneId === SETTLEMENT_SCENE_ID
        : state.checkpoint.sceneId === SETTLEMENT_SCENE_ID;
      const canonicalSuffix = `${SETTLEMENT_SCENE_ID}->${MANIFEST.scene.sceneId}`;
      if (state.world.currentSceneId !== MANIFEST.scene.sceneId || latest?.type !== "scene_entered" ||
          latest.payload.sceneId !== MANIFEST.scene.sceneId || !latest.eventId.endsWith(canonicalSuffix) || !sourceEstablished) {
        return this.entryResult(false, false, "wrong_source_scene", null, null);
      }
    }
    drafts.push(
      { eventId: `session.safe-range.entry.checkpoint.${id}`, type: "checkpoint_set",
        payload: { checkpoint: checkpoint(state, PROLOGUE_SAFE_RANGE_ENTRY_CHECKPOINT_ID,
          MANIFEST.scene.sceneId, ENTRY_POSITION_PX) } },
      operationReceiptDraft(session.sessionId, id, payloadHash),
    );
    const committed = commitSessionProposal(session, { transactionId: id, drafts });
    if (!committed.committed) return this.entryResult(false, false, "session_rejected", null, null);
    runtimeWorld.resetLocalScene();
    return this.entryResult(true, false, "committed", mode, new PrologueSafeRangeSession(committed.session, runtimeWorld));
  }

  private static entryResult(accepted: boolean, duplicate: boolean, reason: PrologueSafeRangeReason,
    entryMode: PrologueSafeRangeEntryResult["entryMode"], safeRange: PrologueSafeRangeSession | null): PrologueSafeRangeEntryResult {
    return Object.freeze({ accepted, duplicate, reason, entryMode, safeRange });
  }

  public static fromSave(candidate: unknown, runtimeWorld = new SafeRangeRuntimeWorld()): PrologueSafeRangeSession {
    return new PrologueSafeRangeSession(GameSession.fromSave(candidate), runtimeWorld);
  }

  public get session(): GameSession { return this.authoritativeSession; }
  public toSave(): GameSessionSave { return this.authoritativeSession.toSave(); }

  public snapshot(): PrologueSafeRangeSnapshot {
    const state = this.authoritativeSession.snapshot();
    const targets = Object.fromEntries(SAFE_RANGE_TARGET_CLASSES.map((klass) => {
      const target = this.targetState(klass);
      return [klass, Object.freeze({
        materialClass: target.materialClass,
        completed: target.completed,
      })];
    })) as unknown as PrologueSafeRangeSnapshot["targets"];
    return Object.freeze({
      sceneId: state.world.currentSceneId,
      permissionGranted: globalTrue(state, MANIFEST.scene.entryPermissionStateId),
      firstAttackSignatureAvailable: globalTrue(state, MANIFEST.progression.firstTransfer.resultStateId),
      firstAttackSignatureCompleted: globalTrue(state, MANIFEST.progression.materialTable.resultStateId),
      targets: Object.freeze(targets),
    });
  }

  public compile(request: PrologueSafeRangeCompileRequest): PrologueSafeRangeCompileResult {
    if (!this.inScene()) return this.compileFailure("wrong_scene");
    const state = this.authoritativeSession.snapshot();
    if (!globalTrue(state, MANIFEST.scene.entryPermissionStateId)) return this.compileFailure("permission_denied");
    if (!targetClass(request.targetClass) || (request.promptLevel !== 0 && request.promptLevel !== 1) ||
        (request.waterSource !== "bound_existing" && request.waterSource !== "manifest_default")) {
      return this.compileFailure("invalid_request");
    }
    const targetState = this.targetState(request.targetClass);
    if (targetState.completed || targetState.currentHp <= 0) return this.compileFailure("target_already_completed");
    const profile = MANIFEST.targetPhysics.profiles.find((candidate) => candidate.targetClass === request.targetClass)!;
    const runtime = this.runtimeWorld.readAuthoritativeFrame(RUNTIME_FRAME_READ_TOKEN);
    const targetBounds = pxRect(profile);
    const destination = interactionPointPx(profile);
    if (!Number.isSafeInteger(runtime.revision) || runtime.revision < 0 ||
        !near(runtime.playerPositionPx, destination)) return this.compileFailure("invalid_request");
    const direction = { x: destination.x - runtime.playerPositionPx.x, y: destination.y - runtime.playerPositionPx.y };
    if (direction.x === 0 && direction.y === 0) direction.x = 1;
    const livingActors = runtime.actors.filter((actor) => actor.kind === "living");
    const physicsResult = compileSafeRangePhysics(PHYSICS_CONTRACT, {
      permission: "granted",
      sceneId: state.world.currentSceneId,
      expressionCapacityWords: state.capabilities.expressionCapacityWords,
      focusSlots: state.capabilities.focusSlots,
      target: { targetId: request.targetClass, targetClass: request.targetClass, currentHp: targetState.currentHp },
      livingOverlap: livingActors.some((actor) => rectsOverlap(actor.boundsPx, targetBounds)),
      sweptLivingCollision: livingActors.some((actor) => segmentIntersectsRect(runtime.playerPositionPx, destination, actor.boundsPx)),
      useBoundExistingWater: request.waterSource === "bound_existing",
      currentMp: state.mp.currentMp,
      worldVersion: runtime.revision,
      promptLevel: request.promptLevel,
      direction,
    });
    if (!physicsResult.ok) return this.compileFailure(physicsResult.reason);
    const publicPreview: PrologueSafeRangePreview = Object.freeze({
      targetClass: request.targetClass,
      promptLevel: request.promptLevel,
      waterSource: request.waterSource,
      quotedMp: physicsResult.preview.quotedMp,
      canonicalAst: Object.freeze({ ...MANIFEST.canonicalAst }),
      effect: Object.freeze({ phase: MANIFEST.signature.output.phase,
        massMu: MANIFEST.signature.output.massMu, kineticEu: MANIFEST.signature.output.paidKineticBudgetEu,
        speedBandMps: Object.freeze([...MANIFEST.signature.output.initialSpeedBandMps]) as readonly [3, 5] }),
    });
    const normalizedRequest = Object.freeze({ ...request });
    const requestHash = sha256Canonical({ kind: "safe_range_transfer", request: normalizedRequest,
      decisionMaterial: physicsResult.preview.decisionMaterial } as unknown as JsonValue);
    trustedPlans.set(publicPreview, Object.freeze({
      physics: physicsResult.preview,
      request: normalizedRequest,
      requestHash,
      sessionWorldRevision: state.world.revision,
      mpWorldVersion: state.mp.worldVersion,
      runtimeRevision: runtime.revision,
    }));
    return Object.freeze({ ok: true, preview: publicPreview, reason: null, snapshot: this.snapshot() });
  }

  public execute(transactionId: string, preview: PrologueSafeRangePreview): PrologueSafeRangeActionResult {
    const id = requiredId(transactionId, "transactionId");
    const trusted = trustedPlans.get(preview);
    if (!trusted) return this.result(false, false, "untrusted_preview");
    const prior = classify(this.authoritativeSession, id, trusted.requestHash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (executedPublicPlans.has(preview)) return this.result(false, false, "preview_already_executed");
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const runtime = this.runtimeWorld.readAuthoritativeFrame(RUNTIME_FRAME_READ_TOKEN);
    if (state.world.revision !== trusted.sessionWorldRevision || state.mp.worldVersion !== trusted.mpWorldVersion ||
        runtime.revision !== trusted.runtimeRevision) return this.result(false, false, "world_version_conflict");
    const profile = MANIFEST.targetPhysics.profiles.find((candidate) => candidate.targetClass === trusted.request.targetClass)!;
    const targetBounds = pxRect(profile);
    const destination = interactionPointPx(profile);
    if (!Number.isSafeInteger(runtime.revision) || runtime.revision < 0 ||
        !near(runtime.playerPositionPx, destination)) return this.result(false, false, "world_version_conflict");
    if (runtime.actors.length !== 0) return this.result(false, false, "living_overlap");
    const livingActors = runtime.actors.filter((actor) => actor.kind === "living");
    if (livingActors.some((actor) => rectsOverlap(actor.boundsPx, targetBounds))) {
      return this.result(false, false, "living_overlap");
    }
    if (livingActors.some((actor) => segmentIntersectsRect(runtime.playerPositionPx, destination, actor.boundsPx))) {
      return this.result(false, false, "swept_living_collision");
    }
    const recheckedRuntime = this.runtimeWorld.readAuthoritativeFrame(RUNTIME_FRAME_READ_TOKEN);
    if (recheckedRuntime.revision !== runtime.revision || !finitePoint(recheckedRuntime.playerPositionPx) ||
        recheckedRuntime.actors.some((actor) => !validRect(actor.boundsPx))) {
      return this.result(false, false, "world_version_conflict");
    }
    const execution = executeSafeRangePhysics(trusted.physics,
      { worldVersion: recheckedRuntime.revision, currentMp: state.mp.currentMp });
    if (!execution.executed) return this.result(false, false,
      execution.reason === "plan_already_executed" ? "preview_already_executed" :
        execution.reason === "untrusted_plan" ? "untrusted_preview" : execution.reason);
    executedPublicPlans.add(preview);
    const value = execution.value;
    const framePayload = createSafeRangeRuntimeFramePayload({
      transactionId: id,
      actionKind: "transfer",
      targetId: trusted.request.targetClass,
      requestHash: trusted.requestHash,
      sessionWorldRevision: state.world.revision,
      mpWorldVersion: state.mp.worldVersion,
      runtimeRevision: recheckedRuntime.revision,
      playerPositionPx: recheckedRuntime.playerPositionPx,
    });
    const proposal = proposeSafeRangeTransfer({
      transactionId: id,
      writerEvent: MANIFEST.progression.firstTransfer.writerEvent,
      targetClass: trusted.request.targetClass,
      targetId: trusted.request.targetClass,
      normalizedVariantHash: variantHash(trusted.request.targetClass),
      promptLevel: trusted.request.promptLevel,
      waterSource: trusted.request.waterSource,
      expectedCurrentMp: state.mp.currentMp,
      expectedMpWorldVersion: state.mp.worldVersion,
      authorityProof: {
        requestHash: trusted.requestHash,
        runtimeRevision: recheckedRuntime.revision,
        frameEventId: `session.safe-range.frame.${id}`,
        frameHash: framePayload.frameHash,
        manifestDigest: framePayload.manifestDigest,
        sessionWorldRevision: framePayload.sessionWorldRevision,
        mpWorldVersion: framePayload.mpWorldVersion,
      },
      physicsResult: {
        paidKineticBudgetEu: value.physics.kineticEu,
        transferredKineticEu: value.physics.transferredEu,
        damageHp: value.target.kineticHpLoss,
        targetHpBefore: value.target.hpBefore,
        targetHpAfter: value.target.hpAfter,
        livingOverlap: false,
      },
    });
    const frame = proposeSafeRangeRuntimeFrame(framePayload);
    const batch: SessionProposalBatch = { transactionId: id,
      drafts: [...frame.drafts, ...proposal.drafts,
        operationReceiptDraft(this.authoritativeSession.sessionId, id, trusted.requestHash)] };
    return this.commitTrusted(createSafeRangeCommitProof("transfer", batch, trusted.requestHash,
      recheckedRuntime.revision));
  }

  public inspectMaterialTable(transactionId: string): PrologueSafeRangeActionResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = sha256Canonical({ kind: "safe_range_material_table",
      targetId: MANIFEST.progression.materialTable.tableTargetId,
      targetClasses: MANIFEST.progression.materialTable.targetClasses } as unknown as JsonValue);
    const prior = classify(this.authoritativeSession, id, payloadHash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    if (!SAFE_RANGE_TARGET_CLASSES.every((klass) => this.snapshot().targets[klass].completed)) {
      return this.result(false, false, "table_prerequisites_missing");
    }
    const runtime = this.runtimeWorld.readAuthoritativeFrame(RUNTIME_FRAME_READ_TOKEN);
    if (runtime.actors.length !== 0) return this.result(false, false, "living_overlap");
    const point = safeRangeInteractionPointPx("material_collision_table");
    if (!point) return this.result(false, false, "table_out_of_range");
    if (!Number.isSafeInteger(runtime.revision) || runtime.revision < 0 ||
        !near(runtime.playerPositionPx, point, TABLE_INTERACTION_RADIUS_PX)) {
      return this.result(false, false, "table_out_of_range");
    }
    const rechecked = this.runtimeWorld.readAuthoritativeFrame(RUNTIME_FRAME_READ_TOKEN);
    if (rechecked.revision !== runtime.revision || !finitePoint(rechecked.playerPositionPx)) {
      return this.result(false, false, "world_version_conflict");
    }
    const state = this.authoritativeSession.snapshot();
    const framePayload = createSafeRangeRuntimeFramePayload({
      transactionId: id,
      actionKind: "material_table",
      targetId: "material_collision_table",
      requestHash: payloadHash,
      sessionWorldRevision: state.world.revision,
      mpWorldVersion: state.mp.worldVersion,
      runtimeRevision: rechecked.revision,
      playerPositionPx: rechecked.playerPositionPx,
    });
    const proposal = proposeSafeRangeMaterialTableCompletion(id, { requestHash: payloadHash,
      runtimeRevision: rechecked.revision, targetId: MANIFEST.progression.materialTable.tableTargetId,
      frameEventId: `session.safe-range.frame.${id}`, frameHash: framePayload.frameHash,
      manifestDigest: framePayload.manifestDigest, sessionWorldRevision: framePayload.sessionWorldRevision,
      mpWorldVersion: framePayload.mpWorldVersion });
    const frame = proposeSafeRangeRuntimeFrame(framePayload);
    const batch: SessionProposalBatch = { transactionId: id,
      drafts: [...frame.drafts, ...proposal.drafts,
        operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash)] };
    return this.commitTrusted(createSafeRangeCommitProof("material_table", batch, payloadHash, rechecked.revision));
  }

  public returnToSettlement(transactionId: string): PrologueSafeRangeReturnResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = sha256Canonical({ kind: "safe_range_return", sourceSceneId: MANIFEST.scene.sceneId,
      sourceExitId: MANIFEST.scene.exitId, targetSceneId: SETTLEMENT_SCENE_ID,
      targetEntranceId: "settlement.from_safe_range" } as JsonValue);
    const prior = classify(this.authoritativeSession, id, payloadHash);
    if (prior === "conflict") return Object.freeze({ accepted: false, duplicate: false,
      reason: "transaction_conflict" as const, session: null });
    if (prior === "duplicate") {
      const arrived = this.authoritativeSession.snapshot().world.currentSceneId === SETTLEMENT_SCENE_ID;
      return Object.freeze({ accepted: arrived, duplicate: arrived,
        reason: arrived ? "duplicate" as const : "wrong_source_scene" as const,
        session: arrived ? this.authoritativeSession : null });
    }
    if (!this.inScene()) return Object.freeze({ accepted: false, duplicate: false,
      reason: "wrong_scene" as const, session: null });
    const state = this.authoritativeSession.snapshot();
    const committed = commitSessionProposal(this.authoritativeSession, { transactionId: id, drafts: [
      { eventId: `session.safe-range.return.${id}.${MANIFEST.scene.sceneId}->${SETTLEMENT_SCENE_ID}`,
        type: "scene_entered", payload: { sceneId: SETTLEMENT_SCENE_ID } },
      { eventId: `session.safe-range.return.checkpoint.${id}`, type: "checkpoint_set",
        payload: { checkpoint: checkpoint(state, PROLOGUE_SAFE_RANGE_RETURN_CHECKPOINT_ID,
          SETTLEMENT_SCENE_ID, RETURN_POSITION_PX) } },
      operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash),
    ] });
    if (!committed.committed) return Object.freeze({ accepted: false, duplicate: false,
      reason: "session_rejected" as const, session: null });
    this.authoritativeSession = committed.session;
    return Object.freeze({ accepted: true, duplicate: false, reason: "committed" as const,
      session: committed.session });
  }

  public resetToCheckpoint(transactionId: string): PrologueSafeRangeActionResult {
    return this.reset(transactionId, "checkpoint_reset");
  }

  public recoverSoftLock(transactionId: string): PrologueSafeRangeActionResult {
    return this.reset(transactionId, "softlock_recovery");
  }

  private reset(transactionId: string, kind: "checkpoint_reset" | "softlock_recovery"): PrologueSafeRangeActionResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = sha256Canonical({ kind, sceneId: MANIFEST.scene.sceneId,
      preserves: ["learning_evidence", "global_progress", "completed_target_classes"] } as unknown as JsonValue);
    const prior = classify(this.authoritativeSession, id, payloadHash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    const state = this.authoritativeSession.snapshot();
    const drafts: SessionEventDraft[] = [
      { eventId: `session.safe-range.reset.${id}`, type: "area_reset",
        payload: { areaId: MANIFEST.scene.sceneId, respawnSceneId: MANIFEST.scene.sceneId } },
      { eventId: `session.safe-range.reset.checkpoint.${id}`, type: "checkpoint_set",
        payload: { checkpoint: checkpoint(state, PROLOGUE_SAFE_RANGE_ENTRY_CHECKPOINT_ID,
          MANIFEST.scene.sceneId, ENTRY_POSITION_PX) } },
      operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash),
    ];
    const result = this.commit({ transactionId: id, drafts });
    if (result.accepted) this.runtimeWorld.resetLocalScene();
    return result;
  }

  private compileFailure(reason: PrologueSafeRangeReason): PrologueSafeRangeCompileResult {
    return Object.freeze({ ok: false, preview: null, reason, snapshot: this.snapshot() });
  }

  private commitTrusted(proof: SafeRangeCommitProof): PrologueSafeRangeActionResult {
    const committed = commitTrustedSafeRangeProposal(this.authoritativeSession, proof);
    if (!committed.committed) {
      const reason = committed.reason === "receipt_payload_conflict" ? "transaction_conflict" : "session_rejected";
      return this.result(false, false, reason, committed.reason);
    }
    this.authoritativeSession = committed.session;
    return this.result(true, false, "committed");
  }
  private commit(batch: SessionProposalBatch): PrologueSafeRangeActionResult {
    const committed = commitSessionProposal(this.authoritativeSession, batch);
    if (!committed.committed) {
      const reason = committed.reason === "receipt_payload_conflict" ? "transaction_conflict" : "session_rejected";
      return this.result(false, false, reason, committed.reason);
    }
    this.authoritativeSession = committed.session;
    return this.result(true, false, "committed");
  }

  private inScene(): boolean {
    return this.authoritativeSession.snapshot().world.currentSceneId === MANIFEST.scene.sceneId;
  }

  private targetState(klass: SafeRangeTargetClass): Readonly<{
    currentHp: number;
    materialClass: string;
    completed: boolean;
  }> {
    const profile = MANIFEST.targetPhysics.profiles.find((candidate) => candidate.targetClass === klass)!;
    const prior = [...this.authoritativeSession.events()].reverse().find((event) =>
      event.type === "safe_range_transfer_passed" && event.payload.targetClass === klass);
    return Object.freeze({
      currentHp: prior?.type === "safe_range_transfer_passed"
        ? prior.payload.physicsResult.targetHpAfter : profile.initialHp,
      materialClass: profile.materialClass,
      completed: prior !== undefined,
    });
  }

  private result(accepted: boolean, duplicate: boolean, reason: PrologueSafeRangeReason,
    sessionReason: SessionApplyReason | null = null): PrologueSafeRangeActionResult {
    return Object.freeze({ accepted, duplicate, reason, sessionReason, snapshot: this.snapshot() });
  }
}
