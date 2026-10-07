import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/force-study');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const resources=(s:any)=>({mp:s.session.state.mp,economy:s.session.state.economy,capabilities:s.session.state.capabilities,lives:s.session.state.lifeCorpseLedger});
async function start(p:Page){
  mkdirSync(dir,{recursive:true});await p.clock.install({time:0});
  await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(resolve(dir,'ready.json'),'utf8')});
  await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');await p.clock.pauseAt(60000);
}
async function approach(p:Page,touch=false){
  await canvas(p).focus();let cdp;
  if(touch){cdp=await p.context().newCDPSession(p);const b=(await p.getByRole('button',{name:'向右',exact:true}).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}
  else await p.keyboard.down('d');
  try{for(let i=0;i<50;i++){if(Number(await canvas(p).getAttribute('data-player-x'))>=395)break;await advance(p,100);}}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.keyboard.up('d');await advance(p,500);}
  await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · 聚落供水口与湿地出水口');
}
async function use(p:Page,touch=false){
  if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');
}
async function action(p:Page,label:string,touch=false){
  const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});
  if(touch)await b.tap();else await b.click();
}
async function openStudy(p:Page,first=false,touch=false){
  await use(p,touch);await action(p,first?'观察旁侧测力器':'查看测力器记录',touch);
}
async function restoreExact(p:Page){
  const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
  const r=await saved(p);expect(r.physical).toEqual(s.physical);expect(r.session).toEqual(s.session);return r;
}
function verify(before:any,after:any){
  expect(resources(after)).toEqual(resources(before));
  for(const w of ['telo','tawa','lili','suli'])expect(after.session.state.learning.words[w]).toEqual(before.session.state.learning.words[w]);
  const word=after.session.state.learning.words.wawa;expect(word.learningState).toBe('grounded');
  const evidence=word.evidence.filter((e:any)=>e.eventType==='grounding_trial_resolved');
  expect(evidence).toHaveLength(1);expect(evidence[0]).toMatchObject({promptLevel:1,sourceObjectClass:'inert_return_flow_mechanism',answerVisible:false,toolBypass:false});
  for(const f of ['prologue_return_observed','first_attack_signature_available','forest_site_synchronized','forest_water_allocation_committed','forest_chapter_epilogue_committed'])
    for(const scope of ['global:','region:valley_prologue:'])expect(after.session.state.world.flags[scope+f]?.value).not.toBe(true);
}
test('force study: actual loading, paused restore, hidden answer, prediction then H1 evidence',async({page:p})=>{
  test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
  await approach(p);await openStudy(p,true);expect((await saved(p)).session.state.learning).toEqual(before.session.state.learning);
  await action(p,'观察两档加载');await expect(p.locator('.ep-talk')).not.toBeVisible();await advance(p,700);
  const partial=await saved(p);expect(partial.physical.forceStudy.age).toBeGreaterThan(0);expect(partial.physical.forceStudy.age).toBeLessThan(240);
  await p.keyboard.press('m');await advance(p,1500);expect((await saved(p)).physical.forceStudy).toEqual(partial.physical.forceStudy);
  await p.getByRole('button',{name:'关闭地图',exact:true}).click();await restoreExact(p);
  await p.screenshot({path:resolve(dir,'browser-partial.png')});writeFileSync(resolve(dir,'browser-partial.json'),JSON.stringify(await saved(p)));
  await advance(p,5000);await openStudy(p);await expect(p.locator('.ep-talk')).toContainText('wawa');
  expect((await saved(p)).session.state.learning.words.wawa.attunementState).toBe('locked');
  await action(p,'用现场嵌片校准媒介');await action(p,'开始回忆与预测');await expect(p.locator('.ep-talk')).not.toContainText('wawa');
  const attuned=await saved(p);await p.getByRole('textbox',{name:'回忆刚才的词',exact:true}).fill('telo');
  await action(p,'预测偏移增大');expect((await saved(p)).session.state.learning).toEqual(attuned.session.state.learning);
  await action(p,'复看提示');await expect(p.locator('.ep-talk')).toContainText('wawa');await action(p,'收起提示，重新预测');
  await expect(p.locator('.ep-talk')).not.toContainText('wawa');await p.screenshot({path:resolve(dir,'browser-recall.png')});
  await p.getByRole('textbox',{name:'回忆刚才的词',exact:true}).fill('wawa');await action(p,'预测偏移增大');
  await expect(p.locator('.ep-talk')).not.toBeVisible();expect((await saved(p)).physical.forceStudy).toEqual({version:1,run:'trial',age:0});
  await advance(p,600);expect((await saved(p)).session.state.learning.words.wawa.learningState).not.toBe('grounded');await restoreExact(p);
  await advance(p,3000);await expect(canvas(p)).toHaveAttribute('data-force-study','completed');
  const final=await saved(p);verify(before,final);writeFileSync(resolve(dir,'browser-completed.json'),JSON.stringify(final));
  await p.screenshot({path:resolve(dir,'browser-completed.png')});await openStudy(p);await expect(p.locator('.ep-talk')).toContainText('不等于熟练掌握');
  expect((await saved(p)).session.state.learning).toEqual(final.session.state.learning);await restoreExact(p);expect(errors).toEqual([]);
});
test('touch force study: portrait recall, rotation, journal pause and persisted evidence without rewards',async({browser})=>{
  test.setTimeout(150000);const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await c.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p);const before=await saved(p);await approach(p,true);await openStudy(p,true,true);await action(p,'观察两档加载',true);
    await advance(p,800);await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();const paused=await saved(p);
    await advance(p,1000);expect((await saved(p)).physical.forceStudy).toEqual(paused.physical.forceStudy);
    await p.getByRole('button',{name:'回到旅途',exact:true}).tap();await advance(p,5000);await openStudy(p,false,true);
    await action(p,'用现场嵌片校准媒介',true);await action(p,'开始回忆与预测',true);
    await expect(p.locator('.ep-talk')).not.toContainText('wawa');
    const input=p.getByRole('textbox',{name:'回忆刚才的词',exact:true});const b=(await input.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);
    await p.screenshot({path:resolve(dir,'touch-portrait-recall.png')});await input.fill('wawa');await action(p,'预测方向反转',true);
    expect((await saved(p)).session.state.learning.words.wawa.learningState).not.toBe('grounded');
    await p.setViewportSize({width:844,height:390});await input.fill('wawa');await action(p,'预测偏移增大',true);
    await advance(p,600);await restoreExact(p);await advance(p,3000);await expect(canvas(p)).toHaveAttribute('data-force-study','completed');
    await p.screenshot({path:resolve(dir,'touch-landscape-completed.png')});const final=await saved(p);verify(before,final);
    writeFileSync(resolve(dir,'browser-touch.json'),JSON.stringify(final));await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();
    await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('wawa：已有场景理解证据');
    await p.getByRole('button',{name:'回到旅途',exact:true}).tap();await restoreExact(p);expect(errors).toEqual([]);
  }finally{await c.close();}
});
