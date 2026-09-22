import { mountForestOpening } from './forest-opening-main';
// Keep the completed opening as an immutable handoff checkpoint. Once the
// continuation exists it is the sole active story/save authority on this route.
const params = new URLSearchParams(location.search);
const slot = params.get('practice');
const practice = slot !== null && /^[0-9a-f]{32}$/.test(slot);
const storage = practice ? sessionStorage : localStorage;
const key = 'tokipona.forest-waterwheel-episode.v0.1' + (practice ? `.practice.${slot}` : '');
let episode = params.get('episode') === 'waterwheel';
try { episode ||= storage.getItem(key) !== null; } catch { /* The selected page displays storage errors. */ }
const boot = episode ? import('./forest-episode-main') : Promise.resolve().then(mountForestOpening);
void boot.catch(error => {
  const root = document.querySelector('main')!;
  if (root.querySelector('.ep-recovery')) return;
  root.textContent = `游戏启动失败，存档未清空。请重新打开。${String(error)}`;
});
