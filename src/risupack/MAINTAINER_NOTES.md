# RisuPack Vendored Source — Maintainer Notes

This directory contains the vendored source of RisuPack (formerly a git dependency).
Do not edit these files directly; treat them as read-only upstream code.
If upstream changes are needed, update the source files here and document the delta.

## Invariants

Rules from the original RisuPack AGENTS.md that must not be violated:

- Keep compatibility for bot (`.charx`, `.png`, `.jpg`/`.jpeg`), `.risum`, `.risup`, and `.risupreset`.
- Prefer repository-local TypeScript implementations over vendored upstream runtime code.
- Preserve existing input validation and path traversal protections.
- `rpack` and container codecs live in `src/formats/` as repository-local TypeScript code.

## Internal structure

Summarized from RisuPack's `docs/project-structure.md`:

### Entry points

- `src/cli/main.ts` — argument-based CLI
- `src/cli/interactive.ts` — interactive CLI
- Both call `src/app/commands.ts`

### Source layout

```
src/
├─ app/
│  ├─ commands.ts       — shared command flow and output shapes
│  └─ presenters.ts
├─ cli/
│  ├─ interactive.ts    — interactive CLI input handling
│  ├─ main.ts           — argument CLI input handling
│  └─ support.ts
├─ core/
│  ├─ asset-reconcile.ts
│  ├─ assets.ts
│  ├─ detect.ts         — format detection
│  ├─ input-validation.ts
│  ├─ inspect.ts
│  ├─ json-files.ts
│  ├─ object-utils.ts
│  ├─ path-utils.ts     — safe path handling / traversal protection
│  ├─ project-meta.ts
│  ├─ project-paths.ts
│  ├─ routing.ts
│  ├─ source-meta.ts
│  ├─ source-refs.ts
│  ├─ version.ts
│  ├─ workspace-files.ts
│  └─ workspace-naming.ts
├─ formats/
│  ├─ bot/              — bot container and editable source handling
│  ├─ rpack.ts          — shared RPack codec for .risum and .risup
│  ├─ risum/            — module container and lorebook/regex/trigger sources
│  └─ risup/            — preset container and prompt-template/regex sources
└─ types/               — shared TypeScript types
```

### Responsibility split

| Layer | Responsibility |
|---|---|
| `src/app/` | Common command flow and output format |
| `src/cli/` | CLI input parsing and console-only helpers |
| `src/core/` | Format detection, input validation, safe path handling, workspace helpers |
| `src/formats/rpack.ts` | Shared RPack codec for .risum and .risup |
| `src/formats/bot/` | Bot container and editable source |
| `src/formats/risum/` | Module container and lorebook/regex/trigger sources |
| `src/formats/risup/` | Preset container and prompt-template/regex sources |
| `src/types/` | Common TypeScript types |
