import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
const dir='.codex-tmp/node-experiments',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms:number)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
async function start(p:Page,kind:'gravity'|'time'){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(dir+'/'+kind+'-ready.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
const dialog=(p:Page)=>p.getByRole('dialog',{name:'人物对话',exact:true});
const action=(p:Page,label:string)=>dialog(p).getByRole('button',{name:label,exact:true}).click();
async function reload(p:Page){
 const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);
}
for(const kind of ['gravity','time'] as const)test(kind+' apparatus runs through real controls, pauses, restores and never awards learning',async({page:p})=>{
 test.setTimeout(120000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await start(p,kind);const before=await saved(p);
 await p.keyboard.press('e');expect((await saved(p)).physical.nodeExperiments).toBeUndefined();
 await expect(dialog(p)).toContainText('单刻痕左槽');
 await action(p,'接入右槽异常对照');await expect(dialog(p)).not.toBeVisible();
 await advance(p,800);const running=await saved(p);
 expect(running.physical.nodeExperiments[kind].age).toBeGreaterThan(0);
 await p.screenshot({path:dir+'/'+kind+'-moving.png'});
 await p.keyboard.press('j');const paused=await saved(p);await advance(p,1400);
 expect((await saved(p)).physical).toEqual(paused.physical);
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('正在对照');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await reload(p);
 await p.keyboard.press('m');const mapPaused=await saved(p);await advance(p,800);
 expect((await saved(p)).physical).toEqual(mapPaused.physical);await p.keyboard.press('Escape');
 await advance(p,6500);await expect(canvas(p)).toHaveAttribute('data-'+kind+'-age',kind==='gravity'?'180':'360');
 await p.keyboard.press('e');await expect(dialog(p)).toContainText(kind==='gravity'?'上浮':'右摆');
 await p.screenshot({path:dir+'/'+kind+'-result.png'});
 await action(p,'两槽正常对照');await advance(p,6500);await p.keyboard.press('e');
 await expect(dialog(p)).toContainText(kind==='gravity'?'同向下落':'节奏一致');
 expect((await saved(p)).session).toEqual(before.session);
 await action(p,'机械复位');expect((await saved(p)).physical.nodeExperiments).toBeUndefined();
 await expect(dialog(p)).toContainText('先让两槽正常运行');await action(p,'继续');await reload(p);
 expect((await saved(p)).session).toEqual(before.session);expect(errors).toEqual([]);
});
test('touch controls can start, rotate, inspect and reset the pendulums without offscreen buttons',async({browser})=>{
 test.setTimeout(120000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await start(p,'time');const before=await saved(p);
  await p.getByRole('button',{name:'互动',exact:true}).tap();
  const startButton=dialog(p).getByRole('button',{name:'接入右槽异常对照',exact:true}),b=(await startButton.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);expect(b.y+b.height).toBeLessThanOrEqual(845);
  await startButton.tap();await advance(p,1200);await p.setViewportSize({width:844,height:390});await reload(p);
  await advance(p,6000);await expect(canvas(p)).toHaveAttribute('data-time-age','360');
  await p.getByRole('button',{name:'互动',exact:true}).tap();await expect(dialog(p)).toContainText('右槽内过程变慢');
  const reset=dialog(p).getByRole('button',{name:'机械复位',exact:true});
  await reset.scrollIntoViewIfNeeded();const rb=(await reset.boundingBox())!;
  expect(rb.y).toBeGreaterThanOrEqual(0);expect(rb.y+rb.height).toBeLessThanOrEqual(391);
  await p.screenshot({path:dir+'/time-touch-landscape.png'});await reset.tap();
  expect((await saved(p)).physical.nodeExperiments).toBeUndefined();expect((await saved(p)).session).toEqual(before.session);
  expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
