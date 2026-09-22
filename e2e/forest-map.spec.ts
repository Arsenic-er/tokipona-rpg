import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const EPISODE = 'tokipona.forest-waterwheel-episode.v0.1', MAP = 'tokipona.forest-cartography.v0.1';
const surface = 'canvas[data-surface="game"]', dir = resolve('.codex-tmp/forest-map');
async function advance(page: Page, ms: number) { for (let i = 0; i < ms; i += 100) await page.clock.fastForward(100); }
async function start(page: Page, corrupt = false) {
  await page.clock.install({ time: 0 });
  await page.addInitScript(({ episode, value, map, corrupt }) => {
    if (!localStorage.getItem('map.test.seeded')) {
      localStorage.setItem(episode, value); if (corrupt) localStorage.setItem(map, '{broken-map'); localStorage.setItem('map.test.seeded', '1');
    }
  }, { episode: EPISODE, value: readFileSync(resolve('.codex-tmp/forest-episode/start.json'), 'utf8'), map: MAP, corrupt });
  await page.goto('/chapter-one.html'); await expect(page.locator(surface)).toHaveAttribute('data-ready', 'true');
  await page.clock.pauseAt(60000); await page.locator(surface).focus();
}
test('M map has persistent black fog, pauses inputs, does not reveal from zoom, and maps visited scenes', async ({ page }) => {
  test.setTimeout(120000); mkdirSync(dir, { recursive: true }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page); const mini = page.locator('.atlas-mini canvas'); const initially = Number(await mini.getAttribute('data-discovered'));
  expect(initially).toBeGreaterThan(0); expect(initially).toBeLessThan(400);
  await page.screenshot({ path: resolve(dir, 'settlement-buildings.png') });
  await page.keyboard.press('m'); const dialog = page.getByRole('dialog', { name: '旅途地图' }); await expect(dialog).toBeVisible();
  await expect(page.locator('.atlas-landmarks')).not.toContainText('工务人');
  const x = await page.locator(surface).getAttribute('data-player-x');
  await page.keyboard.down('d'); await advance(page, 1600); await page.keyboard.up('d');
  expect(await page.locator(surface).getAttribute('data-player-x')).toBe(x);
  const original = await page.evaluate(key => localStorage.getItem(key), MAP);
  await page.getByRole('button', { name: '缩小地图', exact: true }).click(); await page.getByRole('button', { name: '放大地图', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), MAP)).toBe(original);
  const black = await page.locator('.atlas-surface').evaluate(c => { const canvas = c as HTMLCanvasElement; return [...canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * .85), Math.floor(canvas.height * .5), 1, 1).data]; });
  expect(black).toEqual([3,7,6,255]);
  await page.screenshot({ path: resolve(dir, 'local-map-fog.png') });
  await page.getByRole('button', { name: '世界地图', exact: true }).click();
  await expect(page.locator('.atlas-landmarks')).toContainText('林间聚落'); await expect(page.locator('.atlas-landmarks')).not.toContainText('旧水轮工坊');
  await page.screenshot({ path: resolve(dir, 'world-map.png') });
  await page.keyboard.press('m'); await expect(dialog).not.toBeVisible(); await advance(page, 500);
  expect(await page.locator(surface).getAttribute('data-player-x')).toBe(x);
  await page.keyboard.down('d'); await advance(page, 3200); await page.keyboard.up('d'); await advance(page, 700);
  const discovered = Number(await mini.getAttribute('data-discovered')); expect(discovered).toBeGreaterThan(initially);
  await page.keyboard.press('m'); await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.reload(); await expect(page.locator(surface)).toHaveAttribute('data-ready', 'true');
  expect(Number(await mini.getAttribute('data-discovered'))).toBeGreaterThanOrEqual(discovered);
  expect(errors).toEqual([]);
});
test('bad map data is retained while gameplay and new in-memory exploration remain available', async ({ page }) => {
  await start(page, true); await page.keyboard.press('m');
  await expect(page.locator('.atlas-note')).toContainText('原数据保留'); await expect(page.getByRole('button', { name: '导出地图备份' })).toBeVisible();
  await page.keyboard.press('m'); await page.keyboard.down('d'); await advance(page, 1000); await page.keyboard.up('d');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(key => localStorage.getItem(key), MAP)).toBe('{broken-map');
  expect(Number(await page.locator(surface).getAttribute('data-player-x'))).toBeGreaterThan(130);
});
test('opening route also supports M, occluded terrain, and safe keyboard return', async ({ page }) => {
  await page.clock.install({ time: 0 }); await page.goto('/chapter-one.html?practice=11223344556677889900112233445566');
  await expect(page.locator('.atlas-mini')).toBeVisible(); await page.clock.pauseAt(60000);
  await page.locator(surface).focus(); await page.keyboard.press('m'); await expect(page.getByRole('dialog', { name: '旅途地图' })).toBeVisible();
  await expect(page.locator('.atlas-subtitle')).toContainText('林缘溪路');
  const record = await page.evaluate(key => sessionStorage.getItem(key + '.practice.11223344556677889900112233445566'), MAP);
  expect(record).not.toBeNull(); expect(await page.evaluate(key => localStorage.getItem(key), MAP)).toBeNull();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '旅途地图' })).not.toBeVisible();
  await expect(page.locator('.forest-opening__pause')).not.toBeVisible();
});
test.describe('touch map', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('map button, layer switching and close remain reachable on a phone', async ({ page }) => {
    await start(page); await page.getByRole('button', { name: '查看地图（M）' }).tap();
    await expect(page.getByRole('dialog', { name: '旅途地图' })).toBeVisible();
    await page.getByRole('button', { name: '世界地图', exact: true }).tap(); await page.getByRole('button', { name: '当前场景', exact: true }).tap();
    const rect = await page.locator('.atlas-surface').boundingBox(); expect(rect!.width).toBeLessThan(390); expect(rect!.height).toBeGreaterThan(150);
    await page.screenshot({ path: resolve(dir, 'phone-map.png') });
    await page.getByRole('button', { name: '关闭地图', exact: true }).tap(); await expect(page.getByRole('dialog', { name: '旅途地图' })).not.toBeVisible();
  });
});
