# Code Review Guidelines

## Severity taxonomy

- **Blocking**: Correctness, security, or policy issues that must be fixed before merge.
- **Recommended**: Improves maintainability/readability; not required to merge.
- **Nit**: Minor suggestion, optional.

## Code review checklist

- Change is scoped and does not include unrelated refactors.
- Behavior is preserved unless change request explicitly requires otherwise.
- Security/auth/config handling follows `windsurfrules.md`.
- Error handling is actionable and non-sensitive.
- Validation evidence is provided (`npm run build`, and `npm run lint` where applicable).
- Documentation was updated when behavior/config changed.

## References

- Workflow and policy SSOT: `.github/copilot-instructions.md`
- Runtime/security rules: `windsurfrules.md`
