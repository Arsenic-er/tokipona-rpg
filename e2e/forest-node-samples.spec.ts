import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const dir='.codex-tmp/node-samples',key='tokipona.forest-waterwheel-episode.v0.1';
const canvas=(p:Page)=>p.locator('canvas[data-surface="game"]'),dialog=(p:Page)=>p.getByRole('dialog',{name:'人物对话',exact:true});
const saved=(p:Page)=>p.evaluate(k=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem(k)!);},key);
const advance=async(p:Page,ms:number)=>{for(let i=0;i<ms;i+=100)await p.clock.fastForward(100);};
const action=(p:Page,label:string)=>dialog(p).getByRole('button',{name:label,exact:true}).click();
async function start(p:Page,kind:'material'|'conservation'){
 mkdirSync(dir,{recursive:true});await p.clock.install({time:0});await p.clock.pauseAt(0);
 await p.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},
  {key,value:readFileSync('.codex-tmp/node-experiments/'+kind+'-ready.json','utf8')});
 await p.goto('/chapter-one.html');await expect(canvas(p)).toHaveAttribute('data-ready','true');
}
async function reload(p:Page){
 const s=await saved(p);await p.reload();await expect(canvas(p)).toHaveAttribute('data-ready','true');
 expect((await saved(p)).physical).toEqual(s.physical);expect((await saved(p)).session).toEqual(s.session);
}
test('clay is supported normally, passes the abnormal stone, pauses and restores without granting progress',async({page:p})=>{
 test.setTimeout(120000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await start(p,'material');const before=await saved(p);
 await p.keyboard.press('e');await action(p,'两槽正常对照');await advance(p,4300);await p.keyboard.press('e');
 await expect(dialog(p)).toContainText('两块石板都正常承托');await action(p,'接入右槽异常对照');
 await advance(p,700);expect((await saved(p)).physical.nodeExperiments.material.age).toBeGreaterThan(0);
 await p.screenshot({path:dir+'/material-moving.png'});await p.keyboard.press('j');
 const paused=await saved(p);await advance(p,1000);expect((await saved(p)).physical).toEqual(paused.physical);
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('材质承托台正在对照');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await reload(p);
 await p.keyboard.press('m');const mapPause=await saved(p);await advance(p,800);expect((await saved(p)).physical).toEqual(mapPause.physical);
 await p.keyboard.press('Escape');await advance(p,4000);await p.keyboard.press('e');
 await expect(dialog(p)).toContainText('右槽板上 0、板下 16');await p.screenshot({path:dir+'/material-result.png'});
 writeFileSync(dir+'/browser-material.json',JSON.stringify(await saved(p)));
 expect((await saved(p)).session).toEqual(before.session);await action(p,'机械复位');
 expect((await saved(p)).physical.nodeExperiments).toBeUndefined();await action(p,'继续');await reload(p);expect(errors).toEqual([]);
});
test('water shortfall prompts explicit drawer inspection and preserves full accounting through save and retry',async({page:p})=>{
 test.setTimeout(120000);const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 await start(p,'conservation');const before=await saved(p);await p.keyboard.press('e');
 await expect(dialog(p).getByRole('button',{name:'打开隔离仓核账',exact:true})).not.toBeVisible();
 await action(p,'接入右槽异常对照');await advance(p,1000);await p.keyboard.press('e');
 await expect(dialog(p).getByRole('button',{name:'打开隔离仓核账',exact:true})).not.toBeVisible();await action(p,'继续');await reload(p);
 await advance(p,4000);await p.keyboard.press('e');await expect(dialog(p)).toContainText('右侧 10');
 await expect(dialog(p)).not.toContainText('隔离仓：左');
 const completed=await saved(p);await advance(p,800);expect((await saved(p)).physical).toEqual(completed.physical);
 await p.screenshot({path:dir+'/water-before-accounting.png'});await action(p,'打开隔离仓核账');
 await expect(canvas(p)).toHaveAttribute('data-conservation-ledger','true');await expect(dialog(p)).toContainText('隔离仓：左 0，右 6');
 await expect(dialog(p)).toContainText('合计仍为 16');const checked=await saved(p);
 await action(p,'重看整套水量账');expect((await saved(p)).physical).toEqual(checked.physical);
 await p.screenshot({path:dir+'/water-after-accounting.png'});writeFileSync(dir+'/browser-accounted.json',JSON.stringify(checked));
 await action(p,'继续');await reload(p);await p.keyboard.press('j');
 await expect(p.getByRole('dialog',{name:'章节笔记'})).toContainText('隔离仓：左 0，右 6');
 await p.getByRole('button',{name:'回到旅途',exact:true}).click();await p.keyboard.press('e');await action(p,'两槽正常对照');
 await expect(canvas(p)).toHaveAttribute('data-conservation-ledger','false');await advance(p,4300);await p.keyboard.press('e');
 await action(p,'打开隔离仓核账');await expect(dialog(p)).toContainText('两槽收支一致');
 await action(p,'机械复位');expect((await saved(p)).physical.nodeExperiments).toBeUndefined();
 expect((await saved(p)).session).toEqual(before.session);expect(errors).toEqual([]);
});
test('touch water accounting remains reachable in portrait and landscape and survives reload',async({browser})=>{
 test.setTimeout(120000);const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await start(p,'conservation');const before=await saved(p);await p.getByRole('button',{name:'互动',exact:true}).tap();
  await dialog(p).getByRole('button',{name:'接入右槽异常对照',exact:true}).tap();await advance(p,700);
  await p.setViewportSize({width:844,height:390});await reload(p);await advance(p,4000);
  await p.getByRole('button',{name:'互动',exact:true}).tap();const inspect=dialog(p).getByRole('button',{name:'打开隔离仓核账',exact:true});
  await inspect.scrollIntoViewIfNeeded();const b=(await inspect.boundingBox())!;expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(391);
  await inspect.tap();await expect(dialog(p)).toContainText('隔离仓：左 0，右 6');
  await p.screenshot({path:dir+'/water-touch-landscape.png'});await p.setViewportSize({width:390,height:844});
  const reset=dialog(p).getByRole('button',{name:'机械复位',exact:true});await reset.scrollIntoViewIfNeeded();
  const rb=(await reset.boundingBox())!;expect(rb.x).toBeGreaterThanOrEqual(0);expect(rb.x+rb.width).toBeLessThanOrEqual(391);
  await dialog(p).getByRole('button',{name:'继续',exact:true}).tap();await reload(p);
  await expect(canvas(p)).toHaveAttribute('data-conservation-ledger','true');
  expect((await saved(p)).session).toEqual(before.session);expect(errors).toEqual([]);
  writeFileSync(dir+'/browser-touch.json',JSON.stringify(await saved(p)));
 }finally{await ctx.close();}
});
