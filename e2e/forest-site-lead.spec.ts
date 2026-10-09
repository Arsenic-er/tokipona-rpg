import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const dir='.codex-tmp/site-lead',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const resources=(s:any)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,s.session.state[k]]));
async function start(p:Page,file='ready.json'){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(dir+'/'+file,'utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function open(p:Page,touch=false){if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');}
async function action(p:Page,label:string,touch=false){const b=p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:label,exact:true});if(touch)await b.tap();else await b.click();}
async function reload(p:Page){const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);}
async function use(p:Page,x:number,label:string){
 const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1,k=sign>0?'d':'a';
 await canvas(p).focus();await p.keyboard.down(k);
 try{for(let i=0;i<180;i++){const at=await read();if(sign>0?at>=x-7:at<=x+7)break;await advance(p,100);}}
 finally{await p.keyboard.up(k);await advance(p,400);}
 await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · '+label);await p.keyboard.press('e');
}
test('site directions: inspect, explicitly record, reread history, return and discuss without rewards',async({page:p})=>{
 test.setTimeout(210000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
 await open(p);expect((await saved(p)).session).toEqual(before.session);
 await action(p,'重读旱季改道记录');await expect(p.locator('.ep-talk')).toContainText('隐去了改渠记录');expect((await saved(p)).session).toEqual(before.session);
 await action(p,'查看同步后的位点索引');await expect(canvas(p)).toHaveAttribute('data-lead','inspected');
 const inspected=await saved(p);await advance(p,1500);expect((await saved(p)).physical).toEqual(inspected.physical);await reload(p);
 await open(p);await p.screenshot({path:dir+'/inspect-desktop.png'});await action(p,'记下残缺方向与配水取舍');
 await expect(canvas(p)).toHaveAttribute('data-lead','recorded');const recorded=await saved(p);expect(resources(recorded)).toEqual(resources(before));
 writeFileSync(dir+'/browser-recorded.json',JSON.stringify(recorded));
 await action(p,'重读旱季改道记录');await action(p,'查看同步后的位点索引');expect((await saved(p)).session).toEqual(recorded.session);await action(p,'继续');
 await p.keyboard.press('j');await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('不是能够直接抵达的坐标');
 await advance(p,1000);expect((await saved(p)).physical).toEqual(recorded.physical);await p.screenshot({path:dir+'/journal-desktop.png'});
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await reload(p);
 for(const [x,label] of [[26,'返回湿地浅滩'],[34,'返回回流检修渠'],[26,'返回蓄水室顶层'],[266,'沿回流道返回工坊'],[54,'返回聚落'],[344,'工务人']] as const)await use(p,x,label);
 await expect(canvas(p)).toHaveAttribute('data-lead-worker','false');await action(p,'说明旧改道与本次取舍');await expect(canvas(p)).toHaveAttribute('data-lead-worker','true');
 await expect(p.locator('.ep-talk')).toContainText('分时取水牌');await p.screenshot({path:dir+'/worker-desktop.png'});await action(p,'继续');
 await expect(p.getByRole('dialog',{name:'小章节结算',exact:true})).not.toBeVisible();
 await use(p,54,'西侧林间小径');await use(p,404,'隐士');await action(p,'请隐士解读位点记录');
 await expect(canvas(p)).toHaveAttribute('data-lead-hermit','true');await expect(p.locator('.ep-talk')).toContainText('我不知道');
 const discussed=await saved(p);await action(p,'再谈远方位点');expect((await saved(p)).session).toEqual(discussed.session);
 expect(resources(discussed)).toEqual(resources(before));
 for(const flag of ['forest_chapter_epilogue_committed','prologue_return_observed','first_attack_signature_available'])
  for(const prefix of ['global:','region:valley_prologue:'])expect(discussed.session.state.world.flags[prefix+flag]?.value).not.toBe(true);
 writeFileSync(dir+'/browser-discussed.json',JSON.stringify(discussed));await p.screenshot({path:dir+'/hermit-desktop.png'});await reload(p);expect(errors).toEqual([]);
});
test('touch directions: portrait inspection, rotate, record once and paused journal restore',async({browser})=>{
 test.setTimeout(90000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors:string[]=[];
 try{
  p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);await open(p,true);await action(p,'查看同步后的位点索引',true);
  const b=(await p.getByRole('button',{name:'记下残缺方向与配水取舍',exact:true}).boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);
  await p.screenshot({path:dir+'/touch-inspected.png'});await p.setViewportSize({width:844,height:390});await action(p,'记下残缺方向与配水取舍',true);await action(p,'继续',true);
  await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();const done=await saved(p);await advance(p,2000);expect((await saved(p)).physical).toEqual(done.physical);
  expect(resources(done)).toEqual(resources(before));writeFileSync(dir+'/browser-touch.json',JSON.stringify(done));
  await p.screenshot({path:dir+'/touch-journal.png'});await reload(p);await open(p,true);await expect(p.locator('.ep-talk')).toContainText('已把残缺方向');
  expect((await saved(p)).session).toEqual(done.session);expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
test('old practice remains accessible after the new hermit conversation',async({page:p})=>{
 await start(p,'hermit-ready.json');const before=await saved(p);await open(p);await action(p,'请隐士解读位点记录');
 const discussed=await saved(p);await action(p,'继续原来的两词校准');expect(resources(await saved(p))).toEqual(resources(before));
 expect((await saved(p)).session).toEqual(discussed.session);
 await expect(p.locator('.ep-talk')).not.toContainText('这不是一张完整的地图');await action(p,'继续');await open(p);
 await expect(p.getByRole('button',{name:'再谈远方位点',exact:true})).toBeVisible();await reload(p);
});
