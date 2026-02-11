# Azure Deployment Guide - MCP Azure DevOps Server

## Overview

Deploy the MCP Azure DevOps Server to Azure Container Instances (ACI) with Streamable HTTP transport for integration with Microsoft Copilot Studio.

## Architecture

```
Copilot Studio
    |
    | POST /sse (Streamable HTTP)
    v
Azure Container Instances (port 80)
    MCP Azure DevOps Server (Node.js + Express)
    DNS: <your-label>.<region>.azurecontainer.io
    |
    | HTTPS (PAT auth)
    v
Azure DevOps Organization
    Work Items API
```

**Key components:**
- **Azure Container Registry (ACR)** - stores the Docker image
- **Azure Container Instances (ACI)** - runs the server on port 80 with a public DNS label
- **MCP Server** - Express + Streamable HTTP transport, serves `/mcp`, `/sse`, and `/health` endpoints

## Prerequisites

1. **Azure CLI** installed and logged in - [Install Azure CLI](https://aka.ms/installazurecliwindows)
2. **Docker Desktop** installed and running - [Install Docker](https://www.docker.com/products/docker-desktop)
3. **Azure Subscription** with Contributor role
4. **Azure DevOps PAT** with Work Items (Read & Write) scope

### Generate an Azure DevOps PAT

1. Go to `https://dev.azure.com/<your-org>/_usersSettings/tokens`
2. Click **New Token**
3. Set scopes to **Work Items (Read & Write)**
4. Copy the token immediately

---

## Step-by-Step Deployment

### 1. Login to Azure

```powershell
az login
az account set --subscription "<your-subscription-id>"
```

### 2. Create Resource Group

```powershell
az group create --name mcp-server-rg --location uksouth
```

> Change `uksouth` to your preferred region.

### 3. Create Azure Container Registry

```powershell
az acr create `
  --resource-group mcp-server-rg `
  --name <your-registry-name> `
  --sku Basic `
  --admin-enabled true
```

> Registry name must be globally unique, lowercase alphanumeric (e.g., `mcpmyorg2025`).

### 4. Build and Push Docker Image

```powershell
cd mcp-server

# Build the image
docker build -t mcp-azure-devops:v1 -f Dockerfile .

# Tag for ACR
docker tag mcp-azure-devops:v1 <your-registry-name>.azurecr.io/mcp-azure-devops:v1

# Login to ACR
az acr login --name <your-registry-name>

# Push to ACR
docker push <your-registry-name>.azurecr.io/mcp-azure-devops:v1
```

### 5. Deploy to Azure Container Instances

```powershell
# Get ACR password
$registryPassword = az acr credential show `
  --name <your-registry-name> `
  --resource-group mcp-server-rg `
  --query "passwords[0].value" -o tsv

# Create container instance
az container create `
  --resource-group mcp-server-rg `
  --name mcp-azure-devops `
  --image <your-registry-name>.azurecr.io/mcp-azure-devops:v1 `
  --cpu 1 `
  --memory 1 `
  --ports 80 `
  --ip-address Public `
  --os-type Linux `
  --dns-name-label <your-dns-label> `
  --registry-login-server <your-registry-name>.azurecr.io `
  --registry-username <your-registry-name> `
  --registry-password $registryPassword `
  --environment-variables `
    AZURE_DEVOPS_ORG=<your-ado-org> `
    AZURE_DEVOPS_PAT=<your-pat-token> `
    AZURE_DEVOPS_URL=https://dev.azure.com/<your-ado-org> `
    PORT=80 `
    TRANSPORT_MODE=http
```

> Replace all `<placeholders>` with your actual values.
> The `--dns-name-label` gives you a stable URL like `<your-dns-label>.uksouth.azurecontainer.io`.

### 6. Verify Deployment

```powershell
# Check container status
az container show `
  --resource-group mcp-server-rg `
  --name mcp-azure-devops `
  --query "{State:instanceView.state, FQDN:ipAddress.fqdn, IP:ipAddress.ip}" `
  -o json

# Test health endpoint
Invoke-WebRequest -Uri "http://<your-dns-label>.<region>.azurecontainer.io/health" -UseBasicParsing

# View logs
az container logs -g mcp-server-rg -n mcp-azure-devops
```

Expected health response:
```json
{
  "status": "healthy",
  "server": "mcp-azure-devops-server",
  "version": "1.0.0",
  "transport": "streamable-http",
  "tools": 11
}
```

---

## Connect to Copilot Studio

1. In Copilot Studio, go to your agent's **Tools** section
2. Add a new **MCP** tool
3. Set the URL to: `http://<your-dns-label>.<region>.azurecontainer.io/sse`
4. Authentication: **None** (or API key if enabled - see below)
5. Test the connection - it should discover 14 tools

### Copilot Studio Agent Instructions

Keep your agent instructions simple to avoid triggering the Responsible AI content filter. Example:

> You help users manage Azure DevOps work items. When a user provides project requirements, you organize them into epics, features, user stories, and tasks.
>
> For each work item you identify, use the appropriate tool to create it in Azure DevOps. Set clear titles and descriptions.
>
> If a requirement is unclear, still create the work item but note that it needs review.
>
> When creating user stories, include acceptance criteria. Link child items to their parents using the parent ID parameters.

**Avoid** putting templates, JSON examples, Gherkin format, or detailed formatting instructions in the agent instructions - these trigger the content moderation filter.

### File Uploads from Copilot Studio

The server accepts file attachments via the `process_transcript` MCP tool. In Copilot Studio:

1. Enable file input in your agent (Settings > File input)
2. In your topic, use a **Question** node with **Identify: File** to capture the upload
3. The agent can then call `process_transcript` with the file content and name
4. Use `System.Activity.Attachments` to access the file's `Content` (base64) and `Name`

Alternatively, files can be uploaded via the REST `/upload` endpoint:

```powershell
Invoke-WebRequest -Uri "http://<your-dns>.azurecontainer.io/upload" `
  -Method POST `
  -Headers @{ "apikey" = "<your-api-key>"; "Content-Type" = "application/json" } `
  -Body '{"fileName": "transcript.txt", "fileContent": "base64-or-plain-text-here"}'
```

The server automatically detects and decodes base64 content. Uploaded files are stored in memory and accessible via `list_uploaded_files` and `get_file_content` tools.

---

## Enable API Key Authentication

To secure the endpoint with an API key:

### 1. Redeploy with MCP_API_KEY

```powershell
# Delete current container
az container delete -g mcp-server-rg -n mcp-azure-devops --yes

# Recreate with API key (add MCP_API_KEY to environment variables)
az container create `
  --resource-group mcp-server-rg `
  --name mcp-azure-devops `
  --image <your-registry-name>.azurecr.io/mcp-azure-devops:v1 `
  --cpu 1 --memory 1 --ports 80 `
  --ip-address Public --os-type Linux `
  --dns-name-label <your-dns-label> `
  --registry-login-server <your-registry-name>.azurecr.io `
  --registry-username <your-registry-name> `
  --registry-password $registryPassword `
  --environment-variables `
    AZURE_DEVOPS_ORG=<your-ado-org> `
    AZURE_DEVOPS_PAT=<your-pat-token> `
    AZURE_DEVOPS_URL=https://dev.azure.com/<your-ado-org> `
    PORT=80 `
    TRANSPORT_MODE=http `
    MCP_API_KEY=<your-secret-api-key>
```

### 2. Configure in Copilot Studio

In the MCP tool configuration, set the authentication header:
- Header name: `apikey` (no hyphens - Copilot Studio restriction)
- Header value: your secret API key

---

## Updating the Server

ACI does not support in-place environment variable updates. To update code or config:

```powershell
# 1. Build new image with incremented tag
docker build -t mcp-azure-devops:v2 -f Dockerfile .
docker tag mcp-azure-devops:v2 <your-registry-name>.azurecr.io/mcp-azure-devops:v2
docker push <your-registry-name>.azurecr.io/mcp-azure-devops:v2

# 2. Delete old container
az container delete -g mcp-server-rg -n mcp-azure-devops --yes

# 3. Recreate with new image tag (same az container create command as above, with :v2)
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_DEVOPS_ORG` | Yes | Azure DevOps organization name |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token |
| `AZURE_DEVOPS_URL` | Yes | Full URL (e.g., `https://dev.azure.com/myorg`) |
| `PORT` | No | Server port (default: `80`) |
| `TRANSPORT_MODE` | No | `http` or `stdio` (default: `http`) |
| `MCP_API_KEY` | No | API key for authentication (disabled if empty) |

---

## Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check - returns server status and tool count |
| `/mcp` | POST | Streamable HTTP MCP endpoint |
| `/sse` | POST | Streamable HTTP MCP endpoint (Copilot Studio compatibility) |
| `/sse` | GET | SSE stream for session (Streamable HTTP) |
| `/sse` | DELETE | Close session |
| `/upload` | POST | REST file upload (JSON body: fileName, fileContent, contentType) |
| `/files` | GET | List uploaded files |

---

## Available Tools (14)

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
| `process_transcript` | Accepts uploaded file content (text or base64) for processing |
| `list_uploaded_files` | Returns list of uploaded files |
| `get_file_content` | Returns content of an uploaded file |

---

## Managing the Deployment

### View Logs
```powershell
az container logs -g mcp-server-rg -n mcp-azure-devops
```

### Restart Container
```powershell
az container restart -g mcp-server-rg -n mcp-azure-devops
```

### Delete Everything
```powershell
az group delete --name mcp-server-rg --yes --no-wait
```

---

## Cost Estimates

| Resource | Monthly Cost |
|----------|-------------|
| Azure Container Instances (1 vCPU, 1 GB) | ~$1/month |
| Azure Container Registry (Basic) | ~$5/month |
| Network transfer | Minimal |
| **Total** | **~$6/month** |

---

## Troubleshooting

### Health endpoint returns error
- Check container logs: `az container logs -g mcp-server-rg -n mcp-azure-devops`
- Verify the container state is "Running"
- Ensure port 80 is exposed

### Copilot Studio can't connect
- Verify the URL uses `http://` not `https://` (ACI doesn't provide TLS by default)
- Use the `/sse` endpoint, not `/mcp`
- Check the health endpoint first to confirm the server is reachable

### Content moderation blocks tool calls
- Simplify your Copilot Studio agent instructions (see above)
- Avoid templates, JSON examples, or code patterns in instructions
- The MCP server returns pure JSON data to minimize filter triggers

### PAT token issues
- Verify the PAT hasn't expired
- Ensure the PAT has Work Items (Read & Write) scope
- Check the organization name matches exactly

---

## Security Best Practices

1. **Never commit PAT tokens** to version control
2. **Rotate PAT tokens** every 90 days
3. **Enable API key authentication** for production use
4. **Use minimal PAT scopes** (Work Items Read & Write only)
5. Keep the Node.js base image updated
