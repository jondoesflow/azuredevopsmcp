# MCP WebApp Backend Documentation

## Overview

This is a **Backend-for-Frontend (BFF)** service that acts as a bridge between a web application and:
- **Azure DevOps** (for project & backlog management)
- **MCP Server** (for document processing & AI-powered enrichment)

The service enables users to upload documents, analyze them, create backlog items in Azure DevOps, and manage project enrichment workflows.

## Core Architecture

### Request Flow
1. **Authentication**: Extracts `userId` from authenticated requests
2. **State Management**: Maintains per-user setup state (Azure DevOps connection details) via `SetupStore`
3. **MCP Client Creation**: Dynamically creates MCP clients with user-specific credentials
4. **Tool Execution**: Calls MCP tools to process documents and manage backlog items

### Key Components

#### Setup Store (`SetupStore`)
- Stores per-user configuration (Azure DevOps org, URL, project, process type)
- Manages connection validation state
- Securely stores sensitive data (PAT tokens)

#### MCP Client
- Communicates with MCP Server
- Executes remote tools: document analysis, backlog creation, process validation, etc.
- Supports sequential tool execution chains

#### Rate Limiting
- **Validation**: 50 requests/15 min
- **Upload**: 20 requests/15 min
- **Chat**: 60 requests/15 min
- **Process**: 10 requests/15 min

## API Endpoints

### Setup & Configuration
- `GET /setup/config` - Retrieve user's Azure DevOps configuration
- `POST /setup/config` - Save configuration (org, URL, project, etc.)
- `POST /setup/validate` - Validate connection to Azure DevOps
- `POST /setup/check-process` - Verify project has correct process template
- `POST /setup/migrate-enrichment` - Migrate enrichment process to new project

### File Management
- `GET /files` - List uploaded files
- `POST /files/upload` - Upload document with sanitization
- `POST /files/delete-all` - Delete all uploaded files

### Document Processing
- `POST /process/document` - Full workflow: analyze → preview → create backlog items

### Chat Interface
- `POST /chat/message` - Flexible intent-based chat (help, list files, delete, analyze, backlog)

### Dashboards & Exports
- `GET /dashboard/health` - Backlog health metrics & RAG distribution
- `GET /export/excel` - CSV export of backlog items with enrichment data
- `GET /export/summary` - Summary stats (epics, features, stories, health)

### Story Refinement
- `POST /refine/suggest` - AI suggestions for story improvement
- `POST /refine/apply` - Apply refinements + acceptance criteria

### RRAID Tracking (Risks, Assumptions, Issues, Dependencies)
- `POST /rraid/extract` - Extract RRAID items from uploaded document
- `POST /rraid/create` - Create RRAID work items in Azure DevOps
- `GET /rraid/list` - List RRAID items by category

### Utilities
- `GET /health` - Service health check
- `GET /facts/random` - Fun fact endpoint (with fallback)

## Security Features

### Input Validation
- **File Name Sanitization**: Prevents path traversal (`/`, `\`, `..`, null bytes)
- **Request Body Parsing**: Type-safe extraction with defaults
- **Azure DevOps URL Validation**: Confirms project exists before operations

### Authentication
- User ID extracted from authenticated request object
- Per-user isolation of setup state and credentials
- PAT tokens stored securely per-user

### Error Handling
- Graceful error messages (no internal details leaked)
- Consistent HTTP status codes (400 for validation, 502 for external service failures)
- Type-safe error message extraction

## Notable Patterns

### Call Chain: `createMcpClient(req)`
Most endpoints follow this pattern:
```
1. Extract userId from request
2. Load state & secrets from SetupStore
3. Create MCP client with connection headers
4. Execute tool(s) via mcpClient
5. Parse response (string → JSON if needed)
6. Return result or error
```

### Sequential Tool Execution
Document processing chains multiple tools:
```
analyse_document → preview_backlog → create_backlog
```

### Flexible Response Parsing
Tool responses may be strings or objects—code handles both:
```typescript
const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
```

## Tech Stack
- **Framework**: Express.js + TypeScript
- **Rate Limiting**: express-rate-limit
- **External APIs**: Azure DevOps REST API, MCP Server
- **File Upload**: Base64 text content (not multipart)

## Gotchas & Considerations

1. **SetupStore Instance**: Single instance shared across all requests. Thread safety depends on underlying implementation.
2. **CSV Export**: Plain string concatenation (no CSV escaping library), relies on comma-to-semicolon replacement for safety.
3. **userId Type**: Optional string extracted from request—endpoints assume it exists but don't always validate first.
4. **Arbitrary Project Override**: `/process/document` allows `project` override from request body, bypassing setup validation for explicit project specification.
5. **No Pagination**: Health/export endpoints request "top: 500" items—large backlogs may be truncated.

## Future Improvements
- Add schema validation library (Zod, io-ts)
- Extract repeated validation logic into middleware
- Add logging/observability
- Implement CSR token protection for state-changing requests
- Consider streaming CSV exports for large datasets
