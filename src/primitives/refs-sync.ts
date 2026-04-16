import { readdirSync, readFileSync, writeFileSync, rmSync, statSync, existsSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer } from "../core/crypto.js";
import { openDb, getOrCreateRefsKey } from "../core/db.js";
import { dbPath, refGitDir, refWorkDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";

export interface RefsSyncResult {
  synced: number;
  removed: number;
}

export async function runRefsSync(root: string, passphrase: string): Promise<RefsSyncResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  let refsKey: Buffer;
  try {
    refsKey = getOrCreateRefsKey(db);
  } finally {
    db.close();
  }

  const workDir = refWorkDir(root);
  const gitDir = refGitDir(root);

  // Walk ref_work/ — shallow, non-recursive
  const workEntries = existsSync(workDir) ? readdirSync(workDir) : [];
  const workFiles = new Set<string>();

  for (const entry of workEntries) {
    const full = join(workDir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      throw new UserError(`global_refs/ref_work/ must be flat — found subdirectory: ${entry}`);
    }
    workFiles.add(entry);
  }

  // Encrypt each work file → ref_git/<basename>.enc
  let synced = 0;
  for (const name of workFiles) {
    const srcPath = join(workDir, name);
    const dstPath = join(gitDir, `${name}.enc`);
    const tmpPath = `${dstPath}.tmp`;
    const content = readFileSync(srcPath);
    const encrypted = encryptBuffer(content, refsKey);
    writeFileSync(tmpPath, encrypted);
    renameSync(tmpPath, dstPath);
    synced++;
  }

  // Remove stale .enc files whose base name is not in ref_work/
  let removed = 0;
  if (existsSync(gitDir)) {
    for (const entry of readdirSync(gitDir)) {
      if (!entry.endsWith(".enc")) continue;
      const baseName = entry.slice(0, -4); // remove .enc
      if (!workFiles.has(baseName)) {
        rmSync(join(gitDir, entry));
        removed++;
      }
    }
  }

  return { synced, removed };
}
