import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  vaultDir, dbPath, cacheDir, projectsDir, inboxDir, outboxDir
} from "../core/paths.js";
import { generateDefaultConfig, writeConfig } from "../core/config.js";
import { openDb, initDbSchema } from "../core/db.js";
import { deriveKey } from "../core/crypto.js";
import { UserError } from "../core/errors.js";

const DEFAULT_GITIGNORE = `# RisuAI 에셋: 용량 문제로 vault 대상 아님
projects/*/assets/

# 복호화된 평문 작업 캐시: 절대 커밋 금지
.risuvault/cache/

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
  mkdirSync(cacheDir(root), { recursive: true });
  mkdirSync(projectsDir(root), { recursive: true });
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
