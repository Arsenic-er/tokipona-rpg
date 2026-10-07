import { PrologueForestOpeningSession } from '../../src/game/prologue-forest-opening';
/** A genuine completed older opening, driven by movement/tool commands, not edited flags. */
export function completedOpeningFixture(currentMp=12): PrologueForestOpeningSession {
  const opening = PrologueForestOpeningSession.fresh({ sessionId: 'episode.compatibility', seed: 'episode.compatibility', physics: 'shared', currentMp, maxMp: 24 });
  const move = (x: number) => {
    let previous = -Infinity, stuck = 0;
    for (let i = 0; i < 1800; i++) {
      const position = opening.snapshot().runtime.spatial.player.position.x;
      if (position >= x) return;
      stuck = position < previous + .1 ? stuck + 1 : 0; previous = position;
      opening.advanceTicks(position < x - 200 ? 60 : 10, { moveX: 1, jump: stuck >= 3 });
    }
    throw new Error('Opening fixture failed ordinary walking');
  };
  move(1832);
  if (!opening.interact('episode.fixture.stone.a', { kind: 'push_stone', objectId: 'stream.stone.a', direction: 1 }, 0).accepted ||
      !opening.interact('episode.fixture.stone.b', { kind: 'push_stone', objectId: 'stream.stone.b', direction: 1 }, 1).accepted) throw new Error('Opening fixture failed physical creek repair');
  move(2500);
  if (!opening.enterSettlementPerimeter('episode.fixture.settlement').accepted) throw new Error('Opening fixture did not arrive');
  return opening;
}
