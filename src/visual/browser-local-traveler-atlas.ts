import type { ForestOpeningPublicView } from "./forest-opening-view";

export interface LocalTravelerAtlas {
  readonly image: CanvasImageSource & Readonly<{ naturalWidth: number; naturalHeight: number }>;
  readonly version: "v0.6";
}

export type LocalTravelerAtlasLoadResult =
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "ready"; atlas: LocalTravelerAtlas }>;

const LOCAL_ATLAS_URL = "/src/local-art-cache/traveler-atlas.v0.6.png";
const CELL_SIZE = 24;
const FOOT_ANCHOR_Y = 22;

export async function loadBrowserLocalTravelerAtlas(
  enabled: boolean,
  loadImage: (url: string) => Promise<LocalTravelerAtlas["image"]>,
): Promise<LocalTravelerAtlasLoadResult> {
  if (!enabled) return Object.freeze({ status: "unavailable" });
  try {
    const image = await loadImage(LOCAL_ATLAS_URL);
    if (image.naturalWidth !== 192 || image.naturalHeight !== 96) {
      return Object.freeze({ status: "unavailable" });
    }
    return Object.freeze({
      status: "ready",
      atlas: Object.freeze({ image, version: "v0.6" }),
    });
  } catch {
    return Object.freeze({ status: "unavailable" });
  }
}

export function loadBrowserLocalTravelerAtlasFromDocument(): Promise<LocalTravelerAtlasLoadResult> {
  return loadBrowserLocalTravelerAtlas(import.meta.env.DEV, (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image as LocalTravelerAtlas["image"]);
    image.onerror = () => reject(new Error("local traveler atlas request failed"));
    image.src = url;
  }));
}

export function drawForestOpeningLocalTraveler(
  context: CanvasRenderingContext2D,
  view: ForestOpeningPublicView,
  atlas: LocalTravelerAtlas,
): void {
  const frame = frameFor(view);
  const destination = localTravelerBounds(view);
  context.save();
  if (view.traveler.facing < 0) {
    context.translate(destination.x * 2 + CELL_SIZE, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    atlas.image,
    frame.column * CELL_SIZE,
    frame.row * CELL_SIZE,
    CELL_SIZE,
    CELL_SIZE,
    destination.x,
    destination.y,
    CELL_SIZE,
    CELL_SIZE,
  );
  context.restore();
}

export function localTravelerBounds(view: ForestOpeningPublicView): Readonly<{
  x: number; y: number; width: 24; height: 24;
}> {
  const footX = view.traveler.position.x + 6;
  const footY = view.traveler.position.y + 14;
  return Object.freeze({
    x: Math.round(footX - CELL_SIZE / 2 - view.camera.x),
    y: Math.round(footY - FOOT_ANCHOR_Y - view.camera.y),
    width: CELL_SIZE,
    height: CELL_SIZE,
  });
}

function frameFor(view: ForestOpeningPublicView): Readonly<{ column: number; row: number }> {
  if (view.traveler.animationId === "run") {
    const index = view.traveler.frame % 8;
    return index < 4
      ? Object.freeze({ column: index + 4, row: 0 })
      : Object.freeze({ column: index - 4, row: 1 });
  }
  if (view.traveler.animationId === "walk") {
    const index = view.traveler.frame % 8;
    return index < 4
      ? Object.freeze({ column: index + 4, row: 2 })
      : Object.freeze({ column: index - 4, row: 3 });
  }
  if (view.traveler.animationId === "jump") {
    return Object.freeze({ column: 4 + view.traveler.frame % 2, row: 1 });
  }
  if (view.traveler.animationId === "fall") {
    return Object.freeze({ column: 6 + view.traveler.frame % 2, row: 1 });
  }
  if (["push", "drag", "dig"].includes(view.traveler.animationId)) {
    return Object.freeze({ column: view.traveler.frame % 4, row: 2 });
  }
  return Object.freeze({ column: view.traveler.frame % 4, row: 0 });
}
