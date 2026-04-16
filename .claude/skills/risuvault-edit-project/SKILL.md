---
name: risuvault-edit-project
description: Use when the user wants to edit a registered vault project — unlock, modify, lock, optionally build back to RisuAI format
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
- **Filename is stable**: `<name>.<ext>.enc` — no version in filename. git history + DB `build_history` track per-version SHAs.

## Importing to RisuAI
- After build, plaintext copy is in `outbox/<name>.<ext>` — import this into RisuAI directly.
- Or run `risuvault export <name>` anytime to refresh outbox from the latest encrypted artifact (no unlock needed).

## Steps
1. `risuvault list --json` — locate the project.
2. Ask for passphrase.
3. `risuvault unlock <name>` — decrypts to `.risuvault/cache/<uuid>/`.
4. Edit files in the cache (card JSON, lorebook entries, regex, CSS, CBS/lua, prompt templates, etc.).
5. When done:
   - Build new versioned artifact: `risuvault build <name>` (or `--major` / `--version X.Y`).
   - Artifact encrypted at `projects/<uuid>/dist/<name>.<ext>.enc`. Plaintext copy placed in `outbox/<name>.<ext>`.
6. `risuvault lock <name>` — re-encrypts edits, removes plaintext cache.
7. To import into RisuAI: use `outbox/<name>.<ext>` directly, or run `risuvault export <name>` to re-generate it from the encrypted artifact.
8. **Before commit: run `risuvault verify`** (exit 0 required; fix any violations first).
9. Commit with a **neutral message** (no project/character/asset names): `git add . && git commit -m "edit 1 project"`.

## Important rules
- NEVER commit the plaintext cache. `.risuvault/cache/` is `.gitignore`'d.
- If `lock` fails partway, already-encrypted files are in their new state (per-file atomic rename). Re-run `lock` after fixing.
- Assets live outside the vault. Pair them separately if needed.

## If AI hits limits (human fallback)
Use CLI directly. Plaintext cache at `.risuvault/cache/<uuid>/` is accessible while unlocked.

## Error cases
- `<name> is locked; run unlock first` — build needs unlocked cache
- `cannot bump version "v1-beta"` — use `--version X.Y`
- Exit 3: wrong passphrase
