import { cisternReadyFixture, actEpisode as act, tickEpisode as tick } from './forest-cistern-fixture';
/** Public test helper: every prerequisite is earned via normal input; no injected progression. */
export function wetlandReadyFixture(enter=true){
  const g=cisternReadyFixture(false);
  act(g,'room-road');act(g,'east-up');tick(g,360);
  act(g,'calibration');act(g,'calibration-tool');tick(g,200);act(g,'west-up');tick(g,360);
  act(g,'upper-survey');act(g,'siphon-tool');tick(g,200);act(g,'lift-up');tick(g,360);act(g,'return-winch');
  act(g,'return-channel-road');act(g,'flow-inspect');act(g,'flow-gate');act(g,'flow-seal');act(g,'flow-clear');
  tick(g,1800);act(g,'flow-gauge');if(enter)act(g,'flow-depth');
  if(enter&&g.state.place!=='wetland')throw Error('Wetland fixture failed to earn entry');
  return g;
}
