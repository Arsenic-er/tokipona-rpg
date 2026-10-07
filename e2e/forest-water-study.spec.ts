import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/water-study');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const resources=(s:any)=>({economy:s.session.state.economy,capabilities:s.session.state.capabilities,lives:s.session.state.lifeCorpseLedger});
async function start(p:Page,file='ready.json'){
  mkdirSync(dir,{recursive:true});await p.clock.install({time:0});
  await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(resolve(dir,file),'utf8')});
  await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');await p.clock.pauseAt(60000);
}
async function action(p:Page,label:string,touch=false){
  const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});
  if(touch)await b.tap();else await b.click();
}
async function interact(p:Page,touch=false){if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');}
async function openStudy(p:Page,first=true,touch=false){await interact(p,touch);await action(p,first?'试试水槽回忆练习':'继续水槽复习',touch);}
async function prepare(p:Page,touch=false){await openStudy(p,true,touch);await action(p,'重新观察水与注音',touch);await action(p,'用水槽嵌片校准媒介',touch);}
async function exactReload(p:Page){const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);return s;}
async function walk(p:Page,x:number,touch=false){
  const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1,k=sign>0?'d':'a';
  await canvas(p).focus();let cdp;
  if(touch){cdp=await p.context().newCDPSession(p);const b=(await p.getByRole('button',{name:sign>0?'向右':'向左',exact:true}).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}
  else await p.keyboard.down(k);
  try{for(let i=0;i<120;i++){const at=await read();if(sign>0?at>=x-7:at<=x+7)return;await advance(p,100);}throw Error('walk stalled');}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.keyboard.up(k);await advance(p,500);}
}
function verify(before:any,after:any,cost:number){
  expect(resources(after)).toEqual(resources(before));expect(after.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-cost);
  expect(after.session.state.mp.maxMp).toBe(before.session.state.mp.maxMp);expect(after.physical.baselineCollected).toBe(before.physical.baselineCollected);
  expect(after.physical.practice.supplied).toBe(before.physical.practice.supplied+32);
  expect(after.physical.casts).toBe(before.physical.casts+1);const word=after.session.state.learning.words.telo;
  expect(word.learningState).toBe('grounded');const evidence=word.evidence.filter((e:any)=>e.eventType==='grounding_trial_resolved');
  expect(evidence).toHaveLength(1);expect(evidence[0]).toMatchObject({promptLevel:1,answerVisible:false,toolBypass:false,sourceObjectClass:'hermit_water_basin'});
  for(const w of ['tawa','wawa','lili','suli'])expect(after.session.state.learning.words[w]).toEqual(before.session.state.learning.words[w]);
}
test('water recall: hidden answer, explicit MP confirmation, real water arrival and exact pending restore',async({page:p})=>{
  test.setTimeout(120000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
  await prepare(p);await expect(p.locator('.ep-talk')).not.toContainText('telo');const attuned=await saved(p);
  await p.getByRole('textbox',{name:'回忆水或液体的词',exact:true}).fill('tawa');await action(p,'沿槽流向低处');
  expect((await saved(p)).session).toEqual(attuned.session);await action(p,'复看水槽注音');await expect(p.locator('.ep-talk')).toContainText('telo');
  await action(p,'收起注音，重新回忆');await expect(p.locator('.ep-talk')).not.toContainText('telo');
  await p.screenshot({path:resolve(dir,'browser-recall.png')});await p.getByRole('textbox',{name:'回忆水或液体的词',exact:true}).fill('telo');
  await action(p,'沿槽流向低处');expect((await saved(p)).session.state.mp).toEqual(before.session.state.mp);
  await exactReload(p);await openStudy(p,false);await action(p,'确认释放（2 MP）');await expect(p.locator('.ep-talk')).not.toBeVisible();
  expect((await saved(p)).session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-2);
  await advance(p,300);await expect(canvas(p)).toHaveAttribute('data-water-study','casting');const partial=await saved(p);
  await p.keyboard.press('m');await advance(p,1500);expect((await saved(p)).physical.practice).toEqual(partial.physical.practice);
  await p.getByRole('button',{name:'关闭地图',exact:true}).click();await exactReload(p);
  writeFileSync(resolve(dir,'browser-partial.json'),JSON.stringify(await saved(p)));await p.screenshot({path:resolve(dir,'browser-flowing.png')});
  await advance(p,6000);await expect(canvas(p)).toHaveAttribute('data-water-study','completed');const final=await saved(p);verify(before,final,2);
  writeFileSync(resolve(dir,'browser-completed.json'),JSON.stringify(final));await p.screenshot({path:resolve(dir,'browser-completed.png')});
  await openStudy(p,false);await expect(p.locator('.ep-talk')).toContainText('不等于熟练掌握');expect((await saved(p)).session.state).toEqual(final.session.state);
  await exactReload(p);expect(errors).toEqual([]);
});
test('touch water recall: zero MP preserves prediction, rest recovery, rotation and no duplicate charge',async({browser})=>{
  test.setTimeout(150000);const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await c.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p,'empty-mp.json');const before=await saved(p);await prepare(p,true);
    await expect(p.locator('.ep-talk')).not.toContainText('telo');const input=p.getByRole('textbox',{name:'回忆水或液体的词',exact:true}),b=(await input.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);await p.screenshot({path:resolve(dir,'touch-portrait-recall.png')});
    await input.fill('telo');await action(p,'自行流向高处',true);expect((await saved(p)).physical.waterStudy).toBeUndefined();
    await input.fill('telo');await action(p,'沿槽流向低处',true);await action(p,'确认释放（2 MP）',true);await expect(p.locator('.ep-talk')).toContainText('MP 不足');
    expect((await saved(p)).session.state.mp.currentMp).toBe(0);expect((await saved(p)).physical.practice.supplied).toBe(before.physical.practice.supplied);
    await exactReload(p);await p.setViewportSize({width:844,height:390});await walk(p,264,true);await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · 林下坐垫');
    await interact(p,true);await action(p,'继续',true);expect((await saved(p)).session.state.mp.currentMp).toBe(4);
    await walk(p,614,true);await openStudy(p,false,true);await action(p,'确认释放（2 MP）',true);await advance(p,300);
    await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();const paused=await saved(p);await advance(p,1500);
    expect((await saved(p)).physical.practice).toEqual(paused.physical.practice);await p.getByRole('button',{name:'回到旅途',exact:true}).tap();
    await exactReload(p);await advance(p,6000);await expect(canvas(p)).toHaveAttribute('data-water-study','completed');
    const final=await saved(p);verify(before,final,-2);writeFileSync(resolve(dir,'browser-touch.json'),JSON.stringify(final));
    await p.screenshot({path:resolve(dir,'touch-landscape-completed.png')});await openStudy(p,false,true);
    await action(p,'继续',true);await openStudy(p,false,true);expect((await saved(p)).session.state.mp).toEqual(final.session.state.mp);
    expect((await saved(p)).session.state.learning).toEqual(final.session.state.learning);await exactReload(p);expect(errors).toEqual([]);
  }finally{await c.close();}
});
