import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeProceduralDialogueAudioManifest } from
  "../content/runtime-dialogue-audio-manifest";
import { createDialogueBlipPlan, type DialogueBlipRequest } from
  "./procedural-dialogue-blip";

const manifest = readRuntimeProceduralDialogueAudioManifest(generated);
const speakers = [
  "settlement.npc.facility_manager",
  "settlement.npc.repair_contractor",
  "settlement.npc.supply_trader",
  "settlement.npc.butcher",
  "settlement.npc.tanner",
] as const;

describe("deterministic procedural dialogue blip planner", () => {
  it("creates an immutable bounded plan deterministically from semantic-free identity", () => {
    const request = { speakerId: "settlement.npc.supply_trader", cadence: "short" } as const;
    const first = createDialogueBlipPlan(manifest, request);
    expect(createDialogueBlipPlan(manifest, request)).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.notes)).toBe(true);
    expect(first.notes.length).toBeGreaterThanOrEqual(2);
    expect(first.notes.length).toBeLessThanOrEqual(3);
    expect(first.totalDurationMs).toBeLessThanOrEqual(600);
    for (const note of first.notes) {
      expect(Object.isFrozen(note)).toBe(true);
      expect(Number.isFinite(note.frequencyHz)).toBe(true);
      expect(note.frequencyHz).toBeGreaterThanOrEqual(180);
      expect(note.frequencyHz).toBeLessThanOrEqual(520);
      expect(note.gain).toBeLessThanOrEqual(0.03);
    }
  });

  it("gives canonical settlement speakers pairwise-distinct signatures", () => {
    const signatures = speakers.map((speakerId) => JSON.stringify(
      createDialogueBlipPlan(manifest, { speakerId, cadence: "long" }).notes
        .map(({ frequencyHz, waveform }) => [frequencyHz, waveform])));
    expect(new Set(signatures).size).toBe(speakers.length);
  });

  it("rejects invalid identity, unknown keys, and unverified manifest lookalikes", () => {
    for (const speakerId of ["", " ", "NPC 声音", "https://example.invalid/audio"]) {
      expect(() => createDialogueBlipPlan(manifest, { speakerId, cadence: "short" }))
        .toThrow(/speaker/);
    }
    expect(() => createDialogueBlipPlan(manifest, {
      speakerId: speakers[0], cadence: "short", frequencyHz: 999,
    } as unknown as DialogueBlipRequest)).toThrow(/request/);
    expect(() => createDialogueBlipPlan(structuredClone(manifest), {
      speakerId: speakers[0], cadence: "short",
    })).toThrow(/verified/);
    const request: DialogueBlipRequest = { speakerId: speakers[0], cadence: "short" };
    expect(Object.keys(request)).toEqual(["speakerId", "cadence"]);
  });
});
