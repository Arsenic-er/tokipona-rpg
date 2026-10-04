import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const key='tokipona.forest-waterwheel-episode.v0.1',dir=resolve('.codex-tmp/forest-cistern-room');
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]');
const advance=async(p:Page,ms=300)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const flag=(s:any,f:string)=>s.session.state.world.flags['global:forest.episode.room.'+f]?.value===true;
async function start(p:Page,fixture=resolve(dir,'ready.json')){
  mkdirSync(dir,{recursive:true});await p.clock.install({time:0});
  await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key,value:readFileSync(fixture,'utf8')});
  await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');await p.clock.pauseAt(60000);
}
async function walk(p:Page,x:number,touch=false){
  const read=async()=>Number(await canvas(p).getAttribute('data-player-x')),sign=await read()<x?1:-1;
  const k=sign>0?'d':'a';await canvas(p).focus();let cdp;
  if(touch){cdp=await p.context().newCDPSession(p);const b=(await p.getByRole('button',{name:sign>0?'向右':'向左',exact:true}).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}
  else await p.keyboard.down(k);
  try{for(let i=0;i<160;i++){const at=await read();if(sign>0?at>=x-8:at<=x+8)return;await advance(p,100);}throw Error('walk stalled '+await read()+' -> '+x);}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.keyboard.up(k);await advance(p,500);}
}
async function use(p:Page,label:string,touch=false){
  await expect(p.locator('[data-ep="prompt"]')).toHaveText('E · '+label);
  if(touch)await p.getByRole('button',{name:'互动',exact:true}).tap();else await p.keyboard.press('e');
}
async function close(p:Page){await p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:'继续',exact:true}).click();await advance(p);}
async function visiblePlayer(p:Page){
  // A scene interaction updates the model immediately; allow its next render frame before comparing projections.
  await advance(p,100);
  const v=await canvas(p).evaluate(c=>({x:Number(c.dataset.playerX),y:Number(c.dataset.playerY),cx:Number(c.dataset.cameraX),cy:Number(c.dataset.cameraY),w:c.width,h:c.height,aspect:innerWidth/innerHeight}));
  expect(v.x+6).toBeGreaterThanOrEqual(v.cx);expect(v.x+6).toBeLessThan(v.cx+v.w);
  expect(v.y).toBeGreaterThanOrEqual(v.cy);expect(v.y+14).toBeLessThanOrEqual(v.cy+v.h);
  expect(Math.abs(v.w/v.h-v.aspect)).toBeLessThan(.02);
}
async function climb(p:Page,label:string,x:number,touch=false){
  await walk(p,x,touch);await use(p,label,touch);await expect(canvas(p)).toHaveAttribute('data-climbing','true');
  for(let i=0;i<5;i++){await advance(p,1000);await visiblePlayer(p);}
  await expect(canvas(p)).toHaveAttribute('data-climbing','false');
}
test('vertical room: entry recovery, echo, paused ladder restore, short/default comparison, upper survey and return',async({page:p})=>{
  test.setTimeout(180000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await start(p);
  const before=await saved(p);await walk(p,964);await use(p,'通往高位蓄水室');
  await expect(canvas(p)).toHaveAttribute('data-place','cistern');await visiblePlayer(p);
  const entry=await saved(p);expect(flag(entry,'entered')).toBe(true);expect(entry.session.state.mp.currentMp).toBeGreaterThanOrEqual(before.session.state.mp.currentMp);
  await walk(p,164);await use(p,'入口回声');const demonstration=await saved(p);
  await advance(p,1500);expect((await saved(p)).physical.echoAge).toBe(demonstration.physical.echoAge);
  await close(p);await advance(p,3500);expect((await saved(p)).session.state.mp).toEqual(entry.session.state.mp);
  await p.screenshot({path:resolve(dir,'room-entry-echo.png')});
  await walk(p,410);await use(p,'攀上东侧检修梯');await advance(p,1300);await visiblePlayer(p);
  await p.keyboard.press('Escape');const paused=await saved(p);await advance(p,1500);expect((await saved(p)).physical).toEqual(paused.physical);
  await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(paused.physical);
  await advance(p,4000);await visiblePlayer(p);await expect(canvas(p)).toHaveAttribute('data-climbing','false');
  await walk(p,318);await use(p,'双层校准阀');
  const input=p.getByRole('textbox',{name:'输入引水表达'}),preview=p.getByRole('button',{name:'预览形态'}),confirm=p.getByRole('button',{name:'确认释放'});
  await input.fill('telo suli');await preview.click();await expect(confirm).toBeDisabled();
  await input.fill('  TELO   LILI  ');await preview.click();await expect(confirm).toBeEnabled();await p.screenshot({path:resolve(dir,'room-short-preview.png')});
  await expect(p.locator('[data-window="preview"]')).toContainText('近端回收槽');
  const mp=(await saved(p)).session.state.mp.currentMp;await confirm.click();await close(p);await advance(p,3500);
  expect(flag(await saved(p),'valve_filled')).toBe(false);expect((await saved(p)).session.state.mp.currentMp).toBe(mp-6);
  expect((await saved(p)).physical.calibration.version).toBe(2);
  await p.screenshot({path:resolve(dir,'room-short-recovery.png')});
  await use(p,'双层校准阀');await input.fill('telo');await preview.click();await expect(confirm).toBeEnabled();
  await confirm.click();await close(p);await advance(p,3500);const filled=await saved(p);
  expect(flag(filled,'valve_filled')).toBe(true);expect(filled.session.state.mp.currentMp).toBe(mp-11);
  expect(filled.physical.calibration.version).toBe(2);
  await p.screenshot({path:resolve(dir,'room-valve-open.png')});writeFileSync(resolve(dir,'browser-valve.json'),JSON.stringify(filled));
  await climb(p,'攀上西侧检修梯',50);await walk(p,344);await use(p,'高位虹吸与停靠台');await close(p);
  expect(flag(await saved(p),'upper_seen')).toBe(true);await visiblePlayer(p);await p.screenshot({path:resolve(dir,'room-upper-survey.png')});
  await p.keyboard.press('j');await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('没有授予额外词语掌握');await p.getByRole('button',{name:'回到旅途',exact:true}).click();
  const final=await saved(p);writeFileSync(resolve(dir,'browser-upper.json'),JSON.stringify(final));
  await climb(p,'返回校准层',108);await climb(p,'下到入口层',366);await walk(p,52);await use(p,'返回检修入口');
  await expect(canvas(p)).toHaveAttribute('data-place','cistern-entry');await walk(p,964);await use(p,'通往高位蓄水室');
  expect((await saved(p)).session.state.mp).toEqual(final.session.state.mp);
  expect((await saved(p)).session.state.learning).toEqual(before.session.state.learning);
  expect((await saved(p)).session.state.economy).toEqual(before.session.state.economy);expect(errors).toEqual([]);
});
test('touch route: finite water bypass, rotating vertical camera, local fog and world map',async({browser})=>{
  test.setTimeout(180000);
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p);await walk(p,964,true);await use(p,'通往高位蓄水室',true);await visiblePlayer(p);const entry=await saved(p);
    await p.getByRole('button',{name:'查看地图（M）'}).tap();await p.screenshot({path:resolve(dir,'phone-undiscovered-map.png')});
    await p.getByRole('button',{name:'世界地图',exact:true}).tap();await expect(p.locator('.atlas-landmarks')).toContainText('高位蓄水室');
    await p.getByRole('button',{name:'关闭地图',exact:true}).tap();
    await climb(p,'攀上东侧检修梯',410,true);
    await p.setViewportSize({width:844,height:390});await advance(p,1000);await visiblePlayer(p);
    await walk(p,318,true);await use(p,'双层校准阀',true);await p.getByRole('button',{name:'先看看周围',exact:true}).tap();
    await walk(p,174,true);await use(p,'校准阀导槽',true);await close(p);await advance(p,3500);
    const tool=await saved(p);expect(flag(tool,'valve_filled')).toBe(true);expect(tool.physical.calibration.events).toEqual([{at:0,kind:'tool'}]);
    for(const k of ['mp','learning','economy','capabilities'])expect(tool.session.state[k]).toEqual(entry.session.state[k]);
    await p.screenshot({path:resolve(dir,'phone-valve-tool.png')});writeFileSync(resolve(dir,'browser-tool.json'),JSON.stringify(tool));
    await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(tool.physical);
    await climb(p,'攀上西侧检修梯',50,true);await p.setViewportSize({width:390,height:844});await advance(p,1000);await visiblePlayer(p);
    await p.getByRole('button',{name:'查看地图（M）'}).tap();await p.screenshot({path:resolve(dir,'phone-explored-map.png')});
    await p.getByRole('button',{name:'世界地图',exact:true}).tap();await p.screenshot({path:resolve(dir,'phone-world-map.png')});await p.getByRole('button',{name:'关闭地图',exact:true}).tap();
    await climb(p,'返回校准层',108,true);await climb(p,'下到入口层',366,true);await walk(p,52,true);await use(p,'返回检修入口',true);
    expect((await saved(p)).physical.place).toBe('cistern-entry');expect(errors).toEqual([]);
  }finally{await ctx.close();}
});

const siphonDir=resolve('.codex-tmp/cistern-siphon');
test('high siphon: support gate, default distance failure, long cast, mid-water reload and safe return',async({page:p})=>{
  test.setTimeout(180000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await start(p,resolve(siphonDir,'upper-ready.json'));const before=await saved(p);await visiblePlayer(p);
  await walk(p,222);await use(p,'虹吸引水锚点');
  const input=p.getByRole('textbox',{name:'输入引水表达'}),preview=p.getByRole('button',{name:'预览形态'}),confirm=p.getByRole('button',{name:'确认释放'});
  await input.fill('telo suli');await preview.click();await expect(confirm).toBeDisabled();
  await expect(p.locator('[data-window="preview"]')).toContainText('0.65');
  expect((await saved(p)).session.state.mp).toEqual(before.session.state.mp);
  await input.fill('telo');await preview.click();await expect(confirm).toBeEnabled();await confirm.click();await close(p);await advance(p,3500);
  expect(flag(await saved(p),'siphon_primed')).toBe(false);
  await p.screenshot({path:resolve(siphonDir,'default-recovery.png')});
  await walk(p,156);await use(p,'修复西侧支撑肋');await close(p);
  await walk(p,222);await use(p,'虹吸引水锚点');await input.fill('telo suli');await preview.click();await expect(confirm).toBeEnabled();
  await expect(p.locator('[data-window="preview"]')).toContainText('需要 10 MP');await expect(p.locator('[data-window="preview"]')).toContainText('0.75');
  await p.screenshot({path:resolve(siphonDir,'long-preview.png')});await confirm.click();
  // Close without advancing three seconds; save real falling water, not a fabricated scene flag.
  await p.getByRole('dialog',{name:'人物对话',exact:true}).getByRole('button',{name:'继续',exact:true}).click();
  await advance(p,100);await p.keyboard.press('Escape');const falling=await saved(p);
  expect(falling.physical.siphon.age-falling.physical.siphon.events.at(-1).at).toBeLessThan(180);
  await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
  expect((await saved(p)).physical).toEqual(falling.physical);await advance(p,3500);
  const primed=await saved(p);expect(flag(primed,'siphon_primed')).toBe(true);
  expect(primed.session.state.mp.currentMp).toBe(before.session.state.mp.currentMp-15);
  expect(primed.physical.siphon.events).toHaveLength(2);
  for(const k of ['learning','economy','capabilities'])expect(primed.session.state[k]).toEqual(before.session.state[k]);
  await visiblePlayer(p);await p.screenshot({path:resolve(siphonDir,'long-primed.png')});
  writeFileSync(resolve(siphonDir,'browser-long.json'),JSON.stringify(primed));
  await p.keyboard.press('j');await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('虹吸已通水');
  await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('右侧下站可启用水力升降机');
  await p.getByRole('button',{name:'回到旅途',exact:true}).click();
  await walk(p,408);await use(p,'虹吸手动导水柄');await close(p);
  expect((await saved(p)).physical.siphon.events).toHaveLength(2);expect(flag(await saved(p),'siphon_tool')).toBe(false);
  await climb(p,'返回校准层',108);await climb(p,'下到入口层',366);await walk(p,52);await use(p,'返回检修入口');
  expect((await saved(p)).physical.place).toBe('cistern-entry');expect(errors).toEqual([]);
});
test('high siphon touch: finite manual water, no support/MP cost and portrait/landscape restore',async({browser})=>{
  test.setTimeout(180000);
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p,resolve(siphonDir,'upper-ready.json'));const before=await saved(p);
    await walk(p,408,true);await use(p,'虹吸手动导水柄',true);await close(p);await advance(p,3500);
    const primed=await saved(p);expect(flag(primed,'siphon_primed')).toBe(true);expect(flag(primed,'siphon_left')).toBe(false);expect(flag(primed,'siphon_right')).toBe(false);
    expect(primed.physical.siphon.events).toEqual([{at:0,kind:'tool'}]);
    for(const k of ['mp','learning','economy','capabilities'])expect(primed.session.state[k]).toEqual(before.session.state[k]);
    await visiblePlayer(p);await p.screenshot({path:resolve(siphonDir,'touch-tool-portrait.png')});
    const rendered=await saved(p);
    await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(rendered.physical);
    await p.setViewportSize({width:844,height:390});await advance(p,1000);await visiblePlayer(p);
    await p.screenshot({path:resolve(siphonDir,'touch-tool-landscape.png')});writeFileSync(resolve(siphonDir,'browser-tool.json'),JSON.stringify(await saved(p)));
    await climb(p,'返回校准层',108,true);await climb(p,'下到入口层',366,true);await walk(p,52,true);await use(p,'返回检修入口',true);
    expect((await saved(p)).physical.place).toBe('cistern-entry');expect(errors).toEqual([]);
  }finally{await ctx.close();}
});

const liftDir=resolve('.codex-tmp/cistern-lift');
async function rideLift(p:Page,up:boolean,touch=false){
  await walk(p,up?460:370,touch);await use(p,up?'水力升降机下站':'水力升降机上站',touch);
  await expect(canvas(p)).toHaveAttribute('data-riding-lift','true');
  for(let i=0;i<6;i++){await advance(p,1000);await visiblePlayer(p);}
  await expect(canvas(p)).toHaveAttribute('data-lift','idle');await expect(canvas(p)).toHaveAttribute('data-riding-lift','false');
}
test('lift desktop: paused moving save, top crank, reciprocal shortcut and unchanged rewards',async({page:p})=>{
  test.setTimeout(180000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await start(p,resolve(liftDir,'ready.json'));const before=await saved(p);
  await walk(p,460);await use(p,'水力升降机下站');await advance(p,1500);await visiblePlayer(p);
  await expect(canvas(p)).toHaveAttribute('data-lift','ride');await p.keyboard.press('Escape');
  const riding=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(riding.physical);
  writeFileSync(resolve(liftDir,'browser-riding.json'),JSON.stringify(riding));
  await p.screenshot({path:resolve(liftDir,'paused-riding.png')});
  await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(riding.physical);
  await advance(p,4500);await visiblePlayer(p);expect(flag(await saved(p),'lift_arrived')).toBe(true);
  await expect(canvas(p)).toHaveAttribute('data-player-y','114.00');await p.screenshot({path:resolve(liftDir,'top-landing.png')});
  await walk(p,266);await use(p,'沿回流道返回工坊');
  await expect(p.getByRole('dialog',{name:'人物对话',exact:true})).toContainText('左边绞盘');await close(p);
  await walk(p,94);await use(p,'回流道捷径绞盘');await close(p);
  expect(flag(await saved(p),'return_open')).toBe(true);
  await walk(p,266);await use(p,'沿回流道返回工坊');await advance(p,100);await expect(canvas(p)).toHaveAttribute('data-place','mill');
  await p.screenshot({path:resolve(liftDir,'mill-shortcut.png')});
  await p.getByRole('button',{name:'查看地图（M）'}).click();await p.getByRole('button',{name:'世界地图',exact:true}).click();
  await expect(p.locator('.atlas-landmarks')).toContainText('回流道永久梯');await p.screenshot({path:resolve(liftDir,'world-shortcut.png')});await p.getByRole('button',{name:'关闭地图',exact:true}).click();
  await use(p,'回流道永久梯');await advance(p,100);await expect(canvas(p)).toHaveAttribute('data-place','cistern');
  await expect(canvas(p)).toHaveAttribute('data-player-y','114.00');await rideLift(p,false);await rideLift(p,true);
  await walk(p,266);await use(p,'沿回流道返回工坊');await walk(p,54);await use(p,'返回聚落');await advance(p,100);
  await walk(p,344);await use(p,'工务人');await close(p);
  const final=await saved(p);expect(flag(final,'reported')).toBe(true);
  for(const k of ['mp','learning','economy','capabilities'])expect(final.session.state[k]).toEqual(before.session.state[k]);
  writeFileSync(resolve(liftDir,'browser-reported.json'),JSON.stringify(final));expect(errors).toEqual([]);
});
test('lift touch: old ladders, empty recall from the shortcut, rotation and no extra MP',async({browser})=>{
  test.setTimeout(180000);
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  try{
    await start(p,resolve(liftDir,'ready.json'));const before=await saved(p);await rideLift(p,true,true);
    await walk(p,94,true);await use(p,'回流道捷径绞盘',true);await close(p);
    await p.setViewportSize({width:844,height:390});await advance(p,1000);await visiblePlayer(p);
    await rideLift(p,false,true);await climb(p,'返回校准层',108,true);await climb(p,'下到入口层',366,true);
    await walk(p,52,true);await use(p,'返回检修入口',true);await walk(p,54,true);await use(p,'返回工坊',true);
    await walk(p,806,true);await use(p,'回流道永久梯',true);await advance(p,100);await visiblePlayer(p);
    await walk(p,370,true);await use(p,'水力升降机上站',true);expect((await saved(p)).physical.lift.mode).toBe('call');
    await close(p);await advance(p,3800);await expect(canvas(p)).toHaveAttribute('data-lift','idle');
    await p.setViewportSize({width:390,height:844});await advance(p,1000);await visiblePlayer(p);
    await p.screenshot({path:resolve(liftDir,'touch-recalled.png')});
    const recalled=await saved(p);writeFileSync(resolve(liftDir,'browser-recalled.json'),JSON.stringify(recalled));
    await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');expect((await saved(p)).physical).toEqual(recalled.physical);
    await rideLift(p,false,true);expect((await saved(p)).physical.player.y).toBe(338);
    for(const k of ['mp','learning','economy','capabilities'])expect((await saved(p)).session.state[k]).toEqual(before.session.state[k]);
    expect(errors).toEqual([]);
  }finally{await ctx.close();}
});
