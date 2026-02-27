# Contributing

Thanks for contributing to this project.

## Workflow

- Create a focused branch: `feature/*`, `fix/*`, `docs/*`, `refactor/*`, `test/*`, `chore/*`.
- Keep changes scoped to one logical outcome.
- Open a pull request with clear summary and validation notes.

## Commit convention

Use conventional commits:

```text
<type>: <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

## Local validation

Run before PR when applicable:

```bash
npm run lint
npm run build
```

## Security and configuration

- Never commit secrets or `.env`.
- Update `.env.example` and docs when adding/changing environment variables.
- Follow `windsurfrules.md` for runtime, auth, and Dataverse constraints.

## Review standards

- Code review checklist: `docs/engineering/code-review-guidelines.md`
- PR checklist: `docs/engineering/pull-request-guidelines.md`
