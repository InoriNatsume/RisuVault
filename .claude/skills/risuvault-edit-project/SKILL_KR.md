---
name: risuvault-edit-project
description: 사용자가 Vault에 등록된 프로젝트를 수정하려 할 때 사용 — project_work/에서 직접 편집, sync로 git에 반영, 필요 시 RisuAI 형식으로 빌드
---

# Vault 프로젝트 수정하기

> **쉽게 말하면:** `project_work/<이름>/` 폴더가 항상 열려 있는 작업 공간입니다. 파일을 직접 수정하고, `sync`로 암호화해서 git에 저장합니다. 매번 잠금을 열고 닫을 필요가 없습니다.

## 언제 사용하나요?
- Vault에 등록된 봇·모듈·프리셋을 수정하고 싶을 때
- 수정한 프로젝트를 RisuAI에서 가져올 수 있는 파일(아티팩트)로 내보내고 싶을 때

## 버전 규칙 (중요)
- `build`를 실행할 때마다 DB에서 버전이 올라갑니다. 기본값은 마이너 증가(예: 1.0 → 1.1 → 1.2, `--major` 또는 `--version X.Y`로 재정의 가능)입니다.
- **봇** — 카드 데이터 내부의 `character_version`이 자동 업데이트됩니다.
- **모듈** — 모듈 `description` 필드 끝에 `[v1.2]` 마커가 추가됩니다(RisuAI의 모듈 설명란에 표시, 재빌드 시 멱등적으로 처리).
- **프리셋** — 프리셋 `name` 필드 끝에 `[v1.2]` 마커가 추가됩니다(RisuAI의 프리셋 목록에 표시, 멱등적).
- **파일명은 안정적**: `<64hex>.enc` — 파일명에 버전이 없습니다. git 히스토리 + DB `build_history`가 버전별 SHA를 추적합니다.

## RisuAI에 가져오기
- 빌드 후 `outbox/<name>.<ext>`에 평문 복사본이 있습니다 — 이 파일을 RisuAI에 바로 드래그앤드롭/임포트하세요.

## 진행 순서
1. `risuvault list --json` — 수정할 프로젝트를 찾습니다.
2. 패스프레이즈를 물어봅니다.
3. `project_work/<이름>/` 폴더에서 파일을 직접 수정합니다(카드 JSON, 로어북 항목, 정규식, CSS, CBS/lua, 프롬프트 템플릿 등).
   - `project_work/<이름>/`이 없으면(새 클론 또는 wipe 후) 먼저 `risuvault pull <이름>`을 실행합니다.
4. 수정이 끝나면:
   - 새 버전 아티팩트 빌드: `risuvault build <이름>` (또는 `--major` / `--version X.Y`)
   - 빌드된 파일은 `project_git/<uuid>/<hashedName>.enc`에 암호화되어 저장되고, 평문 복사본이 `outbox/<이름>.<ext>`에 떨어집니다.
5. `risuvault sync <이름>` — 작업 파일 전체를 `project_git/`에 재암호화합니다.
6. RisuAI에 가져오려면: `outbox/<이름>.<ext>`를 직접 사용합니다.
7. **커밋 전 반드시 `risuvault verify` 실행** (exit 0 필수). 위반 항목이 있으면 먼저 해결합니다.
8. **중립 커밋 메시지** 사용 (프로젝트/캐릭터/에셋 이름 금지): `git add . && git commit -m "edit 1 project"`.

## 팀원이 project_git/을 변경한 경우
`git pull` 후 `risuvault pull <이름>` (또는 `risuvault pull --all`)을 실행하면 로컬 `project_work/`가 최신 상태로 갱신됩니다.

## 주의사항
- `project_work/`를 절대 git에 커밋하지 마세요. `.gitignore`에 등록되어 있습니다 — 평문 파일은 git에 들어가면 안 됩니다.
- `project_work/<이름>/`은 영구적이지만 버려도 됩니다: `risuvault pull <이름>`으로 언제든지 재생성할 수 있습니다.
- 이미지·오디오 등의 에셋(assets)은 Vault 밖에 있습니다. 필요하면 별도로 관리해야 합니다.

## AI가 한계에 부딪혔을 때 (사람이 직접 하는 방법)
CLI를 직접 사용하세요. `project_work/<이름>/` 폴더에서 평문 파일에 항상 접근할 수 있습니다.

## 오류 대응
| 오류 | 원인 | 해결 방법 |
|------|------|-----------|
| `project_work/<이름>/ missing; run 'risuvault pull' first` | 작업 디렉터리가 없음 | `risuvault pull <이름>` 실행 |
| `cannot bump version "v1-beta"` | 비표준 버전 형식 | `--version X.Y` 옵션으로 수동 지정 |
| Exit 3 | 패스프레이즈가 틀림 | Bitwarden에서 다시 복사 |
