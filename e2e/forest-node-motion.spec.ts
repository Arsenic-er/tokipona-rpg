import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/node-motion',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]'),dialog=(p:Page)=>p.getByRole('dialog',{name:'人物对话',exact:true});
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms:number)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const action=(p:Page,label:string)=>dialog(p).getByRole('button',{name:label,exact:true}).click();
async function start(p:Page,words=true){
 await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},
  {key,value:readFileSync(words?dir+'/ready.json':'.codex-tmp/node-experiments/time-ready.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function inspect(p:Page){await p.keyboard.press('e');await action(p,'查看上方运动滑轨');}
async function recall(p:Page){
 await inspect(p);await action(p,'运行滑轨机械参照');await advance(p,3300);await inspect(p);
}
async function reload(p:Page){
 const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 const r=await saved(p);expect(r.physical).toEqual(s.physical);expect(r.session).toEqual(s.session);
}
test('explicit recall, preview and payment lead to a visible reversal and one guided evidence after reload',async({page:p})=>{
 test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await start(p);const before=await saved(p);await recall(p);
 await p.getByRole('textbox',{name:'输入运动词'}).fill('tawa');await action(p,'两轨继续同向');
 await expect(dialog(p)).toContainText('未扣 MP');expect((await saved(p)).session).toEqual(before.session);
 await action(p,'查看运动词提示');await expect(dialog(p)).toContainText('不是向左，也不是瞬移');
 await action(p,'收起提示，自己表达');await expect(p.getByRole('textbox',{name:'输入运动词'})).toHaveValue('');
 await p.getByRole('textbox',{name:'输入运动词'}).fill('tawa');await action(p,'下轨反向，上轨继续向右');
 const confirm=dialog(p).getByRole('button',{name:'确认消耗 2 MP 施放',exact:true});await expect(confirm).toBeDisabled();
 const prepared=await saved(p);await action(p,'预览下轨作用');expect((await saved(p)).session).toEqual(prepared.session);
 await expect(dialog(p)).toContainText('0.4 秒');await confirm.click();
 await expect(canvas(p)).toHaveAttribute('data-node-motion','casting');
 let cast=await saved(p);expect(cast.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-2);
 expect(cast.session.state.learning).toEqual(before.session.state.learning);
 await advance(p,600);await p.screenshot({path:dir+'/rail-reversing.png'});await p.keyboard.press('j');
 const paused=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(paused.physical);
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('未验证结果前不记录理解');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await reload(p);
 await p.keyboard.press('m');const mapped=await saved(p);await advance(p,500);expect((await saved(p)).physical).toEqual(mapped.physical);await p.keyboard.press('Escape');
 await advance(p,3300);await expect(canvas(p)).toHaveAttribute('data-node-motion','completed');await inspect(p);
 await expect(dialog(p)).toContainText('下轨先减速再反向');const complete=await saved(p);
 expect(complete.session.state.learning.words.tawa.learningState).toBe('grounded');
 expect(complete.session.eventLedger.filter((e:{eventId:string})=>e.eventId==='episode.node-motion.mp')).toHaveLength(1);
 expect(complete.session.state.learning.words.tawa.evidence.length).toBe(before.session.state.learning.words.tawa.evidence.length+1);
 await p.screenshot({path:dir+'/rail-completed.png'});writeFileSync(dir+'/browser-completed.json',JSON.stringify(complete));
 await action(p,'继续');await reload(p);await inspect(p);expect((await saved(p)).session).toEqual(complete.session);expect(errors).toEqual([]);
});
test('mechanical comparison remains available without tawa, but no spell or language reward is offered',async({page:p})=>{
 test.setTimeout(90000);await start(p,false);const before=await saved(p);await recall(p);
 await expect(dialog(p)).toContainText('先回工坊水轮支架');await expect(p.getByRole('textbox',{name:'输入运动词'})).not.toBeVisible();
 expect((await saved(p)).session).toEqual(before.session);await action(p,'继续');await reload(p);
});
test('touch recall and confirmation work after rotating, pause for menus and survive reload',async({browser})=>{
 test.setTimeout(150000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 const tap=async(label:string)=>{const b=dialog(p).getByRole('button',{name:label,exact:true});await b.scrollIntoViewIfNeeded();await b.tap();};
 try{
  await start(p);const before=await saved(p);await p.getByRole('button',{name:'互动',exact:true}).tap();
  await tap('查看上方运动滑轨');await tap('运行滑轨机械参照');await advance(p,3300);
  await p.getByRole('button',{name:'互动',exact:true}).tap();await tap('查看上方运动滑轨');
  await p.setViewportSize({width:844,height:390});
  await p.getByRole('textbox',{name:'输入运动词'}).fill('tawa');await tap('下轨反向，上轨继续向右');
  await tap('预览下轨作用');await tap('确认消耗 2 MP 施放');await advance(p,500);
  await p.setViewportSize({width:390,height:844});await reload(p);await advance(p,3500);
  await expect(canvas(p)).toHaveAttribute('data-node-motion','completed');
  const s=await saved(p);expect(s.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-2);
  expect(s.session.eventLedger.filter((e:{eventId:string})=>e.eventId==='episode.node-motion.mp')).toHaveLength(1);
  await p.screenshot({path:dir+'/rail-touch.png'});writeFileSync(dir+'/browser-touch.json',JSON.stringify(s));expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
