---
name: risuvault-restore
description: Use when starting on a new machine or after data loss — clone the vault git repo and decrypt selected projects
---

# Restore Vault on a New Machine

## When to use
- Fresh laptop / new clone of the vault repository
- User wants to spot-check a project without unlocking everything

## Steps
1. `git clone <vault-remote-url> <target-dir>`
2. `cd <target-dir>`
3. Verify `.risuvault/config.json` exists.
4. Ask for passphrase.
5. `risuvault list --json` — if it succeeds, passphrase is correct and DB intact.
6. For projects to edit, follow `risuvault-edit-project`.

## Notes
- Assets not in vault (gitignored). User restores assets separately if needed.
- `.risuvault/cache/` is local-only and empty on fresh clone. Create by `unlock`-ing.

## If AI hits limits (human fallback)
Same commands manually. If passphrase lost: vault permanently unrecoverable (same risk as Bitwarden master password).

## Error cases
- Exit 3 on `list`: wrong passphrase
- Exit 1 `no .risuvault found`: not inside a vault directory
