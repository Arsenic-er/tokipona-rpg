import {shardSyncReadyFixture} from './forest-shard-sync-fixture';
import {approachEpisode as approach,actEpisode as act,tickEpisode as tick} from './forest-cistern-fixture';
/** All gates are earned normally, including the earlier tawa second context when requested. */
export function nodeEnergyReadyFixture(words=true,motion=true){
 const g=shardSyncReadyFixture(words,false);
 if(words&&motion){
  act(g,'node-time','rail:reference');tick(g,180);g.interact('node-time','rail:predict:tawa:reverse');
  const p=g.previewNodeMotion();if(!p?.canConfirm||!g.confirmNodeMotion(p.planId).accepted)throw Error('Motion prelude failed');
  tick(g,180);if(!g.hasNodeMotion('completed'))throw Error('Motion prelude did not resolve');
 }
 approach(g,'node-conservation');return g;
}
