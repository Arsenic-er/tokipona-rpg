import {completedOpeningFixture} from './forest-episode-fixture';
import {ForestEpisode} from '../../src/game/forest-episode';
import {actEpisode as act,tickEpisode as tick} from './forest-cistern-fixture';
/** Earn the old practice using ordinary inputs. No injected learning, resources or position. */
export function waterStudyReadyFixture(currentMp=12,debrief=true){
  const g=ForestEpisode.begin(completedOpeningFixture(currentMp));
  act(g,'worker','accept');act(g,'mill-road');act(g,'timber');act(g,'brace');act(g,'silt');act(g,'gate');tick(g,900);
  act(g,'medium');act(g,'return');act(g,'worker');act(g,'hermit-road');act(g,'hermit');act(g,'pool');act(g,'plug');tick(g,600);
  act(g,'pool','downhill');act(g,'pool');tick(g,600);if(debrief)act(g,'hermit');act(g,'pool');
  return g;
}
