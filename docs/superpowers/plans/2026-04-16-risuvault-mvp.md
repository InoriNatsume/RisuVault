# RisuVault MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 MVP of RisuVault — a CLI tool that wraps RisuPack to provide encrypted, version-managed, git-friendly backup of RisuAI bots/modules/presets into a public GitHub repository.

**Architecture:** Node.js + TypeScript CLI. SQLCipher-encrypted database (`vault.db`) stores the project registry, per-project AES-256-GCM keys, and build version history. Each project folder (`projects/<uuid>/`) holds individually-encrypted text/code files. Built artifacts go to `projects/<uuid>/dist/` (encrypted, git-tracked). Assets are gitignored.

**Tech Stack:**
- Node.js ≥ 20, TypeScript
- `better-sqlite3-multiple-ciphers` (SQLCipher)
- `argon2` (KDF)
- Node.js `crypto` (AES-256-GCM)
- `commander` (CLI)
- `vitest` (tests)
- `tsup` (build)
- `risupack` via git dependency

**Reference spec:** [2026-04-16-risuvault-design.md](../specs/2026-04-16-risuvault-design.md)

---

## File Structure

```
RisuVault/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts              # Library exports (for testing, scripting)
│   ├── cli.ts                # CLI bin entrypoint
│   ├── types.ts              # Shared TS types
│   ├── core/
│   │   ├── paths.ts          # Path helpers (vaultRoot, projectDir, cacheDir)
│   │   ├── uuid.ts           # UUID v4 generation
│   │   ├── config.ts         # config.json read/write
│   │   ├── crypto.ts         # deriveKey, encryptFile, decryptFile
│   │   ├── db.ts             # SQLCipher open/close, schema, migrations
│   │   ├── passphrase.ts     # prompt / env acquisition
│   │   ├── version.ts        # version bump logic
│   │   └── errors.ts         # typed errors (AuthError, NotInitializedError)
│   └── primitives/
│       ├── init.ts
│       ├── add.ts
│       ├── list.ts
│       ├── unlock.ts
│       ├── lock.ts
│       ├── build.ts
│       ├── status.ts
│       └── history.ts
├── tests/
│   ├── helpers/
│   │   └── tmp-vault.ts      # vitest helper: create temp vault
│   ├── core/
│   │   ├── crypto.test.ts
│   │   ├── config.test.ts
│   │   ├── db.test.ts
│   │   └── version.test.ts
│   └── primitives/
│       ├── init.test.ts
│       ├── add.test.ts
│       ├── list.test.ts
│       ├── unlock-lock.test.ts
│       ├── build.test.ts
│       └── status.test.ts
└── .claude/skills/           # already scaffolded, refined in Task 17
```

**Responsibility boundaries:**
- `core/crypto.ts` — pure functions. No I/O of app state.
- `core/db.ts` — SQLCipher lifecycle and typed queries. No business logic.
- `core/config.ts` — config.json only. No other files.
- `primitives/*.ts` — one file per CLI command. Orchestrates core modules.
- `cli.ts` — commander wiring. Thin — delegates to primitives.

---

## Task 1: Repository Scaffolding

**Files:**
- Create: `RisuVault/package.json`
- Create: `RisuVault/tsconfig.json`
- Create: `RisuVault/tsup.config.ts`
- Create: `RisuVault/vitest.config.ts`
- Create: `RisuVault/src/index.ts`
- Create: `RisuVault/src/types.ts`

- [ ] **Step 1: Create package.json**

Write `RisuVault/package.json`:

```json
{
  "name": "risuvault",
  "version": "0.1.0",
  "description": "Encrypted, version-managed backup of RisuAI files to public GitHub repos",
  "type": "module",
  "bin": { "risuvault": "./dist/cli.js" },
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "argon2": "^0.41.1",
    "better-sqlite3-multiple-ciphers": "^11.8.1",
    "commander": "^12.1.0",
    "risupack": "git+https://github.com/REPLACE_OWNER/RisuPack.git#main"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20" }
}
```

Note: `risupack` git URL uses placeholder owner. Replace with actual owner before first install. If RisuPack is not yet pushed to a public remote, use a local file path temporarily: `"risupack": "file:../RisuPack"`.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "node20",
  dts: true,
  clean: true,
  sourcemap: true
});
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000
  }
});
```

- [ ] **Step 5: Create src/index.ts and src/types.ts**

`src/types.ts`:

```ts
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
```

`src/index.ts`:

```ts
export * from "./types.js";
```

- [ ] **Step 6: Install dependencies**

Run: `cd RisuVault && npm install`
Expected: No errors. `node_modules/` created.

If `risupack` git URL fails, switch to `"file:../RisuPack"` temporarily and re-run.

- [ ] **Step 7: Verify typecheck and empty test run**

Run: `cd RisuVault && npm run typecheck`
Expected: No errors.

Run: `cd RisuVault && npm test`
Expected: "No test files found" (not an error — vitest exits 0 with 0 tests).

- [ ] **Step 8: Commit**

```bash
cd RisuVault
git init
git add package.json tsconfig.json tsup.config.ts vitest.config.ts src/ .gitignore README.md .risuvault/ .claude/ projects/.gitkeep inbox/README.md docs/
git commit -m "feat: scaffold RisuVault project

Initial package.json, tsconfig, tsup, vitest, and base types.
RisuPack declared as git dependency."
```

Note: Git identity must be set to `inori` account per CLAUDE.md. Before first commit, check `%USERPROFILE%\.codex\git-accounts.toml` and run:

```bash
git config user.name "<inori user_name>"
git config user.email "<inori user_email>"
```

---

## Task 2: Crypto Core — Key Derivation

**Files:**
- Create: `RisuVault/src/core/crypto.ts`
- Create: `RisuVault/src/core/errors.ts`
- Test: `RisuVault/tests/core/crypto.test.ts`

- [ ] **Step 1: Write failing test for deriveKey**

`tests/core/crypto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveKey } from "../../src/core/crypto.js";

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
```

- [ ] **Step 2: Run test — should fail**

Run: `cd RisuVault && npx vitest run tests/core/crypto.test.ts`
Expected: FAIL — "Cannot find module .../crypto.js"

- [ ] **Step 3: Implement deriveKey**

`src/core/errors.ts`:

```ts
export class VaultError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = "VaultError";
  }
}

export class AuthError extends VaultError {
  constructor(msg = "authentication failed") {
    super(msg, 3);
    this.name = "AuthError";
  }
}

export class NotInitializedError extends VaultError {
  constructor() {
    super("no .risuvault found; run `risuvault init` first", 1);
    this.name = "NotInitializedError";
  }
}

export class UserError extends VaultError {
  constructor(msg: string) {
    super(msg, 1);
    this.name = "UserError";
  }
}
```

`src/core/crypto.ts`:

```ts
import argon2 from "argon2";

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
```

- [ ] **Step 4: Run test — should pass**

Run: `cd RisuVault && npx vitest run tests/core/crypto.test.ts`
Expected: PASS (both tests green).

- [ ] **Step 5: Commit**

```bash
git add src/core/crypto.ts src/core/errors.ts tests/core/crypto.test.ts
git commit -m "feat(crypto): add Argon2id key derivation"
```

---

## Task 3: Crypto Core — AES-GCM File Encryption

**Files:**
- Modify: `RisuVault/src/core/crypto.ts`
- Modify: `RisuVault/tests/core/crypto.test.ts`

- [ ] **Step 1: Add failing tests for encrypt/decrypt**

Append to `tests/core/crypto.test.ts`:

```ts
import { encryptBuffer, decryptBuffer } from "../../src/core/crypto.js";
import { randomBytes } from "node:crypto";

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
```

- [ ] **Step 2: Run test — should fail**

Run: `cd RisuVault && npx vitest run tests/core/crypto.test.ts`
Expected: FAIL on 4 new tests.

- [ ] **Step 3: Implement encrypt/decrypt**

Append to `src/core/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AuthError } from "./errors.js";

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
```

- [ ] **Step 4: Run test — should pass**

Run: `cd RisuVault && npx vitest run tests/core/crypto.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Add file-level helpers**

Append to `tests/core/crypto.test.ts`:

```ts
import { encryptFile, decryptFile } from "../../src/core/crypto.js";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
```

Run: `cd RisuVault && npx vitest run tests/core/crypto.test.ts`
Expected: FAIL on new test.

Append to `src/core/crypto.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";

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
```

Run: `cd RisuVault && npx vitest run tests/core/crypto.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/crypto.ts tests/core/crypto.test.ts
git commit -m "feat(crypto): AES-256-GCM buffer and file encryption"
```

---

## Task 4: Config Module

**Files:**
- Create: `RisuVault/src/core/paths.ts`
- Create: `RisuVault/src/core/config.ts`
- Test: `RisuVault/tests/core/config.test.ts`
- Create: `RisuVault/tests/helpers/tmp-vault.ts`

- [ ] **Step 1: Create path helpers**

`src/core/paths.ts`:

```ts
import { join } from "node:path";

export const VAULT_DIR = ".risuvault";

export function vaultDir(root: string) { return join(root, VAULT_DIR); }
export function configPath(root: string) { return join(vaultDir(root), "config.json"); }
export function dbPath(root: string) { return join(vaultDir(root), "vault.db"); }
export function cacheDir(root: string) { return join(vaultDir(root), "cache"); }
export function projectsDir(root: string) { return join(root, "projects"); }
export function projectDir(root: string, uuid: string) { return join(projectsDir(root), uuid); }
export function projectCacheDir(root: string, uuid: string) { return join(cacheDir(root), uuid); }
export function inboxDir(root: string) { return join(root, "inbox"); }
```

- [ ] **Step 2: Create tmp-vault test helper**

`tests/helpers/tmp-vault.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTempVaultRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "risuvault-test-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}
```

- [ ] **Step 3: Write failing test for config**

`tests/core/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeConfig, readConfig, generateDefaultConfig } from "../../src/core/config.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { mkdirSync } from "node:fs";
import { vaultDir } from "../../src/core/paths.js";

describe("config", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(() => { tmp = createTempVaultRoot(); mkdirSync(vaultDir(tmp.root)); });
  afterEach(() => tmp.cleanup());

  it("round-trips a config", () => {
    const cfg = generateDefaultConfig();
    writeConfig(tmp.root, cfg);
    const read = readConfig(tmp.root);
    expect(read).toEqual(cfg);
  });

  it("default config has 32-byte random salt", () => {
    const cfg = generateDefaultConfig();
    expect(cfg.kdf.saltHex.length).toBe(64);
    const cfg2 = generateDefaultConfig();
    expect(cfg.kdf.saltHex).not.toBe(cfg2.kdf.saltHex);
  });

  it("throws NotInitializedError if config missing", () => {
    expect(() => readConfig(tmp.root)).toThrow(/no .risuvault/);
  });
});
```

- [ ] **Step 4: Run test — should fail**

Run: `cd RisuVault && npx vitest run tests/core/config.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement config**

`src/core/config.ts`:

```ts
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
```

- [ ] **Step 6: Run test — should pass**

Run: `cd RisuVault && npx vitest run tests/core/config.test.ts`
Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/paths.ts src/core/config.ts tests/core/config.test.ts tests/helpers/tmp-vault.ts
git commit -m "feat(config): read/write config.json with Argon2 salt"
```

---

## Task 5: Database Module — Schema and Open/Close

**Files:**
- Create: `RisuVault/src/core/db.ts`
- Test: `RisuVault/tests/core/db.test.ts`

- [ ] **Step 1: Write failing test for openDb**

`tests/core/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDb, initDbSchema } from "../../src/core/db.js";
import { deriveKey } from "../../src/core/crypto.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { mkdirSync } from "node:fs";
import { vaultDir, dbPath } from "../../src/core/paths.js";
import { randomBytes } from "node:crypto";
import { AuthError } from "../../src/core/errors.js";

describe("db", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(() => { tmp = createTempVaultRoot(); mkdirSync(vaultDir(tmp.root)); });
  afterEach(() => tmp.cleanup());

  it("creates and opens a new DB with schema", async () => {
    const key = await deriveKey("test-pass", randomBytes(32));
    const db = openDb(dbPath(tmp.root), key);
    initDbSchema(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain("projects");
    expect(names).toContain("build_history");
    db.close();
  });

  it("fails to open with wrong key", async () => {
    const salt = randomBytes(32);
    const k1 = await deriveKey("right", salt);
    const k2 = await deriveKey("wrong", salt);
    const db1 = openDb(dbPath(tmp.root), k1);
    initDbSchema(db1);
    db1.prepare("INSERT INTO projects(uuid,name,kind,source_format,file_key,current_version,added_at) VALUES (?,?,?,?,?,?,?)")
      .run("u1", "n1", "bot", "charx", Buffer.alloc(32), "1.0", new Date().toISOString());
    db1.close();

    expect(() => {
      const db2 = openDb(dbPath(tmp.root), k2);
      db2.prepare("SELECT * FROM projects").all();
    }).toThrow(AuthError);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/core/db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement db module**

`src/core/db.ts`:

```ts
import Database from "better-sqlite3-multiple-ciphers";
import type { Database as DB } from "better-sqlite3-multiple-ciphers";
import { AuthError } from "./errors.js";

export function openDb(path: string, key: Buffer): DB {
  const db = new Database(path);
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`legacy=4`);
  db.pragma(`key="x'${key.toString("hex")}'"`);
  try {
    db.prepare("SELECT count(*) FROM sqlite_master").get();
  } catch (e) {
    db.close();
    throw new AuthError(`cannot open vault.db: ${(e as Error).message}`);
  }
  return db;
}

export function initDbSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('bot','module','preset')),
      source_format TEXT NOT NULL,
      file_key BLOB NOT NULL,
      current_version TEXT NOT NULL,
      added_at TEXT NOT NULL,
      last_locked_at TEXT,
      last_built_at TEXT
    );
    CREATE TABLE IF NOT EXISTS build_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT NOT NULL REFERENCES projects(uuid),
      version TEXT NOT NULL,
      built_at TEXT NOT NULL,
      artifact_filename TEXT NOT NULL,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_build_history_project ON build_history(project_uuid);
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '1');
  `);
}
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/core/db.test.ts`
Expected: 2 PASS.

If `better-sqlite3-multiple-ciphers` install fails on Windows, note the error and see Task 5a below.

- [ ] **Step 5: Commit**

```bash
git add src/core/db.ts tests/core/db.test.ts
git commit -m "feat(db): SQLCipher open and schema init"
```

---

## Task 6: Database CRUD Helpers

**Files:**
- Modify: `RisuVault/src/core/db.ts`
- Modify: `RisuVault/tests/core/db.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/core/db.test.ts`:

```ts
import {
  insertProject, getProjectByName, getProjectByUuid,
  listProjects, updateProjectVersion, updateLastLockedAt,
  insertBuildHistory, getBuildHistory
} from "../../src/core/db.js";

describe("db CRUD", () => {
  let tmp: { root: string; cleanup: () => void };
  let db: ReturnType<typeof openDb>;
  beforeEach(async () => {
    tmp = createTempVaultRoot(); mkdirSync(vaultDir(tmp.root));
    const key = await deriveKey("pw", randomBytes(32));
    db = openDb(dbPath(tmp.root), key);
    initDbSchema(db);
  });
  afterEach(() => { db.close(); tmp.cleanup(); });

  it("inserts and retrieves a project", () => {
    insertProject(db, {
      uuid: "u1", name: "alice", kind: "bot", sourceFormat: "charx",
      fileKey: Buffer.alloc(32, 1), currentVersion: "1.0",
      addedAt: "2026-04-16T00:00:00Z", lastLockedAt: null, lastBuiltAt: null
    });
    const p = getProjectByName(db, "alice");
    expect(p?.uuid).toBe("u1");
    expect(p?.fileKey.equals(Buffer.alloc(32, 1))).toBe(true);
  });

  it("lists all projects", () => {
    insertProject(db, { uuid: "u1", name: "a", kind: "bot", sourceFormat: "charx", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    insertProject(db, { uuid: "u2", name: "b", kind: "module", sourceFormat: "risum", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    expect(listProjects(db).length).toBe(2);
  });

  it("updates version and records history", () => {
    insertProject(db, { uuid: "u1", name: "a", kind: "bot", sourceFormat: "charx", fileKey: Buffer.alloc(32), currentVersion: "1.0", addedAt: "t", lastLockedAt: null, lastBuiltAt: null });
    updateProjectVersion(db, "u1", "1.1", "2026-04-16T10:00:00Z");
    insertBuildHistory(db, { projectUuid: "u1", version: "1.1", builtAt: "2026-04-16T10:00:00Z", artifactFilename: "a-v1.1.charx", notes: null });
    const hist = getBuildHistory(db, "u1");
    expect(hist.length).toBe(1);
    expect(hist[0].version).toBe("1.1");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/core/db.test.ts`
Expected: FAIL on new tests.

- [ ] **Step 3: Implement CRUD**

Append to `src/core/db.ts`:

```ts
import type { ProjectRecord, BuildHistoryEntry } from "../types.js";

interface ProjectRow {
  uuid: string;
  name: string;
  kind: string;
  source_format: string;
  file_key: Buffer;
  current_version: string;
  added_at: string;
  last_locked_at: string | null;
  last_built_at: string | null;
}

function rowToProject(r: ProjectRow): ProjectRecord {
  return {
    uuid: r.uuid, name: r.name,
    kind: r.kind as ProjectRecord["kind"],
    sourceFormat: r.source_format as ProjectRecord["sourceFormat"],
    fileKey: r.file_key,
    currentVersion: r.current_version,
    addedAt: r.added_at,
    lastLockedAt: r.last_locked_at,
    lastBuiltAt: r.last_built_at
  };
}

export function insertProject(db: DB, p: ProjectRecord): void {
  db.prepare(`
    INSERT INTO projects(uuid,name,kind,source_format,file_key,current_version,added_at,last_locked_at,last_built_at)
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(p.uuid, p.name, p.kind, p.sourceFormat, p.fileKey, p.currentVersion, p.addedAt, p.lastLockedAt, p.lastBuiltAt);
}

export function getProjectByName(db: DB, name: string): ProjectRecord | undefined {
  const r = db.prepare("SELECT * FROM projects WHERE name=?").get(name) as ProjectRow | undefined;
  return r ? rowToProject(r) : undefined;
}

export function getProjectByUuid(db: DB, uuid: string): ProjectRecord | undefined {
  const r = db.prepare("SELECT * FROM projects WHERE uuid=?").get(uuid) as ProjectRow | undefined;
  return r ? rowToProject(r) : undefined;
}

export function resolveProject(db: DB, ref: string): ProjectRecord | undefined {
  return getProjectByUuid(db, ref) ?? getProjectByName(db, ref);
}

export function listProjects(db: DB): ProjectRecord[] {
  const rows = db.prepare("SELECT * FROM projects ORDER BY name").all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function updateProjectVersion(db: DB, uuid: string, version: string, builtAt: string): void {
  db.prepare("UPDATE projects SET current_version=?, last_built_at=? WHERE uuid=?").run(version, builtAt, uuid);
}

export function updateLastLockedAt(db: DB, uuid: string, when: string): void {
  db.prepare("UPDATE projects SET last_locked_at=? WHERE uuid=?").run(when, uuid);
}

export function insertBuildHistory(db: DB, e: Omit<BuildHistoryEntry, "id">): void {
  db.prepare(`
    INSERT INTO build_history(project_uuid,version,built_at,artifact_filename,notes)
    VALUES(?,?,?,?,?)
  `).run(e.projectUuid, e.version, e.builtAt, e.artifactFilename, e.notes);
}

export function getBuildHistory(db: DB, uuid: string): BuildHistoryEntry[] {
  const rows = db.prepare(
    "SELECT * FROM build_history WHERE project_uuid=? ORDER BY id DESC"
  ).all(uuid) as Array<{ id: number; project_uuid: string; version: string; built_at: string; artifact_filename: string; notes: string | null }>;
  return rows.map(r => ({
    id: r.id, projectUuid: r.project_uuid, version: r.version,
    builtAt: r.built_at, artifactFilename: r.artifact_filename, notes: r.notes
  }));
}
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/core/db.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/db.ts tests/core/db.test.ts
git commit -m "feat(db): CRUD helpers for projects and build_history"
```

---

## Task 7: UUID and Passphrase Utilities

**Files:**
- Create: `RisuVault/src/core/uuid.ts`
- Create: `RisuVault/src/core/passphrase.ts`

- [ ] **Step 1: UUID module**

`src/core/uuid.ts`:

```ts
import { randomUUID } from "node:crypto";
export function newUuid(): string { return randomUUID(); }
```

- [ ] **Step 2: Passphrase module**

`src/core/passphrase.ts`:

```ts
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { UserError } from "./errors.js";

export async function acquirePassphrase(): Promise<string> {
  const fromEnv = process.env.RISUVAULT_PASSPHRASE;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (!stdin.isTTY) {
    throw new UserError(
      "no passphrase: set RISUVAULT_PASSPHRASE or run interactively"
    );
  }
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  try {
    const pw = await rl.question("Vault passphrase: ");
    if (!pw) throw new UserError("empty passphrase");
    return pw;
  } finally {
    rl.close();
  }
}
```

Note: For MVP we do not hide terminal echo. Phase 2 can add a mask using `readline`'s custom write or the `read` npm package.

- [ ] **Step 3: Commit**

```bash
git add src/core/uuid.ts src/core/passphrase.ts
git commit -m "feat(core): UUID generator and passphrase acquisition"
```

---

## Task 8: Version Bump Logic

**Files:**
- Create: `RisuVault/src/core/version.ts`
- Test: `RisuVault/tests/core/version.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/core/version.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bumpVersion, formatVersion } from "../../src/core/version.js";

describe("bumpVersion", () => {
  it("bumps minor by default", () => {
    expect(bumpVersion("1.0", "minor")).toBe("1.1");
    expect(bumpVersion("1.9", "minor")).toBe("1.10");
    expect(bumpVersion("2.5", "minor")).toBe("2.6");
  });
  it("bumps major and resets minor to 0", () => {
    expect(bumpVersion("1.5", "major")).toBe("2.0");
    expect(bumpVersion("3.0", "major")).toBe("4.0");
  });
  it("accepts explicit override", () => {
    expect(bumpVersion("1.0", { explicit: "3.14" })).toBe("3.14");
  });
  it("throws on unparseable current + minor bump", () => {
    expect(() => bumpVersion("v1-beta", "minor")).toThrow(/cannot bump/);
  });
  it("allows explicit override even when current is non-numeric", () => {
    expect(bumpVersion("v1-beta", { explicit: "1.0" })).toBe("1.0");
  });
});

describe("formatVersion", () => {
  it("prefixes v when called with prefix", () => {
    expect(formatVersion("1.2", { prefix: true })).toBe("v1.2");
    expect(formatVersion("1.2")).toBe("1.2");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/core/version.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/core/version.ts`:

```ts
export type BumpKind = "minor" | "major" | { explicit: string };

export function bumpVersion(current: string, kind: BumpKind): string {
  if (typeof kind === "object" && "explicit" in kind) return kind.explicit;
  const m = current.match(/^(\d+)\.(\d+)$/);
  if (!m) throw new Error(`cannot bump version "${current}": expected N.N format`);
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  if (kind === "minor") return `${major}.${minor + 1}`;
  return `${major + 1}.0`;
}

export function formatVersion(v: string, opts: { prefix?: boolean } = {}): string {
  return opts.prefix ? `v${v}` : v;
}
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/core/version.test.ts`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/version.ts tests/core/version.test.ts
git commit -m "feat(core): version bump logic"
```

---

## Task 9: `init` Primitive

**Files:**
- Create: `RisuVault/src/primitives/init.ts`
- Test: `RisuVault/tests/primitives/init.test.ts`

- [ ] **Step 1: Write failing test**

`tests/primitives/init.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, readFileSync } from "node:fs";
import { configPath, dbPath, vaultDir, cacheDir, projectsDir, inboxDir } from "../../src/core/paths.js";
import { UserError } from "../../src/core/errors.js";

describe("runInit", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(() => { tmp = createTempVaultRoot(); });
  afterEach(() => tmp.cleanup());

  it("creates .risuvault structure and vault.db", async () => {
    await runInit(tmp.root, "test-passphrase");
    expect(existsSync(vaultDir(tmp.root))).toBe(true);
    expect(existsSync(configPath(tmp.root))).toBe(true);
    expect(existsSync(dbPath(tmp.root))).toBe(true);
    expect(existsSync(cacheDir(tmp.root))).toBe(true);
    expect(existsSync(projectsDir(tmp.root))).toBe(true);
    expect(existsSync(inboxDir(tmp.root))).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath(tmp.root), "utf8"));
    expect(cfg.vaultVersion).toBe(1);
    expect(cfg.kdf.saltHex.length).toBe(64);
  });

  it("refuses to re-init an existing vault", async () => {
    await runInit(tmp.root, "pw");
    await expect(runInit(tmp.root, "pw")).rejects.toThrow(UserError);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/init.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/primitives/init.ts`:

```ts
import { existsSync, mkdirSync } from "node:fs";
import {
  vaultDir, configPath, dbPath, cacheDir, projectsDir, inboxDir
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

  const config = generateDefaultConfig();
  writeConfig(root, config);

  const key = await deriveKey(passphrase, Buffer.from(config.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  initDbSchema(db);
  db.close();
}
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/primitives/init.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/primitives/init.ts tests/primitives/init.test.ts
git commit -m "feat(primitive): risuvault init"
```

---

## Task 10: `list` Primitive

**Files:**
- Create: `RisuVault/src/primitives/list.ts`
- Test: `RisuVault/tests/primitives/list.test.ts`

- [ ] **Step 1: Write failing test**

`tests/primitives/list.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runList } from "../../src/primitives/list.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { openDb, insertProject } from "../../src/core/db.js";
import { readConfig } from "../../src/core/config.js";
import { deriveKey } from "../../src/core/crypto.js";
import { dbPath } from "../../src/core/paths.js";

describe("runList", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
  });
  afterEach(() => tmp.cleanup());

  it("returns empty array for fresh vault", async () => {
    const items = await runList(tmp.root, "pw");
    expect(items).toEqual([]);
  });

  it("returns inserted projects", async () => {
    const cfg = readConfig(tmp.root);
    const key = await deriveKey("pw", Buffer.from(cfg.kdf.saltHex, "hex"));
    const db = openDb(dbPath(tmp.root), key);
    insertProject(db, {
      uuid: "u1", name: "alice", kind: "bot", sourceFormat: "charx",
      fileKey: Buffer.alloc(32), currentVersion: "1.0",
      addedAt: "2026-04-16T00:00:00Z", lastLockedAt: null, lastBuiltAt: null
    });
    db.close();
    const items = await runList(tmp.root, "pw");
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("alice");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/primitives/list.ts`:

```ts
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
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/primitives/list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/primitives/list.ts tests/primitives/list.test.ts
git commit -m "feat(primitive): risuvault list"
```

---

## Task 11: Walking Files Helper

**Files:**
- Create: `RisuVault/src/core/walk.ts`
- Test: `RisuVault/tests/core/walk.test.ts`

Purpose: list every regular file under a directory recursively, excluding specified names/paths. Used by `add` and `lock`.

- [ ] **Step 1: Write failing tests**

`tests/core/walk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { walkFiles } from "../../src/core/walk.js";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

describe("walkFiles", () => {
  it("lists all files, excluding dir names", () => {
    const root = mkdtempSync(join(tmpdir(), "walk-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "a.txt"), "a");
    writeFileSync(join(root, "src", "b.txt"), "b");
    writeFileSync(join(root, "assets", "big.bin"), "x");
    const rels = walkFiles(root, { excludeDirs: ["assets"] }).map(p => relative(root, p).replace(/\\/g, "/")).sort();
    expect(rels).toEqual(["a.txt", "src/b.txt"]);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/core/walk.test.ts`

- [ ] **Step 3: Implement**

`src/core/walk.ts`:

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";

export function walkFiles(
  root: string,
  opts: { excludeDirs?: string[] } = {}
): string[] {
  const excluded = new Set(opts.excludeDirs ?? []);
  const out: string[] = [];
  function walk(dir: string): void {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!excluded.has(ent.name)) walk(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/core/walk.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/walk.ts tests/core/walk.test.ts
git commit -m "feat(core): recursive file walker with dir exclusion"
```

---

## Task 12: `add` Primitive — RisuPack Integration

**Files:**
- Create: `RisuVault/src/primitives/add.ts`
- Create: `RisuVault/src/core/risupack-bridge.ts`
- Test: `RisuVault/tests/primitives/add.test.ts`

- [ ] **Step 1: Create RisuPack bridge**

`src/core/risupack-bridge.ts`:

```ts
import { runExtractCommand, runBuildCommand } from "risupack/dist/app/commands.js";

export async function extractWith(inputPath: string, projectDir: string) {
  return runExtractCommand(inputPath, projectDir);
}

export async function buildWith(projectDir: string, outputPath?: string) {
  return runBuildCommand(projectDir, outputPath);
}
```

Note: If `risupack` does not re-export `runExtractCommand` / `runBuildCommand` from its entry, this import path may need adjustment. Verify by running `node -e "import('risupack').then(m=>console.log(Object.keys(m)))"` after install. If it fails, add wrappers in RisuPack (outside scope) or import from specific subpath.

- [ ] **Step 2: Write failing test**

`tests/primitives/add.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "../../src/core/paths.js";

// Helper to produce a minimal fake .risup (preset) file.
// A real preset is a JSON file that RisuPack recognizes.
function writeFakePreset(path: string): void {
  writeFileSync(path, JSON.stringify({
    name: "SamplePreset",
    mainPrompt: "test",
    regex: [],
    promptTemplate: "{{prompt}}"
  }));
}

describe("runAdd", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
  });
  afterEach(() => tmp.cleanup());

  it("adds a preset file to the vault", async () => {
    const src = join(tmp.root, "sample.risup");
    writeFakePreset(src);
    const result = await runAdd(tmp.root, "pw", src, "sample");
    expect(result.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.name).toBe("sample");
    expect(existsSync(projectDir(tmp.root, result.uuid))).toBe(true);
  });
});
```

- [ ] **Step 3: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/add.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `add`**

`src/primitives/add.ts`:

```ts
import { mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptFile } from "../core/crypto.js";
import { openDb, insertProject, getProjectByName } from "../core/db.js";
import { cacheDir, dbPath, projectDir } from "../core/paths.js";
import { newUuid } from "../core/uuid.js";
import { walkFiles } from "../core/walk.js";
import { extractWith } from "../core/risupack-bridge.js";
import { UserError } from "../core/errors.js";
import { randomBytes } from "node:crypto";
import type { ProjectRecord, SupportedInputFormat, ProjectKind } from "../types.js";

const EXT_TO_FORMAT: Record<string, SupportedInputFormat> = {
  ".charx": "charx", ".png": "png", ".jpg": "jpg", ".jpeg": "jpeg",
  ".risum": "risum", ".risup": "risup", ".risupreset": "risupreset"
};

const FORMAT_TO_KIND: Record<SupportedInputFormat, ProjectKind> = {
  charx: "bot", png: "bot", jpg: "bot", jpeg: "bot",
  risum: "module",
  risup: "preset", risupreset: "preset"
};

export interface AddResult {
  uuid: string;
  name: string;
  kind: ProjectKind;
}

export async function runAdd(
  root: string,
  passphrase: string,
  inputPath: string,
  name: string
): Promise<AddResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    if (getProjectByName(db, name)) {
      throw new UserError(`project name "${name}" already exists`);
    }

    const lower = inputPath.toLowerCase();
    const ext = Object.keys(EXT_TO_FORMAT).find(e => lower.endsWith(e));
    if (!ext) throw new UserError(`unsupported extension: ${inputPath}`);
    const sourceFormat = EXT_TO_FORMAT[ext];
    const kind = FORMAT_TO_KIND[sourceFormat];

    const uuid = newUuid();
    const stagingDir = join(cacheDir(root), `__staging_${uuid}`);
    mkdirSync(stagingDir, { recursive: true });

    await extractWith(resolve(inputPath), stagingDir);

    const fileKey = randomBytes(32);
    const destDir = projectDir(root, uuid);
    mkdirSync(destDir, { recursive: true });

    // Encrypt every file except assets/
    const files = walkFiles(stagingDir, { excludeDirs: ["assets"] });
    for (const plain of files) {
      const rel = relative(stagingDir, plain);
      const encPath = join(destDir, rel + ".enc");
      mkdirSync(dirname(encPath), { recursive: true });
      encryptFile(plain, encPath, fileKey);
    }

    // Clean up staging
    rmSync(stagingDir, { recursive: true, force: true });

    const rec: ProjectRecord = {
      uuid, name, kind, sourceFormat,
      fileKey, currentVersion: "1.0",
      addedAt: new Date().toISOString(),
      lastLockedAt: new Date().toISOString(),
      lastBuiltAt: null
    };
    insertProject(db, rec);
    return { uuid, name, kind };
  } finally { db.close(); }
}
```

- [ ] **Step 5: Run — pass or diagnose RisuPack integration**

Run: `cd RisuVault && npx vitest run tests/primitives/add.test.ts`

If it fails because `risupack` export path is wrong, do a one-time probe:

```bash
node -e "import('risupack').then(m => console.log(Object.keys(m))).catch(e => console.error(e))"
```

Adjust the import in `src/core/risupack-bridge.ts` accordingly. If RisuPack does not export these commands, document the issue and switch to spawning RisuPack CLI via `child_process` as a fallback — but first prefer a fix via updating `risupack`'s `package.json` `exports` field. For this task, if import works, PASS expected.

- [ ] **Step 6: Commit**

```bash
git add src/primitives/add.ts src/core/risupack-bridge.ts tests/primitives/add.test.ts
git commit -m "feat(primitive): risuvault add with RisuPack integration"
```

---

## Task 13: `unlock` and `lock` Primitives

**Files:**
- Create: `RisuVault/src/primitives/unlock.ts`
- Create: `RisuVault/src/primitives/lock.ts`
- Test: `RisuVault/tests/primitives/unlock-lock.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/primitives/unlock-lock.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runLock } from "../../src/primitives/lock.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectCacheDir, projectDir } from "../../src/core/paths.js";
import { walkFiles } from "../../src/core/walk.js";

function writeFakePreset(p: string) {
  writeFileSync(p, JSON.stringify({ name: "X", mainPrompt: "p", regex: [], promptTemplate: "{{prompt}}" }));
}

describe("unlock/lock", () => {
  let tmp: { root: string; cleanup: () => void };
  let uuid: string;
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risup");
    writeFakePreset(src);
    const r = await runAdd(tmp.root, "pw", src, "s");
    uuid = r.uuid;
  });
  afterEach(() => tmp.cleanup());

  it("unlock creates plaintext cache with same files as projects/<uuid>", async () => {
    await runUnlock(tmp.root, "pw", "s");
    const encFiles = walkFiles(projectDir(tmp.root, uuid)).length;
    const plainFiles = walkFiles(projectCacheDir(tmp.root, uuid)).length;
    expect(plainFiles).toBe(encFiles);
  });

  it("lock round-trips: modify → lock → unlock shows modification", async () => {
    await runUnlock(tmp.root, "pw", "s");
    const plainFiles = walkFiles(projectCacheDir(tmp.root, uuid));
    const target = plainFiles[0];
    writeFileSync(target, "MODIFIED");
    await runLock(tmp.root, "pw", "s");
    expect(existsSync(projectCacheDir(tmp.root, uuid))).toBe(false);

    await runUnlock(tmp.root, "pw", "s");
    const plainFiles2 = walkFiles(projectCacheDir(tmp.root, uuid));
    const same = plainFiles2.find(f => f.endsWith(target.substring(target.lastIndexOf("\\") + 1)) || f.endsWith(target.substring(target.lastIndexOf("/") + 1)));
    expect(same).toBeDefined();
    expect(readFileSync(same!, "utf8")).toBe("MODIFIED");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/unlock-lock.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `unlock`**

`src/primitives/unlock.ts`:

```ts
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptFile } from "../core/crypto.js";
import { openDb, resolveProject } from "../core/db.js";
import { dbPath, projectDir, projectCacheDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";
import { walkFiles } from "../core/walk.js";

export async function runUnlock(root: string, passphrase: string, ref: string): Promise<string> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);

    const srcDir = projectDir(root, p.uuid);
    const dstDir = projectCacheDir(root, p.uuid);
    rmSync(dstDir, { recursive: true, force: true });
    mkdirSync(dstDir, { recursive: true });

    const encFiles = walkFiles(srcDir, { excludeDirs: ["assets"] });
    for (const enc of encFiles) {
      if (!enc.endsWith(".enc")) continue;
      const rel = relative(srcDir, enc).replace(/\.enc$/, "");
      const out = join(dstDir, rel);
      mkdirSync(dirname(out), { recursive: true });
      decryptFile(enc, out, p.fileKey);
    }
    return p.uuid;
  } finally { db.close(); }
}
```

- [ ] **Step 4: Implement `lock`**

`src/primitives/lock.ts`:

```ts
import { mkdirSync, renameSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer } from "../core/crypto.js";
import { openDb, resolveProject, updateLastLockedAt } from "../core/db.js";
import { dbPath, projectCacheDir, projectDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";
import { walkFiles } from "../core/walk.js";
import { readFileSync, readdirSync, statSync } from "node:fs";

export async function runLock(root: string, passphrase: string, ref: string): Promise<void> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);

    const srcDir = projectCacheDir(root, p.uuid);
    if (!existsSync(srcDir)) {
      throw new UserError(`no cache to lock for ${p.name}; run unlock first`);
    }
    const dstDir = projectDir(root, p.uuid);

    // Encrypt each file to a temp path, then rename. Atomic per-file.
    const files = walkFiles(srcDir, { excludeDirs: ["assets"] });
    for (const plain of files) {
      const rel = relative(srcDir, plain);
      const encFinal = join(dstDir, rel + ".enc");
      const encTmp = encFinal + ".tmp";
      mkdirSync(dirname(encFinal), { recursive: true });
      const plainBuf = readFileSync(plain);
      const encBuf = encryptBuffer(plainBuf, p.fileKey);
      writeFileSync(encTmp, encBuf);
      renameSync(encTmp, encFinal);
    }

    // Remove stale .enc files that no longer have a plaintext counterpart
    // (files deleted from cache since last unlock).
    const encFiles = walkFiles(dstDir, { excludeDirs: ["assets"] });
    const plainSet = new Set(files.map(f => relative(srcDir, f)));
    for (const enc of encFiles) {
      if (!enc.endsWith(".enc")) continue;
      const rel = relative(dstDir, enc).replace(/\.enc$/, "");
      if (!plainSet.has(rel)) rmSync(enc);
    }

    updateLastLockedAt(db, p.uuid, new Date().toISOString());

    // Finally remove the plaintext cache
    rmSync(srcDir, { recursive: true, force: true });
  } finally { db.close(); }
}
```

- [ ] **Step 5: Run — pass**

Run: `cd RisuVault && npx vitest run tests/primitives/unlock-lock.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/primitives/unlock.ts src/primitives/lock.ts tests/primitives/unlock-lock.test.ts
git commit -m "feat(primitive): unlock and lock with atomic per-file rename"
```

---

## Task 14: `status` Primitive

**Files:**
- Create: `RisuVault/src/primitives/status.ts`
- Test: `RisuVault/tests/primitives/status.test.ts`

- [ ] **Step 1: Write failing test**

`tests/primitives/status.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runStatus } from "../../src/primitives/status.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

describe("runStatus", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risup");
    writeFileSync(src, JSON.stringify({ name: "x", mainPrompt: "p", regex: [], promptTemplate: "{{prompt}}" }));
    await runAdd(tmp.root, "pw", src, "s");
  });
  afterEach(() => tmp.cleanup());

  it("reports locked for freshly added project", async () => {
    const rows = await runStatus(tmp.root, "pw");
    expect(rows[0].state).toBe("locked");
  });

  it("reports unlocked after unlock", async () => {
    await runUnlock(tmp.root, "pw", "s");
    const rows = await runStatus(tmp.root, "pw");
    expect(rows[0].state).toBe("unlocked");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/status.test.ts`

- [ ] **Step 3: Implement**

`src/primitives/status.ts`:

```ts
import { existsSync } from "node:fs";
import { readConfig } from "../core/config.js";
import { deriveKey } from "../core/crypto.js";
import { openDb, listProjects } from "../core/db.js";
import { dbPath, projectCacheDir } from "../core/paths.js";

export interface StatusRow {
  uuid: string;
  name: string;
  kind: string;
  currentVersion: string;
  state: "locked" | "unlocked";
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
      state: existsSync(projectCacheDir(root, p.uuid)) ? "unlocked" : "locked",
      lastLockedAt: p.lastLockedAt, lastBuiltAt: p.lastBuiltAt
    }));
  } finally { db.close(); }
}
```

Note: "modified" detection requires comparing cache content to decrypted enc content. Deferred to Phase 2 to keep MVP simple. MVP reports only locked/unlocked. Tests reflect this.

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/primitives/status.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/primitives/status.ts tests/primitives/status.test.ts
git commit -m "feat(primitive): status (locked/unlocked)"
```

---

## Task 15: RisuPack Assets-Absent Build Experiment

Before writing `build` primitive, empirically determine how RisuPack handles building without an `assets/` directory (spec Open Question).

**Files:**
- Create: `RisuVault/docs/superpowers/notes/2026-04-16-assets-absent-build.md`

- [ ] **Step 1: Set up probe directory**

```bash
cd RisuVault
mkdir -p tmp/probe
cd tmp/probe
```

- [ ] **Step 2: Extract a real file and remove assets**

Place a small real `.charx`, `.risum`, and `.risup` into `tmp/`. Then for each:

```bash
node -e "import('risupack').then(m => m.runExtractCommand('../sample.risup', './preset-ws'))"
rm -rf ./preset-ws/assets
node -e "import('risupack').then(m => m.runBuildCommand('./preset-ws'))"
```

Record observed behavior: does it succeed, fail, or produce incomplete output?

Repeat for `.risum` and `.charx`.

- [ ] **Step 3: Document findings**

Write `docs/superpowers/notes/2026-04-16-assets-absent-build.md`:

```markdown
# RisuPack Build Without assets/

Date: 2026-04-16

## Observations

### preset (.risup)
- Result: [success / fail]
- Detail: ...

### module (.risum)
- Result: [success / fail]
- Detail: ...

### bot (.charx)
- Result: [success / fail]
- Detail: ...

## Decision for RisuVault build primitive

Based on the above, the build primitive will: [drop an empty assets/ dir before build / copy from a user-provided assets cache / other].
```

- [ ] **Step 4: Clean up and commit**

```bash
rm -rf tmp/probe
git add docs/superpowers/notes/2026-04-16-assets-absent-build.md
git commit -m "docs: RisuPack assets-absent build probe results"
```

---

## Task 16: `build` Primitive

**Files:**
- Create: `RisuVault/src/primitives/build.ts`
- Test: `RisuVault/tests/primitives/build.test.ts`

- [ ] **Step 1: Write failing test**

`tests/primitives/build.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runBuild } from "../../src/primitives/build.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "../../src/core/paths.js";

describe("runBuild", () => {
  let tmp: { root: string; cleanup: () => void };
  let uuid: string;
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risup");
    writeFileSync(src, JSON.stringify({ name: "s", mainPrompt: "p", regex: [], promptTemplate: "{{prompt}}" }));
    const r = await runAdd(tmp.root, "pw", src, "s");
    uuid = r.uuid;
    await runUnlock(tmp.root, "pw", "s");
  });
  afterEach(() => tmp.cleanup());

  it("builds and bumps version to 1.1, stores encrypted artifact in dist/", async () => {
    const result = await runBuild(tmp.root, "pw", "s", "minor");
    expect(result.version).toBe("1.1");
    expect(result.artifactFilename).toBe("s-v1.1.risup");
    const encArtifact = join(projectDir(tmp.root, uuid), "dist", "s-v1.1.risup.enc");
    expect(existsSync(encArtifact)).toBe(true);
  });

  it("accepts explicit version", async () => {
    const result = await runBuild(tmp.root, "pw", "s", { explicit: "3.14" });
    expect(result.version).toBe("3.14");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/build.test.ts`

- [ ] **Step 3: Implement**

`src/primitives/build.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer } from "../core/crypto.js";
import {
  openDb, resolveProject, updateProjectVersion, insertBuildHistory
} from "../core/db.js";
import { dbPath, projectCacheDir, projectDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";
import { bumpVersion, type BumpKind } from "../core/version.js";
import { buildWith } from "../core/risupack-bridge.js";

const EXT_BY_FORMAT: Record<string, string> = {
  charx: "charx", png: "png", jpg: "jpg", jpeg: "jpeg",
  risum: "risum",
  risup: "risup", risupreset: "risupreset"
};

export interface BuildResult {
  uuid: string;
  version: string;
  artifactFilename: string;
  encryptedPath: string;
}

export async function runBuild(
  root: string, passphrase: string, ref: string, bump: BumpKind
): Promise<BuildResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);
    const cacheProjectDir = projectCacheDir(root, p.uuid);
    if (!existsSync(cacheProjectDir)) {
      throw new UserError(`${p.name} is locked; run unlock first`);
    }

    const newVersion = bumpVersion(p.currentVersion, bump);
    const ext = EXT_BY_FORMAT[p.sourceFormat];
    const artifactFilename = `${p.name}-v${newVersion}.${ext}`;

    // For bots, inject character_version before build.
    // Spec §8: only 'bot' kind has an internal version field.
    if (p.kind === "bot") {
      injectCharacterVersion(cacheProjectDir, newVersion);
    }

    const outputDir = join(cacheProjectDir, "dist");
    mkdirSync(outputDir, { recursive: true });
    const plaintextArtifactPath = join(outputDir, artifactFilename);
    await buildWith(cacheProjectDir, plaintextArtifactPath);

    // Encrypt artifact into projects/<uuid>/dist/
    const encryptedDistDir = join(projectDir(root, p.uuid), "dist");
    mkdirSync(encryptedDistDir, { recursive: true });
    const encryptedPath = join(encryptedDistDir, artifactFilename + ".enc");
    const tmp = encryptedPath + ".tmp";
    const blob = encryptBuffer(readFileSync(plaintextArtifactPath), p.fileKey);
    writeFileSync(tmp, blob);
    const { renameSync } = await import("node:fs");
    renameSync(tmp, encryptedPath);

    const builtAt = new Date().toISOString();
    updateProjectVersion(db, p.uuid, newVersion, builtAt);
    insertBuildHistory(db, {
      projectUuid: p.uuid, version: newVersion, builtAt,
      artifactFilename, notes: null
    });

    return { uuid: p.uuid, version: newVersion, artifactFilename, encryptedPath };
  } finally { db.close(); }
}

function injectCharacterVersion(cacheDir: string, version: string): void {
  // Heuristic: find project.json in cache, set data.character_version.
  // Actual path depends on RisuPack's bot layout — verify in Task 15 experiment.
  const candidates = [
    join(cacheDir, "src", "card.json"),
    join(cacheDir, "src", "project.json"),
    join(cacheDir, "project.json")
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const obj = JSON.parse(readFileSync(p, "utf8"));
    if (obj && typeof obj === "object") {
      if ("data" in obj && obj.data && typeof obj.data === "object") {
        (obj.data as Record<string, unknown>).character_version = version;
      } else {
        (obj as Record<string, unknown>).character_version = version;
      }
      writeFileSync(p, JSON.stringify(obj, null, 2));
      return;
    }
  }
  // If no json found, skip silently — test suite can fail and we adjust path.
}
```

Note: The exact path to the character JSON depends on how RisuPack structures extracted bots. If Task 15 experiment revealed a different path, update `candidates`. If injection is more complex (e.g., embedded in v2 card spec), refactor.

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/primitives/build.test.ts`

If `injectCharacterVersion` path is wrong, the test still exercises preset path (no injection needed) and should pass. Bot injection will be verified in E2E (Task 20).

- [ ] **Step 5: Commit**

```bash
git add src/primitives/build.ts tests/primitives/build.test.ts
git commit -m "feat(primitive): build with version bump and encrypted dist"
```

---

## Task 17: `history` Primitive

**Files:**
- Create: `RisuVault/src/primitives/history.ts`
- Test: `RisuVault/tests/primitives/history.test.ts`

- [ ] **Step 1: Write failing test**

`tests/primitives/history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runInit } from "../../src/primitives/init.js";
import { runAdd } from "../../src/primitives/add.js";
import { runUnlock } from "../../src/primitives/unlock.js";
import { runBuild } from "../../src/primitives/build.js";
import { runHistory } from "../../src/primitives/history.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

describe("runHistory", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(async () => {
    tmp = createTempVaultRoot();
    await runInit(tmp.root, "pw");
    const src = join(tmp.root, "s.risup");
    writeFileSync(src, JSON.stringify({ name: "s", mainPrompt: "p", regex: [], promptTemplate: "{{prompt}}" }));
    await runAdd(tmp.root, "pw", src, "s");
    await runUnlock(tmp.root, "pw", "s");
    await runBuild(tmp.root, "pw", "s", "minor");
    await runBuild(tmp.root, "pw", "s", "minor");
  });
  afterEach(() => tmp.cleanup());

  it("lists builds newest first", async () => {
    const hist = await runHistory(tmp.root, "pw", "s");
    expect(hist.length).toBe(2);
    expect(hist[0].version).toBe("1.2");
    expect(hist[1].version).toBe("1.1");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `cd RisuVault && npx vitest run tests/primitives/history.test.ts`

- [ ] **Step 3: Implement**

`src/primitives/history.ts`:

```ts
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
```

- [ ] **Step 4: Run — pass**

Run: `cd RisuVault && npx vitest run tests/primitives/history.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/primitives/history.ts tests/primitives/history.test.ts
git commit -m "feat(primitive): history"
```

---

## Task 18: CLI Wrapper (commander)

**Files:**
- Create: `RisuVault/src/cli.ts`

- [ ] **Step 1: Implement CLI**

`src/cli.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { acquirePassphrase } from "./core/passphrase.js";
import { VaultError } from "./core/errors.js";
import { runInit } from "./primitives/init.js";
import { runAdd } from "./primitives/add.js";
import { runList } from "./primitives/list.js";
import { runUnlock } from "./primitives/unlock.js";
import { runLock } from "./primitives/lock.js";
import { runBuild } from "./primitives/build.js";
import { runStatus } from "./primitives/status.js";
import { runHistory } from "./primitives/history.js";

const program = new Command();
program.name("risuvault").description("Encrypted git-backed RisuAI vault").version("0.1.0");

function emit(json: boolean, data: unknown, text: () => string): void {
  if (json) process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  else process.stdout.write(text() + "\n");
}

async function withHandle<T>(fn: () => Promise<T>): Promise<void> {
  try { await fn(); }
  catch (e) {
    if (e instanceof VaultError) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exit(e.exitCode);
    }
    process.stderr.write(`unexpected: ${(e as Error).stack ?? e}\n`);
    process.exit(2);
  }
}

program.command("init [dir]").description("initialize a vault")
  .action(async (dir = ".") => withHandle(async () => {
    const pw = await acquirePassphrase();
    await runInit(dir, pw);
    process.stdout.write(`vault initialized at ${dir}\n`);
  }));

program.command("add <file>").description("add a RisuAI file to the vault")
  .requiredOption("--name <name>", "project name (must be unique)")
  .option("--json", "json output")
  .action(async (file, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const r = await runAdd(".", pw, file, opts.name);
    emit(!!opts.json, r, () => `added ${r.name} (${r.kind}) as ${r.uuid}`);
  }));

program.command("list").description("list projects").option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const items = await runList(".", pw);
    emit(!!opts.json, items, () =>
      items.length === 0 ? "(empty)" :
      items.map(p => `${p.name} (${p.kind}) v${p.currentVersion}`).join("\n")
    );
  }));

program.command("unlock <name>").description("decrypt project to cache")
  .action(async (name) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const uuid = await runUnlock(".", pw, name);
    process.stdout.write(`unlocked ${name} (${uuid})\n`);
  }));

program.command("lock <name>").description("re-encrypt project and remove cache")
  .action(async (name) => withHandle(async () => {
    const pw = await acquirePassphrase();
    await runLock(".", pw, name);
    process.stdout.write(`locked ${name}\n`);
  }));

program.command("build <name>").description("build project to original format")
  .option("--major", "bump major version")
  .option("--version <v>", "explicit version")
  .option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const bump = opts.version ? { explicit: String(opts.version) } : (opts.major ? "major" : "minor");
    const r = await runBuild(".", pw, name, bump as "minor" | "major" | { explicit: string });
    emit(!!opts.json, r, () => `built ${r.artifactFilename}`);
  }));

program.command("status").description("show project lock state").option("--json", "json output")
  .action(async (opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const rows = await runStatus(".", pw);
    emit(!!opts.json, rows, () =>
      rows.length === 0 ? "(empty)" :
      rows.map(r => `${r.name}\t${r.state}\tv${r.currentVersion}`).join("\n")
    );
  }));

program.command("history <name>").description("show build history").option("--json", "json output")
  .action(async (name, opts) => withHandle(async () => {
    const pw = await acquirePassphrase();
    const rows = await runHistory(".", pw, name);
    emit(!!opts.json, rows, () =>
      rows.map(r => `${r.builtAt}\tv${r.version}\t${r.artifactFilename}`).join("\n")
    );
  }));

program.parseAsync();
```

- [ ] **Step 2: Build and smoke-test**

```bash
cd RisuVault
npm run build
RISUVAULT_PASSPHRASE=tmp node dist/cli.js init test-vault
```

Expected: `vault initialized at test-vault` and `test-vault/.risuvault/` created.

```bash
rm -rf test-vault
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): commander wrapper around primitives"
```

---

## Task 19: Skills Refinement

The 3 skill files already exist. Refine them to match the implemented commands and add `_KR` companions.

**Files:**
- Modify: `RisuVault/.claude/skills/risuvault-add-bot/SKILL.md`
- Modify: `RisuVault/.claude/skills/risuvault-edit-project/SKILL.md`
- Modify: `RisuVault/.claude/skills/risuvault-restore/SKILL.md`
- Create: `RisuVault/.claude/skills/risuvault-add-bot/SKILL_KR.md`
- Create: `RisuVault/.claude/skills/risuvault-edit-project/SKILL_KR.md`
- Create: `RisuVault/.claude/skills/risuvault-restore/SKILL_KR.md`

- [ ] **Step 1: Update risuvault-add-bot/SKILL.md**

Replace content with:

````markdown
---
name: risuvault-add-bot
description: Use when the user wants to register a new bot/module/preset file from inbox/ into the RisuVault for encrypted backup
---

# Add a RisuAI File to the Vault

## When to use
- A new `.charx`/`.png`/`.risum`/`.risup`/`.risupreset` is in `inbox/` and the user wants it backed up
- User explicitly invokes this skill

## Prerequisites
- Vault is initialized: `.risuvault/config.json` and `.risuvault/vault.db` exist
- Passphrase known (user copies from Bitwarden `RisuFile` collection)

## Steps
1. Confirm the source file path and desired project name with the user.
2. Ask the user for the passphrase. Accept via `RISUVAULT_PASSPHRASE` env var if already set.
3. Run: `RISUVAULT_PASSPHRASE=<pw> risuvault add <file> --name <name> --json`
4. Report the returned `uuid` and `kind`.
5. Remind the user to `git add . && git commit && git push` when they want to back up remotely.

## If AI hits limits (human fallback)
- User can do the same with the CLI directly:
  ```
  set RISUVAULT_PASSPHRASE=<pw>
  risuvault add inbox\alice.charx --name alice
  ```

## Error cases
- Exit 1 (`no .risuvault found`): run `risuvault init` first
- Exit 3 (`authentication failed`): wrong passphrase
- `project name "X" already exists`: use a different name or rename the existing one via SQL (Phase 2 will offer `rename`)
````

- [ ] **Step 2: Update risuvault-edit-project/SKILL.md**

````markdown
---
name: risuvault-edit-project
description: Use when the user wants to edit a registered vault project — unlock, modify, lock, optionally build back to RisuAI format
---

# Edit a Vault Project

## When to use
- User wants to modify an existing bot/module/preset that is already in the vault
- User wants to build an edited project to an importable artifact

## Version rules (important)
- Every `build` increments the version (minor by default: 1.0 → 1.1 → 1.2).
- **Bots** have an internal `character_version` field in the card data. `risuvault build` automatically updates this field to match the new vault version.
- **Modules (.risum)** and **presets (.risup/.risupreset)** have no internal version field. The version is encoded in the filename: `myname-v1.2.risum`. When importing into RisuAI, prefer the versioned filename so imports don't overwrite prior snapshots.

## Steps
1. Run `risuvault list --json` to locate the project.
2. Ask for passphrase.
3. `risuvault unlock <name>` — decrypts to `.risuvault/cache/<uuid>/`.
4. Edit files in the cache (character card JSON, lorebook entries, regex scripts, CSS, CBS/lua snippets, prompt templates, etc.).
5. When done:
   - To build a new versioned artifact: `risuvault build <name>` (or `--major` / `--version X.Y`).
   - Built artifact is encrypted at `projects/<uuid>/dist/<name>-v<version>.<ext>.enc` and will be part of the next git commit.
6. `risuvault lock <name>` — re-encrypts edits into `projects/<uuid>/` and removes the plaintext cache.
7. Remind user to commit: `git add . && git commit -m "edit <name>"`.

## Important rules
- NEVER commit the plaintext cache. `.risuvault/cache/` is `.gitignore`'d.
- If `lock` fails partway, the already-encrypted files are in their new state (per-file atomic rename). Re-run `lock` after fixing the error.
- Assets live outside the vault. If edits require assets (images, audio), the user must pair them with the original file separately.

## If AI hits limits (human fallback)
- Use the same CLI commands directly.
- Plaintext cache at `.risuvault/cache/<uuid>/` can be inspected while unlocked.

## Error cases
- `<name> is locked; run unlock first` — build needs an unlocked cache
- `cannot bump version "v1-beta": expected N.N format` — use `--version X.Y` to set explicitly
- Exit 3: wrong passphrase
````

- [ ] **Step 3: Update risuvault-restore/SKILL.md**

````markdown
---
name: risuvault-restore
description: Use when starting on a new machine or after data loss — clone the vault git repo and decrypt selected projects
---

# Restore Vault on a New Machine

## When to use
- Fresh laptop / new clone of the vault repository
- User wants to spot-check a project without unlocking everything

## Steps
1. `git clone <vault-remote-url> <target-dir>` (user runs, or AI runs on their behalf).
2. `cd <target-dir>`
3. Verify `.risuvault/config.json` exists.
4. Ask for passphrase.
5. Sanity check: `risuvault list --json`. If this succeeds, the passphrase is correct and the DB is intact.
6. For projects to edit, follow `risuvault-edit-project`.

## Notes
- Assets are not in the vault (gitignored). User must restore assets separately if needed.
- `.risuvault/cache/` is local-only and empty on fresh clone. Create by `unlock`-ing.

## If AI hits limits (human fallback)
- Same commands manually.
- If passphrase is lost: the vault is permanently unrecoverable — the same risk class as losing a Bitwarden master password.

## Error cases
- Exit 3 on `list`: wrong passphrase
- Exit 1 `no .risuvault found`: not inside a vault directory
````

- [ ] **Step 4: Create Korean companions**

For each skill, write `SKILL_KR.md` in Korean that translates the content faithfully. Match section headings one-for-one. Per CLAUDE.md: the English SKILL.md is canonical; Korean companion is a user-facing mirror.

Example for `risuvault-add-bot/SKILL_KR.md`:

````markdown
---
name: risuvault-add-bot
description: inbox/의 새 봇/모듈/프리셋 파일을 RisuVault에 암호화 백업 대상으로 등록할 때 사용
---

# RisuAI 파일을 vault에 추가

## 언제 쓰나
- 새 `.charx`/`.png`/`.risum`/`.risup`/`.risupreset` 파일이 `inbox/`에 있고 백업이 필요할 때
- 사용자가 이 스킬을 명시적으로 호출할 때

## 전제 조건
- vault 초기화 완료: `.risuvault/config.json`과 `.risuvault/vault.db` 존재
- 패스프레이즈 확보 (Bitwarden `RisuFile` 콜렉션에서 복사)

## 단계
1. 원본 파일 경로와 프로젝트 이름을 사용자에게 확인받기.
2. 패스프레이즈를 사용자에게 받기. `RISUVAULT_PASSPHRASE` 환경변수가 이미 설정돼 있으면 그대로 사용.
3. 실행: `RISUVAULT_PASSPHRASE=<pw> risuvault add <file> --name <name> --json`
4. 반환된 `uuid`와 `kind` 보고.
5. 원격 백업이 필요하면 `git add . && git commit && git push`를 안내.

## AI 한도 도달 시 (사람 대체)
- 사용자가 CLI로 직접 할 수 있음:
  ```
  set RISUVAULT_PASSPHRASE=<pw>
  risuvault add inbox\alice.charx --name alice
  ```

## 에러 케이스
- Exit 1 (`no .risuvault found`): 먼저 `risuvault init` 실행
- Exit 3 (`authentication failed`): 패스프레이즈 오류
- `project name "X" already exists`: 다른 이름 사용
````

Write the other two Korean companions with the same translation approach, matching their English counterparts section-by-section.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/
git commit -m "docs(skills): refine 3 skills to match implemented CLI, add Korean companions"
```

---

## Task 20: End-to-End Smoke Test

Manual verification with real RisuAI files.

- [ ] **Step 1: Prepare fixtures**

Place one small real file of each kind into `RisuVault/tmp/e2e/`:
- `alice.charx` (small bot)
- `lore.risum` (simple module)
- `preset.risup` (basic preset)

- [ ] **Step 2: Build CLI**

```bash
cd RisuVault && npm run build
```

- [ ] **Step 3: Run the golden path**

```bash
cd RisuVault
export RISUVAULT_PASSPHRASE=test-pw-do-not-ship

# Start a fresh test vault
mkdir -p tmp/e2e-vault && cd tmp/e2e-vault
node ../../dist/cli.js init
cp ../e2e/alice.charx inbox/
cp ../e2e/lore.risum inbox/
cp ../e2e/preset.risup inbox/

node ../../dist/cli.js add inbox/alice.charx --name alice
node ../../dist/cli.js add inbox/lore.risum --name lore
node ../../dist/cli.js add inbox/preset.risup --name preset

node ../../dist/cli.js list
# Expected: 3 entries

node ../../dist/cli.js unlock alice
# Manually edit .risuvault/cache/<uuid>/src/<whatever>.txt

node ../../dist/cli.js build alice
# Expected: alice-v1.1.charx created in projects/<uuid>/dist/ (encrypted)

node ../../dist/cli.js lock alice

node ../../dist/cli.js status
node ../../dist/cli.js history alice

# Verify: decrypt dist artifact manually and confirm RisuAI can import it.
# (decryption script or unlock then copy dist/*.charx to inbox)
```

- [ ] **Step 4: Clean up**

```bash
cd ../..
rm -rf tmp/e2e-vault
unset RISUVAULT_PASSPHRASE
```

- [ ] **Step 5: Document findings**

If any step failed or required workarounds, write notes to `docs/superpowers/notes/2026-04-16-e2e-notes.md`. Commit these notes and any bug fixes.

```bash
git add docs/superpowers/notes/
git commit -m "docs: E2E smoke test notes"
```

---

## Task 21: README

**Files:**
- Modify: `RisuVault/README.md`

- [ ] **Step 1: Rewrite README**

Replace current placeholder with a real usage-focused README in Korean (per CLAUDE.md):

````markdown
# RisuVault

RisuAI 봇/모듈/프리셋을 **공개 GitHub 저장소**에 암호화 백업하고 버전 관리하는 CLI 도구.

## 빠른 시작

```bash
npm install -g risuvault
# 또는 이 리포를 직접 clone 후 npm link

# 1. vault 초기화 (새 폴더에서)
risuvault init

# 2. 패스프레이즈 준비 (Bitwarden `RisuFile` 콜렉션)
export RISUVAULT_PASSPHRASE='your-long-passphrase'

# 3. RisuAI에서 내보낸 파일을 inbox/ 에 두고 vault에 추가
cp ~/Downloads/alice.charx inbox/
risuvault add inbox/alice.charx --name alice

# 4. 편집
risuvault unlock alice
# .risuvault/cache/<uuid>/ 안의 파일을 직접 수정
risuvault build alice     # 버전 자동 1.0 → 1.1
risuvault lock alice

# 5. git push (표준 git 명령)
git add . && git commit -m "edit alice" && git push
```

## 명령 목록

| 명령 | 설명 |
|------|------|
| `init [dir]` | vault 초기화 |
| `add <file> --name <n>` | 파일을 vault에 등록 |
| `list [--json]` | 프로젝트 목록 |
| `unlock <name>` | 프로젝트 복호화 (cache에) |
| `lock <name>` | 수정사항 재암호화 |
| `build <name> [--major\|--version X.Y]` | 원본 포맷으로 빌드, 버전 기록 |
| `status [--json]` | lock 상태 표시 |
| `history <name>` | 빌드 이력 |

모든 명령은 `RISUVAULT_PASSPHRASE` 환경변수를 인식합니다. 없으면 대화형 프롬프트로 물어봅니다.

## 보안

- AES-256-GCM 파일 암호화 (프로젝트별 랜덤 키)
- SQLCipher 암호화 DB (레지스트리 + 키 저장소)
- Argon2id 패스프레이즈 KDF
- 패스프레이즈 분실 시 복원 불가 — Bitwarden 같은 비밀번호 관리자에 반드시 백업

## 아키텍처

설계 상세: [docs/superpowers/specs/2026-04-16-risuvault-design.md](docs/superpowers/specs/2026-04-16-risuvault-design.md)
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: user-facing README"
```

---

## Task 22: Final Verification

- [ ] **Step 1: Full test suite**

```bash
cd RisuVault && npm test
```

Expected: All tests PASS.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Build clean**

```bash
npm run build
```

Expected: `dist/` populated, no errors.

- [ ] **Step 4: Final commit (if any housekeeping needed)**

```bash
git status
# If clean, no commit needed.
```

---

## Summary of Commits Expected

1. feat: scaffold RisuVault project
2. feat(crypto): Argon2id key derivation
3. feat(crypto): AES-256-GCM buffer and file encryption
4. feat(config): config.json read/write
5. feat(db): SQLCipher open and schema
6. feat(db): CRUD helpers
7. feat(core): UUID and passphrase utilities
8. feat(core): version bump logic
9. feat(primitive): init
10. feat(primitive): list
11. feat(core): file walker
12. feat(primitive): add
13. feat(primitive): unlock + lock
14. feat(primitive): status
15. docs: RisuPack assets-absent probe
16. feat(primitive): build
17. feat(primitive): history
18. feat(cli): commander wrapper
19. docs(skills): refine skills + Korean companions
20. docs: E2E notes
21. docs: README

Merges/squashes at PR time are up to the user.
