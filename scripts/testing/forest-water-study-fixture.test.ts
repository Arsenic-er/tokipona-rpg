import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {waterStudyReadyFixture} from './forest-water-study-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports earned normal and zero-MP water study entry saves',()=>{
  const dir=resolve('.codex-tmp/water-study');mkdirSync(dir,{recursive:true});
  for(const [name,mp] of [['ready',12],['empty-mp',2]] as const){
    const g=waterStudyReadyFixture(mp),s=g.toSave();expect(g.has('debrief')).toBe(true);expect(g.waterStudyStage).toBe('unvisited');
    expect(g.sessionState.mp.currentMp).toBe(mp-2);expect(ForestEpisode.restore(s).toSave()).toEqual(s);
    writeFileSync(resolve(dir,name+'.json'),JSON.stringify(s));
  }
},60000);
