import { computeRuntimeManifestDigest } from "./runtime-manifest-digest";

export interface RuntimeForestSpatialManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/world/regions/valley-prologue.v0.1.yaml";
  readonly profileId: "forest_side_scroll.v0.1";
  readonly runtimeOrigin: "top_left";
  readonly regionBoundsPx: Readonly<{ width: 10240; height: 2880 }>;
  readonly viewportPx: Readonly<{ width: 640; height: 360 }>;
  readonly viewportEnvelope: Readonly<{ columns: 16; rows: 8 }>;
  readonly storageChunkPx: Readonly<{ width: 16; height: 16 }>;
  readonly visibleMaterialCellPx: 1;
  readonly chapterOneAccessibleRatio: Readonly<{ minimum: 0.35; maximum: 0.4 }>;
  readonly camera: Readonly<{ fixedZoom: true; movementLookAheadRatio: 0.18; deadZoneNormalized: Readonly<{ left: 0.38; right: 0.62; top: 0.35; bottom: 0.67 }>; downwardBiasRatio: 0.14; upwardLagRatio: 0.08; pixelSnap: true }>;
  readonly anchors: readonly Readonly<{ anchorId: string; sceneId: string; positionPx: readonly [number, number] }>[];
  readonly chapterOneRouteAnchorIds: readonly string[];
  readonly laterGateAnchorIds: readonly string[];
  readonly districts: readonly Readonly<{ districtId: string; sceneId: string; boundsPx: Readonly<{ x: number; y: number; width: number; height: number }> }> [];
  readonly routeEdges: readonly Readonly<{ edgeId: string; from: string; to: string; capability: string | null }>[];
  readonly meadowGroundBandPx: Readonly<{ left: number; right: number; y: number; maximumVerticalDelta: number }>;
  readonly waterCourseControlPointsPx: readonly (readonly [number, number])[];
  readonly landmarks: readonly Readonly<{ landmarkId: string; districtId: string; boundsPx: Readonly<{ x: number; y: number; width: number; height: number }>; revealStageIds: readonly string[] }>[];
  readonly encounterChambers: readonly Readonly<{ chamberId: string; districtId: string; escapeEdgeIds: readonly string[] }>[];
}

const verified = new WeakSet<object>();
const REQUIRED_IDS = {
  anchors: ["forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch", "forest.waterwheel", "forest.cistern", "forest.den_bypass", "forest.return_channel", "forest.underground_node", "forest.safe_range", "forest.old_mine"],
  districts: ["forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch", "forest.waterwheel", "forest.cistern", "forest.den_bypass", "forest.return_channel", "forest.underground_node", "forest.safe_range", "forest.old_mine"],
  edges: ["arrival.stream", "stream.settlement", "settlement.hermit", "hermit.waterwheel", "waterwheel.cistern", "waterwheel.den", "den.cistern", "cistern.return", "return.underground", "underground.settlement", "settlement.safe_range", "settlement.old_mine"],
  landmarks: ["forest.waterwheel_structure"],
} as const;

export function isVerifiedRuntimeForestSpatialManifest(value: unknown): value is RuntimeForestSpatialManifest { return typeof value === "object" && value !== null && verified.has(value); }

export function readRuntimeForestSpatialManifest(candidate: unknown): RuntimeForestSpatialManifest {
  const artifact = record(candidate, "runtime content artifact");
  const raw = record(artifact.forestSpatial, "artifact.forestSpatial");
  exactKeys(raw, ["sourceDigest", "sourcePath", "profileId", "runtimeOrigin", "regionBoundsPx", "viewportPx", "viewportEnvelope", "storageChunkPx", "visibleMaterialCellPx", "chapterOneAccessibleRatio", "camera", "anchors", "chapterOneRouteAnchorIds", "laterGateAnchorIds", "districts", "routeEdges", "meadowGroundBandPx", "waterCourseControlPointsPx", "landmarks", "encounterChambers"], "forest spatial manifest");
  const digest = string(raw.sourceDigest, "forest spatial sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("forest spatial sourceDigest must be sha256");
  validateCanonical(raw);
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeManifestDigest(payload) !== digest) throw new Error("forest spatial projection digest mismatch");
  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimeForestSpatialManifest;
  verified.add(result);
  return result;
}

function validateCanonical(raw: Record<string, unknown>): void {
  if (raw.sourcePath !== "data/world/regions/valley-prologue.v0.1.yaml" || raw.profileId !== "forest_side_scroll.v0.1" || raw.runtimeOrigin !== "top_left" || raw.visibleMaterialCellPx !== 1) throw new Error("forest spatial identity is noncanonical");
  exact(raw.regionBoundsPx, { width: 10240, height: 2880 }, "forest region bounds"); exact(raw.viewportPx, { width: 640, height: 360 }, "forest viewport"); exact(raw.viewportEnvelope, { columns: 16, rows: 8 }, "forest viewport envelope"); exact(raw.storageChunkPx, { width: 16, height: 16 }, "forest storage chunk"); exact(raw.chapterOneAccessibleRatio, { minimum: 0.35, maximum: 0.4 }, "forest accessible ratio");
  exact(raw.camera, { fixedZoom: true, movementLookAheadRatio: 0.18, deadZoneNormalized: { left: 0.38, right: 0.62, top: 0.35, bottom: 0.67 }, downwardBiasRatio: 0.14, upwardLagRatio: 0.08, pixelSnap: true }, "forest camera");
  exactIds(raw.anchors, "anchorId", REQUIRED_IDS.anchors, "forest anchors"); exactIds(raw.districts, "districtId", REQUIRED_IDS.districts, "forest districts"); exactIds(raw.routeEdges, "edgeId", REQUIRED_IDS.edges, "forest route edges"); exactIds(raw.landmarks, "landmarkId", REQUIRED_IDS.landmarks, "forest landmarks");
  exact(raw.chapterOneRouteAnchorIds, ["forest.arrival", "forest.stream", "forest.settlement", "forest.hermit_branch", "forest.waterwheel", "forest.cistern", "forest.return_channel", "forest.underground_node", "forest.settlement"], "forest chapter-one route"); exact(raw.laterGateAnchorIds, ["forest.safe_range", "forest.old_mine"], "forest later gates");
  const anchors = records(raw.anchors, "forest anchors"); const districts = records(raw.districts, "forest districts"); const edges = records(raw.routeEdges, "forest route edges"); const landmarks = records(raw.landmarks, "forest landmarks");
  const expectedAnchorScenes = ["scene.valley.arrival_shelf", "scene.valley.stream_section", "scene.valley.settlement", "scene.valley.stream_section", "scene.valley.waterwheel", "scene.valley.high_cistern", "scene.valley.den_bypass", "scene.valley.return_channel", "scene.valley.underground_order_node", "scene.valley.safe_range", "scene.valley.old_mine_threshold"];
  const expectedPositions = [[512, 480], [1664, 704], [3072, 672], [4032, 992], [5312, 1488], [6560, 1056], [6176, 1792], [7488, 1744], [8704, 2016], [3360, 192], [9248, 2208]];
  anchors.forEach((entry, index) => { exactKeys(entry, ["anchorId", "sceneId", "positionPx"], "forest anchor"); if (entry.sceneId !== expectedAnchorScenes[index] || !same(entry.positionPx, expectedPositions[index]!)) throw new Error("forest anchor mapping is noncanonical"); });
  const expectedBounds = [[0,256,1280,640],[1280,448,1216,768],[2496,384,1280,640],[3776,768,768,640],[4544,1024,1536,960],[6080,640,960,768],[6080,1472,960,640],[7040,1408,1152,704],[8192,1728,896,704],[3072,32,640,320],[9088,1888,1024,640]];
  districts.forEach((entry, index) => { exactKeys(entry, ["districtId", "sceneId", "boundsPx"], "forest district"); if (!sameRect(entry.boundsPx, expectedBounds[index]!)) throw new Error("forest district geometry is noncanonical"); });
  const expectedEdges = [["forest.arrival","forest.stream",null],["forest.stream","forest.settlement",null],["forest.settlement","forest.hermit_branch",null],["forest.hermit_branch","forest.waterwheel",null],["forest.waterwheel","forest.cistern","maintenance_access_open"],["forest.waterwheel","forest.den_bypass",null],["forest.den_bypass","forest.cistern","den_route_open"],["forest.cistern","forest.return_channel","exit_ladder_lowered"],["forest.return_channel","forest.underground_node","settlement_supply_stable"],["forest.underground_node","forest.settlement","forest_chapter_epilogue_committed"],["forest.settlement","forest.safe_range","range_trial_permission"],["forest.settlement","forest.old_mine","forest_chapter_epilogue_committed"]];
  edges.forEach((entry, index) => { exactKeys(entry, ["edgeId", "from", "to", "capability"], "forest route edge"); if (!same([entry.from, entry.to, entry.capability], expectedEdges[index]!)) throw new Error("forest route edge is noncanonical"); });
  exact(raw.meadowGroundBandPx, { left: 2496, right: 3776, y: 704, maximumVerticalDelta: 16 }, "forest meadow"); exact(raw.waterCourseControlPointsPx, [[1088,672],[1792,800],[3328,752],[4352,1120],[5184,1504],[7424,1792]], "forest water course");
  if (landmarks.length !== 1) throw new Error("forest landmark IDs are invalid"); const landmark = landmarks[0]!; exactKeys(landmark, ["landmarkId", "districtId", "boundsPx", "revealStageIds"], "forest landmark"); if (landmark.districtId !== "forest.waterwheel" || !sameRect(landmark.boundsPx, [4800,1120,1408,1024]) || !same(landmark.revealStageIds, ["channel_sound","support_beams","broken_rim","inner_machinery"])) throw new Error("forest landmark is noncanonical");
  const chambers = records(raw.encounterChambers, "forest encounter chambers"); if (chambers.length !== 3) throw new Error("forest encounter chambers are invalid"); const expectedChambers = [["forest.stream.bend","forest.stream",["arrival.stream","stream.settlement"]],["forest.waterwheel.approach","forest.waterwheel",["hermit.waterwheel","waterwheel.den"]],["forest.return.lower","forest.return_channel",["cistern.return","return.underground"]]]; chambers.forEach((entry,index) => { exactKeys(entry,["chamberId","districtId","escapeEdgeIds"],"forest encounter chamber"); if (!same([entry.chamberId, entry.districtId], expectedChambers[index]!.slice(0,2)) || !same(entry.escapeEdgeIds, expectedChambers[index]![2] as string[])) throw new Error("forest encounter chamber is noncanonical"); });
}

function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function records(value: unknown, label: string): Record<string, unknown>[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array`); return value.map((entry,index) => record(entry, `${label}[${index}]`)); }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function exact(value: unknown, expected: unknown, label: string): void { if (!same(value, expected)) throw new Error(`${label} is noncanonical`); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { const keys = Object.keys(value); if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`); }
function exactIds(value: unknown, key: string, expected: readonly string[], label: string): void { const entries=records(value,label); const ids=entries.map((entry)=>string(entry[key],`${label}.${key}`)); if (new Set(ids).size !== ids.length || !same(ids, expected)) throw new Error(`${label} are noncanonical`); }
function same(left: unknown, right: unknown): boolean { if (left === right) return true; if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry,index)=>same(entry,right[index])); if (typeof left === "object" || typeof right === "object") { if (typeof left !== "object" || left === null || typeof right !== "object" || right === null || Array.isArray(left) || Array.isArray(right)) return false; const leftRecord=left as Record<string,unknown>, rightRecord=right as Record<string,unknown>, keys=Object.keys(leftRecord); return keys.length===Object.keys(rightRecord).length && keys.every((key)=>key in rightRecord && same(leftRecord[key],rightRecord[key])); } return false; }
function sameRect(value: unknown, expected: readonly number[]): boolean { return same(value, { x: expected[0], y: expected[1], width: expected[2], height: expected[3] }); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
