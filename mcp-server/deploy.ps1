#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploys the MCP Azure DevOps Server to Azure Container Instances

.DESCRIPTION
    This script automates the entire deployment process:
    1. Creates resource group
    2. Creates Azure Container Registry
    3. Builds Docker image
    4. Pushes to ACR
    5. Deploys to Azure Container Instances
    6. Displays deployment information

.PARAMETER SubscriptionId
    Azure subscription ID where resources will be created

.PARAMETER ResourceGroup
    Name of the resource group (default: mcp-server-rg)

.PARAMETER RegistryName
    Name of the container registry (must be globally unique, lowercase)

.PARAMETER ContainerName
    Name of the container instance (default: mcp-azure-devops)

.PARAMETER Location
    Azure region for deployment (default: eastus)

.PARAMETER AzureDevOpsOrg
    Azure DevOps organization name (e.g., cgSPARC)

.PARAMETER AzureDevOpsPat
    Personal Access Token for Azure DevOps

.PARAMETER AzureDevOpsUrl
    Azure DevOps URL (e.g., https://dev.azure.com/cgSPARC)

.EXAMPLE
    .\deploy.ps1 -SubscriptionId "12345678-1234-1234-1234-123456789012" `
                 -RegistryName "mcpregistry123" `
                 -AzureDevOpsOrg "cgSPARC" `
                 -AzureDevOpsPat "your-pat-token" `
                 -AzureDevOpsUrl "https://dev.azure.com/cgSPARC"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$SubscriptionId,

    [Parameter(Mandatory = $false)]
    [string]$ResourceGroup = "mcp-server-rg",

    [Parameter(Mandatory = $true)]
    [string]$RegistryName,

    [Parameter(Mandatory = $false)]
    [string]$ContainerName = "mcp-azure-devops",

    [Parameter(Mandatory = $false)]
    [string]$Location = "eastus",

    [Parameter(Mandatory = $true)]
    [string]$AzureDevOpsOrg,

    [Parameter(Mandatory = $true)]
    [string]$AzureDevOpsPat,

    [Parameter(Mandatory = $true)]
    [string]$AzureDevOpsUrl
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Message)
    Write-Host "`n" -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
}

function Write-Status {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ $Message" -ForegroundColor Red
}

# Verify Azure CLI is installed
Write-Header "Checking Prerequisites"
Write-Status "Verifying Azure CLI installation..."

try {
    $azVersion = az --version 2>&1 | Select-Object -First 1
    Write-Success "Azure CLI found: $azVersion"
}
catch {
    Write-Error-Custom "Azure CLI not found. Please install it first."
    Write-Host "Download: https://aka.ms/installazurecliwindows" -ForegroundColor Yellow
    exit 1
}

# Check Docker
Write-Status "Verifying Docker installation..."
try {
    $dockerVersion = docker --version
    Write-Success "Docker found: $dockerVersion"
}
catch {
    Write-Error-Custom "Docker not found. Please install Docker Desktop."
    exit 1
}

# Verify ACR name is unique (basic check)
if ($RegistryName.Length -lt 5 -or $RegistryName.Length -gt 50) {
    Write-Error-Custom "Registry name must be 5-50 characters"
    exit 1
}

if ($RegistryName -match "[^a-z0-9]") {
    Write-Error-Custom "Registry name must contain only lowercase letters and numbers"
    exit 1
}

# Set Azure subscription
Write-Header "Setting Azure Subscription"
Write-Status "Setting subscription to: $SubscriptionId"
az account set --subscription $SubscriptionId
Write-Success "Subscription set"

# Create resource group
Write-Header "Creating Resource Group"
Write-Status "Creating resource group: $ResourceGroup in $Location"
az group create `
    --name $ResourceGroup `
    --location $Location `
    --subscription $SubscriptionId | Out-Null
Write-Success "Resource group created"

# Create container registry
Write-Header "Creating Azure Container Registry"
Write-Status "Creating registry: $RegistryName (this may take 1-2 minutes)..."
az acr create `
    --resource-group $ResourceGroup `
    --name $RegistryName `
    --sku Basic `
    --admin-enabled true `
    --subscription $SubscriptionId | Out-Null
Write-Success "Container registry created"

# Get ACR credentials
Write-Header "Retrieving ACR Credentials"
Write-Status "Getting ACR login credentials..."

$registryLogin = az acr credential show `
    --name $RegistryName `
    --resource-group $ResourceGroup `
    --query "username" -o tsv `
    --subscription $SubscriptionId

$registryPassword = az acr credential show `
    --name $RegistryName `
    --resource-group $ResourceGroup `
    --query "passwords[0].value" -o tsv `
    --subscription $SubscriptionId

$registryUrl = "$RegistryName.azurecr.io"

Write-Success "ACR credentials obtained"
Write-Host "Registry URL: $registryUrl" -ForegroundColor Gray

# Build Docker image
Write-Header "Building Docker Image"
Write-Status "Building image locally..."

$dockerImageName = "$ContainerName`:latest"
docker build -t $dockerImageName -f Dockerfile . 2>&1 | Write-Host
Write-Success "Docker image built"

# Tag image for ACR
Write-Header "Tagging Image for ACR"
Write-Status "Tagging image for registry..."

docker tag $dockerImageName "$registryUrl/$dockerImageName"
docker tag $dockerImageName "$registryUrl/$ContainerName`:v1"
Write-Success "Image tagged"

# Login to ACR and push
Write-Header "Pushing Image to ACR"
Write-Status "Logging into ACR..."

$registryPassword | docker login $registryUrl -u $registryLogin --password-stdin 2>&1 | Out-Null
Write-Success "Logged into ACR"

Write-Status "Pushing image (this may take a few minutes)..."
docker push "$registryUrl/$dockerImageName" 2>&1 | Write-Host
docker push "$registryUrl/$ContainerName`:v1" 2>&1 | Write-Host
Write-Success "Image pushed to ACR"

# Deploy to Azure Container Instances
Write-Header "Deploying to Azure Container Instances"
Write-Status "Creating container instance (this may take 2-3 minutes)..."

az container create `
    --resource-group $ResourceGroup `
    --name $ContainerName `
    --image "$registryUrl/$ContainerName`:latest" `
    --cpu 1 `
    --memory 1 `
    --ports 8080 `
    --ip-address Public `
    --registry-login-server $registryUrl `
    --registry-username $registryLogin `
    --registry-password $registryPassword `
    --environment-variables `
        AZURE_DEVOPS_ORG=$AzureDevOpsOrg `
        AZURE_DEVOPS_PAT=$AzureDevOpsPat `
        AZURE_DEVOPS_URL=$AzureDevOpsUrl `
        PORT=8080 `
        TRANSPORT_MODE=http `
    --subscription $SubscriptionId | Out-Null

Write-Success "Container instance created"

# Display deployment information
Write-Header "Deployment Summary"

$queryStr = '{Name:name, State:instanceView.state, IP:ipAddress.ip, Ports:ipAddress.ports[0].port}'
$containerInfo = az container show `
    --resource-group $ResourceGroup `
    --name $ContainerName `
    --query $queryStr `
    --subscription $SubscriptionId | ConvertFrom-Json

Write-Host "Container Information:" -ForegroundColor Cyan
Write-Host "  Name: $($containerInfo.Name)" -ForegroundColor Gray
Write-Host "  State: $($containerInfo.State)" -ForegroundColor Gray
Write-Host "  IP Address: $($containerInfo.IP)" -ForegroundColor Gray
Write-Host "  Port: $($containerInfo.Ports)" -ForegroundColor Gray

Write-Host "`nResource Information:" -ForegroundColor Cyan
Write-Host "  Resource Group: $ResourceGroup" -ForegroundColor Gray
Write-Host "  Registry: $registryUrl" -ForegroundColor Gray
Write-Host "  Subscription: $SubscriptionId" -ForegroundColor Gray

Write-Host "`nAzure DevOps Configuration:" -ForegroundColor Cyan
Write-Host "  Organization: $AzureDevOpsOrg" -ForegroundColor Gray
Write-Host "  URL: $AzureDevOpsUrl" -ForegroundColor Gray

Write-Host "`nUseful Commands:" -ForegroundColor Cyan
Write-Host "  View logs: az container logs -g $ResourceGroup -n $ContainerName" -ForegroundColor Gray
Write-Host "  Delete: az group delete -g $ResourceGroup --yes" -ForegroundColor Gray
Write-Host "  Restart: az container restart -g $ResourceGroup -n $ContainerName" -ForegroundColor Gray

Write-Success "Deployment completed successfully!"
$serverIp = $containerInfo.IP
Write-Host "`nThe MCP server is now running in Azure Container Instances." -ForegroundColor Green
$connectUrl = "$serverIp" + ":8080"
Write-Host "You can configure Copilot Studio to connect to: $connectUrl" -ForegroundColor Green
