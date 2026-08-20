import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../../src/generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "../../src/content/compiler";
import type { ContentSource } from "../../src/content/types";
import { projectProceduralDialogueAudio } from "./dialogue-audio-runtime-artifact";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({
  path: path.replace(/^\.\.\/\.\.\//, ""),
  data: path.endsWith(".json") ? JSON.parse(text) : parse(text),
}));
const audio = (all: ContentSource[]): Record<string, unknown> => all.find((source) =>
  source.path.endsWith("procedural-dialogue.v0.1.yaml"))!.data as Record<string, unknown>;

describe("procedural dialogue audio projector", () => {
  it("matches the checked-in strict generated projection", () => {
    expect(projectProceduralDialogueAudio(compileContent(sources())))
      .toEqual((generated as any).proceduralDialogueAudio);
  });

  it("fails content compilation for semantic, gain, waveform, URL, and extra-text drift", () => {
    for (const mutate of [
      (root: any) => { root.external_asset_required = true; },
      (root: any) => { root.synthesis.maximum_gain = 1; },
      (root: any) => { root.synthesis.waveforms = ["sine"]; },
      (root: any) => { root.source_url = "https://audio.example.invalid/dialogue.ogg"; },
      (root: any) => { root.text = "toki"; },
    ]) {
      const all = sources();
      mutate(audio(all));
      expect(() => compileContent(all)).toThrow(ContentValidationError);
      try { compileContent(all); } catch (error) {
        expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "contract.procedural_dialogue_audio" }),
        ]));
      }
    }
  });
});
