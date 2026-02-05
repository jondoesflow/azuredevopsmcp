# Azure Deployment - Complete Package

## Summary

Your MCP Azure DevOps Server is ready for deployment to Azure with **cross-tenancy support**. This means:

✅ **Tenancy A (Azure Subscription)**: Host the MCP server
✅ **Tenancy B (Azure DevOps)**: The server writes work items to a different organization's ADO

---

## Files Created for Deployment

### 1. **setup-deploy.ps1** ⭐ START HERE
Interactive deployment wizard that:
- Checks prerequisites (Azure CLI, Docker)
- Verifies Azure login
- Collects deployment parameters
- Shows deployment summary
- Runs the full deployment

**Run it:**
```powershell
.\setup-deploy.ps1
```

### 2. **deploy.ps1**
The main deployment script that:
- Creates Azure Resource Group
- Creates Azure Container Registry (ACR)
- Builds Docker image locally
- Pushes image to ACR
- Deploys to Azure Container Instances
- Shows deployment output

Used by setup-deploy.ps1 but can also be run directly with parameters.

### 3. **AZURE-DEPLOYMENT.md**
Comprehensive guide covering:
- Architecture diagram
- Prerequisites and installation
- Step-by-step deployment
- Cross-tenancy configuration
- Cost estimates
- Management commands
- Troubleshooting
- Security best practices

### 4. **QUICK-REFERENCE.ps1**
Quick command reference showing:
- Prerequisites
- Deployment steps
- Common commands
- Troubleshooting tips
- Cost info

View with:
```powershell
.\QUICK-REFERENCE.ps1
```

### 5. **Dockerfile** (already exists)
Multi-stage Docker configuration:
- Build stage: Compiles TypeScript
- Runtime stage: Node.js 20 Alpine (lightweight)
- Proper signal handling with dumb-init
- Production-ready optimization

---

## Quick Start (3 Steps)

### Step 1: Install Azure CLI
- **Windows**: https://aka.ms/installazurecliwindows
- **macOS**: `brew install azure-cli`
- **Linux**: https://aka.ms/InstallAzureCLIDeb

Verify: `az --version`

### Step 2: Get PAT Token
1. Go to: `https://dev.azure.com/<your-org>/_usersSettings/tokens`
2. Click "New Token"
3. Scope: **Work Items (Read & Write)** ✓
4. Copy the token

### Step 3: Run Deployment

**Option A: Interactive Setup (Recommended)**
```powershell
cd c:\Users\jorussel\transport\mcp-server
.\setup-deploy.ps1
```

**Option B: Manual Steps**
Follow the detailed walkthrough in `MANUAL-DEPLOYMENT.md`

---

## What Gets Created in Azure

| Resource | Type | Cost/Month | Purpose |
|----------|------|-----------|---------|
| `mcp-server-rg` | Resource Group | $0 | Container for resources |
| `mcp-azure-devops` | Container Instance | ~$0.81 | Runs the MCP server |
| `mcpregistry*` | Container Registry | ~$5 | Stores Docker image |
| **Total** | | **~$6-8** | Very cost-effective |

---

## Cross-Tenancy Setup Explained

```
Your Local Machine (Deploy from here)
  │
  └─→ Azure Subscription A (Host infrastructure)
       ├─ Container Registry (stores Docker image)
       └─ Container Instance (runs MCP server)
            │
            └─→ (HTTPS) ←──→ Azure DevOps B (Different tenancy)
                              (Uses PAT token to authenticate)
                              (Creates/updates work items here)
```

**The PAT token you provide during deployment determines which ADO organization gets written to.**

### Example Scenarios

**Scenario 1: Same Tenancy**
- Buy Azure subscription in Tenancy A
- Have ADO organization in Tenancy A
- Deploy server with Tenancy A's PAT
- ✅ Works: Server in A writing to ADO in A

**Scenario 2: Different Tenancy (Your Use Case)**
- Buy Azure subscription in Tenancy A
- Have ADO organization in Tenancy B (different company, different Microsoft account)
- Deploy server with Tenancy B's PAT
- ✅ Works: Server in A writing to ADO in B
- Network connectivity is the only requirement (it's always there to dev.azure.com)

---

## Deployment Timeline

| Stage | Time | What Happens |
|-------|------|--------------|
| Prerequisites check | 1 min | Verifies Docker, Azure CLI |
| Collection | 2 min | Asks for Azure/ADO details |
| Resource group | 1 min | Creates empty resource group |
| Registry | 1-2 min | Sets up container registry |
| Docker build | 2-3 min | Builds image locally |
| Docker push | 2-3 min | Uploads to ACR |
| Deployment | 2-3 min | Starts container instance |
| **Total** | **~15 min** | Server is live! |

---

## Verification Commands

After deployment completes, verify everything:

```bash
# Get IP address (Copilot Studio uses this)
az container show \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --query "ipAddress.ip" -o tsv

# Check status
az container show \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops \
  --query "{State:instanceView.state, CpuCores:containers[0].resources.requests.cpu}"

# View logs (should show "Server started successfully")
az container logs \
  --resource-group mcp-server-rg \
  --name mcp-azure-devops
```

---

## Next Steps After Deployment

1. **Configure Copilot Studio**
   - Get container IP from deployment output
   - Add MCP server connection with that IP

2. **Test Connectivity**
   - List work items from target ADO org
   - Create test work item
   - Verify it appears in Azure DevOps

3. **Monitor & Maintain**
   - Check logs regularly
   - Monitor resource usage
   - Plan for PAT token rotation (every 90 days)

4. **Scale if Needed**
   - Increase CPU (currently 1 core)
   - Increase memory (currently 1GB)
   - Add more regions if needed

---

## Rollback / Cleanup

If you want to remove everything:

```bash
# Delete resource group (PERMANENT!)
az group delete \
  --name mcp-server-rg \
  --yes \
  --no-wait
```

This removes:
- Container instance
- Container registry
- All associated resources
- All costs stop immediately

---

## Support

If deployment fails, check:

1. **Prerequisites**
   ```bash
   az --version
   docker --version
   az account show
   ```

2. **Logs**
   ```bash
   az container logs -g mcp-server-rg -n mcp-azure-devops
   ```

3. **Common Issues**
   - PAT token expired → regenerate in ADO
   - Wrong org name → verify spelling matches ADO URL
   - Docker not running → start Docker Desktop
   - Not logged into Azure → run `az login`

4. **Documentation**
   - Full guide: `AZURE-DEPLOYMENT.md`
   - Architecture: `README.md`
   - Quick ref: `QUICK-REFERENCE.ps1`

---

## Deployment Files

All deployment files are in `c:\Users\jorussel\transport\mcp-server\`:

```
mcp-server/
├── setup-deploy.ps1        # ⭐ Interactive deployment (RECOMMENDED)
├── deploy.ps1              # Full deployment automation
├── MANUAL-DEPLOYMENT.md    # Step-by-step manual guide
├── AZURE-DEPLOYMENT.md     # Comprehensive reference
├── QUICK-REFERENCE.ps1     # Command reference
├── Dockerfile              # Container configuration
├── package.json            # Node.js dependencies
├── tsconfig.json           # TypeScript config
├── README.md               # Project overview
├── src/                    # Source code
│   ├── index.ts            # MCP server entry point
│   ├── config.ts           # Environment configuration
│   ├── logger.ts           # Logging utilities
│   ├── azureDevOpsClient.ts # Azure DevOps API client
│   └── tools/
│       └── workItems.ts    # Work item tools
└── dist/                   # Compiled JavaScript
```

---

## You're All Set! 🚀

The MCP server is production-ready. You have:

✅ Full-featured Azure DevOps integration
✅ Cross-tenancy support (different Azure subscriptions)
✅ Automated deployment to Azure
✅ Comprehensive documentation
✅ Interactive setup wizard
✅ Cost-effective infrastructure (~$6-8/month)

**To start deployment:**
```powershell
.\setup-deploy.ps1
```

Questions? Check `AZURE-DEPLOYMENT.md` for the complete guide.
