import {
  CastExecutionLedger,
  compileTeloCast,
  type CastExecutionResult,
  type LivingSafetyZone,
  type MpLedgerSnapshot,
  type MpRecoveryProposal,
  type MpRecoveryReceipt,
  type PointPx,
  type SimulationCell,
  type TeloCanonicalAst,
  type TeloCastPlan,
} from "../spells/cast-plan";
import { MaterialGrid } from "../sim/material-grid";
import { MATERIALS, Material } from "../sim/materials";

export interface LengthCastDraft {
  readonly canonicalAst: TeloCanonicalAst;
  readonly anchorPx: PointPx;
  readonly direction: PointPx;
  readonly livingSafetyZones?: readonly LivingSafetyZone[];
}

export interface WorldMaterialEdit {
  readonly cellX: number;
  readonly cellY: number;
  readonly material: Material;
  /** MaterialGrid stores temperature in tenths of a degree Celsius. */
  readonly temperatureDeciC?: number;
}

export interface WaterReceiverSpec {
  readonly receiverId: string;
  readonly boundsCells: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * Temporary graybox threshold. A physical MU conversion remains a separate
   * balance decision and must not be inferred from the Material enum density.
   */
  readonly minimumWaterCells: number;
}

export interface WaterReceiverResult {
  readonly receiverId: string;
  readonly waterCells: number;
  readonly minimumWaterCells: number;
  readonly satisfied: boolean;
}

interface MaterialCellState {
  readonly index: number;
  readonly material: number;
  readonly temperature: number;
  readonly integrity: number;
  readonly phaseProgress: number;
  readonly burning: number;
  readonly lift: number;
}

const MAX_PHYSICS_TICKS_PER_BATCH = 600;

const isNonNegativeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const safeSum = (left: number, right: number): number => {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) throw new Error("receiver bounds sum must be a safe integer");
  return sum;
};

const validateReceiver = (
  receiver: WaterReceiverSpec,
  gridWidthCells: number,
  gridHeightCells: number,
): void => {
  const { x, y, width, height } = receiver.boundsCells;
  if (receiver.receiverId.trim().length === 0) throw new Error("receiverId is required");
  if (![x, y, width, height, receiver.minimumWaterCells].every(isNonNegativeInteger)) {
    throw new Error("receiver bounds and minimumWaterCells must be non-negative safe integers");
  }
  if (width === 0 || height === 0) throw new Error("receiver bounds must have positive area");
  const endX = safeSum(x, width);
  const endY = safeSum(y, height);
  if (endX > gridWidthCells || endY > gridHeightCells) {
    throw new Error("receiver bounds must be fully inside the material grid");
  }
  const capacity = width * height;
  if (!Number.isSafeInteger(capacity)) throw new Error("receiver capacity must be a safe integer");
  if (receiver.minimumWaterCells <= 0 || receiver.minimumWaterCells > capacity) {
    throw new Error("minimumWaterCells must be positive and no greater than receiver capacity");
  }
};

/**
 * Minimal L-01 world adapter.
 *
 * It intentionally owns no parser, UI, learning progression or glyph artwork.
 * The in-memory Ledger is a graybox transaction boundary only; cross-save WAL
 * and crash recovery remain the responsibility of the later persistence layer.
 */
export class LengthCisternSlice {
  private readonly grid: MaterialGrid;
  private readonly ledger: CastExecutionLedger;

  constructor(widthCells: number, heightCells: number, initialMp = 24, seed = 0x6c3031, maxMp = initialMp) {
    if (!Number.isSafeInteger(widthCells) || widthCells <= 0 ||
        !Number.isSafeInteger(heightCells) || heightCells <= 0) {
      throw new Error("grid dimensions must be positive integers");
    }
    this.grid = new MaterialGrid(widthCells, heightCells, seed);
    this.grid.clear(Material.Air);
    this.ledger = new CastExecutionLedger(initialMp, 0, maxMp);
  }

  snapshot(): Readonly<{ mp: number; worldVersion: number }> {
    return this.ledger.snapshot();
  }

  mpSnapshot(): MpLedgerSnapshot {
    return this.ledger.mpSnapshot();
  }

  applyMpRecovery(proposal: MpRecoveryProposal): MpRecoveryReceipt {
    return this.ledger.applyMpRecovery(proposal);
  }

  materialAtCell(cellX: number, cellY: number): Material {
    if (!Number.isSafeInteger(cellX) || !Number.isSafeInteger(cellY) || !this.grid.inBounds(cellX, cellY)) {
      throw new RangeError("material cell coordinates must be safe integers inside the grid");
    }
    return this.grid.getMaterial(cellX, cellY);
  }

  /** Applies one prevalidated edit batch and advances the authoritative revision once. */
  applyWorldEdits(edits: readonly WorldMaterialEdit[]): Readonly<{ mp: number; worldVersion: number }> {
    if (edits.length === 0) return this.ledger.snapshot();
    this.assertWorldVersionCanAdvance();
    const occupied = new Set<string>();
    for (const edit of edits) {
      if (!Number.isSafeInteger(edit.cellX) || !Number.isSafeInteger(edit.cellY) ||
          !this.grid.inBounds(edit.cellX, edit.cellY)) {
        throw new RangeError("world edit coordinates must be safe integers inside the grid");
      }
      if (!Number.isSafeInteger(edit.material) || MATERIALS[edit.material] === undefined) {
        throw new RangeError("world edit material is unknown");
      }
      if (edit.temperatureDeciC !== undefined && !Number.isSafeInteger(edit.temperatureDeciC)) {
        throw new RangeError("temperatureDeciC must be a safe integer");
      }
      const key = `${edit.cellX},${edit.cellY}`;
      if (occupied.has(key)) throw new Error("world edit batch contains duplicate cells");
      occupied.add(key);
    }

    const before = edits.map((edit) => this.captureCell(edit.cellX, edit.cellY));
    try {
      for (const edit of edits) {
        this.grid.setMaterial(edit.cellX, edit.cellY, edit.material, edit.temperatureDeciC);
      }
      return this.ledger.advanceWorldVersion();
    } catch (error) {
      this.restoreCells(before);
      throw error;
    }
  }

  /** Advances deterministic graybox physics and invalidates every older preview. */
  advancePhysics(ticks = 1): Readonly<{ mp: number; worldVersion: number }> {
    if (!Number.isSafeInteger(ticks) || ticks <= 0 || ticks > MAX_PHYSICS_TICKS_PER_BATCH) {
      throw new RangeError(`ticks must be an integer from 1 to ${MAX_PHYSICS_TICKS_PER_BATCH}`);
    }
    this.assertWorldVersionCanAdvance();
    for (let tick = 0; tick < ticks; tick += 1) this.grid.tick();
    return this.ledger.advanceWorldVersion();
  }

  /**
   * Finds the longest footprint that does not overwrite current matter. Every
   * retry must shorten by the plan's own simulation-cell size; the bounded loop
   * fails closed if a future compiler stops honoring that monotonic contract.
   */
  preview(draft: LengthCastDraft): TeloCastPlan {
    const snapshot = this.ledger.snapshot();
    let maximumRealizableLengthPx: number | undefined;
    let blockingObjectId: string | undefined;
    let previousRealizedLengthPx: number | undefined;
    let maximumAttempts: number | undefined;

    for (let attempt = 0; ; attempt += 1) {
      const plan = compileTeloCast({
        canonicalAst: draft.canonicalAst,
        anchorPx: draft.anchorPx,
        direction: draft.direction,
        currentMp: snapshot.mp,
        worldVersion: snapshot.worldVersion,
        maximumRealizableLengthPx,
        blockingObjectId,
        livingSafetyZones: draft.livingSafetyZones,
      });
      const geometry = plan.preview.geometry;
      const worldGeometry = geometry.worldPixelGeometry;
      const cellGeometry = geometry.simulationCellGeometry;
      maximumAttempts ??= Math.ceil(worldGeometry.nominalLengthPx / cellGeometry.cellSizePx) + 2;
      if (attempt >= maximumAttempts) throw new Error("environment truncation exceeded its bounded retry budget");
      if (previousRealizedLengthPx !== undefined &&
          worldGeometry.realizedLengthPx >= previousRealizedLengthPx) {
        throw new Error("environment truncation must strictly decrease realized length");
      }

      const blocked = this.nearestBlockedCell(plan);
      if (!blocked || worldGeometry.realizedLengthPx === 0) return plan;
      blockingObjectId = this.grid.inBounds(blocked.x, blocked.y)
        ? `material.cell.${blocked.x}.${blocked.y}`
        : `world.boundary.${blocked.x}.${blocked.y}`;
      const nextLength = Math.max(0, worldGeometry.realizedLengthPx - cellGeometry.cellSizePx);
      if (nextLength >= worldGeometry.realizedLengthPx) {
        throw new Error("environment truncation did not make progress");
      }
      previousRealizedLengthPx = worldGeometry.realizedLengthPx;
      maximumRealizableLengthPx = nextLength;
    }
  }

  confirm(
    plan: TeloCastPlan,
    idempotencyKey: string,
    currentLivingSafetyZones: readonly LivingSafetyZone[],
  ): CastExecutionResult {
    return this.ledger.commit(plan, idempotencyKey, (acceptedPlan) => {
      const geometry = acceptedPlan.execution.geometry;
      const worldGeometry = geometry.worldPixelGeometry;
      const safetyPlan = compileTeloCast({
        canonicalAst: acceptedPlan.canonicalAst,
        anchorPx: worldGeometry.anchorPx,
        direction: worldGeometry.direction,
        currentMp: acceptedPlan.quotedCurrentMp,
        worldVersion: acceptedPlan.quotedWorldVersion,
        maximumRealizableLengthPx: worldGeometry.realizedLengthPx,
        blockingObjectId: acceptedPlan.blockingObjectId ?? undefined,
        livingSafetyZones: currentLivingSafetyZones,
      });
      if (!safetyPlan.canConfirm || safetyPlan.planId !== acceptedPlan.planId) return false;

      const cells = geometry.simulationCellGeometry.manifestationCells;
      if (cells.length === 0 || cells.some((cell) =>
        !this.grid.inBounds(cell.x, cell.y) || this.grid.getMaterial(cell.x, cell.y) !== Material.Air,
      )) return false;

      const before = cells.map((cell) => this.captureCell(cell.x, cell.y));
      try {
        for (const cell of cells) this.grid.setMaterial(cell.x, cell.y, Material.Water);
        return true;
      } catch (error) {
        this.restoreCells(before);
        throw error;
      }
    });
  }

  /** Instantaneous graybox predicate; the task layer is responsible for latching completion. */
  evaluateReceiver(receiver: WaterReceiverSpec): WaterReceiverResult {
    validateReceiver(receiver, this.grid.width, this.grid.height);
    const { x, y, width, height } = receiver.boundsCells;
    let waterCells = 0;
    for (let offsetY = 0; offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < width; offsetX += 1) {
        if (this.grid.getMaterial(x + offsetX, y + offsetY) === Material.Water) waterCells += 1;
      }
    }
    return Object.freeze({
      receiverId: receiver.receiverId,
      waterCells,
      minimumWaterCells: receiver.minimumWaterCells,
      satisfied: waterCells >= receiver.minimumWaterCells,
    });
  }

  private nearestBlockedCell(plan: TeloCastPlan): SimulationCell | undefined {
    const geometry = plan.preview.geometry;
    const { anchorPx, direction } = geometry.worldPixelGeometry;
    const cellSizePx = geometry.simulationCellGeometry.cellSizePx;
    const magnitude = Math.hypot(direction.x, direction.y);
    let nearest: SimulationCell | undefined;
    let nearestAlong = Number.POSITIVE_INFINITY;
    for (const cell of geometry.simulationCellGeometry.manifestationCells) {
      if (this.grid.inBounds(cell.x, cell.y) && this.grid.getMaterial(cell.x, cell.y) === Material.Air) continue;
      const centerX = (cell.x + 0.5) * cellSizePx;
      const centerY = (cell.y + 0.5) * cellSizePx;
      const along = ((centerX - anchorPx.x) * direction.x + (centerY - anchorPx.y) * direction.y) / magnitude;
      if (along < nearestAlong ||
          (along === nearestAlong && nearest && (cell.y < nearest.y || (cell.y === nearest.y && cell.x < nearest.x)))) {
        nearest = cell;
        nearestAlong = along;
      }
    }
    return nearest;
  }

  private assertWorldVersionCanAdvance(): void {
    if (this.ledger.snapshot().worldVersion === Number.MAX_SAFE_INTEGER) {
      throw new Error("worldVersion cannot advance beyond Number.MAX_SAFE_INTEGER");
    }
  }

  private captureCell(cellX: number, cellY: number): MaterialCellState {
    const index = this.grid.index(cellX, cellY);
    return {
      index,
      material: this.grid.material[index],
      temperature: this.grid.temperature[index],
      integrity: this.grid.integrity[index],
      phaseProgress: this.grid.phaseProgress[index],
      burning: this.grid.burning[index],
      lift: this.grid.lift[index],
    };
  }

  private restoreCells(states: readonly MaterialCellState[]): void {
    for (const state of states) {
      this.grid.material[state.index] = state.material;
      this.grid.temperature[state.index] = state.temperature;
      this.grid.integrity[state.index] = state.integrity;
      this.grid.phaseProgress[state.index] = state.phaseProgress;
      this.grid.burning[state.index] = state.burning;
      this.grid.lift[state.index] = state.lift;
    }
  }
}
