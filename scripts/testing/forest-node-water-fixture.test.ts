import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {nodeWaterReadyFixture} from './forest-node-water-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports real waterway arrivals, including hermit rest and both earlier optional trials',()=>{
 mkdirSync('.codex-tmp/node-water',{recursive:true});
 for(const words of [true,false]){
  const g=nodeWaterReadyFixture(words),s=g.toSave();
  expect(g.state.nodeWater).toBeUndefined();expect(g.nearest()?.id).toBe('node-material');
  if(words){expect(g.sessionState.mp.currentMp).toBeGreaterThanOrEqual(16);expect(g.hasNodeMotion('completed')).toBe(true);expect(g.hasNodeEnergy('completed')).toBe(true);}
  expect(ForestEpisode.restore(s).toSave()).toEqual(s);
  writeFileSync('.codex-tmp/node-water/'+(words?'ready':'tools')+'.json',JSON.stringify(s));
 }
},120000);
