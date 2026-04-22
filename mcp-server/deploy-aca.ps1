<#
.SYNOPSIS
  Build/push the MCP Server image to ACR and deploy/update an Azure Container App (ACA).

.DESCRIPTION
  This replaces the older ACI-focused deploy-aci-recreate.ps1 workflow.

  - Builds a Docker image from the current folder
  - Pushes it to Azure Container Registry (ACR)
  - Updates Container App secrets + environment variables
  - Updates the Container App image tag

.NOTES
  - Run from the mcp-server folder.
  - Requires: az CLI, docker
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ResourceGroup = 'mcp-server-rg',

  [Parameter(Mandatory = $false)]
  [string]$AcrName = 'mcpcgsparc2025',

  [Parameter(Mandatory = $false)]
  [string]$ContainerAppName = 'mcp-azure-devops-aca',

  [Parameter(Mandatory = $false)]
  [string]$ImageName = 'mcp-azure-devops',

  [Parameter(Mandatory = $false)]
  [string]$Tag = 'v36',

  [Parameter(Mandatory = $false)]
  [ValidateSet('acr', 'docker')]
  [string]$BuildMode = 'acr',

  [Parameter(Mandatory = $false)]
  [string]$EnvFilePath
)

$ErrorActionPreference = 'Stop'

function Get-ScriptDir() {
  # $PSScriptRoot can be empty in some invocation contexts; fall back to MyInvocation.
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { return $PSScriptRoot }
  if ($MyInvocation.MyCommand.Path) { return (Split-Path -Parent $MyInvocation.MyCommand.Path) }
  return (Get-Location).Path
}

$scriptDir = Get-ScriptDir
if ([string]::IsNullOrWhiteSpace($EnvFilePath)) {
  $EnvFilePath = Join-Path $scriptDir '.env'
}

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path $Path)) {
    Write-Verbose "No .env found at: $Path"
    return
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith('#')) { return }

    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }

    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()

    # Strip single/double quotes
    if ((($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) -and $val.Length -ge 2) {
      $val = $val.Substring(1, $val.Length - 2)
    }

    [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
  }
}

function Get-EnvOrPrompt([string]$Name, [string]$Prompt, [switch]$Secret) {
  $val = [System.Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($val)) { return $val }

  if ($Secret) {
    $secure = Read-Host $Prompt -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }

  return (Read-Host $Prompt).Trim()
}

Write-Host "Loading .env: $EnvFilePath" -ForegroundColor Cyan
Import-DotEnv -Path $EnvFilePath

# Read required config
$adoOrg = Get-EnvOrPrompt -Name 'AZURE_DEVOPS_ORG' -Prompt 'AZURE_DEVOPS_ORG'
$adoUrl = Get-EnvOrPrompt -Name 'AZURE_DEVOPS_URL' -Prompt 'AZURE_DEVOPS_URL (e.g. https://dev.azure.com/<org>)'
$adoPat = Get-EnvOrPrompt -Name 'AZURE_DEVOPS_PAT' -Prompt 'AZURE_DEVOPS_PAT' -Secret

$mcpApiKey = Get-EnvOrPrompt -Name 'MCP_API_KEY' -Prompt 'MCP_API_KEY' -Secret

$registryServer = "$AcrName.azurecr.io"
# NOTE: In PowerShell, a colon immediately after a variable (e.g. $ImageName:$Tag)
# is parsed like a drive-scoped variable reference. Use ${} to delimit.
$fullImage = "$registryServer/${ImageName}:$Tag"

Write-Host "Deploying image: $fullImage" -ForegroundColor Cyan

# Ensure Azure login is valid
az account show 1>$null

Write-Host "Logging into ACR: $AcrName" -ForegroundColor Cyan
if ($BuildMode -eq 'docker') {
  # Uses Docker credential flow.
  az acr login -n $AcrName 1>$null
  Assert-LastExitCode 'az acr login'
}

Write-Host "Building docker image..." -ForegroundColor Cyan
# Build from this folder by default
$buildContext = $scriptDir
# If the script is invoked from elsewhere, still build from mcp-server
if (-not (Test-Path (Join-Path $buildContext 'Dockerfile'))) {
  throw "Dockerfile not found in $buildContext. Run from the mcp-server folder."
}

if ($BuildMode -eq 'acr') {
  Write-Host "Building/pushing in ACR (no local Docker required)..." -ForegroundColor Cyan
  az acr build -r $AcrName -g $ResourceGroup -t "${ImageName}:$Tag" $buildContext 1>$null
  Assert-LastExitCode 'az acr build'
} else {
  docker build -t $fullImage $buildContext
  Assert-LastExitCode 'docker build'

  Write-Host "Pushing docker image..." -ForegroundColor Cyan
  docker push $fullImage
  Assert-LastExitCode 'docker push'
}

Write-Host "Verifying image tag exists in ACR..." -ForegroundColor Cyan
$tagExists = az acr repository show-tags -n $AcrName --repository $ImageName --query "contains(@, '$Tag')" -o tsv
if ($tagExists -ne 'true') {
  throw "ACR image tag not found after build: ${ImageName}:$Tag"
}

Write-Host "Setting Container App secrets..." -ForegroundColor Cyan

# Secrets are stored in ACA; env vars reference them via secretref:
$secretsArgs = @(
  "ado-pat=$adoPat",
  "mcp-api-key=$mcpApiKey"
)

az containerapp secret set -n $ContainerAppName -g $ResourceGroup --secrets @secretsArgs 1>$null

Write-Host "Updating Container App env vars..." -ForegroundColor Cyan

$setEnvArgs = @(
  "AZURE_DEVOPS_ORG=$adoOrg",
  "AZURE_DEVOPS_URL=$adoUrl",
  "AZURE_DEVOPS_PAT=secretref:ado-pat",
  "MCP_API_KEY=secretref:mcp-api-key",
  "PORT=8080",
  "AZURE_DEVOPS_PAT_SCOPE_POLICY=work-items-read-write",
  "TRANSPORT_MODE=http"
)

az containerapp update -n $ContainerAppName -g $ResourceGroup --set-env-vars @setEnvArgs 1>$null

Write-Host "Updating Container App image..." -ForegroundColor Cyan
az containerapp update -n $ContainerAppName -g $ResourceGroup --image $fullImage 1>$null
Assert-LastExitCode 'az containerapp update --image'

$fqdn = az containerapp show -n $ContainerAppName -g $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
$rev = az containerapp show -n $ContainerAppName -g $ResourceGroup --query properties.latestRevisionName -o tsv

Write-Host "Deployed revision: $rev" -ForegroundColor Green
Write-Host "FQDN: https://$fqdn" -ForegroundColor Green
Write-Host "Health: https://$fqdn/health" -ForegroundColor Green
