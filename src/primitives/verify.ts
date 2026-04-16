import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptBuffer } from "../core/crypto.js";
import { openDb, listProjects, listProjectFiles } from "../core/db.js";
import { dbPath, projectGitRoot, projectGitDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";

export interface VerifyResult {
  ok: boolean;
  projectsChecked: number;
  filesChecked: number;
  violations: string[];
}

const HASH_ENC_RE = /^[0-9a-f]{64}\.enc$/;
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "utf8");

export async function runVerify(root: string, passphrase: string): Promise<VerifyResult> {
  const violations: string[] = [];
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));

  // 1. vault.db must NOT have the plaintext SQLite magic header.
  const dbFile = dbPath(root);
  if (!existsSync(dbFile)) {
    throw new UserError("vault.db not found");
  }
  const dbHead = Buffer.alloc(16);
  const fd = readFileSync(dbFile).subarray(0, 16);
  dbHead.set(fd);
  if (dbHead.equals(SQLITE_MAGIC)) {
    violations.push(`vault.db: plaintext SQLite header detected (expected SQLCipher ciphertext)`);
  }

  // 2. .gitignore must contain required rules.
  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf8");
    const requiredPatterns = [
      { pattern: /^project_work\/\s*$/m, label: "project_work/" },
      { pattern: /^inbox\/\*\s*$/m, label: "inbox/*" },
      { pattern: /^outbox\/\*\s*$/m, label: "outbox/*" },
      { pattern: /^\/dist\/\s*$/m, label: "/dist/" }
    ];
    for (const { pattern, label } of requiredPatterns) {
      if (!pattern.test(content)) {
        violations.push(`.gitignore missing required rule: '${label}' — plaintext leak risk`);
      }
    }
  } else {
    violations.push(`.gitignore missing — without it, plaintext sources in inbox/outbox/project_work may be committed`);
  }

  // 3. Walk project_git/ — only <64hex>.enc files allowed directly under each project, plus assets/ dir.
  const pRoot = projectGitRoot(root);
  let projectsChecked = 0;
  let filesChecked = 0;
  const db = openDb(dbFile, key);
  try {
    const projects = listProjects(db);
    for (const p of projects) {
      projectsChecked++;
      const pDir = projectGitDir(root, p.uuid);
      if (!existsSync(pDir)) {
        violations.push(`project ${p.uuid}: directory missing`);
        continue;
      }

      // 3a. Expected filenames only
      for (const entry of readdirSync(pDir)) {
        const full = join(pDir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          if (entry !== "assets") {
            violations.push(`project ${p.uuid}: unexpected subdirectory '${entry}' (only 'assets/' allowed)`);
          }
          continue;
        }
        if (!HASH_ENC_RE.test(entry)) {
          violations.push(`project ${p.uuid}: file '${entry}' does not match <64hex>.enc — filename leak risk`);
        }
      }

      // 3b. Each DB-mapped file must decrypt successfully.
      const files = listProjectFiles(db, p.uuid);
      for (const f of files) {
        const encPath = join(pDir, `${f.hashedName}.enc`);
        if (!existsSync(encPath)) {
          violations.push(`project ${p.uuid}: DB references ${f.originalPath} (${f.hashedName}.enc) but file missing`);
          continue;
        }
        try {
          decryptBuffer(readFileSync(encPath), p.fileKey);
          filesChecked++;
        } catch (e) {
          violations.push(`project ${p.uuid}: ${f.hashedName}.enc failed to decrypt (${(e as Error).message})`);
        }
      }
    }
  } finally { db.close(); }

  // 4. Any project dir on disk that isn't in the DB
  if (existsSync(pRoot)) {
    const dbUuids = new Set((await (async () => {
      const db2 = openDb(dbFile, key);
      try { return listProjects(db2).map(p => p.uuid); } finally { db2.close(); }
    })()));
    for (const entry of readdirSync(pRoot)) {
      if (entry === ".gitkeep") continue;
      const full = join(pRoot, entry);
      if (!statSync(full).isDirectory()) continue;
      if (!dbUuids.has(entry)) {
        violations.push(`project_git/${entry}: on disk but not in vault.db`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    projectsChecked,
    filesChecked,
    violations
  };
}
