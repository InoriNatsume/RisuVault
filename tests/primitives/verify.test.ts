import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runVerify } from "../../src/primitives/verify.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projectGitRoot } from "../../src/core/paths.js";
// @ts-ignore
import { encodeRisupContainer } from "../../src/risupack/src/formats/risup/container-risup.js";

async function writeFakePreset(p: string): Promise<void> {
  const preset = { name: "s", mainPrompt: "p", jailbreak: "", globalNote: "", customPromptTemplateToggle: false, templateDefaultVariables: "", regex: [], promptTemplate: [] };
  const bytes = await encodeRisupContainer(preset, "risupreset", { outerType: "preset", presetVersion: 2 });
  writeFileSync(p, bytes);
}

describe("runVerify", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risupreset");
    await writeFakePreset(src);
    await runAdd(tmp.root, "pw", src, "s");
  });
  afterEach(() => tmp.cleanup());

  it("reports ok for a clean freshly-added vault", async () => {
    const r = await runVerify(tmp.root, "pw");
    expect(r.ok).toBe(true);
    expect(r.projectsChecked).toBe(1);
    expect(r.filesChecked).toBeGreaterThan(0);
    expect(r.violations).toEqual([]);
  });

  it("catches a stray non-hex filename in project_git/<uuid>/", async () => {
    const projectDirs = readdirSync(projectGitRoot(tmp.root)).filter((n: string) => n !== ".gitkeep");
    const projectUuid = projectDirs[0];
    writeFileSync(join(projectGitRoot(tmp.root), projectUuid, "leaked-name.enc"), "x");
    const r = await runVerify(tmp.root, "pw");
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.includes("leaked-name.enc"))).toBe(true);
  });

  it("catches missing project_work/ rule in .gitignore", async () => {
    writeFileSync(join(tmp.root, ".gitignore"), "inbox/*\noutbox/*\n/dist/\n");
    const r = await runVerify(tmp.root, "pw");
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.includes("project_work/"))).toBe(true);
  });

  it("catches missing .gitignore inbox rule", async () => {
    writeFileSync(join(tmp.root, ".gitignore"), "# empty\n");
    const r = await runVerify(tmp.root, "pw");
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.includes("inbox/*"))).toBe(true);
  });

  it("passes with a proper .gitignore", async () => {
    writeFileSync(join(tmp.root, ".gitignore"),
      "project_work/\ninbox/*\noutbox/*\n/dist/\nglobal_refs/ref_work/\n");
    const r = await runVerify(tmp.root, "pw");
    expect(r.ok).toBe(true);
  });

  it("catches missing global_refs/ref_work/ rule in .gitignore", async () => {
    writeFileSync(join(tmp.root, ".gitignore"),
      "project_work/\ninbox/*\noutbox/*\n/dist/\n");
    const r = await runVerify(tmp.root, "pw");
    expect(r.ok).toBe(false);
    expect(r.violations.some(v => v.includes("global_refs/ref_work/"))).toBe(true);
  });
});
