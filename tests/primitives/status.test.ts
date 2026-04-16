import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runStatus } from "../../src/primitives/status.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(path: string): Promise<void> {
  const preset = { name: "x", mainPrompt: "p", jailbreak: "", globalNote: "", customPromptTemplateToggle: false, templateDefaultVariables: "", regex: [], promptTemplate: [] };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(path, bytes);
}

describe("runStatus", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    await runAdd(tmp.root, "pw", src, "s");
  });
  afterEach(() => tmp.cleanup());

  it("reports locked for freshly added project", async () => {
    const rows = await runStatus(tmp.root, "pw");
    expect(rows[0].state).toBe("locked");
  });

  it("reports unlocked after unlock", async () => {
    await runUnlock(tmp.root, "pw", "s");
    const rows = await runStatus(tmp.root, "pw");
    expect(rows[0].state).toBe("unlocked");
  });
});
