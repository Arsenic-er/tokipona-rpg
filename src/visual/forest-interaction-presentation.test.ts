import { describe, expect, it, vi } from 'vitest';
import { interactionPresentation, playerBubblePosition, rememberFeedback } from './forest-interaction-presentation';
import { loadLocalWorkerPortrait } from './browser-local-worker-portrait';

describe('interaction presentation boundary', () => {
  const plain = { accepted: true, text: '取木撑' };
  it('uses bubbles only for the explicit simple timber interaction', () => {
    expect(interactionPresentation(plain, 'timber')).toBe('player-bubble');
    expect(interactionPresentation(plain, 'gate')).toBe('panel');
    expect(interactionPresentation(plain, 'medium')).toBe('panel');
  });
  it('keeps decisions, custom actions, NPC speakers and resume signals out of bubbles', () => {
    for (const result of [
      { ...plain, choice: 'work' as const },
      { ...plain, actions: [{ id: 'buy', label: '购买' }] },
      { ...plain, speaker: '工务人' }, { ...plain, resumeWorld: true },
    ]) expect(interactionPresentation(result, 'timber')).toBe('panel');
  });
  it('identifies the worker by target AND speaker; never reuses his portrait for a different voice', () => {
    expect(interactionPresentation({ ...plain, speaker: '工务人' }, 'worker')).toBe('worker-dialogue');
    expect(interactionPresentation({ ...plain, speaker: '隐士' }, 'worker')).toBe('panel');
    expect(interactionPresentation({ ...plain, speaker: '工务人' }, 'hermit')).toBe('panel');
    expect(interactionPresentation({ ...plain, speaker: '工务人', choice: 'work' }, 'worker')).toBe('worker-dialogue');
  });
  it('does not mutate gameplay results', () => {
    const result = Object.freeze({ ...plain, actions: Object.freeze([{ id: 'spend', label: '支付' }]) });
    interactionPresentation(result, 'timber');
    expect(result).toEqual({ ...plain, actions: [{ id: 'spend', label: '支付' }] });
  });
});
describe('world-anchored bubble', () => {
  const viewport = { width: 1280, height: 720 }, size = { width: 300, height: 100 };
  it('projects through the final camera and avoids the character head', () => {
    const result = playerBubblePosition({ x: 100, y: 0, width: 640, height: 360 },
      { x: 250, y: 250, width: 12, height: 14 }, viewport, size);
    expect(result.x).toBe(162);
    expect(result.y + size.height).toBeLessThan(490);
    expect(result.side).toBe('above');
  });
  it('tracks zoom/camera changes instead of using world coordinates as CSS pixels', () => {
    const p = { x: 250, y: 250, width: 12, height: 14 };
    const a = playerBubblePosition({ x: 100, y: 0, width: 640, height: 360 }, p, viewport, size);
    const b = playerBubblePosition({ x: 180, y: 100, width: 320, height: 180 }, p, viewport, size);
    expect(a.x).not.toBe(b.x); expect(a.y).not.toBe(b.y);
  });
  it('keeps bubbles within small landscape viewports and flips below a high character', () => {
    const view = { width: 844, height: 390 }, box = { width: 264, height: 94 };
    for (const x of [0, 200, 630]) {
      const a = playerBubblePosition({ x: 0, y: 0, width: 640, height: 296 },
        { x, y: 85, width: 12, height: 14 }, view, box);
      expect(a.x).toBeGreaterThanOrEqual(12); expect(a.x + box.width).toBeLessThanOrEqual(832);
      expect(a.y).toBeGreaterThanOrEqual(85); expect(a.y + box.height).toBeLessThanOrEqual(312);
      expect(a.side).toBe('below');
    }
  });
  it('suppresses an offscreen anchor', () => {
    expect(playerBubblePosition({ x: 500, y: 0, width: 640, height: 360 },
      { x: 0, y: 0, width: 12, height: 14 }, viewport, size).visible).toBe(false);
  });
  it('deduplicates recent feedback and bounds memory without writing campaign data', () => {
    const original = ['a', 'b']; expect(rememberFeedback(original, 'a')).toEqual(['b', 'a']);
    expect(original).toEqual(['a', 'b']);
    expect(rememberFeedback(['a','b','c','d','e','f'], 'g')).toEqual(['b','c','d','e','f','g']);
  });
});
describe('private portrait candidate boundary', () => {
  it('never requests private art from a public production build', async () => {
    const load = vi.fn();
    expect(await loadLocalWorkerPortrait(false, load)).toBeNull(); expect(load).not.toHaveBeenCalled();
  });
  it('accepts only the expected size and safely tolerates missing/invalid art', async () => {
    const good = { naturalWidth: 1254, naturalHeight: 1254 } as HTMLImageElement;
    expect(await loadLocalWorkerPortrait(true, async () => good)).toBe(good);
    expect(await loadLocalWorkerPortrait(true, async () => ({ ...good, naturalHeight: 12 }))).toBeNull();
    expect(await loadLocalWorkerPortrait(true, async () => { throw new Error('404'); })).toBeNull();
  });
});
