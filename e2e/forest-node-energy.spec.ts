import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/node-energy',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]'),dialog=(p:Page)=>p.getByRole('dialog',{name:'人物对话',exact:true});
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms:number)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const action=(p:Page,label:string)=>dialog(p).getByRole('button',{name:label,exact:true}).click();
async function start(p:Page,words=true){
 await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},
  {key,value:readFileSync(words?dir+'/ready.json':'.codex-tmp/node-experiments/conservation-ready.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function inspect(p:Page){await p.keyboard.press('e');await action(p,'查看上方蓄能提升机');}
async function recall(p:Page){await inspect(p);await action(p,'手摇运行提升参照');await advance(p,1600);await inspect(p);}
async function reload(p:Page){
 const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 const r=await saved(p);expect(r.physical).toEqual(s.physical);expect(r.session).toEqual(s.session);
}
test('finite wawa input requires recall and confirmation; real work and losses survive pauses and reload',async({page:p})=>{
 test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await start(p);const before=await saved(p);await recall(p);
 await expect(dialog(p)).toContainText('左机：输入 10 = 剩余 0 + 提升做功 7.5 + 损耗 2.5');
 await p.getByRole('textbox',{name:'输入力量或能量词'}).fill('wawa');await action(p,'持续运转，不再消耗能量');
 await expect(dialog(p)).toContainText('没有扣 MP');expect((await saved(p)).session).toEqual(before.session);
 await action(p,'查看能量词提示');await expect(dialog(p)).toContainText('不等于永远运转');
 await action(p,'收起提示，自己表达');await expect(p.getByRole('textbox',{name:'输入力量或能量词'})).toHaveValue('');
 await p.getByRole('textbox',{name:'输入力量或能量词'}).fill('wawa');await action(p,'提升更高，能量耗尽后停下');
 const confirm=dialog(p).getByRole('button',{name:'确认消耗 2 MP 补能',exact:true});await expect(confirm).toBeDisabled();
 const prepared=await saved(p);await action(p,'预览右机补能');expect((await saved(p)).session).toEqual(prepared.session);
 await expect(dialog(p)).toContainText('速度、质量不变');await confirm.click();
 await expect(canvas(p)).toHaveAttribute('data-node-energy','casting');
 const cast=await saved(p);expect(cast.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-2);
 expect(cast.session.state.learning).toEqual(before.session.state.learning);
 await advance(p,1000);await p.screenshot({path:dir+'/hoist-running.png'});await p.keyboard.press('j');
 const paused=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(paused.physical);
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('实际提升并耗尽前不记录理解');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await reload(p);
 await p.keyboard.press('m');const mapped=await saved(p);await advance(p,500);expect((await saved(p)).physical).toEqual(mapped.physical);await p.keyboard.press('Escape');
 await advance(p,3600);await expect(canvas(p)).toHaveAttribute('data-node-energy','completed');await inspect(p);
 await expect(dialog(p)).toContainText('右机：输入 30 = 剩余 0 + 提升做功 22.5 + 损耗 7.5');
 const complete=await saved(p);expect(complete.session.state.learning.words.wawa.learningState).toBe('grounded');
 expect(complete.session.state.learning.words.wawa.evidence.length).toBe(before.session.state.learning.words.wawa.evidence.length+1);
 expect(complete.session.eventLedger.filter((e:{eventId:string})=>e.eventId==='episode.node-energy.mp')).toHaveLength(1);
 expect(complete.physical.nodeMotion).toEqual(before.physical.nodeMotion);expect(complete.session.state.learning.words.tawa).toEqual(before.session.state.learning.words.tawa);
 await p.screenshot({path:dir+'/hoist-completed.png'});writeFileSync(dir+'/browser-completed.json',JSON.stringify(complete));
 await action(p,'继续');await reload(p);await inspect(p);expect((await saved(p)).session).toEqual(complete.session);expect(errors).toEqual([]);
});
test('a tool-only player can run the finite reference but cannot gain words or buy a spell',async({page:p})=>{
 test.setTimeout(90000);await start(p,false);const before=await saved(p);await recall(p);
 await expect(dialog(p)).toContainText('先完成回流检修渠测力器');await expect(p.getByRole('textbox',{name:'输入力量或能量词'})).not.toBeVisible();
 expect((await saved(p)).session).toEqual(before.session);await action(p,'继续');await reload(p);
});
test('touch input, preview and paid energy trial survive portrait-landscape rotation',async({browser})=>{
 test.setTimeout(150000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 const tap=async(label:string)=>{const b=dialog(p).getByRole('button',{name:label,exact:true});await b.scrollIntoViewIfNeeded();await b.tap();};
 try{
  await start(p);const before=await saved(p);await p.getByRole('button',{name:'互动',exact:true}).tap();
  await tap('查看上方蓄能提升机');await tap('手摇运行提升参照');await advance(p,1600);
  await p.getByRole('button',{name:'互动',exact:true}).tap();await tap('查看上方蓄能提升机');
  await p.setViewportSize({width:844,height:390});await p.getByRole('textbox',{name:'输入力量或能量词'}).fill('wawa');
  await tap('提升更高，能量耗尽后停下');await tap('预览右机补能');
  const confirm=dialog(p).getByRole('button',{name:'确认消耗 2 MP 补能',exact:true});await confirm.scrollIntoViewIfNeeded();
  const box=(await confirm.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(391);await confirm.tap();
  await advance(p,1000);await p.setViewportSize({width:390,height:844});await reload(p);await advance(p,3600);
  await expect(canvas(p)).toHaveAttribute('data-node-energy','completed');
  const s=await saved(p);expect(s.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-2);
  expect(s.session.eventLedger.filter((e:{eventId:string})=>e.eventId==='episode.node-energy.mp')).toHaveLength(1);
  expect(s.physical.nodeMotion).toEqual(before.physical.nodeMotion);
  await p.screenshot({path:dir+'/hoist-touch.png'});writeFileSync(dir+'/browser-touch.json',JSON.stringify(s));expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
