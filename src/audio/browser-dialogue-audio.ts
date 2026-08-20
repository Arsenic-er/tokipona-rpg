import type { RuntimeProceduralDialogueAudioManifest } from
  "../content/runtime-dialogue-audio-manifest";
import { createDialogueBlipPlan, type DialogueBlipRequest } from
  "./procedural-dialogue-blip";

export const DIALOGUE_AUDIO_STORAGE_KEY = "tokipona.rpg.dialogue-audio.v0.1" as const;

export interface DialogueAudioStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DialogueAudioParamPort {
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

export interface DialogueAudioOscillatorPort {
  type: OscillatorType;
  readonly frequency: Readonly<{ setValueAtTime(value: number, time: number): void }>;
  onended: (() => void) | null;
  connect(destination: unknown): void;
  disconnect(): void;
  start(time: number): void;
  stop(time: number): void;
}

export interface DialogueAudioGainPort {
  readonly gain: DialogueAudioParamPort;
  connect(destination: unknown): void;
  disconnect(): void;
}

export interface DialogueAudioContextPort {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: unknown;
  resume(): Promise<void> | void;
  createOscillator(): DialogueAudioOscillatorPort;
  createGain(): DialogueAudioGainPort;
  close(): Promise<void> | void;
}

export interface BrowserDialogueAudio {
  readonly enabled: boolean;
  setEnabled(value: boolean): void;
  toggle(): boolean;
  play(request: DialogueBlipRequest): boolean;
  close(): void;
}

export function createBrowserDialogueAudio(options: Readonly<{
  manifest: RuntimeProceduralDialogueAudioManifest;
  createContext: () => DialogueAudioContextPort | null;
  storage: DialogueAudioStorage;
  isDocumentVisible: () => boolean;
}>): BrowserDialogueAudio {
  let enabled = readEnabled(options.storage);
  let context: DialogueAudioContextPort | null = null;
  let closed = false;
  const active = new Set<Readonly<{ oscillator: DialogueAudioOscillatorPort;
    gain: DialogueAudioGainPort }>>();

  const release = (entry: Readonly<{ oscillator: DialogueAudioOscillatorPort;
    gain: DialogueAudioGainPort }>): void => {
    active.delete(entry);
    try { entry.oscillator.disconnect(); } catch { /* optional audio stays fail-closed */ }
    try { entry.gain.disconnect(); } catch { /* optional audio stays fail-closed */ }
  };

  const controller: BrowserDialogueAudio = {
    get enabled(): boolean { return enabled; },
    setEnabled(value: boolean): void {
      enabled = value;
      try { options.storage.setItem(DIALOGUE_AUDIO_STORAGE_KEY, value ? "enabled" : "muted"); }
      catch { /* a storage failure must not affect gameplay */ }
    },
    toggle(): boolean {
      controller.setEnabled(!enabled);
      return enabled;
    },
    play(request: DialogueBlipRequest): boolean {
      if (closed || !enabled) return false;
      try {
        if (!options.isDocumentVisible()) return false;
        context ??= options.createContext();
        if (context === null || context.state === "closed") return false;
        if (context.state !== "running") {
          try {
            const resumed = context.resume();
            if (resumed && typeof resumed.then === "function") void resumed.catch(() => undefined);
          } catch { /* the caller may try again after a later explicit interaction */ }
          return false;
        }
        const plan = createDialogueBlipPlan(options.manifest, request);
        const allocated: Array<{ oscillator: DialogueAudioOscillatorPort;
          gain: DialogueAudioGainPort }> = [];
        try {
          for (let index = 0; index < plan.notes.length; index += 1) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            allocated.push({ oscillator, gain });
          }
        } catch {
          for (const entry of allocated) release(entry);
          return false;
        }
        const baseTime = context.currentTime;
        for (let index = 0; index < allocated.length; index += 1) {
          const entry = allocated[index]!;
          const note = plan.notes[index]!;
          const start = baseTime + note.startMs / 1_000;
          const end = start + note.durationMs / 1_000;
          const attackEnd = Math.min(end, start + options.manifest.synthesis.attackMs / 1_000);
          entry.oscillator.type = note.waveform;
          entry.oscillator.frequency.setValueAtTime(note.frequencyHz, start);
          entry.gain.gain.cancelScheduledValues(start);
          entry.gain.gain.setValueAtTime(0, start);
          entry.gain.gain.linearRampToValueAtTime(note.gain, attackEnd);
          entry.gain.gain.linearRampToValueAtTime(0, end);
          const activeEntry = Object.freeze(entry);
          active.add(activeEntry);
          entry.oscillator.onended = () => release(activeEntry);
          entry.oscillator.start(start);
          entry.oscillator.stop(end);
        }
        return true;
      } catch {
        return false;
      }
    },
    close(): void {
      if (closed) return;
      closed = true;
      for (const entry of [...active]) release(entry);
      if (context !== null) {
        try {
          const result = context.close();
          if (result && typeof result.then === "function") void result.catch(() => undefined);
        } catch { /* optional audio close must not affect gameplay */ }
      }
      context = null;
    },
  };
  return Object.freeze(controller);
}

function readEnabled(storage: DialogueAudioStorage): boolean {
  try {
    const value = storage.getItem(DIALOGUE_AUDIO_STORAGE_KEY);
    if (value === null || value === "enabled") return true;
    if (value === "muted") return false;
    return false;
  } catch {
    return false;
  }
}
