---
name: risuvault-restore
description: 새 기기에서 시작하거나 데이터 손실 후 — Vault git 레포를 클론하고 필요한 프로젝트를 복호화할 때 사용
---

# 새 기기에서 Vault 복원하기

> **쉽게 말하면:** 새 컴퓨터에서 금고(Vault)를 다시 열려면, git에서 파일을 내려받고 패스프레이즈로 잠금을 해제하면 됩니다.

## 언제 사용하나요?
- 새 노트북이나 새 클론 환경에서 처음 작업을 시작할 때
- 전체를 열지 않고 특정 프로젝트만 확인하고 싶을 때

## 진행 순서
1. `git clone <vault-remote-url> <target-dir>`
2. `cd <target-dir>`
3. `.risuvault/config.json` 파일이 존재하는지 확인합니다.
4. 패스프레이즈를 물어봅니다.
5. `risuvault list --json` — 명령이 성공하면 패스프레이즈가 올바르고 DB가 정상입니다.
6. 수정할 프로젝트가 있으면 `risuvault-edit-project` 스킬을 따르세요.

## 참고사항
- 이미지·오디오 등의 에셋(assets)은 Vault에 포함되지 않습니다(`.gitignore` 처리됨). 필요하면 별도로 복원해야 합니다.
- `.risuvault/cache/` 폴더는 로컬 전용이며, 새 클론에서는 비어 있습니다. `unlock` 명령으로 생성됩니다.

## AI가 한계에 부딪혔을 때 (사람이 직접 하는 방법)
같은 CLI 명령을 직접 실행하면 됩니다. **패스프레이즈를 분실한 경우:** Vault는 영구적으로 복구 불가능합니다. Bitwarden 마스터 패스워드를 잃어버린 것과 동일한 위험입니다.

## 오류 대응
| 오류 | 원인 | 해결 방법 |
|------|------|-----------|
| `list` 명령에서 Exit 3 | 패스프레이즈가 틀림 | Bitwarden에서 다시 복사 |
| Exit 1 `no .risuvault found` | Vault 디렉터리 안에 있지 않음 | 올바른 디렉터리로 이동 후 재시도 |
