# RisuVault Project Guidance

Project-scoped rules for AI agents working inside this repository.
Loaded automatically by Claude Code when opened. Clone carries this file.

## Layout

- `project_git/<uuid>/<hex>.enc` — encrypted files, committed to git. Flat layout, UUID-named dirs.
- `project_work/<name>/` — plaintext mirror, **gitignored**, persistent, disposable. Name-based for UX.
- `.risuvault/` — vault database and config only.

## Assets are always excluded

RisuAI asset binaries (images, audio, etc.) must never enter the vault.

- Applies to every operation: `add`, `pull`, `sync`, `build`, `migrate`.
- The code already excludes `assets/` directories in `walkFiles`. Do not add code paths that bypass this.
- **Why**: assets are tens-to-hundreds of megabytes and blow up a public git repo. The threat model protects text/code only.
- **When the user asks for asset handling**: treat it as a Phase 2 request, not as "fix this bug". Confirm scope before wiring assets into any flow.

## Filename privacy

Everything under `project_git/<uuid>/` must be `<HMAC-SHA256-hex>.enc`, flat, no subdirectories.

- `pack/x_meta/`, `src/card/`, `dist/` — none of these path fragments may leak into the encrypted tree.
- The hash name is `HMAC-SHA256(project.file_key, posix_relative_path).hex()`. Use `computeHashedName` from `src/core/crypto.ts`.
- Mapping lives in `project_files` table (vault.db). Anything touching encrypted files must go through the mapping.
- **Why**: filenames are plaintext in git. Paths like `Nico Robin.acting coy.webp.json.enc` leak character and asset labels.

## Commit message policy

Commit messages are plaintext in git history and cannot be redacted after push.

- **Never** put project names (bot/module/preset names) in commit messages.
- **Never** put character names or asset keywords in commit messages.
- Use neutral wording: `build project (v1.2)`, `add 1 project`, `edit 1 project`, `rotate passphrase`.
- Cross-reference via DB (`risuvault history`) when you need to know which project a commit was about.

## Passphrase

- Single source of truth: user's Bitwarden `RisuFile` collection.
- Never log, echo, or commit the passphrase.
- For automation, use `RISUVAULT_PASSPHRASE` env var.
- Losing the passphrase = vault permanently unrecoverable. Remind the user.

## Before every commit: run `risuvault verify`

**This is mandatory.** Do not commit or push without it.

```
RISUVAULT_PASSPHRASE=<pw> risuvault verify
```

Exit 0 = safe to commit. Exit 1 = violations listed, fix them first.

What it checks:
1. Every file under `project_git/<uuid>/` matches `<64-hex>.enc` (no plaintext filename leaks).
2. Every DB-mapped encrypted file actually decrypts (real ciphertext, not accidentally plaintext).
3. `vault.db` is not a plaintext SQLite file (header sniff).
4. `.gitignore` contains the required rules (`project_work/`, `inbox/*`, `outbox/*`, `/dist/`).
5. No stray project directory on disk that the DB doesn't know about.

On top of that, still verify manually:
- Commit message has no project/character/asset names.

## Common violations and fixes

| Violation | Fix |
|-----------|-----|
| `file '<name>' does not match <64hex>.enc` | The vault has stale files from before the hash migration. Run `risuvault migrate`. |
| `.gitignore missing required rule` | Restore the missing pattern. Default `.gitignore` comes from `risuvault init`. |
| `project_git/<uuid>: directory missing` | DB references a project whose files were deleted. Investigate before committing. |

## Vault-wide reference docs

`global_refs/` holds documents that apply across every project. Use it for editing
rules, tone guidelines, canon constraints — anything that belongs to the vault rather
than a specific project.

- `global_refs/ref_git/<name>.enc` — encrypted (AES-256-GCM with vault-wide refs_key), git-committed.
  **Filenames are public** (only content is encrypted) — pick filenames that don't leak
  sensitive labels.
- `global_refs/ref_work/<name>` — plaintext working copy, gitignored, disposable.
- `risuvault refs-sync` — encrypt work → git (before commit)
- `risuvault refs-pull` — decrypt git → work (after clone or wipe)
- Directory must be flat — no subdirectories in ref_git/.

Skills should reference `global_refs/ref_work/` for project-spanning editing guidance.

## Skill location reminder

Skills for this project live at `.claude/skills/` inside the repo. Do not write RisuVault-specific skills or memories to `~/.claude/`. Anything project-scoped must travel with the clone.
