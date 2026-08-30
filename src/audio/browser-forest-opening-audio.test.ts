import { describe, expect, it } from "vitest";
import { runtimeForestOpeningAssetExport } from "../assets/runtime-forest-opening-assets";
import {
  BrowserForestOpeningAudio,
  mixForestOpeningAudioFrame,
  type ForestOpeningAudioPort,
} from "./browser-forest-opening-audio";

describe("browser forest opening audio", () => {
  it("fails closed before activation while the exact approved pack is missing", () => {
    const port: ForestOpeningAudioPort = { setLoopGain() {}, playOneShot() {}, suspend() {}, resume() {} };
    const audio = new BrowserForestOpeningAudio(runtimeForestOpeningAssetExport, port);
    expect(audio.activate()).toEqual({ ok: false, reason: "asset_pack_missing" });
  });

  it("crossfades forest and stream ambience by district and distance", () => {
    const stream = mixForestOpeningAudioFrame({
      districtId: "forest.stream",
      listener: { x: 1800, y: 680 },
      streamPosition: { x: 1840, y: 704 },
      muted: false,
      suspended: false,
    });
    expect(stream.loops.forest_ambience).toBeGreaterThan(0);
    expect(stream.loops.stream_ambience).toBeGreaterThan(stream.loops.forest_ambience);

    const arrival = mixForestOpeningAudioFrame({
      districtId: "forest.arrival",
      listener: { x: 256, y: 640 },
      streamPosition: { x: 1840, y: 704 },
      muted: false,
      suspended: false,
    });
    expect(arrival.loops.forest_ambience).toBeGreaterThan(arrival.loops.stream_ambience);
  });

  it("projects surface/object/water/dialogue events to narrow sound roles", () => {
    const frame = mixForestOpeningAudioFrame({
      districtId: "forest.stream",
      listener: { x: 1800, y: 680 },
      streamPosition: { x: 1840, y: 704 },
      muted: false,
      suspended: false,
      events: [
        { kind: "footstep", surface: "mud", position: { x: 1800, y: 680 } },
        { kind: "object_collision", position: { x: 1810, y: 680 } },
        { kind: "water_entry", position: { x: 1820, y: 680 } },
        { kind: "dialogue_blip", position: { x: 1800, y: 680 } },
      ],
    });
    expect(frame.oneShots.map(({ role, variant }) => [role, variant])).toEqual([
      ["foley_bank", "footstep_mud"],
      ["foley_bank", "object_collision"],
      ["foley_bank", "water_entry"],
      ["dialogue_blip_bank", "neutral_blip"],
    ]);
    expect(frame.oneShots.every(({ gain }) => gain > 0 && gain <= 1)).toBe(true);
  });

  it("mutes or suspends every loop and one-shot", () => {
    for (const key of ["muted", "suspended"] as const) {
      const frame = mixForestOpeningAudioFrame({
        districtId: "forest.stream",
        listener: { x: 1800, y: 680 },
        streamPosition: { x: 1840, y: 704 },
        muted: key === "muted",
        suspended: key === "suspended",
        events: [{ kind: "dialogue_blip", position: { x: 1800, y: 680 } }],
      });
      expect(frame.loops).toEqual({ forest_ambience: 0, stream_ambience: 0 });
      expect(frame.oneShots).toEqual([]);
    }
  });
});
