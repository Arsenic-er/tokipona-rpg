import { describe, expect, it } from "vitest";
import type {
  RuntimeForestOpeningAssetPack,
  RuntimeForestOpeningAssetRole,
} from "../assets/runtime-forest-opening-assets";
import { loadBrowserForestOpeningVisualAssets } from "./browser-forest-opening-assets";

describe("browser forest opening visual assets", () => {
  it("loads every approved visual role and validates dimensions before becoming ready", async () => {
    const pack = approvedPack();
    const requestedImages: string[] = [];
    const requestedJson: string[] = [];
    const loaded = await loadBrowserForestOpeningVisualAssets(pack, {
      loadImage: async (path) => {
        requestedImages.push(path);
        const file = pack.files.find(({ publicPath }) => publicPath === path)!;
        return { naturalWidth: file.width, naturalHeight: file.height } as CanvasImageSource &
          Readonly<{ naturalWidth: number; naturalHeight: number }>;
      },
      fetchJson: async (path) => {
        requestedJson.push(path);
        return path.endsWith("animation.json")
          ? animationManifest()
          : timePalette();
      },
    });

    expect(loaded.status).toBe("ready");
    if (loaded.status !== "ready") throw new Error("approved fixture did not load");
    expect(loaded.assets.packId).toBe("forest.opening.vertical-slice.v001");
    expect(requestedImages).toEqual([
      "assets/far.png", "assets/mid.png", "assets/environment.png", "assets/glyph.png",
      "assets/traveler.png", "assets/creature.png",
    ]);
    expect(requestedJson).toEqual(["assets/animation.json", "assets/time.json"]);
    expect(Object.keys(loaded.assets.images).sort()).toEqual([
      "creature_atlas", "environment_atlas", "far_parallax_atlas", "mid_parallax_atlas",
      "prop_glyph_atlas", "traveler_atlas",
    ]);
    expect(loaded.assets.travelerAnimations.walk).toEqual({
      row: 1, frames: 4, frameWidthPx: 64, frameHeightPx: 20, footAnchorYPx: 52,
    });
    expect(loaded.assets.timePalette.map(({ id }) => id)).toEqual(["dawn", "day", "dusk", "night"]);
  });

  it("does not request private/public files while the authority is missing", async () => {
    let requests = 0;
    const loaded = await loadBrowserForestOpeningVisualAssets({
      schemaVersion: "tokipona.forest-opening-private-export.v0.1", status: "missing",
    }, {
      loadImage: async () => { requests += 1; throw new Error("should not load"); },
      fetchJson: async () => { requests += 1; throw new Error("should not load"); },
    });
    expect(loaded).toEqual({ status: "missing" });
    expect(requests).toBe(0);
  });

  it("fails closed on one wrong dimension or manifest identity", async () => {
    const pack = approvedPack();
    expect(await loadBrowserForestOpeningVisualAssets(pack, {
      loadImage: async (path) => {
        const file = pack.files.find(({ publicPath }) => publicPath === path)!;
        return { naturalWidth: path.endsWith("traveler.png") ? 255 : file.width,
          naturalHeight: file.height } as CanvasImageSource & Readonly<{ naturalWidth: number; naturalHeight: number }>;
      },
      fetchJson: async (path) => path.endsWith("animation.json")
        ? animationManifest()
        : { schema_version: "wrong", geometry_changes: false, states: [] },
    })).toEqual({ status: "approved_pack_load_failed" });
  });

  it("rejects review/private metadata hidden inside approved JSON manifests", async () => {
    const pack = approvedPack();
    const animation = animationManifest() as Record<string, unknown>;
    animation.source_path = "C:/private/review/traveler.png";
    expect(await loadBrowserForestOpeningVisualAssets(pack, {
      loadImage: async (path) => {
        const file = pack.files.find(({ publicPath }) => publicPath === path)!;
        return { naturalWidth: file.width, naturalHeight: file.height } as CanvasImageSource &
          Readonly<{ naturalWidth: number; naturalHeight: number }>;
      },
      fetchJson: async (path) => path.endsWith("animation.json") ? animation : timePalette(),
    })).toEqual({ status: "approved_pack_load_failed" });
  });
});

function approvedPack(): RuntimeForestOpeningAssetPack {
  const files: readonly (readonly [RuntimeForestOpeningAssetRole, string, number, number])[] = [
    ["far_parallax_atlas", "assets/far.png", 640, 360],
    ["mid_parallax_atlas", "assets/mid.png", 640, 360],
    ["environment_atlas", "assets/environment.png", 256, 256],
    ["prop_glyph_atlas", "assets/glyph.png", 256, 128],
    ["traveler_atlas", "assets/traveler.png", 256, 256],
    ["creature_atlas", "assets/creature.png", 128, 64],
    ["animation_manifest", "assets/animation.json", 0, 0],
    ["time_palette", "assets/time.json", 0, 0],
    ["audio_manifest", "assets/audio.json", 0, 0],
    ["forest_ambience", "assets/forest.wav", 0, 0],
    ["stream_ambience", "assets/stream.wav", 0, 0],
    ["foley_bank", "assets/foley.wav", 0, 0],
    ["dialogue_blip_bank", "assets/dialogue.wav", 0, 0],
  ];
  return {
    schemaVersion: "tokipona.forest-opening-private-export.v0.1", status: "approved",
    packId: "forest.opening.vertical-slice.v001", manifestDigest: `sha256:${"a".repeat(64)}`,
    files: files.map(([role, publicPath, width, height]) => ({ role, publicPath, width, height,
      sha256: `sha256:${"b".repeat(64)}` })),
    constraints: { spriteBinaryAlpha: true, maxPaletteColors: 64, travelerMaxFrameHeightPx: 20,
      audioPeakDbfsMax: -1, audioClippedSamples: 0 },
    approvals: { source: "approved", license: "approved", pixel: "approved", animation: "approved",
      audio: "approved", accessibility: "approved", hashes: "approved" },
    privacy: { containsPrivatePaths: false, containsPrivateAssets: false, containsConceptAssets: false,
      containsReviewMedia: false },
  };
}

function animationManifest(): unknown {
  return {
    schema_version: "tokipona.forest-opening-animation.v0.1",
    traveler: ["idle", "walk", "run", "jump", "fall", "push", "drag", "dig", "observe"]
      .map((action, row) => ({ action, row, frames: 4, frame_width_px: 64,
        frame_height_px: 20, foot_anchor_y_px: row * 28 + 24 })),
    creatures: { rabbit: ["idle", "forage", "alert", "flee", "hide"],
      stream_bird: ["perch", "peck", "drink", "alert", "short_flight"] },
  };
}

function timePalette(): unknown {
  return {
    schema_version: "tokipona.forest-opening-time-palette.v0.1",
    geometry_changes: false,
    states: ["dawn", "day", "dusk", "night"].map((id) => ({
      id, multiply: [0.8, 0.8, 0.8], ambient: [20, 30, 40],
    })),
  };
}
