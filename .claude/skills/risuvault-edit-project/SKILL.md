---
name: risuvault-edit-project
description: Use when the user wants to edit a registered vault project — modify files in project_work/, sync to git, optionally build back to RisuAI format
---

# Edit a Vault Project

## When to use
- User wants to modify an existing bot/module/preset in the vault
- User wants to build an edited project to an importable artifact

## Version rules (important)
- Every `build` increments the current version in the DB (minor by default: 1.0 → 1.1 → 1.2, `--major` or `--version X.Y` to override).
- **Bots** — `character_version` auto-updated inside the card data.
- **Modules** — a `[v1.2]` marker is appended to the module `description` (visible in RisuAI's module description area; idempotent across rebuilds).
- **Presets** — a `[v1.2]` marker is appended to the preset `name` (visible in RisuAI's preset list; idempotent).
- **Filename is stable**: hashed `<64hex>.enc` — no version in filename. git history + DB `build_history` track per-version SHAs.

## Importing to RisuAI
- After build, plaintext copy is in `outbox/<name>.<ext>` — import this into RisuAI directly.

## Steps
1. `risuvault list --json` — locate the project.
2. Ask for passphrase.
3. Edit files in `project_work/<name>/` directly (card JSON, lorebook entries, regex, CSS, CBS/lua, prompt templates, etc.).
   - If `project_work/<name>/` is missing (e.g. after a fresh clone or wipe), run `risuvault pull <name>` first.
4. When done editing:
   - Build new versioned artifact: `risuvault build <name>` (or `--major` / `--version X.Y`)
   - Artifact encrypted at `project_git/<uuid>/<hashedName>.enc`. Plaintext copy placed in `outbox/<name>.<ext>`.
5. `risuvault sync <name>` — re-encrypts all work files to `project_git/`, stages for commit.
6. To import into RisuAI: use `outbox/<name>.<ext>` directly.
7. **Before commit: run `risuvault verify`** (exit 0 required; fix any violations first).
8. Commit with a **neutral message** (no project/character/asset names): `git add . && git commit -m "edit 1 project"`.

## If a teammate pushed changes to project_git/ on the remote
After `git pull`, run `risuvault pull <name>` (or `risuvault pull --all`) so your local `project_work/` reflects their changes.

## Important rules
- NEVER commit `project_work/`. It is `.gitignore`'d — plaintext files must never enter git.
- `project_work/<name>/` is persistent and disposable: you can always recreate it with `risuvault pull <name>`.
- Assets live outside the vault. Pair them separately if needed.

## If AI hits limits (human fallback)
Use CLI directly. `project_work/<name>/` is always accessible plaintext.

## Error cases
- `project_work/<name>/ missing; run 'risuvault pull' first` — work dir was wiped; run pull
- `cannot bump version "v1-beta"` — use `--version X.Y`
- Exit 3: wrong passphrase
