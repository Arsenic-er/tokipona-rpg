import { defineConfig, mergeConfig } from "vitest/config";
import { createTokiponaViteConfig } from "./vite.config.ts";

export default defineConfig(mergeConfig(createTokiponaViteConfig(), {
  test: {
    include: ["scripts/acceptance/**/*.release.ts"],
  },
}));
