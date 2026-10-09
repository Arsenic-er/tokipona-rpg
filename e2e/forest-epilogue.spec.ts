import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const dir='.codex-tmp/epilogue',key='tokipona.forest-waterwheel-episode.v0.1';
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
async function walk(p:Page,x:number,label:string){
 const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1,k=sign>0?'d':'a';
 await canvas(p).focus();await p.keyboard.down(k);
 try{for(let i=0;i<180;i++){const at=await read();if(sign>0?at>=x-7:at<=x+7)break;await advance(p,100);}}
 finally{await p.keyboard.up(k);await advance(p,400);}
 await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · '+label);await p.keyboard.press('e');
}
test('seal explicitly, use the old door, report and confirm return, then freely revisit',async({page:p})=>{
 test.setTimeout(180000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
 await open(p);expect((await saved(p)).session).toEqual(before.session);await action(p,'核对本次分配与碎片记录');
 await expect(canvas(p)).toHaveAttribute('data-epilogue','reviewed');const reviewed=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(reviewed.physical);
 await p.screenshot({path:dir+'/review-desktop.png'});await action(p,'继续');await reload(p);await open(p);
 await action(p,'封存本次选择并打开旧门');await expect(canvas(p)).toHaveAttribute('data-epilogue','sealed');
 const sealed=await saved(p);expect(sealed.physical.place).toBe('order-node');expect(resources(sealed)).toEqual(resources(before));
 await action(p,'继续');await p.keyboard.press('j');await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('分配与线索已封存');
 await advance(p,800);expect((await saved(p)).physical).toEqual(sealed.physical);await p.getByRole('button',{name:'回到旅途',exact:true}).click();
 await reload(p);await open(p);await action(p,'沿旧门返回聚落');await action(p,'继续');expect((await saved(p)).physical.place).toBe('settlement');
 await expect(canvas(p)).toHaveAttribute('data-epilogue','sealed');await walk(p,344,'工务人');
 await action(p,'说明旧改道与本次取舍');await action(p,'查看回访结语');
 await expect(canvas(p)).toHaveAttribute('data-epilogue','sealed');await p.screenshot({path:dir+'/return-confirm-desktop.png'});
 await action(p,'记下回访与下一段旅程');await expect(canvas(p)).toHaveAttribute('data-epilogue','returned');
 const done=await saved(p);expect(resources(done)).toEqual(resources(before));
 expect(done.session.eventLedger.filter((e:any)=>e.type==='prologue_return_observation_committed')).toHaveLength(1);
 for(const f of ['range_trial_permission','attack_capacity_calibration_complete','first_attack_signature_available'])expect(done.session.state.world.flags['global:'+f]?.value).not.toBe(true);
 await action(p,'重读本次回访结语');expect((await saved(p)).session).toEqual(done.session);await action(p,'继续');await reload(p);
 writeFileSync(dir+'/browser-returned.json',JSON.stringify(await saved(p)));
 await expect(p.getByRole('dialog',{name:'小章节结算',exact:true})).not.toBeVisible();
 await walk(p,814,'旧门通往地下档案');expect((await saved(p)).physical.place).toBe('order-node');
 await p.screenshot({path:dir+'/door-revisit.png'});await open(p);await action(p,'沿旧门返回聚落');await action(p,'继续');
 await p.keyboard.press('m');await p.getByRole('button',{name:'世界地图',exact:true}).click();
  await expect(p.getByRole('dialog',{name:'旅途地图'})).toContainText('已开启旧门（聚落 ↔ 地下档案）');
  await p.screenshot({path:dir+'/map-after-return.png'});await p.keyboard.press('Escape');
 expect(resources(await saved(p))).toEqual(resources(before));await reload(p);expect(errors).toEqual([]);
});
test('touch review, rotation and confirmation restore without automatic rewards or return completion',async({browser})=>{
 test.setTimeout(90000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors:string[]=[];
 try{
  p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
  await open(p,true);await action(p,'核对本次分配与碎片记录',true);const b=(await p.getByRole('button',{name:'封存本次选择并打开旧门',exact:true}).boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(391);await p.screenshot({path:dir+'/touch-review.png'});
  await p.setViewportSize({width:844,height:390});await action(p,'封存本次选择并打开旧门',true);await action(p,'继续',true);await reload(p);
  await open(p,true);await action(p,'沿旧门返回聚落',true);await action(p,'继续',true);await advance(p,1000);
  await expect(canvas(p)).toHaveAttribute('data-epilogue','sealed');expect(resources(await saved(p))).toEqual(resources(before));
  await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();const paused=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(paused.physical);
  await p.screenshot({path:dir+'/touch-arrived.png'});writeFileSync(dir+'/browser-touch.json',JSON.stringify(paused));await reload(p);expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
test('existing lead and worker progress does not acquire an epilogue or formal return on load or conversation',async({page:p})=>{
 await start(p,'../site-lead/worker-ready.json');const before=await saved(p);
 await expect(canvas(p)).toHaveAttribute('data-epilogue','unvisited');await open(p);await action(p,'说明旧改道与本次取舍');
 await expect(p.getByRole('button',{name:'查看回访结语',exact:true})).not.toBeVisible();await action(p,'继续');await advance(p,600);await reload(p);
 await expect(canvas(p)).toHaveAttribute('data-epilogue','unvisited');const s=await saved(p);
 expect(s.session.state.world.flags['global:prologue_return_observed']?.value).not.toBe(true);
 expect(s.session.state.world.flags['region:valley_prologue:forest_chapter_epilogue_committed']?.value).not.toBe(true);
 expect(resources(s)).toEqual(resources(before));
});
