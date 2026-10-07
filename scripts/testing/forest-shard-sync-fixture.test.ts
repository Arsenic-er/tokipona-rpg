import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {shardSyncReadyFixture} from './forest-shard-sync-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports earned archive entry with and without the five-word practice records',()=>{
 mkdirSync('.codex-tmp/shard-sync',{recursive:true});
 for(const [name,words] of [['ready',true],['legacy-tools',false]] as const){
  const g=shardSyncReadyFixture(words),s=g.toSave();
  expect(g.state.shardSync).toBeUndefined();expect(ForestEpisode.restore(s).toSave()).toEqual(s);
  writeFileSync('.codex-tmp/shard-sync/'+name+'.json',JSON.stringify(s));
 }
},90000);
