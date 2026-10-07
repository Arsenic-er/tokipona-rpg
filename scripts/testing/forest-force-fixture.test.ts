import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {wetlandReadyFixture} from './forest-wetland-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports earned repaired channels without injecting word learning',()=>{
  const g=wetlandReadyFixture(false),save=g.toSave();
  expect(g.hasFlow('restored')).toBe(true);expect(g.state.forceStudy).toBeUndefined();
  expect(ForestEpisode.restore(save).toSave()).toEqual(save);
  const dir=resolve('.codex-tmp/force-study');mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'ready.json'),JSON.stringify(save));
},60000);
