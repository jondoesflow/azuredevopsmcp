# Dataverse Security Hardening Checklist

Use this checklist to validate that Dataverse (not UI routing) is enforcing security for the transport portal.

## 1) Entra App Registration (SPA)

- Keep app **single-tenant** unless cross-tenant is explicitly required.
- Keep redirect URIs minimal and exact-match only.
- Use delegated permission only: `user_impersonation` for Dataverse.
- Do not add unnecessary Graph or downstream API scopes.
- Require MFA/Conditional Access per organization policy.

## 2) Token Handling in SPA

- Use browser `sessionStorage` for MSAL token cache (implemented).
- Treat any XSS as token-compromise risk.
- Maintain strict dependency patching and linting for XSS-prone patterns.

## 3) Dataverse Role Enforcement (Authoritative Control)

Validate these roles in Dataverse security role designer:

- Passenger
- HR Personnel
- Booking Officer
- Authoriser
- System Administrator

For each role, verify table-level privileges for:

- `cap_paxdetails`
- `cap_groups`
- `cap_authorisations`
- lookup tables (`cap_airports`, `cap_countries`, `cap_purposeoftravels`, etc.)

Prefer least privilege:

- Passengers: create/read/update own requests only where required.
- HR: create/update for delegated workflow only.
- Authoriser: read queued requests + create/update authorisations + status transitions.
- Booking Officer: queue actions only required for booking-office function.
- Admin: full access.

## 4) Field/Column Hardening

For sensitive columns (contact info, passport/visa fields, medical notes), verify whether:

- field security profiles are needed,
- audit logging is enabled,
- update rights are limited by role.

## 5) Saved Views Are Not Security Boundaries

- Dataverse saved views in `.env` are UX filters only.
- Confirm users cannot read out-of-scope rows via direct Web API calls.
- Enforcement must come from Dataverse permissions and ownership/business-unit scope.

## 6) Verification Matrix (Run per persona)

For each persona account, test all expected and forbidden actions:

- Sign in and acquire Dataverse token.
- Access allowed routes in UI.
- Attempt forbidden routes (expect redirect/deny).
- Attempt forbidden Dataverse API actions via browser console/network replay (expect `403`).
- Verify authorisation and status transitions only succeed for intended roles.

## 7) Operational Monitoring

- Enable Dataverse auditing for key tables/columns.
- Monitor repeated authorization failures and unusual read patterns.
- Review role assignments and app registration permissions periodically.
