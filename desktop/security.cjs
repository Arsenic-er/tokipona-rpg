const path = require('node:path');
const GAME_URL = 'tokipona://game/chapter-one.html';
const CANDIDATES = new Set([
  '/src/local-art-cache/traveler-atlas.v0.6.png',
  '/src/local-art-cache/background-far.v0.3.png',
]);

function localURL(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'tokipona:' && url.hostname === 'game' && !url.port &&
      !url.username && !url.password ? url : null;
  } catch { return null; }
}

function canNavigate(raw) {
  return ['/chapter-one.html', '/magic-lab.html'].includes(localURL(raw)?.pathname);
}

function resolveGameFile(raw, root) {
  const url = localURL(raw);
  if (!url) return null;
  let name;
  try { name = decodeURIComponent(url.pathname); } catch { return null; }
  if (/[\\:\0]/.test(name) || name.split('/').some(part => part === '..' || part === '.')) return null;
  if (!['/chapter-one.html', '/magic-lab.html'].includes(name) && !CANDIDATES.has(name) &&
      !/^\/assets\/[a-zA-Z0-9_.~-]+\.(js|css|json|png|webp|ogg|wav|mp3|woff2)$/.test(name)) return null;
  const file = path.resolve(root, '.' + name);
  const relative = path.relative(root, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? file : null;
}

module.exports = { GAME_URL, canNavigate, resolveGameFile };
