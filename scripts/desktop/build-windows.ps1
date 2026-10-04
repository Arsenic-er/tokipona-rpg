$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = [IO.Path]::GetFullPath((Join-Path $repo 'exports/windows'))
$stage = [IO.Path]::GetFullPath((Join-Path $output '.build'))
$latest = Join-Path $output 'tokipona-rpg-latest.exe'
$backup = Join-Path $output '.previous.exe'
$marker = '.tokipona-desktop-build'

function Assert-LocalDirectory([string]$target, [string]$expected) {
  if ([IO.Path]::GetFullPath($target) -ne $expected -or $expected -eq $repo) { throw 'Unsafe build target' }
  if (Test-Path -LiteralPath $target) {
    if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Build target is a link' }
    $linked = Get-ChildItem -LiteralPath $target -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
    if ($linked) { throw 'Build target contains a link' }
  }
}
function Run-Step([string]$command, [string[]]$arguments) {
  & $command @arguments
  if ($LASTEXITCODE -ne 0) { throw "$command failed ($LASTEXITCODE)" }
}
function Test-Episode([string]$executable) {
  try {
    $env:TOKIPONA_EPISODE_SMOKE = '1'
    $env:TOKIPONA_EPISODE_FIXTURE = Join-Path $repo '.codex-tmp/forest-episode/start.json'
    $env:TOKIPONA_SMOKE_OUTPUT = Join-Path $stage 'episode-smoke'
    Run-Step 'node' @('scripts/desktop/smoke.cjs', $executable)
  } finally {
    Remove-Item Env:TOKIPONA_EPISODE_SMOKE -ErrorAction SilentlyContinue
    Remove-Item Env:TOKIPONA_EPISODE_FIXTURE -ErrorAction SilentlyContinue
    Remove-Item Env:TOKIPONA_SMOKE_OUTPUT -ErrorAction SilentlyContinue
  }
}

Push-Location $repo
try {
  Assert-LocalDirectory $output ([IO.Path]::GetFullPath((Join-Path $repo 'exports/windows')))
  New-Item -ItemType Directory -Path $output -Force | Out-Null
  Assert-LocalDirectory $stage ([IO.Path]::GetFullPath((Join-Path $output '.build')))
  if (Test-Path -LiteralPath $stage) {
    if (!(Test-Path -LiteralPath (Join-Path $stage $marker))) { throw 'Unowned build directory; refusing deletion' }
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
  $buildDrive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($repo))
  if ($buildDrive.AvailableFreeSpace -lt 1GB) {
    throw 'Windows build needs at least 1 GiB free for packaging and portable extraction. Previous EXE and player saves are unchanged.'
  }
  New-Item -ItemType Directory -Path $stage | Out-Null
  New-Item -ItemType File -Path (Join-Path $stage $marker) | Out-Null
  Run-Step 'node' @('scripts/desktop/ensure-runtime.cjs')
  Run-Step 'pnpm' @('run', 'assets:dev-sync')
  Run-Step 'pnpm' @('run', 'build')
  Run-Step 'pnpm' @('run', 'assets:check')
  Run-Step 'pnpm' @('exec', 'vitest', 'run', 'scripts/desktop', '--maxWorkers=1', '--pool=threads')
  Run-Step 'pnpm' @('exec', 'vitest', 'run', 'scripts/testing/forest-episode-fixture.test.ts', '--maxWorkers=1', '--pool=threads')
  Run-Step 'pnpm' @('exec', 'vite', 'build', '--config', 'desktop/vite.config.ts')
  $app = Join-Path $stage 'app'
  New-Item -ItemType Directory -Path $app | Out-Null
  foreach ($name in @('main.cjs', 'security.cjs', 'smoke-probe.cjs', 'episode-smoke-probe.cjs', 'package.json')) {
    Copy-Item -LiteralPath (Join-Path $repo "desktop/$name") -Destination $app
  }
  Move-Item -LiteralPath (Join-Path $stage 'web') -Destination (Join-Path $app 'web')
  $art = Join-Path $app 'web/src/local-art-cache'
  New-Item -ItemType Directory -Path $art -Force | Out-Null
  foreach ($name in @('traveler-atlas.v0.6.png', 'background-far.v0.3.png')) {
    Copy-Item -LiteralPath (Join-Path $repo "src/local-art-cache/$name") -Destination $art
  }
  Run-Step 'pnpm' @('exec', 'electron-builder', '--config', 'desktop/builder.cjs', '--win', '--dir', '--x64', '--publish', 'never')
  Run-Step 'node' @('scripts/desktop/smoke.cjs', (Join-Path $stage 'package/win-unpacked/tokipona-rpg.exe'))
  Test-Episode (Join-Path $stage 'package/win-unpacked/tokipona-rpg.exe')
  Run-Step 'pnpm' @('exec', 'electron-builder', '--config', 'desktop/builder.cjs', '--win', 'portable', '--x64', '--publish', 'never')
  $candidate = Join-Path $stage 'package/tokipona-rpg-latest.exe'
  if (!(Test-Path -LiteralPath $candidate) -or (Get-Item -LiteralPath $candidate).Length -lt 1000000) { throw 'EXE missing or incomplete' }
  # The portable smoke extracts its own runtime. The already-tested unpacked
  # build is now redundant; retire this owned copy before allocating another.
  $unpacked = [IO.Path]::GetFullPath((Join-Path $stage 'package/win-unpacked'))
  $expectedUnpacked = [IO.Path]::GetFullPath((Join-Path $repo 'exports/windows/.build/package/win-unpacked'))
  Assert-LocalDirectory $stage ([IO.Path]::GetFullPath((Join-Path $repo 'exports/windows/.build')))
  if (!(Test-Path -LiteralPath (Join-Path $stage $marker))) { throw 'Unowned build directory; refusing cleanup' }
  Assert-LocalDirectory $unpacked $expectedUnpacked
  Remove-Item -LiteralPath $unpacked -Recurse -Force
  Run-Step 'node' @('scripts/desktop/smoke.cjs', $candidate)
  # Check the actual portable's continuation route before replacing the player's EXE.
  Test-Episode $candidate
  # Only a verified candidate replaces the current EXE. No save directory is ever a cleanup target.
  if (Test-Path -LiteralPath $backup) { throw 'Unexpected previous artifact; inspect before replacing' }
  if (Test-Path -LiteralPath $latest) { [IO.File]::Replace($candidate, $latest, $backup) }
  else { Move-Item -LiteralPath $candidate -Destination $latest }
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
  # Retain screenshots/reports, not duplicate executable builds.
  $evidence = Join-Path $repo '.codex-tmp/desktop-latest'
  New-Item -ItemType Directory -Path $evidence -Force | Out-Null
  foreach ($name in @('fresh.json', 'restore.json', 'fresh.png', 'restore.png', 'gameplay.webm')) {
    Copy-Item -LiteralPath (Join-Path $stage "smoke/$name") -Destination $evidence -Force
  }
  Write-Output "Latest offline game: $latest"
  Copy-Item -LiteralPath (Join-Path $stage 'smoke/gameplay.webm') -Destination (Join-Path $output 'tokipona-rpg-review.webm') -Force
  # Some Windows PowerShell installations omit Get-FileHash; use the framework API.
  $digest = [Security.Cryptography.SHA256]::Create()
  $artifactStream = [IO.File]::OpenRead($latest)
  try { Write-Output ('SHA256: ' + [BitConverter]::ToString($digest.ComputeHash($artifactStream)).Replace('-', '')) }
  finally { $artifactStream.Dispose(); $digest.Dispose() }
} finally {
  if (Test-Path -LiteralPath (Join-Path $stage $marker)) {
    Assert-LocalDirectory $stage ([IO.Path]::GetFullPath((Join-Path $output '.build')))
    $evidence = Join-Path $repo '.codex-tmp/desktop-latest'
    New-Item -ItemType Directory -Path $evidence -Force | Out-Null
    foreach ($name in @('fresh.json', 'restore.json', 'fresh.png', 'restore.png', 'gameplay.webm')) {
      $proof = Join-Path $stage "smoke/$name"
      if (Test-Path -LiteralPath $proof) { Copy-Item -LiteralPath $proof -Destination $evidence -Force }
    }
    foreach ($name in @('fresh.json', 'restore.json', 'fresh.png', 'restore.png', 'map.png', 'lab.png')) {
      $proof = Join-Path $stage "episode-smoke/$name"
      if (Test-Path -LiteralPath $proof) { Copy-Item -LiteralPath $proof -Destination (Join-Path $evidence "episode-$name") -Force }
    }
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
  Pop-Location
}
