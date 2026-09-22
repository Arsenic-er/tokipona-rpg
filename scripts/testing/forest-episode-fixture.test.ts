import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { completedOpeningFixture } from './forest-episode-fixture';
import { createBrowserForestOpeningSave } from '../../src/persistence/browser-forest-opening-persistence';
import { ForestEpisode } from '../../src/game/forest-episode';

it('exports a genuine completed opening and canonical continuation, without fabricated progress', () => {
  const opening = completedOpeningFixture(), episode = ForestEpisode.begin(opening);
  expect(episode.has('job')).toBe(false);
  const dir = resolve(import.meta.dirname, '../../.codex-tmp/forest-episode'); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'opening.json'), JSON.stringify(createBrowserForestOpeningSave(opening)));
  writeFileSync(resolve(dir, 'start.json'), JSON.stringify(episode.toSave()));
}, 30000);
