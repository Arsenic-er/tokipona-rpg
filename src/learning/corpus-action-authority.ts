import {
  isVerifiedRuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusAction,
  type RuntimeLearningCorpusPackage,
} from "../content/runtime-learning-corpus-package.ts";
import type { RuntimeSceneManifestIndex } from "../content/runtime-scene-manifest.ts";
import { computeRuntimeManifestDigest } from "../content/runtime-manifest-digest.ts";
import type { GameSessionRuntimeBridge } from "../runtime/game-session-bridge.ts";

export const LEARNING_CORPUS_WORLD_AUTHORITY_SCHEMA =
  "tokipona.learning-corpus-world-authority.v0.1" as const;

export interface LearningCorpusWorldAuthorityReceipt {
  readonly schema: typeof LEARNING_CORPUS_WORLD_AUTHORITY_SCHEMA;
  readonly receiptId: string;
  readonly authorityDigest: `sha256:${string}`;
  readonly corpusId: string;
  readonly corpusSemanticDigest: `sha256:${string}`;
  readonly playerSaveId: string;
  readonly actionId: string;
  readonly sceneId: string;
  readonly targetId: string;
  readonly interactionId: string;
  readonly sourceObjectClass: string;
  readonly sessionWorldRevision: number;
  readonly runtimeTick: number;
  readonly playerPositionPx: Readonly<{ readonly x: number; readonly y: number }>;
}

export interface LearningCorpusActionAuthorityProof {
  readonly kind: "learning_corpus_action_authority";
  readonly receipt: LearningCorpusWorldAuthorityReceipt;
}

type AuthoritySource = Readonly<{
  packages: readonly RuntimeLearningCorpusPackage[];
  scenes: RuntimeSceneManifestIndex;
}>;

const trustedProofs = new WeakSet<object>();
const consumedProofs = new WeakSet<object>();

export class LearningCorpusRuntimeAuthority {
  private readonly packages: readonly RuntimeLearningCorpusPackage[];
  private readonly scenes: RuntimeSceneManifestIndex;

  public constructor(source: AuthoritySource) {
    if (!source.packages.every(isVerifiedRuntimeLearningCorpusPackage)) {
      throw new Error("learning corpus runtime authority requires verified packages");
    }
    this.packages = source.packages;
    this.scenes = source.scenes;
  }

  public authorize(
    corpusId: string,
    actionId: string,
    playerSaveId: string,
    bridge: GameSessionRuntimeBridge,
  ): LearningCorpusActionAuthorityProof {
    const pkg = this.packages.find((candidate) => candidate.corpusId === corpusId);
    const action = pkg === undefined ? undefined : findAction(pkg, actionId);
    const session = bridge.sessionSnapshot();
    const runtime = bridge.runtime.snapshot();
    if (!pkg || !action || bridge.session.sessionId !== playerSaveId ||
        session.world.currentSceneId !== action.worldAuthority.sceneId ||
        runtime.sceneId !== action.worldAuthority.sceneId ||
        !Number.isSafeInteger(session.world.revision) || session.world.revision < 0 ||
        !Number.isSafeInteger(runtime.tick) || runtime.tick < 0 ||
        !finitePoint(runtime.player.position) ||
        Math.hypot(
          runtime.player.position.x - action.worldAuthority.interactionPointPx.x,
          runtime.player.position.y - action.worldAuthority.interactionPointPx.y,
        ) > action.worldAuthority.maximumDistancePx) {
      throw new Error("learning corpus action runtime authority rejected");
    }
    const scene = this.scenes.byId[action.worldAuthority.sceneId];
    const target = scene?.targets.find((candidate) => candidate.id === action.worldAuthority.targetId);
    const interaction = scene?.interactions.find((candidate) =>
      candidate.id === action.worldAuthority.interactionId);
    if (!scene || !target?.interactionPointTiles || !interaction ||
        interaction.targetId !== target.id || target.kind !== action.worldAuthority.sourceObjectClass) {
      throw new Error("learning corpus action runtime scene authority rejected");
    }
    const body = {
      schema: LEARNING_CORPUS_WORLD_AUTHORITY_SCHEMA,
      corpusId: pkg.corpusId,
      corpusSemanticDigest: pkg.semanticDigest,
      playerSaveId,
      actionId,
      sceneId: action.worldAuthority.sceneId,
      targetId: action.worldAuthority.targetId,
      interactionId: action.worldAuthority.interactionId,
      sourceObjectClass: action.worldAuthority.sourceObjectClass,
      sessionWorldRevision: session.world.revision,
      runtimeTick: runtime.tick,
      playerPositionPx: Object.freeze({ ...runtime.player.position }),
    } as const;
    const authorityDigest = computeRuntimeManifestDigest(body);
    const receipt = Object.freeze({ ...body,
      receiptId: `learning-corpus-authority:${authorityDigest.slice("sha256:".length)}`,
      authorityDigest });
    const proof = Object.freeze({ kind: "learning_corpus_action_authority" as const, receipt });
    trustedProofs.add(proof);
    return proof;
  }
}

export function consumeTrustedLearningCorpusActionProof(
  proof: LearningCorpusActionAuthorityProof,
  pkg: RuntimeLearningCorpusPackage,
  playerSaveId: string,
  actionId: string,
): LearningCorpusWorldAuthorityReceipt | null {
  if (!trustedProofs.has(proof) || consumedProofs.has(proof) ||
      !validLearningCorpusWorldAuthorityReceipt(proof.receipt, pkg, playerSaveId, actionId)) {
    return null;
  }
  consumedProofs.add(proof);
  return proof.receipt;
}

export function validLearningCorpusWorldAuthorityReceipt(
  value: unknown,
  pkg: RuntimeLearningCorpusPackage,
  playerSaveId: string,
  actionId: string,
): value is LearningCorpusWorldAuthorityReceipt {
  if (!record(value)) return false;
  const action = findAction(pkg, actionId);
  if (!action || !exactKeys(value, ["schema", "receiptId", "authorityDigest", "corpusId",
    "corpusSemanticDigest", "playerSaveId", "actionId", "sceneId", "targetId", "interactionId",
    "sourceObjectClass", "sessionWorldRevision", "runtimeTick", "playerPositionPx"]) ||
      value.schema !== LEARNING_CORPUS_WORLD_AUTHORITY_SCHEMA || value.corpusId !== pkg.corpusId ||
      value.corpusSemanticDigest !== pkg.semanticDigest || value.playerSaveId !== playerSaveId ||
      value.actionId !== actionId || value.sceneId !== action.worldAuthority.sceneId ||
      value.targetId !== action.worldAuthority.targetId ||
      value.interactionId !== action.worldAuthority.interactionId ||
      value.sourceObjectClass !== action.worldAuthority.sourceObjectClass ||
      !nonNegativeInteger(value.sessionWorldRevision) || !nonNegativeInteger(value.runtimeTick) ||
      !record(value.playerPositionPx) || !exactKeys(value.playerPositionPx, ["x", "y"]) ||
      !finitePoint(value.playerPositionPx) || typeof value.authorityDigest !== "string" ||
      typeof value.receiptId !== "string") return false;
  const body = {
    schema: value.schema,
    corpusId: value.corpusId,
    corpusSemanticDigest: value.corpusSemanticDigest,
    playerSaveId: value.playerSaveId,
    actionId: value.actionId,
    sceneId: value.sceneId,
    targetId: value.targetId,
    interactionId: value.interactionId,
    sourceObjectClass: value.sourceObjectClass,
    sessionWorldRevision: value.sessionWorldRevision,
    runtimeTick: value.runtimeTick,
    playerPositionPx: { x: value.playerPositionPx.x, y: value.playerPositionPx.y },
  };
  const authorityDigest = computeRuntimeManifestDigest(body);
  return value.authorityDigest === authorityDigest &&
    value.receiptId === `learning-corpus-authority:${authorityDigest.slice("sha256:".length)}` &&
    Math.hypot(
      value.playerPositionPx.x - action.worldAuthority.interactionPointPx.x,
      value.playerPositionPx.y - action.worldAuthority.interactionPointPx.y,
    ) <= action.worldAuthority.maximumDistancePx;
}

function findAction(pkg: RuntimeLearningCorpusPackage, actionId: string):
  RuntimeLearningCorpusAction | undefined {
  return Object.values(pkg.words).flatMap((word) => word.actions)
    .find((candidate) => candidate.actionId === actionId);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && new Set(keys).size === keys.length &&
    expected.every((key) => keys.includes(key));
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function finitePoint(value: unknown): value is { readonly x: number; readonly y: number } {
  return record(value) && typeof value.x === "number" && Number.isFinite(value.x) &&
    typeof value.y === "number" && Number.isFinite(value.y);
}
