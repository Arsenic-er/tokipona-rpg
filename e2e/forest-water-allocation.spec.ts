import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/water-allocation',key='tokipona.forest-waterwheel-episode.v0.1';
const modes=[['settlement_priority','聚落优先','80,20,20'],['wetland_priority','湿地优先','20,80,20'],['road_trade_priority','商路优先','20,20,80']] as const;
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const resources=(s:any)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,s.session.state[k]]));
async function start(p:Page){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(dir+'/ready.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function action(p:Page,label:string,touch=false){const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});if(touch)await b.tap();else await b.click();}
async function open(p:Page,touch=false){if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');}
async function reload(p:Page){const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);}
function outcome(before:any,after:any,mode:string){
 expect(resources(after)).toEqual(resources(before));expect(after.physical.allocation.phase).toBe('committed');
 const flags=after.session.state.world.flags;expect(flags['region:valley_prologue:forest_water_allocation'].value).toBe(mode);
 expect(flags['region:valley_prologue:forest_water_allocation_committed'].value).toBe(true);
 expect(after.session.state.quests.ch01_underground_water_allocation.stageId).toBe('water_allocated');
 expect(flags['global:owns.artifact.fragment.forest_site'].value).toBe(true);
 for(const k of ['returnFlow','migration','shardSync','lengthStudy'])expect(after.physical[k]).toEqual(before.physical[k]);
 for(const f of ['forest_site_lead_revealed','forest_chapter_epilogue_committed','prologue_return_observed'])
  expect(flags['region:valley_prologue:'+f]?.value).not.toBe(true);
}
for(const [mode,label,delivered] of modes)test('allocation '+mode+': preview, explicit confirmation, real finite water and exact restore',async({page:p})=>{
 test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
 await open(p);await action(p,'预览：'+label);await expect(p.locator('.ep-talk')).toContainText('收益');await expect(p.locator('.ep-talk')).toContainText('代价');
 await expect(canvas(p)).toHaveAttribute('data-allocation','preview');expect((await saved(p)).session).toEqual(before.session);
 await action(p,'取消预览');await expect(canvas(p)).toHaveAttribute('data-allocation','unvisited');expect((await saved(p)).session).toEqual(before.session);
 await action(p,'预览：'+label);await reload(p);await open(p);await p.screenshot({path:dir+'/preview-'+mode+'.png'});
 await action(p,'确认：'+label);await expect(p.locator('.ep-talk')).not.toBeVisible();await advance(p,800);
 await expect(canvas(p)).toHaveAttribute('data-allocation','routing');await expect(canvas(p)).toHaveAttribute('data-allocation-mode','unassigned');
 await open(p);const reading=await saved(p);await advance(p,2000);expect((await saved(p)).physical).toEqual(reading.physical);await action(p,'继续');
 await p.keyboard.press('m');const paused=await saved(p);await advance(p,2000);expect((await saved(p)).physical.allocation).toEqual(paused.physical.allocation);
 await p.getByRole('button',{name:'关闭地图',exact:true}).click();await reload(p);
 writeFileSync(dir+'/browser-partial-'+mode+'.json',JSON.stringify(await saved(p)));await p.screenshot({path:dir+'/routing-'+mode+'.png'});
 await advance(p,15000);await expect(canvas(p)).toHaveAttribute('data-allocation','committed');
 await expect(canvas(p)).toHaveAttribute('data-allocation-delivered',delivered);const done=await saved(p);outcome(before,done,mode);
 writeFileSync(dir+'/browser-completed-'+mode+'.json',JSON.stringify(done));
 await open(p);await expect(p.locator('.ep-talk')).toContainText('已确认分配');await expect(p.getByRole('button',{name:'取消预览',exact:true})).toHaveCount(0);
 expect((await saved(p)).session).toEqual(done.session);await action(p,'继续');await p.keyboard.press('j');
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText(label);await p.screenshot({path:dir+'/journal-'+mode+'.png'});
 await reload(p);
 if(mode==='wetland_priority'){
  for(const [x,label] of [[26,'返回湿地浅滩'],[34,'返回回流检修渠'],[26,'返回蓄水室顶层'],[266,'沿回流道返回工坊'],[54,'返回聚落'],[344,'工务人']] as const){
   const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1,k=sign>0?'d':'a';
   await canvas(p).focus();await p.keyboard.down(k);
   try{for(let i=0;i<160;i++){const at=await read();if(sign>0?at>=x-7:at<=x+7)break;await advance(p,100);}}
   finally{await p.keyboard.up(k);await advance(p,400);}
   await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · '+label);await p.keyboard.press('e');
  }
  await expect(p.locator('.ep-talk')).toContainText('分时取水牌');await action(p,'继续');
  await expect(p.getByRole('dialog',{name:'小章节结算',exact:true})).not.toBeVisible();
  expect(resources(await saved(p))).toEqual(resources(done));await reload(p);
 }
 expect(errors).toEqual([]);
});
test('touch allocation: compare modes, persist selection, rotate, pause and lock the final choice',async({browser})=>{
 test.setTimeout(150000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await start(p);const before=await saved(p);await open(p,true);await action(p,'预览：聚落优先',true);await action(p,'预览：湿地优先',true);
  expect((await saved(p)).session).toEqual(before.session);const b=(await p.getByRole('button',{name:'确认：湿地优先',exact:true}).boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);
  await p.screenshot({path:dir+'/touch-preview.png'});await action(p,'确认：湿地优先',true);await advance(p,800);
  await p.setViewportSize({width:844,height:390});await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();
  const paused=await saved(p);await advance(p,2000);expect((await saved(p)).physical.allocation).toEqual(paused.physical.allocation);
  await p.getByRole('button',{name:'回到旅途',exact:true}).tap();await reload(p);await advance(p,15000);
  await expect(canvas(p)).toHaveAttribute('data-allocation-delivered','20,80,20');const done=await saved(p);outcome(before,done,'wetland_priority');
  writeFileSync(dir+'/browser-touch.json',JSON.stringify(done));await p.screenshot({path:dir+'/touch-completed.png'});
  await open(p,true);await action(p,'继续',true);await open(p,true);expect((await saved(p)).session).toEqual(done.session);
  await reload(p);expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
