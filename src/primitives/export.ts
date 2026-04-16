import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, decryptBuffer } from "../core/crypto.js";
import { openDb, resolveProject, listProjectFiles } from "../core/db.js";
import { dbPath, projectDir, outboxDir } from "../core/paths.js";
import { UserError } from "../core/errors.js";

const EXT_BY_FORMAT: Record<string, string> = {
  charx: "charx", png: "png", jpg: "jpg", jpeg: "jpeg",
  risum: "risum",
  risup: "risup", risupreset: "risupreset"
};

export interface ExportResult {
  uuid: string;
  outPath: string;
}

export async function runExport(
  root: string, passphrase: string, ref: string
): Promise<ExportResult> {
  const cfg = readConfig(root);
  const key = await deriveKey(passphrase, Buffer.from(cfg.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  try {
    const p = resolveProject(db, ref);
    if (!p) throw new UserError(`no project: ${ref}`);
    const ext = EXT_BY_FORMAT[p.sourceFormat];
    const distRelPath = `dist/${p.name}.${ext}`;
    const fileMap = listProjectFiles(db, p.uuid);
    const entry = fileMap.find(e => e.originalPath === distRelPath);
    if (!entry) {
      throw new UserError(`no built artifact for ${p.name}; run build first`);
    }
    const encPath = join(projectDir(root, p.uuid), `${entry.hashedName}.enc`);
    if (!existsSync(encPath)) {
      throw new UserError(`encrypted artifact missing on disk for ${p.name}`);
    }
    mkdirSync(outboxDir(root), { recursive: true });
    const plain = decryptBuffer(readFileSync(encPath), p.fileKey);
    const outPath = join(outboxDir(root), `${p.name}.${ext}`);
    writeFileSync(outPath, plain);
    return { uuid: p.uuid, outPath };
  } finally { db.close(); }
}
