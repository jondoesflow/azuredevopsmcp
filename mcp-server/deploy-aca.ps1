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

# Jira is optional, but if any Jira env var is set we require the trio.
$jiraBaseUrl = [System.Environment]::GetEnvironmentVariable('JIRA_BASE_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($jiraBaseUrl)) {
  $jiraBaseUrl = [System.Environment]::GetEnvironmentVariable('JIRA_URL', 'Process')
}

$jiraEmail = [System.Environment]::GetEnvironmentVariable('JIRA_EMAIL', 'Process')
$jiraUsername = [System.Environment]::GetEnvironmentVariable('JIRA_USERNAME', 'Process')

$jiraToken = [System.Environment]::GetEnvironmentVariable('JIRA_API_TOKEN', 'Process')
if ([string]::IsNullOrWhiteSpace($jiraToken)) {
  $jiraToken = [System.Environment]::GetEnvironmentVariable('JIRA_PAT', 'Process')
}

$jiraEpicLinkFieldId = [System.Environment]::GetEnvironmentVariable('JIRA_EPIC_LINK_FIELD_ID', 'Process')
$jiraHierarchyLinkType = [System.Environment]::GetEnvironmentVariable('JIRA_HIERARCHY_LINK_TYPE', 'Process')
$jiraAuthType = [System.Environment]::GetEnvironmentVariable('JIRA_AUTH_TYPE', 'Process')
$jiraApiVersion = [System.Environment]::GetEnvironmentVariable('JIRA_API_VERSION', 'Process')

$jiraEnabled = -not [string]::IsNullOrWhiteSpace($jiraBaseUrl)
if ($jiraEnabled) {
  if ([string]::IsNullOrWhiteSpace($jiraEmail) -and [string]::IsNullOrWhiteSpace($jiraUsername)) {
    # For Jira Server/DC, username is often required; for Jira Cloud, email is common.
    $jiraUsername = Get-EnvOrPrompt -Name 'JIRA_USERNAME' -Prompt 'JIRA_USERNAME (or set JIRA_EMAIL instead)'
  }
  if ([string]::IsNullOrWhiteSpace($jiraToken)) {
    $jiraToken = Get-EnvOrPrompt -Name 'JIRA_API_TOKEN' -Prompt 'JIRA_API_TOKEN' -Secret
  }
  if ([string]::IsNullOrWhiteSpace($jiraEpicLinkFieldId)) {
    $jiraEpicLinkFieldId = (Read-Host 'JIRA_EPIC_LINK_FIELD_ID (e.g. customfield_10001) (optional)').Trim()
  }
  if ([string]::IsNullOrWhiteSpace($jiraHierarchyLinkType)) {
    $jiraHierarchyLinkType = 'Relates'
  }

  # Optional; used for Jira auth mode differences (Basic vs Bearer)
  if ([string]::IsNullOrWhiteSpace($jiraAuthType)) {
    $jiraAuthType = ''
  }
}

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
if ($jiraEnabled) {
  $secretsArgs += "jira-api-token=$jiraToken"
}

az containerapp secret set -n $ContainerAppName -g $ResourceGroup --secrets @secretsArgs 1>$null

Write-Host "Updating Container App env vars..." -ForegroundColor Cyan

$setEnvArgs = @(
  "AZURE_DEVOPS_ORG=$adoOrg",
  "AZURE_DEVOPS_URL=$adoUrl",
  "AZURE_DEVOPS_PAT=secretref:ado-pat",
  "MCP_API_KEY=secretref:mcp-api-key",
  "PORT=80",
  "TRANSPORT_MODE=http"
)

if ($jiraEnabled) {
  $setEnvArgs += "JIRA_BASE_URL=$jiraBaseUrl"
  $setEnvArgs += "JIRA_API_TOKEN=secretref:jira-api-token"

  # Keep whichever identity fields are supplied. Do NOT map username into JIRA_EMAIL.
  if (-not [string]::IsNullOrWhiteSpace($jiraEmail)) {
    $setEnvArgs += "JIRA_EMAIL=$jiraEmail"
  }
  if (-not [string]::IsNullOrWhiteSpace($jiraUsername)) {
    $setEnvArgs += "JIRA_USERNAME=$jiraUsername"
  }

  if (-not [string]::IsNullOrWhiteSpace($jiraAuthType)) {
    $setEnvArgs += "JIRA_AUTH_TYPE=$jiraAuthType"
  }

  if (-not [string]::IsNullOrWhiteSpace($jiraApiVersion)) {
    $setEnvArgs += "JIRA_API_VERSION=$jiraApiVersion"
  }

  if (-not [string]::IsNullOrWhiteSpace($jiraEpicLinkFieldId)) {
    $setEnvArgs += "JIRA_EPIC_LINK_FIELD_ID=$jiraEpicLinkFieldId"
  }

  if (-not [string]::IsNullOrWhiteSpace($jiraHierarchyLinkType)) {
    $setEnvArgs += "JIRA_HIERARCHY_LINK_TYPE=$jiraHierarchyLinkType"
  }
}

az containerapp update -n $ContainerAppName -g $ResourceGroup --set-env-vars @setEnvArgs 1>$null

Write-Host "Updating Container App image..." -ForegroundColor Cyan
az containerapp update -n $ContainerAppName -g $ResourceGroup --image $fullImage 1>$null
Assert-LastExitCode 'az containerapp update --image'

$fqdn = az containerapp show -n $ContainerAppName -g $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
$rev = az containerapp show -n $ContainerAppName -g $ResourceGroup --query properties.latestRevisionName -o tsv

Write-Host "Deployed revision: $rev" -ForegroundColor Green
Write-Host "FQDN: https://$fqdn" -ForegroundColor Green
Write-Host "Health: https://$fqdn/health" -ForegroundColor Green
