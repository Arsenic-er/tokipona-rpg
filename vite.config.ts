import { defineConfig } from "vite";
import generatedRuntimeArtifact from "./src/generated/content-runtime.v0.1.json" with { type: "json" };

const extensionLearningAdmitted =
  generatedRuntimeArtifact.learningCorpusCatalog.admittedCorpusIds.length > 0;

export default defineConfig({
  base: "./",
  define: {
    __TOKIPONA_EXTENSION_LEARNING_ADMITTED__: JSON.stringify(extensionLearningAdmitted),
  },
  build: {
    target: "es2022",
    manifest: true,
    rolldownOptions: {
      input: ["index.html", "survival.html", "trade.html", "cistern.html", "rpg.html"],
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: "rpg-ui",
              test: /[\\/]src[\\/]rpg-(?!main)[^\\/]*\.ts$/,
              priority: 50,
              minSize: 8 * 1024,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
            {
              name: "learning-runtime",
              test: /[\\/]src[\\/](?:learning|spells)[\\/]/,
              priority: 40,
              minSize: 8 * 1024,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
            {
              name: "session-runtime",
              test: /[\\/]src[\\/](?:session|persistence)[\\/]/,
              priority: 30,
              minSize: 8 * 1024,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
            {
              name: "game-runtime",
              test: /[\\/]src[\\/]game[\\/]/,
              priority: 20,
              minSize: 8 * 1024,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
            {
              name: "app-support",
              test: /[\\/]src[\\/](?:acceptance|assets|content|runtime)[\\/]/,
              priority: 10,
              minSize: 8 * 1024,
              entriesAware: true,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
});
