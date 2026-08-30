import type {
  RuntimeForestOpeningAssetExport,
  RuntimeForestOpeningAssetRole,
} from "../assets/runtime-forest-opening-assets";
import type { ForestOpeningAudioPort, ForestOpeningAudioRole } from "./browser-forest-opening-audio";

const AUDIO_ROLES = Object.freeze([
  "forest_ambience", "stream_ambience", "foley_bank", "dialogue_blip_bank",
] as const satisfies readonly ForestOpeningAudioRole[]);

export interface ForestOpeningAudioBufferSourcePort {
  buffer: unknown;
  loop: boolean;
  connect(destination: unknown): void;
  start(when?: number, offset?: number, duration?: number): void;
}

export interface ForestOpeningAudioGainPort {
  readonly gain: { value: number };
  connect(destination: unknown): void;
}

export interface ForestOpeningAudioContextPort {
  readonly destination: unknown;
  createBufferSource(): ForestOpeningAudioBufferSourcePort;
  createGain(): ForestOpeningAudioGainPort;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  resume(): Promise<void> | void;
  suspend(): Promise<void> | void;
}

export interface WebAudioForestOpeningPort extends ForestOpeningAudioPort {
  ready(): Promise<void>;
}

export function createWebAudioForestOpeningPort(options: Readonly<{
  assets: RuntimeForestOpeningAssetExport;
  createContext: () => ForestOpeningAudioContextPort;
  fetchBytes: (publicPath: string) => Promise<ArrayBuffer>;
}>): WebAudioForestOpeningPort {
  let context: ForestOpeningAudioContextPort | null = null;
  let loading: Promise<void> | null = null;
  let failed = options.assets.status !== "approved";
  const buffers = new Map<ForestOpeningAudioRole, unknown>();
  const loops = new Map<"forest_ambience" | "stream_ambience", ForestOpeningAudioGainPort>();
  const desiredLoopGain = new Map<"forest_ambience" | "stream_ambience", number>([
    ["forest_ambience", 0], ["stream_ambience", 0],
  ]);
  let cues: ReadonlyMap<string, Readonly<{ role: "foley_bank" | "dialogue_blip_bank";
    offsetSeconds: number; durationSeconds: number }>> = new Map();

  const start = async (): Promise<void> => {
    if (failed || options.assets.status !== "approved") return;
    try {
      context ??= options.createContext();
      await context.resume();
      const manifestFile = fileFor(options.assets.files, "audio_manifest");
      if (manifestFile === null) throw new Error("forest opening audio manifest is missing");
      cues = readAudioManifest(await options.fetchBytes(manifestFile.publicPath));
      const decoded = await Promise.all(AUDIO_ROLES.map(async (role) => {
        const file = options.assets.status === "approved" ? fileFor(options.assets.files, role) : null;
        if (file === null) throw new Error("forest opening approved audio role is missing");
        return [role, await context!.decodeAudioData(await options.fetchBytes(file.publicPath))] as const;
      }));
      for (const [role, buffer] of decoded) buffers.set(role, buffer);
      for (const role of ["forest_ambience", "stream_ambience"] as const) {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffers.get(role) ?? null;
        source.loop = true;
        source.connect(gain);
        gain.connect(context.destination);
        gain.gain.value = desiredLoopGain.get(role) ?? 0;
        source.start();
        loops.set(role, gain);
      }
    } catch {
      failed = true;
      buffers.clear();
      loops.clear();
    }
  };

  const port: WebAudioForestOpeningPort = {
    setLoopGain(role: "forest_ambience" | "stream_ambience", gain: number): void {
      if (!Number.isFinite(gain)) return;
      const normalized = Math.max(0, Math.min(1, gain));
      desiredLoopGain.set(role, normalized);
      const node = loops.get(role);
      if (node) node.gain.value = normalized;
    },
    playOneShot(role: "foley_bank" | "dialogue_blip_bank", _variant: string, gain: number): void {
      if (failed || context === null || !Number.isFinite(gain)) return;
      const buffer = buffers.get(role);
      const cue = cues.get(_variant);
      if (buffer === undefined || cue?.role !== role) return;
      try {
        const source = context.createBufferSource();
        const gainNode = context.createGain();
        source.buffer = buffer;
        source.loop = false;
        gainNode.gain.value = Math.max(0, Math.min(1, gain));
        source.connect(gainNode);
        gainNode.connect(context.destination);
        source.start(0, cue.offsetSeconds, cue.durationSeconds);
      } catch { /* optional audio remains silent */ }
    },
    suspend(): void {
      if (context === null) return;
      try { void Promise.resolve(context.suspend()).catch(() => undefined); }
      catch { /* optional audio remains silent */ }
    },
    resume(): void {
      loading ??= start();
      if (context !== null) {
        try { void Promise.resolve(context.resume()).catch(() => undefined); }
        catch { /* a later gesture may try again */ }
      }
    },
    ready(): Promise<void> { return loading ?? Promise.resolve(); },
  };
  return Object.freeze(port);
}

export function createBrowserWebAudioForestOpeningPort(
  assets: RuntimeForestOpeningAssetExport,
): WebAudioForestOpeningPort {
  return createWebAudioForestOpeningPort({
    assets,
    createContext: () => {
      const AudioContextConstructor = window.AudioContext;
      return new AudioContextConstructor() as unknown as ForestOpeningAudioContextPort;
    },
    fetchBytes: async (publicPath) => {
      const response = await fetch(new URL(publicPath, document.baseURI));
      if (!response.ok) throw new Error("forest opening audio asset request failed");
      return response.arrayBuffer();
    },
  });
}

function fileFor(
  files: readonly Readonly<{ role: RuntimeForestOpeningAssetRole; publicPath: string }>[],
  role: RuntimeForestOpeningAssetRole,
): Readonly<{ publicPath: string }> | null {
  return files.find((file) => file.role === role) ?? null;
}

function readAudioManifest(bytes: ArrayBuffer): ReadonlyMap<string, Readonly<{
  role: "foley_bank" | "dialogue_blip_bank"; offsetSeconds: number; durationSeconds: number;
}>> {
  let candidate: unknown;
  try { candidate = JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { throw new Error("forest opening audio manifest JSON is invalid"); }
  const root = record(candidate);
  if (root.schema_version !== "tokipona.forest-opening-audio.v0.2" ||
      Object.keys(root).length !== 2 || !Object.hasOwn(root, "cues")) {
    throw new Error("forest opening audio manifest identity is invalid");
  }
  const rawCues = record(root.cues);
  const expected = ["footstep_soil", "footstep_mud", "footstep_stone", "footstep_deadwood",
    "object_collision", "water_entry", "neutral_blip"] as const;
  if (Object.keys(rawCues).length !== expected.length || expected.some((key) => !Object.hasOwn(rawCues, key))) {
    throw new Error("forest opening audio cue set is invalid");
  }
  const result = new Map<string, Readonly<{ role: "foley_bank" | "dialogue_blip_bank";
    offsetSeconds: number; durationSeconds: number }>>();
  for (const key of expected) {
    const cue = record(rawCues[key]);
    const expectedRole = key === "neutral_blip" ? "dialogue_blip_bank" as const : "foley_bank" as const;
    if (Object.keys(cue).length !== 3 || !Object.hasOwn(cue, "role") ||
        !Object.hasOwn(cue, "offset_seconds") || !Object.hasOwn(cue, "duration_seconds") ||
        cue.role !== expectedRole ||
        !Number.isFinite(cue.offset_seconds) || (cue.offset_seconds as number) < 0 ||
        !Number.isFinite(cue.duration_seconds) || (cue.duration_seconds as number) <= 0) {
      throw new Error("forest opening audio cue is invalid");
    }
    result.set(key, Object.freeze({ role: expectedRole,
      offsetSeconds: cue.offset_seconds as number, durationSeconds: cue.duration_seconds as number }));
  }
  return result;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("forest opening audio manifest field is invalid");
  }
  return value as Record<string, unknown>;
}
