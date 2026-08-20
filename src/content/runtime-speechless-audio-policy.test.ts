import { describe, expect, it } from "vitest";
import { readRuntimeSpeechlessAudioPolicy } from "./runtime-speechless-audio-policy";

const EXPECTED_POLICY = Object.freeze({
  spokenPronunciationRequired: false,
  dialogueFeedback: "procedural_nonsemantic",
  progressMayDependOnAudio: false,
  captionsRequired: true,
} as const);

describe("speechless audio policy", () => {
  it("accepts only the exact non-semantic, caption-authoritative policy", () => {
    const policy = readRuntimeSpeechlessAudioPolicy(EXPECTED_POLICY, "test policy");

    expect(policy).toEqual(EXPECTED_POLICY);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(() => readRuntimeSpeechlessAudioPolicy({
      ...EXPECTED_POLICY,
      spokenPronunciationRequired: true,
    }, "test policy")).toThrow(/speechless audio policy/i);
    expect(() => readRuntimeSpeechlessAudioPolicy({
      ...EXPECTED_POLICY,
      pronunciationAssetId: "audio.pronunciation.telo.v1",
    }, "test policy")).toThrow(/unknown or missing/i);
    expect(() => readRuntimeSpeechlessAudioPolicy(null, "test policy")).toThrow(/object/i);
  });
});
