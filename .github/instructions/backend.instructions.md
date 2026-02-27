# Backend Instructions

Use this for changes to integration/service code.

## Scope

- Dataverse integration logic and API usage.

## Rules

- Do not hardcode secrets, tokens, or tenant-specific sensitive values.
- Keep error messages actionable and avoid leaking sensitive data.
- Follow existing logging style and avoid noisy logs in normal paths.
- Preserve API contracts and request/response shapes unless explicitly requested.

## Validation

- For app-side integration changes, run `npm run build`.

## References

- Security and Dataverse conventions: `windsurfrules.md`
- Copilot SSOT: `../copilot-instructions.md`
