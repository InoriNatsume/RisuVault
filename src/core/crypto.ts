import argon2 from "argon2";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { AuthError } from "./errors.js";

export const ARGON2_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  raw: true
} as const;

export async function deriveKey(
  passphrase: string,
  salt: Buffer
): Promise<Buffer> {
  const raw = await argon2.hash(passphrase, { ...ARGON2_PARAMS, salt });
  return raw as Buffer;
}

const NONCE_LEN = 12;
const TAG_LEN = 16;

export function encryptBuffer(plaintext: Buffer, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ct, tag]);
}

export function decryptBuffer(blob: Buffer, key: Buffer): Buffer {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  if (blob.length < NONCE_LEN + TAG_LEN) {
    throw new AuthError("ciphertext too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(NONCE_LEN, blob.length - TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new AuthError("decryption failed (wrong key or tampered data)");
  }
}

export function computeHashedName(fileKey: Buffer, originalPath: string): string {
  const normalized = originalPath.replace(/\\/g, "/");
  return createHmac("sha256", fileKey).update(normalized, "utf8").digest("hex");
}

export function encryptFile(srcPath: string, dstPath: string, key: Buffer): void {
  const plain = readFileSync(srcPath);
  const enc = encryptBuffer(plain, key);
  writeFileSync(dstPath, enc);
}

export function decryptFile(srcPath: string, dstPath: string, key: Buffer): void {
  const blob = readFileSync(srcPath);
  const plain = decryptBuffer(blob, key);
  writeFileSync(dstPath, plain);
}
