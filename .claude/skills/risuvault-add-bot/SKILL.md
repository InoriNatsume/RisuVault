---
name: risuvault-add-bot
description: Use when the user wants to register a new bot/module/preset file from inbox/ into the RisuVault for encrypted backup
---

# Add a RisuAI File to the Vault

## When to use
- A new `.charx`/`.png`/`.risum`/`.risup`/`.risupreset` is in `inbox/` and the user wants it backed up
- User explicitly invokes this skill

## Prerequisites
- Vault initialized: `.risuvault/config.json` and `.risuvault/vault.db` exist
- Passphrase known (user copies from Bitwarden `RisuFile` collection)

## Steps
1. Confirm the source file path and project name.
2. Ask for the passphrase. Accept `RISUVAULT_PASSPHRASE` env var if set.
3. Run: `RISUVAULT_PASSPHRASE=<pw> risuvault add <file> --name <name> --json`
4. Report the returned `uuid` and `kind`.
5. After `add`, `project_work/<name>/` already has the plaintext files — no extra unlock needed. The user can start editing immediately.
6. **Before committing, run `risuvault verify`** (exit 0 required). Fix any violations first.
7. Remind the user to commit with a **neutral message** (no project/character names): `git add . && git commit -m "add 1 project" && git push`.

## If AI hits limits (human fallback)
User can do the same with the CLI directly:
```
set RISUVAULT_PASSPHRASE=<pw>
risuvault add inbox\alice.charx --name alice
```

## Error cases
- Exit 1 (`no .risuvault found`): run `risuvault init` first
- Exit 3 (`authentication failed`): wrong passphrase
- `project name "X" already exists`: use a different name
