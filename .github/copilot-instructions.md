# Copilot Workspace Instructions

## Test Retry Guardrail

When fixing failing tests, avoid long retry loops on a tiny failing set.

- If the same small set of tests (about 1 to 3 tests) still fails after 2 focused fix attempts, stop further retries.
- At that point, provide a short blocker summary, likely root cause, and 1 to 3 concrete next options.
- Do not continue additional fix loops unless the user explicitly asks to keep trying.
- Prefer shipping partial progress with clear status over repeated speculative tweaks.

## Scope

- This guardrail applies to this workspace.
- It is meant to reduce time spent on low-yield test iteration loops.
