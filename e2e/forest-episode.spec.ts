import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const OPENING = 'tokipona.forest-opening.vertical-slice.v0.1', EPISODE = 'tokipona.forest-waterwheel-episode.v0.1';
const dir = resolve('.codex-tmp/forest-episode');
const fixture = () => readFileSync(resolve(dir, 'opening.json'), 'utf8');
async function advance(page: Page, milliseconds = 1000) { for (let t = 0; t < milliseconds; t += 100) await page.clock.fastForward(100); }
async function saved(page: Page) { return page.evaluate(key => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem(key)!); }, EPISODE); }
async function closeTalk(page: Page) { await page.getByRole('dialog', { name: '人物对话', exact: true }).getByRole('button', { name: '继续', exact: true }).click(); await advance(page, 300); }
async function walk(page: Page, x: number, touch = false): Promise<void> {
  const canvas = page.locator('canvas[data-surface="game"]'), read = async () => Number(await canvas.getAttribute('data-player-x'));
  await canvas.focus(); const direction = (await read()) < x ? 1 : -1, key = direction > 0 ? 'd' : 'a';
  const button = page.getByRole('button', { name: direction > 0 ? '向右' : '向左', exact: true });
  let cdp;
  if (touch) {
    cdp = await page.context().newCDPSession(page); const b = (await button.boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }] });
  } else await page.keyboard.down(key);
  try {
    for (let n = 0; n < 240; n++) {
      const current = await read();
      if (direction > 0 ? current >= x - 10 : current <= x + 10) return;
      await advance(page, 100);
    }
    throw new Error(`Walk stalled ${await read()} -> ${x}`);
  } finally {
    if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
    else await page.keyboard.up(key);
    await advance(page, 500);
  }
}
async function use(page: Page, label: string, touch = false) {
  await expect(page.locator('[data-ep="prompt"]')).toHaveText(`E · ${label}`);
  if (touch) await page.getByRole('button', { name: '互动', exact: true }).tap(); else await page.keyboard.press('e');
}
async function enter(page: Page) {
  await page.clock.install({ time: 0 });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem('e2e.episode.seeded')) { localStorage.setItem(key, value); localStorage.setItem('e2e.episode.seeded', 'true'); }
  }, { key: OPENING, value: fixture() });
  await page.goto('/chapter-one.html');
  await expect(page.getByRole('button', { name: '进入聚落 · 水轮与碎片' })).toBeEnabled();
  await page.getByRole('button', { name: '进入聚落 · 水轮与碎片' }).click();
  await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  await page.clock.pauseAt(60000);
  await page.locator('canvas[data-surface="game"]').focus();
}

test('complete small chapter: work, physical repair, artifacts, hermit, failure/retry, reward and resume', async ({ page }) => {
  test.setTimeout(300000); mkdirSync(dir, { recursive: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await enter(page);
  const before = await saved(page), originalOpening = await page.evaluate(k => localStorage.getItem(k), OPENING);
  await walk(page, 344); await use(page, '工务人');
  await expect(page.getByRole('button', { name: '答应维修，换取落脚' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '人物对话', exact: true }).getByRole('button', { name: '继续', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await advance(page, 300);
  await walk(page, 914); await use(page, '沿水渠去工坊');
  await expect(page.locator('[data-ep="place"]')).toHaveText('旧水轮工坊');
  await page.keyboard.press('m');
  await page.getByRole('button', { name: '世界地图', exact: true }).click();
  await expect(page.locator('.atlas-landmarks')).toContainText('林间聚落');
  await expect(page.locator('.atlas-landmarks')).toContainText('旧水轮工坊');
  await expect(page.locator('.atlas-landmarks')).not.toContainText('隐士林地');
  await page.keyboard.press('m');
  await walk(page, 264); await use(page, '备用木撑'); await closeTalk(page);
  await walk(page, 684); await use(page, '水轮支架'); await closeTalk(page);
  const valley = await saved(page);
  expect(valley.physical.terrainProfile).toBe('forest-clearing-v1');
  expect(valley.physical.player.y).toBeGreaterThan(350);
  expect(valley.physical.player.grounded).toBe(true);
  await page.screenshot({ path: resolve(dir, 'mill-valley-hollow.png') });
  await page.keyboard.press('m'); await page.screenshot({ path: resolve(dir, 'mill-valley-map.png') }); await page.keyboard.press('m');
  await page.reload(); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  expect((await saved(page)).physical).toEqual(valley.physical);
  await walk(page, 579); await use(page, '渠道淤堵'); await closeTalk(page);
  await walk(page, 484); await use(page, '水渠闸柄'); await closeTalk(page);
  await advance(page, 12000);
  expect((await saved(page)).session.state.world.flags['global:forest.episode.repaired']?.value).toBe(true);
  await page.screenshot({ path: resolve(dir, 'mill-running.png') });
  const flowing = await saved(page), tailrace = flowing.physical.tailrace;
  expect(tailrace.received).toBe(flowing.physical.mill.escaped);
  expect(tailrace.escaped).toBeGreaterThan(0); expect(tailrace.drops.length).toBeGreaterThan(0);
  expect(tailrace.received).toBe(tailrace.escaped + tailrace.drops.length + tailrace.pending.reduce((a: number, b: number) => a + b, 0));
  await page.reload(); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  expect((await saved(page)).physical).toEqual(flowing.physical);
  await use(page, '水渠闸柄'); await closeTalk(page); await advance(page, 20000);
  const drained = await saved(page);
  expect(drained.physical.tailrace.drops).toEqual([]);
  expect(drained.physical.tailrace.escaped).toBeGreaterThan(tailrace.escaped);
  await use(page, '水渠闸柄'); await closeTalk(page);
  await walk(page, 678); await advance(page, 10000);
  await page.screenshot({ path: resolve(dir, 'mill-tailrace-running.png') });
  await page.keyboard.press('m'); await page.screenshot({ path: resolve(dir, 'mill-tailrace-map.png') }); await page.keyboard.press('m');
  await walk(page, 884); await use(page, '检修石龛'); await closeTalk(page);
  const artifacts = await saved(page);
  expect(artifacts.session.state.mp).toEqual(before.session.state.mp);
  expect(artifacts.session.state.learning).toEqual(before.session.state.learning);
  await page.reload(); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-ep="stats"]')).toContainText('森林碎片');
  await walk(page, 54); await use(page, '返回聚落');
  await walk(page, 344); await use(page, '工务人'); await closeTalk(page);
  await walk(page, 54); await use(page, '西侧林间小径');
  // Follow the shallow forest swale with ordinary inputs before returning to the hermit.
  await walk(page, 508);
  const clearing = await saved(page);
  expect(clearing.physical.terrainProfile).toBe('forest-clearing-v1');
  expect(clearing.physical.player.y).toBeGreaterThan(345);
  expect(clearing.physical.player.grounded).toBe(true);
  expect(clearing.session.state.mp).toEqual(before.session.state.mp);
  await page.screenshot({ path: resolve(dir, 'hermit-clearing-swale.png') });
  await page.keyboard.press('m'); await page.screenshot({ path: resolve(dir, 'hermit-clearing-map.png') }); await page.keyboard.press('m');
  await page.reload(); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready', 'true');
  expect((await saved(page)).physical).toEqual(clearing.physical);
  await walk(page, 404); await use(page, '隐士'); await closeTalk(page);
  await walk(page, 614); await use(page, '练习石槽'); await closeTalk(page); await advance(page, 6000);
  await use(page, '练习石槽');
  await page.getByRole('button', { name: '停在空中，不再受重力影响' }).click();
  await expect(page.getByRole('dialog', { name: '人物对话', exact: true })).toContainText('重力'); await closeTalk(page);
  expect((await saved(page)).session.state.mp).toEqual(before.session.state.mp);
  await use(page, '练习石槽'); await page.getByRole('button', { name: '落入槽内，沿坡往低处流' }).click(); await closeTalk(page);
  await use(page, '练习石槽'); await closeTalk(page); await advance(page, 6000);
  expect((await saved(page)).session.state.world.flags['global:forest.episode.practiced']).toBeUndefined();
  await walk(page, 714); await use(page, '漏口与木楔'); await closeTalk(page);
  await walk(page, 614); await use(page, '练习石槽'); await closeTalk(page); await advance(page, 6000);
  const learned = await saved(page);
  expect(learned.session.state.world.flags['global:forest.episode.practiced']?.value).toBe(true);
  expect(learned.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp - 4);
  await page.screenshot({ path: resolve(dir, 'hermit-practice.png') });
  await walk(page, 404); await use(page, '隐士'); await closeTalk(page);
  await walk(page, 54); await use(page, '返回聚落'); await walk(page, 344); await use(page, '工务人'); await closeTalk(page);
  await expect(page.getByRole('dialog', { name: '小章节结算', exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(dir, 'episode-ending.png') });
  const finished = await saved(page);
  expect(finished.session.state.economy.coin).toBe(before.session.state.economy.coin + 8);
  expect(finished.session.state.learning).toEqual(before.session.state.learning);
  expect(finished.session.state.capabilities).toEqual(before.session.state.capabilities);
  expect(await page.evaluate(k => localStorage.getItem(k), OPENING)).toBe(originalOpening);
  writeFileSync(resolve(dir, 'browser-finished.json'), JSON.stringify(finished));
  await page.goto('/chapter-one.html');
  await expect(page.getByRole('dialog', { name: '小章节结算', exact: true })).toBeVisible();
  expect((await saved(page)).session).toEqual(finished.session);
  await page.getByRole('button', { name: '继续在本地走走' }).click(); await use(page, '工务人'); await closeTalk(page);
  expect((await saved(page)).session).toEqual(finished.session);
  // Continue the same earned save; no debug teleport, invented flags or fresh MP snapshot.
  await walk(page,914); await use(page,'沿水渠去工坊');
  await page.keyboard.press('m'); await page.getByRole('button',{name:'世界地图',exact:true}).click();
  await expect(page.locator('.atlas-landmarks')).not.toContainText('蓄水廊检修入口'); await page.keyboard.press('m');
  await walk(page,972); await use(page,'蓄水廊检修入口');
  await expect(page.locator('[data-ep="place"]')).toHaveText('蓄水廊检修入口');
  await expect(page.getByRole('dialog',{name:'小章节结算',exact:true})).not.toBeVisible();
  await walk(page,484); await use(page,'手动绞盘');
  await expect(page.getByRole('dialog',{name:'人物对话',exact:true})).toContainText('先看看左边'); await closeTalk(page);
  await page.keyboard.down('d'); await advance(page,6000); await page.keyboard.up('d'); await advance(page,500);
  const blockedGate = await saved(page);
  expect(blockedGate.physical.player.x+12).toBeLessThanOrEqual(576);
  expect(blockedGate.physical.player.x).toBeGreaterThan(550);
  const fog = await page.evaluate(() => JSON.parse(localStorage.getItem('tokipona.forest-cartography.v0.1')!));
  expect(fog.areas['cistern-entry'].some(([i]:[number,number])=>i===1319)).toBe(false);
  await page.screenshot({path:resolve(dir,'entry-closed-gate.png')});
  await page.reload(); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready','true');
  expect((await saved(page)).physical).toEqual(blockedGate.physical);
  await expect(page.getByRole('dialog',{name:'小章节结算',exact:true})).not.toBeVisible();
  await walk(page,254); await use(page,'隔栅检修标记'); await closeTalk(page);
  await walk(page,484); await use(page,'手动绞盘'); await closeTalk(page);
  expect((await saved(page)).session.state.world.flags['global:forest.episode.entry_open']?.value).toBe(true);
  await walk(page,884); await use(page,'深处门框'); await closeTalk(page);
  const surveyed = await saved(page);
  expect(surveyed.session.state.world.flags['global:forest.episode.entry_surveyed']?.value).toBe(true);
  for (const key of ['mp','economy','learning','capabilities']) expect(surveyed.session.state[key]).toEqual(finished.session.state[key]);
  await page.screenshot({path:resolve(dir,'entry-deep-doorway.png')});
  await page.keyboard.press('m'); await page.screenshot({path:resolve(dir,'entry-local-map.png')});
  await page.getByRole('button',{name:'世界地图',exact:true}).click();
  await expect(page.locator('.atlas-landmarks')).toContainText('蓄水廊检修入口');
  await page.screenshot({path:resolve(dir,'entry-world-map.png')}); await page.keyboard.press('m');
  await page.reload(); await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready','true');
  expect((await saved(page)).physical).toEqual(surveyed.physical);
  await expect(page.getByRole('dialog',{name:'小章节结算',exact:true})).not.toBeVisible();
  await page.keyboard.press('j'); await expect(page.getByRole('dialog',{name:'章节笔记'})).toContainText('碎片没有装入或消耗');
  await page.keyboard.press('Escape');
  writeFileSync(resolve(dir,'browser-entry.json'),JSON.stringify(surveyed));
  await walk(page,712);await use(page,'精密引水窗');
  await page.getByRole('textbox',{name:'输入引水表达'}).fill('telo lili');
  await page.getByRole('button',{name:'预览形态'}).click();await expect(page.getByRole('button',{name:'确认释放'})).toBeDisabled();
  await expect(page.locator('[data-window="preview"]')).toContainText('当前只能组成单词');
  await page.getByRole('button',{name:'先看看周围',exact:true}).click();
  await walk(page,814);await use(page,'引水窗旁通阀');await closeTalk(page);await advance(page,3500);
  const bypass=await saved(page);expect(bypass.session.state.world.flags['global:forest.episode.window_filled']?.value).toBe(true);
  for(const key of ['mp','learning','economy','capabilities'])expect(bypass.session.state[key]).toEqual(finished.session.state[key]);
  await page.screenshot({path:resolve(dir,'window-bypass-filled.png')});
  writeFileSync(resolve(dir,'browser-window-bypass.json'),JSON.stringify(bypass));
  await page.reload();await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready','true');
  expect((await saved(page)).physical).toEqual(bypass.physical);
  await walk(page,54); await use(page,'返回工坊'); await expect(page.locator('[data-ep="place"]')).toHaveText('旧水轮工坊');
  await walk(page,54); await use(page,'返回聚落');
  await walk(page,344); await use(page,'工务人'); await closeTalk(page);
  expect((await saved(page)).session.state.economy).toEqual(finished.session.state.economy);
  expect(await page.evaluate(k=>localStorage.getItem(k),OPENING)).toBe(originalOpening);

  // Branch from an actually earned checkpoint inside this isolated browser test; no invented flags or MP.
  await page.addInitScript(({key,value})=>{
    if(!sessionStorage.getItem('e2e.window.magic.branch')){
      localStorage.setItem(key,value);sessionStorage.setItem('e2e.window.magic.branch','true');
    }},{key:EPISODE,value:JSON.stringify(finished)});
  await page.reload();await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'继续在本地走走'}).click();
  await walk(page,54);await use(page,'西侧林间小径');
  await walk(page,264);await use(page,'林下坐垫');await closeTalk(page);
  const rested=await saved(page);
  await walk(page,404);await use(page,'隐士');await page.getByRole('button',{name:'尝试两词校准'}).click();
  await page.getByRole('textbox',{name:'回忆那个词'}).fill('kiwen');await page.getByRole('button',{name:'提交回忆'}).click();
  expect((await saved(page)).session.state.capabilities.expressionCapacityWords).toBe(1);
  await page.getByRole('textbox',{name:'回忆那个词'}).fill('telo');await page.getByRole('button',{name:'提交回忆'}).click();
  const calibrated=await saved(page);
  expect(calibrated.session.state.mp.currentMp).toBe(rested.session.state.mp.currentMp);
  expect(calibrated.session.state.mp.maxMp).toBe(26);expect(calibrated.session.state.capabilities.expressionCapacityWords).toBe(2);
  await closeTalk(page);await walk(page,54);await use(page,'返回聚落');await walk(page,914);await use(page,'沿水渠去工坊');
  await walk(page,972);await use(page,'蓄水廊检修入口');
  await walk(page,254);await use(page,'隔栅检修标记');await closeTalk(page);
  await walk(page,484);await use(page,'手动绞盘');await closeTalk(page);
  await walk(page,884);await use(page,'深处门框');await closeTalk(page);
  await walk(page,712);await use(page,'精密引水窗');
  const field=page.getByRole('textbox',{name:'输入引水表达'}),confirm=page.getByRole('button',{name:'确认释放'});
  for(const expression of ['telo','telo suli']){
    await field.fill(expression);await page.getByRole('button',{name:'预览形态'}).click();
    await expect(confirm).toBeDisabled();await expect(page.locator('[data-window="preview"]')).toContainText('空间无法形成');
    expect((await saved(page)).session.state.mp).toEqual(calibrated.session.state.mp);
  }
  await field.fill('telo lili');await page.getByRole('button',{name:'预览形态'}).click();await expect(confirm).toBeEnabled();
  await expect(page.locator('[data-window="preview"]')).toContainText('需要 6 MP');
  await field.fill('telo');await expect(confirm).toBeDisabled();
  await field.fill('telo lili');await page.getByRole('button',{name:'预览形态'}).click();
  await page.screenshot({path:resolve(dir,'window-preview.png')});await confirm.click();
  const justCast=await saved(page);expect(justCast.physical.window).toEqual({source:'cast',age:0});
  expect(justCast.session.state.mp.currentMp).toBe(calibrated.session.state.mp.currentMp-6);
  await advance(page,3000);expect((await saved(page)).physical.window.age).toBe(0); // dialogue pauses physics
  await closeTalk(page);await advance(page,3500);
  const castEnd=await saved(page);expect(castEnd.session.state.world.flags['global:forest.episode.window_filled']?.value).toBe(true);
  expect(castEnd.session.state.learning).toEqual(finished.session.state.learning);
  await page.screenshot({path:resolve(dir,'window-cast-filled.png')});
  writeFileSync(resolve(dir,'browser-window-cast.json'),JSON.stringify(castEnd));
  await page.reload();await expect(page.locator('canvas[data-surface="game"]')).toHaveAttribute('data-ready','true');
  expect((await saved(page)).physical).toEqual(castEnd.physical);
  await walk(page,884);await use(page,'深处门框');
  await expect(page.getByRole('dialog',{name:'人物对话',exact:true})).toContainText('检修盖');
  await closeTalk(page);await page.keyboard.press('j');
  await expect(page.getByRole('dialog',{name:'章节笔记'})).toContainText('右侧检修门通往高位蓄水室');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('corrupted continuation is retained and cannot silently start a fresh story', async ({ page }) => {
  await page.goto('/chapter-one.html');
  await page.evaluate(({ key, original }) => { localStorage.setItem(key, '{damaged'); localStorage.setItem('tokipona.forest-opening.vertical-slice.v0.1', original); }, { key: EPISODE, original: fixture() });
  await page.reload();
  await expect(page.getByRole('heading', { name: '这段旅程暂时无法载入' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出原存档' })).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), EPISODE)).toBe('{damaged');
});

test.describe('landscape touch', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test('move, talk, pause, resize and zoom keep a visible correctly proportioned traveler', async ({ page }) => {
    test.setTimeout(120000); await enter(page);
    await walk(page, 344, true); await use(page, '工务人', true);
    const x = await page.locator('canvas[data-surface="game"]').getAttribute('data-player-x'); await advance(page, 2000);
    expect(await page.locator('canvas[data-surface="game"]').getAttribute('data-player-x')).toBe(x);
    await page.getByRole('button', { name: '答应维修，换取落脚' }).tap(); await closeTalk(page);
    await page.screenshot({ path: resolve(dir, 'touch-settlement.png') });
    const dimensions = await page.locator('canvas[data-surface="game"]').evaluate(c => ({ w: c.width, h: c.height, rect: { w: c.clientWidth, h: c.clientHeight } }));
    expect(Math.abs(dimensions.w / dimensions.h - dimensions.rect.w / dimensions.rect.h)).toBeLessThan(.01);
    await page.setViewportSize({ width: 390, height: 844 }); await advance(page, 300);
    const portrait = await page.locator('canvas[data-surface="game"]').evaluate(c => ({ w: c.width, h: c.height }));
    expect(Math.abs(portrait.w / portrait.h - 390 / 844)).toBeLessThan(.01);
    await page.setViewportSize({ width: 844, height: 390 }); await advance(page, 300);
    await page.locator('canvas[data-surface="game"]').focus(); await page.mouse.move(400, 250); await page.mouse.wheel(0, -300); await advance(page, 1200);
    expect(Number(await page.locator('canvas[data-surface="game"]').getAttribute('width'))).toBeLessThan(dimensions.w);
  });
});
