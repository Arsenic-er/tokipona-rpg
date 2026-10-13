import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {nodeExperimentsReadyFixture} from './forest-node-experiments-fixture';
import {NODE_EXPERIMENTS} from '../../src/world/forest-node-experiments';
import {ForestEpisode,type EpisodeTarget} from '../../src/game/forest-episode';
import {approachEpisode} from './forest-cistern-fixture';
it('exports only normally earned underground comparison starting positions',()=>{
 const g=nodeExperimentsReadyFixture();mkdirSync('.codex-tmp/node-experiments',{recursive:true});
 for(const kind of Object.keys(NODE_EXPERIMENTS)){
  approachEpisode(g,('node-'+kind) as EpisodeTarget);const s=g.toSave();
  expect(s.physical.nodeExperiments).toBeUndefined();expect(ForestEpisode.restore(s).toSave()).toEqual(s);
  writeFileSync('.codex-tmp/node-experiments/'+kind+'-ready.json',JSON.stringify(s));
 }
},90000);
