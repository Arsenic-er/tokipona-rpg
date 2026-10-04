#!/usr/bin/env bash
# Project-local server toolchain; no global shell profile or system library changes.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tools_root=${TOKIPONA_TOOLS_ROOT:-"$HOME/.local/share/tokipona-tools"}
node_bin="$tools_root/node-v22.14.0-linux-x64/bin"
pnpm_bin="$tools_root/pnpm-11.19.0/node_modules/.bin"
if [ ! -x "$node_bin/node" ] || [ ! -x "$pnpm_bin/pnpm" ]; then
  printf '%s\n' 'Missing project-local Node 22.14.0 / pnpm 11.19.0. See docs/handoffs/2026-10-01-server-resume-zh.md.' >&2
  exit 1
fi
export PATH="$pnpm_bin:$node_bin:$PATH"
browser_libs="$tools_root/browser-libs/root/usr/lib/x86_64-linux-gnu"
if [ -d "$browser_libs" ]; then
  export LD_LIBRARY_PATH="$browser_libs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
if [ -f "$tools_root/browser-libs/fonts.conf" ]; then
  export FONTCONFIG_FILE="$tools_root/browser-libs/fonts.conf"
fi
cd "$repo_root"
exec pnpm "$@"
