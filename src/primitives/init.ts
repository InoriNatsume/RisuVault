import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  vaultDir, dbPath, projectGitRoot, projectWorkRoot, inboxDir, outboxDir
} from "../core/paths.js";
import { generateDefaultConfig, writeConfig } from "../core/config.js";
import { openDb, initDbSchema } from "../core/db.js";
import { deriveKey } from "../core/crypto.js";
import { UserError } from "../core/errors.js";

const DEFAULT_GITIGNORE = `# 평문 작업 영역 — git 추적 금지
project_work/

# RisuAI 에셋: 용량 문제로 vault 대상 아님
project_git/*/assets/

# inbox: 원본 바이너리 임시 보관
inbox/*
!inbox/README.md

# outbox: 빌드 결과 평문 복사본
outbox/*
!outbox/README.md

# TypeScript build output
/dist/

# Node
node_modules/
*.log
`;

export async function runInit(root: string, passphrase: string): Promise<void> {
  if (existsSync(vaultDir(root))) {
    throw new UserError(`vault already exists at ${vaultDir(root)}`);
  }
  mkdirSync(vaultDir(root), { recursive: true });
  mkdirSync(projectGitRoot(root), { recursive: true });
  mkdirSync(projectWorkRoot(root), { recursive: true });
  mkdirSync(inboxDir(root), { recursive: true });
  mkdirSync(outboxDir(root), { recursive: true });

  // Write a safe default .gitignore so verify passes out of the box.
  const gitignorePath = join(root, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, DEFAULT_GITIGNORE);
  }

  const config = generateDefaultConfig();
  writeConfig(root, config);

  const key = await deriveKey(passphrase, Buffer.from(config.kdf.saltHex, "hex"));
  const db = openDb(dbPath(root), key);
  initDbSchema(db);
  db.close();
}
