import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from './forest-cistern-fixture';
export function lengthStudyReadyFixture(phrase=true,mp=12){
 const g=cisternReadyFixture(phrase,mp);act(g,'room-road');act(g,'room-echo');tick(g,200);return g;
}
