// Optional isolated-profile probe, never enabled by the ordinary player entry.
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.run = async (window, app, loadErrors = []) => {
  const reportPath = process.env.TOKIPONA_SMOKE_REPORT, phase = process.env.TOKIPONA_SMOKE_PHASE;
  const contents = window.webContents, errors = [...loadErrors];
  let laboratory = null;
  const key = 'tokipona.forest-waterwheel-episode.v0.1';
  const evaluate = expression => contents.executeJavaScript(expression);
  const awaitReady = async () => {
    const until = Date.now() + 20000;
    while (!await evaluate(`document.querySelector('canvas')?.dataset.ready === 'true'`)) {
      if (Date.now() > until) throw new Error('Episode failed to load'); await pause(100);
    }
  };
  const press = async keyCode => { contents.sendInputEvent({ type: 'keyDown', keyCode }); contents.sendInputEvent({ type: 'keyUp', keyCode }); await pause(180); };
  const clickFocusedChoice = async () => {
    const point = await evaluate(`(() => { const button = document.activeElement; if (!(button instanceof HTMLButtonElement) || !button.closest('.ep-talk')) throw new Error('Dialogue choice lost focus'); const r=button.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
    contents.sendInputEvent({ type: 'mouseMove', ...point });
    contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
    await pause(250);
  };
  const consoleError = (_event, details, legacy) => {
    if (details?.level === 'error' || details === 3) errors.push(details?.message || legacy);
  };
  contents.on('console-message', consoleError);
  try {
    if (!process.env.TOKIPONA_TEST_PROFILE) throw new Error('Episode probe requires an isolated profile');
    if (phase === 'fresh') {
      const fixture = fs.readFileSync(process.env.TOKIPONA_EPISODE_FIXTURE, 'utf8');
      // A canonical fixture produced by normal game inputs, not fabricated flags.
      await evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(fixture)})`);
      await contents.loadURL('tokipona://game/chapter-one.html');
    }
    await awaitReady(); window.show(); window.focus(); contents.focus(); await pause(250);
    if (!await evaluate(`typeof require === 'undefined' && typeof process === 'undefined'`)) throw new Error('Renderer privileges changed');
    if (await evaluate(`document.querySelector('canvas').dataset.traveler`) !== 'v0.6') throw new Error('Approved local traveler candidate not loaded');
    if (!await evaluate(`getComputedStyle(document.querySelector('.episode')).position === 'fixed' && document.querySelector('canvas').clientWidth === innerWidth`)) throw new Error('Episode fullscreen stylesheet missing');
    const begin = JSON.parse(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`));
    if (phase === 'fresh') {
      await evaluate(`document.querySelector('canvas').focus()`);
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'D' });
      const deadline = Date.now() + 8000;
      try {
        while (Number(await evaluate(`document.querySelector('canvas').dataset.playerX`)) < 332) {
          if (Date.now() > deadline) throw new Error('Native episode walk stalled'); await pause(100);
        }
      } finally { contents.sendInputEvent({ type: 'keyUp', keyCode: 'D' }); }
      await pause(350); await press('E');
      if (!await evaluate(`document.querySelector('.ep-talk').open`)) throw new Error('Worker dialogue did not open');
      // Native pointer choices after keyboard walking/E. The first probe's
      // injected Enter pair did not activate this button on the test host.
      // Browser E2E separately checks Enter activation of focused choices.
      await clickFocusedChoice();
      await clickFocusedChoice();
      await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
      const current = JSON.parse(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`));
      if (!current.session.state.world.flags['global:forest.episode.job']?.value || current.session.state.mp.currentMp !== begin.session.state.mp.currentMp) throw new Error('Worker transaction or MP failed');
      await evaluate(`localStorage.setItem('episode.native.expected', JSON.stringify(JSON.parse(localStorage.getItem(${JSON.stringify(key)})).session))`);
      await press('M');
      if (!await evaluate(`document.querySelector('.atlas-dialog')?.open && Number(document.querySelector('.atlas-mini canvas')?.dataset.discovered) > 0`)) throw new Error('Native M map did not open with explored terrain');
      await evaluate(`localStorage.setItem('episode.native.mapExpected', localStorage.getItem('tokipona.forest-cartography.v0.1'))`);
      fs.writeFileSync(path.join(path.dirname(reportPath), 'map.png'), (await contents.capturePage()).toPNG());
      await press('M');
      if (await evaluate(`document.querySelector('.atlas-dialog').open`)) throw new Error('Native M map did not close');
      laboratory = await checkLaboratory(contents, reportPath, evaluate, press);
    } else {
      const expected = JSON.parse(await evaluate(`localStorage.getItem('episode.native.expected')`));
      if (JSON.stringify(begin.session) !== JSON.stringify(expected)) throw new Error('Native episode save did not survive EXE restart');
      await press('J');
      if (!await evaluate(`document.querySelector('.ep-journal').open && document.querySelector('[data-ep="notes"]').textContent.includes('已接下')`)) throw new Error('Restored journal missing accepted work');
      await press('Escape');
      await press('M');
      if (!await evaluate(`document.querySelector('.atlas-dialog')?.open && localStorage.getItem('tokipona.forest-cartography.v0.1') === localStorage.getItem('episode.native.mapExpected')`)) throw new Error('Native exploration fog did not survive EXE restart');
      await press('Escape');
    }
    const performance = await evaluate(`new Promise(resolve => { const frames=[]; let previous; function sample(now) {
      if(previous!==undefined)frames.push(now-previous);previous=now;
      if(frames.length<180)return requestAnimationFrame(sample);frames.sort((a,b)=>a-b);
      resolve({frames:180,medianMs:frames[90],p95Ms:frames[171],over33Ms:frames.filter(n=>n>33.4).length}); } requestAnimationFrame(sample); })`);
    fs.writeFileSync(path.join(path.dirname(reportPath), phase + '.png'), (await contents.capturePage()).toPNG());
    fs.writeFileSync(reportPath, JSON.stringify({ ok: true, phase, episode: 'waterwheel-and-fragment', candidate: 'v0.6',
      origin: contents.getURL(), userData: app.getPath('userData'), performance, laboratory, errors }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(path.dirname(reportPath), phase + '.png'), (await contents.capturePage()).toPNG());
    fs.writeFileSync(reportPath, JSON.stringify({ ok: false, phase, error: String(error.stack), errors }, null, 2));
  } finally { contents.removeListener('console-message', consoleError); await contents.session.flushStorageData(); app.quit(); }
};

async function checkLaboratory(contents, reportPath, evaluate, press) {
  const click = async selector => {
    const point = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
    contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  };
  const waitFor = async expression => {
    const until = Date.now() + 15000;
    while (!await evaluate(expression)) { if (Date.now() > until) throw new Error('Lab UI timed out: ' + expression); await pause(100); }
  };
  await press('Escape');
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  const snapshot = `JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))`;
  const original = await evaluate(snapshot);
  await click('.ep-pause a[href^="magic-lab.html"]');
  await pause(300);
  await waitFor(`document.querySelector('canvas[data-surface="lab"]')?.dataset.ready === 'true'`);
  const expression = async text => {
    await evaluate(`document.querySelector('#lab-expression').focus(); document.querySelector('#lab-expression').select()`);
    await contents.insertText(text); await pause(80);
  };
  const cast = async (x, y) => {
    const point = await evaluate(`(() => { const r=document.querySelector('canvas[data-surface="lab"]').getBoundingClientRect(); return {x:Math.round(r.x+r.width*${x}/768),y:Math.round(r.y+r.height*${y}/384)}; })()`);
    contents.sendInputEvent({ type: 'mouseMove', ...point });
    contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  };
  await expression('telo o tawa wawa');
  for (let n = 0; n < 4; n++) { await cast(195, 326); await pause(1050); }
  const stats = await evaluate(`({...document.querySelector('canvas[data-surface="lab"]').dataset})`);
  if (Number(stats.casts) !== 4 || Number(stats.destroyed) <= 0 || stats.traveler !== 'v0.6') throw new Error('Native lab impact/atlas failed: ' + JSON.stringify(stats));
  await expression('kiwen'); await cast(664, 300); await pause(200);
  if (await evaluate(`document.querySelector('canvas[data-surface="lab"]').dataset.casts`) !== '4') throw new Error('Locked structure accepted a manifestation');
  await expression('kon'); await cast(76, 318); await pause(120);
  if (await evaluate(`document.querySelector('canvas[data-surface="lab"]').dataset.casts`) !== '5') throw new Error('Self-overlapping field was rejected');
  await expression('telo o tawa wawa'); await cast(76, 329); await pause(120);
  if (await evaluate(`document.querySelector('canvas[data-surface="lab"]').dataset.casts`) !== '6') throw new Error('Point-blank spell was rejected');
  if (await evaluate(snapshot) !== original) throw new Error('Laboratory changed campaign storage');
  const performance = await evaluate(`new Promise(resolve => { const frames=[];let previous;function sample(now){if(previous!==undefined)frames.push(now-previous);previous=now;if(frames.length<180)return requestAnimationFrame(sample);frames.sort((a,b)=>a-b);resolve({frames:180,medianMs:frames[90],p95Ms:frames[171],over33Ms:frames.filter(n=>n>33.4).length});}requestAnimationFrame(sample);})`);
  if (performance.medianMs > 33.4) throw new Error('Lab frame-time gate failed: ' + JSON.stringify(performance));
  fs.writeFileSync(path.join(path.dirname(reportPath), 'lab.png'), (await contents.capturePage()).toPNG());
  await click('[data-lab="return"]'); await pause(300);
  await waitFor(`document.querySelector('canvas[data-surface="game"]')?.dataset.ready === 'true'`);
  return { nativeImpactCasts: 4, nativeSelfAreaCasts: 2, destructibleCellsRemoved: Number(stats.destroyed), lockRefused: true, mainStorageUnchangedWhileInLab: true, returnedToEpisode: true, performance };
}
