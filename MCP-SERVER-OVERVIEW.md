# Azure DevOps MCP Server - Overview & Developer Work Structure

## What It Does

An MCP (Model Context Protocol) server that integrates with **Azure DevOps** to automate backlog creation from business documents. Users upload documents (PDF/DOCX/XLSX/text), the system analyses them, and generates a full work item hierarchy: **Epics > Features > User Stories > Tasks** — enriched with confidence scores, dependency detection, and quality assessments.

Consumed via an **internal web application** (React SPA) that connects directly to the MCP Server hosted in Azure.

---

## Architecture at a Glance

```
   Web App (React SPA)
         |
         v
   BFF (Express API)
   14+ REST endpoints
   Entra ID auth
         |
         v
   MCP Server (Express, Azure-hosted)
   22 MCP Tools
         |
         v
   Azure DevOps REST API
   (Work Items, Process Templates, Projects)
```

**Stack:** TypeScript, Node.js 20, Express 5, React 18, Vite, MSAL/Entra ID auth, Docker

---

## Three Major Modules

| Module | Location | What It Does |
|--------|----------|--------------|
| **MCP Server** | `mcp-server/src/` | Core engine: 22 tools for work item CRUD, document processing, enrichment pipeline, process template migration |
| **Web App Frontend** | `webapp/frontend/` | React SPA: setup wizard, backlog dashboard, document upload, RRAID view, export |
| **Web App BFF** | `webapp/bff/` | Backend-for-frontend: Entra ID auth, proxies MCP calls, chat/intent routing, session state |

---

## The 22 MCP Tools (grouped)

| Category | Tools | Count |
|----------|-------|-------|
| **Work Item CRUD** | `create_epic`, `create_feature`, `create_user_story`, `create_task`, `update_work_item`, `add_acceptance_criteria` | 6 |
| **Work Item Queries** | `list_epics`, `list_features`, `list_user_stories`, `get_user_story`, `list_tasks` | 5 |
| **Document Processing** | `process_transcript`, `list_uploaded_files`, `delete_file`, `get_file_content`, `get_file_chunk`, `analyse_document`, `get_theme_details`, `create_backlog` | 8 |
| **Process & Enrichment** | `check_enrichment_fields`, `migrate_enrichment_process`, `ensure_process_on_project` | 3 |

---

## Key Files by Size & Complexity

| File | Lines | Complexity | Notes |
|------|-------|------------|-------|
| `mcp-server/src/tools/workItems.ts` | ~3,240 | High | All 22 tool handlers in one file |
| `mcp-server/src/processMigration.ts` | ~1,200 | High | Process template cloning between ADO orgs |
| `mcp-server/src/azureDevOpsClient.ts` | ~500 | Medium | REST API wrapper for Azure DevOps |
| `mcp-server/src/tools/enrichment/` | ~600 | Medium | Multi-stage enrichment pipeline |
| `webapp/bff/src/routes.ts` | ~400 | Medium | All BFF API endpoints |
| `webapp/frontend/src/` | ~2,000 | Medium | React components & pages |

---

## Known Issues & Improvement Areas

| Area | Issue | Impact |
|------|-------|--------|
| **Test Coverage** | Only ~2 spec files exist; no tests for process migration, ADO client, or enrichment | High - no regression safety net |
| **Error Handling** | Generic "Operation failed" errors without context (work item ID, project, operation) | Medium - hard to debug in production |
| **Code Structure** | `workItems.ts` is 3,240 lines — all 22 tools in one file | Medium - hard to navigate and maintain |
| **In-Memory Storage** | Uploaded files stored in process memory; lost on restart | Medium - no persistence |
| **Type Safety** | Some `any`/`unknown` types in process migration and ADO API responses | Low-Medium |
| **Performance** | O(n^2) dependency detection; no enrichment cache eviction | Low until large backlogs |
| **Security** | PATs in env vars (no secrets manager); no file upload scanning | Low-Medium |

---

## Developer Work Split

### Developer A: MCP Server Core (Backend Focus)

**Owns:** `mcp-server/src/`

| Priority | Work Area | Details |
|----------|-----------|---------|
| P0 | **Add unit tests** | Cover `workItems.ts` handlers, `azureDevOpsClient.ts`, `processMigration.ts`, and enrichment pipeline |
| P0 | **Improve error handling** | Add contextual error info (IDs, project names, operation types) across all tool handlers |
| P1 | **Refactor workItems.ts** | Break 3,240-line file into per-domain modules (e.g., `tools/workItemCrud.ts`, `tools/documentProcessing.ts`, `tools/processManagement.ts`) |
| P1 | **Strengthen type safety** | Replace `any`/`unknown` types with proper interfaces for ADO API responses |
| P2 | **Persistent file storage** | Move from in-memory Map to Azure Blob Storage for uploaded documents |
| P2 | **Enrichment performance** | Optimize dependency detection algorithm; add cache eviction policy |
| P2 | **Batch operations** | Add bulk work item update/create capabilities |

### Developer B: Web Application & Integration (Full-Stack Focus)

**Owns:** `webapp/frontend/`, `webapp/bff/`, integration testing

| Priority | Work Area | Details |
|----------|-----------|---------|
| P0 | **Add BFF tests** | Cover route handlers, auth middleware, intent routing, MCP client proxy |
| P0 | **Add frontend tests** | Component tests for key flows (setup wizard, backlog creation, document upload) |
| P1 | **Error UX** | Surface meaningful error messages from MCP server through BFF to frontend |
| P1 | **Chat/intent improvements** | Expand conversational routing in `chat/intents.ts`; add fallback handling |
| P2 | **Dashboard enhancements** | Backlog health metrics, enrichment status visualization (Recharts) |
| P2 | **Export capabilities** | Extend CSV/JSON export; add Power BI / XML format support |
| P2 | **Auth hardening** | Integrate Azure Key Vault for PAT/secret management; add audit logging |

### Shared / Collaborative

| Priority | Work Area | Owner |
|----------|-----------|-------|
| P0 | **CI/CD pipeline** | Both - set up automated test runs, lint checks, Docker builds |
| P1 | **Integration tests** | Both - end-to-end tests: upload doc > analyse > create backlog > verify in ADO |
| P1 | **API documentation** | Both - document MCP tool contracts, BFF endpoints, error codes |
| P2 | **Monitoring & logging** | Both - structured logging, health check dashboards, alerting |

---

## Quick Start (Local Dev)

```bash
# MCP Server
cd mcp-server && cp .env.example .env   # fill in ADO org, PAT, URL
npm install && npm run build && npm start  # runs on :80

# Web App BFF
cd webapp/bff && cp .env.example .env   # fill in MCP URL, Entra config
npm install && npm start                 # runs on :8080

# Web App Frontend
cd webapp/frontend && cp .env.example .env  # fill in Entra client ID
npm install && npm run dev               # runs on :5173
```
