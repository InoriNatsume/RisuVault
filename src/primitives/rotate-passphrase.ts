import { readConfig } from "../core/config.js";
import { deriveKey } from "../core/crypto.js";
import { openDb } from "../core/db.js";
import { dbPath } from "../core/paths.js";
import { UserError } from "../core/errors.js";

export async function runRotatePassphrase(
  root: string,
  oldPassphrase: string,
  newPassphrase: string
): Promise<void> {
  if (!newPassphrase || newPassphrase === oldPassphrase) {
    throw new UserError("new passphrase must be non-empty and different from old");
  }
  const cfg = readConfig(root);
  const salt = Buffer.from(cfg.kdf.saltHex, "hex");
  const oldKey = await deriveKey(oldPassphrase, salt);
  const newKey = await deriveKey(newPassphrase, salt);

  // openDb validates the old key (AuthError if wrong). PRAGMA rekey is atomic:
  // on success the DB is re-encrypted with the new key; on failure the DB is
  // untouched. Salt is preserved so config.json stays valid.
  const db = openDb(dbPath(root), oldKey);
  try {
    db.pragma(`rekey="x'${newKey.toString("hex")}'"`);
  } finally {
    db.close();
  }
}
