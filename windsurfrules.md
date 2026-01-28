# windsurfrules.md

This file is the authoritative build/run/integration rules for this repository. When making changes, always conform to (and update) the rules below.

## 1) Project overview

- App type: Single Page Application (SPA)
- Stack: React + TypeScript + Vite
- UI: GOV.UK Frontend (govuk-frontend) with Tailwind used for utility styling where appropriate
- Auth: Microsoft Entra ID (Azure AD) via MSAL (msal-browser + msal-react)
- Data: Microsoft Dataverse Web API (OData v4)

## 2) Non-negotiable standards

- **No secrets in git**
  - Never commit `.env`.
  - Secrets must live in environment variables and/or secret stores (per environment).
- **Accessibility is a feature**
  - Default to GOV.UK patterns/components.
  - Meet WCAG 2.2 AA expectations.
- **Security**
  - Use Entra ID tokens for Dataverse access.
  - Never hardcode tenant IDs, client IDs, Dataverse URLs, or role IDs in code beyond safe defaults.

## 3) GOV.UK Design System (GDS) requirements

- Use GOV.UK Frontend components and styles as the primary design language.
  - CSS is imported from `govuk-frontend/dist/govuk/govuk-frontend.min.css`.
  - JS initialisation must remain enabled (`initAll()` is called during bootstrap).
- Keep GOV.UK markup semantics intact:
  - Ensure proper heading hierarchy.
  - Use correct form field patterns (labels, hints, error messages).
  - Use accessible button/link semantics.
- Don’t “fight” GOV.UK Frontend:
  - Prefer GOV.UK component classes over ad-hoc styling.
  - Use Tailwind only for layout/spacing tweaks where GOV.UK doesn’t offer an equivalent pattern.

## 4) Entra ID / MSAL rules

### 4.1 Environment variables

Required (for real Dataverse mode):
- `VITE_AAD_CLIENT_ID`
- `VITE_AAD_TENANT_ID`

Optional:
- `VITE_AAD_REDIRECT_URI` (defaults to `window.location.origin`)

### 4.2 MSAL behavior

- The app uses `PublicClientApplication` configured with:
  - `authority = https://login.microsoftonline.com/{tenantId}`
  - `cacheLocation = localStorage`
- Redirect flow is handled via `handleRedirectPromise()` at bootstrap.
- When adding new auth flows:
  - Prefer MSAL idioms (`acquireTokenSilent` then fallback to redirect/popup when required).
  - Keep token acquisition centralized; do not scatter token logic in random components.

### 4.3 Redirect URIs

- Local dev is expected to run at `http://localhost:5173`.
- Any deployed domain must be added to the app registration redirect URIs.

## 5) Dataverse connectivity rules

### 5.1 Dataverse environment variables

- `VITE_DATAVERSE_URL`
  - Example: `https://<org>.crm11.dynamics.com`
- `VITE_DATAVERSE_ENTITY_SET`
  - Entity set name for Web API routes. This is often pluralized; verify using metadata if 404s occur.

Choice/OptionSet mapping (required when those fields are Choice):
- `VITE_DOCUMENT_TYPE_MAP_JSON`
  - JSON mapping of label -> numeric value.
- `VITE_TRANSPORT_REQUEST_STATUS_JSON`
  - JSON mapping of label -> numeric value.

Mocking:
- `VITE_USE_MOCK`
  - When `true`, Dataverse calls are bypassed and data is stored in `localStorage`.

### 5.2 Web API conventions

- Use OData v9.2 endpoints: `{DATAVERSE_URL}/api/data/v9.2/...`
- Always include headers:
  - `Authorization: Bearer <token>`
  - `Accept: application/json`
  - `OData-MaxVersion: 4.0`
  - `OData-Version: 4.0`
- For updates (PATCH), include `If-Match` with the record’s ETag when available (optimistic concurrency).

### 5.3 Entity set and primary id assumptions

- The code infers a primary id field from the entity set name (best-effort pluralization handling).
- If you introduce new tables/entity sets:
  - Prefer to use `@odata.id` when available.
  - Validate the inferred id field behavior, or improve it in a centralized way.

### 5.4 Error handling expectations

- Dataverse responses must be JSON.
  - A non-JSON response is treated as likely auth redirect or HTML error.
- Provide actionable errors:
  - 404 should mention entity set name verification.
  - 403 should mention Dataverse role/permission issues.
  - 412 should mention concurrency/refresh.

## 6) Dataverse security model / roles

- The UI uses role-based gating.
- The app queries user roles via the standard relationship:
  - `systemuserroles_association`
- Do not assume the presence of roles across environments.
  - Role IDs and/or expected role names must be configurable.

## 7) Build & run rules

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

Rules:
- Keep Vite as the build tool unless explicitly migrating.
- Keep TypeScript project references intact (`tsc -b`).

## 8) Configuration and secrets handling

- `.env.example` must be kept up to date whenever configuration changes.
- `.env` is local-only and must remain ignored.
- Never log access tokens to the console.

## 9) Testing / quality gates (minimum)

- Any change that affects Dataverse payload shapes must be tested against:
  - `VITE_USE_MOCK=true` (local fast loop)
  - a real Dataverse environment (permissions + entity set correctness)
- Any UI change must be checked for:
  - keyboard navigation
  - focus management
  - readable error states

## 10) PR / change discipline

- Prefer small PRs.
- If you add a new environment variable:
  - add it to `src/config.ts` in `env`
  - add it to `.env.example`
  - update this `windsurfrules.md`
