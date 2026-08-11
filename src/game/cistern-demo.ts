import {
  type CastExecutionResult,
  type LivingSafetyZone,
  type MpRecoveryProposal,
  type MpRecoveryReceipt,
  type PointPx,
  type TeloCanonicalAst,
  type TeloCastPlan,
} from "../spells/cast-plan";
import { Material } from "../sim/materials";
import {
  LengthCisternSlice,
  type WaterReceiverResult,
  type WaterReceiverSpec,
  type WorldMaterialEdit,
} from "./length-cistern-slice";

export type CisternExpressionId = "telo_lili" | "telo" | "telo_suli";
export type CisternDirectionId = "east" | "south_east" | "south" | "south_west" |
  "west" | "north_west" | "north" | "north_east";
export type CisternStageId = "short" | "default" | "long" | "completed";

export interface CisternReceiverStageSpec extends WaterReceiverSpec {
  readonly stageId: Exclude<CisternStageId, "completed">;
}

export interface CisternDemoOptions {
  readonly widthCells?: number;
  readonly heightCells?: number;
  readonly initialMp?: number;
  readonly maxMp?: number;
  readonly seed?: number;
  readonly stageSpecs?: readonly [CisternReceiverStageSpec, CisternReceiverStageSpec, CisternReceiverStageSpec];
  readonly initialWorldEdits?: readonly WorldMaterialEdit[];
  readonly initialExpression?: CisternExpressionId;
  readonly initialDirection?: CisternDirectionId;
  readonly initialTargetAnchorPx?: PointPx;
}

export interface CisternReceiverState extends WaterReceiverResult {
  readonly stageId: Exclude<CisternStageId, "completed">;
  readonly latched: boolean;
  readonly isCurrentStage: boolean;
}

export interface CisternDemoSnapshot {
  readonly selectedExpression: CisternExpressionId;
  readonly selectedDirection: CisternDirectionId;
  readonly targetAnchorPx: PointPx;
  readonly pendingPlan: TeloCastPlan | null;
  readonly mp: number;
  readonly maxMp: number;
  readonly worldVersion: number;
  readonly stage: CisternStageId;
  readonly completed: boolean;
  readonly receivers: readonly CisternReceiverState[];
}

export type CisternPreviewRejectionCode = "pending_preview_exists";

export interface CisternPreviewResult {
  readonly accepted: boolean;
  readonly plan: TeloCastPlan | null;
  readonly rejectionCode: CisternPreviewRejectionCode | null;
  readonly snapshot: CisternDemoSnapshot;
}

export type CisternConfirmRejectionCode = "no_pending_preview";

export interface CisternConfirmResult {
  readonly accepted: boolean;
  readonly execution: CastExecutionResult | null;
  readonly rejectionCode: CisternConfirmRejectionCode | null;
  readonly snapshot: CisternDemoSnapshot;
}

export type CisternPhysicsRejectionCode = "pending_preview_exists";

export interface CisternPhysicsResult {
  readonly advanced: boolean;
  readonly ticks: number;
  readonly rejectionCode: CisternPhysicsRejectionCode | null;
  readonly snapshot: CisternDemoSnapshot;
}

export type CisternMpRecoveryRejectionCode = "pending_preview_exists";

export interface CisternMpRecoveryResult {
  readonly accepted: boolean;
  readonly receipt: MpRecoveryReceipt | null;
  readonly rejectionCode: CisternMpRecoveryRejectionCode | null;
  readonly snapshot: CisternDemoSnapshot;
}

const EXPRESSION_AST: Readonly<Record<CisternExpressionId, TeloCanonicalAst>> = Object.freeze({
  telo_lili: Object.freeze({ head: "word.telo", lengthModifier: "word.lili" }),
  telo: Object.freeze({ head: "word.telo", lengthModifier: null }),
  telo_suli: Object.freeze({ head: "word.telo", lengthModifier: "word.suli" }),
});

export const CISTERN_DIRECTIONS: Readonly<Record<CisternDirectionId, PointPx>> = Object.freeze({
  east: Object.freeze({ x: 1, y: 0 }),
  south_east: Object.freeze({ x: 1, y: 1 }),
  south: Object.freeze({ x: 0, y: 1 }),
  south_west: Object.freeze({ x: -1, y: 1 }),
  west: Object.freeze({ x: -1, y: 0 }),
  north_west: Object.freeze({ x: -1, y: -1 }),
  north: Object.freeze({ x: 0, y: -1 }),
  north_east: Object.freeze({ x: 1, y: -1 }),
});

const STAGE_ORDER = ["short", "default", "long"] as const;
const DEFAULT_WIDTH_CELLS = 100;
const DEFAULT_HEIGHT_CELLS = 40;

const isPositiveSafeInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

const cloneEdit = (edit: WorldMaterialEdit): WorldMaterialEdit => Object.freeze({ ...edit });

const cloneStage = (stage: CisternReceiverStageSpec): CisternReceiverStageSpec => Object.freeze({
  ...stage,
  boundsCells: Object.freeze({ ...stage.boundsCells }),
});

export const createDefaultCisternStages = (
  widthCells = DEFAULT_WIDTH_CELLS,
  heightCells = DEFAULT_HEIGHT_CELLS,
): readonly [CisternReceiverStageSpec, CisternReceiverStageSpec, CisternReceiverStageSpec] => {
  if (!isPositiveSafeInteger(widthCells) || widthCells < 76 ||
      !isPositiveSafeInteger(heightCells) || heightCells < 8) {
    throw new RangeError("default cistern stage layout requires at least 76x8 cells");
  }
  const y = heightCells - 7;
  return Object.freeze([
    cloneStage({
      stageId: "short",
      receiverId: "receiver.short",
      boundsCells: { x: 4, y, width: 8, height: 6 },
      minimumWaterCells: 48,
    }),
    cloneStage({
      stageId: "default",
      receiverId: "receiver.default",
      boundsCells: { x: Math.floor(widthCells / 2) - 8, y, width: 16, height: 6 },
      minimumWaterCells: 96,
    }),
    cloneStage({
      stageId: "long",
      receiverId: "receiver.long",
      boundsCells: { x: widthCells - 34, y, width: 32, height: 6 },
      minimumWaterCells: 192,
    }),
  ]);
};

const defaultFloor = (widthCells: number, heightCells: number): readonly WorldMaterialEdit[] =>
  Object.freeze(Array.from({ length: widthCells }, (_, cellX) => cloneEdit({
    cellX,
    cellY: heightCells - 1,
    material: Material.Rock,
  })));

const validateStageOrder = (
  stages: readonly [CisternReceiverStageSpec, CisternReceiverStageSpec, CisternReceiverStageSpec],
): void => {
  const receiverIds = new Set<string>();
  stages.forEach((stage, index) => {
    if (stage.stageId !== STAGE_ORDER[index]) throw new Error("cistern stageSpecs must be short/default/long");
    if (receiverIds.has(stage.receiverId)) throw new Error("cistern receiverId values must be unique");
    receiverIds.add(stage.receiverId);
  });
};

const isExpressionId = (value: string): value is CisternExpressionId => value in EXPRESSION_AST;
const isDirectionId = (value: string): value is CisternDirectionId => value in CISTERN_DIRECTIONS;

/**
 * DOM-free controller for the playable L-01 graybox. A pending preview freezes
 * its expression, anchor, direction and world revision until confirm/cancel.
 */
export class CisternDemoController {
  readonly widthCells: number;
  readonly heightCells: number;

  private readonly initialMp: number;
  private readonly maxMp: number;
  private readonly seed: number;
  private readonly stageSpecs: readonly [CisternReceiverStageSpec, CisternReceiverStageSpec, CisternReceiverStageSpec];
  private readonly initialWorldEdits: readonly WorldMaterialEdit[];
  private readonly initialExpression: CisternExpressionId;
  private readonly initialDirection: CisternDirectionId;
  private readonly initialTargetAnchorPx: PointPx;
  private slice: LengthCisternSlice;
  private selectedExpression: CisternExpressionId;
  private selectedDirection: CisternDirectionId;
  private targetAnchorPx: PointPx;
  private pendingPlan: TeloCastPlan | null = null;
  private currentStageIndex = 0;
  private readonly latchedReceiverIds = new Set<string>();

  constructor(options: CisternDemoOptions = {}) {
    this.widthCells = options.widthCells ?? DEFAULT_WIDTH_CELLS;
    this.heightCells = options.heightCells ?? DEFAULT_HEIGHT_CELLS;
    if (!isPositiveSafeInteger(this.widthCells) || !isPositiveSafeInteger(this.heightCells)) {
      throw new RangeError("cistern dimensions must be positive safe integers");
    }
    this.initialMp = options.initialMp ?? 24;
    this.maxMp = options.maxMp ?? this.initialMp;
    this.seed = options.seed ?? 0x6c3031;
    this.stageSpecs = Object.freeze((options.stageSpecs ??
      createDefaultCisternStages(this.widthCells, this.heightCells)).map(cloneStage)) as
      unknown as readonly [CisternReceiverStageSpec, CisternReceiverStageSpec, CisternReceiverStageSpec];
    validateStageOrder(this.stageSpecs);
    this.initialWorldEdits = Object.freeze((options.initialWorldEdits ??
      defaultFloor(this.widthCells, this.heightCells)).map(cloneEdit));
    this.initialExpression = options.initialExpression ?? "telo_lili";
    this.initialDirection = options.initialDirection ?? "east";
    if (!isExpressionId(this.initialExpression) || !isDirectionId(this.initialDirection)) {
      throw new Error("unknown initial expression or direction");
    }
    this.initialTargetAnchorPx = this.snapAndClampAnchor(options.initialTargetAnchorPx ??
      this.anchorForStage(this.stageSpecs[0]));
    this.selectedExpression = this.initialExpression;
    this.selectedDirection = this.initialDirection;
    this.targetAnchorPx = this.initialTargetAnchorPx;
    this.slice = this.buildSlice();
  }

  snapshot(): CisternDemoSnapshot {
    const world = this.slice.mpSnapshot();
    const currentStage: CisternStageId = this.currentStageIndex >= this.stageSpecs.length
      ? "completed" : this.stageSpecs[this.currentStageIndex]!.stageId;
    return Object.freeze({
      selectedExpression: this.selectedExpression,
      selectedDirection: this.selectedDirection,
      targetAnchorPx: Object.freeze({ ...this.targetAnchorPx }),
      pendingPlan: this.pendingPlan,
      mp: world.currentMp,
      maxMp: world.maxMp,
      worldVersion: world.worldVersion,
      stage: currentStage,
      completed: currentStage === "completed",
      receivers: Object.freeze(this.stageSpecs.map((stage) => {
        const result = this.slice.evaluateReceiver(stage);
        return Object.freeze({
          ...result,
          stageId: stage.stageId,
          latched: this.latchedReceiverIds.has(stage.receiverId),
          isCurrentStage: stage.stageId === currentStage,
        });
      })),
    });
  }

  setExpression(expression: CisternExpressionId): CisternDemoSnapshot {
    this.assertNoPendingPreview();
    if (!isExpressionId(expression)) throw new RangeError("unknown cistern expression");
    this.selectedExpression = expression;
    return this.snapshot();
  }

  setDirection(direction: CisternDirectionId): CisternDemoSnapshot {
    this.assertNoPendingPreview();
    if (!isDirectionId(direction)) throw new RangeError("unknown cistern direction");
    this.selectedDirection = direction;
    return this.snapshot();
  }

  setTargetAnchorPx(anchorPx: PointPx): CisternDemoSnapshot {
    this.assertNoPendingPreview();
    this.targetAnchorPx = this.snapAndClampAnchor(anchorPx);
    return this.snapshot();
  }

  /** Convenient target for the current receiver's eastward direct teaching solution. */
  targetCurrentReceiver(): CisternDemoSnapshot {
    this.assertNoPendingPreview();
    const stage = this.stageSpecs[this.currentStageIndex];
    if (stage) this.targetAnchorPx = this.anchorForStage(stage);
    return this.snapshot();
  }

  beginPreview(livingSafetyZones: readonly LivingSafetyZone[] = []): CisternPreviewResult {
    if (this.pendingPlan) {
      return Object.freeze({
        accepted: false,
        plan: this.pendingPlan,
        rejectionCode: "pending_preview_exists",
        snapshot: this.snapshot(),
      });
    }
    const plan = this.slice.preview({
      canonicalAst: EXPRESSION_AST[this.selectedExpression],
      anchorPx: this.targetAnchorPx,
      direction: CISTERN_DIRECTIONS[this.selectedDirection],
      livingSafetyZones,
    });
    this.pendingPlan = plan;
    return Object.freeze({
      accepted: true,
      plan,
      rejectionCode: null,
      snapshot: this.snapshot(),
    });
  }

  cancelPending(): CisternDemoSnapshot {
    this.pendingPlan = null;
    return this.snapshot();
  }

  confirmPending(
    idempotencyKey: string,
    currentLivingSafetyZones: readonly LivingSafetyZone[] = [],
  ): CisternConfirmResult {
    if (!this.pendingPlan) {
      return Object.freeze({
        accepted: false,
        execution: null,
        rejectionCode: "no_pending_preview",
        snapshot: this.snapshot(),
      });
    }
    const plan = this.pendingPlan;
    const execution = this.slice.confirm(plan, idempotencyKey, currentLivingSafetyZones);
    this.pendingPlan = null;
    if (execution.committed) this.latchSatisfiedWorldPredicates();
    return Object.freeze({
      accepted: execution.committed,
      execution,
      rejectionCode: null,
      snapshot: this.snapshot(),
    });
  }

  applyMpRecovery(proposal: MpRecoveryProposal): CisternMpRecoveryResult {
    if (this.pendingPlan) {
      return Object.freeze({
        accepted: false,
        receipt: null,
        rejectionCode: "pending_preview_exists",
        snapshot: this.snapshot(),
      });
    }
    const receipt = this.slice.applyMpRecovery(proposal);
    return Object.freeze({
      accepted: true,
      receipt,
      rejectionCode: null,
      snapshot: this.snapshot(),
    });
  }

  advancePhysics(ticks = 1): CisternPhysicsResult {
    if (this.pendingPlan) {
      return Object.freeze({
        advanced: false,
        ticks: 0,
        rejectionCode: "pending_preview_exists",
        snapshot: this.snapshot(),
      });
    }
    this.slice.advancePhysics(ticks);
    this.latchSatisfiedWorldPredicates();
    return Object.freeze({
      advanced: true,
      ticks,
      rejectionCode: null,
      snapshot: this.snapshot(),
    });
  }

  /** Rebuilds the in-memory ledger; persisted recovery receipts are a later save-layer concern. */
  reset(): CisternDemoSnapshot {
    this.slice = this.buildSlice();
    this.selectedExpression = this.initialExpression;
    this.selectedDirection = this.initialDirection;
    this.targetAnchorPx = this.initialTargetAnchorPx;
    this.pendingPlan = null;
    this.currentStageIndex = 0;
    this.latchedReceiverIds.clear();
    return this.snapshot();
  }

  materialAtCell(cellX: number, cellY: number): Material {
    return this.slice.materialAtCell(cellX, cellY);
  }

  private buildSlice(): LengthCisternSlice {
    const slice = new LengthCisternSlice(
      this.widthCells,
      this.heightCells,
      this.initialMp,
      this.seed,
      this.maxMp,
    );
    if (this.initialWorldEdits.length > 0) slice.applyWorldEdits(this.initialWorldEdits);
    for (const stage of this.stageSpecs) slice.evaluateReceiver(stage);
    return slice;
  }

  private latchSatisfiedWorldPredicates(): void {
    while (this.currentStageIndex < this.stageSpecs.length) {
      const stage = this.stageSpecs[this.currentStageIndex]!;
      if (!this.slice.evaluateReceiver(stage).satisfied) break;
      this.latchedReceiverIds.add(stage.receiverId);
      this.currentStageIndex += 1;
    }
  }

  private anchorForStage(stage: CisternReceiverStageSpec): PointPx {
    return Object.freeze({
      x: stage.boundsCells.x * 2,
      y: (stage.boundsCells.y + Math.floor(stage.boundsCells.height / 2)) * 2,
    });
  }

  private snapAndClampAnchor(anchorPx: PointPx): PointPx {
    if (!Number.isFinite(anchorPx.x) || !Number.isFinite(anchorPx.y)) {
      throw new RangeError("target anchor must contain finite coordinates");
    }
    const maxX = (this.widthCells - 1) * 2;
    const maxY = (this.heightCells - 1) * 2;
    const snap = (value: number, maximum: number): number =>
      Math.round(Math.max(0, Math.min(maximum, value)) / 2) * 2;
    return Object.freeze({ x: snap(anchorPx.x, maxX), y: snap(anchorPx.y, maxY) });
  }

  private assertNoPendingPreview(): void {
    if (this.pendingPlan) throw new Error("cannot change cast controls while a preview is pending");
  }
}
