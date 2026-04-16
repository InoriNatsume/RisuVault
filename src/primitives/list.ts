import { readConfig } from "../core/config.js";
import { deriveKey } from "../core/crypto.js";
import { openDb, listProjects } from "../core/db.js";
import { dbPath } from "../core/paths.js";
import type { ProjectRecord } from "../types.js";

export interface ListItem {
  uuid: string;
  name: string;
  kind: ProjectRecord["kind"];
  currentVersion: string;
  addedAt: string;
  lastLockedAt: string | null;
  lastBuiltAt: string | null;
}

export async function runList(root: string, passphrase: string): Promise<ListItem[]> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    return listProjects(db).map(p => ({
      uuid: p.uuid, name: p.name, kind: p.kind,
      currentVersion: p.currentVersion, addedAt: p.addedAt,
      lastLockedAt: p.lastLockedAt, lastBuiltAt: p.lastBuiltAt
    }));
  } finally { db.close(); }
}
