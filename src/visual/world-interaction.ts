import type { PrologueFlowSnapshot } from "../game/prologue-flow";

export type WorldInteractionPhase = "undiscovered" | "discovered" | "activated";

export interface WorldInteractionView {
  readonly visible: boolean;
  readonly actionable: boolean;
  readonly phase: WorldInteractionPhase;
  readonly prompt: "E · 观察 telo" | "E · 调谐 telo" | "E · 显化 telo" | null;
}

export const WORLD_SCALE_TELO_GLYPH_POSITION = Object.freeze({ x: 144, y: 100 });
export const WORLD_SCALE_TELO_GLYPH_RADIUS = 40;

export function projectWorldInteraction(
  snapshot: PrologueFlowSnapshot,
  _engaged = false,
): WorldInteractionView {
  const telo = snapshot.session.learning.words.telo;
  const phase: WorldInteractionPhase = telo?.attunementState === "attuned"
    ? "activated"
    : telo?.discoveryState === "discovered"
      ? "discovered"
      : "undiscovered";
  return Object.freeze({ visible: false, actionable: false, phase, prompt: null });
}
