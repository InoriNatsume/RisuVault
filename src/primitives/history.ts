import { readConfig } from "../core/config.js";
import { deriveKey } from "../core/crypto.js";
import { openDb, resolveProject, getBuildHistory } from "../core/db.js";
import { dbPath } from "../core/paths.js";
import { UserError } from "../core/errors.js";
import type { BuildHistoryEntry } from "../types.js";

export async function runHistory(root: string, passphrase: string, ref: string): Promise<BuildHistoryEntry[]> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);
    return getBuildHistory(db, p.uuid);
  } finally { db.close(); }
}
