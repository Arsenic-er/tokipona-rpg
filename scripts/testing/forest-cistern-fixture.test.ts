import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from './forest-cistern-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports an earned maintenance-window save for cistern browser regression',()=>{
  const g=cisternReadyFixture(),save=g.toSave();
  expect(g.has('window_filled')).toBe(true);expect(g.hasRoom('entered')).toBe(false);
  expect(ForestEpisode.restore(save).toSave()).toEqual(save);
  const dir=resolve(import.meta.dirname,'../../.codex-tmp/forest-cistern-room');mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'ready.json'),JSON.stringify(save));
  act(g,'room-road');act(g,'east-up');tick(g,360);
  act(g,'calibration');act(g,'calibration-tool');tick(g,200);
  act(g,'west-up');tick(g,360);act(g,'upper-survey');
  const upper=g.toSave();expect(g.hasRoom('upper_seen')).toBe(true);expect(g.state.siphon).toBeUndefined();
  expect(ForestEpisode.restore(upper).toSave()).toEqual(upper);
  const siphonDir=resolve(import.meta.dirname,'../../.codex-tmp/cistern-siphon');mkdirSync(siphonDir,{recursive:true});
  writeFileSync(resolve(siphonDir,'upper-ready.json'),JSON.stringify(upper));
},60000);
