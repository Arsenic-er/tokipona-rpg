import { describe, expect, it } from "vitest";
import type {
  RuntimeForestOpeningAssetPack,
  RuntimeForestOpeningAssetRole,
} from "../assets/runtime-forest-opening-assets";
import {
  createWebAudioForestOpeningPort,
  type ForestOpeningAudioBufferSourcePort,
  type ForestOpeningAudioContextPort,
  type ForestOpeningAudioGainPort,
} from "./web-audio-forest-opening-port";

const AUDIO_ROLES = ["forest_ambience", "stream_ambience", "foley_bank", "dialogue_blip_bank"] as const;

class FakeGain implements ForestOpeningAudioGainPort {
  readonly gain = { value: 0 };
  connect(): void {}
}

class FakeSource implements ForestOpeningAudioBufferSourcePort {
  buffer: unknown = null;
  loop = false;
  started = false;
  startArgs: readonly number[] = [];
  connect(): void {}
  start(...args: number[]): void { this.started = true; this.startArgs = args; }
}

class FakeContext implements ForestOpeningAudioContextPort {
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  resumed = false;
  suspended = false;
  createBufferSource(): FakeSource { const value = new FakeSource(); this.sources.push(value); return value; }
  createGain(): FakeGain { const value = new FakeGain(); this.gains.push(value); return value; }
  async decodeAudioData(data: ArrayBuffer): Promise<unknown> { return { bytes: data.byteLength }; }
  async resume(): Promise<void> { this.resumed = true; }
  async suspend(): Promise<void> { this.suspended = true; }
}

describe("web audio forest opening port", () => {
  it("loads the exact approved audio roles, starts two loops, and plays a one-shot", async () => {
    const context = new FakeContext();
    const requests: string[] = [];
    const port = createWebAudioForestOpeningPort({
      assets: approvedPack(),
      createContext: () => context,
      fetchBytes: async (path) => {
        requests.push(path);
        return path === "assets/audio.json" ? encodedAudioManifest() : new Uint8Array([1, 2, 3]).buffer;
      },
    });

    port.resume();
    port.setLoopGain("forest_ambience", 0.6);
    port.setLoopGain("stream_ambience", 0.2);
    await port.ready();
    port.playOneShot("foley_bank", "footstep_soil", 0.4);

    expect(requests).toEqual(["assets/audio.json", ...AUDIO_ROLES.map((role) => `assets/${role}.wav`)]);
    expect(context.resumed).toBe(true);
    expect(context.sources.slice(0, 2).every((source) => source.loop && source.started)).toBe(true);
    expect(context.sources.at(-1)).toMatchObject({ loop: false, started: true, startArgs: [0, 0, 0.12] });
    expect(context.gains.slice(0, 2).map(({ gain }) => gain.value)).toEqual([0.6, 0.2]);
  });

  it("does not create a context or request files when approval is missing", async () => {
    let contexts = 0;
    const requests: string[] = [];
    const port = createWebAudioForestOpeningPort({
      assets: { schemaVersion: "tokipona.forest-opening-private-export.v0.1", status: "missing" },
      createContext: () => { contexts += 1; return new FakeContext(); },
      fetchBytes: async (path) => { requests.push(path); return new ArrayBuffer(0); },
    });
    port.resume();
    await port.ready();
    expect(contexts).toBe(0);
    expect(requests).toEqual([]);
  });

  it("fails silent when any approved audio file cannot be loaded", async () => {
    const context = new FakeContext();
    const port = createWebAudioForestOpeningPort({
      assets: approvedPack(),
      createContext: () => context,
      fetchBytes: async (path) => {
        if (path === "assets/audio.json") return encodedAudioManifest();
        if (path.includes("stream_ambience")) throw new Error("offline");
        return new Uint8Array([1]).buffer;
      },
    });
    port.resume();
    await port.ready();
    port.playOneShot("foley_bank", "water_entry", 1);
    expect(context.sources).toEqual([]);
  });

  it("rejects a cue assigned to the wrong bank instead of silently dropping it", async () => {
    const context = new FakeContext();
    const invalid = JSON.parse(new TextDecoder().decode(encodedAudioManifest())) as {
      cues: Record<string, { role: string }>;
    };
    invalid.cues.footstep_soil!.role = "dialogue_blip_bank";
    const port = createWebAudioForestOpeningPort({
      assets: approvedPack(),
      createContext: () => context,
      fetchBytes: async (path) => path === "assets/audio.json"
        ? new TextEncoder().encode(JSON.stringify(invalid)).buffer
        : new Uint8Array([1]).buffer,
    });
    port.resume();
    await port.ready();
    port.playOneShot("foley_bank", "footstep_soil", 1);
    expect(context.sources).toEqual([]);
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
    ["forest_ambience", "assets/forest_ambience.wav", 0, 0],
    ["stream_ambience", "assets/stream_ambience.wav", 0, 0],
    ["foley_bank", "assets/foley_bank.wav", 0, 0],
    ["dialogue_blip_bank", "assets/dialogue_blip_bank.wav", 0, 0],
  ];
  return {
    schemaVersion: "tokipona.forest-opening-private-export.v0.1",
    status: "approved",
    packId: "forest.opening.vertical-slice.v001",
    manifestDigest: `sha256:${"a".repeat(64)}`,
    files: files.map(([role, publicPath, width, height]) => ({
      role, publicPath, width, height, sha256: `sha256:${"b".repeat(64)}`,
    })),
    constraints: { spriteBinaryAlpha: true, maxPaletteColors: 64, travelerMaxFrameHeightPx: 20,
      audioPeakDbfsMax: -1, audioClippedSamples: 0 },
    approvals: { source: "approved", license: "approved", pixel: "approved", animation: "approved",
      audio: "approved", accessibility: "approved", hashes: "approved" },
    privacy: { containsPrivatePaths: false, containsPrivateAssets: false, containsConceptAssets: false,
      containsReviewMedia: false },
  };
}

function encodedAudioManifest(): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify({
    schema_version: "tokipona.forest-opening-audio.v0.2",
    cues: {
      footstep_soil: { role: "foley_bank", offset_seconds: 0, duration_seconds: 0.12 },
      footstep_mud: { role: "foley_bank", offset_seconds: 0.15, duration_seconds: 0.12 },
      footstep_stone: { role: "foley_bank", offset_seconds: 0.3, duration_seconds: 0.12 },
      footstep_deadwood: { role: "foley_bank", offset_seconds: 0.45, duration_seconds: 0.12 },
      object_collision: { role: "foley_bank", offset_seconds: 0.6, duration_seconds: 0.2 },
      water_entry: { role: "foley_bank", offset_seconds: 0.85, duration_seconds: 0.25 },
      neutral_blip: { role: "dialogue_blip_bank", offset_seconds: 0, duration_seconds: 0.08 },
    },
  })).buffer;
}
