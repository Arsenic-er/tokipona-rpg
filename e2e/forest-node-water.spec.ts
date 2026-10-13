import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/node-water',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]'),dialog=(p:Page)=>p.getByRole('dialog',{name:'人物对话',exact:true});
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms:number)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const action=(p:Page,label:string)=>dialog(p).getByRole('button',{name:label,exact:true}).click();
async function start(p:Page,words=true){
 await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},
  {key,value:readFileSync(dir+'/'+(words?'ready':'tools')+'.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function inspect(p:Page){await p.keyboard.press('e');await action(p,'查看上方串联接水槽');}
async function reload(p:Page){
 const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 const r=await saved(p);expect(r.physical).toEqual(s.physical);expect(r.session).toEqual(s.session);
}
test('serial waterway uses real short/long casts and receipts; UI pauses and reload preserve both stages',async({page:p})=>{
 test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await start(p);const before=await saved(p);await inspect(p);
 await p.getByRole('textbox',{name:'输入水与尺度表达'}).fill('telo suli');await action(p,'短段落入窄口接水杯');
 await expect(dialog(p)).toContainText('未扣 MP');expect((await saved(p)).session).toEqual(before.session);
 await action(p,'查看水与尺度提示');await action(p,'收起提示，自己写水路表达');
 await expect(p.getByRole('textbox',{name:'输入水与尺度表达'})).toHaveValue('');
 await p.getByRole('textbox',{name:'输入水与尺度表达'}).fill('telo lili');await action(p,'短段落入窄口接水杯');
 const confirm=dialog(p).getByRole('button',{name:'确认释放水结构',exact:true});await expect(confirm).toBeDisabled();
 const prepared=await saved(p);await action(p,'预览串联水结构');expect((await saved(p)).session).toEqual(prepared.session);
 await expect(dialog(p)).toContainText('长度 16 px');await confirm.click();
 await advance(p,900);await p.screenshot({path:dir+'/water-short-running.png'});await p.keyboard.press('j');
 const paused=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(paused.physical);
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('地下串联接水槽');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await reload(p);await advance(p,3000);
 await expect(canvas(p)).toHaveAttribute('data-node-water','long');await inspect(p);
 await p.getByRole('textbox',{name:'输入水与尺度表达'}).fill('telo suli');await action(p,'长段落入隔开的两只杯子');
 await action(p,'预览串联水结构');await expect(confirm).toBeDisabled();await expect(dialog(p)).toContainText('先固定长口支架');
 await action(p,'固定长口支架');await action(p,'预览串联水结构');await expect(dialog(p)).toContainText('长度 64 px');await confirm.click();
 await advance(p,1000);await p.keyboard.press('m');const mapped=await saved(p);await advance(p,500);expect((await saved(p)).physical).toEqual(mapped.physical);
 await p.keyboard.press('Escape');await reload(p);await advance(p,3000);await expect(canvas(p)).toHaveAttribute('data-node-water','completed');
 const done=await saved(p);expect(done.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-16);
 for(const word of ['telo','lili','suli']){
  expect(done.session.state.learning.words[word].learningState).toBe('grounded');
  expect(done.session.state.learning.words[word].evidence.length).toBe(before.session.state.learning.words[word].evidence.length+1);
 }
 expect(done.physical.nodeMotion).toEqual(before.physical.nodeMotion);expect(done.physical.nodeEnergy).toEqual(before.physical.nodeEnergy);
 expect(done.session.eventLedger.filter((e:{eventId:string})=>e.eventId.startsWith('episode.node-water.mp.'))).toHaveLength(2);
 await p.screenshot({path:dir+'/water-completed.png'});writeFileSync(dir+'/browser-completed.json',JSON.stringify(done));
 await inspect(p);await expect(dialog(p)).toContainText('不重复扣费');await action(p,'继续');await reload(p);expect(errors).toEqual([]);
});
test('finite tool reservoirs solve both stages without magic, word grants or payment',async({page:p})=>{
 test.setTimeout(90000);await start(p,false);const before=await saved(p);await inspect(p);
 await expect(p.getByRole('textbox',{name:'输入水与尺度表达'})).not.toBeVisible();
 await action(p,'手动释放窄口备用水箱');await advance(p,4000);await inspect(p);
 await action(p,'手动释放双槽备用水箱');await advance(p,4000);await expect(canvas(p)).toHaveAttribute('data-node-water','completed');
 const done=await saved(p);expect(done.session.state.learning).toEqual(before.session.state.learning);expect(done.session.state.mp).toEqual(before.session.state.mp);
 await p.screenshot({path:dir+'/water-tools.png'});writeFileSync(dir+'/browser-tools.json',JSON.stringify(done));await reload(p);
});
test('touch casts remain usable through portrait-landscape rotation',async({browser})=>{
 test.setTimeout(150000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 const tap=async(label:string)=>{const b=dialog(p).getByRole('button',{name:label,exact:true});await b.scrollIntoViewIfNeeded();await b.tap();};
 try{
  await start(p);const before=await saved(p);
  for(const stage of ['short','long'] as const){
   await p.getByRole('button',{name:'互动',exact:true}).tap();await tap('查看上方串联接水槽');
   if(stage==='long'){await tap('固定长口支架');await p.setViewportSize({width:844,height:390});}
   await p.getByRole('textbox',{name:'输入水与尺度表达'}).fill(stage==='short'?'telo lili':'telo suli');
   await tap(stage==='short'?'短段落入窄口接水杯':'长段落入隔开的两只杯子');await tap('预览串联水结构');
   const confirm=dialog(p).getByRole('button',{name:'确认释放水结构',exact:true});await confirm.scrollIntoViewIfNeeded();
   const box=(await confirm.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual((stage==='short'?844:390)+1);
   await confirm.tap();await advance(p,1000);await reload(p);await advance(p,3000);
  }
  await p.setViewportSize({width:390,height:844});await expect(canvas(p)).toHaveAttribute('data-node-water','completed');
  const done=await saved(p);expect(done.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-16);
  expect(done.physical.nodeMotion).toEqual(before.physical.nodeMotion);expect(done.physical.nodeEnergy).toEqual(before.physical.nodeEnergy);
  await p.screenshot({path:dir+'/water-touch.png'});writeFileSync(dir+'/browser-touch.json',JSON.stringify(done));expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
