import {
  existsSync, readFileSync, rmSync, writeFileSync, readdirSync, rmdirSync,
  statSync, renameSync, mkdirSync
} from "node:fs";
import { join, relative } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptBuffer, encryptBuffer, computeHashedName, decryptFile } from "../core/crypto.js";
import { openDb, listProjects, upsertProjectFile, clearProjectFiles, listProjectFiles } from "../core/db.js";
import { dbPath, projectGitRoot, projectGitDir, projectWorkDir } from "../core/paths.js";
import { walkFiles } from "../core/walk.js";
import { dirname } from "node:path";

export interface MigrateResult {
  projectsMigrated: number;
  filesRenamed: number;
  layoutMigrated: boolean;
  workDirsCreated: number;
}

export async function runMigrate(root: string, passphrase: string): Promise<MigrateResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));

  let layoutMigrated = false;
  let workDirsCreated = 0;

  // Phase 1: rename projects/ → project_git/ if old layout present
  const oldProjectsDir = join(root, "projects");
  const newProjectGitRoot = projectGitRoot(root);
  if (existsSync(oldProjectsDir) && !existsSync(newProjectGitRoot)) {
    renameSync(oldProjectsDir, newProjectGitRoot);
    layoutMigrated = true;
  }

  const db = openDb(dbPath(root), key);
  let projectsMigrated = 0;
  let filesRenamed = 0;
  try {
    const projects = listProjects(db);
    for (const p of projects) {
      const pDir = projectGitDir(root, p.uuid);
      if (!existsSync(pDir)) continue;

      const encFiles = walkFiles(pDir, { excludeDirs: ["assets"] }).filter(f => f.endsWith(".enc"));
      if (encFiles.length === 0) continue;

      // Detect if hash-migration already done
      const alreadyHashed = encFiles.every(f => {
        const rel = relative(pDir, f).replace(/\\/g, "/");
        return /^[0-9a-f]{64}\.enc$/.test(rel);
      });

      if (!alreadyHashed) {
        // Decrypt everything into memory: relPath -> plaintext buffer
        const plaintext: Array<{ origPath: string; buf: Buffer }> = [];
        for (const enc of encFiles) {
          const rel = relative(pDir, enc).replace(/\\/g, "/").replace(/\.enc$/, "");
          const buf = decryptBuffer(readFileSync(enc), p.fileKey);
          plaintext.push({ origPath: rel, buf });
        }

        // Remove old encrypted files
        for (const enc of encFiles) rmSync(enc);
        removeEmptyDirs(pDir, ["assets"]);

        // Reset DB mapping
        clearProjectFiles(db, p.uuid);

        // Re-encrypt with hashed names (flat layout)
        for (const { origPath, buf } of plaintext) {
          const hashedName = computeHashedName(p.fileKey, origPath);
          const outPath = join(pDir, `${hashedName}.enc`);
          writeFileSync(outPath, encryptBuffer(buf, p.fileKey));
          upsertProjectFile(db, p.uuid, origPath, hashedName);
          filesRenamed++;
        }
        projectsMigrated++;
      }

      // Phase 2: create project_work/<name>/ if missing
      const workDir = projectWorkDir(root, p.name);
      if (!existsSync(workDir)) {
        mkdirSync(workDir, { recursive: true });
        const files = listProjectFiles(db, p.uuid);
        for (const { originalPath, hashedName } of files) {
          const encPath = join(pDir, `${hashedName}.enc`);
          if (!existsSync(encPath)) continue;
          const outPath = join(workDir, originalPath);
          mkdirSync(dirname(outPath), { recursive: true });
          decryptFile(encPath, outPath, p.fileKey);
        }
        workDirsCreated++;
      }
    }
    return { projectsMigrated, filesRenamed, layoutMigrated, workDirsCreated };
  } finally { db.close(); }
}

function removeEmptyDirs(root: string, keepDirNames: string[]): void {
  function walk(dir: string): void {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (keepDirNames.includes(name)) continue;
      const full = join(dir, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
      } catch { continue; }
    }
    let remaining: string[] = [];
    try { remaining = readdirSync(dir); } catch { return; }
    const nonKept = remaining.filter(n => !keepDirNames.includes(n));
    if (nonKept.length === 0 && dir !== root) {
      try { rmdirSync(dir); } catch { /* ignore */ }
    }
  }
  walk(root);
}
