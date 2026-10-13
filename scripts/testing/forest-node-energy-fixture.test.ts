import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {nodeEnergyReadyFixture} from './forest-node-energy-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports normally earned wawa grounding and completed tawa without hoist grants',()=>{
 const g=nodeEnergyReadyFixture(),s=g.toSave();
 expect(g.sessionState.learning.words.wawa?.learningState).toBe('grounded');expect(g.hasNodeMotion('completed')).toBe(true);
 expect(g.state.nodeEnergy).toBeUndefined();expect(g.sessionState.mp.currentMp).toBeGreaterThanOrEqual(2);
 expect(ForestEpisode.restore(s).toSave()).toEqual(s);mkdirSync('.codex-tmp/node-energy',{recursive:true});
 writeFileSync('.codex-tmp/node-energy/ready.json',JSON.stringify(s));
},90000);
