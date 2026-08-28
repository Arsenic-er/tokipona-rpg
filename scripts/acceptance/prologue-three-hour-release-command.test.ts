import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";

describe("three-hour release command", () => {
  it("blocks release certification when the underground handoff is unavailable", () => {
    const result = spawnSync(corepack, ["pnpm", "run", "acceptance:three-hour"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 120_000,
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("underground_handoff_required");
  }, 130_000);
});
