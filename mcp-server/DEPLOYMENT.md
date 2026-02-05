#!/bin/bash
# DEPLOYMENT.md - Step-by-step guide to deploy MCP Server to Azure

## Prerequisites

### 1. Install Azure CLI
**Windows:**
- Download from: https://aka.ms/installazurecliwindows
- Or via PowerShell:
  ```powershell
  $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri https://aka.ms/installazurecliwindows -OutFile AzureCLI.msi; Start-Process msiexec.exe -Wait -ArgumentList '/I AzureCLI.msi /quiet'
  ```

**macOS:**
```bash
brew install azure-cli
```

**Linux:**
```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

### 2. Verify Installation
```bash
az --version
```

### 3. Login to Azure
```bash
az login
```

This opens a browser to authenticate. Choose the subscription where you want to deploy.

---

## Deployment Steps

### Step 1: Set Variables
```bash
# Set your Azure subscription details
$SUBSCRIPTION="your-subscription-id"
$RESOURCE_GROUP="mcp-server-rg"
$REGISTRY_NAME="mcpregistryXXXX"  # Must be globally unique, lowercase, no hyphens
$CONTAINER_NAME="mcp-azure-devops"
$LOCATION="eastus"  # Or your preferred region
$REGISTRY_SKU="Basic"  # or Standard, Premium

# Set ADO credentials
$ADO_ORG="cgSPARC"
$ADO_PAT="your-pat-token-here"
$ADO_URL="https://dev.azure.com/cgSPARC"
```

### Step 2: Create Resource Group
```bash
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION \
  --subscription $SUBSCRIPTION
```

### Step 3: Create Azure Container Registry (ACR)
```bash
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $REGISTRY_NAME \
  --sku $REGISTRY_SKU \
  --subscription $SUBSCRIPTION
```

### Step 4: Get ACR Login Credentials
```bash
$REGISTRY_LOGIN=$(az acr credential show \
  --name $REGISTRY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "username" -o tsv \
  --subscription $SUBSCRIPTION)

$REGISTRY_PASSWORD=$(az acr credential show \
  --name $REGISTRY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "passwords[0].value" -o tsv \
  --subscription $SUBSCRIPTION)

$REGISTRY_URL="$REGISTRY_NAME.azurecr.io"

echo "Registry: $REGISTRY_URL"
echo "Username: $REGISTRY_LOGIN"
echo "Password: $REGISTRY_PASSWORD"
```

### Step 5: Build Docker Image Locally
```bash
cd mcp-server
docker build -t $CONTAINER_NAME:latest .
```

### Step 6: Tag Image for ACR
```bash
docker tag $CONTAINER_NAME:latest $REGISTRY_URL/$CONTAINER_NAME:latest
docker tag $CONTAINER_NAME:latest $REGISTRY_URL/$CONTAINER_NAME:v1
```

### Step 7: Push to ACR
```bash
# Login to ACR
docker login $REGISTRY_URL \
  -u $REGISTRY_LOGIN \
  -p $REGISTRY_PASSWORD

# Push image
docker push $REGISTRY_URL/$CONTAINER_NAME:latest
docker push $REGISTRY_URL/$CONTAINER_NAME:v1
```

### Step 8: Deploy to Azure Container Instances
```bash
az container create \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_NAME \
  --image $REGISTRY_URL/$CONTAINER_NAME:latest \
  --cpu 1 \
  --memory 1 \
  --registry-login-server $REGISTRY_URL \
  --registry-username $REGISTRY_LOGIN \
  --registry-password $REGISTRY_PASSWORD \
  --environment-variables \
    AZURE_DEVOPS_ORG=$ADO_ORG \
    AZURE_DEVOPS_PAT=$ADO_PAT \
    AZURE_DEVOPS_URL=$ADO_URL \
  --subscription $SUBSCRIPTION
```

### Step 9: Verify Deployment
```bash
az container show \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_NAME \
  --query "{Name:name, State:instanceView.state, IP:ipAddress.ip, Ports:ipAddress.ports}" \
  --subscription $SUBSCRIPTION
```

### Step 10: View Logs
```bash
az container logs \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_NAME \
  --subscription $SUBSCRIPTION
```

---

## Cross-Tenancy Setup

The MCP server deployed in **Tenancy A** can write to ADO in **Tenancy B** by:

1. **Generate PAT in Tenancy B's ADO**: 
   - Go to https://dev.azure.com/<other-org>/_usersSettings/tokens
   - Create PAT with Work Items (Read & Write)

2. **Update Deployment**:
   - Set `AZURE_DEVOPS_ORG` to the Tenancy B organization name
   - Set `AZURE_DEVOPS_PAT` to the Tenancy B PAT
   - Set `AZURE_DEVOPS_URL` to the Tenancy B URL

3. **Redeploy Container**:
```bash
az container delete \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_NAME \
  --yes

# Re-run the deploy command from Step 8 with new credentials
```

---

## Cost Estimates (Azure Pricing)

- **Azure Container Instances**: ~$0.0000315 per second (~$1-2/month for light usage)
- **Azure Container Registry (Basic)**: ~$5/month
- **Total**: ~$7-10/month for light usage

---

## Cleanup

To delete all resources:

```bash
az group delete \
  --name $RESOURCE_GROUP \
  --subscription $SUBSCRIPTION \
  --yes \
  --no-wait
```

---

## Troubleshooting

### Container won't start
```bash
az container logs --resource-group $RESOURCE_GROUP --name $CONTAINER_NAME
```

### PAT token issues
- Verify PAT hasn't expired
- Check PAT has correct scopes (Work Items Read & Write)
- Ensure ADO organization name matches exactly

### Network connectivity
- Check firewall allows outbound to dev.azure.com:443

---

## Next Steps

Once deployed:
1. Get the container's IP address (from Step 9)
2. Configure Copilot Studio to connect to the MCP server
3. Monitor logs regularly for errors
4. Set up alerts for container restarts
