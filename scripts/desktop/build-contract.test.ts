import { createRequire } from "node:module";
import { readFileSync } from 'node:fs';
import { describe, expect, it } from "vitest";
import { createTokiponaViteConfig } from "../../vite.config";
import desktopConfig from "../../desktop/vite.config";
const require = createRequire(import.meta.url);
const builder = require("../../desktop/builder.cjs");

describe("local-only desktop packaging", () => {
  it('retires only the owned unpacked copy after packaging and before portable extraction', () => {
    const script = readFileSync(new URL('./build-windows.ps1', import.meta.url), 'utf8');
    const packaged = script.indexOf("'--win', 'portable'");
    const cleanup = script.indexOf('Remove-Item -LiteralPath $unpacked -Recurse -Force');
    const smoke = script.indexOf("Run-Step 'node' @('scripts/desktop/smoke.cjs', $candidate)");
    expect(packaged).toBeGreaterThan(0); expect(cleanup).toBeGreaterThan(packaged); expect(smoke).toBeGreaterThan(cleanup);
    expect(script.slice(packaged, cleanup)).toContain('Assert-LocalDirectory $unpacked $expectedUnpacked');
    expect(script.slice(packaged, cleanup)).toContain("'exports/windows/.build/package/win-unpacked'");
    expect(script.slice(packaged, cleanup)).toContain("'Unowned build directory; refusing cleanup'");
    expect(script.indexOf('[IO.File]::Replace')).toBeGreaterThan(smoke);
    expect(script).toContain('$buildDrive.AvailableFreeSpace -lt 1GB');
    expect(script.indexOf('$buildDrive.AvailableFreeSpace')).toBeLessThan(script.indexOf("Run-Step 'node' @('scripts/desktop/ensure-runtime.cjs')"));
  });
  it("never enables private candidates in the default public build", () => {
    expect(createTokiponaViteConfig().define?.__TOKIPONA_LOCAL_DESKTOP__).toBe("false");
    expect(desktopConfig.define?.__TOKIPONA_LOCAL_DESKTOP__).toBe("true");
    expect(desktopConfig.build?.outDir).toBe("exports/windows/.build/web");
    expect(desktopConfig.build?.outDir).not.toBe("dist");
  });
  it("has one fixed offline artifact, a narrow payload and no publishing", () => {
    expect(builder.portable.artifactName).toBe("tokipona-rpg-latest.exe");
    expect(builder.portable.requestExecutionLevel).toBe("user");
    expect(builder.portable.unpackDirName).toBe(false);
    expect(builder.publish).toBeNull();
    expect(builder.files).toEqual(['main.cjs', 'security.cjs', 'smoke-probe.cjs', 'episode-smoke-probe.cjs', 'web/**/*']);
    expect(builder.directories.output).toBe('exports/windows/.build/package');
  });
});
