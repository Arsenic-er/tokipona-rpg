import {wetlandReadyFixture} from './forest-wetland-fixture';
import {actEpisode as act,approachEpisode as approach,tickEpisode as tick} from './forest-cistern-fixture';
/** Every gate is earned through normal play, not forged flags, locations or learning grants. */
export function shardSyncReadyFixture(words=true,archive=true){
 const g=wetlandReadyFixture(false);
 if(words){
  act(g,'flow-spout','force:observe');tick(g,240);
  g.interact('flow-spout','force:attune');g.interact('flow-spout','force:predict:wawa:more');tick(g,120);
  act(g,'return');act(g,'top-exit');act(g,'return');act(g,'hermit-road');act(g,'pool');
  for(const c of ['water:observe','water:attune','water:predict:telo:downhill','water:confirm'])g.interact('pool',c);tick(g,600);
  act(g,'rest');act(g,'rest');act(g,'rest');act(g,'hermit','telo');
  act(g,'return');act(g,'mill-road');act(g,'brace');g.interact('brace','motion:observe');tick(g,600);
  g.interact('brace','motion:attune');g.interact('brace','motion:predict:tawa:clockwise');tick(g,600);
  act(g,'cistern-road');act(g,'room-road');act(g,'room-echo');tick(g,200);
  for(const w of ['lili','suli'] as const){
   g.interact('room-echo','length:select:'+w);g.interact('room-echo','length:attune');
   if(w==='suli')g.interact('room-echo','length:brace');
   g.interact('room-echo','length:predict:telo '+w+':'+(w==='lili'?'short':'long'));
   const p=g.previewLengthStudy();if(!p?.canConfirm||!g.confirmLengthStudy(p.plan.planId).accepted)throw Error('Modifier fixture failed');
   tick(g,200);
  }
  act(g,'return');act(g,'return');act(g,'cistern-shortcut');act(g,'return-channel-road');
 }
 act(g,'flow-depth');
 for(const id of ['wetland-lookout','wetland-nest','wetland-young','wetland-clear'] as const)act(g,id);
 approach(g,'wetland-lookout');tick(g,900);act(g,'node-road');
 if(archive)act(g,'node-archive');approach(g,'node-cradle');
 if(g.state.place!=='order-node'||!g.hasMigration('resolved'))throw Error('Underground fixture failed');
 return g;
}
