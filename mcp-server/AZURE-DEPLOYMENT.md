# Azure Deployment Guide

## Overview

This guide explains how to deploy the MCP Azure DevOps Server to Azure and configure it to write to a different Azure DevOps organization (cross-tenancy support).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Tenancy A (Azure Subscription)                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Azure Container Instances                                ││
│ │ ┌────────────────────────────────────────────────────┐  ││
│ │ │ MCP Azure DevOps Server (Node.js)                 │  ││
│ │ │ - Configured with Tenancy B's PAT token           │  ││
│ │ │ - Makes REST calls to Tenancy B's ADO            │  ││
│ │ └────────────────────────────────────────────────────┘  ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Azure Container Registry                                  ││
│ │ - Stores Docker image                                    ││
│ └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS
                          │
┌─────────────────────────────────────────────────────────────┐
│ Tenancy B (Azure DevOps)                                    │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Azure DevOps Organization                                ││
│ │ - Receives work item creation/update requests            ││
│ │ - Authenticated with PAT token                           ││
│ └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### On Your Local Machine

1. **Azure CLI** - Command-line tool for Azure management
   - [Download for Windows](https://aka.ms/installazurecliwindows)
   - [Download for macOS](https://aka.ms/InstallAzureCLIDeb)
   - [Download for Linux](https://aka.ms/InstallAzureCLIDeb)

2. **Docker Desktop** - For building and testing container images
   - [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

3. **PowerShell 5.1+** (Windows)
   - Usually pre-installed on Windows 10+

### In Azure

1. **Azure Subscription**
   - Already have one? You can reuse it
   - Need one? [Create a free account](https://azure.microsoft.com/en-us/free/)

2. **Appropriate Azure permissions**
   - Contributor role on the subscription (to create resources)

3. **In Tenancy B's Azure DevOps** (the org you want to write to)
   - Personal Access Token (PAT) with **Work Items (Read & Write)** scope
   - [Generate a PAT](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

## Deployment Steps

### Step 1: Install Prerequisites

#### Azure CLI

**Windows:**
```powershell
# Download and run installer
Start-Process "https://aka.ms/installazurecliwindows"

# Or via direct PowerShell installation:
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri https://aka.ms/installazurecliwindows -OutFile AzureCLI.msi
Start-Process msiexec.exe -Wait -ArgumentList '/I AzureCLI.msi /quiet'
Remove-Item AzureCLI.msi
```

**macOS:**
```bash
brew install azure-cli
```

**Linux:**
```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

#### Verify Installation
```bash
az --version
docker --version
```

### Step 2: Prepare Azure Subscription

```bash
# Login to Azure
az login

# List available subscriptions
az account list --output table

# Set the subscription you want to use
az account set --subscription "your-subscription-id"
```

### Step 3: Generate Azure DevOps PAT

This PAT is for the **organization you want to write to** (e.g., your other tenancy's ADO):

1. Go to: `https://dev.azure.com/<your-org>/_usersSettings/tokens`
2. Click **New Token**
3. Configure:
   - **Name**: "MCP Server"
   - **Scopes**: Select **Work Items (Read & Write)**
   - **Expiration**: Set appropriate duration (e.g., 1 year)
4. Click **Create**
5. **Copy the token immediately** - you'll need it for deployment

### Step 4: Run Deployment Script

The easiest way is to run the interactive setup script:

```powershell
cd c:\Users\jorussel\transport\mcp-server

# Run interactive setup
.\setup-deploy.ps1
```

This script will:
- ✓ Verify Docker and Azure CLI are installed
- ✓ Check you're logged into Azure
- ✓ Let you select your subscription
- ✓ Prompt for region, registry name, and ADO details
- ✓ Execute the full deployment

**Or run deploy directly with parameters:**

```powershell
.\deploy.ps1 `
    -SubscriptionId "your-subscription-id" `
    -RegistryName "mcpregistry12345" `
    -Location "eastus" `
    -AzureDevOpsOrg "your-ado-org" `
    -AzureDevOpsPat "your-pat-token" `
    -AzureDevOpsUrl "https://dev.azure.com/your-ado-org"
```

### Step 5: Verify Deployment

After the script completes, verify everything is running:

```bash
# View container status
az container show \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --query "{Name:name, State:instanceView.state, IP:ipAddress.ip}"

# View logs
az container logs \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --tail 50
```

You should see logs like:
```
[2026-02-05T...] [INFO] Server initializing
[2026-02-05T...] [INFO] Azure DevOps client initialized
[2026-02-05T...] [INFO] Server started successfully
```

---

## Cross-Tenancy Configuration

To have the server write to a **different Azure DevOps organization** (different tenancy):

### 1. **Get PAT from Target Organization**

In the organization you want to write to:
- Go to `https://dev.azure.com/<target-org>/_usersSettings/tokens`
- Create a new PAT with **Work Items (Read & Write)** scope
- Copy the token

### 2. **Update Deployment**

The easiest way is to redeploy with the new PAT:

```powershell
# Delete current container
az container delete \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --yes

# Redeploy with new credentials
.\deploy.ps1 `
    -SubscriptionId "your-subscription-id" `
    -RegistryName "mcpregistry12345" `
    -Location "eastus" `
    -AzureDevOpsOrg "target-org-name" `
    -AzureDevOpsPat "target-org-pat-token" `
    -AzureDevOpsUrl "https://dev.azure.com/target-org-name"
```

Or update just the environment variables:

```bash
az container update \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --set \
    containers[0].environmentVariables[0].value="new-org-name" \
    containers[0].environmentVariables[1].value="new-pat-token" \
    containers[0].environmentVariables[2].value="https://dev.azure.com/new-org-name"
```

---

## Cost Estimates

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| Azure Container Instances | $0.0000315/second | ~$0.81/month for always-on |
| Azure Container Registry (Basic) | ~$5 | Includes 10GB of storage |
| Network Data Transfer | Minimal | First 5GB/month free |
| **Total** | **~$6-8/month** | Very cost-effective |

*Prices based on US East region - check [Azure Pricing](https://azure.microsoft.com/en-us/pricing/) for your region*

---

## Managing the Deployment

### View Logs
```bash
# Last 50 lines
az container logs \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --tail 50

# Follow in real-time
az container attach \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops
```

### Restart Container
```bash
az container restart \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops
```

### Scale Up Resources
```bash
# Delete and recreate with more CPU/memory
az container delete \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --yes

# Re-run deploy.ps1 with --cpu and --memory parameters
```

### Connect to Copilot Studio

Once deployed, Copilot Studio can connect to your MCP server:

1. Get the container's IP:
```bash
az container show \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --query "ipAddress.ip" -o tsv
```

2. In Copilot Studio, configure MCP server connection with that IP address

---

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
az container logs \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops

# Common issues:
# - Invalid PAT token → regenerate in ADO
# - Wrong organization name → check spelling
# - Network blocked → check firewall for dev.azure.com:443
```

### Can't connect to Azure DevOps
```bash
# Verify PAT hasn't expired
# Verify PAT has correct scopes (Work Items Read & Write)
# Verify network can reach dev.azure.com

# Test connectivity (from container):
az container exec \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --exec-command "/bin/sh" \
  # Then: curl https://dev.azure.com/health
```

### Delete Everything
```bash
# Remove all resources (this is permanent!)
az group delete \
  --name mcp-server-rg \
  --subscription "your-subscription-id" \
  --yes \
  --no-wait
```

---

## Security Best Practices

1. **PAT Token Security**
   - Never commit PAT tokens to version control
   - Rotate PAT tokens every 90 days
   - Use minimal scopes (Work Items Read & Write only)
   - Regenerate immediately if exposed

2. **Azure Security**
   - Use Contributor role (not Owner)
   - Enable audit logging on resource group
   - Consider network isolation (VNet, Private Endpoints for future)

3. **Container Security**
   - Keep Node.js base image updated
   - Scan ACR images for vulnerabilities
   - Use Azure Defender for container scanning

---

## Next Steps

1. ✓ Deploy server to Azure Container Instances
2. ✓ Connect Copilot Studio to the MCP server
3. ⚬ Configure ADO agents/pipelines to call the MCP server
4. ⚬ Set up monitoring and alerts
5. ⚬ Implement backup/disaster recovery

---

## Support & Documentation

- [Azure Container Instances Docs](https://docs.microsoft.com/en-us/azure/container-instances/)
- [Azure Container Registry Docs](https://docs.microsoft.com/en-us/azure/container-registry/)
- [Azure DevOps REST API](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- [MCP Specification](https://modelcontextprotocol.io/specification)

---

## Questions?

If you encounter issues:

1. Check the troubleshooting section above
2. Review container logs: `az container logs -g mcp-server-rg -n mcp-azure-devops`
3. Verify PAT token credentials in target ADO organization
4. Ensure network can reach `dev.azure.com:443`
