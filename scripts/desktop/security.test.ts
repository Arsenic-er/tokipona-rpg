import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { resolveGameFile, canNavigate } = require("../../desktop/security.cjs");
const root = resolve("exports/windows/.build/app/web");

describe("offline desktop resource boundary", () => {
  it("serves the game and bundled resources, including local-only candidates", () => {
    for (const name of ['/chapter-one.html', '/magic-lab.html', '/assets/game-abcd.js', '/assets/app-support~rpg~chapter-one-CJ7lBF4D.js', '/assets/main.css',
      '/src/local-art-cache/traveler-atlas.v0.6.png']) {
      expect(resolveGameFile('tokipona://game' + name, root)).toBe(resolve(root, '.' + name));
    }
    expect(canNavigate('tokipona://game/chapter-one.html?practice=0123456789abcdef')).toBe(true);
    expect(canNavigate('tokipona://game/magic-lab.html')).toBe(true);
  });
  it("rejects remote origins, file access, traversal, source files and Windows path escapes", () => {
    for (const url of ['https://game/chapter-one.html', 'file:///C:/secret.txt',
      'tokipona://game.attacker/chapter-one.html', 'tokipona://user@game/chapter-one.html',
      'tokipona://game:42/chapter-one.html', 'tokipona://game/assets/%2e%2e%2fsecret.js',
      'tokipona://game/assets/%5csecret.js', 'tokipona://game/assets/C%3asecret.js',
      'tokipona://game/assets/%00secret.js', 'tokipona://game/assets/%zz.js',
      'tokipona://game/index.html', 'tokipona://game/main.cjs', 'tokipona://game/.env']) {
      expect(resolveGameFile(url, root), url).toBeNull();
      expect(canNavigate(url), url).toBe(false);
    }
  });
});
