import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/wetland-migration');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const resources=(s:any)=>({mp:s.session.state.mp,learning:s.session.state.learning,economy:s.session.state.economy,capabilities:s.session.state.capabilities});
async function start(p:Page){
  mkdirSync(dir,{recursive:true});await p.clock.install({time:0});
  await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(resolve(dir,'ready.json'),'utf8')});
  await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');await p.clock.pauseAt(60000);
}
async function walk(p:Page,x:number,touch=false){
  const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1,k=sign>0?'d':'a';
  await canvas(p).focus();let cdp;
  if(touch){cdp=await p.context().newCDPSession(p);const b=(await p.getByRole('button',{name:sign>0?'向右':'向左',exact:true}).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}
  else await p.keyboard.down(k);
  try{for(let i=0;i<160;i++){const at=await read();if(sign>0?at>=x-7:at<=x+7)return;await advance(p,100);}throw Error('walk stalled '+await read()+' -> '+x);}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.keyboard.up(k);await advance(p,400);}
}
async function use(p:Page,x:number,label:string,touch=false){
  await walk(p,x,touch);await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · '+label);
  if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');
}
async function close(p:Page){await p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:'继续',exact:true}).click();await advance(p);}
async function visible(p:Page){
  await advance(p,100);const v=await canvas(p).evaluate(c=>({x:+c.dataset.playerX!,y:+c.dataset.playerY!,cx:+c.dataset.cameraX!,cy:+c.dataset.cameraY!,w:c.width,h:c.height,aspect:innerWidth/innerHeight}));
  expect(v.x+6).toBeGreaterThanOrEqual(v.cx);expect(v.x+6).toBeLessThan(v.cx+v.w);
  expect(v.y).toBeGreaterThanOrEqual(v.cy);expect(v.y+14).toBeLessThanOrEqual(v.cy+v.h);expect(Math.abs(v.w/v.h-v.aspect)).toBeLessThan(.02);
}
async function prepare(p:Page,touch=false){
  await use(p,90,'浅滩观察处',touch);await close(p);await use(p,142,'被水浸湿的旧巢',touch);await close(p);
  await use(p,214,'幼体足迹',touch);await close(p);await use(p,246,'疏通迁徙出口的牵引绳',touch);
}
test('wetland: warning, retreat, real migration, exact reload, archive and non-rewarded backtracking',async({page:p})=>{
  test.setTimeout(180000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);
  const before=await saved(p);await visible(p);
  await use(p,246,'疏通迁徙出口的牵引绳');await expect(p.locator('.ep-talk')).toContainText('先辨认');await close(p);
  await prepare(p);const reading=await saved(p);await advance(p,2000);expect((await saved(p)).physical).toEqual(reading.physical);await close(p);
  await advance(p,5000);await expect(canvas(p)).toHaveAttribute('data-migration','warning');
  expect((await saved(p)).physical.migration.adultX).toBe(330);
  await p.screenshot({path:resolve(dir,'warning.png')});
  await walk(p,90);await advance(p,1800);
  const moving=await saved(p);expect(moving.physical.migration.adultX).toBeGreaterThan(330);expect(moving.physical.migration.adultX).toBeLessThan(688);
  await p.keyboard.press('m');const paused=await saved(p);await advance(p,1500);expect((await saved(p)).physical).toEqual(paused.physical);
  await expect(p.locator('.atlas-surface')).toHaveAttribute('data-area','wetland');
  expect(Number(await p.locator('.atlas-surface').getAttribute('data-discovered'))).toBeLessThan(1440);
  await p.getByRole('button',{name:'世界地图',exact:true}).click();await expect(p.locator('.atlas-landmarks')).toContainText('湿地迁徙浅滩');
  await expect(p.locator('.atlas-landmarks')).not.toContainText('地下档案前厅');
  await p.getByRole('button',{name:'关闭地图',exact:true}).click();await p.keyboard.press('Escape');
  const partial=await saved(p);writeFileSync(resolve(dir,'browser-partial.json'),JSON.stringify(partial));
  await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(partial.physical);
  await advance(p,12000);await expect(canvas(p)).toHaveAttribute('data-migration-resolved','true');
  const resolved=await saved(p);expect(resolved.physical.migration.adultX).toBe(688);expect(resolved.physical.migration.youngX).toBe(640);
  expect(resources(resolved)).toEqual(resources(before));
  writeFileSync(resolve(dir,'browser-resolved.json'),JSON.stringify(resolved));await p.screenshot({path:resolve(dir,'migrated.png')});
  await use(p,534,'地下档案入口');await expect(canvas(p)).toHaveAttribute('data-place','order-node');await visible(p);
  await use(p,250,'旱季配水档案');await expect(p.locator('.ep-talk')).toContainText('缺水');await close(p);
  await use(p,298,'受损的碎片座');await expect(p.locator('.ep-talk')).toContainText('没有插入或消耗');await close(p);
  await use(p,346,'未校准的三路配水台');await expect(p.locator('.ep-talk')).toContainText('暂时不能选择');await close(p);
  await p.screenshot({path:resolve(dir,'archive.png')});const archive=await saved(p);
  writeFileSync(resolve(dir,'browser-archive.json'),JSON.stringify(archive));expect(resources(archive)).toEqual(resources(before));
  await p.keyboard.press('j');await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('旱季档案');
  await p.getByRole('button',{name:'回到旅途',exact:true}).click();
  await use(p,26,'返回湿地浅滩');await use(p,34,'返回回流检修渠');
  const frozen=await saved(p);await advance(p,3000);expect((await saved(p)).physical.migration).toEqual(frozen.physical.migration);
  await use(p,456,'通向地下的旧渠口');expect((await saved(p)).session.state.lifeCorpseLedger).toEqual(archive.session.state.lifeCorpseLedger);
  expect(errors).toEqual([]);
});
test('touch wetland: observe, clear, yield, rotate and enter archive without losing controls',async({browser})=>{
  test.setTimeout(180000);const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await context.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p);const before=await saved(p);await visible(p);await prepare(p,true);await close(p);
    await walk(p,90,true);await advance(p,12000);await expect(canvas(p)).toHaveAttribute('data-migration-resolved','true');
    await p.setViewportSize({width:844,height:390});await visible(p);await walk(p,486,true);
    await p.screenshot({path:resolve(dir,'touch-habitat.png')});await use(p,534,'地下档案入口',true);
    await expect(canvas(p)).toHaveAttribute('data-place','order-node');await visible(p);
    await use(p,250,'旱季配水档案',true);await close(p);
    await p.setViewportSize({width:390,height:844});await visible(p);
    await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();const final=await saved(p);
    await advance(p,2000);expect((await saved(p)).physical).toEqual(final.physical);
    await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(final.physical);
    expect(resources(final)).toEqual(resources(before));expect(errors).toEqual([]);
    writeFileSync(resolve(dir,'browser-touch.json'),JSON.stringify(final));await p.screenshot({path:resolve(dir,'touch-archive.png')});
  }finally{await context.close();}
});
