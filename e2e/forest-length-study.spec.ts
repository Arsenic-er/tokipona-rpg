import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/length-study');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
async function start(p:Page,file='ready.json'){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(resolve(dir,file),'utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function action(p:Page,label:string,touch=false){
 const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});
 if(touch)await b.tap();else await b.click();
}
async function select(p:Page,w:'lili'|'suli',touch=false){
 if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');
 await action(p,'查看旁侧尺度复习槽',touch);await action(p,w==='lili'?'观察短接水槽':'观察远端接水槽',touch);
}
async function reload(p:Page){const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);return s;}
function verify(before:any,after:any,words:('lili'|'suli')[],cost:number){
 for(const k of ['economy','capabilities','lifeCorpseLedger'])expect(after.session.state[k]).toEqual(before.session.state[k]);
 expect(after.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-cost);expect(after.session.state.mp.maxMp).toBe(before.session.state.mp.maxMp);
 for(const w of ['telo','tawa','wawa'])expect(after.session.state.learning.words[w]).toEqual(before.session.state.learning.words[w]);
 for(const w of words){
  const word=after.session.state.learning.words[w];expect(word.learningState).toBe('grounded');
  const e=word.evidence.filter((e:any)=>e.eventType==='grounding_trial_resolved');expect(e).toHaveLength(1);
  expect(e[0]).toMatchObject({promptLevel:1,answerVisible:false,toolBypass:false,worldOutcomeContribution:true});
 }
 for(const k of ['window','calibration','siphon','echoAge','mill','practice'])expect(after.physical[k]).toEqual(before.physical[k]);
}
test('length studies: hidden expression, paid short and supported long water, pending restore and preserved old route',async({page:p})=>{
 test.setTimeout(150000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
 for(const w of ['lili','suli'] as const){
  await select(p,w);await action(p,'用槽边嵌片调谐');await expect(p.locator('.ep-talk')).not.toContainText(w);
  const attuned=await saved(p),input=p.getByRole('textbox',{name:'回忆尺度表达',exact:true});
  await input.fill(w);await action(p,w==='lili'?'落入挡板前的接水杯':'接触远端水舌并引水');
  expect((await saved(p)).session).toEqual(attuned.session);
  await input.fill('telo '+w);await action(p,'只改变冲击威力');expect((await saved(p)).session).toEqual(attuned.session);
  await action(p,'复看尺度注音');await expect(p.locator('.ep-talk')).toContainText('telo '+w);
  await action(p,'收起注音，重新表达');await expect(p.locator('.ep-talk')).not.toContainText(w);
  await p.screenshot({path:resolve(dir,'browser-recall-'+w+'.png')});
  await input.fill('telo '+w);await action(p,w==='lili'?'落入挡板前的接水杯':'接触远端水舌并引水');
  expect((await saved(p)).session.state.mp).toEqual(attuned.session.state.mp);
  await expect(p.getByRole('button',{name:'确认复习槽释放',exact:true})).toBeDisabled();await action(p,'预览复习槽形态');
  if(w==='suli'){
   await expect(p.getByRole('button',{name:'确认复习槽释放',exact:true})).toBeDisabled();await expect(p.locator('[data-length="preview"]')).toContainText('支撑');
   await action(p,'固定复习槽支撑');await action(p,'预览复习槽形态');
  }
  await expect(p.locator('[data-length="preview"]')).toContainText(w==='lili'?'需要 6 MP':'需要 10 MP');
  await p.screenshot({path:resolve(dir,'browser-preview-'+w+'.png')});await action(p,'确认复习槽释放');
  await expect(p.locator('.ep-talk')).not.toBeVisible();await advance(p,100);await expect(canvas(p)).toHaveAttribute('data-'+w+'-study','cast');
  const partial=await saved(p);await p.keyboard.press('m');await advance(p,1000);
  expect((await saved(p)).physical.lengthStudy).toEqual(partial.physical.lengthStudy);
  await p.getByRole('button',{name:'关闭地图',exact:true}).click();await reload(p);
  writeFileSync(resolve(dir,'browser-partial-'+w+'.json'),JSON.stringify(await saved(p)));
  await p.screenshot({path:resolve(dir,'browser-flow-'+w+'.png')});await advance(p,4000);
  await expect(canvas(p)).toHaveAttribute('data-'+w+'-study','completed');await reload(p);
 }
 const done=await saved(p);verify(before,done,['lili','suli'],16);writeFileSync(resolve(dir,'browser-completed.json'),JSON.stringify(done));
 await p.screenshot({path:resolve(dir,'browser-completed.png')});await select(p,'suli');await expect(p.locator('.ep-talk')).toContainText('一次');
 expect((await saved(p)).session).toEqual(done.session);await reload(p);expect(errors).toEqual([]);
});
test('touch long study: portrait recall, support, rotation, journal and hidden basin pause',async({browser})=>{
 test.setTimeout(120000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors:string[]=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await start(p);const before=await saved(p);await select(p,'suli',true);await action(p,'用槽边嵌片调谐',true);
  const input=p.getByRole('textbox',{name:'回忆尺度表达',exact:true}),b=(await input.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);await p.screenshot({path:resolve(dir,'touch-portrait.png')});
  await input.fill('ＴＥＬＯ   ＳＵＬＩ');await action(p,'接触远端水舌并引水',true);await action(p,'固定复习槽支撑',true);
  await action(p,'预览复习槽形态',true);await action(p,'确认复习槽释放',true);await advance(p,100);
  await p.setViewportSize({width:844,height:390});await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();
  const paused=await saved(p);await advance(p,1500);expect((await saved(p)).physical.lengthStudy).toEqual(paused.physical.lengthStudy);
  await p.getByRole('button',{name:'回到旅途',exact:true}).tap();await reload(p);
  await p.getByRole('button',{name:'互动',exact:true}).tap();await action(p,'查看旁侧尺度复习槽',true);await action(p,'回看默认回声',true);
  const hidden=await saved(p);await advance(p,2000);expect((await saved(p)).physical.lengthStudy).toEqual(hidden.physical.lengthStudy);
  await reload(p);await select(p,'suli',true);await action(p,'继续',true);await advance(p,4000);
  await expect(canvas(p)).toHaveAttribute('data-suli-study','completed');const done=await saved(p);verify(before,done,['suli'],10);
  expect(done.session.state.learning.words.lili).toEqual(before.session.state.learning.words.lili);
  writeFileSync(resolve(dir,'browser-touch.json'),JSON.stringify(done));await p.screenshot({path:resolve(dir,'touch-landscape.png')});await reload(p);expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
test('blocked length previews retain prediction without spending MP or granting capacity',async({browser})=>{
 test.setTimeout(90000);
 for(const [file,w,reason] of [['low-mp','suli','MP 不足'],['one-word','lili','两词']] as const){
  const ctx=await browser.newContext(),p=await ctx.newPage();try{
   await start(p,file+'.json');const before=await saved(p);await select(p,w);await action(p,'用槽边嵌片调谐');
   await p.getByRole('textbox',{name:'回忆尺度表达',exact:true}).fill('telo '+w);
   await action(p,w==='lili'?'落入挡板前的接水杯':'接触远端水舌并引水');if(w==='suli')await action(p,'固定复习槽支撑');
   await action(p,'预览复习槽形态');await expect(p.locator('[data-length="preview"]')).toContainText(reason);
   await expect(p.getByRole('button',{name:'确认复习槽释放',exact:true})).toBeDisabled();
   const after=await saved(p);expect(after.session.state.mp).toEqual(before.session.state.mp);expect(after.session.state.capabilities).toEqual(before.session.state.capabilities);
   expect(after.physical.lengthStudy[w]).toBeUndefined();await reload(p);
   writeFileSync(resolve(dir,'browser-blocked-'+file+'.json'),JSON.stringify(after));await p.screenshot({path:resolve(dir,'browser-blocked-'+file+'.png')});
  }finally{await ctx.close();}
 }
});
