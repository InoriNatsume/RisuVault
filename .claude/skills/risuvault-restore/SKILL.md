---
name: risuvault-restore
description: Use when starting on a new machine or after data loss — clone the vault git repo, install deps, and decrypt projects to project_work/
---

# Restore Vault on a New Machine

## When to use
- Fresh laptop / new clone of the vault repository
- User wants to work on projects after cloning

## Steps
1. `git clone <vault-remote-url> <target-dir>`
2. `cd <target-dir>`
3. Verify `.risuvault/config.json` exists.
4. `npm install` — restore Node dependencies.
5. `npm run build` — rebuild the CLI.
6. Ask for passphrase.
7. `risuvault list --json` — if it succeeds, passphrase is correct and DB intact.
8. `risuvault pull --all` — decrypts all projects from `project_git/` into `project_work/`. Now ready to edit.
9. For editing, follow `risuvault-edit-project`.

## Notes
- Assets not in vault (gitignored). User restores assets separately if needed.
- `project_work/` is local-only and empty on fresh clone. `risuvault pull --all` populates it.

## If AI hits limits (human fallback)
Same commands manually. If passphrase lost: vault permanently unrecoverable (same risk as Bitwarden master password).

## Error cases
- Exit 3 on `list`: wrong passphrase
- Exit 1 `no .risuvault found`: not inside a vault directory
