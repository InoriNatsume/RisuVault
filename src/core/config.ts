import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { VaultConfig } from "../types.js";
import { configPath } from "./paths.js";
import { NotInitializedError, UserError } from "./errors.js";

export function generateDefaultConfig(): VaultConfig {
  return {
    vaultVersion: 1,
    kdf: {
      algorithm: "argon2id",
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      saltHex: randomBytes(32).toString("hex")
    },
    dbCipher: "sqlcipher-aes-256",
    fileCipher: "aes-256-gcm",
    passphraseSource: { type: "manual" }
  };
}

export function writeConfig(root: string, config: VaultConfig): void {
  writeFileSync(configPath(root), JSON.stringify(config, null, 2) + "\n");
}

export function readConfig(root: string): VaultConfig {
  const p = configPath(root);
  if (!existsSync(p)) throw new NotInitializedError();
  try {
    return JSON.parse(readFileSync(p, "utf8")) as VaultConfig;
  } catch (e) {
    throw new UserError(`config.json invalid: ${(e as Error).message}`);
  }
}
