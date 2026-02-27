# flightbooking Transport Portal

A React-based passenger transport booking portal that integrates with Microsoft Dataverse for data storage and Microsoft Entra ID (Azure AD) for authentication. This application enables passengers to submit transport requests, HR personnel to create bookings on behalf of others, and booking officers to manage and approve requests.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Azure AD / Entra ID Configuration](#azure-ad--entra-id-configuration)
- [Dataverse Configuration](#dataverse-configuration)
- [User Roles & Permissions](#user-roles--permissions)
- [Application Routes](#application-routes)
- [Contributing & Standards](#contributing--standards)
- [Development](#development)

---

## Overview

The flightbooking Transport Portal is a single-page application (SPA) designed for managing passenger transport requests within an organization. It provides role-based access control with four distinct user personas:

1. **Passengers** - Can submit their own transport requests and view their booking history
2. **HR Personnel** - Can create transport requests on behalf of other employees, including multi-passenger group bookings
3. **Booking Officers** - Can view and edit approved transport requests, any edit, the booking officer can determine whether to change the requests status back to pending approval.  If that happens the transport requests goes back to the authoriser who previously authorised it.
4. **Authorisers** - Can view, approve or reject transport requests in a queue-based workflow.
5. **System Administrators** - Have full access to all features

---

## Features

### Passenger Features
- Submit individual transport requests with travel details
- View personal booking history and status
- Track request status (Submitted, In Progress, Approved, Rejected, Cancelled)

### HR Personnel Features
- Create transport requests on behalf of employees
- Multi-passenger group bookings (2-10 passengers)
- Shared travel details for group bookings (same departure/arrival locations and dates)
- Review and confirmation screen before submission
- Inline editing of booking details before final submission

### Booking Officer Features
- Queue-based view of pending transport requests
- Separate tabs for individual and grouped passenger bookings
- Approve or reject requests with status updates
- View all requests across the organization

### Administrative Features
- Full access to all booking queues
- View all requests regardless of status
- System-wide request management

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI framework |
| TypeScript | 5.9.3 | Type-safe JavaScript |
| Vite | 7.2.4 | Build tool and dev server |
| React Router DOM | 7.13.0 | Client-side routing |
| TailwindCSS | 4.1.18 | Utility-first CSS framework |
| GOV.UK Frontend | 5.14.0 | UK Government Design System components |
| Lucide React | 0.563.0 | Icon library |

### Authentication & Authorization
| Technology | Purpose |
|------------|---------|
| @azure/msal-browser | 5.0.2 | Microsoft Authentication Library for browser |
| @azure/msal-react | 5.0.2 | React bindings for MSAL |
| Microsoft Entra ID | Identity provider (Azure AD) |
| Dataverse Security Roles | Role-based access control |

### Backend / Data
| Technology | Purpose |
|------------|---------|
| Microsoft Dataverse | Cloud-based data platform |
| Dataverse Web API | OData v4 REST API for CRUD operations |

### Development Tools
| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| PostCSS | CSS processing |
| Autoprefixer | CSS vendor prefixing |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React SPA (Vite)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Views      │  │   Router     │  │   UI Components      │  │
│  │  - Landing   │  │  - Guards    │  │  - AppShell          │  │
│  │  - Request   │  │  - Routes    │  │  - GOV.UK Styles     │  │
│  │  - MyRequests│  │              │  │                      │  │
│  │  - HR Pages  │  │              │  │                      │  │
│  │  - Admin     │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌────────────────────────────────┐  │
│  │   Auth (MSAL)        │  │   Authz (Role-based)           │  │
│  │  - Login/Logout      │  │  - Security Role Mapping       │  │
│  │  - Token Management  │  │  - Permission Checks           │  │
│  └──────────────────────┘  └────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Dataverse Client                             │  │
│  │  - createPassengerRequest()                               │  │
│  │  - createPaxGroup()                                       │  │
│  │  - listMyPassengerRequests()                              │  │
│  │  - listPassengerRequestsByView()                          │  │
│  │  - updatePassengerRequestStatus()                         │  │
│  │  - whoAmI() / getUserRoles()                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / OData v4
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Microsoft Dataverse                          │
├─────────────────────────────────────────────────────────────────┤
│  Tables:                                                        │
│  - jdr_paxdetails (Passenger booking records)                   │
│  - jdr_paxgroups (Group booking records)                        │
│                                                                 │
│  Security Roles:                                                │
│  - Passenger                                                    │
│  - Booking Officer                                              │
│  - HR Personnel                                                 │
│  - System Administrator                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ OAuth 2.0
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Microsoft Entra ID (Azure AD)                  │
│  - App Registration (SPA)                                       │
│  - User Authentication                                          │
│  - Token Issuance                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Microsoft Entra ID (Azure AD) tenant
- Microsoft Dataverse environment
- Dataverse tables configured (see [Dataverse Configuration](#dataverse-configuration))

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd flightbooking-transport-portal
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in all required values (see [Environment Variables](#environment-variables))

4. **Start the development server:**
   ```bash
   npm run dev:clean
   ```

5. **Open in browser:**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### External Onboarding API (Path B)

For external users, Contact creation can be handled by a backend API (app-only Dataverse access) instead of browser delegated tokens.

1. Configure backend env values in `.env`:
   - `EXTERNAL_ONBOARDING_DATAVERSE_URL`
   - `EXTERNAL_ONBOARDING_TENANT_ID`
   - `EXTERNAL_ONBOARDING_CLIENT_ID`
   - `EXTERNAL_ONBOARDING_CLIENT_SECRET`
   - `EXTERNAL_ONBOARDING_SOLUTION_PREFIX`
2. Start the API:
   ```bash
   npm run api:external-onboarding:clean
   ```
3. Start the frontend (Vite proxies `/api` to `http://localhost:8787` by default):
   ```bash
   npm run dev:clean
   ```

### Port cleanup scripts (Windows)

If previous Node sessions leave ports occupied, use these convenience scripts:

- `npm run port:clear:dev` clears port `5173`
- `npm run port:clear:api` clears port `8787`
- `npm run dev:clean` clears `5173` then starts Vite
- `npm run api:external-onboarding:clean` clears `8787` then starts the onboarding API
- `npm run start:clean` starts both services (API + frontend) with cleanup

---

## Environment Variables

All environment variables are prefixed with `VITE_` to be accessible in the browser.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_AAD_CLIENT_ID` | Azure AD App Registration Client ID | `12345678-1234-1234-1234-123456789012` |
| `VITE_AAD_TENANT_ID` | Azure AD Tenant ID | `12345678-1234-1234-1234-123456789012` |
| `VITE_DATAVERSE_URL` | Dataverse environment URL | `https://org48ab23b4.crm11.dynamics.com` |
| `VITE_DOCUMENT_TYPE_MAP_JSON` | JSON mapping of document type labels to Dataverse Choice values | `{"Passport":833040000,"Warrant Card":833040001}` |
| `VITE_TRANSPORT_REQUEST_STATUS_JSON` | JSON mapping of status labels to Dataverse Choice values | `{"Submitted":833040004,"Approved":833040000}` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_AAD_REDIRECT_URI` | OAuth redirect URI | `window.location.origin` |
| `VITE_DATAVERSE_SOLUTION_PREFIX` | Solution prefix for entities/columns | `jdr_` |
| `VITE_DATAVERSE_ENTITY_SET` | Entity set name for passenger details | `paxdetailses` |
| `VITE_DATAVERSE_ENTITY_SET_GROUP` | Entity set name for passenger groups | `paxgroups` |
| `VITE_USE_MOCK` | Use localStorage mock instead of Dataverse | `false` |

### Security Role IDs

| Variable | Description |
|----------|-------------|
| `VITE_PERSONA_BOOKING_OFFICER_SECURITY_ROLE_ID` | Dataverse security role ID for Booking Officers |
| `VITE_PERSONA_PASSENGER_SECURITY_ROLE_ID` | Dataverse security role ID for Passengers |
| `VITE_PERSONA_HRPERSONNEL_SECURITY_ROLE_ID` | Dataverse security role ID for HR Personnel |
| `VITE_SYSTEM_ADMINISTRATOR_SECURITY_ROLE_ID` | Dataverse security role ID for System Administrators |

### Dataverse View GUIDs

| Variable | Description |
|----------|-------------|
| `VITE_DATAVERSE_VIEW_GUID_MY_PASSENGER_BOOKINGS` | View GUID for "My Bookings" page |
| `VITE_DATAVERSE_VIEW_GUID_REJECTED_PASSENGER_BOOKINGS` | View GUID for rejected bookings |
| `VITE_DATAVERSE_VIEW_GUID_QUEDED_PASSENGER_BOOKINGS` | View GUID for queued individual bookings |
| `VITE_DATAVERSE_VIEW_GUID_GROUPED_QUEDED_PASSENGER_BOOKINGS` | View GUID for queued group bookings |

---

## Azure AD / Entra ID Configuration

### App Registration Setup

1. **Create App Registration:**
   - Go to Azure Portal → Microsoft Entra ID → App registrations
   - Click "New registration"
   - Name: `flightbooking Transport Portal`
   - Supported account types: Single tenant (or as needed)
   - Redirect URI: Leave blank for now

2. **Configure Platform:**
   - Go to Authentication → Add a platform → Single-page application
   - Redirect URIs:
     - `http://localhost:5173` (development)
     - `https://your-production-url.com` (production)
   - Enable: Access tokens, ID tokens

3. **API Permissions:**
   - Add permission → APIs my organization uses → Dataverse
   - Delegated permissions: `user_impersonation`
   - Grant admin consent

4. **Note the IDs:**
   - Application (client) ID → `VITE_AAD_CLIENT_ID`
   - Directory (tenant) ID → `VITE_AAD_TENANT_ID`

---

## Dataverse Configuration

### Required Tables

#### 1. Passenger Details Table (`jdr_paxdetails`)

| Column Schema Name | Display Name | Type | Notes |
|--------------------|--------------|------|-------|
| `jdr_paxdetailsid` | ID | Primary Key | Auto-generated |
| `jdr_name` | Reference Name | Text | Auto-number reference |
| `jdr_surname` | Surname | Text | Required |
| `jdr_forenames` | Forenames | Text | Required |
| `jdr_documenttype` | Document Type | Choice | Passport, Warrant Card, ID Card |
| `jdr_documentnumber` | Document Number | Text | Required |
| `jdr_departingon` | Departing On | DateTime | Required |
| `jdr_returningon` | Returning On | DateTime | Required |
| `jdr_departingfrom` | Departing From | Text | IATA airport code |
| `jdr_destination` | Destination | Text | IATA airport code |
| `jdr_transportrequeststatus` | Status | Choice | Submitted, In Progress, Approved, Rejected, Cancelled |
| `jdr_Group` | Group | Lookup | References `jdr_paxgroups` |

#### 2. Passenger Groups Table (`jdr_paxgroups`)

| Column Schema Name | Display Name | Type | Notes |
|--------------------|--------------|------|-------|
| `jdr_paxgroupid` | ID | Primary Key | Auto-generated |
| `jdr_groupname` | Group Name | Text | Format: "Lead Name +N" |
| `jdr_passengercount` | Passenger Count | Whole Number | 2-10 |

### Choice/OptionSet Values

You must configure the JSON mappings in environment variables to match your Dataverse Choice values:

**Document Type Example:**
```json
{"Passport":833040000,"Warrant Card":833040001,"ID Card":833040002}
```

**Transport Request Status Example:**
```json
{"Approved":833040000,"Rejected":833040001,"In Progress":833040002,"Cancelled":833040003,"Submitted":833040004}
```

### Lookup Relationship

The `jdr_paxdetails` table has a Many-to-One relationship to `jdr_paxgroups`:
- Lookup column: `jdr_Group`
- Related table: `jdr_paxgroups`
- OData binding format: `"jdr_Group@odata.bind": "/jdr_paxgroups(GUID)"`

### Security Roles

Create the following Dataverse security roles and note their GUIDs:

| Role Name | Permissions |
|-----------|-------------|
| Passenger | Create/Read own records |
| Booking Officer | Read/Update all records, Approve/Reject |
| HR Personnel | Create records for others, Group bookings |
| System Administrator | Full access |

---

## User Roles & Permissions

| Action | Passenger | HR Personnel | Booking Officer | System Admin |
|--------|-----------|--------------|-----------------|--------------|
| Submit own request | ✅ | ✅ | ✅ | ✅ |
| View own requests | ✅ | ✅ | ✅ | ✅ |
| Create requests for others | ❌ | ✅ | ❌ | ✅ |
| Create group bookings | ❌ | ✅ | ❌ | ✅ |
| View booking queue | ❌ | ❌ | ✅ | ✅ |
| Approve/Reject requests | ❌ | ❌ | ✅ | ✅ |
| View all requests | ❌ | ❌ | ✅ | ✅ |
| Bulk add passengers | ❌ | ✅ | ❌ | ✅ |

---

## Application Routes

| Route | Component | Access | Description |
|-------|-----------|--------|-------------|
| `/` | LandingPage | All | Home page with role-based navigation |
| `/request` | PassengerRequestPage | All authenticated | Submit a transport request |
| `/my-requests` | MyRequestsPage | All authenticated | View personal booking history |
| `/hr-request` | HrRequestPage | HR Personnel, Admin | Create requests for others |
| `/bulk-add` | HrBulkAddPage | HR Personnel, Admin | Bulk passenger upload |
| `/booking-queue` | BookingOfficerQueuePage | Booking Officer, Admin | Manage pending requests |
| `/all-requests` | AllRequestsPage | Booking Officer, Admin | View all requests |
| `/admin` | AdminQueuePage | HR, Booking Officer, Admin | Administrative queue |

---

## Contributing & Standards

- Contribution guide: `CONTRIBUTING.md`
- Copilot SSOT policy: `.github/copilot-instructions.md`
- Instruction set: `.github/instructions/README.md`
- Engineering review guidance: `docs/engineering/README.md`
- Planning scaffolding: `plans/README.md`

---

## Development

### Project Structure

```
src/
├── auth/                    # MSAL authentication setup
├── authz/                   # Authorization (role-based permissions)
│   ├── AuthzProvider.tsx    # React context for authorization state
│   └── authz.ts             # Permission checking functions
├── config.ts                # Environment configuration
├── data/                    # Static data (airports, etc.)
├── dataverse/               # Dataverse API client
│   ├── dataverseClient.ts   # CRUD operations for Dataverse
│   └── types.ts             # TypeScript types for entities
├── router/                  # React Router configuration
│   └── AppRouter.tsx        # Route definitions with guards
├── types/                   # Shared TypeScript types
├── ui/                      # Reusable UI components
│   └── AppShell.tsx         # Main layout with GOV.UK header
├── views/                   # Page components
│   ├── admin/               # Admin pages
│   ├── booking/             # Booking officer pages
│   ├── hr/                  # HR personnel pages
│   ├── LandingPage.tsx      # Home page
│   ├── MyRequestsPage.tsx   # Personal bookings
│   └── PassengerRequestPage.tsx  # Submit request form
├── App.tsx                  # Root component
├── main.tsx                 # Entry point
└── index.css                # Global styles
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 5173 |
| `npm run validate:policy` | Validate Copilot standards/policy scaffolding |
| `npm run build` | Validate policy, then build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

### Mock Mode

For development without Dataverse access, set `VITE_USE_MOCK=true`. This stores all data in localStorage.

### Debugging Dataverse Issues

1. **Entity Set Names:** Dataverse entity sets are typically pluralized. Verify with:
   ```
   GET https://{org}.crm.dynamics.com/api/data/v9.2/EntityDefinitions?$select=LogicalName,EntitySetName
   ```

2. **Column Names:** Use the solution prefix configured in `VITE_DATAVERSE_SOLUTION_PREFIX`.

3. **Lookup Bindings:** Format: `"columnName@odata.bind": "/entitySet(guid)"`

4. **Choice Values:** Ensure JSON mappings match your Dataverse Choice/OptionSet values exactly.

---

## License

This project is proprietary and confidential.
