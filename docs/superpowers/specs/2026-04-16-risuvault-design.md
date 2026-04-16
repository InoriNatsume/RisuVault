# RisuVault 설계 명세

- 작성일: 2026-04-16
- 상태: 초안 v2 (브레인스토밍 결과, SQLCipher 기반으로 개정)
- 대상 프로젝트: RisuVault (신규 독립 리포)

## 1. 배경과 목적

RisuAI 사용자는 봇/모듈/프리셋을 로컬에서 편집하며 점진적으로 발전시킨다. 현재는 백업이 수동이고 버전 관리가 어렵다. 특히 공개 GitHub 저장소를 백업 대상으로 쓰려면 콘텐츠 보호가 필수다.

RisuVault는 다음을 해결한다:

- 여러 봇/모듈/프리셋을 하나의 git 리포에 통합 관리
- 공개 저장소여도 내용 유출 없이 푸시 가능 (암호화)
- 파일 단위 변경 추적 (어떤 조각이 언제 바뀌었는지 git 히스토리로 가시화)
- 빌드 이력 자동 버전 관리
- AI 에이전트가 주 운영자, 사람은 보조 (AI 컨텍스트/한도 소진 시 수동 개입)

## 2. 위협 모델과 보안 수준

- **위협**: 공개 저장소에 올라간 콘텐츠를 제3자가 평문으로 읽는 것
- **범위 밖**: API 키/금전 등급의 데이터는 없음. 캐릭터 설정/프롬프트는 노출 시 불쾌한 수준
- **보안 수준**: CLAUDE.md 기준 **Medium** — 공개 노출 + 민감도 있는 저장 데이터
- **대응**:
  - 저장 보호(DB): SQLCipher (AES-256 기반 내장 암호화)
  - 저장 보호(파일): AES-256-GCM, 프로젝트별 독립 랜덤 키
  - 접근 제어: Argon2id KDF로 패스프레이즈 → SQLCipher 키
  - 전송 보호: git의 HTTPS/SSH에 위임
- **수용하는 유출**: 프로젝트 수, 각 프로젝트의 파일 개수/크기/수정 타임라인, UUID. 이름·타입·내용·버전은 보호.

## 3. 아키텍처 경계

- **RisuPack** (기존, 독립 리포): 단일 바이너리 ↔ 단일 워크스페이스 변환기. 수정하지 않음.
- **RisuVault** (신규, 독립 리포): vault 관리, 암호화, git 워크플로우, 버전 관리.
- RisuVault는 RisuPack을 **git 의존성**으로 import:
  ```json
  "dependencies": {
    "risupack": "git+https://github.com/<owner>/RisuPack.git#v0.x.y"
  }
  ```
  태그로 버전 고정.

## 4. 폴더 레이아웃

```
<vault-root>/                        ← git 리포 루트
├── .risuvault/
│   ├── config.json                  ← 평문: vault 포맷 버전, KDF 파라미터, 솔트
│   ├── vault.db                     ← SQLCipher 암호화 DB (레지스트리 + 프로젝트별 키 + 버전 이력)
│   ├── docs/public/                 ← 평문 공개 문서
│   ├── private/                     ← 이름 공개, 내용 암호화 (*.md.enc)
│   └── cache/                       ← 평문 작업 캐시 (gitignored)
│       └── <uuid>/
├── .claude/skills/                  ← AI 스킬 (vault 리포에 동봉)
│   ├── risuvault-add-bot/
│   ├── risuvault-edit-project/
│   └── risuvault-restore/
├── projects/
│   └── <uuid>/                      ← 프로젝트 1개 = UUID 폴더 1개
│       ├── project.json.enc
│       ├── src/**/*.enc             ← 워크스페이스 텍스트/코드 (암호화)
│       ├── pack/**/*.enc
│       ├── dist/*.enc               ← 빌드 산출물 (암호화, git 관리 대상)
│       └── assets/                  ← gitignored (용량)
├── inbox/                           ← RisuAI → vault 입력 전용 (gitignored)
│   └── README.md
├── .gitignore
└── README.md
```

### 방향 분리 규칙
- `inbox/` = **입력 전용** (RisuAI에서 내보낸 원본을 vault에 편입시키기 전 대기소)
- `projects/<uuid>/dist/` = **출력 전용** (vault가 빌드한 산출물을 RisuAI로 가져가기 전 대기소, 암호화 상태로 git에 포함)
- 두 폴더는 섞이지 않음

### .gitignore 핵심 항목
```
projects/*/assets/
.risuvault/cache/
inbox/*
!inbox/README.md
```

## 5. 데이터 포맷

### 5.1 `.risuvault/config.json` (평문)
```json
{
  "vaultVersion": 1,
  "kdf": {
    "algorithm": "argon2id",
    "memoryCost": 65536,
    "timeCost": 3,
    "parallelism": 1,
    "saltHex": "<64 hex chars = 32 bytes>"
  },
  "dbCipher": "sqlcipher-aes-256",
  "fileCipher": "aes-256-gcm",
  "passphraseSource": { "type": "manual" }
}
```

Phase 2: `"passphraseSource": { "type": "bitwarden", "itemId": "<uuid>" }`

### 5.2 `vault.db` 스키마 (SQLCipher로 암호화)

```sql
CREATE TABLE projects (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('bot', 'module', 'preset')),
  source_format TEXT NOT NULL,
  file_key BLOB NOT NULL,            -- 32 bytes, per-project random AES key
  current_version TEXT NOT NULL,     -- e.g., "1.0", "1.1"
  added_at TEXT NOT NULL,
  last_locked_at TEXT,
  last_built_at TEXT
);

CREATE TABLE build_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_uuid TEXT NOT NULL REFERENCES projects(uuid),
  version TEXT NOT NULL,
  built_at TEXT NOT NULL,
  artifact_filename TEXT NOT NULL,   -- e.g., "alice-v1.2.charx"
  notes TEXT
);

CREATE INDEX idx_build_history_project ON build_history(project_uuid);
```

### 5.3 암호화 파일 바이너리 포맷 (`.enc`)
```
[12 bytes nonce][ciphertext][16 bytes GCM auth tag]
```
- nonce: 파일마다 `crypto.randomBytes(12)`
- 재암호화 시에도 항상 새 nonce
- 키: 해당 프로젝트의 `file_key` (vault.db에서 조회)

## 6. 암호화 스킴

- **DB**: SQLCipher AES-256 (via `better-sqlite3-multiple-ciphers` 또는 동급 라이브러리). `PRAGMA key = '<passphrase-derived-key>'`
- **파일**: AES-256-GCM (Node.js 내장 `crypto`)
- **KDF**: Argon2id via `argon2` npm
  - memoryCost: 64 MiB, timeCost: 3, parallelism: 1
- **키 계층**:
  1. 사용자 패스프레이즈 + config.json 솔트 → Argon2id → 32바이트 → SQLCipher 키
  2. SQLCipher DB 열림 → `projects.file_key` 열에서 프로젝트별 키 조회
  3. 해당 키로 `projects/<uuid>/*.enc` 파일 AES-GCM 복호화
- **키 수명**: CLI 호출 1회 = 1 프로세스. 프로세스 수명 동안만 메모리 유지. 프로세스 간 공유 없음 (Phase 1). 환경변수 `RISUVAULT_PASSPHRASE`로 연속 호출 대응
- **키 로테이션 (Phase 2)**: DB 재암호화는 `PRAGMA rekey`로 가능. 파일 키 로테이션은 프로젝트별 재암호화 필요

## 7. 키 관리

### Phase 1 (MVP)
- Bitwarden `RisuFile` 콜렉션에 Secure Note로 패스프레이즈 저장
- CLI가 프롬프트로 입력받음 (환경변수 `RISUVAULT_PASSPHRASE` 지원)
- 잘못된 패스프레이즈 → SQLCipher 열기 실패 → 명확한 에러

### Phase 2
- Bitwarden CLI (`bw`) 연동 → `passphraseSource` 타입별 분기

## 8. 버전 관리

### 자동 버전 부여 규칙
- **프로젝트 추가 시**: `current_version = "1.0"` 초기값
- **빌드 시**: 자동으로 minor 증가 (`1.0 → 1.1 → 1.2 …`)
- **Major 수동 증가**: `risuvault build <name> --major` → `1.5 → 2.0`
- **임의 지정**: `risuvault build <name> --version 3.14`

### 포맷별 반영 방식

| 포맷 | 파일 내부 버전 필드 | RisuVault 동작 |
|------|------------------|---------------|
| 봇 (charx/png/jpg) | 있음 (`character_version`) | 빌드 시 이 필드를 `current_version`으로 덮어씀 |
| 모듈 (risum) | **없음** | 파일명에 반드시 버전 삽입: `<name>-v<version>.risum` |
| 프리셋 (risup/risupreset) | **없음** | 파일명에 반드시 버전 삽입: `<name>-v<version>.risup` |

### 빌드 산출물 명명 규칙
- 봇: `projects/<uuid>/dist/<name>-v<version>.charx.enc` (통일성을 위해 모든 타입에 버전 포함)
- 모듈: `projects/<uuid>/dist/<name>-v<version>.risum.enc`
- 프리셋: `projects/<uuid>/dist/<name>-v<version>.risup.enc`

### build_history
모든 빌드는 `build_history` 테이블에 기록. `risuvault history <name>`으로 조회 가능(Phase 1에 선택 구현).

### 스킬 명시 사항
`risuvault-edit-project` SKILL.md에 다음 규칙 명시:
- 봇: 빌드하면 RisuAI에서 "캐릭터 버전" 필드가 자동 갱신됨을 알림
- 모듈/프리셋: 파일명에 버전이 들어있으므로 임포트 후 원래 이름만 쓰지 말고 버전 포함 이름으로 관리 권장

## 9. CLI 프리미티브

모든 명령 공통:
- `--json` 플래그 (AI 파싱용)
- 멱등성 보장
- 명확한 exit code (0=성공, 1=사용자 오류, 2=시스템 오류, 3=인증 실패)

| 명령 | 시그니처 | 동작 |
|------|---------|------|
| `init` | `risuvault init [dir]` | `.risuvault/` 생성, `config.json` 작성, 빈 `vault.db` 초기화 |
| `add` | `risuvault add <file> [--name <n>]` | RisuPack extract → 프로젝트별 랜덤 키 생성 → 암호화 → `projects/<uuid>/` 이동 → DB 레코드 작성 (`current_version="1.0"`) |
| `list` | `risuvault list [--json]` | DB에서 프로젝트 목록 조회 (uuid, name, kind, current_version, last_locked_at) |
| `unlock` | `risuvault unlock <uuid\|name>\|--all` | `projects/<uuid>/` → `.risuvault/cache/<uuid>/` 복호화 |
| `lock` | `risuvault lock <uuid\|name>\|--all` | 캐시 → `projects/<uuid>/` 재암호화. 성공 후 cache 삭제. DB `last_locked_at` 갱신 |
| `build` | `risuvault build <name> [--major\|--version <v>]` | cache → 버전 계산 → (봇은) `character_version` 필드 주입 → RisuPack build → 산출물 암호화해서 `projects/<uuid>/dist/` 저장 → DB `current_version`, `last_built_at`, `build_history` 갱신 |
| `status` | `risuvault status [--json]` | 각 프로젝트의 locked/unlocked/modified + 현재 버전 표시 |
| `history` | `risuvault history <name> [--json]` | (선택) 빌드 이력 조회 |

### 에러 처리 원칙
- 잘못된 패스프레이즈: exit 3, SQLCipher 열기 실패
- vault 미초기화: exit 1, "run `risuvault init` first"
- 일괄 작업(`--all`) 중 실패: **첫 실패에서 중단**, 이미 성공한 것은 성공 상태 유지 (원자적 rename 덕분에 일관성 있음), 에러 메시지에 중단 지점 명시
- DB 쓰기: SQLite 트랜잭션으로 원자성 확보
- 파일 쓰기: `*.tmp` → `rename`으로 원자성 확보

## 10. 스킬 구성

위치: `<vault-root>/.claude/skills/`. vault 리포 clone 시 함께 옴.

### 초기 스킬 3종
1. **risuvault-add-bot** — 새 파일을 vault에 편입
2. **risuvault-edit-project** — 등록된 프로젝트 편집 + 빌드 (버전 규칙 명시)
3. **risuvault-restore** — 새 기기에서 clone 후 복원

각 SKILL.md:
- YAML frontmatter (name, description)
- "언제 쓰는가 / 사전 조건 / 단계 / 에러 케이스 / AI 한도 도달 시 사람 fallback"
- CLAUDE.md 정책: 영어 canonical + `SKILL_KR.md` 동반본

### 확장 여지 (Phase 2+)
- `risuvault-sync` — 일괄 lock + git push 가이드
- `risuvault-rotate-passphrase` — SQLCipher rekey + 선택적 파일 키 로테이션

## 11. 기술 스택

- **런타임**: Node.js ≥ 20, TypeScript (RisuPack 일치)
- **DB**: `better-sqlite3-multiple-ciphers` (SQLCipher 지원)
- **KDF**: `argon2` npm
- **파일 암호화**: Node.js 내장 `crypto` (AES-256-GCM)
- **CLI**: `commander`
- **테스트**: RisuPack 테스트 방식 따름

## 12. 구현 단계 (Phase 1)

1. 리포 초기화, package.json, tsconfig, RisuPack git 의존성 등록
2. 암호화 코어: `deriveKey()`, `encryptFile()`, `decryptFile()`
3. DB 레이어: SQLCipher 열기/닫기, 스키마 마이그레이션, CRUD
4. vault 초기화 (`init`)
5. `add`, `list` 구현
6. `unlock`, `lock`, `status` 구현
7. `build` 구현 — **에셋 없이 RisuPack build 동작 검증** (구현 초반 실험)
8. 버전 관리 로직 (봇의 `character_version` 주입, 파일명 버전 삽입)
9. 3개 스킬 SKILL.md 작성 (영어) + `_KR` 동반본
10. 엔드투엔드 수동 테스트 (실제 작은 봇/모듈/프리셋 1개씩)
11. README + 공개 문서

## 13. 범위 밖

- Bitwarden CLI 자동 연동 (Phase 2)
- 에셋 백업/동기화
- 패스프레이즈 변경 / 키 로테이션 명령
- 다중 사용자 / 공유 키
- 파일 단위 부분 unlock
- GUI / 웹 인터페이스
- 빌드 이력 UI (CLI text만)

## 14. 열린 질문 (writing-plans 단계에서 결정)

- **에셋 없이 RisuPack build 동작**: 실패 vs 빈 에셋 빌드 vs RisuPack에 플래그 추가 필요 — 구현 초반 실험으로 확정
- **Argon2 파라미터 사용자 튜닝**: Phase 1은 코드 고정값으로 가고 Phase 2에 `rotate-params` 명령으로 허용 (제안)
- **`history` 명령 Phase 1 포함 여부**: DB 테이블은 만들되 조회 CLI는 선택
- **버전 문자열 형식**: major.minor만 허용(기본) vs 자유 문자열(`--version` 사용 시) — 후자 제안
