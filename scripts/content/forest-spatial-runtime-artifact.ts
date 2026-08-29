import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types.ts";
import { computeRuntimeManifestDigest } from "../../src/content/runtime-manifest-digest.ts";
import type { RuntimeForestSpatialManifest } from "../../src/content/runtime-forest-spatial-manifest.ts";

export function projectForestSpatialRuntimeManifest(manifest: ContentManifest): RuntimeForestSpatialManifest {
  const source = manifest.byKind.region.find((candidate) =>
    candidate.path === "data/world/regions/valley-prologue.v0.1.yaml" && candidate.content.region_id === "valley_prologue",
  );
  if (!source) throw new Error("continuous forest projection requires the canonical valley region");
  const contract = object(source.content.continuous_map_contract, "continuous_map_contract");
  const body = {
    sourcePath: source.path,
    profileId: string(contract.profile_id ?? object(contract.camera, "camera").profile_id, "profile ID"),
    runtimeOrigin: string(contract.runtime_origin, "runtime origin"),
    regionBoundsPx: size(object(contract.region_bounds_px, "region bounds"), "region bounds"),
    viewportPx: size(object(contract.viewport_px, "viewport"), "viewport"),
    viewportEnvelope: columnsRows(object(contract.viewport_envelope, "viewport envelope")),
    storageChunkPx: size(object(contract.storage_chunk_px, "storage chunk"), "storage chunk"),
    visibleMaterialCellPx: integer(contract.visible_material_cell_px, "visible material cell"),
    chapterOneAccessibleRatio: ratio(object(contract.chapter_one_accessible_ratio, "accessible ratio")),
    camera: camera(object(contract.camera, "camera")),
    anchors: objects(contract.anchors, "anchors").map((entry) => ({
      anchorId: string(entry.anchor_id, "anchor ID"), sceneId: string(entry.scene_id, "anchor scene ID"),
      positionPx: point(entry.position_px, "anchor position"),
    })),
    chapterOneRouteAnchorIds: strings(contract.chapter_one_route_anchor_ids, "chapter-one route"),
    laterGateAnchorIds: strings(contract.later_gate_anchor_ids, "later gates"),
    districts: objects(contract.districts, "districts").map((entry) => ({
      districtId: string(entry.district_id, "district ID"), sceneId: string(entry.scene_id, "district scene ID"),
      boundsPx: rect(entry.bounds_px, "district bounds"),
    })),
    routeEdges: objects(contract.route_edges, "route edges").map((entry) => ({
      edgeId: string(entry.edge_id, "edge ID"), from: string(entry.from, "edge from"), to: string(entry.to, "edge to"),
      capability: nullableString(entry.capability, "edge capability"),
    })),
    meadowGroundBandPx: meadow(object(contract.meadow_ground_band_px, "meadow ground band")),
    waterCourseControlPointsPx: array(contract.water_course_control_points_px, "water course").map((entry) => point(entry, "water course point")),
    landmarks: objects(contract.landmarks, "landmarks").map((entry) => ({
      landmarkId: string(entry.landmark_id, "landmark ID"), districtId: string(entry.district_id, "landmark district"),
      boundsPx: rect(entry.bounds_px, "landmark bounds"), revealStageIds: strings(entry.reveal_stage_ids, "landmark reveal stages"),
    })),
    encounterChambers: objects(contract.encounter_chambers, "encounter chambers").map((entry) => ({
      chamberId: string(entry.chamber_id, "chamber ID"), districtId: string(entry.district_id, "chamber district"),
      escapeEdgeIds: strings(entry.escape_edge_ids, "chamber escape edges"),
    })),
  };
  return { sourceDigest: computeRuntimeManifestDigest(body), ...body } as RuntimeForestSpatialManifest;
}

function object(value: ContentValue | undefined, label: string): ContentObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as ContentObject; }
function objects(value: ContentValue | undefined, label: string): ContentObject[] { return array(value, label).map((entry, index) => object(entry, `${label}[${index}]`)); }
function array(value: ContentValue | undefined, label: string): ContentValue[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value; }
function string(value: ContentValue | undefined, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function strings(value: ContentValue | undefined, label: string): string[] { return array(value, label).map((entry, index) => string(entry, `${label}[${index}]`)); }
function integer(value: ContentValue | undefined, label: string): number { if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`); return value as number; }
function number(value: ContentValue | undefined, label: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`); return value; }
function nullableString(value: ContentValue | undefined, label: string): string | null { if (value === null) return null; return string(value, label); }
function point(value: ContentValue | undefined, label: string): readonly [number, number] { const values = array(value, label); if (values.length !== 2) throw new Error(`${label} must have two coordinates`); return [integer(values[0], `${label}.x`), integer(values[1], `${label}.y`)]; }
function size(value: ContentObject, label: string): { width: number; height: number } { return { width: integer(value.width, `${label}.width`), height: integer(value.height, `${label}.height`) }; }
function columnsRows(value: ContentObject): { columns: number; rows: number } { return { columns: integer(value.columns, "viewport columns"), rows: integer(value.rows, "viewport rows") }; }
function ratio(value: ContentObject): { minimum: number; maximum: number } { return { minimum: number(value.minimum, "ratio minimum"), maximum: number(value.maximum, "ratio maximum") }; }
function rect(value: ContentValue | undefined, label: string): { x: number; y: number; width: number; height: number } { const values = array(value, label); if (values.length !== 4) throw new Error(`${label} must have four values`); return { x: integer(values[0], `${label}.x`), y: integer(values[1], `${label}.y`), width: integer(values[2], `${label}.width`), height: integer(values[3], `${label}.height`) }; }
function meadow(value: ContentObject): { left: number; right: number; y: number; maximumVerticalDelta: number } { return { left: integer(value.left, "meadow left"), right: integer(value.right, "meadow right"), y: integer(value.y, "meadow y"), maximumVerticalDelta: integer(value.maximum_vertical_delta, "meadow delta") }; }
function camera(value: ContentObject) { return { fixedZoom: boolean(value.fixed_zoom, "camera fixed zoom"), movementLookAheadRatio: number(value.movement_look_ahead_ratio, "camera look ahead"), deadZoneNormalized: { left: number(object(value.dead_zone_normalized, "camera dead zone").left, "camera dead zone left"), right: number(object(value.dead_zone_normalized, "camera dead zone").right, "camera dead zone right"), top: number(object(value.dead_zone_normalized, "camera dead zone").top, "camera dead zone top"), bottom: number(object(value.dead_zone_normalized, "camera dead zone").bottom, "camera dead zone bottom") }, downwardBiasRatio: number(value.downward_bias_ratio, "camera downward bias"), upwardLagRatio: number(value.upward_lag_ratio, "camera upward lag"), pixelSnap: boolean(value.pixel_snap, "camera pixel snap") }; }
function boolean(value: ContentValue | undefined, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} must be boolean`); return value; }
