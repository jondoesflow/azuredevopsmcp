# Frontend Instructions

Use this for all changes under `src/` and SPA behavior.

## Core stack

- React + TypeScript + Vite.
- GOV.UK frontend patterns remain primary for UX.
- Keep accessibility and semantics intact.

## Implementation rules

- Prefer minimal, targeted changes over broad rewrites.
- Preserve existing route behavior and role-based flow.
- Keep auth token handling centralized and consistent with existing patterns.
- Reuse helpers in `src/config.ts` for Dataverse URLs, prefixes, and scopes.

## Validation

- Run `npm run build` after significant frontend changes.
- Run `npm run lint` when touching multiple UI files.
- Manually verify impacted flows (sign-in, request submission, queue views).

## References

- Runtime/build rules: `windsurfrules.md`
- Copilot SSOT: `../copilot-instructions.md`
