const { app, BrowserWindow, Menu, protocol, net, session, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { GAME_URL, canNavigate, resolveGameFile } = require('./security.cjs');

app.setName('tokipona-rpg');
// Keep saves outside the replaceable EXE and NSIS temporary extraction folder.
const testProfile = process.env.TOKIPONA_TEST_PROFILE;
app.setPath('userData', testProfile || path.join(app.getPath('appData'), 'tokipona-rpg'));
protocol.registerSchemesAsPrivileged([{ scheme: 'tokipona', privileges: {
  standard: true, secure: true, supportFetchAPI: true,
} }]);

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
let window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const root = path.join(app.getAppPath(), 'web');
    protocol.handle('tokipona', async request => {
      const file = resolveGameFile(request.url, root);
      if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
      try {
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', CSP);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true }));
    Menu.setApplicationMenu(null);
    window = new BrowserWindow({
      title: 'tokipona-rpg · 本地试玩', width: 1440, height: 900, minWidth: 800, minHeight: 450,
      backgroundColor: '#1c2a29', show: false, autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
        webSecurity: true, spellcheck: false, backgroundThrottling: !testProfile, devTools: !!testProfile },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!canNavigate(url)) event.preventDefault(); });
    window.webContents.on('will-redirect', (event, url) => { if (!canNavigate(url)) event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && (input.key === 'F11' || input.key === 'Enter' && input.alt)) {
        window.setFullScreen(!window.isFullScreen()); event.preventDefault();
      }
    });
    window.webContents.on('render-process-gone', () => {
      dialog.showErrorBox('游戏画面已停止', '请关闭并重新打开游戏。已保存的进度保留在本机，不会自动清空。');
    });
    window.once('ready-to-show', () => { if (!testProfile) { window.maximize(); window.show(); } });
    const loadErrors = [];
    const captureConsole = (_event, details, message) => {
      const level = typeof details === 'object' ? details.level : details;
      if (level === 'error' || level === 3) loadErrors.push(typeof details === 'object' ? details.message : message);
    };
    if (testProfile) window.webContents.on('console-message', captureConsole);
    await window.loadURL(GAME_URL);
    if (testProfile) window.webContents.removeListener('console-message', captureConsole);
    if (testProfile && process.env.TOKIPONA_SMOKE_REPORT) {
      await require(process.env.TOKIPONA_EPISODE_SMOKE === '1' ? './episode-smoke-probe.cjs' : './smoke-probe.cjs').run(window, app, loadErrors);
    }
  }).catch(error => {
    if (testProfile && process.env.TOKIPONA_SMOKE_REPORT) {
      require('node:fs').writeFileSync(process.env.TOKIPONA_SMOKE_REPORT, JSON.stringify({ ok: false, error: String(error.stack) }));
      app.exit(1);
    } else { dialog.showErrorBox('游戏启动失败', String(error.message)); app.quit(); }
  });
}
app.on('window-all-closed', () => app.quit());
