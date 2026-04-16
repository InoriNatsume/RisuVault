import { existsSync, mkdirSync } from "node:fs";
import {
  vaultDir, dbPath, cacheDir, projectsDir, inboxDir, outboxDir
} from "../core/paths.js";
import { generateDefaultConfig, writeConfig } from "../core/config.js";
import { openDb, initDbSchema } from "../core/db.js";
import { deriveKey } from "../core/crypto.js";
import { UserError } from "../core/errors.js";

export async function runInit(root: string, passphrase: string): Promise<void> {
  if (existsSync(vaultDir(root))) {
    throw new UserError(`vault already exists at ${vaultDir(root)}`);
  }
  mkdirSync(vaultDir(root), { recursive: true });
  mkdirSync(cacheDir(root), { recursive: true });
  mkdirSync(projectsDir(root), { recursive: true });
  mkdirSync(inboxDir(root), { recursive: true });
  mkdirSync(outboxDir(root), { recursive: true });

  const config = generateDefaultConfig();
  writeConfig(root, config);

  const key = await deriveKey(passphrase, Buffer.from(config.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  initDbSchema(db);
  db.close();
}
