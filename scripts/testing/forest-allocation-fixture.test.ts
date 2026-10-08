import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {allocationReadyFixture} from './forest-allocation-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports a normally played synchronized node, with no allocation selected',()=>{
 const g=allocationReadyFixture(),save=g.toSave();
 expect(g.state.allocation).toBeUndefined();expect(g.allocationMode).toBeNull();
 expect(ForestEpisode.restore(save).toSave()).toEqual(save);
 mkdirSync('.codex-tmp/water-allocation',{recursive:true});writeFileSync('.codex-tmp/water-allocation/ready.json',JSON.stringify(save));
},90000);
