---
name: risu-bot-workspace
description: Use when editing a bot workspace inside project_work/<name>/ — describes card/pack/module layout for charx/png bots
---

# Workspace Risu Bot Skill

This file is a **workspace-only skill** for an unpacked RisuAI bot workspace in RisuVault.
Use it for bot-specific editing rules inside `project_work/<name>/`.
It is not a skill for changing the RisuVault repository itself.

## Main editable areas

- `src/card/`
- `src/module/` when an embedded `module.risum` exists
- `assets/`

## Files that need extra care

- `src/module/` exists only when the bot contains an embedded `module.risum`.
- Touch `assets/` only when asset changes are actually needed.

## Note

- This skill is **for unpacked workspaces only**.
- Do not confuse it with the `AGENTS.md` or `.agents/skills` files used by the `risu-workspace-tools` repository itself.
