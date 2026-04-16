import { mkdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptFile, computeHashedName } from "../core/crypto.js";
import { openDb, insertProject, getProjectByName, upsertProjectFile } from "../core/db.js";
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

    const rec: ProjectRecord = {
      uuid, name, kind, sourceFormat,
      fileKey, currentVersion: "1.0",
      addedAt: new Date().toISOString(),
      lastLockedAt: new Date().toISOString(),
      lastBuiltAt: null
    };
    insertProject(db, rec);

    const files = walkFiles(stagingDir, { excludeDirs: ["assets"] });
    for (const plain of files) {
      const rel = relative(stagingDir, plain).replace(/\\/g, "/");
      const hashedName = computeHashedName(fileKey, rel);
      const encPath = join(destDir, `${hashedName}.enc`);
      encryptFile(plain, encPath, fileKey);
      upsertProjectFile(db, uuid, rel, hashedName);
    }

    rmSync(stagingDir, { recursive: true, force: true });
    return { uuid, name, kind };
  } finally { db.close(); }
}
