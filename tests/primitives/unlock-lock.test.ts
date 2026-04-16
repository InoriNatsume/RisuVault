import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runLock } from "../../src/primitives/lock.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { projectCacheDir, projectDir } from "../../src/core/paths.js";
import { walkFiles } from "../../src/core/walk.js";
// @ts-ignore
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(path: string): Promise<void> {
  const preset = {
    name: "X",
    mainPrompt: "p",
    jailbreak: "",
    globalNote: "",
    customPromptTemplateToggle: false,
    templateDefaultVariables: "",
    regex: [],
    promptTemplate: []
  };
  const bytes = await encodeRisupContainer(preset, "risupreset", {
    outerType: "preset", presetVersion: 2
  });
  writeFileSync(path, bytes);
}

describe("unlock/lock", () => {
  let tmp: { root: string; cleanup: () => void };
  let uuid: string;
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    const r = await runAdd(tmp.root, "pw", src, "s");
    uuid = r.uuid;
  });
  afterEach(() => tmp.cleanup());

  it("unlock creates plaintext cache", async () => {
    await runUnlock(tmp.root, "pw", "s");
    expect(existsSync(projectCacheDir(tmp.root, uuid))).toBe(true);
    const plainFiles = walkFiles(projectCacheDir(tmp.root, uuid));
    expect(plainFiles.length).toBeGreaterThan(0);
  });

  it("lock round-trips modifications", async () => {
    await runUnlock(tmp.root, "pw", "s");
    const plainFiles = walkFiles(projectCacheDir(tmp.root, uuid));
    const target = plainFiles[0];
    writeFileSync(target, "MODIFIED");
    await runLock(tmp.root, "pw", "s");
    expect(existsSync(projectCacheDir(tmp.root, uuid))).toBe(false);

    await runUnlock(tmp.root, "pw", "s");
    const plainFiles2 = walkFiles(projectCacheDir(tmp.root, uuid));
    const same = plainFiles2.find(f => basename(f) === basename(target));
    expect(same).toBeDefined();
    expect(readFileSync(same!, "utf8")).toBe("MODIFIED");
  });
});
