import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const OPENING = 'tokipona.forest-opening.vertical-slice.v0.1', EPISODE = 'tokipona.forest-waterwheel-episode.v0.1';
const privateReview = process.env.INTERACTION_PRIVATE_REVIEW === '1';
async function advance(page: Page, ms = 300) { for (let n = 0; n < ms; n += 100) await page.clock.fastForward(100); }
async function saved(page: Page) {
  return page.evaluate(k => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem(k)!); }, EPISODE);
}
async function enter(page: Page) {
  const opening = readFileSync(resolve('.codex-tmp/forest-episode/opening.json'), 'utf8');
  await page.clock.install({ time: 0 });
  await page.addInitScript(({ k, s }) => {
    if (!localStorage.getItem('interaction.seeded')) { localStorage.setItem(k, s); localStorage.setItem('interaction.seeded', 'true'); }
  }, { k: OPENING, s: opening });
  await page.goto('/chapter-one.html');
  await page.getByRole('button', { name: '进入聚落 · 水轮与碎片' }).click();
  await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  await page.clock.pauseAt(60000);
  return opening;
}
async function walk(page: Page, destination: number) {
  const canvas = page.locator('canvas[data-surface="game"]');
  await canvas.focus();
  const start = Number(await canvas.getAttribute('data-player-x'));
  const direction = start < destination ? 1 : -1, key = direction === 1 ? 'd' : 'a';
  await page.keyboard.down(key);
  try {
    for (let n = 0; n < 240; n++) {
      const x = Number(await canvas.getAttribute('data-player-x'));
      if (direction === 1 ? x >= destination - 10 : x <= destination + 10) return;
      await advance(page, 100);
    }
    throw new Error('ordinary movement stalled');
  } finally { await page.keyboard.up(key); await advance(page, 500); }
}
async function use(page: Page, touch: boolean) {
  if (touch) await page.getByRole('button', { name: '互动', exact: true }).tap();
  else await page.keyboard.press('e');
}
for (const mobile of [false, true]) test.describe(mobile ? 'landscape touch UI' : 'desktop UI', () => {
  test.use({ viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
  test('worker dialogue and nonmodal timber feedback preserve the chapter', async ({ page }, info) => {
    test.setTimeout(180000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const opening = await enter(page), before = await saved(page);
    const dialog = page.getByRole('dialog', { name: '人物对话', exact: true });
    const bubble = page.getByRole('status', { name: '物品反馈' });
    const canvas = page.locator('canvas[data-surface="game"]');
    await walk(page, 344); await use(page, mobile);
    await expect(dialog).toHaveAttribute('data-presentation', 'worker-dialogue');
    await expect(dialog.getByRole('heading')).toHaveText('工务人');
    if (privateReview) { await expect(dialog).toHaveAttribute('data-portrait', 'candidate-v0.1'); await expect(dialog.locator('img')).toBeVisible(); }
    else { await expect(dialog).toHaveAttribute('data-portrait', 'unavailable'); await expect(dialog.locator('.ep-portrait')).not.toBeVisible(); }
    const bounds = (await dialog.boundingBox())!, view = page.viewportSize()!;
    expect(bounds.x).toBeGreaterThanOrEqual(10); expect(bounds.x + bounds.width).toBeLessThanOrEqual(view.width - 10);
    expect(bounds.height).toBeLessThan(view.height * (mobile ? .65 : .35));
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('worker-dialogue.png') });
    const pauseState = await saved(page);
    await advance(page, 1800);
    expect((await saved(page)).physical).toEqual(pauseState.physical);
    await page.keyboard.down('e'); await page.keyboard.down('e'); await page.keyboard.up('e');
    expect((await saved(page)).session.state.world.flags['global:forest.episode.job']).toBeUndefined();
    await dialog.getByRole('button', { name: '答应维修，换取落脚' }).click();
    await expect(dialog.getByRole('button', { name: '继续', exact: true })).toBeFocused();
    if (mobile) await dialog.getByRole('button', { name: '继续', exact: true }).tap();
    else await page.keyboard.press('e');
    await expect(dialog).not.toBeVisible();
    await expect(canvas).toBeFocused();
    await walk(page, 914); await use(page, mobile);
    await expect(canvas).toHaveAttribute('data-place', 'mill');
    await walk(page, 264); await use(page, mobile); await advance(page);
    await expect(bubble).toContainText('拿到木撑了');
    await expect(dialog).not.toBeVisible();
    const first = await saved(page);
    expect(first.session.state.world.flags['global:forest.episode.timber']?.value).toBe(true);
    for (const k of ['mp', 'economy', 'learning', 'capabilities']) expect(first.session.state[k]).toEqual(before.session.state[k]);
    await use(page, mobile); await use(page, mobile); await advance(page);
    expect((await saved(page)).session).toEqual(first.session);
    await expect(page.locator('.ep-bubble')).toHaveCount(1);
    await expect(bubble).toContainText('木撑带着呢');
    await page.screenshot({ path: info.outputPath('timber-bubble.png') });
    const x = Number(await canvas.getAttribute('data-player-x'));
    await page.keyboard.down('d'); await advance(page, 200); await page.keyboard.up('d'); await advance(page, 100);
    expect(Number(await canvas.getAttribute('data-player-x'))).toBeGreaterThan(x);
    await expect(bubble).toBeVisible();
    if (!mobile) {
      const camera = Number(await canvas.getAttribute('data-camera-width'));
      await page.mouse.move(800, 350); await page.mouse.wheel(0, -480); await advance(page, 1500);
      expect(Number(await canvas.getAttribute('data-camera-width'))).toBeLessThan(camera);
      const b = (await bubble.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(12); expect(b.x + b.width).toBeLessThanOrEqual(view.width - 12);
      const head = (Number(await canvas.getAttribute('data-player-y')) - 5 - Number(await canvas.getAttribute('data-camera-y'))) / Number(await canvas.getAttribute('data-camera-height')) * view.height;
      expect(b.y + b.height).toBeLessThan(head);
      await page.screenshot({ path: info.outputPath('bubble-zoom.png') });
      await page.keyboard.press('0'); await advance(page, 1500);
    }
    await page.keyboard.press('j');
    await expect(bubble).not.toBeVisible();
    await expect(page.getByRole('dialog', { name: '章节笔记' })).toContainText('拿到木撑了');
    await page.keyboard.press('Escape');
    await walk(page, 264); await use(page, mobile); await advance(page);
    await page.keyboard.press('m'); await expect(bubble).not.toBeVisible(); await page.keyboard.press('m');
    await walk(page, 264); await use(page, mobile); await advance(page);
    await walk(page, 390); await expect(bubble).not.toBeVisible();
    const checkpoint = await saved(page);
    await page.reload(); await expect(canvas).toHaveAttribute('data-ready', 'true');
    expect((await saved(page)).session).toEqual(checkpoint.session);
    await expect(bubble).not.toBeVisible();
    expect(await page.evaluate(k => localStorage.getItem(k), OPENING)).toBe(opening);
    await walk(page, 684); await use(page, mobile);
    await expect(dialog).not.toBeVisible();
    await expect(bubble).toContainText('木撑顶住了轮轴');
    const braced = await saved(page);
    await advance(page, 1000);
    expect((await saved(page)).physical.tick).toBeGreaterThan(braced.physical.tick);
    for (const k of ['mp', 'economy', 'learning', 'capabilities']) expect((await saved(page)).session.state[k]).toEqual(before.session.state[k]);
    expect(errors).toEqual([]);
  });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) test.describe(`hermit touch ${viewport.width}x${viewport.height}`, () => {
  test.use({ viewport, hasTouch: true, isMobile: true });
  test('optional questions are readable, do not grant progress, and rest is nonmodal', async ({ page }, info) => {
    test.setTimeout(120000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const fixture = readFileSync(resolve('.codex-tmp/water-study/ready.json'), 'utf8');
    await page.clock.install({ time: 0 });
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { key: EPISODE, value: fixture });
    await page.goto('/chapter-one.html');
    const canvas = page.locator('canvas[data-surface="game"]');
    await expect(canvas).toHaveAttribute('data-ready', 'true'); await page.clock.pauseAt(60000);
    await walk(page, 404); await use(page, true);
    const dialog = page.getByRole('dialog', { name: '人物对话', exact: true }), before = await saved(page);
    await expect(dialog.locator('.ep-portrait')).not.toBeVisible();
    await expect(dialog).toContainText('想试组合');
    await dialog.getByRole('button', { name: '还有些事想问', exact: true }).tap();
    for (const [label, text] of [['旧文明出了什么事？', '维系秩序的能量'], ['这件媒介还能用吗？', 'MP'], ['再讲讲 telo 的用法', '一次要 2 MP'], ['这枚碎片通向哪里？', '古代位点']]) {
      await dialog.getByRole('button', { name: label, exact: true }).tap();
      await expect(dialog).toContainText(text);
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    expect(await saved(page)).toEqual(before);
    await page.screenshot({ path: info.outputPath('hermit-topics.png') });
    await dialog.getByRole('button', { name: '继续', exact: true }).tap();
    await walk(page, 264); await use(page, true); await advance(page);
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('status', { name: '物品反馈' })).toContainText('MP +4');
    const rested = await saved(page);
    expect(rested.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp + 4);
    for (const key of ['economy', 'learning', 'capabilities']) expect(rested.session.state[key]).toEqual(before.session.state[key]);
    await page.screenshot({ path: info.outputPath('rest-bubble.png') });
    await page.reload(); await expect(canvas).toHaveAttribute('data-ready', 'true');
    expect((await saved(page)).session).toEqual(rested.session);
    expect(errors).toEqual([]);
  });
});

test('missing portrait never blocks dialogue or readiness', async ({ page }) => {
  await page.route('**/worker-portrait.v0.1.png', route => route.abort());
  await enter(page); await walk(page, 344); await page.keyboard.press('e');
  const dialog = page.getByRole('dialog', { name: '人物对话', exact: true });
  await expect(dialog).toHaveAttribute('data-portrait', 'unavailable');
  await expect(dialog.locator('.ep-portrait')).not.toBeVisible();
  await dialog.getByRole('button', { name: '答应维修，换取落脚' }).click();
  await expect(dialog).toContainText('那就拜托你了');
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas[data-surface="game"]')).toBeFocused();
});
