# BFF (Backend-for-Frontend)

Express + TypeScript API that secures and proxies requests from the SPA to the MCP server.

## Endpoints

### Core
- `GET /api/health` — server health check
- `GET /api/setup/config` — get user config
- `POST /api/setup/config` — save user config
- `POST /api/setup/validate` — validate ADO connection
- `POST /api/setup/check-process` — verify process template

### File Management
- `GET /api/files` — list uploaded files
- `POST /api/files/upload` — upload a file
- `POST /api/files/delete-all` — delete all files

### Document Processing
- `POST /api/process/document` — analyse + preview + create backlog
- `POST /api/chat/message` — intent-based chat interface

### Health Dashboard & Export
- `GET /api/dashboard/health` — backlog health metrics (RAG, confidence, quality, effort, gaps)
- `GET /api/export/excel` — CSV export with enrichment fields
- `GET /api/export/summary` — stakeholder summary (counts, health, risks)

### Story Refinement
- `POST /api/refine/suggest` — get AI-powered improvement suggestions for a story
- `POST /api/refine/apply` — apply refinements to ADO work item

### RRAID Tracking
- `POST /api/rraid/extract` — extract Risks, Requirements, Assumptions, Issues, Dependencies from document
- `POST /api/rraid/create` — create RRAID items as ADO Issue work items
- `GET /api/rraid/list` — list RRAID items (filtered by category)

## Auth model

- `AUTH_MODE=enforced`: validates Entra bearer tokens via JWKS.
- `AUTH_MODE=off`: disables auth for local development only.

Optional group restriction is supported with `ENTRA_ALLOWED_GROUP_IDS`.

## Rate limiting

| Category | Limit |
|----------|-------|
| Validation | 50 req / 15 min |
| Upload | 20 req / 15 min |
| Chat | 60 req / 15 min |
| Processing | 10 req / 15 min |

## Run locally

```powershell
npm install
npm run build
npm start
```

Default URL: `http://localhost:8080`
