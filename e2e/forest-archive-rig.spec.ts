import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/archive-rig',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]'),dialog=(p:Page)=>p.getByRole('dialog',{name:'人物对话',exact:true});
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms:number)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const action=(p:Page,label:string)=>dialog(p).getByRole('button',{name:label,exact:true}).click();
async function start(p:Page,label='ready'){
 await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(dir+'/'+label+'.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function inspect(p:Page){await p.keyboard.press('e');await action(p,'查看档案取回架');}
async function cast(p:Page,word:string,direction='-1'){
 await p.getByRole('textbox',{name:'输入机关表达'}).fill(word);await p.getByRole('combobox',{name:'焦点方向'}).selectOption(direction);
 await action(p,'预览取回架施法');await action(p,'确认取回架施法');
}
async function reload(p:Page){
 const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 const r=await saved(p);expect(r.physical).toEqual(s.physical);expect(r.session).toEqual(s.session);
}
test('water interlock plus two paid inputs deliver a real carrier; collect is explicit and learning stays unchanged',async({page:p})=>{
 test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);
 const before=await saved(p);await inspect(p);await action(p,'接上双杯水位联杆');
 const coupled=await saved(p);await p.getByRole('textbox',{name:'输入机关表达'}).fill('tawa wawa');await action(p,'预览取回架施法');
 const confirm=dialog(p).getByRole('button',{name:'确认取回架施法',exact:true});await expect(confirm).toBeDisabled();
 expect((await saved(p)).session).toEqual(coupled.session);
 await p.getByRole('textbox',{name:'输入机关表达'}).fill('tawa');await action(p,'预览取回架施法');
 await p.getByRole('combobox',{name:'焦点方向'}).selectOption('1');await expect(confirm).toBeDisabled();
 await p.getByRole('combobox',{name:'焦点方向'}).selectOption('-1');await expect(confirm).toBeDisabled();
 await action(p,'预览取回架施法');await confirm.click();await advance(p,500);await reload(p);await inspect(p);await cast(p,'wawa');
 await advance(p,900);await p.screenshot({path:dir+'/rig-moving.png'});await p.keyboard.press('j');
 const paused=await saved(p);await advance(p,800);expect((await saved(p)).physical).toEqual(paused.physical);
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('档案取回架');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await p.keyboard.press('m');
 const mapped=await saved(p);await advance(p,500);expect((await saved(p)).physical).toEqual(mapped.physical);await p.keyboard.press('Escape');
 await reload(p);await advance(p,1800);await expect(canvas(p)).toHaveAttribute('data-archive-rig','delivered');
 await inspect(p);await expect(dialog(p)).toContainText('未返还 MP');await action(p,'取出并记录检修附页');
 await expect(canvas(p)).toHaveAttribute('data-archive-rig','recorded');await expect(dialog(p)).toContainText('不会增加三路可分配的水');
 const done=await saved(p);expect(done.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-4);
 expect(done.session.state.learning).toEqual(before.session.state.learning);expect(done.session.state.capabilities).toEqual(before.session.state.capabilities);
 for(const k of ['nodeWater','nodeEnergy','nodeMotion'])expect(done.physical[k]).toEqual(before.physical[k]);
 expect(done.session.eventLedger.filter((e:{eventId:string})=>e.eventId.startsWith('episode.archive-rig.mp.'))).toHaveLength(2);
 await p.screenshot({path:dir+'/rig-recorded.png'});writeFileSync(dir+'/browser-completed.json',JSON.stringify(done));
 await action(p,'继续');await reload(p);await inspect(p);expect((await saved(p)).session).toEqual(done.session);expect(errors).toEqual([]);
});
test('wasted charge at the wrong stop can be recovered mechanically without refunds or word credit',async({page:p})=>{
 test.setTimeout(120000);await start(p);const before=await saved(p);await inspect(p);await action(p,'接上双杯水位联杆');await cast(p,'wawa');
 await advance(p,3000);await expect(canvas(p)).toHaveAttribute('data-archive-rig','stalled');await inspect(p);await expect(dialog(p)).toContainText('损耗 20');
 await cast(p,'tawa','1');await advance(p,500);await inspect(p);await action(p,'改用手摇绞盘回收');await advance(p,2500);
 await expect(canvas(p)).toHaveAttribute('data-archive-rig','delivered');await inspect(p);await action(p,'取出并记录检修附页');
 const done=await saved(p);expect(done.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-4);expect(done.session.state.learning).toEqual(before.session.state.learning);
 await expect(dialog(p)).toContainText('手摇输入 16');writeFileSync(dir+'/browser-recovered.json',JSON.stringify(done));await action(p,'继续');await reload(p);
});
test('an all-tool player can retrieve the appendix without buying or learning spells',async({page:p})=>{
 test.setTimeout(90000);await start(p,'tools');const before=await saved(p);await inspect(p);await action(p,'接上双杯水位联杆');
 await p.getByRole('textbox',{name:'输入机关表达'}).fill('wawa');await action(p,'预览取回架施法');
 await expect(dialog(p).getByRole('button',{name:'确认取回架施法',exact:true})).toBeDisabled();
 await action(p,'改用手摇绞盘回收');await advance(p,2500);await inspect(p);await action(p,'取出并记录检修附页');
 const done=await saved(p);expect(done.session.state.learning).toEqual(before.session.state.learning);expect(done.session.state.mp).toEqual(before.session.state.mp);
 writeFileSync(dir+'/browser-tools.json',JSON.stringify(done));await action(p,'继续');await reload(p);
});
test('empty hydraulic receivers cannot be bypassed by a menu or a reload',async({page:p})=>{
 await start(p,'locked');const before=await saved(p);await inspect(p);await expect(dialog(p)).toContainText('锁扣仍然闭合');
 await expect(dialog(p).getByRole('button',{name:'接上双杯水位联杆',exact:true})).not.toBeVisible();expect((await saved(p)).session).toEqual(before.session);
 await action(p,'继续');await reload(p);await expect(canvas(p)).toHaveAttribute('data-archive-rig','locked');
});
test('touch expression, focus direction and explicit collection survive both screen orientations',async({browser})=>{
 test.setTimeout(150000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors:string[]=[];
 p.on('pageerror',e=>errors.push(e.message));const tap=async(label:string)=>{const b=dialog(p).getByRole('button',{name:label,exact:true});await b.scrollIntoViewIfNeeded();await b.tap();};
 const open=async()=>{await p.getByRole('button',{name:'互动',exact:true}).tap();await tap('查看档案取回架');};
 try{
  await start(p);const before=await saved(p);await open();await tap('接上双杯水位联杆');await p.getByRole('textbox',{name:'输入机关表达'}).fill('tawa');
  const select=p.getByRole('combobox',{name:'焦点方向'});await select.selectOption('-1');expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await tap('预览取回架施法');await p.setViewportSize({width:844,height:390});
  const confirm=dialog(p).getByRole('button',{name:'确认取回架施法',exact:true});await confirm.scrollIntoViewIfNeeded();
  const box=(await confirm.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(391);await confirm.tap();
  await advance(p,500);await reload(p);await open();await p.getByRole('textbox',{name:'输入机关表达'}).fill('wawa');await tap('预览取回架施法');await tap('确认取回架施法');
  await advance(p,2500);await p.setViewportSize({width:390,height:844});await open();await tap('取出并记录检修附页');
  await expect(canvas(p)).toHaveAttribute('data-archive-rig','recorded');const done=await saved(p);
  expect(done.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-4);expect(done.session.state.learning).toEqual(before.session.state.learning);
  await p.screenshot({path:dir+'/rig-touch.png'});writeFileSync(dir+'/browser-touch.json',JSON.stringify(done));expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
