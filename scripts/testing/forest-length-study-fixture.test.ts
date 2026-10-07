import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {lengthStudyReadyFixture} from './forest-length-study-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports earned echo entry, low-MP and single-word saves without modifier grants',()=>{
 mkdirSync('.codex-tmp/length-study',{recursive:true});
 for(const [name,phrase,mp] of [['ready',true,12],['low-mp',true,2],['one-word',false,12]] as const){
  const g=lengthStudyReadyFixture(phrase,mp),s=g.toSave();expect(g.state.echoAge).toBe(180);
  expect(g.state.lengthStudy).toBeUndefined();expect(ForestEpisode.restore(s).toSave()).toEqual(s);
  writeFileSync('.codex-tmp/length-study/'+name+'.json',JSON.stringify(s));
 }
},60000);
