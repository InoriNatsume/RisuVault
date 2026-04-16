import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, readFileSync } from "node:fs";
import {
  configPath, dbPath, vaultDir, projectGitRoot, projectWorkRoot, inboxDir, outboxDir
} from "../../src/core/paths.js";
import { UserError } from "../../src/core/errors.js";

describe("runInit", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(() => { tmp = createTempVaultRoot(); });
  afterEach(() => tmp.cleanup());

  it("creates .risuvault structure, project_git/, project_work/, inbox/, outbox/", async () => {
    await runInit(tmp.root, "test-passphrase");
    expect(existsSync(vaultDir(tmp.root))).toBe(true);
    expect(existsSync(configPath(tmp.root))).toBe(true);
    expect(existsSync(dbPath(tmp.root))).toBe(true);
    expect(existsSync(projectGitRoot(tmp.root))).toBe(true);
    expect(existsSync(projectWorkRoot(tmp.root))).toBe(true);
    expect(existsSync(inboxDir(tmp.root))).toBe(true);
    expect(existsSync(outboxDir(tmp.root))).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath(tmp.root), "utf8"));
    expect(cfg.vaultVersion).toBe(1);
    expect(cfg.kdf.saltHex.length).toBe(64);
  });

  it("refuses to re-init an existing vault", async () => {
    await runInit(tmp.root, "pw");
    await expect(runInit(tmp.root, "pw")).rejects.toThrow(UserError);
  });
});
