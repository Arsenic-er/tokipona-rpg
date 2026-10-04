import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const OPENING = 'tokipona.forest-opening.vertical-slice.v0.1';
const EPISODE = 'tokipona.forest-waterwheel-episode.v0.1';

test('woodland surface: walk the slope, save, reload without changing height or profile', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.clock.install({ time: 0 }); await page.goto('/chapter-one.html');
  await expect(page.getByRole('button', { name: '旅途笔记（J）' })).toBeEnabled();
  await page.clock.pauseAt(60000);
  const read = () => page.evaluate(key => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem(key)!); }, OPENING);
  const start = await read(); expect(start.spatial.spatial.surfaceProfile).toBe('woodland-v2');
  await page.screenshot({ path: info.outputPath('woodland-arrival.png') });
  await page.locator('canvas[data-surface="game"]').focus(); await page.keyboard.down('d');
  for (let i = 0; i < 90; i++) await page.clock.fastForward(100);
  await page.keyboard.up('d'); for (let i = 0; i < 10; i++) await page.clock.fastForward(100);
  const walked = await read(); expect(walked.spatial.spatial.player.x).toBeGreaterThan(1200);
  expect(walked.spatial.spatial.player.grounded).toBe(true);
  await page.screenshot({ path: info.outputPath('woodland-slope.png') });
  await page.reload(); await expect(page.getByRole('button', { name: '旅途笔记（J）' })).toBeEnabled();
  expect((await read()).spatial.spatial).toEqual(walked.spatial.spatial);
});

test('meadow surface: grounded buildings, walkable swale and map read the saved collision profile', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.clock.install({ time: 0 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: OPENING, value: readFileSync(resolve('.codex-tmp/forest-episode/opening.json'), 'utf8') });
  await page.goto('/chapter-one.html'); await page.getByRole('button', { name: '进入聚落 · 水轮与碎片' }).click();
  await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  await page.clock.pauseAt(60000);
  await page.screenshot({ path: info.outputPath('meadow-west.png') });
  await page.locator('canvas[data-surface="game"]').focus(); await page.keyboard.down('d');
  for (let i = 0; i < 49; i++) await page.clock.fastForward(100);
  await page.keyboard.up('d'); for (let i = 0; i < 10; i++) await page.clock.fastForward(100);
  const save = await page.evaluate(key => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem(key)!); }, EPISODE);
  expect(save.physical.terrainProfile).toBe('forest-clearing-v1'); expect(save.physical.player.x).toBeGreaterThan(510);
  expect(save.physical.player.grounded).toBe(true); expect(save.physical.player.y).toBeGreaterThan(325);
  await page.screenshot({ path: info.outputPath('meadow-swale.png') });
  await page.keyboard.press('m'); await expect(page.getByRole('button', { name: '世界地图', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('meadow-map.png') });
});
