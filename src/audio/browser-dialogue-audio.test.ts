import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeProceduralDialogueAudioManifest } from
  "../content/runtime-dialogue-audio-manifest";
import {
  DIALOGUE_AUDIO_STORAGE_KEY,
  createBrowserDialogueAudio,
  type DialogueAudioContextPort,
  type DialogueAudioGainPort,
  type DialogueAudioOscillatorPort,
  type DialogueAudioStorage,
} from "./browser-dialogue-audio";

const manifest = readRuntimeProceduralDialogueAudioManifest(generated);
const request = { speakerId: "settlement.npc.supply_trader", cadence: "short" } as const;

class MemoryStorage implements DialogueAudioStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class FakeGain implements DialogueAudioGainPort {
  readonly events: string[] = [];
  disconnected = false;
  readonly gain = {
    cancelScheduledValues: (_time: number) => { this.events.push("cancel"); },
    setValueAtTime: (_value: number, _time: number) => { this.events.push("set"); },
    linearRampToValueAtTime: (_value: number, _time: number) => { this.events.push("ramp"); },
  };
  connect(_destination: unknown): void { this.events.push("connect"); }
  disconnect(): void { this.disconnected = true; }
}

class FakeOscillator implements DialogueAudioOscillatorPort {
  type: OscillatorType = "sine";
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  disconnected = false;
  readonly frequency = { setValueAtTime: (_value: number, _time: number) => undefined };
  connect(_destination: unknown): void {}
  disconnect(): void { this.disconnected = true; }
  start(_time: number): void { this.started = true; }
  stop(_time: number): void { this.stopped = true; }
}

class FakeContext implements DialogueAudioContextPort {
  currentTime = 10;
  state: AudioContextState = "running";
  readonly destination = {};
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  resumeResult: Promise<void> | void = undefined;
  throwAtOscillator = Number.POSITIVE_INFINITY;
  closed = false;
  resume(): Promise<void> | void { return this.resumeResult; }
  createOscillator(): FakeOscillator {
    if (this.oscillators.length >= this.throwAtOscillator) throw new Error("oscillator unavailable");
    const value = new FakeOscillator(); this.oscillators.push(value); return value;
  }
  createGain(): FakeGain { const value = new FakeGain(); this.gains.push(value); return value; }
  close(): Promise<void> | void { this.closed = true; }
}

describe("browser procedural dialogue audio", () => {
  it("plays one bounded plan and persists an explicit mute", () => {
    const context = new FakeContext();
    const storage = new MemoryStorage();
    const audio = createBrowserDialogueAudio({ manifest, createContext: () => context,
      storage, isDocumentVisible: () => true });
    expect(audio.enabled).toBe(true);
    expect(audio.play(request)).toBe(true);
    expect(context.oscillators.length).toBeGreaterThanOrEqual(2);
    expect(context.oscillators.every((oscillator) => oscillator.started && oscillator.stopped)).toBe(true);
    expect(context.gains.every((gain) => gain.events.filter((event) => event === "ramp").length === 2)).toBe(true);
    context.oscillators[0]!.onended?.();
    expect(context.oscillators[0]!.disconnected).toBe(true);
    expect(context.gains[0]!.disconnected).toBe(true);
    audio.setEnabled(false);
    expect(audio.play(request)).toBe(false);
    expect(storage.getItem(DIALOGUE_AUDIO_STORAGE_KEY)).toBe("muted");
  });

  it("fails closed while hidden, unavailable, suspended, or factory-thrown", () => {
    const storage = new MemoryStorage();
    expect(createBrowserDialogueAudio({ manifest, createContext: () => new FakeContext(), storage,
      isDocumentVisible: () => false }).play(request)).toBe(false);
    expect(createBrowserDialogueAudio({ manifest, createContext: () => null, storage,
      isDocumentVisible: () => true }).play(request)).toBe(false);
    expect(createBrowserDialogueAudio({ manifest, createContext: () => { throw new Error("no audio"); },
      storage, isDocumentVisible: () => true }).play(request)).toBe(false);
    const suspended = new FakeContext(); suspended.state = "suspended";
    suspended.resumeResult = Promise.reject(new Error("resume denied"));
    expect(createBrowserDialogueAudio({ manifest, createContext: () => suspended, storage,
      isDocumentVisible: () => true }).play(request)).toBe(false);
  });

  it("does not start a partial sequence when node allocation fails", () => {
    const context = new FakeContext(); context.throwAtOscillator = 1;
    const audio = createBrowserDialogueAudio({ manifest, createContext: () => context,
      storage: new MemoryStorage(), isDocumentVisible: () => true });
    expect(audio.play(request)).toBe(false);
    expect(context.oscillators.every((oscillator) => !oscillator.started)).toBe(true);
    expect(context.oscillators.every((oscillator) => oscillator.disconnected)).toBe(true);
    expect(context.gains.every((gain) => gain.disconnected)).toBe(true);
  });

  it("treats corrupt preferences as muted and closes without throwing", () => {
    const context = new FakeContext();
    const storage = new MemoryStorage(); storage.values.set(DIALOGUE_AUDIO_STORAGE_KEY, "loud");
    const audio = createBrowserDialogueAudio({ manifest, createContext: () => context,
      storage, isDocumentVisible: () => true });
    expect(audio.enabled).toBe(false);
    expect(audio.toggle()).toBe(true);
    expect(storage.getItem(DIALOGUE_AUDIO_STORAGE_KEY)).toBe("enabled");
    expect(audio.play(request)).toBe(true);
    audio.close();
    expect(context.closed).toBe(true);
    expect(audio.play(request)).toBe(false);
  });
});
