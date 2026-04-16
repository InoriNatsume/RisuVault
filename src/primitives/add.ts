import { mkdirSync, rmSync, copyFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptFile, computeHashedName } from "../core/crypto.js";
import { openDb, insertProject, getProjectByName, upsertProjectFile } from "../core/db.js";
import { vaultDir, dbPath, projectGitDir, projectWorkDir } from "../core/paths.js";
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
    const stagingDir = join(vaultDir(root), `staging-${uuid}`);
    mkdirSync(stagingDir, { recursive: true });

    await extractWith(resolve(inputPath), stagingDir);

    // Strip vault-level workspace-guidance injected by RisuPack extractor.
    // These are now provided at vault level via .claude/skills/; no need to
    // encrypt and store them per-project.
    pruneWorkspaceGuidance(stagingDir);

    const fileKey = randomBytes(32);
    const encDir = projectGitDir(root, uuid);
    const workDir = projectWorkDir(root, name);
    mkdirSync(encDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });

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
      const encPath = join(encDir, `${hashedName}.enc`);
      encryptFile(plain, encPath, fileKey);

      // Also copy plaintext to project_work/<name>/
      const workFile = join(workDir, rel);
      mkdirSync(dirname(workFile), { recursive: true });
      copyFileSync(plain, workFile);

      upsertProjectFile(db, uuid, rel, hashedName);
    }

    rmSync(stagingDir, { recursive: true, force: true });
    return { uuid, name, kind };
  } finally { db.close(); }
}

/** Remove AGENTS.md and .agents/ that RisuPack injects at extract time. */
function pruneWorkspaceGuidance(dir: string): void {
  rmSync(join(dir, "AGENTS.md"), { force: true });
  rmSync(join(dir, ".agents"), { recursive: true, force: true });
}
