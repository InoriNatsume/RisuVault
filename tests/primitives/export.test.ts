import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runBuild } from "../../src/primitives/build.js";
import { runLock } from "../../src/primitives/lock.js";
import { runExport } from "../../src/primitives/export.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(p: string): Promise<void> {
  const preset = { name: "s", mainPrompt: "p", jailbreak: "", globalNote: "", customPromptTemplateToggle: false, templateDefaultVariables: "", regex: [], promptTemplate: [] };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(p, bytes);
}

describe("runExport", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    await runAdd(tmp.root, "pw", src, "s");
    await runUnlock(tmp.root, "pw", "s");
    await runBuild(tmp.root, "pw", "s", "minor");
    await runLock(tmp.root, "pw", "s");
  });
  afterEach(() => tmp.cleanup());

  it("decrypts latest artifact to outbox/", async () => {
    const r = await runExport(tmp.root, "pw", "s");
    expect(existsSync(r.outPath)).toBe(true);
    const bytes = readFileSync(r.outPath);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
