import {nodeWaterReadyFixture} from './forest-node-water-fixture';
import {actEpisode as act,tickEpisode as tick} from './forest-cistern-fixture';
/** Normal arrivals preserve all prior trials; water always settles through actual simulation. */
export function archiveRigReadyFixture(words=true,water=true){
 const g=nodeWaterReadyFixture(words);
 if(water)for(const stage of ['short','long'] as const){
  if(words){
   if(stage==='long')g.interact('node-material','waterway:brace');
   g.interact('node-material','waterway:predict:telo '+(stage==='short'?'lili:narrow':'suli:both'));
   const p=g.previewNodeWater();if(!p?.canConfirm||!g.confirmNodeWater(p.planId).accepted)throw Error('Archive rig water fixture failed');
  }else g.interact('node-material','waterway:tool');
  tick(g,180);
 }
 act(g,'node-archive');return g;
}
