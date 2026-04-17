#!/usr/bin/env pwsh
<#!
.SYNOPSIS
  Recreate the existing ACI container group with a new image tag, without printing secrets.

.DESCRIPTION
  - Uses existing RG/ACR/container group + DNS label
  - Prompts for secret values (ADO PAT, MCP API key)
  - Deletes and recreates the ACI (ACI can't update env vars/image in-place)

NOTES
  This script does NOT read or write .env and does NOT commit any secrets.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ImageTag,

  [Parameter(Mandatory = $false)]
  [string]$ResourceGroup = "mcp-server-rg",

  [Parameter(Mandatory = $false)]
  [string]$RegistryName = "mcpcgsparc2025",

  [Parameter(Mandatory = $false)]
  [string]$ContainerName = "mcp-azure-devops",

  [Parameter(Mandatory = $false)]
  [string]$DnsNameLabel = "mcp-cgsparc",

  [Parameter(Mandatory = $false)]
  [string]$Location = "uksouth"
)

$ErrorActionPreference = 'Stop'

function Read-SecretPlain {
  param([string]$Prompt)
  $sec = Read-Host $Prompt -AsSecureString
  return [System.Net.NetworkCredential]::new('', $sec).Password
}

function Assert-Secret {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $false)][int]$MinLength = 10
  )

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Trim().Length -lt $MinLength) {
    throw "Missing/invalid secret: $Name. Re-run and paste the value (hidden input)." 
  }
}

Write-Host "\nRecreating ACI '$ContainerName' with image tag '$ImageTag'..." -ForegroundColor Cyan

# Ensure logged in
az account show 1>$null

$registryLoginServer = "$RegistryName.azurecr.io"
$registryUser = az acr credential show -g $ResourceGroup -n $RegistryName --query "username" -o tsv
$registryPass = az acr credential show -g $ResourceGroup -n $RegistryName --query "passwords[0].value" -o tsv

# Non-secret config
$adoOrg = (Read-Host "Azure DevOps org (default: cgSPARC)").Trim()
if ([string]::IsNullOrWhiteSpace($adoOrg)) { $adoOrg = 'cgSPARC' }

$adoUrlDefault = "https://dev.azure.com/$adoOrg"
$adoUrl = (Read-Host "Azure DevOps URL (default: $adoUrlDefault)").Trim()
if ([string]::IsNullOrWhiteSpace($adoUrl)) { $adoUrl = $adoUrlDefault }

# Secrets
$adoPat = Read-SecretPlain "Azure DevOps PAT (input hidden)"

# Fail fast if the secret wasn't captured (common if paste didn't work in secure prompt).
Assert-Secret -Name "AZURE_DEVOPS_PAT" -Value $adoPat -MinLength 20

$mcpApiKey = Read-SecretPlain "MCP API key (input hidden; leave blank if you want no auth)"

# Delete old ACI
Write-Host "Deleting existing container group..." -ForegroundColor Yellow
az container delete -g $ResourceGroup -n $ContainerName --yes 1>$null

# Create new ACI
Write-Host "Creating container group..." -ForegroundColor Yellow

$envVars = @(
  "AZURE_DEVOPS_ORG=$adoOrg",
  "AZURE_DEVOPS_URL=$adoUrl",
  "PORT=8080",
  "AZURE_DEVOPS_PAT_SCOPE_POLICY=work-items-read-write",
  "TRANSPORT_MODE=http"
)

$secureEnv = @(
  "AZURE_DEVOPS_PAT=$adoPat"
)

if (-not [string]::IsNullOrWhiteSpace($mcpApiKey)) {
  $secureEnv += "MCP_API_KEY=$mcpApiKey"
}

az container create `
  --resource-group $ResourceGroup `
  --name $ContainerName `
  --location $Location `
  --image "$registryLoginServer/mcp-azure-devops:$ImageTag" `
  --cpu 1 `
  --memory 1 `
  --ports 8080 `
  --ip-address Public `
  --os-type Linux `
  --dns-name-label $DnsNameLabel `
  --registry-login-server $registryLoginServer `
  --registry-username $registryUser `
  --registry-password $registryPass `
  --environment-variables $envVars `
  --secure-environment-variables $secureEnv 1>$null

$fqdn = az container show -g $ResourceGroup -n $ContainerName --query "ipAddress.fqdn" -o tsv
Write-Host "\nDone. FQDN: http://$fqdn" -ForegroundColor Green
Write-Host "Health: http://$fqdn/health" -ForegroundColor Green
