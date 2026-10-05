import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {wetlandReadyFixture} from './forest-wetland-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports an earned wetland entry with one-word capacity and no ecological resolution',()=>{
  const g=wetlandReadyFixture(),save=g.toSave();
  expect(g.hasMigration('resolved')).toBe(false);expect(g.sessionState.capabilities.expressionCapacityWords).toBe(1);
  expect(ForestEpisode.restore(save).toSave()).toEqual(save);
  const dir=resolve('.codex-tmp/wetland-migration');mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'ready.json'),JSON.stringify(save));
},60000);
