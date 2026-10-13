import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {nodeMotionReadyFixture} from './forest-node-motion-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports normally earned tawa grounding without a rail grant',()=>{
 const g=nodeMotionReadyFixture();const s=g.toSave();
 expect(g.sessionState.learning.words.tawa?.learningState).toBe('grounded');
 expect(s.physical.nodeMotion).toBeUndefined();expect(g.sessionState.mp.currentMp).toBeGreaterThanOrEqual(2);
 expect(ForestEpisode.restore(s).toSave()).toEqual(s);
 mkdirSync('.codex-tmp/node-motion',{recursive:true});writeFileSync('.codex-tmp/node-motion/ready.json',JSON.stringify(s));
},90000);
