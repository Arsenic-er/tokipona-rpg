import type { RuntimeForestOpeningAssetExport } from "../assets/runtime-forest-opening-assets";
import type { Vec2 } from "../runtime/geometry";

export type ForestOpeningAudioRole =
  | "forest_ambience"
  | "stream_ambience"
  | "foley_bank"
  | "dialogue_blip_bank";

export type ForestOpeningAudioEvent =
  | Readonly<{ kind: "footstep"; surface: "soil" | "mud" | "stone" | "deadwood"; position: Vec2 }>
  | Readonly<{ kind: "object_collision" | "water_entry" | "dialogue_blip"; position: Vec2 }>;

export interface ForestOpeningAudioFrameInput {
  readonly districtId: string;
  readonly listener: Vec2;
  readonly streamPosition: Vec2;
  readonly muted: boolean;
  readonly suspended: boolean;
  readonly events?: readonly ForestOpeningAudioEvent[];
}

export interface ForestOpeningAudioFrame {
  readonly loops: Readonly<{ forest_ambience: number; stream_ambience: number }>;
  readonly oneShots: readonly Readonly<{ role: "foley_bank" | "dialogue_blip_bank"; variant: string; gain: number }>[];
}

export interface ForestOpeningMovementAudioInput {
  readonly tick: number;
  readonly grounded: boolean;
  readonly velocityX: number;
  readonly districtId: string;
  readonly solutionId: "stone_steps" | "deadwood_bridge" | "shallow_detour" | null;
  readonly position: Vec2;
}

export interface ForestOpeningAudioPort {
  setLoopGain(role: "forest_ambience" | "stream_ambience", gain: number): void;
  playOneShot(role: "foley_bank" | "dialogue_blip_bank", variant: string, gain: number): void;
  suspend(): void;
  resume(): void;
}

export function mixForestOpeningAudioFrame(input: ForestOpeningAudioFrameInput): ForestOpeningAudioFrame {
  if (input.muted || input.suspended) {
    return Object.freeze({ loops: Object.freeze({ forest_ambience: 0, stream_ambience: 0 }), oneShots: Object.freeze([]) });
  }
  const streamDistance = Math.hypot(input.listener.x - input.streamPosition.x, input.listener.y - input.streamPosition.y);
  const streamNear = Math.max(0, 1 - streamDistance / 720);
  const streamDistrict = input.districtId === "forest.stream" ? 0.52 : input.districtId === "forest.settlement" ? 0.22 : 0.04;
  const streamGain = clamp(streamDistrict + streamNear * 0.48);
  const forestGain = clamp((input.districtId === "forest.arrival" ? 0.78 : 0.45) * (1 - streamGain * 0.38));
  const oneShots = (input.events ?? []).map((event) => {
    const gain = clamp(1 - Math.hypot(input.listener.x - event.position.x, input.listener.y - event.position.y) / 480);
    if (event.kind === "dialogue_blip") return Object.freeze({ role: "dialogue_blip_bank" as const, variant: "neutral_blip", gain });
    const variant = event.kind === "footstep" ? `footstep_${event.surface}` : event.kind;
    return Object.freeze({ role: "foley_bank" as const, variant, gain });
  }).filter(({ gain }) => gain > 0);
  return Object.freeze({
    loops: Object.freeze({ forest_ambience: roundGain(forestGain), stream_ambience: roundGain(streamGain) }),
    oneShots: Object.freeze(oneShots),
  });
}

export function projectForestOpeningMovementAudioEvents(
  input: ForestOpeningMovementAudioInput,
): readonly ForestOpeningAudioEvent[] {
  if (!Number.isSafeInteger(input.tick) || input.tick < 0 || !Number.isFinite(input.velocityX) ||
      !input.grounded || Math.abs(input.velocityX) < 0.1 || input.tick % 12 !== 0) return Object.freeze([]);
  const surface = input.districtId !== "forest.stream" ? "soil"
    : input.solutionId === "stone_steps" ? "stone"
      : input.solutionId === "deadwood_bridge" ? "deadwood"
        : input.solutionId === "shallow_detour" ? "mud" : "soil";
  return Object.freeze([Object.freeze({ kind: "footstep" as const, surface, position: Object.freeze({ ...input.position }) })]);
}

export class BrowserForestOpeningAudio {
  private readonly assets: RuntimeForestOpeningAssetExport;
  private readonly port: ForestOpeningAudioPort;
  private active = false;

  public constructor(assets: RuntimeForestOpeningAssetExport, port: ForestOpeningAudioPort) {
    this.assets = assets;
    this.port = port;
  }

  public activate(): Readonly<{ ok: true } | { ok: false; reason: "asset_pack_missing" }> {
    if (this.assets.status !== "approved") return Object.freeze({ ok: false, reason: "asset_pack_missing" as const });
    this.active = true;
    this.port.resume();
    this.port.setLoopGain("forest_ambience", 0);
    this.port.setLoopGain("stream_ambience", 0);
    return Object.freeze({ ok: true as const });
  }

  public apply(frame: ForestOpeningAudioFrame): void {
    if (!this.active) return;
    this.port.setLoopGain("forest_ambience", frame.loops.forest_ambience);
    this.port.setLoopGain("stream_ambience", frame.loops.stream_ambience);
    for (const sound of frame.oneShots) this.port.playOneShot(sound.role, sound.variant, sound.gain);
  }

  public suspend(): void {
    if (!this.active) return;
    this.port.suspend();
  }

  public resume(): void {
    if (!this.active) return;
    this.port.resume();
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundGain(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
