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

## Before pushing

Run this mental checklist:
1. Staged tree: does any filename mention a project/character/asset label? If yes, fix before committing.
2. Commit message: any project name leaked? If yes, rewrite.
3. `.gitignore` covers: `projects/*/assets/`, `.risuvault/cache/`, `inbox/*` (except README), `outbox/*` (except README), root `/dist/`.

## Skill location reminder

Skills for this project live at `.claude/skills/` inside the repo. Do not write RisuVault-specific skills or memories to `~/.claude/`. Anything project-scoped must travel with the clone.
