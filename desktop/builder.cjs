// electron-builder 26.x, local portable QA only. No upload or auto-updater.
module.exports = {
  appId: 'org.tokipona.rpg', productName: 'tokipona-rpg', executableName: 'tokipona-rpg',
  directories: { app: 'exports/windows/.build/app', output: 'exports/windows/.build/package' },
  files: ['main.cjs', 'security.cjs', 'smoke-probe.cjs', 'episode-smoke-probe.cjs', 'web/**/*'], asar: true, npmRebuild: false,
  electronLanguages: ['zh-CN', 'en-US'], publish: null,
  electronDist: 'node_modules/electron/dist',
  win: { target: [{ target: 'portable', arch: ['x64'] }], signAndEditExecutable: false },
  portable: { artifactName: 'tokipona-rpg-latest.exe', requestExecutionLevel: 'user', unpackDirName: false },
};
