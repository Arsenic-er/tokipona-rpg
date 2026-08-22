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
  engaged = false,
): WorldInteractionView {
  const telo = snapshot.session.learning.words.telo;
  const phase: WorldInteractionPhase = telo?.attunementState === "attuned"
    ? "activated"
    : telo?.discoveryState === "discovered"
      ? "discovered"
      : "undiscovered";
  const runtime = snapshot.runtime;
  const centerX = runtime.player.position.x + runtime.player.body.width / 2;
  const centerY = runtime.player.position.y + runtime.player.body.height / 2;
  const inRange = runtime.sceneId === "scene.valley.stream_section" && (
    engaged || Math.hypot(
      centerX - WORLD_SCALE_TELO_GLYPH_POSITION.x,
      centerY - WORLD_SCALE_TELO_GLYPH_POSITION.y,
    ) <= WORLD_SCALE_TELO_GLYPH_RADIUS
  );
  if (!inRange) return Object.freeze({ visible: false, actionable: false, phase, prompt: null });
  return Object.freeze({
    visible: true,
    actionable: true,
    phase,
    prompt: phase === "undiscovered"
      ? "E · 观察 telo"
      : phase === "discovered"
        ? "E · 调谐 telo"
        : "E · 显化 telo",
  });
}
