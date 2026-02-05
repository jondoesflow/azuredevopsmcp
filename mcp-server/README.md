# Azure DevOps MCP Server

An MCP (Model Context Protocol) server that integrates with Azure DevOps, enabling Copilot Studio agents to manage work items in your Azure DevOps organization.

## Features

- **HTTP/SSE Transport**: Ready for Copilot Studio integration over HTTP
- **Epics**: List and create Epic work items for strategic planning
- **Features**: Organize work into Features under Epics
- **User Stories**: Manage User Stories with detailed acceptance criteria
- **Tasks**: Create and track Tasks for User Story implementation
- **Acceptance Criteria**: Add and manage acceptance criteria on User Stories
- **Work Item Management**: Update states, assignments, and descriptions
- **Real Azure DevOps Integration**: Actual API calls to Azure DevOps REST API
- **Error Handling & Logging**: Comprehensive logging and error handling

## Quick Start - Deploy to Azure

### Prerequisites

1. **Azure CLI** - [Install](https://aka.ms/installazurecliwindows)
2. **Docker Desktop** - [Install](https://www.docker.com/products/docker-desktop)
3. **Azure Subscription** - With Contributor access
4. **Azure DevOps PAT** - With Work Items (Read & Write) scope

### One-Command Deployment

```powershell
cd mcp-server
.\setup-deploy.ps1
```

This interactive script will:
- Verify prerequisites (Azure CLI, Docker)
- Log you into Azure
- Collect deployment parameters
- Deploy to Azure Container Instances

**Estimated time: 5-10 minutes**

### Manual Deployment

```powershell
.\deploy.ps1 `
    -SubscriptionId "your-subscription-id" `
    -RegistryName "mcpregistry12345" `
    -Location "eastus" `
    -AzureDevOpsOrg "your-ado-org" `
    -AzureDevOpsPat "your-pat-token" `
    -AzureDevOpsUrl "https://dev.azure.com/your-ado-org"
```

---

## Architecture

```
src/
├── index.ts                 # Main server entry point (HTTP + stdio transport)
├── config.ts               # Configuration management
├── logger.ts               # Logging utilities
├── azureDevOpsClient.ts   # Azure DevOps API client
└── tools/
    └── workItems.ts        # Work item tools & handlers
```

### Server Endpoints (HTTP Mode)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (returns server status) |
| `/sse` | GET | SSE connection for MCP clients |
| `/messages` | POST | Message endpoint for MCP requests |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | - | Azure DevOps organization name |
| `AZURE_DEVOPS_PAT` | Yes | - | Personal Access Token |
| `AZURE_DEVOPS_URL` | Yes | - | Full Azure DevOps URL |
| `PORT` | No | `8080` | HTTP server port |
| `TRANSPORT_MODE` | No | `http` | `http` for Copilot Studio, `stdio` for CLI |

### Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Azure DevOps credentials

3. Install and build:
   ```bash
   npm install
   npm run build
   ```

4. Run locally:
   ```bash
   npm start
   ```

5. Test the health endpoint:
   ```bash
   curl http://localhost:8080/health
   ```

---

## Generate a Personal Access Token

1. Go to `https://dev.azure.com/<your-org>/_usersSettings/tokens`
2. Click **New Token**
3. Configure:
   - **Name**: "MCP Server"
   - **Scopes**: Work Items (Read & Write)
   - **Expiration**: Set appropriate duration
4. Copy the token immediately and save securely

---

## Connecting to Copilot Studio

After deployment completes, you'll receive a public IP address.

1. **Get the server URL**: `http://<container-ip>:8080`

2. **In Copilot Studio**, configure the MCP connector:
   - **Server URL**: `http://<container-ip>:8080/sse`
   - **Transport**: SSE (Server-Sent Events)

3. The following tools will be available to your agent:
   - `list_epics`, `create_epic`
   - `list_features`, `create_feature`
   - `list_user_stories`, `create_user_story`, `get_user_story`
   - `list_tasks`, `create_task`
   - `add_acceptance_criteria`
   - `update_work_item`

---

## Managing the Deployment

### View Logs
```bash
az container logs -g mcp-server-rg -n mcp-azure-devops --tail 50
```

### Restart Container
```bash
az container restart -g mcp-server-rg -n mcp-azure-devops
```

### Delete Everything
```bash
az group delete -g mcp-server-rg --yes
```

---

## Estimated Costs

| Resource | Monthly Cost |
|----------|--------------|
| Azure Container Instances | ~$1/month |
| Azure Container Registry (Basic) | ~$5/month |
| **Total** | **~$6/month** |

## Available MCP Tools

- `list_epics` - Query Epics with filters
- `list_features` - List Features by Epic or state
- `list_user_stories` - Query User Stories with filters
- `get_user_story` - Get detailed User Story info including acceptance criteria
- `add_acceptance_criteria` - Add acceptance criteria to a User Story
- `list_tasks` - List Tasks by User Story or state
- `create_epic` - Create a new Epic
- `create_feature` - Create a new Feature
- `create_user_story` - Create a new User Story with acceptance criteria
- `create_task` - Create a new Task
- `update_work_item` - Update work item state, assignment, or description

## Documentation

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- [Azure DevOps Node SDK](https://github.com/microsoft/azure-devops-node-api)

## Security Notes

- Never commit `.env` files with real credentials
- Use Azure Key Vault for production deployments
- Restrict PAT scopes to minimum required permissions
- Rotate PATs regularly
