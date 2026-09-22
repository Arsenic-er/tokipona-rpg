import { describe, it, expect, vi } from 'vitest';
import { drawForestEdgeDressing } from './forest-edge-dressing';
describe('rooted woodland background', () => {
  it('keeps partially visible crowns when their root is outside the loaded view and follows world camera coordinates', () => {
    const ctx = { fillRect: vi.fn(), fillStyle: '' } as unknown as CanvasRenderingContext2D;
    const camera = { x: 0, y: 200, width: 320, height: 180, facing: 'right' as const };
    drawForestEdgeDressing(ctx, camera, [350], () => 336);
    const first = vi.mocked(ctx.fillRect).mock.calls.map(c => [...c]);
    expect(first.length).toBeGreaterThan(100);
    expect(first.at(-1)?.[1]).toBe(134);
    vi.mocked(ctx.fillRect).mockClear();
    drawForestEdgeDressing(ctx, { ...camera, x: 1, y: 201 }, [350], () => 336);
    expect(vi.mocked(ctx.fillRect).mock.calls).toEqual(first.map(([x,y,w,h]) => [x! - 1, y! - 1,w,h]));
  });
  it('never invents an anchor without surface data', () => {
    const ctx = { fillRect: vi.fn(), fillStyle: '' } as unknown as CanvasRenderingContext2D;
    drawForestEdgeDressing(ctx, { x: 0, y: 0, width: 640, height: 360, facing: 'right' }, [350], () => null);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
