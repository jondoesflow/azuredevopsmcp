# Internal Web App (SPA + BFF)

This folder contains the Azure DevOps Backlog Assistant web application:

- `frontend/`: React + TypeScript SPA (Vite, Recharts, MSAL)
- `bff/`: Backend-for-Frontend (Express + TypeScript) that proxies to MCP

## Architecture

```text
Browser (Entra SSO) -> BFF API -> MCP Server (Azure Container App)
```

The browser never receives the MCP API key. The BFF injects it server-side.

## Key Features

| Feature | Description |
|---------|-------------|
| **Backlog Creation** | Upload documents, analyse, and generate Epic > Feature > Story > Task hierarchy |
| **Health Dashboard** | RAG distribution, confidence histograms, effort breakdown, coverage gaps |
| **Export & Reporting** | CSV export with all 22 enrichment fields, stakeholder summary |
| **Story Refinement** | AI-suggested improvements for low-confidence stories with one-click apply |
| **RRAID Log** | Extract Risks, Requirements, Assumptions, Issues, Dependencies from documents |
| **Multi-file Analysis** | Upload multiple files with role tags for cross-referenced analysis |
| **Process Validation** | Verify target project uses correct ADO process template |

## BFF API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/setup/config` | GET/POST | User connection configuration |
| `/setup/validate` | POST | Validate ADO connection |
| `/setup/check-process` | POST | Verify process template |
| `/files` | GET | List uploaded files |
| `/files/upload` | POST | Upload a file |
| `/process/document` | POST | Analyse and create backlog |
| `/dashboard/health` | GET | Backlog health metrics |
| `/export/excel` | GET | CSV export with enrichment data |
| `/export/summary` | GET | Stakeholder summary JSON |
| `/refine/suggest` | POST | Get refinement suggestions |
| `/refine/apply` | POST | Apply refinements to ADO |
| `/rraid/extract` | POST | Extract RRAID from document |
| `/rraid/create` | POST | Create RRAID items in ADO |
| `/rraid/list` | GET | List RRAID items from ADO |
| `/chat/message` | POST | Intent-based chat interface |

## Quick Start

### 1) Backend (BFF)

```powershell
npm install
npm run build
npm start
```

From: `webapp/bff`

### 2) Frontend

```powershell
npm install
npm run dev
```

From: `webapp/frontend`

## Required configuration

- BFF:
  - `MCP_BASE_URL`
  - `MCP_API_KEY`
  - `ENTRA_TENANT_ID`
  - `ENTRA_API_AUDIENCE`
  - optional `ENTRA_ALLOWED_GROUP_IDS`
- Frontend:
  - `VITE_ENTRA_CLIENT_ID`
  - `VITE_ENTRA_TENANT_ID`
  - `VITE_BFF_BASE_URL`
  - `VITE_BFF_SCOPE`

See each `.env.example` file for details.
