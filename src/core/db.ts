import Database from "better-sqlite3-multiple-ciphers";
import type { Database as DB } from "better-sqlite3-multiple-ciphers";
import type { ProjectRecord, BuildHistoryEntry } from "../types.js";
import { AuthError } from "./errors.js";
import { randomBytes } from "node:crypto";

export function openDb(path: string, key: Buffer): DB {
  const db = new Database(path);
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`legacy=4`);
  db.pragma(`key="x'${key.toString("hex")}'"`);
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    throw new AuthError(`cannot open vault.db: ${(e as Error).message}`);
  }
  // Idempotent migrations run on every open so older vaults auto-upgrade.
  initDbSchema(db);
  return db;
}

export function initDbSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('bot','module','preset')),
      source_format TEXT NOT NULL,
      file_key BLOB NOT NULL,
      current_version TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_locked_at TEXT,
      last_built_at TEXT
    );
    CREATE TABLE IF NOT EXISTS build_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT NOT NULL REFERENCES projects(uuid),
      version TEXT NOT NULL,
      built_at TEXT NOT NULL,
      artifact_filename TEXT NOT NULL,
      commit_sha TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_build_history_project ON build_history(project_uuid);
    CREATE TABLE IF NOT EXISTS project_files (
      project_uuid TEXT NOT NULL REFERENCES projects(uuid),
      original_path TEXT NOT NULL,
      hashed_name TEXT NOT NULL,
      PRIMARY KEY (project_uuid, original_path)
    );
    CREATE INDEX IF NOT EXISTS idx_project_files_hash ON project_files(project_uuid, hashed_name);
    CREATE TABLE IF NOT EXISTS vault_meta (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '1');
  `);
  // Migration: add commit_sha to existing databases
  try {
    db.exec("ALTER TABLE build_history ADD COLUMN commit_sha TEXT");
  } catch {
    // Column already exists — ignore
  }
}

export function getVaultMeta(db: DB, key: string): Buffer | undefined {
  const r = db.prepare("SELECT value FROM vault_meta WHERE key=?").get(key) as { value: Buffer } | undefined;
  return r?.value;
}

export function setVaultMeta(db: DB, key: string, value: Buffer): void {
  db.prepare(`INSERT INTO vault_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}

export function getOrCreateRefsKey(db: DB): Buffer {
  let key = getVaultMeta(db, "refs_key");
  if (!key) {
    const newKey = randomBytes(32);
    setVaultMeta(db, "refs_key", newKey);
    return newKey;
  }
  return key;
}

interface ProjectRow {
  uuid: string;
  name: string;
  kind: string;
  source_format: string;
  file_key: Buffer;
  current_version: string;
  added_at: string;
  last_locked_at: string | null;
  last_built_at: string | null;
}

function rowToProject(r: ProjectRow): ProjectRecord {
  return {
    uuid: r.uuid, name: r.name,
    kind: r.kind as ProjectRecord["kind"],
    sourceFormat: r.source_format as ProjectRecord["sourceFormat"],
    fileKey: r.file_key,
    currentVersion: r.current_version,
    addedAt: r.added_at,
    lastLockedAt: r.last_locked_at,
    lastBuiltAt: r.last_built_at
  };
}

export function insertProject(db: DB, p: ProjectRecord): void {
  db.prepare(`
    INSERT INTO projects(uuid,name,kind,source_format,file_key,current_version,added_at,last_locked_at,last_built_at)
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(p.uuid, p.name, p.kind, p.sourceFormat, p.fileKey, p.currentVersion, p.addedAt, p.lastLockedAt, p.lastBuiltAt);
}

export function getProjectByName(db: DB, name: string): ProjectRecord | undefined {
  const r = db.prepare("SELECT * FROM projects WHERE name=?").get(name) as ProjectRow | undefined;
  return r ? rowToProject(r) : undefined;
}

export function getProjectByUuid(db: DB, uuid: string): ProjectRecord | undefined {
  const r = db.prepare("SELECT * FROM projects WHERE uuid=?").get(uuid) as ProjectRow | undefined;
  return r ? rowToProject(r) : undefined;
}

export function resolveProject(db: DB, ref: string): ProjectRecord | undefined {
  return getProjectByUuid(db, ref) ?? getProjectByName(db, ref);
}

export function listProjects(db: DB): ProjectRecord[] {
  const rows = db.prepare("SELECT * FROM projects ORDER BY name").all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function updateProjectVersion(db: DB, uuid: string, version: string, builtAt: string): void {
  db.prepare("UPDATE projects SET current_version=?, last_built_at=? WHERE uuid=?").run(version, builtAt, uuid);
}

export function updateLastLockedAt(db: DB, uuid: string, when: string): void {
  db.prepare("UPDATE projects SET last_locked_at=? WHERE uuid=?").run(when, uuid);
}

export function insertBuildHistory(db: DB, e: Omit<BuildHistoryEntry, "id"> & { commitSha?: string | null }): void {
  db.prepare(`
    INSERT INTO build_history(project_uuid,version,built_at,artifact_filename,commit_sha,notes)
    VALUES(?,?,?,?,?,?)
  `).run(e.projectUuid, e.version, e.builtAt, e.artifactFilename, e.commitSha ?? null, e.notes);
}

export function updateBuildHistoryCommitSha(db: DB, id: number, sha: string): void {
  db.prepare("UPDATE build_history SET commit_sha=? WHERE id=?").run(sha, id);
}

export function upsertProjectFile(db: DB, projectUuid: string, originalPath: string, hashedName: string): void {
  db.prepare(`INSERT INTO project_files(project_uuid,original_path,hashed_name) VALUES(?,?,?)
    ON CONFLICT(project_uuid,original_path) DO UPDATE SET hashed_name=excluded.hashed_name`)
    .run(projectUuid, originalPath, hashedName);
}

export function deleteProjectFile(db: DB, projectUuid: string, originalPath: string): void {
  db.prepare("DELETE FROM project_files WHERE project_uuid=? AND original_path=?").run(projectUuid, originalPath);
}

export function listProjectFiles(db: DB, projectUuid: string): Array<{originalPath: string; hashedName: string}> {
  const rows = db.prepare("SELECT original_path, hashed_name FROM project_files WHERE project_uuid=?").all(projectUuid) as Array<{original_path: string; hashed_name: string}>;
  return rows.map(r => ({ originalPath: r.original_path, hashedName: r.hashed_name }));
}

export function clearProjectFiles(db: DB, projectUuid: string): void {
  db.prepare("DELETE FROM project_files WHERE project_uuid=?").run(projectUuid);
}

export function getBuildHistory(db: DB, uuid: string): BuildHistoryEntry[] {
  const rows = db.prepare(
    "SELECT * FROM build_history WHERE project_uuid=? ORDER BY id DESC"
  ).all(uuid) as Array<{ id: number; project_uuid: string; version: string; built_at: string; artifact_filename: string; commit_sha: string | null; notes: string | null }>;
  return rows.map(r => ({
    id: r.id, projectUuid: r.project_uuid, version: r.version,
    builtAt: r.built_at, artifactFilename: r.artifact_filename,
    commitSha: r.commit_sha, notes: r.notes
  }));
}
