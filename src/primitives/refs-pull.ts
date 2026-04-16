import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptBuffer } from "../core/crypto.js";
import { openDb, getOrCreateRefsKey } from "../core/db.js";
import { dbPath, refGitDir, refWorkDir } from "../core/paths.js";

export interface RefsPullResult {
  pulled: number;
}

export async function runRefsPull(root: string, passphrase: string): Promise<RefsPullResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  let refsKey: Buffer;
  try {
    refsKey = getOrCreateRefsKey(db);
  } finally {
    db.close();
  }

  const gitDir = refGitDir(root);
  const workDir = refWorkDir(root);

  if (!existsSync(gitDir)) {
    return { pulled: 0 };
  }

  const encFiles = readdirSync(gitDir).filter(e => e.endsWith(".enc"));
  let pulled = 0;

  for (const encName of encFiles) {
    const srcPath = join(gitDir, encName);
    const baseName = encName.slice(0, -4); // remove .enc
    const dstPath = join(workDir, baseName);
    const blob = readFileSync(srcPath);
    const plain = decryptBuffer(blob, refsKey);
    writeFileSync(dstPath, plain);
    pulled++;
  }

  return { pulled };
}
