import { resolve } from "node:path";
import {
  auditAssetRelease,
  exportApprovedAssetRelease,
  serializePublicAudit,
} from "./release-gate.ts";

type Command = "audit" | "dry-run" | "export";

const repositoryRoot = resolve(import.meta.dirname, "../..");

try {
  const command = parseCommand(process.argv[2]);
  const assetRoot = requiredFlag("--asset-root");
  const manifestPath = requiredFlag("--manifest");
  const publicRepositoryRoot = optionalFlag("--public-root") ?? repositoryRoot;
  const options = { manifestPath, assetRoot, publicRepositoryRoot };

  if (command === "audit") {
    const audit = auditAssetRelease(options);
    process.stdout.write(serializePublicAudit(audit));
    if (audit.decision === "deny") process.exitCode = 2;
  } else {
    const result = exportApprovedAssetRelease({ ...options, dryRun: command === "dry-run" });
    process.stdout.write(
      `${JSON.stringify(
        {
          ...result,
          publicDestination: result.publicDestination,
        },
        null,
        2,
      )}\n`,
    );
    if (result.audit.decision === "deny" || (!result.exported && !result.dryRun)) process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      schemaVersion: "tokipona.asset-release-gate.v0.1",
      decision: "deny",
      reasonCode: safeErrorCode(error),
    })}\n`,
  );
  process.exitCode = 1;
}

function parseCommand(value: string | undefined): Command {
  if (value === "audit" || value === "dry-run" || value === "export") return value;
  throw new Error("command_required");
}

function requiredFlag(name: string): string {
  const value = optionalFlag(name);
  if (!value) throw new Error(`${name.slice(2).replaceAll("-", "_")}_required`);
  return value;
}

function optionalFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)) return error.message;
  return "asset_release_gate_error";
}
