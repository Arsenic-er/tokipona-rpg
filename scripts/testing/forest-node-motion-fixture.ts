import {shardSyncReadyFixture} from './forest-shard-sync-fixture';
import {approachEpisode} from './forest-cistern-fixture';
export function nodeMotionReadyFixture(words=true){
 const g=shardSyncReadyFixture(words,false);approachEpisode(g,'node-time');return g;
}
