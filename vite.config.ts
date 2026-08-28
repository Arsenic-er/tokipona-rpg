import { defineConfig, type UserConfig } from "vite";
import generatedRuntimeArtifact from "./src/generated/content-runtime.v0.1.json" with { type: "json" };
import { assertExtensionLearningBundleBoundary } from
  "./scripts/build/extension-learning-bundle-boundary.ts";
import { assertForestChapterBundleBoundary } from
  "./scripts/build/forest-chapter-bundle-boundary.ts";

const extensionLearningAdmitted =
  generatedRuntimeArtifact.learningCorpusCatalog.admittedCorpusIds.length > 0;

export function createTokiponaViteConfig(
  admittedExtensionLearning = extensionLearningAdmitted,
): UserConfig {
  return {
    base: "./",
    plugins: [{
      name: "extension-learning-bundle-boundary",
      generateBundle(_options, bundle) {
        assertExtensionLearningBundleBoundary(
          Object.values(bundle).filter((output) => output.type === "chunk").map((chunk) => ({
            fileName: chunk.fileName,
            facadeModuleId: chunk.facadeModuleId,
            isEntry: chunk.isEntry,
            isDynamicEntry: chunk.isDynamicEntry,
            imports: chunk.imports,
            dynamicImports: chunk.dynamicImports,
            moduleIds: Object.keys(chunk.modules),
          })),
          admittedExtensionLearning,
        );
        assertForestChapterBundleBoundary(
          Object.values(bundle).filter((output) => output.type === "chunk").map((chunk) => ({
            fileName: chunk.fileName,
            facadeModuleId: chunk.facadeModuleId,
            isEntry: chunk.isEntry,
            imports: chunk.imports,
            moduleIds: Object.keys(chunk.modules),
          })),
        );
      },
    }],
    define: {
      __TOKIPONA_EXTENSION_LEARNING_ADMITTED__: JSON.stringify(admittedExtensionLearning),
    },
    build: {
      target: "es2022",
      manifest: true,
      rolldownOptions: {
        input: ["index.html", "survival.html", "trade.html", "cistern.html", "rpg.html", "world-scale.html"],
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
  };
}

export default defineConfig(createTokiponaViteConfig());
