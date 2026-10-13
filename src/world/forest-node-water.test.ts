import {it,expect} from 'vitest';
import {NodeWaterWorld,NODE_WATER,validateNodeWater,previewNodeWaterWorld,type NodeWaterState} from './forest-node-water';
const settled=(source:'cast'|'tool'):NodeWaterState=>({version:1,short:{source,age:180},long:{source,age:180}});
it.each(['cast','tool'] as const)('settles both stages through real water cells with exact finite accounting: %s',source=>{
 const w=new NodeWaterWorld(settled(source));expect(w.shortSatisfied).toBe(true);expect(w.longSatisfied).toBe(true);
 expect(w.totalWater).toBe(NODE_WATER.initialWater+(source==='cast'?240:0));
 expect(w.collected.short).toBeGreaterThanOrEqual(24);expect(w.collected.left).toBeGreaterThanOrEqual(32);expect(w.collected.right).toBeGreaterThanOrEqual(32);
});
it('rejects oversized inlet casts and does not shorten them silently',()=>{
 const w=new NodeWaterWorld();expect(w.preview('short').canConfirm).toBe(true);
 for(const word of ['telo','telo suli'] as const){const p=w.preview('short',word);expect(p.canConfirm).toBe(false);expect(w.confirm(p).committed).toBe(false);}
 expect(w.totalWater).toBe(240);
});
it.each(['telo lili','telo'] as const)('shorter downstream casts cannot fill the separated far basin: %s',word=>{
 const w=new NodeWaterWorld({version:1,short:{source:'tool',age:180}});
 const p=w.preview('long',word);expect(p.canConfirm).toBe(true);expect(w.confirm(p).committed).toBe(true);
 for(let i=0;i<180;i++)w.advance('long');expect(w.collected.right).toBe(0);expect(w.longSatisfied).toBe(false);
});
it('preserves partial saves deterministically, previews MP honestly and applies living safety',()=>{
 const s:NodeWaterState={version:1,short:{source:'cast',age:180},long:{source:'cast',age:38}};
 const a=new NodeWaterWorld(s),b=new NodeWaterWorld(s);for(let i=0;i<142;i++){a.advance('long');b.advance('long');}
 expect(a.cells()).toEqual(b.cells());expect(a.longSatisfied).toBe(true);
 expect(previewNodeWaterWorld(undefined,'short',5,24).plan.canConfirm).toBe(false);
 const p=previewNodeWaterWorld(undefined,'short',24,24,[{entityId:'player',boundsPx:{x:8,y:30,width:12,height:14}}]).plan;
 expect(p.canConfirm).toBe(false);expect(p.rejectionCode).toBe('living_safety_volume_blocked');
});
it.each([null,{version:2},{version:1,short:null},{version:1,short:{source:'cast',age:181}},
 {version:1,long:{source:'tool',age:0}},{version:1,short:{source:'tool',age:180},extra:true}])('fails closed for malformed physical state %#',s=>{
 expect(()=>validateNodeWater(s as never)).toThrow(/地下接水/);
});
