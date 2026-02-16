# Azure DevOps MCP Server

An MCP (Model Context Protocol) server that integrates with Azure DevOps, enabling Copilot Studio agents to manage work items and automatically create backlogs from business documents.

## Features

- **19 MCP tools** — Work item CRUD, document analysis, and automated backlog creation
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
| [COPILOT-STUDIO-PROMPT.md](COPILOT-STUDIO-PROMPT.md) | Agent instructions, Topic setup, and Power Automate flow |
| [SONARQUBE-REMEDIATION-WORKFLOW.md](SONARQUBE-REMEDIATION-WORKFLOW.md) | Required issue → branch → PR workflow for SonarQube fixes |

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your Azure DevOps credentials
npm run build
npm start
```

Test: `curl http://localhost:3000/health`

## Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check — returns server status and tool count |
| `/mcp` | POST | Streamable HTTP MCP endpoint |
| `/sse` | POST | MCP endpoint (Copilot Studio compatibility) |
| `/upload` | POST | REST file upload (JSON: fileName, fileContent, contentType) |
| `/files` | GET | List uploaded files |

## Available Tools (19)

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
| `analyse_document` | Analyses document server-side, extracts themes |
| `get_theme_details` | Returns subtopics for a specific theme |
| `create_backlog` | Creates full backlog from analysed document |

## Work Item Format

The `create_backlog` tool creates:
- **Epic** — One per theme, title is the theme name
- **Feature** — One per subtopic, linked to epic
- **User Story** — Short title, description with "As a... I want... so that..." + MoSCoW priority
- **Acceptance Criteria** — Gherkin format (Given/When/Then/And)
- **Tasks** — 3 per story (Analyse / Design & implement / Test & validate)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | Azure DevOps organization name |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token (Work Items Read & Write) |
| `AZURE_DEVOPS_URL` | Yes | e.g. `https://dev.azure.com/myorg` |
| `PORT` | No | Server port (default: `80`) |
| `TRANSPORT_MODE` | No | `http` or `stdio` (default: `http`) |
| `MCP_API_KEY` | No | API key for authentication |

## Security

- Never commit `.env` files with real credentials
- Restrict PAT scopes to minimum required permissions
- Rotate PATs regularly
- Enable API key authentication for production

## SonarQube Fix Workflow Policy

When running SonarQube remediation, use the mandatory workflow documented in:

- [SONARQUBE-REMEDIATION-WORKFLOW.md](SONARQUBE-REMEDIATION-WORKFLOW.md)

Summary:
1. Create a GitHub issue with detailed evidence (rule, severity, files, line refs, impact).
2. Create a development branch for that issue.
3. Implement and validate fixes on that branch.
4. Open a pull request targeting `dev` for human review.

## References

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- [Azure DevOps Node SDK](https://github.com/microsoft/azure-devops-node-api)
