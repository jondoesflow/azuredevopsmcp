# BDD and Testing Instructions

Use this for quality validation planning and test updates.

## Testing policy

- Start with the most specific verification for changed behavior.
- Expand to broader validation only as needed.
- Avoid changing unrelated code to satisfy tests.

## For this repository

- Use `npm run build` as baseline compile validation.
- Use `npm run lint` when touching multiple modules.
- For auth/Dataverse changes, include manual verification notes (sign-in, token acquisition, data operations).

## Scenario guidance

- Happy path: user signs in and performs role-appropriate action.
- Error path: invalid config or permission denial yields actionable message.
- Regression path: existing role routes and page access still work.
