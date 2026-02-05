# Quick Azure Deployment - Manual Steps

If the automated scripts encounter issues, follow these manual steps.

## Prerequisites

✅ Install Azure CLI: https://aka.ms/installazurecliwindows
✅ Install Docker Desktop: https://www.docker.com/products/docker-desktop
✅ Generate PAT Token in target ADO org

## Step 1: Login & Prepare

```powershell
# Login to Azure
az login

# List subscriptions and choose one
az account list --output table

# Set your subscription
az account set --subscription "your-subscription-id"
```

## Step 2: Create Resources

```powershell
# Set variables
$ResourceGroup = "mcp-server-rg"
$RegistryName = "mcpregistry12345"  # Change to unique name
$Location = "eastus"
$ContainerName = "mcp-azure-devops"

# Create resource group
az group create --name $ResourceGroup --location $Location

# Create container registry
az acr create `
  --resource-group $ResourceGroup `
  --name $RegistryName `
  --sku Basic
```

## Step 3: Login to Registry & Build

```powershell
# Get credentials
$RegistryUrl = "$RegistryName.azurecr.io"
$Username = az acr credential show `
  --name $RegistryName `
  --resource-group $ResourceGroup `
  --query "username" -o tsv

$Password = az acr credential show `
  --name $RegistryName `
  --resource-group $ResourceGroup `
  --query "passwords[0].value" -o tsv

# Login Docker
$Password | docker login $RegistryUrl -u $Username --password-stdin

# Build image
cd c:\Users\jorussel\transport\mcp-server
docker build -t $ContainerName`:latest .

# Tag for registry
docker tag $ContainerName`:latest $RegistryUrl/$ContainerName`:latest
docker tag $ContainerName`:latest $RegistryUrl/$ContainerName`:v1

# Push
docker push "$RegistryUrl/$ContainerName`:latest"
docker push "$RegistryUrl/$ContainerName`:v1"
```

## Step 4: Deploy Container

```powershell
# Set your ADO credentials
$AdoOrg = "cgSPARC"  # Change to your target org
$AdoPat = "your-pat-token-here"
$AdoUrl = "https://dev.azure.com/cgSPARC"

# Deploy
az container create `
  --resource-group $ResourceGroup `
  --name $ContainerName `
  --image "$RegistryUrl/$ContainerName`:latest" `
  --cpu 1 `
  --memory 1 `
  --registry-login-server $RegistryUrl `
  --registry-username $Username `
  --registry-password $Password `
  --environment-variables `
    AZURE_DEVOPS_ORG=$AdoOrg `
    AZURE_DEVOPS_PAT=$AdoPat `
    AZURE_DEVOPS_URL=$AdoUrl
```

## Step 5: Verify Deployment

```powershell
# Check status
az container show `
  --resource-group $ResourceGroup `
  --name $ContainerName `
  --query "{State:instanceView.state, IP:ipAddress.ip}"

# View logs
az container logs `
  --resource-group $ResourceGroup `
  --name $ContainerName
```

Should show: "Azure DevOps MCP Server started successfully"

## Common Commands

```powershell
# Restart container
az container restart -g $ResourceGroup -n $ContainerName

# Check logs (real-time)
az container attach -g $ResourceGroup -n $ContainerName

# Delete everything
az group delete -g $ResourceGroup --yes --no-wait
```

## Troubleshooting

**Container not starting?**
```powershell
az container logs -g $ResourceGroup -n $ContainerName
```

**Can't build Docker image?**
- Verify Docker is running: `docker ps`
- Check Node.js version compatibility
- Try: `docker system prune` to free space

**PAT token errors?**
- Get new PAT from: `https://dev.azure.com/<org>/_usersSettings/tokens`
- Redeploy with new token

**Network blocked?**
- Verify access to dev.azure.com:443
- Check firewall permissions
