# MCP Azure DevOps Server

A Model Context Protocol (MCP) server that integrates with Azure DevOps to manage work items (Epics, Features, User Stories, and Tasks). Designed for use with Microsoft Copilot Studio via Streamable HTTP transport.

## Features

- **19 MCP tools** — Create, list, update, and query work items + document analysis + automated backlog creation
- **Automated backlog creation** — Supports process-first discovery backlogs (recommended) and legacy transcript/theme backlogs
- **Gherkin acceptance criteria** — User stories include Given/When/Then acceptance criteria
- **MoSCoW prioritisation** — User story descriptions include MoSCoW priority ratings
- **File upload pipeline** — Accept file uploads from Copilot Studio via Power Automate, with automatic base64 decoding
- **Streamable HTTP transport** — Compatible with Copilot Studio MCP connector
- **API key authentication** — Secure your endpoint for production deployments
- **Docker containerized** — Deploy to Azure Container Instances (~$6/month)

## Documentation

| Guide | Description |
|-------|-------------|
| [SETUP-GUIDE.md](mcp-server/SETUP-GUIDE.md) | **Start here** — Complete end-to-end setup from scratch |
| [AZURE-DEPLOYMENT.md](mcp-server/AZURE-DEPLOYMENT.md) | Azure infrastructure deployment reference |
| [webapp/README.md](webapp/README.md) | Internal SPA + BFF channel to externalize the Copilot workflow |
| [changelog.md](changelog.md) | High-level running log of MCP server and deployment changes |

## Quick Start (Local Development)

```bash
cd mcp-server
npm install
cp .env.example .env
# Edit .env with your Azure DevOps credentials
npm run build
npm start
```

## Deploy to Azure

See [SETUP-GUIDE.md](mcp-server/SETUP-GUIDE.md) for the full walkthrough, or [AZURE-DEPLOYMENT.md](mcp-server/AZURE-DEPLOYMENT.md) for infrastructure details.

**Summary:**
1. Build Docker image
2. Push to Azure Container Registry
3. Deploy to Azure Container Instances (port 80, public DNS)
4. Connect Copilot Studio MCP connector to `http://<your-dns>.azurecontainer.io/mcp`
5. Create Copilot Studio Topic + Power Automate flow for file uploads

## Internal Web App Channel (SPA + BFF)

For internal users who cannot use Teams as the primary channel, this repository now includes a web interface under `webapp/`:

- `webapp/frontend` — React SPA with Entra ID sign-in
- `webapp/bff` — secured proxy API that calls MCP `/sse`, `/upload`, and `/files`

This keeps `MCP_API_KEY` server-side in the BFF and allows browser clients to authenticate with Entra tokens.

## Available Tools (19)

### Work Item Management
| Tool | Description |
|------|-------------|
| `list_epics` | Returns epics from a project |
| `list_features` | Returns features from a project |
| `list_user_stories` | Returns user stories from a project |
| `get_user_story` | Returns details of a user story with tasks |
| `add_acceptance_criteria` | Adds acceptance criteria to a user story |
| `list_tasks` | Returns tasks from a project |
| `create_epic` | Creates an epic |
| `create_feature` | Creates a feature linked to an epic |
| `create_user_story` | Creates a user story linked to a feature |
| `create_task` | Creates a task linked to a user story |
| `update_work_item` | Updates a work item's state, assignment, or description |

### Document Processing
| Tool | Description |
|------|-------------|
| `process_transcript` | Stores file content on the server |
| `list_uploaded_files` | Returns list of uploaded files |
| `delete_file` | Deletes an uploaded file from the server |
| `get_file_content` | Returns file metadata and chunk info |
| `get_file_chunk` | Returns a specific chunk of a large file |
| `analyse_document` | Analyses a document in `process` mode (recommended) or `themes` mode (legacy) |
| `get_theme_details` | Returns subtopics for a specific theme |
| `create_backlog` | Creates a process-first or legacy backlog from an analysed document |

## How It Works

```
User uploads document in Copilot Studio
  → Topic triggers Power Automate flow
  → Flow POSTs file to MCP server /upload endpoint
  → Agent calls analyse_document (prefer `analysisMode=process` for To-Be process maps)
  → Agent calls create_backlog (process-first placeholders by default, legacy themes still supported)
  → Agent reports: "Backlog created: X epics, X features, X user stories, X tasks"
```

### Work Item Format
- **Process-first mode (recommended)**:
  - Epic = process stage
  - Feature = capability/process step
  - User Story = discovery placeholder by default (`storyMaturity=placeholder`) with fit-gap/provenance context
  - Tasks = fit-gap, design-linking, and refinement tasks
- **Legacy themes mode (backward compatible)**:
  - Epic = theme
  - Feature = subtopic
  - User Story = detailed implementation story with MoSCoW + Gherkin acceptance criteria
  - Tasks = analyse/design-test trio

## Pre-Flight Process Migration

When configured, the server runs a **pre-flight check at startup** to ensure the target Azure DevOps organization has the custom Enrichment process installed. If the process is missing, it is automatically migrated from a source organization.

### How it works

1. **Check** — The server lists all processes in the target org and inspects their work item type fields for any field containing "Enrichment" in the reference name.
2. **Migrate** (only if check fails) — The server reads the full process definition from the source org (work item types, custom fields, states, rules, layout) and recreates it in the target org.
3. **Continue** — Once the process is confirmed or migrated, the MCP server starts normally. If migration fails, the server exits with a clear error.

### Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOURCE_ADO_ORG_URL` | Yes* | Source org URL, e.g. `https://dev.azure.com/source-org` |
| `SOURCE_ADO_PROJECT` | Yes* | Project name in the source org |
| `SOURCE_ADO_PROCESS_NAME` | Yes* | Name of the custom process to migrate (e.g. `CustomAgile`) |
| `SOURCE_ADO_PAT` | Yes* | PAT for the source org (needs **Process → Read** scope) |
| `TARGET_ADO_ORG_URL` | No | Defaults to `AZURE_DEVOPS_URL` |
| `TARGET_ADO_PROJECT` | No | Defaults to `AZURE_DEVOPS_ORG` |
| `TARGET_ADO_PAT` | No | Defaults to `AZURE_DEVOPS_PAT` (needs **Process → Read & Write** scope) |

*\*Required only when process migration is enabled. Set `SOURCE_ADO_ORG_URL` to activate.*

### PAT scope requirements

- **Source org PAT**: Work Items (Read), Process (Read)
- **Target org PAT**: Work Items (Read & Write), Process (Read & Write)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | Azure DevOps organization name |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token (Work Items Read & Write) |
| `AZURE_DEVOPS_URL` | Yes | e.g. `https://dev.azure.com/myorg` |
| `PORT` | No | Server port (default: `80`) |
| `TRANSPORT_MODE` | No | `http` or `stdio` (default: `http`) |
| `MCP_API_KEY` | No | API key for authentication |

## Project Structure

```
mcp-server/
  src/
    index.ts              # Express server, MCP transport, /upload endpoint
    config.ts             # Environment variable loading
    logger.ts             # Structured logging
    azureDevOpsClient.ts  # Azure DevOps REST API client
    processMigration.ts   # Pre-flight Enrichment process check & migration
    tools/
      workItems.ts        # 19 MCP tool definitions and handlers
  Dockerfile              # Multi-stage Docker build
  SETUP-GUIDE.md          # Complete end-to-end setup guide
  AZURE-DEPLOYMENT.md     # Azure infrastructure deployment reference
  ../changelog.md          # High-level running change log

webapp/
  frontend/                # React SPA (MSAL auth, chat + file upload UI)
  bff/                     # Express BFF (auth middleware + MCP proxy)
```

## License

ISC
