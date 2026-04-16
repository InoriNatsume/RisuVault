import { rmSync } from "node:fs";
import { readConfig } from "../core/config.js";
import { deriveKey } from "../core/crypto.js";
import { openDb, resolveProject } from "../core/db.js";
import { dbPath, projectWorkDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";

export async function runWipeWork(
  root: string,
  passphrase: string,
  ref: string
): Promise<void> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);
    rmSync(projectWorkDir(root, p.name), { recursive: true, force: true });
  } finally { db.close(); }
}
