---
name: risuvault-add-bot
description: 사용자가 inbox/ 폴더에 있는 봇·모듈·프리셋 파일을 RisuVault에 등록해 암호화 백업하려 할 때 사용
---

# RisuAI 파일을 Vault에 추가하기

> **쉽게 말하면:** 새로 받은 캐릭터 파일이나 모듈 파일을 금고(Vault)에 넣어 암호화해서 보관하는 작업입니다.

## 언제 사용하나요?
- `inbox/` 폴더에 새 `.charx` / `.png` / `.risum` / `.risup` / `.risupreset` 파일이 있고 백업하고 싶을 때
- 사용자가 직접 이 스킬을 호출했을 때

## 사전 준비
- Vault가 초기화되어 있어야 합니다: `.risuvault/config.json`과 `.risuvault/vault.db`가 존재해야 합니다.
- 패스프레이즈(암호)를 알고 있어야 합니다. Bitwarden의 `RisuFile` 컬렉션에서 복사하세요.

## 진행 순서
1. 원본 파일 경로와 프로젝트 이름을 확인합니다.
2. 패스프레이즈를 물어봅니다. `RISUVAULT_PASSPHRASE` 환경 변수가 설정되어 있으면 자동으로 사용합니다.
3. 다음 명령어를 실행합니다:
   ```
   RISUVAULT_PASSPHRASE=<pw> risuvault add <file> --name <name> --json
   ```
4. 반환된 `uuid`와 `kind`(파일 종류)를 사용자에게 알려줍니다.
5. **커밋 전 반드시 `risuvault verify` 실행** (exit 0 필수). 위반 항목이 있으면 먼저 해결합니다.
6. 원격 백업 시 **중립 커밋 메시지** 사용 (프로젝트/캐릭터 이름 금지): `git add . && git commit -m "add 1 project" && git push`.

## AI가 한계에 부딪혔을 때 (사람이 직접 하는 방법)
CLI에서 직접 실행하면 됩니다:
```
set RISUVAULT_PASSPHRASE=<pw>
risuvault add inbox\alice.charx --name alice
```

## 오류 대응
| 오류 | 원인 | 해결 방법 |
|------|------|-----------|
| Exit 1 (`no .risuvault found`) | Vault가 초기화되지 않음 | `risuvault init` 먼저 실행 |
| Exit 3 (`authentication failed`) | 패스프레이즈가 틀림 | Bitwarden에서 다시 복사 |
| `project name "X" already exists` | 이름 중복 | 다른 이름 사용 |
