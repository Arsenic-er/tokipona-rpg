import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/shard-sync',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const resources=(s:any)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,s.session.state[k]]));
async function start(p:Page,file='ready'){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(dir+'/'+file+'.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function action(p:Page,label:string,touch=false){
 const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});
 if(touch)await b.tap();else await b.click();
}
async function open(p:Page,touch=false){if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');}
async function reload(p:Page){const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);}
function outcome(before:any,after:any){
 expect(resources(after)).toEqual(resources(before));expect(after.physical.shardSync.phase).toBe('synchronized');
 const flags=after.session.state.world.flags;expect(flags['region:valley_prologue:forest_site_synchronized'].value).toBe(true);
 expect(flags['global:owns.artifact.fragment.forest_site'].value).toBe(true);
 expect(after.session.state.quests.ch01_underground_water_allocation.stageId).toBe('shard_synchronized');
 for(const f of ['forest_water_allocation_committed','forest_site_lead_revealed','forest_chapter_epilogue_committed'])
  expect(flags['region:valley_prologue:'+f]?.value).not.toBe(true);
}
test('fragment: manual alignment, dialog/map pause, exact pending reload and explicit one-time confirmation',async({page:p})=>{
 test.setTimeout(120000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);
 const before=await saved(p);await open(p);await action(p,'嵌入原碎片');
 await expect(canvas(p)).toHaveAttribute('data-shard-sync','seated');await advance(p,2000);
 expect((await saved(p)).physical.shardSync.age).toBe(0);await action(p,'转动校准柄');await advance(p,500);
 await expect(canvas(p)).toHaveAttribute('data-shard-sync','aligning');
 await open(p);const reading=await saved(p);await advance(p,2000);expect((await saved(p)).physical).toEqual(reading.physical);
 await action(p,'继续');await p.keyboard.press('m');const paused=await saved(p);await advance(p,2000);
 expect((await saved(p)).physical.shardSync).toEqual(paused.physical.shardSync);
 await p.getByRole('button',{name:'关闭地图',exact:true}).click();await reload(p);
 writeFileSync(dir+'/browser-partial.json',JSON.stringify(await saved(p)));await p.screenshot({path:dir+'/browser-aligning.png'});
 await advance(p,6000);await expect(canvas(p)).toHaveAttribute('data-shard-sync','ready');
 const aligned=await saved(p);expect(aligned.session.state.world.flags['region:valley_prologue:forest_site_synchronized']).toBeUndefined();
 await reload(p);await open(p);await p.screenshot({path:dir+'/browser-confirm.png'});
 await action(p,'确认同步并取回碎片');await expect(canvas(p)).toHaveAttribute('data-shard-sync','synchronized');
 const done=await saved(p);outcome(before,done);writeFileSync(dir+'/browser-completed.json',JSON.stringify(done));
 await action(p,'继续');await open(p);await expect(p.locator('.ep-talk')).toContainText('已取回行囊');
 expect((await saved(p)).session).toEqual(done.session);await action(p,'继续');await p.keyboard.press('j');
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('森林位点已同步');
 await p.screenshot({path:dir+'/browser-journal.png'});await reload(p);expect(errors).toEqual([]);
});
test('touch fragment: reversible insertion, portrait controls, rotation and journal pause',async({browser})=>{
 test.setTimeout(120000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await start(p);const before=await saved(p);await open(p,true);await action(p,'嵌入原碎片',true);
  await action(p,'取回碎片，暂不同步',true);await expect(canvas(p)).toHaveAttribute('data-shard-sync','packed');await reload(p);
  await open(p,true);await action(p,'嵌入原碎片',true);
  const b=(await p.getByRole('button',{name:'转动校准柄',exact:true}).boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);
  await p.screenshot({path:dir+'/touch-seated.png'});await action(p,'转动校准柄',true);await advance(p,500);
  await p.setViewportSize({width:844,height:390});await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();
  const paused=await saved(p);await advance(p,2000);expect((await saved(p)).physical.shardSync).toEqual(paused.physical.shardSync);
  await p.getByRole('button',{name:'回到旅途',exact:true}).tap();await reload(p);await advance(p,6000);
  await open(p,true);await action(p,'确认同步并取回碎片',true);const done=await saved(p);outcome(before,done);
  writeFileSync(dir+'/browser-touch.json',JSON.stringify(done));await p.screenshot({path:dir+'/touch-completed.png'});
  await reload(p);expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
test('legacy tool-only archive remains usable without retroactive word or synchronization grants',async({page:p})=>{
 await start(p,'legacy-tools');const before=await saved(p);await open(p);
 await expect(p.locator('.ep-talk')).toContainText('先补齐现场理解记录');
 await expect(p.getByRole('button',{name:'嵌入原碎片',exact:true})).toHaveCount(0);
 expect((await saved(p)).session).toEqual(before.session);await advance(p,3000);
 expect((await saved(p)).physical.shardSync).toBeUndefined();await action(p,'继续');await reload(p);
 writeFileSync(dir+'/browser-legacy.json',JSON.stringify(await saved(p)));
});
