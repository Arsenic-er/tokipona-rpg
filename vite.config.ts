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
      __TOKIPONA_LOCAL_DESKTOP__: "false",
      __TOKIPONA_EXTENSION_LEARNING_ADMITTED__: JSON.stringify(admittedExtensionLearning),
    },
    build: {
      target: "es2022",
      manifest: true,
      rolldownOptions: {
        input: [
          "index.html",
          "survival.html",
          "trade.html",
          "cistern.html",
          "rpg.html",
          "world-scale.html",
          "chapter-one.html",
          "magic-lab.html",
        ],
        output: {
          strictExecutionOrder: true,
          // Entry-aware names repeat in every import; keep URLs compact while
          // preserving the manifest's full ownership names for boundary audits.
          chunkFileNames: (chunk) => `assets/${chunk.name.replaceAll("forest-episode-main", "episode").replaceAll("chapter-one", "ch1").replaceAll("magic-lab", "lab")}-[hash].js`,
          codeSplitting: {
            groups: [
              {
                // Experimental permissions/effects must never be merged into
                // a campaign learning or game-runtime chunk.
                name: 'lab-only',
                test: /[\\/]src[\\/](?:game[\\/]magic-lab|spells[\\/]lab-expression|visual[\\/]magic-lab-renderer)\.ts$/,
                priority: 110,
                minSize: 0,
                entriesAware: false,
                includeDependenciesRecursively: false,
              },
              {
                // Share tiny framework/JSON/geometry primitives, not scene or
                // story modules. Keeps both chapter routes within request budgets.
                name: "shared-base",
                test: /(?:[\\/]src[\\/](?:canonical-json|runtime[\\/]geometry)\.ts$|(?:modulepreload-polyfill|preload-helper))/,
                priority: 70,
                minSize: 0,
                entriesAware: false,
                includeDependenciesRecursively: false,
              },
              {
                name: "extension-learning",
                test: /[\\/]src[\\/](?:persistence[\\/]browser-learning-corpus-adapter|rpg-extension-learning-ui|generated[\\/]learning-corpus-packages\.v0\.1|learning[\\/]corpus-partition(?:-collection)?)(?:\.v0\.1)?\.(?:ts|json)$/,
                priority: 100,
                minSize: 0,
                entriesAware: true,
                includeDependenciesRecursively: false,
              },
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
                entriesAwareMergeThreshold: 64 * 1024,
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
                // Share the tiny lazy-import preload helper with the existing
                // app-support chunk rather than adding a separate first-load request.
                test: /(?:[\\/]src[\\/](?:acceptance|assets|content|runtime)[\\/]|vite[\\/]preload-helper)/,
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
