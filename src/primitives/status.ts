import { existsSync } from "node:fs";
import { readConfig } from "../core/config.js";
import { deriveKey } from "../core/crypto.js";
import { openDb, listProjects } from "../core/db.js";
import { dbPath, projectWorkDir } from "../core/paths.js";

export interface StatusRow {
  uuid: string;
  name: string;
  kind: string;
  currentVersion: string;
  state: "work" | "git-only";
  lastLockedAt: string | null;
  lastBuiltAt: string | null;
}

export async function runStatus(root: string, passphrase: string): Promise<StatusRow[]> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    return listProjects(db).map(p => ({
      uuid: p.uuid, name: p.name, kind: p.kind,
      currentVersion: p.currentVersion,
      state: existsSync(projectWorkDir(root, p.name)) ? "work" : "git-only",
      lastLockedAt: p.lastLockedAt, lastBuiltAt: p.lastBuiltAt
    }));
  } finally { db.close(); }
}
