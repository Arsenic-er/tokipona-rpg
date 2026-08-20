import {
  isVerifiedRuntimeProceduralDialogueAudioManifest,
  type ProceduralDialogueWaveform,
  type RuntimeProceduralDialogueAudioManifest,
} from "../content/runtime-dialogue-audio-manifest";

export interface DialogueBlipRequest {
  readonly speakerId: string;
  readonly cadence: "short" | "long";
}

export interface DialogueBlipNote {
  readonly startMs: number;
  readonly durationMs: number;
  readonly frequencyHz: number;
  readonly gain: number;
  readonly waveform: ProceduralDialogueWaveform;
}

export interface DialogueBlipPlan {
  readonly speakerId: string;
  readonly cadence: DialogueBlipRequest["cadence"];
  readonly notes: readonly DialogueBlipNote[];
  readonly totalDurationMs: number;
}

export function createDialogueBlipPlan(
  manifest: RuntimeProceduralDialogueAudioManifest,
  request: DialogueBlipRequest,
): DialogueBlipPlan {
  if (!isVerifiedRuntimeProceduralDialogueAudioManifest(manifest)) {
    throw new Error("dialogue blip planner requires a verified manifest");
  }
  if (!isRecord(request) || Object.keys(request).length !== 2 ||
      !("speakerId" in request) || !("cadence" in request)) {
    throw new Error("dialogue blip request contains unknown or missing fields");
  }
  if (typeof request.speakerId !== "string" || request.speakerId.length > 128 ||
      !/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(request.speakerId)) {
    throw new Error("dialogue blip speaker identity is invalid");
  }
  if (request.cadence !== "short" && request.cadence !== "long") {
    throw new Error("dialogue blip cadence is invalid");
  }
  const hash = fnv1a32(request.speakerId);
  const countRange = request.cadence === "short"
    ? manifest.cadence.shortNoteCount : manifest.cadence.longNoteCount;
  const noteCount = countRange[0] + bounded(hash, countRange[1] - countRange[0] + 1);
  const [minimumFrequency, maximumFrequency] = manifest.synthesis.frequencyRangeHz;
  const frequencySpan = maximumFrequency - minimumFrequency + 1;
  const notes = Object.freeze(Array.from({ length: noteCount }, (_, index) => {
    const mixed = mix32(hash, index + 1);
    return Object.freeze({
      startMs: index * (manifest.cadence.noteDurationMs + manifest.cadence.gapMs),
      durationMs: manifest.cadence.noteDurationMs,
      frequencyHz: minimumFrequency + bounded(mixed, frequencySpan),
      gain: manifest.synthesis.maximumGain,
      waveform: manifest.synthesis.waveforms[(hash + index) % manifest.synthesis.waveforms.length]!,
    });
  }));
  const totalDurationMs = notes.length === 0 ? 0 :
    notes.at(-1)!.startMs + notes.at(-1)!.durationMs;
  if (totalDurationMs > manifest.cadence.maximumSequenceMs) {
    throw new Error("dialogue blip plan exceeds the authored duration bound");
  }
  return Object.freeze({ speakerId: request.speakerId, cadence: request.cadence, notes,
    totalDurationMs });
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mix32(seed: number, ordinal: number): number {
  let value = (seed + Math.imul(ordinal, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function bounded(value: number, exclusiveMaximum: number): number {
  return value % exclusiveMaximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
