// Runs only with an explicit isolated profile and report path set by the build smoke test.
const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.run = async (window, app, loadErrors = []) => {
  const reportPath = process.env.TOKIPONA_SMOKE_REPORT;
  const phase = process.env.TOKIPONA_SMOKE_PHASE;
  const key = 'tokipona.forest-opening.vertical-slice.v0.1';
  const contents = window.webContents;
  const errors = [...loadErrors];
  let performanceProof = null;
  let videoProof = null;
  const onConsole = (_event, details, legacyMessage) => {
    const level = typeof details === 'object' ? details.level : details;
    if (level === 'error' || level === 3) errors.push(typeof details === 'object' ? details.message : legacyMessage);
  };
  contents.on('console-message', onConsole);
  try {
    const deadline = Date.now() + 25000;
    while (!(await contents.executeJavaScript(`!!document.querySelector('[aria-label="旅途笔记（J）"]') &&
      document.querySelector('.forest-opening__candidate').textContent.includes('v0.6')`))) {
      if (Date.now() > deadline) throw new Error('Offline game or candidate art did not load');
      await pause(100);
    }
    const isolated = await contents.executeJavaScript(`typeof require === 'undefined' && typeof process === 'undefined'`);
    if (!isolated) throw new Error('Renderer unexpectedly has Node privileges');
    const marker = await contents.executeJavaScript(`localStorage.getItem('tokipona.desktop.smoke')`);
    if (phase === 'restore' && marker !== 'persisted') throw new Error('Desktop storage did not persist across EXE launches');
    if (phase === 'fresh' && marker !== null) throw new Error('Smoke test profile was not fresh');
    const initialSave = await contents.executeJavaScript(`localStorage.getItem('${key}')`);
    if (!initialSave || JSON.parse(initialSave).schema !== 'tokipona.browser-forest-opening.v0.1') {
      throw new Error('Game save is missing or invalid');
    }
    // Native keyboard input needs a visible focused window; keep it scoped and brief.
    window.show(); window.focus(); contents.focus();
    await pause(300);
    if (phase === 'fresh') {
      const press = async keyCode => {
        contents.sendInputEvent({ type: 'keyDown', keyCode });
        contents.sendInputEvent({ type: 'keyUp', keyCode });
        await pause(300);
      };
      await press('F11');
      if (!window.isFullScreen()) throw new Error('F11 did not enter fullscreen');
      await press('F11');
      if (window.isFullScreen()) throw new Error('F11 did not leave fullscreen');
      await press('J');
      if (!(await contents.executeJavaScript(`document.querySelector('.forest-journey__journal').open`))) {
        throw new Error('Journal keyboard input did not open the journey notes');
      }
      await press('Escape');
      if (await contents.executeJavaScript(`document.querySelector('.forest-journey__journal').open`)) {
        throw new Error('Journal did not close and resume the game');
      }
      await contents.executeJavaScript(`localStorage.setItem('tokipona.desktop.smoke', 'persisted')`);
      if(JSON.parse(initialSave).spatial.obstacle.creek?.schema!=='tokipona.forest-creek.v0.3') {
        throw new Error('Desktop did not open the integrated physical world');
      }
      videoProof=await contents.executeJavaScript(`(() => {
        const canvas=document.querySelector('canvas[data-surface="game"]');
        const stream=canvas.captureStream(30);
        const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
        const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});
        const chunks=[];recorder.ondataavailable=event=>{if(event.data.size) chunks.push(event.data)};
        window.__tokiponaSmokeRecording={recorder,chunks,stream};recorder.start(250);
        return {width:canvas.width,height:canvas.height,requestedFps:30,mime,file:'gameplay.webm',audio:false};
      })()`);
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'D' });
      await pause(1400);
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'D' });
      await pause(400);
      await contents.executeJavaScript(`window.dispatchEvent(new Event('pagehide'))`);
      const saved = await contents.executeJavaScript(`localStorage.getItem('${key}')`);
      if (JSON.parse(saved).spatial.spatial.player.x <= JSON.parse(initialSave).spatial.spatial.player.x + 10) {
        throw new Error('Keyboard movement did not advance and save the player: ' + JSON.stringify({
          before: JSON.parse(initialSave).spatial.spatial.player.x, after: JSON.parse(saved).spatial.spatial.player.x,
          tick: JSON.parse(saved).spatial.spatial.tick }));
      }
      // Walk to the actual creek using native keys and ordinary game time.
      const creekDeadline = Date.now() + 45000;
      let jumpCooldown=0;
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'D' });
      try {
        while (!(await contents.executeJavaScript(`document.querySelector('[data-hud="prompt"]').textContent.includes('疏通松土')`))) {
          if (Date.now() > creekDeadline) throw new Error('Native walk did not reach the creek tool prompt');
          const stone=await contents.executeJavaScript(`document.querySelector('[data-hud="prompt"]').textContent.includes('松石')`);
          if(stone && jumpCooldown===0) {contents.sendInputEvent({type:'keyDown',keyCode:'W'});jumpCooldown=12;}
          if(jumpCooldown===8) contents.sendInputEvent({type:'keyUp',keyCode:'W'});
          if(jumpCooldown>0) jumpCooldown--;
          await pause(100);
        }
      } finally {
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'D' });
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'W' });
      }
      await press('E');
      await pause(1500);
      const recorded=await contents.executeJavaScript(`new Promise(resolve=>{
        const recording=window.__tokiponaSmokeRecording;
        recording.recorder.onstop=async()=>{
          const buffer=await new Blob(recording.chunks,{type:'video/webm'}).arrayBuffer();
          recording.stream.getTracks().forEach(track=>track.stop());
          delete window.__tokiponaSmokeRecording;resolve(Array.from(new Uint8Array(buffer)));
        };
        recording.recorder.stop();
      })`);
      if(recorded.length<1000) throw new Error('Native gameplay recording is empty');
      fs.writeFileSync(path.join(path.dirname(reportPath),'gameplay.webm'),Buffer.from(recorded));
      videoProof.bytes=recorded.length;
      const profiling=process.env.TOKIPONA_CPU_PROFILE==='1';
      if(profiling) {
        contents.debugger.attach('1.3');
        await contents.debugger.sendCommand('Profiler.enable');
        await contents.debugger.sendCommand('Profiler.start');
      }
      // Observe real frame intervals while the newly opened creek is flowing.
      // This is one local desktop sample, not an Android/60 fps certification.
      performanceProof = await contents.executeJavaScript(`new Promise(resolve => {
        const intervals = []; let previous;
        function sample(now) {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (intervals.length < 180) return requestAnimationFrame(sample);
          intervals.sort((a, b) => a - b);
          resolve({ frames: intervals.length, medianMs: intervals[90], p95Ms: intervals[171],
            over33Ms: intervals.filter(ms => ms > 33.4).length,
            viewport: [innerWidth, innerHeight], dpr: devicePixelRatio });
        }
        requestAnimationFrame(sample);
      })`);
      performanceProof.rendererWorkingSetKiB = app.getAppMetrics().filter(metric => metric.type === 'Tab')
        .reduce((sum, metric) => sum + metric.memory.workingSetSize, 0);
      performanceProof.cpu = require('node:os').cpus()[0]?.model;
      performanceProof.totalMemoryBytes = require('node:os').totalmem();
      performanceProof.gpu = app.getGPUFeatureStatus();
      if(profiling) {
        const {profile}=await contents.debugger.sendCommand('Profiler.stop');
        fs.writeFileSync(path.join(path.dirname(reportPath),'renderer.cpuprofile'),JSON.stringify(profile));
        contents.debugger.detach();
      }
      await contents.executeJavaScript(`window.dispatchEvent(new Event('pagehide'))`);
      const creekSave = JSON.parse(await contents.executeJavaScript(`localStorage.getItem('${key}')`));
      const creek = creekSave.spatial.obstacle.creek;
      if (!creek || creek.excavatedSoil !== 96 || creek.grid.material.filter(m => m === 4).length !== 400 ||
        creek.grid.material.filter(m=>m===3).length!==96 ||
        !creek.grid.material.some((m, i) => m === 4 && i % 128 >= 72 && Math.floor(i / 128) >= 24)) {
        throw new Error('EXE creek excavation/flow/mass check failed');
      }
      await contents.executeJavaScript(`localStorage.setItem('tokipona.desktop.smoke.save', localStorage.getItem('${key}'))`);
    } else {
      const previous = JSON.parse(await contents.executeJavaScript(`localStorage.getItem('tokipona.desktop.smoke.save')`));
      const current = JSON.parse(initialSave);
      // Real time may advance while loading; the player's progress must survive.
      if (current.spatial.spatial.player.x !== previous.spatial.spatial.player.x ||
          JSON.stringify(current.session.state.mp) !== JSON.stringify(previous.session.state.mp) ||
          JSON.stringify(current.session.eventLedger) !== JSON.stringify(previous.session.eventLedger)) {
        throw new Error('Desktop player progress did not survive restarting the EXE');
      }
      const creek = current.spatial.obstacle.creek;
      if (creek.excavatedSoil !== 96 || creek.grid.material.filter(m => m === 4).length !== 400 ||
        creek.grid.tick < previous.spatial.obstacle.creek.grid.tick) throw new Error('EXE creek state did not persist');
    }
    // Native capture of the real packaged window, not a dev server screenshot.
    fs.writeFileSync(path.join(path.dirname(reportPath), phase + '.png'), (await contents.capturePage()).toPNG());
    fs.writeFileSync(reportPath, JSON.stringify({ ok: true, phase, origin: contents.getURL(),
      candidate: 'v0.6', sandboxed: isolated, userData: app.getPath('userData'), performance: performanceProof, video: videoProof, errors }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(path.dirname(reportPath), phase + '.png'), (await contents.capturePage()).toPNG());
    fs.writeFileSync(reportPath, JSON.stringify({ ok: false, phase, error: String(error.stack), errors }, null, 2));
  } finally {
    contents.removeListener('console-message', onConsole);
    await contents.session.flushStorageData();
    app.quit();
  }
};
