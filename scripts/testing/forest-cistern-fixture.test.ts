import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cisternReadyFixture} from './forest-cistern-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports an earned maintenance-window save for cistern browser regression',()=>{
  const g=cisternReadyFixture(),save=g.toSave();
  expect(g.has('window_filled')).toBe(true);expect(g.hasRoom('entered')).toBe(false);
  expect(ForestEpisode.restore(save).toSave()).toEqual(save);
  const dir=resolve(import.meta.dirname,'../../.codex-tmp/forest-cistern-room');mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'ready.json'),JSON.stringify(save));
},60000);
