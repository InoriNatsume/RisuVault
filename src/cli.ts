#!/usr/bin/env node
import { Command } from "commander";
import { acquirePassphrase } from "./core/passphrase.js";
import { VaultError } from "./core/errors.js";
import { runInit } from "./primitives/init.js";
import { runAdd } from "./primitives/add.js";
import { runList } from "./primitives/list.js";
import { runPull } from "./primitives/pull.js";
import { runSync } from "./primitives/sync.js";
import { runWipeWork } from "./primitives/wipe-work.js";
import { runBuild } from "./primitives/build.js";
import { runStatus } from "./primitives/status.js";
import { runHistory } from "./primitives/history.js";
import { runRotatePassphrase } from "./primitives/rotate-passphrase.js";
import { runMigrate } from "./primitives/migrate.js";
import { runVerify } from "./primitives/verify.js";
import { runRefsSync } from "./primitives/refs-sync.js";
import { runRefsPull } from "./primitives/refs-pull.js";
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

program.command("pull [name]").description("decrypt project_git → project_work (use --all for every project)")
  .option("--all", "pull every project")
  .option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    if (!name && !opts.all) throw new UserError("pull requires <name> or --all");
    const pw = await acquirePassphrase();
    const r = await runPull(".", pw, opts.all ? "--all" : name);
    emit(!!opts.json, r, () => r.pulled.map(p => `pulled ${p.name} (${p.fileCount} files)`).join("\n"));
  }));

program.command("sync [name]").description("re-encrypt project_work → project_git")
  .option("--all", "sync every project")
  .option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    if (!name && !opts.all) throw new UserError("sync requires <name> or --all");
    const pw = await acquirePassphrase();
    const r = await runSync(".", pw, opts.all ? "--all" : name);
    emit(!!opts.json, r, () => r.synced.map(p => `synced ${p.name} (${p.fileCount} files)`).join("\n"));
  }));

program.command("wipe-work <name>").description("delete project_work/<name>/ (project_git untouched)")
  .action(async (name) => withHandle(async () => {
    const pw = await acquirePassphrase();
    await runWipeWork(".", pw, name);
    process.stdout.write(`wiped project_work/${name}/\n`);
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

program.command("status").description("show project work state").option("--json", "json output")
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

program.command("migrate").description("migrate vault layout (projects/ → project_git/, create project_work/)")
  .option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runMigrate(".", pw);
    emit(!!opts.json, r, () =>
      `migrated ${r.projectsMigrated} projects, renamed ${r.filesRenamed} files` +
      (r.layoutMigrated ? ", renamed projects/ → project_git/" : "") +
      (r.workDirsCreated > 0 ? `, created ${r.workDirsCreated} work dir(s)` : "")
    );
  }));

program.command("refs-sync").description("encrypt global_refs/ref_work/ → global_refs/ref_git/")
  .option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runRefsSync(".", pw);
    emit(!!opts.json, r, () => `refs-sync: ${r.synced} encrypted, ${r.removed} stale removed`);
  }));

program.command("refs-pull").description("decrypt global_refs/ref_git/ → global_refs/ref_work/")
  .option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runRefsPull(".", pw);
    emit(!!opts.json, r, () => `refs-pull: ${r.pulled} decrypted`);
  }));

program.command("rotate-passphrase").description("change the vault passphrase (re-encrypts vault.db)")
  .action(async () => withHandle(async () => {
    const oldPw = await acquirePassphrase();
    const newPw = await promptNewPassphrase();
    await runRotatePassphrase(".", oldPw, newPw);
    process.stdout.write("passphrase rotated. Update your password manager now.\n");
  }));

program.parseAsync();
