import type { EpisodeResult, EpisodeTarget } from '../game/forest-episode';

export type InteractionPresentation = 'worker-dialogue' | 'player-bubble' | 'panel';

/** Presentation only. Choices, costs and progression stay owned by ForestEpisode. */
export function interactionPresentation(result: EpisodeResult, target: EpisodeTarget): InteractionPresentation {
  if (target === 'worker' && result.speaker === '工务人') return 'worker-dialogue';
  // Only simple tools, pickups and rest. Spell previews and decisions stay modal.
  const simpleTargets: readonly EpisodeTarget[] = ['timber', 'brace', 'silt', 'gate', 'medium', 'plug', 'rest'];
  if (simpleTargets.includes(target) && !result.speaker && !result.choice && !result.actions?.length && !result.resumeWorld) return 'player-bubble';
  return 'panel';
}

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
type Size = Readonly<{ width: number; height: number }>;

/** Use the SAME final viewport as the renderer, including zoom and mouse look. */
export function playerBubblePosition(camera: Rect, player: Rect, viewport: Size, bubble: Size) {
  const scaleX = viewport.width / camera.width, scaleY = viewport.height / camera.height;
  const headX = (player.x + player.width / 2 - camera.x) * scaleX;
  const headY = (player.y + player.height - 19 - camera.y) * scaleY;
  const feetY = (player.y + player.height - camera.y) * scaleY;
  const margin = 12, topSafe = Math.min(88, viewport.height * .22);
  const bottomSafe = viewport.height < 500 ? 78 : 38;
  const above = headY - bubble.height - 14;
  const side = above >= topSafe ? 'above' : 'below';
  const x = Math.max(margin, Math.min(viewport.width - bubble.width - margin, headX - bubble.width / 2));
  const desiredY = side === 'above' ? above : feetY + 14;
  const y = Math.max(topSafe, Math.min(viewport.height - bubble.height - bottomSafe, desiredY));
  return {
    x: Math.round(x), y: Math.round(y), side,
    tailX: Math.round(Math.max(16, Math.min(bubble.width - 16, headX - x))),
    visible: headX >= 0 && headX <= viewport.width && feetY >= 0 && headY <= viewport.height,
  };
}

/** Bounded UI-only history; no telemetry and no change to the campaign save schema. */
export function rememberFeedback(history: readonly string[], text: string): string[] {
  return [...history.filter(entry => entry !== text), text].slice(-6);
}
