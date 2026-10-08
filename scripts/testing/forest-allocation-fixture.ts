import {shardSyncReadyFixture} from './forest-shard-sync-fixture';
import {actEpisode as act,tickEpisode as tick,approachEpisode as approach} from './forest-cistern-fixture';
export function allocationReadyFixture(){
 const g=shardSyncReadyFixture();
 act(g,'node-cradle','shard:seat');g.interact('node-cradle','shard:align');tick(g,180);g.interact('node-cradle','shard:confirm');
 approach(g,'node-allocation');
 if(g.shardSyncStage!=='synchronized')throw Error('Allocation fixture lacks earned synchronization');
 return g;
}
