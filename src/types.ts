export type ProjectKind = "bot" | "module" | "preset";

export type SupportedInputFormat =
  | "charx" | "png" | "jpg" | "jpeg"
  | "risum"
  | "risup" | "risupreset";

export interface ProjectRecord {
  uuid: string;
  name: string;
  kind: ProjectKind;
  sourceFormat: SupportedInputFormat;
  fileKey: Buffer;
  currentVersion: string;
  addedAt: string;
  lastLockedAt: string | null;
  lastBuiltAt: string | null;
}

export interface BuildHistoryEntry {
  id: number;
  projectUuid: string;
  version: string;
  builtAt: string;
  artifactFilename: string;
  commitSha: string | null;
  notes: string | null;
}

export interface VaultConfig {
  vaultVersion: number;
  kdf: {
    algorithm: "argon2id";
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    saltHex: string;
  };
  dbCipher: "sqlcipher-aes-256";
  fileCipher: "aes-256-gcm";
  passphraseSource: { type: "manual" } | { type: "env" };
}
