import {
  TELO_CONTENT_PROFILE_VERSION,
  TELO_LENGTH_PROFILES,
  TELO_LOGICAL_PIXELS_PER_TILE,
  type ContentTeloLengthProfile,
} from "./content-profiles";

export const CAST_PLAN_PROFILE_VERSION = TELO_CONTENT_PROFILE_VERSION;
export const LOGICAL_PIXELS_PER_TILE = TELO_LOGICAL_PIXELS_PER_TILE;
export const SIMULATION_CELL_SIZE_PX = 2;

export type TeloLengthClass = "short" | "default" | "long";
export type TeloLengthModifierId = "word.lili" | "word.suli" | null;

export interface TeloCanonicalAst {
  readonly head: "word.telo";
  readonly lengthModifier: TeloLengthModifierId;
}

export interface PointPx {
  readonly x: number;
  readonly y: number;
}

export interface SimulationCell {
  readonly x: number;
  readonly y: number;
}

export interface RectPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LivingSafetyZone {
  readonly entityId: string;
  readonly boundsPx: RectPx;
  /** Defaults to the normal-creature margin frozen by L-01. */
  readonly marginPx?: number;
}

export interface TeloCastPlanRequest {
  readonly canonicalAst: TeloCanonicalAst;
  readonly anchorPx: PointPx;
  /** One of the eight public-focus directions. Components must be -1, 0, or 1. */
  readonly direction: PointPx;
  readonly currentMp: number;
  readonly worldVersion: number;
  /** Nearest environment-supported endpoint distance. Omit when unobstructed. */
  readonly maximumRealizableLengthPx?: number;
  readonly blockingObjectId?: string;
  readonly livingSafetyZones?: readonly LivingSafetyZone[];
}

export type CastPlanRejectionCode =
  | "unsupported_expression"
  | "invalid_anchor"
  | "invalid_direction"
  | "invalid_mp"
  | "invalid_world_version"
  | "invalid_realizable_length"
  | "invalid_living_safety_zone"
  | "requested_class_cannot_be_realized_here"
  | "living_safety_volume_blocked"
  | "requested_class_requires_more_mp";

export interface CastGeometry {
  readonly worldPixelGeometry: WorldPixelGeometry;
  readonly simulationCellGeometry: SimulationCellGeometry;
  readonly anchorPx: PointPx;
  readonly endpointPx: PointPx;
  readonly direction: PointPx;
  readonly nominalLengthPx: number;
  readonly realizedLengthPx: number;
  readonly fixedCrossSectionWidthPx: number;
  readonly simulationCellSizePx: 2;
  readonly simulationLengthCells: number;
  readonly simulationWidthCells: number;
  readonly simulationCells: readonly SimulationCell[];
  readonly manifestationCellCount: number;
  readonly massCalculationBasis: "world_pixel_area";
}

export interface WorldPixelGeometry {
  readonly anchorPx: PointPx;
  readonly endpointPx: PointPx;
  readonly direction: PointPx;
  readonly nominalLengthPx: number;
  readonly realizedLengthPx: number;
  readonly fixedCrossSectionWidthPx: number;
  readonly areaPx2: number;
}

export interface SimulationCellGeometry {
  readonly cellSizePx: 2;
  readonly lengthCells: number;
  readonly widthCells: number;
  readonly cells: readonly SimulationCell[];
  readonly manifestationCells: readonly SimulationCell[];
  readonly manifestationCellCount: number;
  readonly massCalculationBasis: "world_pixel_area";
}

export interface CastPlanGeometryUse {
  /** Preview and execution deliberately retain the exact same object. */
  readonly geometry: CastGeometry;
}

export interface TeloCastPlan {
  readonly planId: string;
  readonly profileVersion: typeof CAST_PLAN_PROFILE_VERSION;
  readonly canonicalAst: TeloCanonicalAst;
  readonly requestedLengthClass: TeloLengthClass;
  readonly resolvedLengthClass: TeloLengthClass;
  readonly activationMpRequired: number;
  readonly quotedCurrentMp: number;
  readonly quotedWorldVersion: number;
  readonly preview: CastPlanGeometryUse;
  readonly execution: CastPlanGeometryUse;
  readonly initialVelocityPxPerSecond: Readonly<PointPx>;
  readonly gravityApplies: true;
  readonly directAttack: false;
  readonly blockingObjectId: string | null;
  readonly blockedLivingEntityId: string | null;
  readonly canConfirm: boolean;
  readonly rejectionCode: CastPlanRejectionCode | null;
}

export type TeloLengthProfileSet = Readonly<Record<TeloLengthClass, ContentTeloLengthProfile>>;

const NORMAL_LIVING_SAFETY_MARGIN_PX = 8;

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const assertLengthProfileSet = (profiles: TeloLengthProfileSet): void => {
  if (!Object.isFrozen(profiles)) throw new Error("Telo length profile set must be frozen.");
  let profileVersion: string | null = null;
  for (const lengthClass of ["short", "default", "long"] as const) {
    const profile = profiles[lengthClass];
    if (!Object.isFrozen(profile)) throw new Error(`Telo ${lengthClass} profile must be frozen.`);
    if (profileVersion === null) profileVersion = profile.profileVersion;
    if (profile.profileVersion.length === 0 || profile.profileVersion !== profileVersion) {
      throw new Error("Telo length profiles must share one non-empty profile version.");
    }
    if (!Number.isSafeInteger(profile.nominalLengthPx) || profile.nominalLengthPx <= 0 ||
        profile.nominalLengthPx % SIMULATION_CELL_SIZE_PX !== 0 ||
        !Number.isSafeInteger(profile.minimumRealizedLengthPx) || profile.minimumRealizedLengthPx <= 0 ||
        profile.minimumRealizedLengthPx > profile.nominalLengthPx ||
        profile.minimumRealizedLengthPx % SIMULATION_CELL_SIZE_PX !== 0 ||
        !Number.isFinite(profile.activationMp) || profile.activationMp < 0 ||
        !Number.isSafeInteger(profile.crossSectionWidthPx) || profile.crossSectionWidthPx <= 0 ||
        profile.crossSectionWidthPx % SIMULATION_CELL_SIZE_PX !== 0) {
      throw new Error(`Telo ${lengthClass} profile is not simulation-compatible.`);
    }
  }
};

const isValidAnchor = (anchor: PointPx): boolean =>
  Number.isSafeInteger(anchor.x) && Number.isSafeInteger(anchor.y) &&
  anchor.x % SIMULATION_CELL_SIZE_PX === 0 &&
  anchor.y % SIMULATION_CELL_SIZE_PX === 0;

const isValidDirection = (direction: PointPx): boolean => {
  if (!Number.isInteger(direction.x) || !Number.isInteger(direction.y)) return false;
  if (direction.x < -1 || direction.x > 1 || direction.y < -1 || direction.y > 1) return false;
  return direction.x !== 0 || direction.y !== 0;
};

const classForModifier = (modifier: TeloLengthModifierId): TeloLengthClass => {
  if (modifier === "word.lili") return "short";
  if (modifier === "word.suli") return "long";
  return "default";
};

const normalizeDirection = (direction: PointPx): PointPx => {
  const magnitude = Math.hypot(direction.x, direction.y);
  return Object.freeze({ x: direction.x / magnitude, y: direction.y / magnitude });
};

const quantizeLengthToSimulationGrid = (lengthPx: number): number =>
  Math.max(0, Math.floor(lengthPx / SIMULATION_CELL_SIZE_PX) * SIMULATION_CELL_SIZE_PX);

const rasterizeSimulationCells = (
  anchor: PointPx,
  direction: PointPx,
  lengthPx: number,
  widthPx: number,
): readonly SimulationCell[] => {
  if (lengthPx <= 0) return Object.freeze([]);

  const unit = normalizeDirection(direction);
  const perpendicular = { x: -unit.y, y: unit.x };
  const halfWidth = widthPx / 2;
  const corners = [
    { x: anchor.x - perpendicular.x * halfWidth, y: anchor.y - perpendicular.y * halfWidth },
    { x: anchor.x + perpendicular.x * halfWidth, y: anchor.y + perpendicular.y * halfWidth },
    {
      x: anchor.x + unit.x * lengthPx - perpendicular.x * halfWidth,
      y: anchor.y + unit.y * lengthPx - perpendicular.y * halfWidth,
    },
    {
      x: anchor.x + unit.x * lengthPx + perpendicular.x * halfWidth,
      y: anchor.y + unit.y * lengthPx + perpendicular.y * halfWidth,
    },
  ];
  const minCellX = Math.floor((Math.min(...corners.map((point) => point.x)) - 2) / SIMULATION_CELL_SIZE_PX);
  const maxCellX = Math.floor((Math.max(...corners.map((point) => point.x)) + 2) / SIMULATION_CELL_SIZE_PX);
  const minCellY = Math.floor((Math.min(...corners.map((point) => point.y)) - 2) / SIMULATION_CELL_SIZE_PX);
  const maxCellY = Math.floor((Math.max(...corners.map((point) => point.y)) + 2) / SIMULATION_CELL_SIZE_PX);
  const candidates: Array<{
    cell: SimulationCell;
    coverage: number;
    outsideDistance: number;
    centerlineDistance: number;
    longitudinalCenterDistance: number;
  }> = [];

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      let coverage = 0;
      for (let sampleY = 0; sampleY < SIMULATION_CELL_SIZE_PX; sampleY += 1) {
        for (let sampleX = 0; sampleX < SIMULATION_CELL_SIZE_PX; sampleX += 1) {
          const offsetX = cellX * SIMULATION_CELL_SIZE_PX + sampleX + 0.5 - anchor.x;
          const offsetY = cellY * SIMULATION_CELL_SIZE_PX + sampleY + 0.5 - anchor.y;
          const along = offsetX * unit.x + offsetY * unit.y;
          const across = offsetX * perpendicular.x + offsetY * perpendicular.y;
          if (along >= 0 && along < lengthPx && across >= -halfWidth && across < halfWidth) coverage += 1;
        }
      }
      const centerOffsetX = cellX * SIMULATION_CELL_SIZE_PX + 1 - anchor.x;
      const centerOffsetY = cellY * SIMULATION_CELL_SIZE_PX + 1 - anchor.y;
      const centerAlong = centerOffsetX * unit.x + centerOffsetY * unit.y;
      const centerAcross = centerOffsetX * perpendicular.x + centerOffsetY * perpendicular.y;
      candidates.push({
        cell: Object.freeze({ x: cellX, y: cellY }),
        coverage,
        outsideDistance: Math.max(0, -centerAlong) + Math.max(0, centerAlong - lengthPx) +
          Math.max(0, Math.abs(centerAcross) - halfWidth),
        centerlineDistance: Math.abs(centerAcross),
        longitudinalCenterDistance: Math.abs(centerAlong - lengthPx / 2),
      });
    }
  }

  const targetCount = (lengthPx * widthPx) / (SIMULATION_CELL_SIZE_PX ** 2);
  candidates.sort((left, right) =>
    right.coverage - left.coverage ||
    left.outsideDistance - right.outsideDistance ||
    left.centerlineDistance - right.centerlineDistance ||
    left.longitudinalCenterDistance - right.longitudinalCenterDistance ||
    left.cell.y - right.cell.y ||
    left.cell.x - right.cell.x);
  const cells = candidates.slice(0, targetCount).map((candidate) => candidate.cell);
  return Object.freeze(cells.sort((left, right) => left.y - right.y || left.x - right.x));
};

const createGeometry = (
  anchor: PointPx,
  direction: PointPx,
  profile: ContentTeloLengthProfile,
  realizedLengthPx: number,
): CastGeometry => {
  const { nominalLengthPx, crossSectionWidthPx } = profile;
  const unit = normalizeDirection(direction);
  const frozenAnchor = Object.freeze({ ...anchor });
  const frozenDirection = Object.freeze({ ...direction });
  const endpointPx = Object.freeze({
    x: Math.round(anchor.x + unit.x * realizedLengthPx),
    y: Math.round(anchor.y + unit.y * realizedLengthPx),
  });
  const simulationCells = rasterizeSimulationCells(
    anchor,
    direction,
    realizedLengthPx,
    crossSectionWidthPx,
  );
  const worldPixelGeometry: WorldPixelGeometry = Object.freeze({
    anchorPx: frozenAnchor,
    endpointPx,
    direction: frozenDirection,
    nominalLengthPx,
    realizedLengthPx,
    fixedCrossSectionWidthPx: crossSectionWidthPx,
    areaPx2: realizedLengthPx * crossSectionWidthPx,
  });
  const simulationCellGeometry: SimulationCellGeometry = Object.freeze({
    cellSizePx: SIMULATION_CELL_SIZE_PX,
    lengthCells: realizedLengthPx / SIMULATION_CELL_SIZE_PX,
    widthCells: crossSectionWidthPx / SIMULATION_CELL_SIZE_PX,
    cells: simulationCells,
    manifestationCells: simulationCells,
    manifestationCellCount: simulationCells.length,
    massCalculationBasis: "world_pixel_area",
  });
  return Object.freeze({
    worldPixelGeometry,
    simulationCellGeometry,
    anchorPx: frozenAnchor,
    endpointPx,
    direction: frozenDirection,
    nominalLengthPx,
    realizedLengthPx,
    fixedCrossSectionWidthPx: crossSectionWidthPx,
    simulationCellSizePx: SIMULATION_CELL_SIZE_PX,
    simulationLengthCells: realizedLengthPx / SIMULATION_CELL_SIZE_PX,
    simulationWidthCells: crossSectionWidthPx / SIMULATION_CELL_SIZE_PX,
    simulationCells,
    manifestationCellCount: simulationCells.length,
    massCalculationBasis: "world_pixel_area",
  });
};

const validRect = (rect: RectPx): boolean =>
  [rect.x, rect.y, rect.width, rect.height].every(isFiniteNumber) &&
  rect.width > 0 && rect.height > 0;

const validLivingSafetyZones = (zones: readonly LivingSafetyZone[]): boolean => zones.every((zone) =>
  zone.entityId.trim().length > 0 && validRect(zone.boundsPx) &&
  isFiniteNumber(zone.marginPx ?? NORMAL_LIVING_SAFETY_MARGIN_PX) &&
  (zone.marginPx ?? NORMAL_LIVING_SAFETY_MARGIN_PX) >= 0);

const cellIntersectsRect = (cell: SimulationCell, rect: RectPx): boolean => {
  const cellLeft = cell.x * SIMULATION_CELL_SIZE_PX;
  const cellTop = cell.y * SIMULATION_CELL_SIZE_PX;
  const cellRight = cellLeft + SIMULATION_CELL_SIZE_PX;
  const cellBottom = cellTop + SIMULATION_CELL_SIZE_PX;
  return cellLeft < rect.x + rect.width && cellRight > rect.x &&
    cellTop < rect.y + rect.height && cellBottom > rect.y;
};

const blockedLivingEntity = (
  geometry: CastGeometry,
  zones: readonly LivingSafetyZone[],
): string | null => {
  for (const zone of zones) {
    if (!validRect(zone.boundsPx)) continue;
    const margin = zone.marginPx ?? NORMAL_LIVING_SAFETY_MARGIN_PX;
    if (!isFiniteNumber(margin) || margin < 0) continue;
    const expanded = {
      x: zone.boundsPx.x - margin,
      y: zone.boundsPx.y - margin,
      width: zone.boundsPx.width + margin * 2,
      height: zone.boundsPx.height + margin * 2,
    };
    if (geometry.simulationCells.some((cell) => cellIntersectsRect(cell, expanded))) {
      return zone.entityId;
    }
  }
  return null;
};

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createPlanId = (
  profileVersion: string,
  request: TeloCastPlanRequest,
  lengthClass: TeloLengthClass,
  geometry: CastGeometry,
): string => {
  const payload = [
    profileVersion,
    request.canonicalAst.head,
    request.canonicalAst.lengthModifier ?? "none",
    lengthClass,
    geometry.anchorPx.x,
    geometry.anchorPx.y,
    geometry.direction.x,
    geometry.direction.y,
    geometry.realizedLengthPx,
    request.worldVersion,
    geometry.simulationCells.length,
    geometry.simulationCells.map((cell) => `${cell.x},${cell.y}`).join(";"),
  ].join("|");
  return `cast.telo.${fnv1a(payload)}`;
};

const invalidGeometry = (profile: ContentTeloLengthProfile): CastGeometry => Object.freeze({
  worldPixelGeometry: Object.freeze({
    anchorPx: Object.freeze({ x: 0, y: 0 }),
    endpointPx: Object.freeze({ x: 0, y: 0 }),
    direction: Object.freeze({ x: 0, y: 0 }),
    nominalLengthPx: 0,
    realizedLengthPx: 0,
    fixedCrossSectionWidthPx: profile.crossSectionWidthPx,
    areaPx2: 0,
  }),
  simulationCellGeometry: Object.freeze({
    cellSizePx: SIMULATION_CELL_SIZE_PX,
    lengthCells: 0,
    widthCells: profile.crossSectionWidthPx / SIMULATION_CELL_SIZE_PX,
    cells: Object.freeze([]),
    manifestationCells: Object.freeze([]),
    manifestationCellCount: 0,
    massCalculationBasis: "world_pixel_area",
  }),
  anchorPx: Object.freeze({ x: 0, y: 0 }),
  endpointPx: Object.freeze({ x: 0, y: 0 }),
  direction: Object.freeze({ x: 0, y: 0 }),
  nominalLengthPx: 0,
  realizedLengthPx: 0,
  fixedCrossSectionWidthPx: profile.crossSectionWidthPx,
  simulationCellSizePx: SIMULATION_CELL_SIZE_PX,
  simulationLengthCells: 0,
  simulationWidthCells: profile.crossSectionWidthPx / SIMULATION_CELL_SIZE_PX,
  simulationCells: Object.freeze([]),
  manifestationCellCount: 0,
  massCalculationBasis: "world_pixel_area",
});

const rejectedPlan = (
  request: TeloCastPlanRequest,
  rejectionCode: CastPlanRejectionCode,
  profile: ContentTeloLengthProfile,
  lengthClass: TeloLengthClass = "default",
  geometry = invalidGeometry(profile),
  activationMpRequired = 0,
  blockedLivingEntityId: string | null = null,
): TeloCastPlan => {
  const sharedGeometry = Object.freeze({ geometry });
  return Object.freeze({
    planId: createPlanId(profile.profileVersion, request, lengthClass, geometry),
    profileVersion: profile.profileVersion,
    canonicalAst: Object.freeze({ ...request.canonicalAst }),
    requestedLengthClass: lengthClass,
    resolvedLengthClass: lengthClass,
    activationMpRequired,
    quotedCurrentMp: request.currentMp,
    quotedWorldVersion: request.worldVersion,
    preview: sharedGeometry,
    execution: sharedGeometry,
    initialVelocityPxPerSecond: Object.freeze({ x: 0, y: 0 }),
    gravityApplies: true,
    directAttack: false,
    blockingObjectId: request.blockingObjectId ?? null,
    blockedLivingEntityId,
    canConfirm: false,
    rejectionCode,
  });
};

export const compileTeloCastWithProfiles = (
  request: TeloCastPlanRequest,
  profiles: TeloLengthProfileSet,
): TeloCastPlan => {
  assertLengthProfileSet(profiles);
  const fallbackProfile = profiles.default;
  if (request.canonicalAst.head !== "word.telo" ||
      ![null, "word.lili", "word.suli"].includes(request.canonicalAst.lengthModifier)) {
    return rejectedPlan(request, "unsupported_expression", fallbackProfile);
  }
  const lengthClass = classForModifier(request.canonicalAst.lengthModifier);
  const profile = profiles[lengthClass];
  if (!isValidAnchor(request.anchorPx)) return rejectedPlan(request, "invalid_anchor", profile, lengthClass);
  if (!isValidDirection(request.direction)) return rejectedPlan(request, "invalid_direction", profile, lengthClass);
  if (!isFiniteNumber(request.currentMp) || request.currentMp < 0) {
    return rejectedPlan(request, "invalid_mp", profile, lengthClass);
  }
  if (!Number.isSafeInteger(request.worldVersion) || request.worldVersion < 0) {
    return rejectedPlan(request, "invalid_world_version", profile, lengthClass);
  }
  if (request.maximumRealizableLengthPx !== undefined &&
      (!isFiniteNumber(request.maximumRealizableLengthPx) || request.maximumRealizableLengthPx < 0)) {
    return rejectedPlan(request, "invalid_realizable_length", profile, lengthClass);
  }
  const livingSafetyZones = request.livingSafetyZones ?? [];
  if (!validLivingSafetyZones(livingSafetyZones)) {
    return rejectedPlan(request, "invalid_living_safety_zone", profile, lengthClass);
  }

  const maximumLength = request.maximumRealizableLengthPx ?? profile.nominalLengthPx;
  const realizedLengthPx = quantizeLengthToSimulationGrid(
    Math.min(profile.nominalLengthPx, Math.max(0, maximumLength)),
  );
  const geometry = createGeometry(request.anchorPx, request.direction, profile, realizedLengthPx);
  const livingEntityId = blockedLivingEntity(geometry, livingSafetyZones);
  if (livingEntityId !== null) {
    return rejectedPlan(
      request,
      "living_safety_volume_blocked",
      profile,
      lengthClass,
      geometry,
      profile.activationMp,
      livingEntityId,
    );
  }
  if (realizedLengthPx < profile.minimumRealizedLengthPx) {
    return rejectedPlan(
      request,
      "requested_class_cannot_be_realized_here",
      profile,
      lengthClass,
      geometry,
      profile.activationMp,
    );
  }
  if (request.currentMp < profile.activationMp) {
    return rejectedPlan(
      request,
      "requested_class_requires_more_mp",
      profile,
      lengthClass,
      geometry,
      profile.activationMp,
    );
  }

  const sharedGeometry = Object.freeze({ geometry });
  return Object.freeze({
    planId: createPlanId(profile.profileVersion, request, lengthClass, geometry),
    profileVersion: profile.profileVersion,
    canonicalAst: Object.freeze({ ...request.canonicalAst }),
    requestedLengthClass: lengthClass,
    resolvedLengthClass: lengthClass,
    activationMpRequired: profile.activationMp,
    quotedCurrentMp: request.currentMp,
    quotedWorldVersion: request.worldVersion,
    preview: sharedGeometry,
    execution: sharedGeometry,
    initialVelocityPxPerSecond: Object.freeze({ x: 0, y: 0 }),
    gravityApplies: true,
    directAttack: false,
    blockingObjectId: request.blockingObjectId ?? null,
    blockedLivingEntityId: null,
    canConfirm: true,
    rejectionCode: null,
  });
};

export const createTeloCastPlan = (request: TeloCastPlanRequest): TeloCastPlan =>
  compileTeloCastWithProfiles(request, TELO_LENGTH_PROFILES);

/** Stable integration name; createTeloCastPlan remains as a descriptive alias. */
export const compileTeloCast = (input: TeloCastPlanRequest): TeloCastPlan =>
  createTeloCastPlan(input);

const samePoint = (left: PointPx, right: PointPx): boolean =>
  left.x === right.x && left.y === right.y;

const sameCells = (left: readonly SimulationCell[], right: readonly SimulationCell[]): boolean =>
  left.length === right.length && left.every((cell, index) => samePoint(cell, right[index]!));

const isTrustedConfirmablePlan = (plan: TeloCastPlan): boolean => {
  try {
    const modifier = plan.canonicalAst.lengthModifier;
    if (![null, "word.lili", "word.suli"].includes(modifier)) return false;
    const lengthClass = classForModifier(modifier);
    const profile = TELO_LENGTH_PROFILES[lengthClass];
    const geometry = plan.execution.geometry;
    if (!Object.isFrozen(plan) || !Object.isFrozen(geometry) ||
        !Object.isFrozen(plan.preview) || !Object.isFrozen(plan.execution)) return false;
    if (plan.profileVersion !== profile.profileVersion ||
        plan.canonicalAst.head !== "word.telo" ||
        plan.requestedLengthClass !== lengthClass || plan.resolvedLengthClass !== lengthClass ||
        plan.activationMpRequired !== profile.activationMp ||
        !isFiniteNumber(plan.activationMpRequired) || plan.activationMpRequired < 0 ||
        !isFiniteNumber(plan.quotedCurrentMp) || plan.quotedCurrentMp < 0 ||
        !Number.isSafeInteger(plan.quotedWorldVersion) || plan.quotedWorldVersion < 0 ||
        plan.preview.geometry !== geometry || !plan.canConfirm || plan.rejectionCode !== null ||
        plan.gravityApplies !== true || plan.directAttack !== false ||
        plan.initialVelocityPxPerSecond.x !== 0 || plan.initialVelocityPxPerSecond.y !== 0 ||
        plan.blockedLivingEntityId !== null) return false;
    if (!isValidAnchor(geometry.anchorPx) || !isValidDirection(geometry.direction) ||
        geometry.nominalLengthPx !== profile.nominalLengthPx ||
        !Number.isSafeInteger(geometry.realizedLengthPx) ||
        geometry.realizedLengthPx % SIMULATION_CELL_SIZE_PX !== 0 ||
        geometry.realizedLengthPx < profile.minimumRealizedLengthPx ||
        geometry.realizedLengthPx > profile.nominalLengthPx ||
        geometry.fixedCrossSectionWidthPx !== profile.crossSectionWidthPx ||
        geometry.simulationCellSizePx !== SIMULATION_CELL_SIZE_PX ||
        geometry.simulationLengthCells !== geometry.realizedLengthPx / SIMULATION_CELL_SIZE_PX ||
        geometry.simulationWidthCells !== profile.crossSectionWidthPx / SIMULATION_CELL_SIZE_PX ||
        geometry.massCalculationBasis !== "world_pixel_area") return false;

    const expected = createGeometry(
      geometry.anchorPx,
      geometry.direction,
      profile,
      geometry.realizedLengthPx,
    );
    if (!samePoint(geometry.endpointPx, expected.endpointPx) ||
        !sameCells(geometry.simulationCells, expected.simulationCells) ||
        geometry.manifestationCellCount !== expected.manifestationCellCount ||
        geometry.simulationCells.length !== geometry.realizedLengthPx * profile.crossSectionWidthPx /
          (SIMULATION_CELL_SIZE_PX ** 2) ||
        geometry.worldPixelGeometry.areaPx2 !== geometry.realizedLengthPx * profile.crossSectionWidthPx ||
        geometry.worldPixelGeometry.nominalLengthPx !== profile.nominalLengthPx ||
        geometry.worldPixelGeometry.realizedLengthPx !== geometry.realizedLengthPx ||
        geometry.worldPixelGeometry.fixedCrossSectionWidthPx !== profile.crossSectionWidthPx ||
        geometry.worldPixelGeometry.anchorPx !== geometry.anchorPx ||
        geometry.worldPixelGeometry.endpointPx !== geometry.endpointPx ||
        geometry.worldPixelGeometry.direction !== geometry.direction ||
        geometry.simulationCellGeometry.cellSizePx !== SIMULATION_CELL_SIZE_PX ||
        geometry.simulationCellGeometry.lengthCells !== geometry.simulationLengthCells ||
        geometry.simulationCellGeometry.widthCells !== geometry.simulationWidthCells ||
        geometry.simulationCellGeometry.cells !== geometry.simulationCells ||
        geometry.simulationCellGeometry.manifestationCells !== geometry.simulationCells ||
        geometry.simulationCellGeometry.manifestationCellCount !== geometry.simulationCells.length ||
        geometry.simulationCellGeometry.massCalculationBasis !== "world_pixel_area") return false;

    const expectedId = createPlanId(profile.profileVersion, {
      canonicalAst: plan.canonicalAst,
      anchorPx: geometry.anchorPx,
      direction: geometry.direction,
      currentMp: plan.quotedCurrentMp,
      worldVersion: plan.quotedWorldVersion,
    }, lengthClass, expected);
    return plan.planId === expectedId;
  } catch {
    return false;
  }
};

export interface CastExecutionSnapshot {
  readonly mp: number;
  readonly worldVersion: number;
}

export interface MpLedgerSnapshot extends CastExecutionSnapshot {
  readonly currentMp: number;
  readonly maxMp: number;
}

export type MpRecoverySource = "natural" | "meditation" | "checkpoint";

export type MpRecoveryAmountPolicy =
  | Readonly<{ kind: "fixed"; amountMp: number }>
  | Readonly<{
      kind: "max_of_fixed_and_max_fraction";
      minimumMp: number;
      maxMpFraction: number;
      quantum: number;
    }>;

export type MpRecoveryCapPolicy =
  | Readonly<{ kind: "max_mp" }>
  | Readonly<{ kind: "max_mp_fraction"; maxMpFraction: number; quantum: number }>;

/** A deterministic request. Only the authoritative ledger may turn it into MP. */
export interface MpRecoveryProposal {
  readonly schema: "cistern.mp-recovery.v0.1";
  readonly source: MpRecoverySource;
  readonly recoveryId: string;
  readonly amountPolicy: MpRecoveryAmountPolicy;
  readonly capPolicy: MpRecoveryCapPolicy;
  readonly answerAccepted: boolean | null;
  readonly evidenceEligible: boolean | null;
}

export type MpRecoveryReason = "applied" | "at_cap" | "duplicate" | "idempotency_conflict";

export interface MpRecoveryReceipt {
  readonly source: MpRecoverySource;
  readonly recoveryId: string;
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly reason: MpRecoveryReason;
  readonly beforeMp: number;
  readonly restoredMp: number;
  readonly afterMp: number;
  readonly maxMp: number;
  readonly answerAccepted: boolean | null;
  readonly evidenceEligible: boolean | null;
}

export type CastExecutionRejectionCode =
  | CastPlanRejectionCode
  | "idempotency_key_required"
  | "idempotency_payload_conflict"
  | "world_version_mismatch"
  | "untrusted_cast_plan"
  | "transaction_in_progress"
  | "world_mutation_failed"
  | "world_mutation_rejected";

export interface CastExecutionResult {
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly mpCharge: number;
  readonly snapshot: CastExecutionSnapshot;
  readonly rejectionCode: CastExecutionRejectionCode | null;
}

interface CommittedCast {
  readonly planId: string;
  readonly result: CastExecutionResult;
}

export interface PriorCastCommit {
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly mpCharge: number;
  readonly snapshot: CastExecutionSnapshot;
}

export interface ExecuteCastPlanContext {
  readonly currentMp: number;
  readonly currentWorldVersion: number;
  readonly idempotencyKey: string;
  readonly priorCommit?: PriorCastCommit;
}

export interface ExecuteCastPlanDecision {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly shouldApplyWorldMutation: boolean;
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly mpCharge: number;
  readonly nextSnapshot: CastExecutionSnapshot;
  readonly rejectionCode: CastExecutionRejectionCode | null;
}

/**
 * Pure authorization/state-transition function for integration layers. It does
 * not touch MaterialGrid; an accepted non-duplicate decision authorizes the
 * caller to apply plan.execution.geometry once and then persist nextSnapshot.
 */
export const executeCastPlan = (
  plan: TeloCastPlan,
  context: ExecuteCastPlanContext,
): ExecuteCastPlanDecision => {
  const normalizedKey = context.idempotencyKey.trim();
  const unchanged = Object.freeze({
    mp: context.currentMp,
    worldVersion: context.currentWorldVersion,
  });
  const reject = (rejectionCode: CastExecutionRejectionCode): ExecuteCastPlanDecision => Object.freeze({
    accepted: false,
    duplicate: false,
    shouldApplyWorldMutation: false,
    planId: plan.planId,
    idempotencyKey: normalizedKey,
    mpCharge: 0,
    nextSnapshot: unchanged,
    rejectionCode,
  });

  if (normalizedKey.length === 0) return reject("idempotency_key_required");
  if (!isFiniteNumber(context.currentMp) || context.currentMp < 0) return reject("invalid_mp");
  if (!Number.isSafeInteger(context.currentWorldVersion) || context.currentWorldVersion < 0) {
    return reject("invalid_world_version");
  }
  if (!plan.canConfirm || plan.rejectionCode !== null) {
    return reject(plan.rejectionCode ?? "unsupported_expression");
  }
  if (!isTrustedConfirmablePlan(plan)) return reject("untrusted_cast_plan");
  if (context.priorCommit) {
    if (context.priorCommit.idempotencyKey !== normalizedKey ||
        context.priorCommit.planId !== plan.planId ||
        context.priorCommit.mpCharge !== plan.activationMpRequired ||
        !isFiniteNumber(context.priorCommit.snapshot.mp) || context.priorCommit.snapshot.mp < 0 ||
        !Number.isSafeInteger(context.priorCommit.snapshot.worldVersion) ||
        context.priorCommit.snapshot.worldVersion !== plan.quotedWorldVersion + 1 ||
        context.priorCommit.snapshot.mp !== plan.quotedCurrentMp - plan.activationMpRequired ||
        context.currentMp !== context.priorCommit.snapshot.mp ||
        context.currentWorldVersion !== context.priorCommit.snapshot.worldVersion) {
      return reject("idempotency_payload_conflict");
    }
    return Object.freeze({
      accepted: true,
      duplicate: true,
      shouldApplyWorldMutation: false,
      planId: plan.planId,
      idempotencyKey: normalizedKey,
      mpCharge: 0,
      nextSnapshot: context.priorCommit.snapshot,
      rejectionCode: null,
    });
  }
  if (plan.quotedWorldVersion !== context.currentWorldVersion) {
    return reject("world_version_mismatch");
  }
  if (context.currentMp < plan.activationMpRequired) {
    return reject("requested_class_requires_more_mp");
  }
  if (context.currentWorldVersion === Number.MAX_SAFE_INTEGER) return reject("invalid_world_version");
  return Object.freeze({
    accepted: true,
    duplicate: false,
    shouldApplyWorldMutation: true,
    planId: plan.planId,
    idempotencyKey: normalizedKey,
    mpCharge: plan.activationMpRequired,
    nextSnapshot: Object.freeze({
      mp: context.currentMp - plan.activationMpRequired,
      worldVersion: context.currentWorldVersion + 1,
    }),
    rejectionCode: null,
  });
};

const recoveryQuantumRound = (value: number, quantum: number): number =>
  Math.round(value / quantum) * quantum;

const recoveryQuantumFloor = (value: number, quantum: number): number =>
  Math.floor(value / quantum) * quantum;

const roundMp = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const validateRecoveryFraction = (value: number, name: string): void => {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be finite and between zero and one`);
  }
};

interface CanonicalRecoveryIdentity {
  readonly recoveryId: string;
  readonly fingerprint: string;
}

const validateAndCanonicalizeRecoveryProposal = (
  proposal: MpRecoveryProposal,
): CanonicalRecoveryIdentity => {
  if (proposal.schema !== "cistern.mp-recovery.v0.1") throw new Error("unknown MP recovery schema");
  if (!["natural", "meditation", "checkpoint"].includes(proposal.source)) {
    throw new Error("unknown MP recovery source");
  }
  const recoveryId = proposal.recoveryId.trim();
  if (recoveryId.length === 0) throw new Error("recoveryId is required");
  if (proposal.answerAccepted !== null && typeof proposal.answerAccepted !== "boolean") {
    throw new Error("answerAccepted must be boolean or null");
  }
  if (proposal.evidenceEligible !== null && typeof proposal.evidenceEligible !== "boolean") {
    throw new Error("evidenceEligible must be boolean or null");
  }
  if (proposal.amountPolicy.kind === "fixed") {
    if (!isFiniteNumber(proposal.amountPolicy.amountMp) || proposal.amountPolicy.amountMp < 0) {
      throw new RangeError("fixed recovery amount must be finite and non-negative");
    }
  } else if (proposal.amountPolicy.kind === "max_of_fixed_and_max_fraction") {
    if (!isFiniteNumber(proposal.amountPolicy.minimumMp) || proposal.amountPolicy.minimumMp < 0 ||
        !isFiniteNumber(proposal.amountPolicy.quantum) || proposal.amountPolicy.quantum <= 0) {
      throw new RangeError("checkpoint recovery amount policy is invalid");
    }
    validateRecoveryFraction(proposal.amountPolicy.maxMpFraction, "amount maxMpFraction");
  } else {
    throw new Error("unknown MP recovery amount policy");
  }
  if (proposal.capPolicy.kind === "max_mp_fraction") {
    validateRecoveryFraction(proposal.capPolicy.maxMpFraction, "cap maxMpFraction");
    if (!isFiniteNumber(proposal.capPolicy.quantum) || proposal.capPolicy.quantum <= 0) {
      throw new RangeError("recovery cap quantum must be positive and finite");
    }
  } else if (proposal.capPolicy.kind !== "max_mp") {
    throw new Error("unknown MP recovery cap policy");
  }
  const amountFingerprint = proposal.amountPolicy.kind === "fixed"
    ? ["fixed", proposal.amountPolicy.amountMp]
    : [
        "max_of_fixed_and_max_fraction",
        proposal.amountPolicy.minimumMp,
        proposal.amountPolicy.maxMpFraction,
        proposal.amountPolicy.quantum,
      ];
  const capFingerprint = proposal.capPolicy.kind === "max_mp"
    ? ["max_mp"]
    : ["max_mp_fraction", proposal.capPolicy.maxMpFraction, proposal.capPolicy.quantum];
  return Object.freeze({
    recoveryId,
    fingerprint: JSON.stringify([
      proposal.schema,
      proposal.source,
      recoveryId,
      amountFingerprint,
      capFingerprint,
      proposal.answerAccepted,
      proposal.evidenceEligible,
    ]),
  });
};

const recoveryAmountForMaxMp = (policy: MpRecoveryAmountPolicy, maxMp: number): number =>
  policy.kind === "fixed"
    ? policy.amountMp
    : recoveryQuantumRound(Math.max(policy.minimumMp, policy.maxMpFraction * maxMp), policy.quantum);

const recoveryCapForMaxMp = (policy: MpRecoveryCapPolicy, maxMp: number): number =>
  policy.kind === "max_mp"
    ? maxMp
    : Math.min(maxMp, recoveryQuantumFloor(policy.maxMpFraction * maxMp, policy.quantum));

/**
 * Owns the MP balance and the small transactional boundary needed by the
 * graybox. The world callback must apply the supplied plan atomically and
 * return false when it cannot do so. Duplicate keys never call it twice.
 */
export class CastExecutionLedger {
  private mp: number;
  private readonly maxMp: number;
  private worldVersion: number;
  private readonly committedByKey = new Map<string, CommittedCast>();
  private readonly recoveryByKey = new Map<string, Readonly<{
    fingerprint: string;
    receipt: MpRecoveryReceipt;
  }>>();
  private commitInProgress = false;

  constructor(initialMp: number, initialWorldVersion = 0, maxMp = initialMp) {
    if (!isFiniteNumber(initialMp) || initialMp < 0) throw new Error("initialMp must be finite and non-negative");
    if (!isFiniteNumber(maxMp) || maxMp < 0 || initialMp > maxMp) {
      throw new Error("maxMp must be finite, non-negative, and no less than initialMp");
    }
    if (!Number.isSafeInteger(initialWorldVersion) || initialWorldVersion < 0) {
      throw new Error("initialWorldVersion must be a non-negative safe integer");
    }
    this.mp = initialMp;
    this.maxMp = maxMp;
    this.worldVersion = initialWorldVersion;
  }

  snapshot(): CastExecutionSnapshot {
    return Object.freeze({ mp: this.mp, worldVersion: this.worldVersion });
  }

  mpSnapshot(): MpLedgerSnapshot {
    return Object.freeze({
      mp: this.mp,
      currentMp: this.mp,
      maxMp: this.maxMp,
      worldVersion: this.worldVersion,
    });
  }

  /** Applies an idempotent MP-only transition without invalidating world previews. */
  applyMpRecovery(proposal: MpRecoveryProposal): MpRecoveryReceipt {
    if (this.commitInProgress) throw new Error("cannot recover MP during a cast transaction");
    const { recoveryId, fingerprint } = validateAndCanonicalizeRecoveryProposal(proposal);
    const key = `${proposal.source}:${recoveryId}`;
    const prior = this.recoveryByKey.get(key);
    const unchanged = (reason: "duplicate" | "idempotency_conflict", duplicate: boolean): MpRecoveryReceipt =>
      Object.freeze({
        source: proposal.source,
        recoveryId,
        applied: false,
        duplicate,
        reason,
        beforeMp: this.mp,
        restoredMp: 0,
        afterMp: this.mp,
        maxMp: this.maxMp,
        answerAccepted: proposal.answerAccepted,
        evidenceEligible: proposal.evidenceEligible,
      });
    if (prior) {
      return prior.fingerprint === fingerprint
        ? unchanged("duplicate", true)
        : unchanged("idempotency_conflict", false);
    }

    const requestedMp = recoveryAmountForMaxMp(proposal.amountPolicy, this.maxMp);
    const capMp = recoveryCapForMaxMp(proposal.capPolicy, this.maxMp);
    const beforeMp = this.mp;
    const restoredMp = roundMp(Math.min(requestedMp, Math.max(0, capMp - beforeMp)));
    this.mp = roundMp(Math.min(this.maxMp, beforeMp + restoredMp));
    const receipt: MpRecoveryReceipt = Object.freeze({
      source: proposal.source,
      recoveryId,
      applied: restoredMp > 0,
      duplicate: false,
      reason: restoredMp > 0 ? "applied" : "at_cap",
      beforeMp,
      restoredMp,
      afterMp: this.mp,
      maxMp: this.maxMp,
      answerAccepted: proposal.answerAccepted,
      evidenceEligible: proposal.evidenceEligible,
    });
    this.recoveryByKey.set(key, Object.freeze({ fingerprint, receipt }));
    return receipt;
  }

  /** Records one external physical/world mutation so older previews go stale. */
  advanceWorldVersion(): CastExecutionSnapshot {
    if (this.commitInProgress) throw new Error("cannot advance worldVersion during a cast transaction");
    if (this.worldVersion === Number.MAX_SAFE_INTEGER) {
      throw new Error("worldVersion cannot advance beyond Number.MAX_SAFE_INTEGER");
    }
    this.worldVersion += 1;
    return this.snapshot();
  }

  /**
   * Accepts a version from an authoritative simulation worker. Rewinding would
   * make already-observed previews appear current again, so it is forbidden.
   */
  synchronizeWorldVersion(version: number): CastExecutionSnapshot {
    if (this.commitInProgress) throw new Error("cannot synchronize worldVersion during a cast transaction");
    if (!Number.isSafeInteger(version) || version < this.worldVersion) {
      throw new Error("worldVersion synchronization must be monotonic and safe");
    }
    this.worldVersion = version;
    return this.snapshot();
  }

  commit(
    plan: TeloCastPlan,
    idempotencyKey: string,
    applyWorldMutation: (plan: TeloCastPlan) => boolean | void,
  ): CastExecutionResult {
    const normalizedKey = idempotencyKey.trim();
    if (normalizedKey.length === 0) {
      return this.reject(plan, idempotencyKey, "idempotency_key_required");
    }
    if (this.commitInProgress) return this.reject(plan, normalizedKey, "transaction_in_progress");
    if (!plan.canConfirm || plan.rejectionCode !== null) {
      return this.reject(plan, normalizedKey, plan.rejectionCode ?? "unsupported_expression");
    }
    if (!isTrustedConfirmablePlan(plan)) {
      return this.reject(plan, normalizedKey, "untrusted_cast_plan");
    }

    const prior = this.committedByKey.get(normalizedKey);
    if (prior) {
      if (prior.planId !== plan.planId) {
        return this.reject(plan, normalizedKey, "idempotency_payload_conflict");
      }
      return Object.freeze({
        ...prior.result,
        duplicate: true,
        mpCharge: 0,
        snapshot: this.snapshot(),
      });
    }

    if (plan.quotedWorldVersion !== this.worldVersion) {
      return this.reject(plan, normalizedKey, "world_version_mismatch");
    }
    if (this.mp < plan.activationMpRequired) {
      return this.reject(plan, normalizedKey, "requested_class_requires_more_mp");
    }
    if (this.worldVersion === Number.MAX_SAFE_INTEGER) {
      return this.reject(plan, normalizedKey, "invalid_world_version");
    }

    let mutationAccepted: boolean | void;
    this.commitInProgress = true;
    try {
      mutationAccepted = applyWorldMutation(plan);
    } catch {
      return this.reject(plan, normalizedKey, "world_mutation_failed");
    } finally {
      this.commitInProgress = false;
    }
    if (mutationAccepted === false) {
      return this.reject(plan, normalizedKey, "world_mutation_rejected");
    }

    this.mp -= plan.activationMpRequired;
    this.worldVersion += 1;
    const result: CastExecutionResult = Object.freeze({
      committed: true,
      duplicate: false,
      planId: plan.planId,
      idempotencyKey: normalizedKey,
      mpCharge: plan.activationMpRequired,
      snapshot: this.snapshot(),
      rejectionCode: null,
    });
    this.committedByKey.set(normalizedKey, { planId: plan.planId, result });
    return result;
  }

  private reject(
    plan: TeloCastPlan,
    idempotencyKey: string,
    rejectionCode: CastExecutionRejectionCode,
  ): CastExecutionResult {
    return Object.freeze({
      committed: false,
      duplicate: false,
      planId: plan.planId,
      idempotencyKey,
      mpCharge: 0,
      snapshot: this.snapshot(),
      rejectionCode,
    });
  }
}
