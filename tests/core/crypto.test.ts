import { describe, it, expect } from "vitest";
import {
  deriveKey,
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
  computeHashedName
} from "../../src/core/crypto.js";
import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("deriveKey", () => {
  it("produces 32-byte key deterministically for same passphrase+salt", async () => {
    const salt = Buffer.from("0".repeat(64), "hex");
    const k1 = await deriveKey("correct horse battery staple", salt);
    const k2 = await deriveKey("correct horse battery staple", salt);
    expect(k1.length).toBe(32);
    expect(k1.equals(k2)).toBe(true);
  });

  it("produces different key for different passphrase", async () => {
    const salt = Buffer.from("0".repeat(64), "hex");
    const k1 = await deriveKey("pass1", salt);
    const k2 = await deriveKey("pass2", salt);
    expect(k1.equals(k2)).toBe(false);
  });
});

describe("encryptBuffer / decryptBuffer", () => {
  it("round-trips a buffer", () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from("Hello, Risu!", "utf8");
    const ciphertext = encryptBuffer(plaintext, key);
    const decrypted = decryptBuffer(ciphertext, key);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("produces different ciphertext for same plaintext (random nonce)", () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from("same", "utf8");
    const c1 = encryptBuffer(plaintext, key);
    const c2 = encryptBuffer(plaintext, key);
    expect(c1.equals(c2)).toBe(false);
  });

  it("fails with wrong key", () => {
    const key1 = randomBytes(32);
    const key2 = randomBytes(32);
    const ciphertext = encryptBuffer(Buffer.from("secret"), key1);
    expect(() => decryptBuffer(ciphertext, key2)).toThrow();
  });

  it("fails on tampered ciphertext", () => {
    const key = randomBytes(32);
    const ciphertext = encryptBuffer(Buffer.from("secret"), key);
    ciphertext[20] ^= 0xff;
    expect(() => decryptBuffer(ciphertext, key)).toThrow();
  });
});

describe("computeHashedName", () => {
  it("is deterministic for same key+path", () => {
    const k = randomBytes(32);
    expect(computeHashedName(k, "src/card/name.txt")).toBe(computeHashedName(k, "src/card/name.txt"));
  });
  it("is different across keys for same path", () => {
    expect(computeHashedName(randomBytes(32), "a")).not.toBe(computeHashedName(randomBytes(32), "a"));
  });
  it("normalizes windows backslashes to posix", () => {
    const k = randomBytes(32);
    expect(computeHashedName(k, "src\\card\\name.txt")).toBe(computeHashedName(k, "src/card/name.txt"));
  });
  it("returns 64 hex chars", () => {
    expect(computeHashedName(randomBytes(32), "x").length).toBe(64);
  });
});

describe("encryptFile / decryptFile", () => {
  it("round-trips a file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "risuvault-crypto-"));
    const key = randomBytes(32);
    const plain = join(dir, "plain.txt");
    const enc = join(dir, "plain.txt.enc");
    const out = join(dir, "out.txt");
    writeFileSync(plain, "hello file");
    encryptFile(plain, enc, key);
    decryptFile(enc, out, key);
    expect(readFileSync(out, "utf8")).toBe("hello file");
  });
});
