import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runList } from "../../src/primitives/list.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { openDb, insertProject } from "../../src/core/db.js";
import { readConfig } from "../../src/core/config.js";
import { deriveKey } from "../../src/core/crypto.js";
import { dbPath } from "../../src/core/paths.js";

describe("runList", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
  });
  afterEach(() => tmp.cleanup());

  it("returns empty array for fresh vault", async () => {
    const items = await runList(tmp.root, "pw");
    expect(items).toEqual([]);
  });

  it("returns inserted projects", async () => {
    const cfg = readConfig(tmp.root);
    const key = await deriveKey("pw", Buffer.from(cfg.kdf.saltHex, "hex"));
    const db = openDb(dbPath(tmp.root), key);
    insertProject(db, {
      uuid: "u1", name: "alice", kind: "bot", sourceFormat: "charx",
      fileKey: Buffer.alloc(32), currentVersion: "1.0",
      addedAt: "2026-04-16T00:00:00Z", lastLockedAt: null, lastBuiltAt: null
    });
    db.close();
    const items = await runList(tmp.root, "pw");
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("alice");
  });
});
