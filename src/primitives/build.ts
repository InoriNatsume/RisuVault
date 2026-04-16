import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../core/config.js";
import { deriveKey, encryptBuffer, computeHashedName } from "../core/crypto.js";
import {
  openDb, resolveProject, updateProjectVersion, insertBuildHistory, upsertProjectFile
} from "../core/db.js";
import { dbPath, projectCacheDir, projectDir, outboxDir } from "../core/paths.js";
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
    const artifactFilename = `${p.name}.${ext}`;

    if (p.kind === "bot") {
      injectBotVersion(cacheProjectDir, newVersion);
      stripBotAssets(cacheProjectDir);
    } else if (p.kind === "module") {
      injectModuleVersion(cacheProjectDir, newVersion);
    } else if (p.kind === "preset") {
      injectPresetVersion(cacheProjectDir, newVersion);
    }

    const outputDir = join(cacheProjectDir, "dist");
    mkdirSync(outputDir, { recursive: true });
    const plaintextArtifactPath = join(outputDir, artifactFilename);
    await buildWith(cacheProjectDir, plaintextArtifactPath);

    const distRelPath = `dist/${artifactFilename}`;
    const hashedName = computeHashedName(p.fileKey, distRelPath);
    const encryptedPath = join(projectDir(root, p.uuid), `${hashedName}.enc`);
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

function injectBotVersion(cacheDir: string, version: string): void {
  // RisuPack bot layout stores the canonical card metadata at
  // pack/card/card.meta.json -> preservedCard.data.character_version
  const metaPath = join(cacheDir, "pack", "card", "card.meta.json");
  if (!existsSync(metaPath)) return;
  const obj = JSON.parse(readFileSync(metaPath, "utf8")) as {
    preservedCard?: { data?: Record<string, unknown> };
  };
  if (obj.preservedCard?.data) {
    obj.preservedCard.data.character_version = version;
    writeFileSync(metaPath, JSON.stringify(obj, null, 2));
  }
}

// Vault always excludes assets, so built bot cards must declare an empty asset
// list. Otherwise RisuAI tries to load referenced files that are not inside the
// built charx and aborts the import with "asset ... not found".
function stripBotAssets(cacheDir: string): void {
  const cardMetaPath = join(cacheDir, "pack", "card", "card.meta.json");
  if (existsSync(cardMetaPath)) {
    const obj = JSON.parse(readFileSync(cardMetaPath, "utf8")) as {
      preservedCard?: { data?: Record<string, unknown> };
    };
    if (obj.preservedCard?.data) {
      (obj.preservedCard.data as Record<string, unknown>).assets = [];
      writeFileSync(cardMetaPath, JSON.stringify(obj, null, 2));
    }
  }
  const botMetaPath = join(cacheDir, "pack", "bot.meta.json");
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

function injectModuleVersion(cacheDir: string, version: string): void {
  const modulePath = join(cacheDir, "pack", "module.json");
  if (!existsSync(modulePath)) return;
  const obj = JSON.parse(readFileSync(modulePath, "utf8")) as Record<string, unknown>;
  obj.description = applyVersionMarker(obj.description as string | undefined | null, version);
  writeFileSync(modulePath, JSON.stringify(obj, null, 2));
}

function injectPresetVersion(cacheDir: string, version: string): void {
  const presetPath = join(cacheDir, "pack", "preset.raw.json");
  if (!existsSync(presetPath)) return;
  const obj = JSON.parse(readFileSync(presetPath, "utf8")) as Record<string, unknown>;
  const existing = obj.name as string | undefined | null;
  obj.name = applyVersionMarker(existing ?? "preset", version);
  writeFileSync(presetPath, JSON.stringify(obj, null, 2));
}
