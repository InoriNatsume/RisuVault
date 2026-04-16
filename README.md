# RisuVault

RisuAI 봇/모듈/프리셋을 **공개 GitHub 저장소**에 암호화 백업하고 버전 관리하는 CLI 도구.

## 빠른 시작

```bash
npm install -g risuvault
# 또는 이 리포를 clone 후 npm link

# 1. vault 초기화 (새 폴더에서)
risuvault init

# 2. 패스프레이즈 준비 (Bitwarden RisuFile 콜렉션)
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
| `unlock <name>` | 프로젝트 복호화 (cache로) |
| `lock <name>` | 수정사항 재암호화 |
| `build <name> [--major\|--version X.Y]` | 원본 포맷으로 빌드, 버전 기록 |
| `status [--json]` | lock 상태 표시 |
| `history <name>` | 빌드 이력 |

모든 명령은 `RISUVAULT_PASSPHRASE` 환경변수를 인식합니다. 없으면 대화형 프롬프트.

## 보안

- AES-256-GCM 파일 암호화 (프로젝트별 랜덤 키)
- SQLCipher 암호화 DB (레지스트리 + 키 저장소)
- Argon2id 패스프레이즈 KDF
- 패스프레이즈 분실 시 복원 불가 — Bitwarden 같은 비밀번호 관리자에 반드시 백업

## 아키텍처

- 설계 상세: [docs/superpowers/specs/2026-04-16-risuvault-design.md](docs/superpowers/specs/2026-04-16-risuvault-design.md)
- 구현 계획: [docs/superpowers/plans/2026-04-16-risuvault-mvp.md](docs/superpowers/plans/2026-04-16-risuvault-mvp.md)

## 개발

```bash
npm install
npm test
npm run build
```
