#!/usr/bin/env node
import { Command } from "commander";
import { acquirePassphrase } from "./core/passphrase.js";
import { VaultError } from "./core/errors.js";
import { runInit } from "./primitives/init.js";
import { runAdd } from "./primitives/add.js";
import { runList } from "./primitives/list.js";
import { runUnlock } from "./primitives/unlock.js";
import { runLock } from "./primitives/lock.js";
import { runBuild } from "./primitives/build.js";
import { runStatus } from "./primitives/status.js";
import { runHistory } from "./primitives/history.js";
import { runExport } from "./primitives/export.js";
import { runRotatePassphrase } from "./primitives/rotate-passphrase.js";
import { runMigrate } from "./primitives/migrate.js";
import { runVerify } from "./primitives/verify.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { UserError } from "./core/errors.js";

const program = new Command();
program.name("risuvault").description("Encrypted git-backed RisuAI vault").version("0.1.0");

function emit(json: boolean, data: unknown, text: () => string): void {
  if (json) process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  else process.stdout.write(text() + "\n");
}

async function withHandle<T>(fn: () => Promise<T>): Promise<void> {
  try { await fn(); }
  catch (e) {
    if (e instanceof VaultError) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exit(e.exitCode);
    }
    process.stderr.write(`unexpected: ${(e as Error).stack ?? e}\n`);
    process.exit(2);
  }
}

program.command("init [dir]").description("initialize a vault")
  .action(async (dir = ".") => withHandle(async () => {
    const pw = await acquirePassphrase();
    await runInit(dir, pw);
    process.stdout.write(`vault initialized at ${dir}\n`);
  }));

program.command("add <file>").description("add a RisuAI file to the vault")
  .requiredOption("--name <name>", "project name (must be unique)")
  .option("--json", "json output")
  .action(async (file, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runAdd(".", pw, file, opts.name);
    emit(!!opts.json, r, () => `added ${r.name} (${r.kind}) as ${r.uuid}`);
  }));

program.command("list").description("list projects").option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const items = await runList(".", pw);
    emit(!!opts.json, items, () =>
      items.length === 0 ? "(empty)" :
      items.map(p => `${p.name} (${p.kind}) v${p.currentVersion}`).join("\n")
    );
  }));

program.command("unlock <name>").description("decrypt project to cache")
  .action(async (name) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const uuid = await runUnlock(".", pw, name);
    process.stdout.write(`unlocked ${name} (${uuid})\n`);
  }));

program.command("lock <name>").description("re-encrypt project and remove cache")
  .action(async (name) => withHandle(async () => {
    const pw = await acquirePassphrase();
    await runLock(".", pw, name);
    process.stdout.write(`locked ${name}\n`);
  }));

program.command("build <name>").description("build project to original format")
  .option("--major", "bump major version")
  .option("--version <v>", "explicit version")
  .option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const bump = opts.version ? { explicit: String(opts.version) } : (opts.major ? "major" : "minor");
    const r = await runBuild(".", pw, name, bump as "minor" | "major" | { explicit: string });
    emit(!!opts.json, r, () => `built ${r.artifactFilename}`);
  }));

program.command("status").description("show project lock state").option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const rows = await runStatus(".", pw);
    emit(!!opts.json, rows, () =>
      rows.length === 0 ? "(empty)" :
      rows.map(r => `${r.name}\t${r.state}\tv${r.currentVersion}`).join("\n")
    );
  }));

program.command("history <name>").description("show build history").option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const rows = await runHistory(".", pw, name);
    emit(!!opts.json, rows, () =>
      rows.map(r => `${r.builtAt}\tv${r.version}\t${r.artifactFilename}`).join("\n")
    );
  }));

program.command("export <name>").description("decrypt latest built artifact to outbox/")
  .option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runExport(".", pw, name);
    emit(!!opts.json, r, () => `exported to ${r.outPath}`);
  }));

async function promptNewPassphrase(): Promise<string> {
  const fromEnv = process.env.RISUVAULT_NEW_PASSPHRASE;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (!stdin.isTTY) {
    throw new UserError(
      "no new passphrase: set RISUVAULT_NEW_PASSPHRASE or run interactively"
    );
  }
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    const pw = await rl.question("New vault passphrase: ");
    if (!pw) throw new UserError("empty new passphrase");
    const confirm = await rl.question("Confirm new passphrase: ");
    if (pw !== confirm) throw new UserError("passphrases did not match");
    return pw;
  } finally {
    rl.close();
  }
}

program.command("verify").description("pre-commit check: all vault files encrypted and names safe")
  .option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runVerify(".", pw);
    if (opts.json) {
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    } else if (r.ok) {
      process.stdout.write(`verify OK: ${r.projectsChecked} projects, ${r.filesChecked} files\n`);
    } else {
      process.stderr.write(`verify FAILED (${r.violations.length} violation(s)):\n`);
      for (const v of r.violations) process.stderr.write(`  - ${v}\n`);
    }
    if (!r.ok) process.exit(1);
  }));

program.command("migrate").description("migrate project file layout to hashed filenames")
  .option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runMigrate(".", pw);
    emit(!!opts.json, r, () => `migrated ${r.projectsMigrated} projects, renamed ${r.filesRenamed} files`);
  }));

program.command("rotate-passphrase").description("change the vault passphrase (re-encrypts vault.db)")
  .action(async () => withHandle(async () => {
    const oldPw = await acquirePassphrase();
    const newPw = await promptNewPassphrase();
    await runRotatePassphrase(".", oldPw, newPw);
    process.stdout.write("passphrase rotated. Update your password manager now.\n");
  }));

program.parseAsync();
