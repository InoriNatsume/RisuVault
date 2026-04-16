---
name: risu-preset-workspace
description: Use when editing a preset workspace inside project_work/<name>/ — describes prompt-template/regex layout for risup/risupreset presets
---

## Before editing: read vault-wide reference docs

If `global_refs/ref_work/` contains any `.md` files, read them all first. They define
editing rules that apply across the entire vault (character voice constraints, tone
guidelines, canon boundaries, NSFW policy, etc.).

If `global_refs/ref_work/` is missing or empty after a fresh clone, run:
`risuvault refs-pull`

# Workspace Risu Preset Skill

This file is a **workspace-only skill** for an unpacked RisuAI preset workspace in RisuVault.
Use it for preset-specific editing rules inside `project_work/<name>/`.
It is not a skill for changing the RisuVault repository itself.

## Main editable areas

- `src/prompt-template/`
- `src/regex/`
- `src/main-prompt.md`
- `src/jailbreak.md`
- `src/global-note.md`
- `src/*.txt`

## Files that need extra care

- `src/prompt-template.meta.json`
- `src/regex.meta.json`
- Edit prompt text under `src/` and prompt template files under `src/prompt-template/`.
- Edit regex entries under `src/regex/`.

## Note

- This skill is **for unpacked workspaces only**.
- Do not confuse it with the `AGENTS.md` or `.agents/skills` files used by the `risu-workspace-tools` repository itself.
