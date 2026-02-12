# MCP Azure DevOps Server

A Model Context Protocol (MCP) server that integrates with Azure DevOps to manage work items (Epics, Features, User Stories, and Tasks). Designed for use with Microsoft Copilot Studio via Streamable HTTP transport.

## Features

- **19 MCP tools** — Create, list, update, and query work items + document analysis + automated backlog creation
- **Automated backlog creation** — Upload a document, analyse it into themes, and create a full backlog (Epics → Features → User Stories → Tasks) in one operation
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
| [COPILOT-STUDIO-PROMPT.md](mcp-server/COPILOT-STUDIO-PROMPT.md) | Agent instructions, Topic setup, and Power Automate flow |

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
6. Paste agent instructions from `COPILOT-STUDIO-PROMPT.md`

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
| `analyse_document` | Analyses a document server-side, extracts themes and subtopics |
| `get_theme_details` | Returns subtopics for a specific theme |
| `create_backlog` | Creates a full backlog (Epics/Features/User Stories/Tasks) from an analysed document |

## How It Works

```
User uploads document in Copilot Studio
  → Topic triggers Power Automate flow
  → Flow POSTs file to MCP server /upload endpoint
  → Agent calls analyse_document (extracts themes server-side)
  → Agent calls create_backlog (creates all work items in one operation)
  → Agent reports: "Backlog created: X epics, X features, X user stories, X tasks"
```

### Work Item Format
- **Epic**: One per theme
- **Feature**: One per subtopic, linked to epic
- **User Story**: Title is short summary, description contains "As a... I want... so that..." + MoSCoW priority
- **Acceptance Criteria**: Gherkin format (Given/When/Then)
- **Tasks**: 3 per user story (Analyse / Design & implement / Test & validate)

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
    tools/
      workItems.ts        # 19 MCP tool definitions and handlers
  Dockerfile              # Multi-stage Docker build
  SETUP-GUIDE.md          # Complete end-to-end setup guide
  AZURE-DEPLOYMENT.md     # Azure infrastructure deployment reference
  COPILOT-STUDIO-PROMPT.md # Agent instructions and Topic/Flow setup
```

## License

ISC
