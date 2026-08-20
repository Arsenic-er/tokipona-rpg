import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { createTokiponaViteConfig } from "../../vite.config";

describe("future admitted extension learning build", () => {
  it("emits the reviewed reducer only behind the RPG dynamic edge", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "tokipona-extension-build-"));
    try {
      const config = createTokiponaViteConfig(true);
      await build({
        ...config,
        configFile: false,
        logLevel: "silent",
        build: {
          ...config.build,
          outDir: outputDirectory,
          emptyOutDir: true,
        },
      });
      const manifest = JSON.parse(await readFile(
        join(outputDirectory, ".vite", "manifest.json"),
        "utf8",
      )) as Record<string, { readonly file: string; readonly imports?: readonly string[];
        readonly dynamicImports?: readonly string[] }>;
      const loaderKey = Object.keys(manifest).find((key) =>
        `/${key.replaceAll("\\", "/")}`
          .endsWith("/src/persistence/browser-learning-corpus-loader.ts"));
      expect(loaderKey).toBeDefined();
      expect(manifest["rpg.html"]?.dynamicImports).toContain(loaderKey);
      expect(manifest["rpg.html"]?.imports).not.toContain(loaderKey);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
