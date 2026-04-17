# Azure DevOps MCP Server

An MCP (Model Context Protocol) server that integrates with Azure DevOps, enabling Copilot Studio agents to manage work items and automatically create backlogs from business documents.

## Features

- **22 MCP tools** — Work item CRUD, document analysis, and automated backlog creation
- **Automated backlog creation** — Upload a document → analyse into themes → create full hierarchy in one call
- **Gherkin acceptance criteria** — User stories include Given/When/Then format
- **MoSCoW prioritisation** — User story descriptions include priority ratings
- **File upload pipeline** — Copilot Studio → Power Automate → MCP server with automatic base64 decoding
- **Streamable HTTP transport** — Compatible with Copilot Studio MCP connector
- **API key authentication** — Secure endpoint for production use
- **Docker containerized** — Deploy to Azure Container Instances (~$6/month)

## Documentation

| Guide | Description |
|-------|-------------|
| [SETUP-GUIDE.md](SETUP-GUIDE.md) | **Start here** — Complete end-to-end setup from scratch |
| [AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md) | Azure infrastructure deployment reference |
| [../changelog.md](../changelog.md) | High-level running log of MCP server and deployment changes |

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your Azure DevOps credentials
npm run build
npm start
```

Test: `curl http://localhost:3000/health`
4
## Testing

Run unit tests:

```bash
npm test
```

Run focused enrichment coverage suites:

```bash
npx jest --coverage \
  src/tools/enrichment/stages.spec.ts \
  src/tools/enrichment/orchestrator.spec.ts \
  src/tools/enrichment/refinement.spec.ts \
  src/tools/rraid.spec.ts \
  src/processDefinitions/index.spec.ts
```

These suites validate the enrichment heuristics, orchestration/caching behavior,
story refinement helpers, RRAID extraction/matching, and process definition registry lookups.

## Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check — returns server status and tool count |
| `/mcp` | POST | Streamable HTTP MCP endpoint |
| `/sse` | POST | MCP endpoint (Copilot Studio compatibility) |
| `/upload` | POST | REST file upload (JSON: fileName, fileContent, contentType) |
| `/files` | GET | List uploaded files |

## Available Tools (22)

### Work Item Management
| Tool | Description |
|------|-------------|
| `list_epics` | Returns epics from a project |
| `list_features` | Returns features from a project |
| `list_user_stories` | Returns user stories from a project |
| `get_user_story` | Returns user story details with tasks |
| `add_acceptance_criteria` | Adds acceptance criteria to a user story |
| `list_tasks` | Returns tasks from a project |
| `create_epic` | Creates an epic |
| `create_feature` | Creates a feature linked to an epic |
| `create_user_story` | Creates a user story linked to a feature |
| `create_task` | Creates a task linked to a user story |
| `update_work_item` | Updates state, assignment, or description |

### Document Processing
| Tool | Description |
|------|-------------|
| `process_transcript` | Stores file content on the server |
| `list_uploaded_files` | Returns list of uploaded files |
| `delete_file` | Deletes an uploaded file |
| `get_file_content` | Returns file metadata and chunk info |
| `get_file_chunk` | Returns a specific chunk of a large file |
| `analyse_document` | Analyses document server-side in `themes` (legacy) or `process` (process-first) mode |
| `get_theme_details` | Returns subtopics for a specific theme |
| `create_backlog` | Creates backlog from analysed document (process-first placeholders or legacy themes) |

### Enrichment Process Tools
| Tool | Description |
|------|-------------|
| `check_enrichment_fields` | Check if a project's process template has the 22 enrichment custom fields |
| `migrate_enrichment_process` | Migrate the Enrichment process template from a source org to the target org |

## Work Item Format

The `create_backlog` tool supports two compatible operating modes:

### Process-first mode (recommended)
- Input pattern:
  - `analyse_document(fileName, analysisMode="process")`
  - `create_backlog(project, processFileName, evidenceFileName?, storyMaturity?, designReferences?, areaPath?)`
- **Epic** — One per process stage from the To-Be process model
- **Feature** — One per capability/process step under each stage
- **User Story** — Discovery placeholder by default (`storyMaturity="placeholder"`) with provenance and fit-gap context
- **Tasks** — Discovery tasks (fit-gap, design-linking, and story refinement)

### Legacy themes mode (backward compatibility)
- Input pattern:
  - `analyse_document(fileName)` (defaults to `themes`)
  - `create_backlog(project, fileName, areaPath?)`
- Behavior remains theme/subtopic-based with detailed stories and Gherkin acceptance criteria.

Additional backlog behaviors:
- **Deduplication** — Matching is normalized (case/punctuation insensitive) to reduce duplicates across reruns
- **Legacy story normalization** — Existing story titles that match subtopic names are reused and updated to `Implement ...`
- **Consistency updates on rerun** — Reused Epics/Features/User Stories/Tasks are updated with current description and path formatting
- **Iteration path rule** — `create_backlog` always assigns `Project\\Backlog`
- **Default area path** — `Project` (can be overridden via `create_backlog.areaPath`)
- **Persona derivation** — Process role/swimlane (when detected) is used first, with transcript fallback
- **Traceability support** — Process-first placeholders can include transcript evidence snippets and design references

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | Azure DevOps organization name |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token (Work Items Read & Write) |
| `AZURE_DEVOPS_URL` | Yes | e.g. `https://dev.azure.com/myorg` |
| `PORT` | No | Server port (default: `8080`) |
| `TRANSPORT_MODE` | No | `http` or `stdio` (default: `http`) |
| `MCP_API_KEY` | No | API key for authentication |
| `AZURE_DEVOPS_PAT_SCOPE_POLICY` | Non-dev | Must be `work-items-read-write` outside development |

## Security

- Never commit `.env` files with real credentials
- Restrict PAT scopes to minimum required permissions
- Rotate PATs regularly
- Enable API key authentication for production
- API keys are accepted via headers only (`Authorization: Bearer`, `x-api-key`, or `apikey`); query-string `api_key` is intentionally rejected.
- Outside development, deploy behind HTTPS termination and forward `x-forwarded-proto: https`.

## References

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- [Azure DevOps Node SDK](https://github.com/microsoft/azure-devops-node-api)
