import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/return-channel');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const flag=(s:any,f:string)=>s.session.state.world.flags['global:forest.episode.flow.'+f]?.value===true;
async function start(p:Page,fixture='top-ready.json'){
  mkdirSync(dir,{recursive:true});await p.clock.install({time:0});
  await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(resolve(dir,fixture),'utf8')});
  await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');await p.clock.pauseAt(60000);
}
async function walk(p:Page,x:number,touch=false){
  const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1;
  const k=sign>0?'d':'a';await canvas(p).focus();let cdp;
  if(touch){cdp=await p.context().newCDPSession(p);const b=(await p.getByRole('button',{name:sign>0?'向右':'向左',exact:true}).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}
  else await p.keyboard.down(k);
  try{for(let i=0;i<190;i++){const at=await read();if(sign>0?at>=x-8:at<=x+8)return;await advance(p,100);}throw Error('walk stalled '+await read()+' -> '+x);}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.keyboard.up(k);await advance(p,500);}
}
async function use(p:Page,x:number,label:string,touch=false){
  await walk(p,x,touch);await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · '+label);
  if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');
}
async function close(p:Page){await p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:'继续',exact:true}).click();await advance(p);}
async function visible(p:Page){
  await advance(p,100);const v=await canvas(p).evaluate(c=>({x:+c.dataset.playerX!,y:+c.dataset.playerY!,cx:+c.dataset.cameraX!,cy:+c.dataset.cameraY!,w:c.width,h:c.height,aspect:innerWidth/innerHeight}));
  expect(v.x+6).toBeGreaterThanOrEqual(v.cx);expect(v.x+6).toBeLessThan(v.cx+v.w);
  expect(v.y).toBeGreaterThanOrEqual(v.cy);expect(v.y+14).toBeLessThanOrEqual(v.cy+v.h);expect(Math.abs(v.w/v.h-v.aspect)).toBeLessThan(.02);
}
function resources(s:any){return {mp:s.session.state.mp,learning:s.session.state.learning,economy:s.session.state.economy,capabilities:s.session.state.capabilities};}
test('return channel: real split flow, paused repair restore, backtracking and persistent village supply',async({page:p})=>{
  test.setTimeout(180000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);const before=await saved(p);
  await use(p,190,'沿支渠前往回流湿地');await expect(canvas(p)).toHaveAttribute('data-place','return-channel');await visible(p);
  const idle=await saved(p);expect(flag(idle,'restored')).toBe(false);
  await p.keyboard.press('m');await expect(p.locator('.atlas-surface')).toHaveAttribute('data-area','return-channel');
  const count=Number(await p.locator('.atlas-surface').getAttribute('data-discovered'));expect(count).toBeGreaterThan(0);expect(count).toBeLessThan(780);
  await p.getByRole('button',{name:'世界地图',exact:true}).click();await expect(p.locator('.atlas-landmarks')).toContainText('回流湿地检修渠');
  await p.getByRole('button',{name:'关闭地图',exact:true}).click();
  await use(p,138,'扶正溢流闸');expect(flag(await saved(p),'gate')).toBe(false);await close(p);
  await use(p,78,'回流渠检修牌');await close(p);
  await use(p,138,'扶正溢流闸');await close(p);await advance(p,4000);
  await use(p,338,'双路水量标尺');expect(flag(await saved(p),'observed')).toBe(false);
  const partial=await saved(p);await advance(p,1500);expect((await saved(p)).physical).toEqual(partial.physical);
  await p.screenshot({path:resolve(dir,'partial-leaking.png')});writeFileSync(resolve(dir,'browser-partial.json'),JSON.stringify(partial));
  await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(partial.physical);
  await use(p,202,'修补分流口密封');await close(p);await use(p,266,'清理双路导管');
  const sealed=await saved(p);await advance(p,2000);expect((await saved(p)).physical.returnFlow).toEqual(sealed.physical.returnFlow);await close(p);
  await advance(p,18000);await expect(canvas(p)).toHaveAttribute('data-return-flow','restored');await visible(p);
  await use(p,338,'双路水量标尺');expect(flag(await saved(p),'observed')).toBe(true);await close(p);
  await p.screenshot({path:resolve(dir,'restored-split-flow.png')});const restored=await saved(p);
  writeFileSync(resolve(dir,'browser-restored.json'),JSON.stringify(restored));
  expect(resources(restored)).toEqual(resources(before));expect(restored.session.state.quests.ch01_return_flow.stageId).toBe('completed');
  expect(restored.session.state.world.flags['global:prologue_return_observed']?.value).not.toBe(true);
  await use(p,456,'通向地下的旧渠口');await expect(canvas(p)).toHaveAttribute('data-place','wetland');
  await use(p,34,'返回回流检修渠');await expect(canvas(p)).toHaveAttribute('data-place','return-channel');
  await use(p,26,'返回蓄水室顶层');await expect(canvas(p)).toHaveAttribute('data-place','cistern');await visible(p);
  const water=(await saved(p)).physical.returnFlow;await use(p,266,'沿回流道返回工坊');await use(p,54,'返回聚落');
  await use(p,344,'工务人');await expect(p.locator('.ep-talk')).toContainText('公共水口');await close(p);
  const ending=p.getByRole('dialog',{name:'小章节结算'});if(await ending.isVisible())await ending.getByRole('button',{name:'继续在本地走走',exact:true}).click();
  expect((await saved(p)).physical.returnFlow).toEqual(water);await walk(p,526);
  await p.screenshot({path:resolve(dir,'village-supply.png')});const village=await saved(p);writeFileSync(resolve(dir,'browser-village.json'),JSON.stringify(village));
  expect(resources(village)).toEqual(resources(before));expect(errors).toEqual([]);
});
test('touch return channel: arbitrary repair order, orientation, persisted flow and no automatic language reward',async({browser})=>{
  test.setTimeout(150000);const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await context.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p,'entry-ready.json');const before=await saved(p);await visible(p);
    await use(p,78,'回流渠检修牌',true);await close(p);await use(p,266,'清理双路导管',true);await close(p);
    await p.setViewportSize({width:844,height:390});await visible(p);
    await use(p,202,'修补分流口密封',true);await close(p);expect(flag(await saved(p),'restored')).toBe(false);
    await use(p,138,'扶正溢流闸',true);await close(p);await advance(p,18000);
    await expect(canvas(p)).toHaveAttribute('data-return-flow','restored');await visible(p);
    await p.screenshot({path:resolve(dir,'touch-landscape.png')});
    await use(p,338,'双路水量标尺',true);await close(p);
    await p.getByRole('button',{name:'任务日志 J',exact:true}).tap();await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('地下秩序节点');
    await p.getByRole('button',{name:'回到旅途',exact:true}).tap();
    await p.keyboard.press('Escape');const final=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
    expect((await saved(p)).physical).toEqual(final.physical);expect(resources(final)).toEqual(resources(before));expect(errors).toEqual([]);
    writeFileSync(resolve(dir,'browser-touch.json'),JSON.stringify(final));
  }finally{await context.close();}
});
