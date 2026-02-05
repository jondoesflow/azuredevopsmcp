#!/usr/bin/env pwsh
<#
QUICK REFERENCE - MCP Server Azure Deployment

Run this for interactive deployment:
    .\setup-deploy.ps1

Or manually with these steps:
#>

Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║                  DEPLOYMENT QUICK REFERENCE                  ║
╚════════════════════════════════════════════════════════════════╝

STEP 1: Install Prerequisites
────────────────────────────────────────────────────────────────
  1. Azure CLI:
     Download: https://aka.ms/installazurecliwindows
     Verify:   az --version

  2. Docker Desktop:
     Download: https://www.docker.com/products/docker-desktop
     Verify:   docker version

  3. PowerShell: Usually already installed on Windows 10+

STEP 2: Prepare
────────────────────────────────────────────────────────────────
  1. Login to Azure:
     az login

  2. Generate PAT in Azure DevOps (target organization):
     URL: https://dev.azure.com/<org-name>/_usersSettings/tokens
     Scopes: Work Items (Read & Write)
     Copy the token (you'll use this in deployment)

STEP 3: Deploy
────────────────────────────────────────────────────────────────
  EASIEST WAY (Interactive):
    cd mcp-server
    .\setup-deploy.ps1

  OR MANUAL WAY (Provide parameters):
    .\deploy.ps1 `
        -SubscriptionId "your-subscription-id" `
        -RegistryName "mcpregistry12345" `
        -AzureDevOpsOrg "target-org-name" `
        -AzureDevOpsPat "your-pat-token" `
        -AzureDevOpsUrl "https://dev.azure.com/target-org-name"

STEP 4: Verify
────────────────────────────────────────────────────────────────
  # Check if running
  az container show -g mcp-server-rg -n mcp-azure-devops `
    --query "{State:instanceView.state, IP:ipAddress.ip}"

  # View logs
  az container logs -g mcp-server-rg -n mcp-azure-devops

  # Should show: "Server started successfully"

COMMON COMMANDS
────────────────────────────────────────────────────────────────
  # View all subscriptions
  az account list --output table

  # Set subscription
  az account set --subscription "subscription-id"

  # View container status
  az container show -g mcp-server-rg -n mcp-azure-devops

  # Restart container
  az container restart -g mcp-server-rg -n mcp-azure-devops

  # Delete everything
  az group delete -g mcp-server-rg --yes --no-wait

  # Check logs
  az container logs -g mcp-server-rg -n mcp-azure-devops --tail 50

  # Attach to logs (real-time)
  az container attach -g mcp-server-rg -n mcp-azure-devops

CROSS-TENANCY SETUP
────────────────────────────────────────────────────────────────
  The server deployed in Tenancy A will write to a DIFFERENT
  Azure DevOps organization (Tenancy B) using its PAT token.

  1. Generate PAT in Tenancy B's ADO organization
  2. Deploy/redeploy with that organization's credentials
  3. Server automatically uses those credentials

TROUBLESHOOTING
────────────────────────────────────────────────────────────────
  Container won't start?
    az container logs -g mcp-server-rg -n mcp-azure-devops

  Invalid PAT error?
    - Verify PAT hasn't expired
    - Regenerate new PAT in ADO
    - Redeploy with new token

  Can't reach ADO?
    - Check firewall allows dev.azure.com:443
    - Verify organization name is correct

  Want to use different organization?
    az container delete -g mcp-server-rg -n mcp-azure-devops --yes
    .\deploy.ps1 -... (with new org details)

COSTS
────────────────────────────────────────────────────────────────
  Azure Container Instances: ~$0.81/month (always-on)
  Container Registry (Basic): ~$5/month
  Total: ~$6-8/month

  ✓ Very cost-effective for a lightweight MCP server

READ MORE
────────────────────────────────────────────────────────────────
  Full deployment guide: AZURE-DEPLOYMENT.md
  Setup guide: DEPLOYMENT.md
  Architecture: README.md

"@
