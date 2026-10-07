import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/motion-study');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
async function start(p:Page){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(resolve(dir,'ready.json'),'utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function action(p:Page,label:string,touch=false){
 const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});
 if(touch)await b.tap();else await b.click();
}
async function open(p:Page,first=false,touch=false){
 if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');
 await action(p,first?'查看水轮运动刻槽':'继续水轮观察',touch);
}
async function reload(p:Page){const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);return s;}
function verify(before:any,after:any){
 for(const k of ['mp','economy','capabilities','lifeCorpseLedger'])expect(after.session.state[k]).toEqual(before.session.state[k]);
 for(const w of ['telo','wawa','lili','suli'])expect(after.session.state.learning.words[w]).toEqual(before.session.state.learning.words[w]);
 const word=after.session.state.learning.words.tawa;expect(word.learningState).toBe('grounded');
 const evidence=word.evidence.filter((e:any)=>e.eventType==='grounding_trial_resolved');expect(evidence).toHaveLength(1);
 expect(evidence[0]).toMatchObject({taskFamilyId:'infrastructure_flow',promptLevel:1,answerVisible:false,toolBypass:false,worldOutcomeContribution:true});
}
test('wheel study: physical observation, hidden recall, pause and exact pending restore',async({page:p})=>{
 test.setTimeout(120000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
 await open(p,true);expect((await saved(p)).session).toEqual(before.session);
 await action(p,'观察水轮与固定支架');await expect(p.locator('.ep-talk')).not.toBeVisible();
 await advance(p,1000);await expect(canvas(p)).toHaveAttribute('data-motion-study','entered');await reload(p);
 await advance(p,6000);await expect(canvas(p)).toHaveAttribute('data-motion-study','observed');
 await open(p);await action(p,'用支架嵌片校准媒介');await expect(p.locator('.ep-talk')).not.toContainText('tawa');
 const attuned=await saved(p),input=p.getByRole('textbox',{name:'回忆去或移动的词',exact:true});
 await input.fill('telo');await action(p,'沿轮缘顺时针移动');expect((await saved(p)).session).toEqual(attuned.session);
 await input.fill('tawa');await action(p,'相对支架保持不动');expect((await saved(p)).session).toEqual(attuned.session);
 await action(p,'复看运动注音');await expect(p.locator('.ep-talk')).toContainText('tawa');
 await action(p,'收起注音，重新预测');await expect(p.locator('.ep-talk')).not.toContainText('tawa');
 await p.screenshot({path:resolve(dir,'browser-recall.png')});await input.fill('tawa');await action(p,'沿轮缘顺时针移动');
 await expect(p.locator('.ep-talk')).not.toBeVisible();await advance(p,300);await expect(canvas(p)).toHaveAttribute('data-motion-study','predicted');
 const partial=await saved(p);await p.keyboard.press('m');await advance(p,1500);
 expect((await saved(p)).physical.motionStudy).toEqual(partial.physical.motionStudy);
 expect((await saved(p)).physical.wheelAngle).toBe(partial.physical.wheelAngle);
 await p.getByRole('button',{name:'关闭地图',exact:true}).click();await reload(p);
 writeFileSync(resolve(dir,'browser-partial.json'),JSON.stringify(await saved(p)));await p.screenshot({path:resolve(dir,'browser-observing.png')});
 await advance(p,6000);await expect(canvas(p)).toHaveAttribute('data-motion-study','completed');
 const done=await saved(p);verify(before,done);writeFileSync(resolve(dir,'browser-completed.json'),JSON.stringify(done));
 await p.screenshot({path:resolve(dir,'browser-completed.png')});await open(p);await expect(p.locator('.ep-talk')).toContainText('不是“顺时针”');
 expect((await saved(p)).session).toEqual(done.session);await reload(p);expect(errors).toEqual([]);
});
test('touch wheel study: portrait recall, rotation, journal pause and no duplicated evidence',async({browser})=>{
 test.setTimeout(120000);const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const p=await c.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await start(p);const before=await saved(p);await open(p,true,true);await action(p,'观察水轮与固定支架',true);
  await advance(p,6000);await open(p,false,true);await action(p,'用支架嵌片校准媒介',true);
  const input=p.getByRole('textbox',{name:'回忆去或移动的词',exact:true}),b=(await input.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);
  await expect(p.locator('.ep-talk')).not.toContainText('tawa');await p.screenshot({path:resolve(dir,'touch-portrait-recall.png')});
  await input.fill('tawa');await action(p,'沿轮缘逆时针移动',true);expect((await saved(p)).physical.motionStudy.phase).toBe('observe');
  await input.fill('ＴＡＷＡ');await action(p,'沿轮缘顺时针移动',true);await advance(p,300);
  await p.setViewportSize({width:844,height:390});await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();
  const paused=await saved(p);await advance(p,1500);expect((await saved(p)).physical.motionStudy).toEqual(paused.physical.motionStudy);
  await p.getByRole('button',{name:'回到旅途',exact:true}).tap();await reload(p);await advance(p,6000);
  await expect(canvas(p)).toHaveAttribute('data-motion-study','completed');const done=await saved(p);verify(before,done);
  writeFileSync(resolve(dir,'browser-touch.json'),JSON.stringify(done));await p.screenshot({path:resolve(dir,'touch-landscape-completed.png')});
  await open(p,false,true);await action(p,'继续',true);await open(p,false,true);
  expect((await saved(p)).session).toEqual(done.session);await reload(p);expect(errors).toEqual([]);
 }finally{await c.close();}
});
