import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {epilogueReadyFixture} from './forest-epilogue-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
import {actEpisode as act} from './forest-cistern-fixture';
it('exports earned epilogue stages without shortcutting narrative or return qualification',async()=>{
 const g=epilogueReadyFixture(),dir='.codex-tmp/epilogue';mkdirSync(dir,{recursive:true});
 const save=(name:string)=>{const s=g.toSave();expect(ForestEpisode.restore(s).toSave()).toEqual(s);writeFileSync(dir+'/'+name+'.json',JSON.stringify(s));};
 save('ready');g.interact('node-exit','epilogue:review');save('reviewed');
 g.interact('node-exit','epilogue:seal');save('sealed');g.interact('node-exit','epilogue:depart');
 expect(g.state.place).toBe('settlement');expect(g.returnObserved).toBe(false);save('arrived');
 act(g,'worker','lead:report');expect(g.returnObserved).toBe(false);save('worker-ready');
 await g.confirmEpilogueReturn();expect(g.returnObserved).toBe(true);save('returned');
 act(g,'archive-road');save('revisited');
},90000);
