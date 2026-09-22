import { expect, test, type Page } from '@playwright/test';
import type { ForestCreekSave } from '../src/world/forest-opening-creek';
import { writeFileSync } from 'node:fs';

const KEY='tokipona.forest-opening.vertical-slice.v0.1';
type Save={spatial:{spatial:{tick:number;player:{x:number;y:number;grounded:boolean;velocityX:number;velocityY:number}};
  obstacle:{committedSolutionId:string|null;creek:ForestCreekSave;routeProof:unknown}},
  session:{state:{mp:unknown;learning:unknown;capabilities:unknown;receiptIndex:Record<string,unknown>};eventLedger:unknown[]}};
const state=async(page:Page):Promise<Save>=>page.evaluate(key=>{
  window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(key)!);
},KEY);
async function ticks(page:Page,count:number) {
  for(let i=0;i<count;i++) await page.clock.fastForward(100);
}
async function start(page:Page) {
  await page.clock.install({time:0});
  await page.goto('/chapter-one.html');
  await expect(page.getByRole('button',{name:'旅途笔记（J）'})).toBeVisible();
  await page.clock.pauseAt(60000);
  await page.locator('canvas[data-surface="game"]').focus();
  expect((await state(page)).spatial.obstacle.creek.schema).toBe('tokipona.forest-creek.v0.3');
}
async function move(page:Page,target:number,touch=false) {
  const cdp=touch?await page.context().newCDPSession(page):null;
  const points=touch?await Promise.all(['向右','跳跃'].map(async name=>{
    const box=await page.getByRole('button',{name,exact:true}).boundingBox();
    return {x:box!.x+box!.width/2,y:box!.y+box!.height/2,radiusX:2,radiusY:2,force:1};
  })):null;
  let heldJump=false, cycle=0,previous=-Infinity,stuck=0,activeTouch=false;
  if(!touch) await page.keyboard.down('d');
  try {
    for(let sample=0;sample<600;sample++) {
      // Keep per-step traces small. The complete save is still read and checked
      // at each checkpoint, but returning all material arrays here swamps traces.
      const motion=await page.evaluate(key=>{
        window.dispatchEvent(new Event('pagehide'));
        const save=JSON.parse(localStorage.getItem(key)!);
        return {player:save.spatial.spatial.player,bodies:save.spatial.obstacle.creek.bodies};
      },KEY) as {player:Save['spatial']['spatial']['player'];bodies:NonNullable<ForestCreekSave['bodies']>};
      const player=motion.player;
      if(player.x>=target) return;
      stuck=player.x<previous+.05?stuck+1:0;previous=player.x;
      if(stuck>=60) throw new Error('Movement stalled: '+JSON.stringify(motion));
      const ahead=motion.bodies.some(b=>
        b.x-player.x-12>=-1 && b.x-player.x-12<18 && player.y+14>b.y);
      if(cycle===0 && (stuck>=2 || ahead && player.grounded)) cycle=12;
      const jump=cycle>6;
      if(touch) {
        if(!activeTouch || jump!==heldJump) {
          // CDP touchEnd requires an empty list. Restart the held set at the
          // same frozen clock instant; two real contacts remain down in flight.
          if(activeTouch) await cdp!.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await cdp!.send('Input.dispatchTouchEvent',{type:'touchStart',
            touchPoints:[{...points![0],id:1},...(jump?[{...points![1],id:2}]:[])]});
          activeTouch=true;
        }
      } else if(jump!==heldJump) {
        if(jump) await page.keyboard.down('w'); else await page.keyboard.up('w');
      }
      heldJump=jump; if(cycle>0) cycle--;
      await page.clock.fastForward(100);
    }
    throw new Error('Route stalled: '+JSON.stringify((await state(page)).spatial));
  } finally {
    if(touch) {await cdp!.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp!.detach();}
    else {await page.keyboard.up('d');await page.keyboard.up('w');}
  }
}
async function act(page:Page,prompt:string) {
  await expect(page.locator('[data-hud="prompt"]')).toHaveText(prompt);
  const before=await state(page);
  await page.keyboard.press('e');
  const after=await state(page);
  expect(after.spatial.obstacle.committedSolutionId).toBeNull();
  expect(after.spatial.obstacle.creek.bodies!.map(b=>[b.x,b.y])).toEqual(before.spatial.obstacle.creek.bodies!.map(b=>[b.x,b.y]));
}

for(const method of ['stone','wood','soil','combination','natural-touch'] as const) test.describe(method,()=>{
  test.use({viewport:method==='natural-touch'?{width:844,height:390}:{width:1440,height:900},
    hasTouch:method==='natural-touch'});
  test('fresh integrated world: physical passage, glyph, settlement and durable save',async({page},info)=>{
    // Full routes serialize real saves and reload twice; allow the complete
    // sequence on the reference laptop. Movement has its own bounded stall check.
    test.setTimeout(300000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await start(page);const initial=await state(page);
    if(method==='stone' || method==='combination') {
      // Stop on the bank before the automatic approach jump. Rounded stones
      // no longer act as a square brake: coasting over one correctly reverses
      // an away-from-player push. Settle on its left before applying E.
      await move(page,1750);await ticks(page,12);
      // Inspect each actual landing rather than assuming three presses solve
      // every contact arrangement. This remains bounded ordinary keyboard play.
      for(let attempt=0;attempt<6;attempt++) {
        const unfinished=(await state(page)).spatial.obstacle.creek.bodies!.slice(0,2)
          .find(b=>b.x<1826 || b.restTicks<12);
        if(!unfinished) break;
        // Follow the moved object back into arm's reach, staying on its left.
        await move(page,unfinished.x-40);await ticks(page,12);
        expect((await state(page)).spatial.spatial.player.x+6).toBeLessThan(unfinished.x+unfinished.width/2);
        await act(page,'E · 推动松石');await ticks(page,50);
      }
      expect((await state(page)).spatial.obstacle.creek.bodies!.slice(0,2).every(b=>b.touched)).toBe(true);
      const stones=(await state(page)).spatial.obstacle.creek.bodies!.slice(0,2);
      expect(stones.every(b=>b.x>=1826 && b.restTicks>=12),JSON.stringify(stones)).toBe(true);
    }
    if(method==='wood') {
      await move(page,1914);await act(page,'E · 拖动枯木');
      await page.keyboard.down('a');await page.keyboard.down('w');await ticks(page,6);await page.keyboard.up('w');
      await ticks(page,14);await page.keyboard.up('a');await ticks(page,40);
      await move(page,1863);await ticks(page,15);
      await page.keyboard.down('w');await page.keyboard.down('d');await ticks(page,6);
      await page.keyboard.up('w');await page.keyboard.up('d');
    }
    if(method==='soil' || method==='combination') {
      await move(page,1860);
      await act(page,'E · 疏通松土');await ticks(page,24);
      const excavated=await state(page);
      writeFileSync(info.outputPath('before-reload.json'),JSON.stringify(excavated));
      expect(excavated.spatial.obstacle.creek.excavatedSoil).toBe(96);
      expect(excavated.spatial.obstacle.creek.grid.material.filter(m=>m===3)).toHaveLength(96);
      expect(excavated.spatial.obstacle.creek.grid.material.some((m,i)=>m===4 && i%128>=72 && Math.floor(i/128)>=24)).toBe(true);
      await page.screenshot({path:info.outputPath('flow-and-spoil.png')});
      await page.reload();await expect(page.getByRole('button',{name:'旅途笔记（J）'})).toBeVisible();
      await expect(page.getByRole('button',{name:'旅途笔记（J）'})).toBeEnabled();
      expect((await state(page)).spatial.obstacle.creek).toEqual(excavated.spatial.obstacle.creek);
      await page.locator('canvas[data-surface="game"]').focus();
    }
    const touch=method==='natural-touch';
    await move(page,1980,touch);await ticks(page,6);
    const crossed=await state(page);
    const solution=method==='stone' || method==='combination'?'stone_steps':method==='wood'?'deadwood_bridge':'shallow_detour';
    expect(crossed.spatial.obstacle.committedSolutionId).toBe(solution);
    expect(crossed.spatial.obstacle.routeProof).not.toBeNull();
    expect(crossed.spatial.obstacle.creek.grid.material.filter(m=>m===4)).toHaveLength(400);
    if(touch) expect(crossed.spatial.obstacle.creek.excavatedSoil).toBe(0);
    await page.screenshot({path:info.outputPath('physical-crossing.png')});
    await move(page,2138,touch);await ticks(page,4);
    await expect(page.locator('[data-hud="prompt"]')).toHaveText('F · 观察未知刻痕');
    if(touch) await page.getByRole('button',{name:'观察',exact:true}).tap();else await page.keyboard.press('f');
    await move(page,2498,touch);await ticks(page,6);
    await expect(page.getByRole('region',{name:'短旅程结算'})).toBeVisible();
    const finished=await state(page);
    expect(finished.session.state.learning).toEqual(initial.session.state.learning);
    expect(finished.session.state.mp).toEqual(initial.session.state.mp);
    expect(finished.session.state.capabilities).toEqual(initial.session.state.capabilities);
    expect(finished.session.state.receiptIndex['forest-opening:glyph:word.telo']).toBeDefined();
    await page.screenshot({path:info.outputPath('settlement.png')});
    await page.reload();await expect(page.getByRole('region',{name:'短旅程结算'})).toBeVisible();
    expect(await state(page)).toEqual(finished);expect(errors).toEqual([]);
  });
});
