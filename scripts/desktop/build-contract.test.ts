import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createTokiponaViteConfig } from "../../vite.config";
import desktopConfig from "../../desktop/vite.config";
const require = createRequire(import.meta.url);
const builder = require("../../desktop/builder.cjs");

describe("local-only desktop packaging", () => {
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
