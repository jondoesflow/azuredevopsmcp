# Internal Web App (SPA + BFF)

This folder externalises the Copilot Studio workflow into an internal web application:

- `frontend/`: React + TypeScript SPA
- `bff/`: Backend-for-Frontend (Express + TypeScript) that proxies to MCP

## Architecture

```text
Browser (Entra SSO) -> BFF API -> MCP Server (/sse, /upload, /files)
```

The browser never receives the MCP API key. The BFF injects it server-side.

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
