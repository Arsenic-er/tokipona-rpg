import {
  isVerifiedRuntimeForestSpatialManifest,
  type RuntimeForestSpatialManifest,
} from "../content/runtime-forest-spatial-manifest";
import { canonicalJson, sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";

export interface ForestRectPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ForestRegion {
  readonly seed: string;
  readonly generatorSeed: number;
  readonly topologyDigest: `sha256:${string}`;
  readonly macroTilePx: 16;
  readonly anchorCellIds: Readonly<Record<string, string>>;
  readonly terrainPrimitives: readonly Readonly<{ kind: string; boundsPx: ForestRectPx }> [];
  readonly traversableCells: readonly Readonly<{ cellId: string; positionPx: Readonly<{ x: number; y: number }> }>[];
  readonly cellLinks: readonly Readonly<{ fromCellId: string; toCellId: string; routeEdgeId: string; capability: string | null }> [];
  readonly routeCorridors: readonly Readonly<{
    edgeId: string;
    fromDistrictId: string;
    toDistrictId: string;
    capability: string | null;
    pointsPx: readonly Readonly<{ x: number; y: number }>[];
    cellIds: readonly string[];
    gate: Readonly<{ capability: string; cellId: string }> | null;
    clearanceBoundsPx: ForestRectPx;
    clearanceVolumesPx: readonly ForestRectPx[];
    ownership: readonly Readonly<{ districtId: string; fromT: number; toT: number; includesStart: boolean; includesEnd: boolean }> [];
  }> [];
  readonly protectedZones: readonly Readonly<{ zoneId: string; kind: "story_anchor_clearance" | "checkpoint_clearance" | "settlement_structure" | "waterwheel_protected_mass"; boundsPx: ForestRectPx }> [];
  readonly pockets: readonly Readonly<{ pocketId: string; districtId: string; kind: "loose_material" | "root" | "ledge" | "resource_candidate"; boundsPx: ForestRectPx }> [];
  readonly encounterChambers: readonly Readonly<{ chamberId: string; districtId: string; chamberCellId: string; escapeEdgeIds: readonly string[]; escapeCellIds: readonly string[] }> [];
  readonly meadowSurfaces: readonly Readonly<{ surfaceId: "forest.meadow.ground"; left: number; right: number; y: number }> [];
  readonly criticalRouteClearances: readonly Readonly<{ edgeId: string; boundsPx: ForestRectPx; volumesPx: readonly ForestRectPx[]; width: number; height: number }> [];
}

export class ForestGenerationError extends Error {
  public constructor(
    public readonly seed: string,
    public readonly failedInvariant: string,
  ) {
    super(`Forest generation failed for seed ${JSON.stringify(seed)}: ${failedInvariant}`);
    this.name = "ForestGenerationError";
  }
}

const EDGE_INTERIOR_CELL_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  "arrival.stream": 7, "stream.settlement": 7, "settlement.hermit": 7,
  "hermit.waterwheel": 6, "waterwheel.cistern": 9, "waterwheel.den": 5,
  "den.cistern": 8, "cistern.return": 8, "return.underground": 8,
  "underground.settlement": 8, "settlement.safe_range": 7, "settlement.old_mine": 9,
});

const POCKET_CANDIDATES = Object.freeze([
  { districtId: "forest.arrival", boundsPx: { x: 896, y: 800, width: 32, height: 32 } },
  { districtId: "forest.stream", boundsPx: { x: 2048, y: 1040, width: 32, height: 32 } },
  { districtId: "forest.settlement", boundsPx: { x: 3600, y: 416, width: 32, height: 32 } },
  { districtId: "forest.hermit_branch", boundsPx: { x: 4200, y: 1280, width: 32, height: 32 } },
  { districtId: "forest.waterwheel", boundsPx: { x: 4600, y: 1900, width: 32, height: 32 } },
  { districtId: "forest.cistern", boundsPx: { x: 6400, y: 920, width: 32, height: 32 } },
  { districtId: "forest.den_bypass", boundsPx: { x: 6800, y: 1960, width: 32, height: 32 } },
  { districtId: "forest.return_channel", boundsPx: { x: 7900, y: 1960, width: 32, height: 32 } },
  { districtId: "forest.underground_node", boundsPx: { x: 8500, y: 2320, width: 32, height: 32 } },
  { districtId: "forest.old_mine", boundsPx: { x: 9400, y: 2440, width: 32, height: 32 } },
] as const);

const POCKET_KINDS = ["loose_material", "root", "ledge", "resource_candidate"] as const;

interface NavigationGraph {
  readonly anchorCellIds: Readonly<Record<string, string>>;
  readonly edgeCellIds: Readonly<Record<string, readonly string[]>>;
  readonly traversableCells: readonly Readonly<{ cellId: string; positionPx: Readonly<{ x: number; y: number }> }>[];
  readonly cellLinks: readonly Readonly<{ fromCellId: string; toCellId: string; routeEdgeId: string; capability: string | null }>[];
}

export function generateForestRegion(manifest: RuntimeForestSpatialManifest, seed: string): ForestRegion {
  if (!isVerifiedRuntimeForestSpatialManifest(manifest)) throw new ForestGenerationError(seed, "reader_verified_manifest_required");
  if (typeof seed !== "string" || seed.trim().length === 0) throw new ForestGenerationError(seed, "seed_must_be_non_empty");

  const generatorSeed = Number.parseInt(sha256Canonical({ manifestDigest: manifest.sourceDigest, seed } as JsonValue).slice(7, 15), 16) >>> 0;
  const anchorPositions = new Map(manifest.anchors.map((anchor) => [anchor.anchorId, { x: anchor.positionPx[0], y: anchor.positionPx[1] }]));
  const navigation = buildNavigationGraph(manifest, anchorPositions);
  const routeCorridors = Object.freeze(manifest.routeEdges.map((edge) => {
    const from = anchorPositions.get(edge.from)!;
    const to = anchorPositions.get(edge.to)!;
    const cellIds = navigation.edgeCellIds[edge.edgeId]!;
    const clearanceVolumesPx = clearanceVolumes(cellIds, navigation.traversableCells);
    const clearanceBoundsPx = clearanceVolumesPx[0]!;
    return Object.freeze({
      edgeId: edge.edgeId,
      fromDistrictId: edge.from,
      toDistrictId: edge.to,
      capability: edge.capability,
      pointsPx: Object.freeze([Object.freeze({ ...from }), Object.freeze({ ...to })]),
      cellIds,
      gate: edge.capability === null ? null : Object.freeze({ capability: edge.capability, cellId: cellIds[Math.floor(cellIds.length / 2)]! }),
      clearanceBoundsPx,
      clearanceVolumesPx,
      ownership: Object.freeze([
        Object.freeze({ districtId: edge.from, fromT: 0, toT: 0.5, includesStart: true, includesEnd: false }),
        Object.freeze({ districtId: edge.to, fromT: 0.5, toT: 1, includesStart: true, includesEnd: true }),
      ]),
    });
  }));
  const protectedZones = Object.freeze(buildProtectedZones(manifest));
  const pockets = Object.freeze(buildPockets(generatorSeed));
  const regionWithoutDigest = {
    seed,
    generatorSeed,
    macroTilePx: 16 as const,
    anchorCellIds: navigation.anchorCellIds,
    terrainPrimitives: Object.freeze(buildTerrainPrimitives(manifest)),
    traversableCells: navigation.traversableCells,
    cellLinks: navigation.cellLinks,
    routeCorridors,
    protectedZones,
    pockets,
    encounterChambers: Object.freeze(buildEncounterChambers(manifest, navigation)),
    meadowSurfaces: Object.freeze([Object.freeze({ surfaceId: "forest.meadow.ground" as const, left: manifest.meadowGroundBandPx.left, right: manifest.meadowGroundBandPx.right, y: manifest.meadowGroundBandPx.y })]),
    criticalRouteClearances: Object.freeze(routeCorridors.map((corridor) => Object.freeze({ edgeId: corridor.edgeId, boundsPx: corridor.clearanceBoundsPx, volumesPx: corridor.clearanceVolumesPx, width: Math.min(...corridor.clearanceVolumesPx.map((volume) => volume.width)), height: Math.min(...corridor.clearanceVolumesPx.map((volume) => volume.height)) }))),
  };
  validateRegion(regionWithoutDigest, manifest, seed);
  const topologyDigest = sha256Canonical(regionWithoutDigest as unknown as JsonValue);
  return Object.freeze({ ...regionWithoutDigest, topologyDigest });
}

export function serializeForestRegion(region: ForestRegion): string {
  return canonicalJson(region as unknown as JsonValue);
}

export function validateForestRegion(manifest: RuntimeForestSpatialManifest, region: ForestRegion): void {
  if (!isVerifiedRuntimeForestSpatialManifest(manifest)) throw new ForestGenerationError(region.seed, "reader_verified_manifest_required");
  const { topologyDigest: _topologyDigest, ...withoutDigest } = region;
  validateRegion(withoutDigest, manifest, region.seed);
}

function buildNavigationGraph(manifest: RuntimeForestSpatialManifest, anchorPositions: ReadonlyMap<string, Readonly<{ x: number; y: number }>>): NavigationGraph {
  const anchorCellIds = Object.freeze(Object.fromEntries(manifest.anchors.map((anchor) => [anchor.anchorId, `forest.anchor.${anchor.anchorId.slice("forest.".length)}`])));
  const cells = manifest.anchors.map((anchor) => Object.freeze({ cellId: anchorCellIds[anchor.anchorId]!, positionPx: Object.freeze({ ...anchorPositions.get(anchor.anchorId)! }) }));
  const edgeCellIds: Record<string, readonly string[]> = {};
  const links: { fromCellId: string; toCellId: string; routeEdgeId: string; capability: string | null }[] = [];
  for (const edge of manifest.routeEdges) {
    const interiorCount = EDGE_INTERIOR_CELL_COUNTS[edge.edgeId];
    if (interiorCount === undefined) throw new ForestGenerationError("<graph>", `missing_edge_cell_count:${edge.edgeId}`);
    const from = anchorPositions.get(edge.from)!;
    const to = anchorPositions.get(edge.to)!;
    const cellIds = [anchorCellIds[edge.from]!];
    for (let index = 0; index < interiorCount; index += 1) {
      const t = (index + 1) / (interiorCount + 1);
      const cellId = `forest.edge.${edge.edgeId}.${index}`;
      cellIds.push(cellId);
      cells.push(Object.freeze({ cellId, positionPx: Object.freeze({ x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) }) }));
    }
    cellIds.push(anchorCellIds[edge.to]!);
    edgeCellIds[edge.edgeId] = Object.freeze(cellIds);
    for (let index = 0; index < cellIds.length - 1; index += 1) links.push({ fromCellId: cellIds[index]!, toCellId: cellIds[index + 1]!, routeEdgeId: edge.edgeId, capability: edge.capability });
  }
  return Object.freeze({ anchorCellIds, edgeCellIds: Object.freeze(edgeCellIds), traversableCells: Object.freeze(cells), cellLinks: Object.freeze(links.map((link) => Object.freeze(link))) });
}

function buildEncounterChambers(manifest: RuntimeForestSpatialManifest, navigation: NavigationGraph): readonly Readonly<{ chamberId: string; districtId: string; chamberCellId: string; escapeEdgeIds: readonly string[]; escapeCellIds: readonly string[] }> [] {
  return manifest.encounterChambers.map((chamber) => {
    const chamberCellId = navigation.anchorCellIds[chamber.districtId]!;
    const escapeCellIds = chamber.escapeEdgeIds.map((edgeId) => {
      const edge = manifest.routeEdges.find((entry) => entry.edgeId === edgeId)!;
      const cells = navigation.edgeCellIds[edgeId]!;
      return edge.from === chamber.districtId ? cells[1]! : cells[cells.length - 2]!;
    });
    return Object.freeze({ chamberId: chamber.chamberId, districtId: chamber.districtId, chamberCellId, escapeEdgeIds: Object.freeze([...chamber.escapeEdgeIds]), escapeCellIds: Object.freeze(escapeCellIds) });
  });
}

function buildTerrainPrimitives(manifest: RuntimeForestSpatialManifest): readonly Readonly<{ kind: string; boundsPx: ForestRectPx }> [] {
  const district = (districtId: string): ForestRectPx => manifest.districts.find((entry) => entry.districtId === districtId)!.boundsPx;
  const waterwheel = manifest.landmarks[0]!.boundsPx;
  return [
    { kind: "surface_arrival_ledge", boundsPx: district("forest.arrival") },
    { kind: "shallow_stream_descent", boundsPx: district("forest.stream") },
    { kind: "meadow_settlement_clearing", boundsPx: freezeRect({ x: manifest.meadowGroundBandPx.left, y: manifest.meadowGroundBandPx.y - 16, width: manifest.meadowGroundBandPx.right - manifest.meadowGroundBandPx.left, height: 32 }) },
    { kind: "hermit_side_branch", boundsPx: district("forest.hermit_branch") },
    { kind: "descending_ravine", boundsPx: district("forest.waterwheel") },
    { kind: "waterwheel_protected_mass", boundsPx: waterwheel },
    { kind: "upper_cistern_route", boundsPx: district("forest.cistern") },
    { kind: "return_channel_lower_shortcut", boundsPx: district("forest.return_channel") },
    { kind: "sealed_safe_range_gate", boundsPx: freezeRect({ x: 3328, y: 176, width: 64, height: 32 }) },
    { kind: "sealed_old_mine_gate", boundsPx: freezeRect({ x: 9216, y: 2176, width: 64, height: 32 }) },
    { kind: "sealed_deep_root_gate", boundsPx: freezeRect({ x: 6128, y: 1760, width: 64, height: 32 }) },
  ].map((primitive) => Object.freeze({ kind: primitive.kind, boundsPx: freezeRect(primitive.boundsPx) }));
}

function buildProtectedZones(manifest: RuntimeForestSpatialManifest): readonly Readonly<{ zoneId: string; kind: "story_anchor_clearance" | "checkpoint_clearance" | "settlement_structure" | "waterwheel_protected_mass"; boundsPx: ForestRectPx }> [] {
  const anchorZones = manifest.anchors.map((anchor) => Object.freeze({ zoneId: `${anchor.anchorId}.anchor`, kind: "story_anchor_clearance" as const, boundsPx: freezeRect({ x: anchor.positionPx[0] - 16, y: anchor.positionPx[1] - 16, width: 32, height: 32 }) }));
  const checkpointIds = ["forest.arrival", "forest.settlement", "forest.waterwheel", "forest.cistern", "forest.return_channel"];
  const checkpoints = checkpointIds.map((anchorId) => {
    const anchor = manifest.anchors.find((entry) => entry.anchorId === anchorId)!;
    return Object.freeze({ zoneId: `${anchorId}.checkpoint`, kind: "checkpoint_clearance" as const, boundsPx: freezeRect({ x: anchor.positionPx[0] - 32, y: anchor.positionPx[1] - 32, width: 64, height: 64 }) });
  });
  const waterwheel = manifest.landmarks[0]!;
  return [...anchorZones, ...checkpoints,
    Object.freeze({ zoneId: "forest.settlement.structure", kind: "settlement_structure" as const, boundsPx: freezeRect({ x: 2784, y: 528, width: 640, height: 176 }) }),
    Object.freeze({ zoneId: waterwheel.landmarkId, kind: "waterwheel_protected_mass" as const, boundsPx: freezeRect(waterwheel.boundsPx) }),
  ];
}

function buildPockets(seed: number): readonly Readonly<{ pocketId: string; districtId: string; kind: "loose_material" | "root" | "ledge" | "resource_candidate"; boundsPx: ForestRectPx }> [] {
  let state = seed;
  const candidates = [...POCKET_CANDIDATES];
  const pockets: { pocketId: string; districtId: string; kind: "loose_material" | "root" | "ledge" | "resource_candidate"; boundsPx: ForestRectPx }[] = [];
  for (let index = 0; index < 4; index += 1) {
    state = nextRandom(state);
    const candidate = candidates.splice(state % candidates.length, 1)[0]!;
    state = nextRandom(state);
    pockets.push(Object.freeze({ pocketId: `forest.pocket.${index}`, districtId: candidate.districtId, kind: POCKET_KINDS[state % POCKET_KINDS.length]!, boundsPx: freezeRect(candidate.boundsPx) }));
  }
  return pockets;
}

function validateRegion(region: Omit<ForestRegion, "topologyDigest">, manifest: RuntimeForestSpatialManifest, seed: string): void {
  const initialCount = countReachable(region, []);
  const ratio = initialCount / region.traversableCells.length;
  if (ratio < manifest.chapterOneAccessibleRatio.minimum || ratio > manifest.chapterOneAccessibleRatio.maximum) throw new ForestGenerationError(seed, "initial_accessible_ratio");
  if (region.pockets.some((pocket) => region.criticalRouteClearances.some((clearance) => clearance.volumesPx.some((volume) => overlaps(pocket.boundsPx, volume))))) throw new ForestGenerationError(seed, "pocket_overlaps_critical_clearance");
  if (region.pockets.some((pocket) => region.protectedZones.some((zone) => overlaps(pocket.boundsPx, zone.boundsPx)))) throw new ForestGenerationError(seed, "pocket_overlaps_protected_zone");
  if (region.meadowSurfaces.some((surface) => Math.abs(surface.y - manifest.meadowGroundBandPx.y) > 16)) throw new ForestGenerationError(seed, "meadow_vertical_delta");
  if (region.criticalRouteClearances.some((clearance) => clearance.width < 16 || clearance.height < 18)) throw new ForestGenerationError(seed, "critical_route_clearance");
  if (region.encounterChambers.some((chamber) => !hasDistinctEscapeLinks(region, chamber))) throw new ForestGenerationError(seed, "encounter_escape_routes");
}

function countReachable(region: Omit<ForestRegion, "topologyDigest">, capabilities: readonly string[]): number {
  const enabled = new Set(capabilities), adjacent = new Map<string, string[]>();
  for (const link of region.cellLinks) {
    if (link.capability !== null && !enabled.has(link.capability)) continue;
    (adjacent.get(link.fromCellId) ?? adjacent.set(link.fromCellId, []).get(link.fromCellId)!).push(link.toCellId);
    (adjacent.get(link.toCellId) ?? adjacent.set(link.toCellId, []).get(link.toCellId)!).push(link.fromCellId);
  }
  const found = new Set([region.anchorCellIds["forest.arrival"]!]), queue = [...found];
  while (queue.length > 0) for (const next of adjacent.get(queue.shift()!) ?? []) if (!found.has(next)) { found.add(next); queue.push(next); }
  return found.size;
}

function hasDistinctEscapeLinks(region: Omit<ForestRegion, "topologyDigest">, chamber: ForestRegion["encounterChambers"][number]): boolean {
  if (chamber.escapeEdgeIds.length !== 2 || new Set(chamber.escapeEdgeIds).size !== 2 || new Set(chamber.escapeCellIds).size !== 2) return false;
  return chamber.escapeEdgeIds.every((edgeId, index) => region.cellLinks.some((link) => link.routeEdgeId === edgeId &&
    ((link.fromCellId === chamber.chamberCellId && link.toCellId === chamber.escapeCellIds[index]) ||
      (link.toCellId === chamber.chamberCellId && link.fromCellId === chamber.escapeCellIds[index]))));
}

function clearanceBounds(from: Readonly<{ x: number; y: number }>, to: Readonly<{ x: number; y: number }>): ForestRectPx {
  const left = Math.min(from.x, to.x), top = Math.min(from.y, to.y);
  return freezeRect({ x: left - 8, y: top - 9, width: Math.max(16, Math.abs(to.x - from.x) + 16), height: Math.max(18, Math.abs(to.y - from.y) + 18) });
}

function clearanceVolumes(cellIds: readonly string[], cells: readonly Readonly<{ cellId: string; positionPx: Readonly<{ x: number; y: number }> }>[]): readonly ForestRectPx[] {
  const positionByCellId = new Map(cells.map((cell) => [cell.cellId, cell.positionPx]));
  return Object.freeze(cellIds.slice(0, -1).map((cellId, index) => clearanceBounds(positionByCellId.get(cellId)!, positionByCellId.get(cellIds[index + 1]!)!)));
}
function nextRandom(value: number): number { return (Math.imul(value ^ (value >>> 16), 0x45d9f3b) ^ (value >>> 13)) >>> 0; }
function freezeRect(rect: ForestRectPx): ForestRectPx { return Object.freeze({ ...rect }); }
function overlaps(left: ForestRectPx, right: ForestRectPx): boolean { return left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height; }
