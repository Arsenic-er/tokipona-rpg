import type { ContentManifest, ContentObject, ContentValue } from "../../src/content/types";
import {
  computeRuntimeProceduralDialogueAudioDigest,
  type RuntimeProceduralDialogueAudioManifest,
} from "../../src/content/runtime-dialogue-audio-manifest.ts";

export function projectProceduralDialogueAudio(
  manifest: ContentManifest,
): RuntimeProceduralDialogueAudioManifest {
  const sources = manifest.byKind.dialogue_audio;
  if (sources.length !== 1) {
    throw new Error(`Expected exactly one procedural dialogue audio source, received ${sources.length}`);
  }
  const source = sources[0]!;
  const root = source.content;
  const cadence = object(root.cadence, "procedural dialogue cadence");
  const synthesis = object(root.synthesis, "procedural dialogue synthesis");
  const body = {
    sourcePath: exact(source.path, "data/audio/procedural-dialogue.v0.1.yaml", "source path"),
    semanticContent: exact(root.semantic_content, "none", "semantic content"),
    externalAssetRequired: exact(root.external_asset_required, false, "external asset requirement"),
    progressMayDependOnAudio: exact(root.progress_may_depend_on_audio, false, "progress audio dependency"),
    captionsRequired: exact(root.captions_required, true, "caption requirement"),
    explicitInteractionOnly: exact(root.explicit_interaction_only, true, "interaction requirement"),
    cadence: {
      shortNoteCount: tuple(cadence.short_note_count, [2, 3], "short note count") as readonly [2, 3],
      longNoteCount: tuple(cadence.long_note_count, [4, 6], "long note count") as readonly [4, 6],
      noteDurationMs: exact(cadence.note_duration_ms, 32, "note duration"),
      gapMs: exact(cadence.gap_ms, 46, "note gap"),
      maximumSequenceMs: exact(cadence.maximum_sequence_ms, 600, "sequence duration"),
    },
    synthesis: {
      frequencyRangeHz: tuple(synthesis.frequency_range_hz, [180, 520], "frequency range") as readonly [180, 520],
      maximumGain: exact(synthesis.maximum_gain, 0.03, "maximum gain"),
      waveforms: tuple(synthesis.waveforms, ["square", "triangle"], "waveforms") as readonly ["square", "triangle"],
      attackMs: exact(synthesis.attack_ms, 4, "attack duration"),
      releaseMs: exact(synthesis.release_ms, 8, "release duration"),
    },
  } as const;
  return {
    sourceDigest: computeRuntimeProceduralDialogueAudioDigest(body),
    ...body,
  };
}

function object(value: ContentValue | undefined, label: string): ContentObject {
  if (!isContentObject(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function isContentObject(value: ContentValue | undefined): value is ContentObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact<T extends ContentValue>(value: ContentValue | undefined, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must equal ${String(expected)}`);
  return expected;
}
function tuple<T extends readonly (number | string)[]>(
  value: ContentValue | undefined,
  expected: T,
  label: string,
): T {
  if (!Array.isArray(value) || value.length !== expected.length ||
      !value.every((entry, index) => entry === expected[index])) {
    throw new Error(`${label} is noncanonical`);
  }
  return expected;
}
