import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import {
  computeRuntimeProceduralDialogueAudioDigest,
  isVerifiedRuntimeProceduralDialogueAudioManifest,
  readRuntimeProceduralDialogueAudioManifest,
} from "./runtime-dialogue-audio-manifest";

function resign(candidate: any): any {
  const payload = Object.fromEntries(Object.entries(candidate.proceduralDialogueAudio)
    .filter(([key]) => key !== "sourceDigest"));
  candidate.proceduralDialogueAudio.sourceDigest =
    computeRuntimeProceduralDialogueAudioDigest(payload);
  return candidate;
}

describe("runtime procedural dialogue audio manifest", () => {
  it("verifies exact nonsemantic bounded synthesis parameters", () => {
    const value = readRuntimeProceduralDialogueAudioManifest(generated);
    expect(isVerifiedRuntimeProceduralDialogueAudioManifest(value)).toBe(true);
    expect(value).toMatchObject({
      semanticContent: "none",
      externalAssetRequired: false,
      progressMayDependOnAudio: false,
      captionsRequired: true,
      explicitInteractionOnly: true,
      cadence: { shortNoteCount: [2, 3], longNoteCount: [4, 6], noteDurationMs: 32,
        gapMs: 46, maximumSequenceMs: 600 },
      synthesis: { frequencyRangeHz: [180, 520], maximumGain: 0.03,
        waveforms: ["square", "triangle"], attackMs: 4, releaseMs: 8 },
    });
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("rejects checksum drift and re-signed unsafe or semantic fields", () => {
    const checksum = structuredClone(generated) as any;
    checksum.proceduralDialogueAudio.synthesis.maximumGain = 1;
    expect(() => readRuntimeProceduralDialogueAudioManifest(checksum)).toThrow(/digest/);
    for (const mutate of [
      (root: any) => { root.externalAssetRequired = true; },
      (root: any) => { root.synthesis.maximumGain = 1; },
      (root: any) => { root.synthesis.waveforms = ["sine"]; },
      (root: any) => { root.sourceUrl = "https://audio.example.invalid/dialogue.ogg"; },
      (root: any) => { root.text = "toki"; },
    ]) {
      const candidate = structuredClone(generated) as any;
      mutate(candidate.proceduralDialogueAudio);
      expect(() => readRuntimeProceduralDialogueAudioManifest(resign(candidate))).toThrow();
    }
    expect(isVerifiedRuntimeProceduralDialogueAudioManifest(
      structuredClone(readRuntimeProceduralDialogueAudioManifest(generated)))).toBe(false);
  });
});
