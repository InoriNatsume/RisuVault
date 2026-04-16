import { existsSync, renameSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer, computeHashedName } from "../core/crypto.js";
import {
  openDb, listProjects, resolveProject, upsertProjectFile, deleteProjectFile,
  listProjectFiles, updateLastLockedAt
} from "../core/db.js";
import { dbPath, projectGitDir, projectWorkDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";
import { walkFiles } from "../core/walk.js";

export interface SyncEntry { uuid: string; name: string; fileCount: number; }
export interface SyncResult { synced: SyncEntry[]; }

export async function runSync(
  root: string,
  passphrase: string,
  ref: string
): Promise<SyncResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const targets = ref === "--all" ? listProjects(db) : (() => {
      const p = resolveProject(db, ref);
      if (!p) throw new UserError(`no project: ${ref}`);
      return [p];
    })();

    const synced: SyncEntry[] = [];
    for (const p of targets) {
      const encDir = projectGitDir(root, p.uuid);
      const workDir = projectWorkDir(root, p.name);

      if (!existsSync(workDir)) {
        throw new UserError(`project_work/${p.name}/ missing; run 'risuvault pull ${p.name}' first`);
      }

      mkdirSync(encDir, { recursive: true });

      // Remove vault-level workspace-guidance from work dir before syncing.
      rmSync(join(workDir, "AGENTS.md"), { force: true });
      rmSync(join(workDir, ".agents"), { recursive: true, force: true });

      const plainFiles = walkFiles(workDir, { excludeDirs: ["assets"] });
      const currentRelPaths = new Set<string>();

      for (const plain of plainFiles) {
        const rel = relative(workDir, plain).replace(/\\/g, "/");
        currentRelPaths.add(rel);
        const hashedName = computeHashedName(p.fileKey, rel);
        const encFinal = join(encDir, `${hashedName}.enc`);
        const encTmp = encFinal + ".tmp";
        const blob = encryptBuffer(readFileSync(plain), p.fileKey);
        writeFileSync(encTmp, blob);
        renameSync(encTmp, encFinal);
        upsertProjectFile(db, p.uuid, rel, hashedName);
      }

      // Remove stale entries
      const existing = listProjectFiles(db, p.uuid);
      for (const { originalPath, hashedName } of existing) {
        if (!currentRelPaths.has(originalPath)) {
          const staleEnc = join(encDir, `${hashedName}.enc`);
          if (existsSync(staleEnc)) rmSync(staleEnc);
          deleteProjectFile(db, p.uuid, originalPath);
        }
      }

      updateLastLockedAt(db, p.uuid, new Date().toISOString());
      synced.push({ uuid: p.uuid, name: p.name, fileCount: currentRelPaths.size });
    }
    return { synced };
  } finally { db.close(); }
}
