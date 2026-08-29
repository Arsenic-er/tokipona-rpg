import { describe, expect, it } from "vitest";
import { assertBundleBudget, BUNDLE_BUDGETS, EXPECTED_BUILD_ENTRIES } from "./bundle-budget";

describe("production bundle budget", () => {
  it("accepts the six-entry build with an isolated world-scale prototype", () => {
    const fixture = createFixture();
    const report = assertBundleBudget(fixture.manifest, (file) => fixture.sizes[file] ?? 0);

    expect(report.status).toBe("pass");
    expect(report.entries.map((entry) => entry.entry)).toEqual(EXPECTED_BUILD_ENTRIES);
    expect(report.entries.find((entry) => entry.entry === "rpg.html")?.initialJsRequests).toBe(7);
  });

  it("rejects world-scale coupling to RPG game, GameSession, learning, or UI chunks", () => {
    for (const chunkKey of ["_game", "_session", "_learning", "_ui"]) {
      const fixture = createFixture();
      fixture.manifest["world-scale.html"].imports = [chunkKey];

      expect(() => assertFixture(fixture)).toThrow(
        `bundle_world_scale_domain_dependency:${fixture.manifest[chunkKey].name}`,
      );
    }
  });

  it("rejects multi-entry session owner names in the world-scale closure", () => {
    const fixture = createFixture();
    fixture.manifest._sessionMulti = chunkRecord(
      "assets/session-multi.js",
      "session-runtime~trade~rpg~world-scale",
    );
    fixture.sizes["assets/session-multi.js"] = 1;
    fixture.manifest["world-scale.html"].imports = ["_sessionMulti"];

    expect(() => assertFixture(fixture)).toThrow(
      "bundle_world_scale_domain_dependency:session-runtime~trade~rpg~world-scale",
    );
  });

  it("rejects missing or additional HTML entries", () => {
    const missing = createFixture();
    delete missing.manifest["trade.html"];
    expect(() => assertFixture(missing)).toThrow("bundle_entry_set_invalid");

    const additional = createFixture();
    additional.manifest["debug.html"] = entry("assets/debug.js");
    additional.sizes["assets/debug.js"] = 1;
    expect(() => assertFixture(additional)).toThrow("bundle_entry_set_invalid");
  });

  it("rejects oversized chunks, RPG shell, initial bytes and request count", () => {
    const chunk = createFixture();
    chunk.sizes["assets/game.js"] = BUNDLE_BUDGETS.maximumChunkBytes + 1;
    expect(() => assertFixture(chunk)).toThrow("bundle_chunk_budget_exceeded");

    const shell = createFixture();
    shell.sizes["assets/rpg.js"] = BUNDLE_BUDGETS.maximumRpgShellBytes + 1;
    expect(() => assertFixture(shell)).toThrow("bundle_rpg_shell_budget_exceeded");

    const initial = createFixture();
    for (const file of Object.keys(initial.sizes)) initial.sizes[file] = 1;
    for (const file of ["assets/content.js", "assets/support.js", "assets/game.js", "assets/session.js", "assets/ui.js", "assets/learning.js"]) {
      initial.sizes[file] = 190 * 1024;
    }
    expect(() => assertFixture(initial)).toThrow("bundle_rpg_initial_budget_exceeded");

    const requests = createFixture();
    for (let index = 0; index < BUNDLE_BUDGETS.maximumRpgInitialRequests; index += 1) {
      const key = `_extra-${index}`;
      const file = `assets/extra-${index}.js`;
      requests.manifest[key] = chunkRecord(file, `extra-${index}`);
      requests.sizes[file] = 1;
      requests.manifest["rpg.html"].imports?.push(key);
    }
    expect(() => assertFixture(requests)).toThrow("bundle_rpg_request_budget_exceeded");
  });

  it("rejects trade initial-byte and request regressions", () => {
    const bytes = createFixture();
    for (const file of Object.keys(bytes.sizes)) bytes.sizes[file] = 1;
    bytes.manifest._tradeA = chunkRecord("assets/trade-a.js", "trade-a");
    bytes.manifest._tradeB = chunkRecord("assets/trade-b.js", "trade-b");
    bytes.sizes["assets/trade-a.js"] = 205 * 1024;
    bytes.sizes["assets/trade-b.js"] = 205 * 1024;
    bytes.manifest["trade.html"].imports = ["_tradeA", "_tradeB"];
    expect(() => assertFixture(bytes)).toThrow("bundle_trade_initial_budget_exceeded");

    const requests = createFixture();
    for (const file of Object.keys(requests.sizes)) requests.sizes[file] = 1;
    for (let index = 0; index < 8; index += 1) {
      const key = `_trade-${index}`;
      const file = `assets/trade-${index}.js`;
      requests.manifest[key] = chunkRecord(file, `trade-${index}`);
      requests.sizes[file] = 1;
      requests.manifest["trade.html"].imports?.push(key);
    }
    expect(() => assertFixture(requests)).toThrow("bundle_trade_request_budget_exceeded");
  });

  it("rejects missing domain groups and reverse imports into an HTML entry", () => {
    const missingGroup = createFixture();
    missingGroup.manifest._learning.name = "wrong-learning-name";
    expect(() => assertFixture(missingGroup)).toThrow("bundle_rpg_domain_chunk_missing:learning-runtime~rpg");

    const cycle = createFixture();
    cycle.manifest._game.imports = ["rpg.html"];
    expect(() => assertFixture(cycle)).toThrow("bundle_entry_reverse_import:_game:rpg.html");
  });

  it("measures an existing domain dependency cycle once without treating the shell as a dependency", () => {
    const fixture = createFixture();
    fixture.manifest._game.imports = ["_session"];
    fixture.manifest._session.imports = ["_game"];

    const report = assertBundleBudget(fixture.manifest, (file) => fixture.sizes[file] ?? 0);
    expect(report.entries.find((entry) => entry.entry === "rpg.html")?.initialJsRequests).toBe(7);
  });

  it("rejects missing files, duplicate assets and unsafe manifest paths", () => {
    const missing = createFixture();
    delete missing.sizes["assets/ui.js"];
    expect(() => assertFixture(missing)).toThrow("bundle_file_size_invalid:assets/ui.js");

    const duplicate = createFixture();
    duplicate.manifest._ui.file = "assets/game.js";
    expect(() => assertFixture(duplicate)).toThrow("bundle_chunk_file_duplicate:assets/game.js");

    const traversal = createFixture();
    traversal.manifest._ui.file = "../private.js";
    expect(() => assertFixture(traversal)).toThrow("bundle_chunk_file_invalid:_ui");
  });
});

interface MutableChunk {
  file: string;
  name?: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
}

interface Fixture {
  manifest: Record<string, MutableChunk>;
  sizes: Record<string, number>;
}

function createFixture(): Fixture {
  const manifest: Record<string, MutableChunk> = Object.fromEntries(EXPECTED_BUILD_ENTRIES.map((key) =>
    [key, entry(`assets/${key.replace(".html", ".js")}`)]));
  manifest._content = chunkRecord("assets/content.js", "content-runtime.v0.1");
  manifest._support = chunkRecord("assets/support.js", "app-support~rpg");
  manifest._game = chunkRecord("assets/game.js", "game-runtime~rpg");
  manifest._session = chunkRecord("assets/session.js", "session-runtime~rpg");
  manifest._ui = chunkRecord("assets/ui.js", "rpg-ui~rpg");
  manifest._learning = chunkRecord("assets/learning.js", "learning-runtime~rpg");
  manifest["rpg.html"].imports = ["_content", "_support", "_game", "_session", "_ui", "_learning"];

  const sizes = Object.fromEntries(Object.values(manifest).flatMap((chunk) => [
    [chunk.file, 1024],
    ...((chunk.css ?? []).map((css) => [css, 512] as const)),
  ]));
  return { manifest, sizes };
}

function entry(file: string): MutableChunk {
  return { file, name: file.slice("assets/".length, -".js".length), isEntry: true, imports: [], css: [`${file}.css`] };
}

function chunkRecord(file: string, name: string): MutableChunk {
  return { file, name, imports: [] };
}

function assertFixture(fixture: Fixture): void {
  assertBundleBudget(fixture.manifest, (file) => fixture.sizes[file] ?? 0);
}
