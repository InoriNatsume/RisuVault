import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "../../src/core/paths.js";
import { openDb, listProjectFiles } from "../../src/core/db.js";
import { deriveKey } from "../../src/core/crypto.js";
import { dbPath } from "../../src/core/paths.js";
import { readConfig } from "../../src/core/config.js";
// @ts-ignore – internal risupack helper used only in tests
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(path: string): Promise<void> {
  const preset = {
    name: "SamplePreset",
    mainPrompt: "test",
    jailbreak: "",
    globalNote: "",
    customPromptTemplateToggle: false,
    templateDefaultVariables: "",
    regex: [],
    promptTemplate: []
  };
  const bytes = await encodeRisupContainer(preset, "risupreset", {
    outerType: "preset",
    presetVersion: 2
  });
  writeFileSync(path, bytes);
}

describe("runAdd", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
  });
  afterEach(() => tmp.cleanup());

  it("adds a preset file to the vault", async () => {
    const src = join(tmp.root, "sample.risupreset");
    await writeFakePreset(src);
    const result = await runAdd(tmp.root, "pw", src, "sample");
    expect(result.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.name).toBe("sample");

    // All enc files must be flat (64-hex + .enc) under project dir
    const pDir = projectDir(tmp.root, result.uuid);
    expect(existsSync(pDir)).toBe(true);
    const encFiles = readdirSync(pDir).filter(f => f.endsWith(".enc"));
    expect(encFiles.length).toBeGreaterThan(0);
    for (const f of encFiles) {
      expect(f).toMatch(/^[0-9a-f]{64}\.enc$/);
    }

    // DB must have project_files rows
    const cfg = readConfig(tmp.root);
    const key = await deriveKey("pw", Buffer.from(cfg.kdf.saltHex, "hex"));
    const db = openDb(dbPath(tmp.root), key);
    try {
      const rows = listProjectFiles(db, result.uuid);
      expect(rows.length).toBe(encFiles.length);
    } finally { db.close(); }
  });
});
