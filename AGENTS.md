# AGENTS.md

## Repo status

Planning-stage repository. No application code exists yet — only the BMAD
method framework (`_bmad/`) and its OpenCode skills/commands. Do not invent
build/test/lint commands; there are none.

## Structure

- `_bmad/` — BMAD framework, installed via installer. Treat as mostly generated:
  - `_bmad/config.toml` — **installer-managed, regenerated on every install;
    never edit directly.** Overrides go in `_bmad/custom/config.toml` (team)
    or `_bmad/custom/config.user.toml` (personal).
  - `_bmad/core/`, `_bmad/bmm/` — framework internals.
- `_bmad-output/` — all BMAD artifacts (currently empty):
  - `planning-artifacts/`, `implementation-artifacts/` per bmm module config.
- `docs/` — reserved for project knowledge.
- `.opencode/commands/`, `.agents/skills/` — BMAD's OpenCode integration.

## Conventions

- Document output language for BMAD artifacts is **Russian** (set in
  `_bmad/config.toml` → `document_output_language`).

## When code starts landing here

Update this file with real entrypoints and dev/test commands. The `.gitignore`
already anticipates Node and Python — toolchain not yet decided.
