import { describe, it, expect } from 'vitest';
import generated from '../generated/content-runtime.v0.1.json';
import { readRuntimeForestSpatialManifest } from '../content/runtime-forest-spatial-manifest';
import { generateForestRegion } from './forest-region-generator';
import { ForestChunkStream, FOREST_MATERIAL as M } from './forest-chunk-stream';
import { ForestGrayboxRuntime } from './forest-graybox-runtime';
import { woodlandMeadowY, woodlandSoilDepth, woodlandOpeningSoilDepth } from './forest-surface-profile';
const manifest = readRuntimeForestSpatialManifest(generated);
const options = { manifest, region: generateForestRegion(manifest, 'woodland.surface.qa'), openingSurface: true };
const updated = { ...options, surfaceProfile: 'woodland-v2' as const };

describe('versioned woodland surface', () => {
  it('smooths the approach without changing any creek/quest-band material bytes', () => {
    const old = new ForestChunkStream(manifest, options.region, options), fresh = new ForestChunkStream(manifest, options.region, updated);
    let changed = 0;
    for (let x = 300; x < 1712; x++) {
      const y = fresh.openingSurfaceY(x)!;
      if (y !== old.openingSurfaceY(x)) changed++;
      expect(Math.abs(y - fresh.openingSurfaceY(x - 1)!)).toBeLessThanOrEqual(2);
      expect(fresh.materialAt(x, y - 1)).toBe(M.air);
      expect(fresh.materialAt(x, y)).toBe(M.soil);
      expect(fresh.materialAt(x, y + woodlandSoilDepth(x) + 1)).not.toBe(M.air);
    }
    expect(changed).toBeGreaterThan(800);
    for (let x = 1712; x < 2496; x += 3) for (let y = 590; y < 850; y += 3) expect(fresh.materialAt(x,y)).toBe(old.materialAt(x,y));
    const chunks = fresh.visible({ x: 490, y: 450, width: 64, height: 160 });
    for (const c of chunks) expect(c.surfaceY?.[0]).toBe(fresh.openingSurfaceY(c.chunkX * 16));
  });
  it('walks from arrival to the creek and back without jumping or intersecting terrain', () => {
    const runtime = new ForestGrayboxRuntime(updated);
    runtime.advanceTicks(120);
    expect(runtime.playerSnapshot().grounded).toBe(true);
    for (let i = 0; i < 850; i++) {
      runtime.advanceTicks(1, { moveX: 1 });
      const p = runtime.playerSnapshot();
      expect(runtime.chunkStream.isSolid({ ...p.position, ...p.body })).toBe(false);
    }
    expect(runtime.playerSnapshot().position.x).toBeGreaterThan(1690);
    runtime.advanceTicks(830, { moveX: -1 });
    expect(runtime.playerSnapshot().position.x).toBeLessThan(560);
  });
  it('preserves old save geometry and round-trips both profiles without teleporting', () => {
    for (const config of [options, updated]) {
      const runtime = new ForestGrayboxRuntime(config); runtime.advanceTicks(120); runtime.advanceTicks(230, { moveX: 1 });
      const save = runtime.save(), restored = ForestGrayboxRuntime.fromSave(updated, save);
      expect(restored.save()).toEqual(save);
      expect(restored.chunkStream.openingSurfaceY(900)).toBe(runtime.chunkStream.openingSurfaceY(900));
      restored.advanceTicks(25, { moveX: 1 }); runtime.advanceTicks(25, { moveX: 1 });
      expect(restored.snapshot()).toEqual(runtime.snapshot());
    }
    const save = new ForestGrayboxRuntime(updated).save();
    expect(() => ForestGrayboxRuntime.fromSave(updated, { ...save, surfaceProfile: 'future' } as never)).toThrow(/profile/);
  });
  it('gives the meadow gentle approaches, a swale and level foundations', () => {
    for (let x = 1; x < 1024; x++) expect(Math.abs(woodlandMeadowY(x) - woodlandMeadowY(x-1))).toBeLessThanOrEqual(1);
    for (const [left,right] of [[235,370],[600,764]]) for (let x=left!;x<=right!;x++) expect(woodlandMeadowY(x)).toBe(336);
    expect(woodlandMeadowY(530)).toBe(350); expect(woodlandMeadowY(0)).toBeLessThan(woodlandMeadowY(1024));
  });
  it('tapers the soil into the preserved creek bank without a straight material seam', () => {
    for (let x = 1520; x <= 1712; x++) expect(Math.abs(woodlandOpeningSoilDepth(x) - woodlandOpeningSoilDepth(x-1))).toBeLessThanOrEqual(1);
    expect(woodlandOpeningSoilDepth(1711)).toBe(9); expect(woodlandOpeningSoilDepth(1712)).toBe(9);
    expect(woodlandOpeningSoilDepth(1200)).toBe(woodlandSoilDepth(1200));
  });
});
