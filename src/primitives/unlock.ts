import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptFile } from "../core/crypto.js";
import { openDb, resolveProject, listProjectFiles } from "../core/db.js";
import { dbPath, projectDir, projectCacheDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";

export async function runUnlock(root: string, passphrase: string, ref: string): Promise<string> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);

    const srcDir = projectDir(root, p.uuid);
    const dstDir = projectCacheDir(root, p.uuid);
    rmSync(dstDir, { recursive: true, force: true });
    mkdirSync(dstDir, { recursive: true });

    const fileMap = listProjectFiles(db, p.uuid);
    for (const { originalPath, hashedName } of fileMap) {
      const enc = join(srcDir, `${hashedName}.enc`);
      const out = join(dstDir, originalPath);
      mkdirSync(dirname(out), { recursive: true });
      decryptFile(enc, out, p.fileKey);
    }
    return p.uuid;
  } finally { db.close(); }
}
