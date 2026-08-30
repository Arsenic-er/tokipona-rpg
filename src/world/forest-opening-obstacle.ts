import { sha256Canonical, type JsonValue } from "../canonical-json";
import type {
  ForestOpeningSolutionId,
  RuntimeForestOpeningManifest,
} from "../content/runtime-forest-opening-manifest";
import { isVerifiedRuntimeForestOpeningManifest } from "../content/runtime-forest-opening-manifest";
import { intersects, type Aabb } from "../runtime/geometry";

export const FOREST_OPENING_MATERIAL = Object.freeze({
  air: 0,
  water: 1,
  soft_soil: 2,
  mud: 3,
  light_debris: 4,
  stone: 5,
  deadwood: 6,
  protected_mass: 7,
} as const);

export type ForestOpeningMaterial = typeof FOREST_OPENING_MATERIAL[keyof typeof FOREST_OPENING_MATERIAL];
export type ForestOpeningInteraction =
  | { readonly kind: "push_stone"; readonly objectId: "stream.stone.a" | "stream.stone.b"; readonly direction: -1 | 1 }
  | { readonly kind: "drag_deadwood"; readonly objectId: "stream.deadwood"; readonly direction: -1 | 1 }
  | { readonly kind: "enter_shallow_detour" };

export interface ForestOpeningObstacleObjectState {
  readonly bounds: Aabb;
  readonly seated?: boolean;
  readonly bridged?: boolean;
}

export interface ForestOpeningObstacleOperationReceipt {
  readonly operationId: string;
  readonly requestHash: `sha256:${string}`;
  readonly resultRevision: number;
}

export interface ForestOpeningObstacleSave {
  readonly schema: "tokipona.forest-opening-obstacle.v0.1";
  readonly revision: number;
  readonly committedSolutionId: ForestOpeningSolutionId | null;
  readonly stones: Readonly<{
    a: ForestOpeningObstacleObjectState & Readonly<{ seated: boolean }>;
    b: ForestOpeningObstacleObjectState & Readonly<{ seated: boolean }>;
  }>;
  readonly deadwood: ForestOpeningObstacleObjectState & Readonly<{ bridged: boolean }>;
  readonly shallowDetourEntered: boolean;
  readonly materialTick: number;
  readonly materialCells: readonly number[];
  readonly operationReceipts: readonly ForestOpeningObstacleOperationReceipt[];
}

export interface ForestOpeningMaterialPocketSnapshot {
  readonly width: 128;
  readonly height: 64;
  readonly tick: number;
  readonly cells: readonly number[];
  readonly stateDigest: `sha256:${string}`;
}

export interface ForestOpeningObstacleSnapshot {
  readonly revision: number;
  readonly committedSolutionId: ForestOpeningSolutionId | null;
  readonly stones: ForestOpeningObstacleSave["stones"];
  readonly deadwood: ForestOpeningObstacleSave["deadwood"];
  readonly shallowDetourEntered: boolean;
  readonly materialPocket: ForestOpeningMaterialPocketSnapshot;
  readonly stateDigest: `sha256:${string}`;
}

export type ForestOpeningObstacleFailureReason =
  | "stale_revision"
  | "out_of_range"
  | "blocked"
  | "solution_conflict";

export type ForestOpeningObstacleActionResult =
  | Readonly<{ ok: true; duplicate: boolean; snapshot: ForestOpeningObstacleSnapshot }>
  | Readonly<{ ok: false; reason: ForestOpeningObstacleFailureReason; snapshot: ForestOpeningObstacleSnapshot }>;

const WIDTH = 128;
const HEIGHT = 64;
const INTERACTION_RADIUS_PX = 48;
const MATERIALS = new Set<number>(Object.values(FOREST_OPENING_MATERIAL));

export class ForestOpeningObstacle {
  private readonly manifest: RuntimeForestOpeningManifest;
  private revision: number;
  private committedSolutionId: ForestOpeningSolutionId | null;
  private stones: ForestOpeningObstacleSave["stones"];
  private deadwood: ForestOpeningObstacleSave["deadwood"];
  private shallowDetourEntered: boolean;
  private materialTick: number;
  private materialCells: Uint8Array;
  private readonly operationReceipts = new Map<string, ForestOpeningObstacleOperationReceipt>();

  private constructor(manifest: RuntimeForestOpeningManifest, save: ForestOpeningObstacleSave) {
    this.manifest = manifest;
    this.revision = save.revision;
    this.committedSolutionId = save.committedSolutionId;
    this.stones = freezeStones(save.stones);
    this.deadwood = freezeDeadwood(save.deadwood);
    this.shallowDetourEntered = save.shallowDetourEntered;
    this.materialTick = save.materialTick;
    this.materialCells = Uint8Array.from(save.materialCells);
    for (const receipt of save.operationReceipts) this.operationReceipts.set(receipt.operationId, Object.freeze({ ...receipt }));
  }

  public static fresh(manifest: RuntimeForestOpeningManifest): ForestOpeningObstacle {
    assertManifest(manifest);
    const cells = initialMaterialCells();
    const anchors = manifest.obstacle.objectAnchorsPx;
    return new ForestOpeningObstacle(manifest, {
      schema: "tokipona.forest-opening-obstacle.v0.1",
      revision: 0,
      committedSolutionId: null,
      stones: {
        a: { bounds: { x: anchors.stoneA[0], y: anchors.stoneA[1], width: 12, height: 12 }, seated: false },
        b: { bounds: { x: anchors.stoneB[0], y: anchors.stoneB[1], width: 12, height: 12 }, seated: false },
      },
      deadwood: { bounds: { x: anchors.deadwood[0], y: anchors.deadwood[1], width: 64, height: 8 }, bridged: false },
      shallowDetourEntered: false,
      materialTick: 0,
      materialCells: [...cells],
      operationReceipts: [],
    });
  }

  public static fromSave(
    manifest: RuntimeForestOpeningManifest,
    candidate: unknown,
  ): ForestOpeningObstacle {
    assertManifest(manifest);
    const save = readObstacleSave(candidate);
    validateSavedPhysicalState(manifest, save);
    return new ForestOpeningObstacle(manifest, save);
  }

  public applyInteraction(
    operationId: string,
    request: ForestOpeningInteraction,
    context: Readonly<{ actorBounds: Aabb; expectedRevision: number }>,
  ): ForestOpeningObstacleActionResult {
    if (!operationId.trim()) throw new Error("forest opening operation ID must not be empty");
    validateRequest(request);
    validateActorBounds(context.actorBounds);
    const requestHash = sha256Canonical(request as unknown as JsonValue);
    const existing = this.operationReceipts.get(operationId);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("forest opening operation payload conflict");
      return Object.freeze({ ok: true, duplicate: true, snapshot: this.snapshot() });
    }
    if (!Number.isSafeInteger(context.expectedRevision) || context.expectedRevision !== this.revision) {
      return failure("stale_revision", this.snapshot());
    }
    const activeSolution = this.activeSolution();
    if (activeSolution !== null && requestedSolution(request) !== activeSolution) {
      return failure("solution_conflict", this.snapshot());
    }
    const target = targetBounds(request, this.stones, this.deadwood, this.manifest.obstacle.materialPocketPx);
    if (!isWithinRange(context.actorBounds, target, INTERACTION_RADIUS_PX)) {
      return failure("out_of_range", this.snapshot());
    }
    const changed = this.applyKnownInteraction(request);
    if (!changed) return failure("blocked", this.snapshot());
    this.revision += 1;
    this.updateCommittedSolution();
    this.operationReceipts.set(operationId, Object.freeze({
      operationId,
      requestHash,
      resultRevision: this.revision,
    }));
    return Object.freeze({ ok: true, duplicate: false, snapshot: this.snapshot() });
  }

  public advanceTicks(ticks: number): ForestOpeningObstacleSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("forest opening material ticks must be non-negative");
    const nextTick = this.materialTick + ticks;
    if (!Number.isSafeInteger(nextTick)) throw new Error("forest opening material tick overflow");
    this.materialTick = nextTick;
    this.materialCells = materialCellsAtTick(nextTick);
    return this.snapshot();
  }

  public materialAt(x: number, y: number): ForestOpeningMaterial {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
      return FOREST_OPENING_MATERIAL.protected_mass;
    }
    return this.materialCells[y * WIDTH + x] as ForestOpeningMaterial;
  }

  public blocksTraversal(bounds: Aabb): boolean {
    if (this.committedSolutionId === "stone_steps") {
      return (this.stones.a.seated && intersects(bounds, this.stones.a.bounds)) ||
        (this.stones.b.seated && intersects(bounds, this.stones.b.bounds));
    }
    if (this.committedSolutionId === "deadwood_bridge") {
      return this.deadwood.bridged && intersects(bounds, this.deadwood.bounds);
    }
    if (this.committedSolutionId === "shallow_detour") {
      return this.materialPocketBlocks(bounds);
    }
    const road = this.manifest.obstacle.boundsPx;
    const crossingGate = {
      x: road.x + road.width,
      y: road.y,
      width: 16,
      height: road.height,
    };
    return intersects(bounds, crossingGate);
  }

  public resetToCommittedState(materialTick = this.materialTick): ForestOpeningObstacleSnapshot {
    if (!Number.isSafeInteger(materialTick) || materialTick < 0) {
      throw new Error("forest opening reset material tick is invalid");
    }
    if (this.committedSolutionId !== null) return this.snapshot();
    const fresh = ForestOpeningObstacle.fresh(this.manifest);
    this.revision = fresh.revision;
    this.committedSolutionId = fresh.committedSolutionId;
    this.stones = fresh.stones;
    this.deadwood = fresh.deadwood;
    this.shallowDetourEntered = fresh.shallowDetourEntered;
    this.materialTick = materialTick;
    this.materialCells = materialCellsAtTick(materialTick);
    this.operationReceipts.clear();
    return this.snapshot();
  }

  public snapshot(): ForestOpeningObstacleSnapshot {
    const cells = Object.freeze([...this.materialCells]);
    const materialBody = { width: WIDTH, height: HEIGHT, tick: this.materialTick, cells } as const;
    const materialPocket = Object.freeze({
      ...materialBody,
      stateDigest: sha256Canonical(materialBody as unknown as JsonValue),
    });
    const body = {
      revision: this.revision,
      committedSolutionId: this.committedSolutionId,
      stones: freezeStones(this.stones),
      deadwood: freezeDeadwood(this.deadwood),
      shallowDetourEntered: this.shallowDetourEntered,
      materialPocket,
    };
    return Object.freeze({
      ...body,
      stateDigest: sha256Canonical({
        ...body,
        materialPocket: materialPocket.stateDigest,
      } as unknown as JsonValue),
    });
  }

  public save(): ForestOpeningObstacleSave {
    return Object.freeze({
      schema: "tokipona.forest-opening-obstacle.v0.1",
      revision: this.revision,
      committedSolutionId: this.committedSolutionId,
      stones: freezeStones(this.stones),
      deadwood: freezeDeadwood(this.deadwood),
      shallowDetourEntered: this.shallowDetourEntered,
      materialTick: this.materialTick,
      materialCells: Object.freeze([...this.materialCells]),
      operationReceipts: Object.freeze([...this.operationReceipts.values()].map((receipt) => Object.freeze({ ...receipt }))),
    });
  }

  private applyKnownInteraction(request: ForestOpeningInteraction): boolean {
    if (request.kind === "push_stone") {
      if (request.direction !== 1) return false;
      if (request.objectId === "stream.stone.a") {
        if (this.stones.a.seated) return false;
        this.stones = freezeStones({
          ...this.stones,
          a: { bounds: { x: 1872, y: 736, width: 12, height: 12 }, seated: true },
        });
      } else {
        if (this.stones.b.seated) return false;
        this.stones = freezeStones({
          ...this.stones,
          b: { bounds: { x: 1904, y: 736, width: 12, height: 12 }, seated: true },
        });
      }
      return true;
    }
    if (request.kind === "drag_deadwood") {
      if (request.direction !== 1 || this.deadwood.bridged) return false;
      this.deadwood = freezeDeadwood({
        bounds: { x: 1936, y: 732, width: 64, height: 8 },
        bridged: true,
      });
      return true;
    }
    if (this.shallowDetourEntered) return false;
    this.shallowDetourEntered = true;
    return true;
  }

  private updateCommittedSolution(): void {
    if (this.committedSolutionId !== null) return;
    if (this.stones.a.seated && this.stones.b.seated) this.committedSolutionId = "stone_steps";
    else if (this.deadwood.bridged) this.committedSolutionId = "deadwood_bridge";
    else if (this.shallowDetourEntered) this.committedSolutionId = "shallow_detour";
  }

  private activeSolution(): ForestOpeningSolutionId | null {
    if (this.committedSolutionId !== null) return this.committedSolutionId;
    if (this.stones.a.seated || this.stones.b.seated) return "stone_steps";
    if (this.deadwood.bridged) return "deadwood_bridge";
    if (this.shallowDetourEntered) return "shallow_detour";
    return null;
  }

  private materialPocketBlocks(bounds: Aabb): boolean {
    const pocket = this.manifest.obstacle.materialPocketPx;
    if (!intersects(bounds, pocket)) return false;
    const left = Math.max(0, Math.floor(bounds.x - pocket.x));
    const right = Math.min(WIDTH - 1, Math.ceil(bounds.x + bounds.width - pocket.x) - 1);
    const top = Math.max(0, Math.floor(bounds.y - pocket.y));
    const bottom = Math.min(HEIGHT - 1, Math.ceil(bounds.y + bounds.height - pocket.y) - 1);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const material = this.materialAt(x, y);
        if (material === FOREST_OPENING_MATERIAL.soft_soil ||
            material === FOREST_OPENING_MATERIAL.mud ||
            material === FOREST_OPENING_MATERIAL.stone ||
            material === FOREST_OPENING_MATERIAL.deadwood) return true;
      }
    }
    return false;
  }
}

export function countForestOpeningMaterials(cells: readonly number[]): Record<keyof typeof FOREST_OPENING_MATERIAL, number> {
  const counts = {
    air: 0, water: 0, soft_soil: 0, mud: 0, light_debris: 0,
    stone: 0, deadwood: 0, protected_mass: 0,
  };
  for (const material of cells) {
    const key = (Object.entries(FOREST_OPENING_MATERIAL)
      .find(([, value]) => value === material)?.[0]) as keyof typeof counts | undefined;
    if (!key) throw new Error("forest opening material cell is invalid");
    counts[key] += 1;
  }
  return counts;
}

function initialMaterialCells(): Uint8Array {
  const cells = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = y * WIDTH + x;
      if (x < 4 || x >= WIDTH - 4) cells[index] = FOREST_OPENING_MATERIAL.protected_mass;
      else if (y >= 48) cells[index] = FOREST_OPENING_MATERIAL.soft_soil;
      else if (y >= 40) cells[index] = FOREST_OPENING_MATERIAL.water;
      else cells[index] = FOREST_OPENING_MATERIAL.air;
    }
  }
  cells[38 * WIDTH + 48] = FOREST_OPENING_MATERIAL.light_debris;
  return cells;
}

function materialCellsAtTick(tick: number): Uint8Array {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("forest opening material tick is invalid");
  const cells = initialMaterialCells();
  if (tick === 0) return cells;
  for (let x = 4; x < WIDTH - 4; x += 1) {
    cells[48 * WIDTH + x] = FOREST_OPENING_MATERIAL.mud;
  }
  cells[38 * WIDTH + 48] = FOREST_OPENING_MATERIAL.air;
  cells[38 * WIDTH + (tick % 2 === 1 ? 49 : 48)] = FOREST_OPENING_MATERIAL.light_debris;
  return cells;
}

function validateRequest(request: ForestOpeningInteraction): void {
  const raw = request as unknown as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("forest opening interaction must be an object");
  if (raw.kind === "push_stone") {
    exactKeys(raw, ["kind", "objectId", "direction"], "push stone interaction");
    if (!(raw.objectId === "stream.stone.a" || raw.objectId === "stream.stone.b")) throw new Error("forest opening stone ID is invalid");
    validateDirection(raw.direction);
    return;
  }
  if (raw.kind === "drag_deadwood") {
    exactKeys(raw, ["kind", "objectId", "direction"], "drag deadwood interaction");
    if (raw.objectId !== "stream.deadwood") throw new Error("forest opening deadwood ID is invalid");
    validateDirection(raw.direction);
    return;
  }
  if (raw.kind === "enter_shallow_detour") {
    exactKeys(raw, ["kind"], "shallow detour interaction");
    return;
  }
  throw new Error("forest opening interaction kind is invalid");
}

function validateDirection(value: unknown): asserts value is -1 | 1 {
  if (!(value === -1 || value === 1)) throw new Error("forest opening interaction direction is invalid");
}

function validateActorBounds(bounds: Aabb): void {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("forest opening actor bounds are invalid");
  }
}

function targetBounds(
  request: ForestOpeningInteraction,
  stones: ForestOpeningObstacleSave["stones"],
  deadwood: ForestOpeningObstacleSave["deadwood"],
  detour: Aabb,
): Aabb {
  if (request.kind === "push_stone") return request.objectId === "stream.stone.a" ? stones.a.bounds : stones.b.bounds;
  if (request.kind === "drag_deadwood") return deadwood.bounds;
  return detour;
}

function requestedSolution(request: ForestOpeningInteraction): ForestOpeningSolutionId {
  if (request.kind === "push_stone") return "stone_steps";
  if (request.kind === "drag_deadwood") return "deadwood_bridge";
  return "shallow_detour";
}

function isWithinRange(actor: Aabb, target: Aabb, radius: number): boolean {
  if (intersects(actor, target)) return true;
  const gapX = Math.max(target.x - (actor.x + actor.width), actor.x - (target.x + target.width), 0);
  const gapY = Math.max(target.y - (actor.y + actor.height), actor.y - (target.y + target.height), 0);
  return Math.hypot(gapX, gapY) <= radius;
}

function failure(reason: ForestOpeningObstacleFailureReason, snapshot: ForestOpeningObstacleSnapshot): ForestOpeningObstacleActionResult {
  return Object.freeze({ ok: false, reason, snapshot });
}

function freezeAabb(bounds: Aabb): Aabb {
  return Object.freeze({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
}

function freezeStones(stones: ForestOpeningObstacleSave["stones"]): ForestOpeningObstacleSave["stones"] {
  return Object.freeze({
    a: Object.freeze({ bounds: freezeAabb(stones.a.bounds), seated: stones.a.seated }),
    b: Object.freeze({ bounds: freezeAabb(stones.b.bounds), seated: stones.b.seated }),
  });
}

function freezeDeadwood(deadwood: ForestOpeningObstacleSave["deadwood"]): ForestOpeningObstacleSave["deadwood"] {
  return Object.freeze({ bounds: freezeAabb(deadwood.bounds), bridged: deadwood.bridged });
}

function assertManifest(manifest: RuntimeForestOpeningManifest): void {
  if (!isVerifiedRuntimeForestOpeningManifest(manifest)) throw new Error("forest opening obstacle requires a verified manifest");
}

function validateSavedPhysicalState(
  manifest: RuntimeForestOpeningManifest,
  save: ForestOpeningObstacleSave,
): void {
  const anchors = manifest.obstacle.objectAnchorsPx;
  const expectedStoneA = save.stones.a.seated
    ? { x: 1872, y: 736, width: 12, height: 12 }
    : { x: anchors.stoneA[0], y: anchors.stoneA[1], width: 12, height: 12 };
  const expectedStoneB = save.stones.b.seated
    ? { x: 1904, y: 736, width: 12, height: 12 }
    : { x: anchors.stoneB[0], y: anchors.stoneB[1], width: 12, height: 12 };
  const expectedDeadwood = save.deadwood.bridged
    ? { x: 1936, y: 732, width: 64, height: 8 }
    : { x: anchors.deadwood[0], y: anchors.deadwood[1], width: 64, height: 8 };
  if (!sameAabb(save.stones.a.bounds, expectedStoneA) ||
      !sameAabb(save.stones.b.bounds, expectedStoneB) ||
      !sameAabb(save.deadwood.bounds, expectedDeadwood)) {
    throw new Error("forest opening saved physical object state is invalid");
  }
  const stoneWork = save.stones.a.seated || save.stones.b.seated;
  const stoneComplete = save.stones.a.seated && save.stones.b.seated;
  const activeWork = Number(stoneWork) + Number(save.deadwood.bridged) + Number(save.shallowDetourEntered);
  const canonical = save.committedSolutionId === null
    ? activeWork <= 1 && !stoneComplete && !save.deadwood.bridged && !save.shallowDetourEntered
    : save.committedSolutionId === "stone_steps"
      ? stoneComplete && !save.deadwood.bridged && !save.shallowDetourEntered
      : save.committedSolutionId === "deadwood_bridge"
        ? !stoneWork && save.deadwood.bridged && !save.shallowDetourEntered
        : !stoneWork && !save.deadwood.bridged && save.shallowDetourEntered;
  if (!canonical) {
    throw new Error("forest opening saved solution does not match physical state");
  }
  const expectedMaterials = materialCellsAtTick(save.materialTick);
  if (save.materialCells.some((material, index) => material !== expectedMaterials[index])) {
    throw new Error("forest opening saved material state is invalid for its tick");
  }
}

function sameAabb(left: Aabb, right: Aabb): boolean {
  return left.x === right.x && left.y === right.y &&
    left.width === right.width && left.height === right.height;
}

function readObstacleSave(candidate: unknown): ForestOpeningObstacleSave {
  const raw = record(candidate, "forest opening obstacle save");
  exactKeys(raw, ["schema", "revision", "committedSolutionId", "stones", "deadwood", "shallowDetourEntered", "materialTick", "materialCells", "operationReceipts"], "forest opening obstacle save");
  if (raw.schema !== "tokipona.forest-opening-obstacle.v0.1" || !safeNonNegative(raw.revision) ||
      !safeNonNegative(raw.materialTick) || typeof raw.shallowDetourEntered !== "boolean") {
    throw new Error("forest opening obstacle save is invalid");
  }
  if (!(raw.committedSolutionId === null || ["stone_steps", "deadwood_bridge", "shallow_detour"].includes(raw.committedSolutionId as string))) {
    throw new Error("forest opening obstacle solution is invalid");
  }
  const stonesRaw = record(raw.stones, "forest opening stones");
  exactKeys(stonesRaw, ["a", "b"], "forest opening stones");
  const stones = {
    a: readStone(stonesRaw.a, "stone A"),
    b: readStone(stonesRaw.b, "stone B"),
  };
  const deadwood = readDeadwood(raw.deadwood);
  if (!Array.isArray(raw.materialCells) || raw.materialCells.length !== WIDTH * HEIGHT ||
      raw.materialCells.some((entry) => !Number.isSafeInteger(entry) || !MATERIALS.has(entry))) {
    throw new Error("forest opening material cells are invalid");
  }
  if (!Array.isArray(raw.operationReceipts)) throw new Error("forest opening operation receipts are invalid");
  const receipts = raw.operationReceipts.map((entry, index) => {
    const receipt = record(entry, `forest opening receipt[${index}]`);
    exactKeys(receipt, ["operationId", "requestHash", "resultRevision"], `forest opening receipt[${index}]`);
    if (typeof receipt.operationId !== "string" || !receipt.operationId.trim() ||
        typeof receipt.requestHash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(receipt.requestHash) ||
        !safeNonNegative(receipt.resultRevision)) throw new Error("forest opening operation receipt is invalid");
    return Object.freeze({
      operationId: receipt.operationId,
      requestHash: receipt.requestHash as `sha256:${string}`,
      resultRevision: receipt.resultRevision as number,
    });
  });
  if (new Set(receipts.map(({ operationId }) => operationId)).size !== receipts.length) throw new Error("forest opening operation receipts are duplicated");
  return Object.freeze({
    schema: "tokipona.forest-opening-obstacle.v0.1",
    revision: raw.revision as number,
    committedSolutionId: raw.committedSolutionId as ForestOpeningSolutionId | null,
    stones: freezeStones(stones),
    deadwood,
    shallowDetourEntered: raw.shallowDetourEntered,
    materialTick: raw.materialTick as number,
    materialCells: Object.freeze([...raw.materialCells] as number[]),
    operationReceipts: Object.freeze(receipts),
  });
}

function readStone(value: unknown, label: string): ForestOpeningObstacleSave["stones"]["a"] {
  const raw = record(value, label);
  exactKeys(raw, ["bounds", "seated"], label);
  if (typeof raw.seated !== "boolean") throw new Error(`${label} is invalid`);
  return Object.freeze({ bounds: readAabb(raw.bounds, `${label} bounds`), seated: raw.seated });
}

function readDeadwood(value: unknown): ForestOpeningObstacleSave["deadwood"] {
  const raw = record(value, "forest opening deadwood");
  exactKeys(raw, ["bounds", "bridged"], "forest opening deadwood");
  if (typeof raw.bridged !== "boolean") throw new Error("forest opening deadwood is invalid");
  return freezeDeadwood({ bounds: readAabb(raw.bounds, "deadwood bounds"), bridged: raw.bridged });
}

function readAabb(value: unknown, label: string): Aabb {
  const raw = record(value, label);
  exactKeys(raw, ["x", "y", "width", "height"], label);
  const bounds = raw as unknown as Aabb;
  validateActorBounds(bounds);
  return freezeAabb(bounds);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`);
}

function safeNonNegative(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
