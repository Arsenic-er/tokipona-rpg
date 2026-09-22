const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const executable = path.resolve(process.argv[2] || 'exports/windows/.build/package/tokipona-rpg-latest.exe');
const root = path.resolve(process.env.TOKIPONA_SMOKE_OUTPUT || 'exports/windows/.build/smoke');
fs.mkdirSync(root, { recursive: true });
const profile = fs.mkdtempSync(path.join(root, 'profile-'));

async function run(phase) {
  const report = path.join(root, phase + '.json');
  if (fs.existsSync(report)) fs.unlinkSync(report);
  const env = {
    ...process.env, TOKIPONA_TEST_PROFILE: profile,
    TOKIPONA_SMOKE_REPORT: report, TOKIPONA_SMOKE_PHASE: phase,
  };
  // A present-but-empty ELECTRON_RUN_AS_NODE can still change Electron's boot mode.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(executable, [], { windowsHide: true, stdio: 'ignore', env });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged EXE smoke timed out')); }, 90000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('EXE exited: ' + code)); });
  });
  const result = JSON.parse(fs.readFileSync(report, 'utf8'));
  if (!result.ok || result.errors.length) throw new Error(JSON.stringify(result));
  if (result.performance && result.performance.medianMs > 33.4) {
    throw new Error('Desktop candidate below minimum frame-rate gate: '+JSON.stringify(result.performance));
  }
  console.log(JSON.stringify(result));
}
(async () => { await run('fresh'); await run('restore'); })().catch(error => { console.error(error); process.exitCode = 1; });
