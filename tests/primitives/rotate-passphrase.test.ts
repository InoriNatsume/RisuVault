import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runList } from "../../src/primitives/list.js";
import { runRotatePassphrase } from "../../src/primitives/rotate-passphrase.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AuthError, UserError } from "../../src/core/errors.js";
// @ts-ignore
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(p: string): Promise<void> {
  const preset = { name: "s", mainPrompt: "p", jailbreak: "", globalNote: "", customPromptTemplateToggle: false, templateDefaultVariables: "", regex: [], promptTemplate: [] };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(p, bytes);
}

describe("runRotatePassphrase", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "old-pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    await runAdd(tmp.root, "old-pw", src, "s");
  });
  afterEach(() => tmp.cleanup());

  it("new passphrase works, old fails", async () => {
    await runRotatePassphrase(tmp.root, "old-pw", "new-pw");
    const items = await runList(tmp.root, "new-pw");
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("s");
    await expect(runList(tmp.root, "old-pw")).rejects.toThrow(AuthError);
  });

  it("rejects wrong old passphrase", async () => {
    await expect(runRotatePassphrase(tmp.root, "wrong", "new-pw")).rejects.toThrow(AuthError);
    const items = await runList(tmp.root, "old-pw");
    expect(items.length).toBe(1);
  });

  it("rejects empty or same new passphrase", async () => {
    await expect(runRotatePassphrase(tmp.root, "old-pw", "")).rejects.toThrow(UserError);
    await expect(runRotatePassphrase(tmp.root, "old-pw", "old-pw")).rejects.toThrow(UserError);
  });
});
