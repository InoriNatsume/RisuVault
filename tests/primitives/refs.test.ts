import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runRefsSync } from "../../src/primitives/refs-sync.js";
import { runRefsPull } from "../../src/primitives/refs-pull.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { refGitDir, refWorkDir } from "../../src/core/paths.js";

describe("global_refs", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
  });
  afterEach(() => tmp.cleanup());

  it("syncs ref_work → ref_git encrypted and preserves filenames", async () => {
    writeFileSync(join(refWorkDir(tmp.root), "rules.md"), "vault-wide rules");
    writeFileSync(join(refWorkDir(tmp.root), "tone.md"), "tone guide");
    const r = await runRefsSync(tmp.root, "pw");
    expect(r.synced).toBe(2);
    expect(existsSync(join(refGitDir(tmp.root), "rules.md.enc"))).toBe(true);
    expect(existsSync(join(refGitDir(tmp.root), "tone.md.enc"))).toBe(true);
  });

  it("pull restores plaintext after wiping ref_work", async () => {
    writeFileSync(join(refWorkDir(tmp.root), "rules.md"), "vault-wide rules");
    await runRefsSync(tmp.root, "pw");
    rmSync(join(refWorkDir(tmp.root), "rules.md"));
    const r = await runRefsPull(tmp.root, "pw");
    expect(r.pulled).toBe(1);
    expect(readFileSync(join(refWorkDir(tmp.root), "rules.md"), "utf8")).toBe("vault-wide rules");
  });

  it("removes stale .enc when source deleted", async () => {
    writeFileSync(join(refWorkDir(tmp.root), "old.md"), "x");
    await runRefsSync(tmp.root, "pw");
    rmSync(join(refWorkDir(tmp.root), "old.md"));
    writeFileSync(join(refWorkDir(tmp.root), "new.md"), "y");
    const r = await runRefsSync(tmp.root, "pw");
    expect(r.synced).toBe(1);
    expect(r.removed).toBe(1);
    expect(existsSync(join(refGitDir(tmp.root), "old.md.enc"))).toBe(false);
    expect(existsSync(join(refGitDir(tmp.root), "new.md.enc"))).toBe(true);
  });

  it("rejects subdirectories in ref_work on sync", async () => {
    mkdirSync(join(refWorkDir(tmp.root), "nested"));
    writeFileSync(join(refWorkDir(tmp.root), "nested", "bad.md"), "x");
    await expect(runRefsSync(tmp.root, "pw")).rejects.toThrow();
  });
});
