import {nodeEnergyReadyFixture} from './forest-node-energy-fixture';
import {actEpisode as act,approachEpisode as approach,tickEpisode as tick} from './forest-cistern-fixture';
/** Return to the existing hermit's rest spot normally; never inject location, MP or grants. */
export function nodeWaterReadyFixture(words=true){
 const g=nodeEnergyReadyFixture(words);
 if(words){
  g.interact('node-conservation','energy:reference');tick(g,80);g.interact('node-conservation','energy:predict:wawa:finite');
  const p=g.previewNodeEnergy();if(!p?.canConfirm||!g.confirmNodeEnergy(p.planId).accepted)throw Error('Energy prelude failed');
  tick(g,240);
  act(g,'return');act(g,'return');act(g,'return');act(g,'top-exit');act(g,'return');act(g,'hermit-road');
  for(let i=0;i<8&&g.sessionState.mp.currentMp<g.sessionState.mp.maxMp;i++)act(g,'rest');
  act(g,'return');act(g,'mill-road');act(g,'cistern-shortcut');act(g,'return-channel-road');act(g,'flow-depth');act(g,'node-road');
 }
 approach(g,'node-material');return g;
}
