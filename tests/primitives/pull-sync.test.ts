import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runPull } from "../../src/primitives/pull.js";
import { runSync } from "../../src/primitives/sync.js";
import { runWipeWork } from "../../src/primitives/wipe-work.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectWorkDir } from "../../src/core/paths.js";
import { openDb, listProjectFiles } from "../../src/core/db.js";
import { deriveKey } from "../../src/core/crypto.js";
import { dbPath } from "../../src/core/paths.js";
import { readConfig } from "../../src/core/config.js";
import { walkFiles } from "../../src/core/walk.js";
// @ts-ignore
import { encodeRisupContainer } from "../../src/risupack/src/formats/risup/container-risup.js";

async function writeFakePreset(path: string): Promise<void> {
  const preset = {
    name: "X", mainPrompt: "p", jailbreak: "", globalNote: "",
    customPromptTemplateToggle: false, templateDefaultVariables: "",
    regex: [], promptTemplate: []
  };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(path, bytes);
}

describe("pull/sync", () => {
  let tmp: { root: string; cleanup: () => void };
  let uuid: string;
  let name: string;

  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    const r = await runAdd(tmp.root, "pw", src, "s");
    uuid = r.uuid;
    name = r.name;
  });
  afterEach(() => tmp.cleanup());

  it("add creates project_work dir with correct file count", async () => {
    const workDir = projectWorkDir(tmp.root, name);
    expect(existsSync(workDir)).toBe(true);
    const workFiles = walkFiles(workDir);
    const cfg = readConfig(tmp.root);
    const key = await deriveKey("pw", Buffer.from(cfg.kdf.saltHex, "hex"));
    const db = openDb(dbPath(tmp.root), key);
    try {
      const rows = listProjectFiles(db, uuid);
      expect(workFiles.length).toBe(rows.length);
    } finally { db.close(); }
  });

  it("pull restores work dir from encrypted git", async () => {
    // Remove work dir to simulate wipe
    rmSync(projectWorkDir(tmp.root, name), { recursive: true, force: true });
    expect(existsSync(projectWorkDir(tmp.root, name))).toBe(false);

    const r = await runPull(tmp.root, "pw", name);
    expect(r.pulled.length).toBe(1);
    expect(r.pulled[0].name).toBe(name);
    expect(existsSync(projectWorkDir(tmp.root, name))).toBe(true);
    expect(r.pulled[0].fileCount).toBeGreaterThan(0);
  });

  it("sync + pull round-trips file modifications", async () => {
    const workDir = projectWorkDir(tmp.root, name);
    const workFiles = walkFiles(workDir);
    const target = workFiles[0];
    writeFileSync(target, "MODIFIED_CONTENT");

    await runSync(tmp.root, "pw", name);

    // Wipe and re-pull
    rmSync(workDir, { recursive: true, force: true });
    await runPull(tmp.root, "pw", name);

    // Find the same file by relative path
    const workFiles2 = walkFiles(projectWorkDir(tmp.root, name));
    const relTarget = target.replace(workDir, "").replace(/\\/g, "/").replace(/^\//, "");
    const restored = workFiles2.find(f =>
      f.replace(projectWorkDir(tmp.root, name), "").replace(/\\/g, "/").replace(/^\//, "") === relTarget
    );
    expect(restored).toBeDefined();
    expect(readFileSync(restored!, "utf8")).toBe("MODIFIED_CONTENT");
  });

  it("sync removes stale .enc file and DB row when work file deleted", async () => {
    const workDir = projectWorkDir(tmp.root, name);
    const workFiles = walkFiles(workDir);
    expect(workFiles.length).toBeGreaterThan(0);

    // Get DB row count before deletion
    const cfg = readConfig(tmp.root);
    const key = await deriveKey("pw", Buffer.from(cfg.kdf.saltHex, "hex"));
    const db = openDb(dbPath(tmp.root), key);
    const beforeRows = listProjectFiles(db, uuid);
    db.close();

    // Delete first work file
    rmSync(workFiles[0]);

    await runSync(tmp.root, "pw", name);

    const db2 = openDb(dbPath(tmp.root), key);
    const afterRows = listProjectFiles(db2, uuid);
    db2.close();

    expect(afterRows.length).toBe(beforeRows.length - 1);
  });

  it("wipe-work removes work dir, pull restores it", async () => {
    await runWipeWork(tmp.root, "pw", name);
    expect(existsSync(projectWorkDir(tmp.root, name))).toBe(false);

    await runPull(tmp.root, "pw", name);
    expect(existsSync(projectWorkDir(tmp.root, name))).toBe(true);
  });
});
