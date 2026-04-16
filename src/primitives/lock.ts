import { renameSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer, computeHashedName } from "../core/crypto.js";
import { openDb, resolveProject, updateLastLockedAt, upsertProjectFile, deleteProjectFile, listProjectFiles } from "../core/db.js";
import { dbPath, projectCacheDir, projectDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";
import { walkFiles } from "../core/walk.js";

export async function runLock(root: string, passphrase: string, ref: string): Promise<void> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);

    const srcDir = projectCacheDir(root, p.uuid);
    if (!existsSync(srcDir)) {
      throw new UserError(`no cache to lock for ${p.name}; run unlock first`);
    }
    const dstDir = projectDir(root, p.uuid);

    const files = walkFiles(srcDir, { excludeDirs: ["assets"] });
    const currentRelPaths = new Set<string>();

    for (const plain of files) {
      const rel = relative(srcDir, plain).replace(/\\/g, "/");
      currentRelPaths.add(rel);
      const hashedName = computeHashedName(p.fileKey, rel);
      const encFinal = join(dstDir, `${hashedName}.enc`);
      const encTmp = encFinal + ".tmp";
      const plainBuf = readFileSync(plain);
      const encBuf = encryptBuffer(plainBuf, p.fileKey);
      writeFileSync(encTmp, encBuf);
      renameSync(encTmp, encFinal);
      upsertProjectFile(db, p.uuid, rel, hashedName);
    }

    // Remove stale entries (files removed during editing)
    const existingEntries = listProjectFiles(db, p.uuid);
    for (const { originalPath, hashedName } of existingEntries) {
      if (!currentRelPaths.has(originalPath)) {
        const staleEnc = join(dstDir, `${hashedName}.enc`);
        if (existsSync(staleEnc)) rmSync(staleEnc);
        deleteProjectFile(db, p.uuid, originalPath);
      }
    }

    updateLastLockedAt(db, p.uuid, new Date().toISOString());
    rmSync(srcDir, { recursive: true, force: true });
  } finally { db.close(); }
}
