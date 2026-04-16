import { mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptFile } from "../core/crypto.js";
import { openDb, listProjects, resolveProject, listProjectFiles } from "../core/db.js";
import { dbPath, projectGitDir, projectWorkDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";

export interface PullEntry { uuid: string; name: string; fileCount: number; }
export interface PullResult { pulled: PullEntry[]; }

export async function runPull(
  root: string,
  passphrase: string,
  ref: string
): Promise<PullResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const targets = ref === "--all" ? listProjects(db) : (() => {
      const p = resolveProject(db, ref);
      if (!p) throw new UserError(`no project: ${ref}`);
      return [p];
    })();

    const pulled: PullEntry[] = [];
    for (const p of targets) {
      const encDir = projectGitDir(root, p.uuid);
      const workDir = projectWorkDir(root, p.name);

      // Clear and recreate work dir
      rmSync(workDir, { recursive: true, force: true });
      mkdirSync(workDir, { recursive: true });

      const files = listProjectFiles(db, p.uuid);
      for (const { originalPath, hashedName } of files) {
        const encPath = join(encDir, `${hashedName}.enc`);
        const outPath = join(workDir, originalPath);
        mkdirSync(dirname(outPath), { recursive: true });
        decryptFile(encPath, outPath, p.fileKey);
      }
      pulled.push({ uuid: p.uuid, name: p.name, fileCount: files.length });
    }
    return { pulled };
  } finally { db.close(); }
}
