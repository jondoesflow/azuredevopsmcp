# Pull Request Guidelines

## PR content

- Clear problem statement and intended outcome.
- Summary of files/modules touched.
- Risks/assumptions and rollback note if relevant.
- Validation performed (commands + manual checks).

## PR checklist

- [ ] Branch is scoped to one logical change.
- [ ] Commit messages follow conventional commits.
- [ ] `npm run build` passes.
- [ ] `npm run lint` run when needed for changed surface.
- [ ] Docs and `.env.example` updated for config changes.
- [ ] No secrets or environment-specific sensitive values committed.
