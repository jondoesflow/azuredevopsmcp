# Copilot Instructions (SSOT)

This file is the single source of truth for AI-assisted workflow and quality policy in this repository.

## Scope and precedence

- Follow this file for workflow, branching, commit, and PR rules.
- Follow [windsurfrules.md](../windsurfrules.md) for build, runtime, security, Dataverse, and UI constraints.
- When rules conflict, prefer the stricter safe option and do not change working runtime behavior without explicit request.

## Project methodologies

### Branching and pull requests

- Use short-lived branches: `feature/*`, `fix/*`, `docs/*`, `refactor/*`, `test/*`, `chore/*`.
- Keep branches focused on one logical change.
- Open a PR for all non-trivial changes; keep PRs small and reviewable.
- Prefer squash merge for clean history.

### Commit conventions

Use conventional commits:

```text
<type>: <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

### Process requirements

- Do not commit secrets or `.env` values.
- Prefer minimal diffs and preserve existing behavior unless change is explicitly requested.
- Update documentation when behavior or configuration changes.
- If adding environment variables, update `.env.example` and relevant docs.

## Quality policy

- Validate with project commands when code changes are made:
  - `npm run lint`
  - `npm run build`
- For risky changes, include a short manual verification note in the PR.
- Do not add unrelated refactors while fixing a targeted issue.

## Standards references

- Frontend standards: [instructions/frontend.instructions.md](instructions/frontend.instructions.md)
- Backend/server standards: [instructions/backend.instructions.md](instructions/backend.instructions.md)
- Documentation standards: [instructions/docs.instructions.md](instructions/docs.instructions.md)
- Testing standards: [instructions/bdd-tests.instructions.md](instructions/bdd-tests.instructions.md)
- Code review checklist: [../docs/engineering/code-review-guidelines.md](../docs/engineering/code-review-guidelines.md)
- PR checklist: [../docs/engineering/pull-request-guidelines.md](../docs/engineering/pull-request-guidelines.md)
