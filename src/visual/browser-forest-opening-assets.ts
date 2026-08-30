import type {
  RuntimeForestOpeningAssetExport,
  RuntimeForestOpeningAssetPack,
  RuntimeForestOpeningAssetRole,
} from "../assets/runtime-forest-opening-assets";

const IMAGE_ROLES = Object.freeze([
  "far_parallax_atlas", "mid_parallax_atlas", "environment_atlas", "prop_glyph_atlas",
  "traveler_atlas", "creature_atlas",
] as const);
type VisualRole = (typeof IMAGE_ROLES)[number];
const TRAVELER_ACTIONS = Object.freeze([
  "idle", "walk", "run", "jump", "fall", "push", "drag", "dig", "observe",
] as const);
export type ForestOpeningTravelerAction = (typeof TRAVELER_ACTIONS)[number];

export type ForestOpeningVisualImage = CanvasImageSource & Readonly<{
  naturalWidth: number;
  naturalHeight: number;
}>;

export interface LoadedForestOpeningVisualAssets {
  readonly packId: RuntimeForestOpeningAssetPack["packId"];
  readonly images: Readonly<Record<VisualRole, ForestOpeningVisualImage>>;
  readonly travelerAnimations: Readonly<Record<ForestOpeningTravelerAction, Readonly<{
    row: number; frames: number; frameWidthPx: number; frameHeightPx: number; footAnchorYPx: number;
  }>>>;
  readonly timePalette: readonly Readonly<{
    id: "dawn" | "day" | "dusk" | "night";
    multiply: readonly [number, number, number];
    ambient: readonly [number, number, number];
  }>[];
}

export type ForestOpeningVisualAssetLoadResult =
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "approved_pack_load_failed" }>
  | Readonly<{ status: "ready"; assets: LoadedForestOpeningVisualAssets }>;

export async function loadBrowserForestOpeningVisualAssets(
  assets: RuntimeForestOpeningAssetExport,
  platform: Readonly<{
    loadImage: (publicPath: string) => Promise<ForestOpeningVisualImage>;
    fetchJson: (publicPath: string) => Promise<unknown>;
  }>,
): Promise<ForestOpeningVisualAssetLoadResult> {
  if (assets.status !== "approved") return Object.freeze({ status: "missing" });
  try {
    const images = {} as Record<VisualRole, ForestOpeningVisualImage>;
    for (const role of IMAGE_ROLES) {
      const file = requiredFile(assets, role);
      const image = await platform.loadImage(file.publicPath);
      if (image.naturalWidth !== file.width || image.naturalHeight !== file.height) {
        throw new Error("forest opening visual asset dimensions are invalid");
      }
      images[role] = image;
    }
    const travelerAnimations = readAnimations(
      await platform.fetchJson(requiredFile(assets, "animation_manifest").publicPath),
    );
    const timePalette = readTimePalette(
      await platform.fetchJson(requiredFile(assets, "time_palette").publicPath),
    );
    return Object.freeze({ status: "ready", assets: Object.freeze({
      packId: assets.packId, images: Object.freeze(images), travelerAnimations, timePalette,
    }) });
  } catch {
    return Object.freeze({ status: "approved_pack_load_failed" });
  }
}

export function loadBrowserForestOpeningVisualAssetsFromDocument(
  assets: RuntimeForestOpeningAssetExport,
): Promise<ForestOpeningVisualAssetLoadResult> {
  return loadBrowserForestOpeningVisualAssets(assets, {
    loadImage: (publicPath) => new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image as ForestOpeningVisualImage);
      image.onerror = () => reject(new Error("forest opening visual asset request failed"));
      image.src = new URL(publicPath, document.baseURI).toString();
    }),
    fetchJson: async (publicPath) => {
      const response = await fetch(new URL(publicPath, document.baseURI));
      if (!response.ok) throw new Error("forest opening visual manifest request failed");
      return response.json() as Promise<unknown>;
    },
  });
}

function requiredFile(
  assets: RuntimeForestOpeningAssetPack,
  role: RuntimeForestOpeningAssetRole,
): RuntimeForestOpeningAssetPack["files"][number] {
  const file = assets.files.find((candidate) => candidate.role === role);
  if (!file) throw new Error("forest opening approved visual role is missing");
  return file;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("forest opening visual manifest field is invalid");
  }
  return value as Record<string, unknown>;
}

function readAnimations(candidate: unknown): LoadedForestOpeningVisualAssets["travelerAnimations"] {
  const root = record(candidate);
  exactKeys(root, ["schema_version", "traveler", "creatures"]);
  if (root.schema_version !== "tokipona.forest-opening-animation.v0.1" ||
      !Array.isArray(root.traveler) || root.traveler.length !== TRAVELER_ACTIONS.length) {
    throw new Error("forest opening animation manifest is invalid");
  }
  const result = {} as Record<ForestOpeningTravelerAction, {
    row: number; frames: number; frameWidthPx: number; frameHeightPx: number; footAnchorYPx: number;
  }>;
  for (let index = 0; index < TRAVELER_ACTIONS.length; index += 1) {
    const expectedAction = TRAVELER_ACTIONS[index]!;
    const entry = record(root.traveler[index]);
    exactKeys(entry, ["action", "row", "frames", "frame_width_px", "frame_height_px", "foot_anchor_y_px"]);
    if (entry.action !== expectedAction || entry.row !== index || entry.frames !== 4 ||
        entry.frame_width_px !== 64 || entry.frame_height_px !== 20 ||
        entry.foot_anchor_y_px !== index * 28 + 24) {
      throw new Error("forest opening traveler animation cell is invalid");
    }
    result[expectedAction] = Object.freeze({ row: index, frames: 4, frameWidthPx: 64,
      frameHeightPx: 20, footAnchorYPx: index * 28 + 24 });
  }
  const creatures = record(root.creatures);
  exactKeys(creatures, ["rabbit", "stream_bird"]);
  if (JSON.stringify(creatures.rabbit) !== JSON.stringify(["idle", "forage", "alert", "flee", "hide"]) ||
      JSON.stringify(creatures.stream_bird) !== JSON.stringify(["perch", "peck", "drink", "alert", "short_flight"])) {
    throw new Error("forest opening creature animation cells are invalid");
  }
  return Object.freeze(result);
}

function readTimePalette(candidate: unknown): LoadedForestOpeningVisualAssets["timePalette"] {
  const root = record(candidate);
  exactKeys(root, ["schema_version", "geometry_changes", "states"]);
  const ids = ["dawn", "day", "dusk", "night"] as const;
  if (root.schema_version !== "tokipona.forest-opening-time-palette.v0.1" ||
      root.geometry_changes !== false || !Array.isArray(root.states) || root.states.length !== ids.length) {
    throw new Error("forest opening time palette is invalid");
  }
  return Object.freeze(ids.map((id, index) => {
    const state = record((root.states as unknown[])[index]);
    exactKeys(state, ["id", "multiply", "ambient"]);
    if (state.id !== id) throw new Error("forest opening time palette order is invalid");
    return Object.freeze({ id, multiply: triplet(state.multiply, 0, 1), ambient: triplet(state.ambient, 0, 255) });
  }));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key)) ||
      keys.some((key) => !expected.includes(key))) {
    throw new Error("forest opening visual manifest fields are invalid");
  }
}

function triplet(candidate: unknown, minimum: number, maximum: number): readonly [number, number, number] {
  if (!Array.isArray(candidate) || candidate.length !== 3 ||
      candidate.some((value) => !Number.isFinite(value) || value < minimum || value > maximum)) {
    throw new Error("forest opening time palette channel is invalid");
  }
  return Object.freeze([...candidate]) as readonly [number, number, number];
}
