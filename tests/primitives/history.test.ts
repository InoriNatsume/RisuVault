import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runBuild } from "../../src/primitives/build.js";
import { runHistory } from "../../src/primitives/history.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore
import { encodeRisupContainer } from "risupack/dist/formats/risup/container-risup.js";

async function writeFakePreset(path: string): Promise<void> {
  const preset = { name: "s", mainPrompt: "p", jailbreak: "", globalNote: "", customPromptTemplateToggle: false, templateDefaultVariables: "", regex: [], promptTemplate: [] };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(path, bytes);
}

describe("runHistory", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    await runAdd(tmp.root, "pw", src, "s");
    await runUnlock(tmp.root, "pw", "s");
    await runBuild(tmp.root, "pw", "s", "minor");
    await runBuild(tmp.root, "pw", "s", "minor");
  });
  afterEach(() => tmp.cleanup());

  it("lists builds newest first", async () => {
    const hist = await runHistory(tmp.root, "pw", "s");
    expect(hist.length).toBe(2);
    expect(hist[0].version).toBe("1.2");
    expect(hist[1].version).toBe("1.1");
  });
});
