# RisuVault Project Guidance

Project-scoped rules for AI agents working inside this repository.
Loaded automatically by Claude Code when opened. Clone carries this file.

## Assets are always excluded

RisuAI asset binaries (images, audio, etc.) must never enter the vault.

- Applies to every operation: `add`, `unlock`, `lock`, `build`, `export`, `migrate`.
- The code already excludes `assets/` directories in `walkFiles`. Do not add code paths that bypass this.
- **Why**: assets are tens-to-hundreds of megabytes and blow up a public git repo. The threat model protects text/code only.
- **When the user asks for asset handling**: treat it as a Phase 2 request, not as "fix this bug". Confirm scope before wiring assets into any flow.

## Filename privacy

Everything under `projects/<uuid>/` must be `<HMAC-SHA256-hex>.enc`, flat, no subdirectories.

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
1. Every file under `projects/<uuid>/` matches `<64-hex>.enc` (no plaintext filename leaks).
2. Every DB-mapped encrypted file actually decrypts (real ciphertext, not accidentally plaintext).
3. `vault.db` is not a plaintext SQLite file (header sniff).
4. `.risuvault/cache/` is empty (no forgotten unlocked workspace).
5. `.gitignore` contains the required rules (`inbox/*`, `outbox/*`, `.risuvault/cache/`, `/dist/`).
6. No stray project directory on disk that the DB doesn't know about.

On top of that, still verify manually:
- Commit message has no project/character/asset names.

## Common violations and fixes

| Violation | Fix |
|-----------|-----|
| `file '<name>' does not match <64hex>.enc` | The vault has stale files from before the hash migration. Run `risuvault migrate`. |
| `cache/ contains N entries` | A project is still unlocked. Run `risuvault lock --all` (or lock each project). |
| `.gitignore missing required rule` | Restore the missing pattern. Default `.gitignore` comes from `risuvault init`. |
| `projects/<uuid>: directory missing` | DB references a project whose files were deleted. Investigate before committing. |

## Skill location reminder

Skills for this project live at `.claude/skills/` inside the repo. Do not write RisuVault-specific skills or memories to `~/.claude/`. Anything project-scoped must travel with the clone.
