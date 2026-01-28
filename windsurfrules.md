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

**Core configuration:**
- `VITE_DATAVERSE_URL`
  - Example: `https://<org>.crm11.dynamics.com`
- `VITE_DATAVERSE_SOLUTION_PREFIX`
  - The publisher prefix for all custom entities and columns (e.g., `jdr_`).
  - This prefix is prepended to entity set names and column names via helper functions.
- `VITE_DATAVERSE_ENTITY_SET`
  - Entity set name **without prefix** (e.g., `paxdetailses`).
  - The full entity set name is constructed as `{prefix}{entitySet}` (e.g., `jdr_paxdetailses`).
- `VITE_DATAVERSE_ENTITY_SET_GROUP`
  - Entity set name for passenger groups **without prefix** (e.g., `paxgroups`).
  - Used for multi-passenger submissions where passengers are linked to a group.

**Choice/OptionSet mapping** (required when those fields are Choice):
- `VITE_DOCUMENT_TYPE_MAP_JSON`
  - JSON mapping of label -> numeric value.
  - Example: `{"Passport":833040000,"Warrant Card":833040001,"ID Card":833040002}`
- `VITE_TRANSPORT_REQUEST_STATUS_JSON`
  - JSON mapping of label -> numeric value.
  - Example: `{"Approved":833040000,"Rejected":833040001,"In Progress":833040002,"Cancelled":833040003,"Submitted":833040004}`

**Mocking:**
- `VITE_USE_MOCK`
  - When `true`, Dataverse calls are bypassed and data is stored in `localStorage`.

### 5.1.1 Dynamic column/entity prefixing

- Use `getPrefixedEntitySet(entitySet)` from `src/config.ts` to get the full entity set name.
- Use `getPrefixedColumn(columnName)` from `src/config.ts` to get the full column name.
- Never hardcode the prefix in column references; always use the helper functions.

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

### 6.1 Role-based routing

The "Start Now" button routes users based on their role:
- **Booking Officer** → `/booking-queue` (view all in-progress requests and groups)
- **HR Personnel** → `/hr-request` (create requests for 1 or multiple passengers)
- **Passenger** → `/request` (create a single passenger request)

### 6.2 Multi-passenger groups (HR Personnel flow)

When HR Personnel creates requests for multiple passengers (2-10):
1. A `jdr_paxgroups` record is created first with:
   - `jdr_name`: Lead passenger name + count (e.g., "John Smith +2")
   - `jdr_passengercount`: Total number of passengers
2. Each `jdr_paxdetailses` record is then created with:
   - `jdr_group@odata.bind`: Lookup reference to the group record
3. The first passenger in the form is marked as "Lead passenger" and their name is used for the group name.

### 6.3 Security role environment variables

- `VITE_PERSONA_BOOKING_OFFICER_SECURITY_ROLE_ID`
- `VITE_PERSONA_PASSENGER_SECURITY_ROLE_ID`
- `VITE_PERSONA_HRPERSONNEL_SECURITY_ROLE_ID`
- `VITE_SYSTEM_ADMINISTRATOR_SECURITY_ROLE_ID`

### 6.4 Dataverse View GUIDs

Instead of hardcoding column selections, use saved Dataverse views:

- `VITE_DATAVERSE_VIEW_GUID_REJECTED_PASSENGER_BOOKINGS` - Rejected bookings (Booking Officers, HR, Admin)
- `VITE_DATAVERSE_VIEW_GUID_MY_PASSENGER_BOOKINGS` - Logged-in user's own bookings (My Requests page)
- `VITE_DATAVERSE_VIEW_GUID_QUEDED_PASSENGER_BOOKINGS` - Solo passengers with Submitted/In Progress status (Booking Queue - Requests tab)
- `VITE_DATAVERSE_VIEW_GUID_GROUPED_QUEDED_PASSENGER_BOOKINGS` - Grouped passengers with Submitted/In Progress status (Booking Queue - Groups tab)

Query views using the `savedQuery` parameter:
```
GET /api/data/v9.2/{entitySet}?savedQuery={view-guid}
```

### 6.5 Submission reference display

After successful submission:
1. Fetch the created record to retrieve the auto-generated `jdr_name` field
2. Display the reference(s) in a GOV.UK confirmation panel
3. For group bookings, also display the group name (`jdr_groupname`)
4. Include warning text: "Please make a note of these references for all future correspondence"

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
