import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {archiveRigReadyFixture} from './forest-archive-rig-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports genuine magic, all-tool and hydraulically locked archive arrivals',()=>{
 mkdirSync('.codex-tmp/archive-rig',{recursive:true});
 for(const [label,words,water] of [['ready',true,true],['tools',false,true],['locked',false,false]] as const){
  const g=archiveRigReadyFixture(words,water),s=g.toSave();
  expect(g.archiveRigStatus).toBe(water?'ready':'locked');expect(g.state.archiveRig).toBeUndefined();
  if(words){expect(g.sessionState.mp.currentMp).toBeGreaterThanOrEqual(4);expect(g.hasNodeWater('long.completed')).toBe(true);}
  expect(ForestEpisode.restore(s).toSave()).toEqual(s);writeFileSync('.codex-tmp/archive-rig/'+label+'.json',JSON.stringify(s));
 }
},120000);
