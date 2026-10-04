import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = resolve('.codex-tmp/magic-lab');
async function clickWorld(page: Page, x: number, y: number, touch = false): Promise<void> {
  const box = (await page.locator('canvas[data-surface="lab"]').boundingBox())!;
  const point = { x: box.x + x / 768 * box.width, y: box.y + y / 384 * box.height };
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
test('lab ordinary inputs: combinations, terrain damage, lock refusal, MP, reset and no campaign writes', async ({ page }) => {
  test.setTimeout(90000); mkdirSync(dir, { recursive: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/magic-lab.html');
  const canvas = page.locator('canvas[data-surface="lab"]'); await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => { localStorage.setItem('tokipona.test.sentinel', 'retain-bytes'); sessionStorage.setItem('tokipona.practice.sentinel', 'retain-temporary'); });
  const before = await storage(page);
  await page.locator('#lab-expression').fill('telo suli'); await clickWorld(page, 330, 160);
  await expect(canvas).toHaveAttribute('data-casts', '1');
  await page.locator('#lab-expression').fill('telo telo'); await clickWorld(page, 330, 160);
  await expect(canvas).toHaveAttribute('data-casts', '1'); await expect(page.locator('[data-lab="result"]')).toContainText('还没有实验实现');
  await page.locator('#lab-expression').fill('kiwen'); await clickWorld(page, 664, 300);
  await expect(canvas).toHaveAttribute('data-casts', '1'); await expect(page.locator('[data-lab="result"]')).toContainText('不可改写');
  await page.locator('[data-lab="infinite"]').uncheck();
  await page.locator('#lab-expression').fill('telo o tawa wawa');
  for (let i = 0; i < 4; i++) { await clickWorld(page, 195, 326); await page.waitForTimeout(1000); }
  await expect(canvas).toHaveAttribute('data-casts', '5');
  await expect.poll(async () => Number(await canvas.getAttribute('data-destroyed'))).toBeGreaterThan(0);
  await expect(page.locator('[data-lab="cost"]')).toContainText('28/100');
  await page.screenshot({ path: resolve(dir, 'lab-impact.png') });
  const x = await canvas.getAttribute('data-player-x');
  await page.locator('#lab-expression').focus(); await page.keyboard.type('daad'); await page.waitForTimeout(350);
  expect(await canvas.getAttribute('data-player-x')).toBe(x);
  await page.getByRole('button', { name: '重置实验场', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(canvas).toHaveAttribute('data-casts', '5');
  await page.getByRole('button', { name: '重置实验场', exact: true }).click();
  await page.getByRole('button', { name: '重置实验', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-casts', '0'); await expect(canvas).toHaveAttribute('data-destroyed', '0');
  expect(await storage(page)).toEqual(before); expect(await page.evaluate(() => sessionStorage.getItem('tokipona.practice.sentinel'))).toBe('retain-temporary');
  await page.locator('#lab-preset').selectOption('telo kon o tawa'); await clickWorld(page, 310, 120);
  await page.screenshot({ path: resolve(dir, 'lab-overview.png') });
  expect(errors).toEqual([]);
});
test('chapter guidance lives in the journal; actual menu enters lab and returns to same episode', async ({ page }) => {
  const fixture = readFileSync(resolve('.codex-tmp/forest-episode/start.json'), 'utf8');
  await page.addInitScript(value => { if (!localStorage.getItem('e2e.lab-seeded')) { localStorage.setItem('tokipona.forest-waterwheel-episode.v0.1', value); localStorage.setItem('e2e.lab-seeded', '1'); } }, fixture);
  await page.goto('/chapter-one.html'); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.episode header [data-ep="objective"]')).toHaveCount(0);
  const objective = await page.locator('canvas[data-surface="game"]').getAttribute('data-objective');
  await expect(page.locator('.episode header')).not.toContainText(objective!);
  await page.getByRole('button', { name: '任务日志 J' }).click();
  await expect(page.getByRole('dialog', { name: '章节笔记' })).toContainText(objective!);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const before = (await page.evaluate(() => JSON.parse(localStorage.getItem('tokipona.forest-waterwheel-episode.v0.1')!))).session;
  await page.getByRole('link', { name: '独立魔法实验室（不改主进度）' }).click();
  await expect(page.locator('canvas[data-surface="lab"]')).toHaveAttribute('data-ready', 'true');
  await clickWorld(page, 380, 100); await page.getByRole('link', { name: '返回主游戏' }).click();
  await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  const after = (await page.evaluate(() => JSON.parse(localStorage.getItem('tokipona.forest-waterwheel-episode.v0.1')!))).session;
  expect(after).toEqual(before);
  await page.screenshot({ path: resolve(dir, 'quiet-chapter.png') });
});

test('self-area casts work through normal pointer input, including point-blank projectiles', async ({ page }) => {
  await page.goto('/magic-lab.html');
  const canvas = page.locator('canvas[data-surface="lab"]'); await expect(canvas).toHaveAttribute('data-ready', 'true');
  const before = await storage(page);
  await page.locator('[data-lab="infinite"]').uncheck();
  await page.locator('#lab-expression').fill('kon'); await clickWorld(page, 76, 318);
  await expect(canvas).toHaveAttribute('data-casts', '1');
  await expect(page.locator('[data-lab="cost"]')).toContainText('97/100');
  await page.locator('#lab-expression').fill('telo o tawa wawa'); await clickWorld(page, 76, 329);
  await expect(canvas).toHaveAttribute('data-casts', '2');
  await expect(page.locator('[data-lab="cost"]')).toContainText('79/100');
  await page.locator('#lab-expression').fill('ko'); await clickWorld(page, 76, 304);
  await expect(canvas).toHaveAttribute('data-casts', '2');
  await expect(page.locator('[data-lab="result"]')).toContainText('沙石实体不能直接生成在身体内');
  expect(await storage(page)).toEqual(before);
});
test('opening journal returns keyboard movement without an extra click or forced canvas focus', async ({ page }) => {
  await page.clock.install({ time: 0 });
  await page.goto('/chapter-one.html');
  const canvas = page.locator('canvas[data-surface="game"]');
  await expect(page.getByRole('button', { name: '旅途笔记（J）', exact: true })).toBeVisible();
  await page.clock.pauseAt(60000); await canvas.focus();
  const position = () => page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    return JSON.parse(localStorage.getItem('tokipona.forest-opening.vertical-slice.v0.1')!).spatial.spatial.player.x as number;
  });
  for (const closing of ['Escape', 'j']) {
    const before = await position();
    await page.keyboard.press('j');
    await expect(page.locator('.forest-journey__journal')).toBeVisible();
    await page.keyboard.press(closing);
    await expect(page.locator('.forest-journey__journal')).not.toBeVisible();
    await expect(canvas).toBeFocused();
    await page.keyboard.down('d');
    for (let n = 0; n < 12; n++) await page.clock.fastForward(100);
    await page.keyboard.up('d');
    expect(await position()).toBeGreaterThan(before + 10);
  }
});

test('opening guidance is hidden until J and the original objective remains accessible in the journal', async ({ page }) => {
  await page.goto('/chapter-one.html');
  await expect(page.getByRole('button', { name: '旅途笔记（J）' })).toBeEnabled();
  await expect(page.locator('[data-hud="objective"]')).toBeHidden();
  await expect(page.locator('.forest-journey__hint')).toBeHidden();
  await page.keyboard.press('j');
  await expect(page.locator('.forest-journey__journal [data-hud="objective"]')).toBeVisible();
  await expect(page.locator('.forest-journey__hint')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.forest-journey__hint')).toBeHidden();
});
test('touch viewport maps aiming correctly without stretching and preserves practice return', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/magic-lab.html?practice=0123456789abcdef0123456789abcdef');
  const canvas = page.locator('canvas[data-surface="lab"]'); await expect(canvas).toHaveAttribute('data-ready', 'true');
  const box = (await canvas.boundingBox())!; expect(box.width / box.height).toBeCloseTo(2);
  await clickWorld(page, 330, 200, true); await expect(canvas).toHaveAttribute('data-casts', '0');
  await page.getByRole('button', { name: '向瞄准点施法', exact: true }).tap(); await expect(canvas).toHaveAttribute('data-casts', '1');
  await expect(page.getByRole('link', { name: '返回主游戏' })).toHaveAttribute('href', 'chapter-one.html?practice=0123456789abcdef0123456789abcdef');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(dir, 'lab-phone.png'), fullPage: true }); await context.close();
});
