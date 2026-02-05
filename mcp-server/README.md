# Azure DevOps MCP Server

An MCP (Model Context Protocol) server that integrates with Azure DevOps, enabling Copilot Studio agents to manage work items in your Azure DevOps organization.

## Features

- **Epics**: List and create Epic work items for strategic planning
- **Features**: Organize work into Features under Epics
- **User Stories**: Manage User Stories with detailed acceptance criteria
- **Tasks**: Create and track Tasks for User Story implementation
- **Acceptance Criteria**: Add and manage acceptance criteria on User Stories
- **Work Item Management**: Update states, assignments, and descriptions
- **Real Azure DevOps Integration**: Actual API calls to Azure DevOps REST API
- **Error Handling & Logging**: Comprehensive logging and error handling

## Architecture

```
src/
├── index.ts                 # Main server entry point
├── config.ts               # Configuration management
├── logger.ts               # Logging utilities
├── azureDevOpsClient.ts   # Azure DevOps API client
└── tools/
    └── workItems.ts        # Work item tools & handlers
```

- **AzureDevOpsClient**: Encapsulates all Azure DevOps REST API calls
- **Tool Handlers**: Modular tool definitions and request handlers
- **Config Manager**: Environment variable validation and loading
- **Logger**: Structured logging with levels (DEBUG, INFO, WARN, ERROR)

## Prerequisites

1. Azure DevOps Organization: https://dev.azure.com/cgSPARC/
2. Personal Access Token (PAT) with appropriate scopes
3. Node.js 18+
4. npm

## Generate a Personal Access Token

1. Go to https://dev.azure.com/cgSPARC/_usersSettings/tokens
2. Click "New Token"
3. Select scopes:
   - Work Items (Read & Write)
   - Code (Read)
   - Build (Read & Execute)
   - Release (Read)
4. Copy the token and save it securely

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file in the project root:

```env
AZURE_DEVOPS_ORG=cgSPARC
AZURE_DEVOPS_PAT=<your-personal-access-token>
AZURE_DEVOPS_URL=https://dev.azure.com/cgSPARC
```

**Important**: Keep your PAT secure. Never commit `.env` to version control.

```bash
# Development mode with auto-rebuild
npm run dev

# Debug mode
npm run debug
```

## Deployment to Azure

### Option 1: Azure Container Instances (ACI)

1. Create a container image:
   ```bash
   docker build -t mcp-azure-devops:latest .
   ```

2. Push to Azure Container Registry:
   ```bash
   az acr build --registry <your-registry> --image mcp-azure-devops:latest .
   ```

3. Deploy to ACI:
   ```bash
   az container create --resource-group <rg> --name mcp-azure-devops --image <registry>.azurecr.io/mcp-azure-devops:latest \
     --environment-variables AZURE_DEVOPS_ORG=cgSPARC AZURE_DEVOPS_PAT=<pat> AZURE_DEVOPS_URL=https://dev.azure.com/cgSPARC
   ```

### Option 2: Azure Functions

Deploy as an HTTP-based MCP server using Azure Functions with the MCP protocol adapter.

### Option 3: App Service

Deploy to Azure App Service with proper environment variable configuration.

## Connecting to Copilot Studio

Once deployed to Azure:

1. Get the MCP server endpoint (e.g., from Azure Container Instances or App Service)
2. In Copilot Studio, add the MCP server:
   - Server Type: HTTP
   - URL: `<your-server-url>`
   - Authentication: Provide PAT if required

3. The MCP tools will be available to your agent for querying Azure DevOps

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
