import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openDb, initDbSchema,
  insertProject, getProjectByName,
  listProjects, updateProjectVersion, updateLastLockedAt,
  insertBuildHistory, getBuildHistory, updateBuildHistoryCommitSha
} from "../../src/core/db.js";
import { deriveKey } from "../../src/core/crypto.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { mkdirSync } from "node:fs";
import { vaultDir, dbPath } from "../../src/core/paths.js";
import { randomBytes } from "node:crypto";
import { AuthError } from "../../src/core/errors.js";

describe("db open + schema", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(() => { tmp = createTempVaultRoot(); mkdirSync(vaultDir(tmp.root)); });
  afterEach(() => tmp.cleanup());

  it("creates and opens a new DB with schema", async () => {
    const key = await deriveKey("test-pass", randomBytes(32));
    const db = openDb(dbPath(tmp.root), key);
    initDbSchema(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain("projects");
    expect(names).toContain("build_history");
    db.close();
  });

  it("fails to open with wrong key", async () => {
    const salt = randomBytes(32);
    const k1 = await deriveKey("right", salt);
    const k2 = await deriveKey("wrong", salt);
    const db1 = openDb(dbPath(tmp.root), k1);
    initDbSchema(db1);
    db1.prepare("INSERT INTO projects(uuid,name,kind,source_format,file_key,current_version,added_at) VALUES (?,?,?,?,?,?,?)")
      .run("u1", "n1", "bot", "charx", Buffer.alloc(32), "1.0", new Date().toISOString());
    db1.close();

    expect(() => {
      const db2 = openDb(dbPath(tmp.root), k2);
      db2.prepare("SELECT * FROM projects").all();
    }).toThrow(AuthError);
  });
});

describe("db CRUD", () => {
  let tmp: { root: string; cleanup: () => void };
  let db: ReturnType<typeof openDb>;
  beforeEach(async () => {
    tmp = createTempVaultRoot(); mkdirSync(vaultDir(tmp.root));
    const key = await deriveKey("pw", randomBytes(32));
    db = openDb(dbPath(tmp.root), key);
    initDbSchema(db);
  });
  afterEach(() => { db.close(); tmp.cleanup(); });

  it("inserts and retrieves a project", () => {
    insertProject(db, {
      uuid: "u1", name: "alice", kind: "bot", sourceFormat: "charx",
      fileKey: Buffer.alloc(32, 1), currentVersion: "1.0",
      addedAt: "2026-04-16T00:00:00Z", lastLockedAt: null, lastBuiltAt: null
    });
    const p = getProjectByName(db, "alice");
    expect(p?.uuid).toBe("u1");
    expect(p?.fileKey.equals(Buffer.alloc(32, 1))).toBe(true);
  });

  it("lists all projects", () => {
    insertProject(db, { uuid: "u1", name: "a", kind: "bot", sourceFormat: "charx", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    insertProject(db, { uuid: "u2", name: "b", kind: "module", sourceFormat: "risum", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    expect(listProjects(db).length).toBe(2);
  });

  it("updates version and records history", () => {
    insertProject(db, { uuid: "u1", name: "a", kind: "bot", sourceFormat: "charx", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    updateProjectVersion(db, "u1", "1.1", "2026-04-16T10:00:00Z");
    insertBuildHistory(db, { projectUuid: "u1", version: "1.1", builtAt: "2026-04-16T10:00:00Z", artifactFilename: "a.charx", notes: null });
    const hist = getBuildHistory(db, "u1");
    expect(hist.length).toBe(1);
    expect(hist[0].version).toBe("1.1");
    expect(hist[0].commitSha).toBeNull();
  });

  it("records and updates commitSha in build_history", () => {
    insertProject(db, { uuid: "u2", name: "b", kind: "bot", sourceFormat: "charx", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    insertBuildHistory(db, { projectUuid: "u2", version: "1.1", builtAt: "2026-04-16T10:00:00Z", artifactFilename: "b.charx", commitSha: "abc123", notes: null });
    const hist = getBuildHistory(db, "u2");
    expect(hist[0].commitSha).toBe("abc123");
    updateBuildHistoryCommitSha(db, hist[0].id, "def456");
    const hist2 = getBuildHistory(db, "u2");
    expect(hist2[0].commitSha).toBe("def456");
  });
});
