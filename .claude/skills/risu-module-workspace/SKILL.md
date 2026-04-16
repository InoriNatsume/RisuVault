---
name: risu-module-workspace
description: Use when editing a module workspace inside project_work/<name>/ — describes lorebook/regex/trigger layout for risum modules
---

# Workspace Risu Module Skill

This file is a **workspace-only skill** for an unpacked RisuAI module workspace in RisuVault.
Use it for module-specific editing rules inside `project_work/<name>/`.
It is not a skill for changing the RisuVault repository itself.

## Main editable areas

- `src/lorebook/`
- `src/regex/`
- `src/trigger.lua`
- `src/trigger.json`
- `assets/`

## Files that need extra care

- `src/trigger.unsupported.txt` is a notice file, not a normal editable trigger source.
- `src/*.meta.json` stores source ordering and mapping metadata.
- Edit only the trigger source files that actually exist in the workspace.
- Touch `assets/` only when asset changes are actually needed.

## Note

- This skill is **for unpacked workspaces only**.
- Do not confuse it with the `AGENTS.md` or `.agents/skills` files used by the `risu-workspace-tools` repository itself.
