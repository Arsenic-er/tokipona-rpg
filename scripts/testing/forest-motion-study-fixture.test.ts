import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {motionStudyReadyFixture} from './forest-motion-study-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
it('exports an earned repaired wheel with no automatic motion learning',()=>{
 const g=motionStudyReadyFixture(),s=g.toSave();expect(g.motionStudyStage).toBe('unvisited');
 expect(g.has('repaired')).toBe(true);expect(g.has('debrief')).toBe(true);
 expect(ForestEpisode.restore(s).toSave()).toEqual(s);
 mkdirSync('.codex-tmp/motion-study',{recursive:true});
 writeFileSync('.codex-tmp/motion-study/ready.json',JSON.stringify(s));
},60000);
