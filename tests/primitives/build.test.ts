import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runBuild } from "../../src/primitives/build.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projectGitDir, outboxDir, dbPath } from "../../src/core/paths.js";
import { openDb, listProjectFiles } from "../../src/core/db.js";
import { deriveKey, computeHashedName } from "../../src/core/crypto.js";
import { readConfig } from "../../src/core/config.js";
// @ts-ignore
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(path: string): Promise<void> {
  const preset = { name: "s", mainPrompt: "p", jailbreak: "", globalNote: "", customPromptTemplateToggle: false, templateDefaultVariables: "", regex: [], promptTemplate: [] };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(path, bytes);
}

describe("runBuild", () => {
  let tmp: { root: string; cleanup: () => void };
  let uuid: string;
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    // add creates project_work/ automatically — no unlock needed
    const r = await runAdd(tmp.root, "pw", src, "s");
    uuid = r.uuid;
  });
  afterEach(() => tmp.cleanup());

  it("builds and bumps version to 1.1, stores encrypted artifact as hashed name", async () => {
    const result = await runBuild(tmp.root, "pw", "s", "minor");
    expect(result.version).toBe("1.1");
    expect(result.artifactFilename).toBe("s.risupreset");

    // Verify via DB lookup that the hashed name exists flat in project_git dir
    const cfg = readConfig(tmp.root);
    const key = await deriveKey("pw", Buffer.from(cfg.kdf.saltHex, "hex"));
    const db = openDb(dbPath(tmp.root), key);
    try {
      const rows = listProjectFiles(db, uuid);
      const distRelPath = `dist/${result.artifactFilename}`;
      const entry = rows.find(r => r.originalPath === distRelPath);
      expect(entry).toBeDefined();
      const encArtifact = join(projectGitDir(tmp.root, uuid), `${entry!.hashedName}.enc`);
      expect(existsSync(encArtifact)).toBe(true);
    } finally { db.close(); }

    // outbox should contain plaintext copy
    const outboxFile = join(outboxDir(tmp.root), result.artifactFilename);
    expect(existsSync(outboxFile)).toBe(true);
  });

  it("accepts explicit version", async () => {
    const result = await runBuild(tmp.root, "pw", "s", { explicit: "3.14" });
    expect(result.version).toBe("3.14");
  });
});
