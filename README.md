# MCP Azure DevOps Server

A Model Context Protocol (MCP) server that integrates with Azure DevOps to manage work items (Epics, Features, User Stories, and Tasks). Designed for use with Microsoft Copilot Studio via Streamable HTTP transport.

## Features

- **14 tools** - Create, list, update, and query work items + file upload/processing
- **File attachment support** - Accept file uploads from Copilot Studio
- **Streamable HTTP transport** - Compatible with Copilot Studio MCP connector
- **API key authentication** - Optional security for production deployments
- **Docker containerized** - Deploy to Azure Container Instances
- **Stdio transport** - Also supports local CLI usage

## Quick Start (Local Development)

```bash
cd mcp-server
npm install
cp .env.example .env
# Edit .env with your Azure DevOps credentials
npm run dev
```

## Deploy to Azure

See [AZURE-DEPLOYMENT.md](mcp-server/AZURE-DEPLOYMENT.md) for full step-by-step instructions.

**Summary:**
1. Build Docker image
2. Push to Azure Container Registry
3. Deploy to Azure Container Instances (port 80, public DNS)
4. Connect Copilot Studio to `http://<your-dns>.azurecontainer.io/sse`

## Available Tools

| Tool | Description |
|------|-------------|
| `list_epics` | Returns epics from a project |
| `list_features` | Returns features from a project |
| `list_user_stories` | Returns user stories from a project |
| `get_user_story` | Returns details of a user story |
| `add_acceptance_criteria` | Adds acceptance criteria to a user story |
| `list_tasks` | Returns tasks from a project |
| `create_epic` | Creates an epic |
| `create_feature` | Creates a feature |
| `create_user_story` | Creates a user story |
| `create_task` | Creates a task |
| `update_work_item` | Updates a work item |
| `process_transcript` | Accepts uploaded file content for processing |
| `list_uploaded_files` | Returns list of uploaded files |
| `get_file_content` | Returns content of an uploaded file |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | Azure DevOps organization name |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token |
| `AZURE_DEVOPS_URL` | Yes | e.g. `https://dev.azure.com/myorg` |
| `PORT` | No | Server port (default: `80`) |
| `TRANSPORT_MODE` | No | `http` or `stdio` (default: `http`) |
| `MCP_API_KEY` | No | API key for authentication |

## Project Structure

```
mcp-server/
  src/
    index.ts              # Express server + Streamable HTTP transport
    config.ts             # Environment variable loading
    logger.ts             # Structured logging
    azureDevOpsClient.ts  # Azure DevOps API client
    tools/
      workItems.ts        # Tool definitions and handlers
  Dockerfile              # Multi-stage Docker build
  AZURE-DEPLOYMENT.md     # Detailed deployment guide
```

## License

ISC
