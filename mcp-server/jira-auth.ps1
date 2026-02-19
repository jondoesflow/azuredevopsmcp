<#
.SYNOPSIS
  Prints the Jira custom field id for "Epic Link" (or another field name).

.DESCRIPTION
  - Reads credentials from environment variables (and optionally from .env in this folder).
  - Tries both /rest/api/2/field and /rest/api/3/field.
  - Uses Windows proxy default credentials to get through corporate proxies (squid).

REQUIRED ENV VARS
  JIRA_BASE_URL
  JIRA_EMAIL (or JIRA_USERNAME)
  JIRA_API_TOKEN (or JIRA_PAT)

OPTIONAL
  FIELD_NAME (defaults to "Epic Link")
#>

[CmdletBinding()]
param(
  [string]$FieldName = $env:FIELD_NAME,
  [string]$Proxy = $env:HTTPS_PROXY
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Import-DotEnv([string]$EnvPath) {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return }

  Get-Content -LiteralPath $EnvPath | ForEach-Object {
    $line = $_
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.TrimStart().StartsWith('#')) { return }

    $parts = $line.Split('=', 2)
    if ($parts.Count -lt 2) { return }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      [System.Environment]::SetEnvironmentVariable($key, $value)
    }
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-DotEnv (Join-Path $scriptDir '.env')

if ([string]::IsNullOrWhiteSpace($FieldName)) {
  $FieldName = 'Epic Link'
}

$base = $env:JIRA_BASE_URL
if ([string]::IsNullOrWhiteSpace($base)) {
  $base = $env:JIRA_URL
}

$email = $env:JIRA_EMAIL
if ([string]::IsNullOrWhiteSpace($email)) {
  $email = $env:JIRA_USERNAME
}

$token = $env:JIRA_API_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = $env:JIRA_PAT
}

if ([string]::IsNullOrWhiteSpace($base) -or [string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($token)) {
  throw "Missing Jira env vars. Set JIRA_BASE_URL + JIRA_EMAIL (or JIRA_USERNAME) + JIRA_API_TOKEN (or JIRA_PAT)."
}

if ($base.EndsWith('/')) { $base = $base.Substring(0, $base.Length - 1) }

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$email`:$token"))
$headers = @{ Authorization = "Basic $auth"; Accept = "application/json" }

function Get-JiraFields([string]$Path) {
  $uri = "$base$Path"
  $requestUri = [Uri]$uri

  # If a system proxy is configured (common on corp networks), supply it explicitly so we can
  # also pass default credentials (for proxy auth).
  $proxyUri = $null
  if (-not [string]::IsNullOrWhiteSpace($Proxy)) {
    $proxyUri = [Uri]$Proxy
  } else {
    $systemProxy = [System.Net.WebRequest]::GetSystemWebProxy()
    try {
      $candidate = $systemProxy.GetProxy($requestUri)
      if ($null -ne $candidate -and $candidate.AbsoluteUri -ne $requestUri.AbsoluteUri) {
        $proxyUri = $candidate
      }
    } catch {
      $proxyUri = $null
    }
  }

  try {
    $invokeParams = @{
      Uri = $uri
      Headers = $headers
      Method = 'GET'
    }
    if ($null -ne $proxyUri) {
      $invokeParams.Proxy = $proxyUri
      $invokeParams.ProxyUseDefaultCredentials = $true
    }
    return Invoke-RestMethod @invokeParams
  } catch {
    Write-Host "Request failed: $uri" -ForegroundColor Yellow
    throw
  }
}

$fields = $null
$lastError = $null
foreach ($path in @('/rest/api/2/field', '/rest/api/3/field')) {
  try {
    $fields = Get-JiraFields $path
    break
  } catch {
    $lastError = $_
  }
}

if ($null -eq $fields) {
  throw $lastError
}

$fieldMatches = @($fields | Where-Object { $_.name -eq $FieldName } | Select-Object name, id)

if ($fieldMatches.Count -eq 0) {
  Write-Host "Field '$FieldName' not found. Candidates:" -ForegroundColor Yellow
  $fields |
    Where-Object { $_.name -match 'Epic|Parent' } |
    Select-Object name, id |
    Sort-Object name |
    Format-Table -AutoSize

  exit 2
}

Write-Host "Found field(s):" -ForegroundColor Green
$fieldMatches | Format-Table -AutoSize

Write-Host "`nSet this in your environment (.env / Azure settings):" -ForegroundColor Cyan
Write-Host "JIRA_EPIC_LINK_FIELD_ID=$($fieldMatches[0].id)" -ForegroundColor Cyan
