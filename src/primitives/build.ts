import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer, computeHashedName } from "../core/crypto.js";
import {
  openDb, resolveProject, updateProjectVersion, insertBuildHistory, upsertProjectFile
} from "../core/db.js";
import { dbPath, projectGitDir, projectWorkDir, outboxDir } from "../core/paths.js";
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
    const workDir = projectWorkDir(root, p.name);
    if (!existsSync(workDir)) {
      throw new UserError(`project_work/${p.name}/ missing; run 'risuvault pull' first`);
    }

    const newVersion = bumpVersion(p.currentVersion, bump);
    const ext = EXT_BY_FORMAT[p.sourceFormat];
    const artifactFilename = `${p.name}.${ext}`;

    if (p.kind === "bot") {
      injectBotVersion(workDir, newVersion);
      stripBotAssets(workDir);
    } else if (p.kind === "module") {
      injectModuleVersion(workDir, newVersion);
    } else if (p.kind === "preset") {
      injectPresetVersion(workDir, newVersion);
    }

    const outputDir = join(workDir, "dist");
    mkdirSync(outputDir, { recursive: true });
    const plaintextArtifactPath = join(outputDir, artifactFilename);
    await buildWith(workDir, plaintextArtifactPath);

    const distRelPath = `dist/${artifactFilename}`;
    const hashedName = computeHashedName(p.fileKey, distRelPath);
    const encDir = projectGitDir(root, p.uuid);
    mkdirSync(encDir, { recursive: true });
    const encryptedPath = join(encDir, `${hashedName}.enc`);
    const tmp = encryptedPath + ".tmp";
    const blob = encryptBuffer(readFileSync(plaintextArtifactPath), p.fileKey);
    writeFileSync(tmp, blob);
    renameSync(tmp, encryptedPath);
    upsertProjectFile(db, p.uuid, distRelPath, hashedName);

    // Copy plaintext artifact to outbox/
    const outbox = outboxDir(root);
    mkdirSync(outbox, { recursive: true });
    copyFileSync(plaintextArtifactPath, join(outbox, artifactFilename));

    const builtAt = new Date().toISOString();
    updateProjectVersion(db, p.uuid, newVersion, builtAt);
    insertBuildHistory(db, {
      projectUuid: p.uuid, version: newVersion, builtAt,
      artifactFilename, commitSha: null, notes: null
    });

    return { uuid: p.uuid, version: newVersion, artifactFilename, encryptedPath };
  } finally { db.close(); }
}

function injectBotVersion(workDir: string, version: string): void {
  const metaPath = join(workDir, "pack", "card", "card.meta.json");
  if (!existsSync(metaPath)) return;
  const obj = JSON.parse(readFileSync(metaPath, "utf8")) as {
    preservedCard?: { data?: Record<string, unknown> };
  };
  if (obj.preservedCard?.data) {
    obj.preservedCard.data.character_version = version;
    writeFileSync(metaPath, JSON.stringify(obj, null, 2));
  }
}

function stripBotAssets(workDir: string): void {
  const cardMetaPath = join(workDir, "pack", "card", "card.meta.json");
  if (existsSync(cardMetaPath)) {
    const obj = JSON.parse(readFileSync(cardMetaPath, "utf8")) as {
      preservedCard?: { data?: Record<string, unknown> };
    };
    if (obj.preservedCard?.data) {
      (obj.preservedCard.data as Record<string, unknown>).assets = [];
      writeFileSync(cardMetaPath, JSON.stringify(obj, null, 2));
    }
  }
  const botMetaPath = join(workDir, "pack", "bot.meta.json");
  if (existsSync(botMetaPath)) {
    const obj = JSON.parse(readFileSync(botMetaPath, "utf8")) as Record<string, unknown>;
    obj.assets = [];
    writeFileSync(botMetaPath, JSON.stringify(obj, null, 2));
  }
}

function applyVersionMarker(original: string | undefined | null, version: string): string {
  const base = (original ?? "")
    .replace(/\s*\[v?\d+\.\d+\]\s*$/, "")
    .replace(/\s*\[vault v[\d.]+\]\s*$/, "")
    .trimEnd();
  return base ? `${base} [v${version}]` : `[v${version}]`;
}

function injectModuleVersion(workDir: string, version: string): void {
  const modulePath = join(workDir, "pack", "module.json");
  if (!existsSync(modulePath)) return;
  const obj = JSON.parse(readFileSync(modulePath, "utf8")) as Record<string, unknown>;
  obj.description = applyVersionMarker(obj.description as string | undefined | null, version);
  writeFileSync(modulePath, JSON.stringify(obj, null, 2));
}

function injectPresetVersion(workDir: string, version: string): void {
  const presetPath = join(workDir, "pack", "preset.raw.json");
  if (!existsSync(presetPath)) return;
  const obj = JSON.parse(readFileSync(presetPath, "utf8")) as Record<string, unknown>;
  const existing = obj.name as string | undefined | null;
  obj.name = applyVersionMarker(existing ?? "preset", version);
  writeFileSync(presetPath, JSON.stringify(obj, null, 2));
}
