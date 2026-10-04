import {completedOpeningFixture} from './forest-episode-fixture';
import {ForestEpisode,EPISODE_TARGETS,type EpisodeTarget} from '../../src/game/forest-episode';
export const tickEpisode=(g:ForestEpisode,n=240)=>{for(let i=0;i<n;i++)g.advance();};
export function approachEpisode(g:ForestEpisode,id:EpisodeTarget):void{
  const t=EPISODE_TARGETS[g.state.place].find(t=>t.id===id);if(!t)throw Error('No target '+id);
  for(let n=0;n<1800;n++){
    if(g.state.climb){g.advance();continue;}
    const dx=t.x-g.state.player.x-6;
    if(Math.abs(dx)<3){tickEpisode(g,25);if(g.nearest()?.id!==id)throw Error('Wrong target '+id+'/'+g.nearest()?.id);return;}
    g.advance({moveX:Math.sign(dx)*(Math.abs(dx)<20?.25:1),jump:false});
  }throw Error('Unreachable '+id);
}
export const actEpisode=(g:ForestEpisode,id:EpisodeTarget,choice?:string)=>{approachEpisode(g,id);return g.interact(id,choice);};
/** Earned by ordinary movement and interaction; never fabricate flags, positions, capacity or MP. */
export function cisternReadyFixture(phrase=true):ForestEpisode{
  const g=ForestEpisode.begin(completedOpeningFixture()),act=(id:EpisodeTarget,c?:string)=>actEpisode(g,id,c);
  act('worker','accept');act('mill-road');act('timber');act('brace');act('silt');act('gate');tickEpisode(g,900);
  act('medium');act('return');act('worker');act('hermit-road');act('hermit');act('pool');act('plug');tickEpisode(g,600);
  act('pool','downhill');act('pool');tickEpisode(g,600);act('hermit');
  if(phrase){act('rest');act('hermit','telo');}
  act('return');act('worker');act('mill-road');act('cistern-road');act('entry-survey');act('entry-winch');act('entry-seal');
  act('window');act('window-bypass');tickEpisode(g,200);
  return g;
}
