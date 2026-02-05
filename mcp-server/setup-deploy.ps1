#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Interactive setup script - collects deployment information and validates prerequisites
#>

Write-Host "MCP Azure DevOps Server - Azure Deployment Setup" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`n[1/3] Checking prerequisites..." -ForegroundColor Yellow

# Check Azure CLI
$azCliExists = $null -ne (Get-Command az -ErrorAction SilentlyContinue)
if ($azCliExists) {
    Write-Host "  OK: Azure CLI installed" -ForegroundColor Green
}
else {
    Write-Host "  ERROR: Azure CLI NOT found" -ForegroundColor Red
    Write-Host "`n    To install Azure CLI:" -ForegroundColor Yellow
    Write-Host "    Windows: https://aka.ms/installazurecliwindows" -ForegroundColor Gray
    exit 1
}

# Check Docker
$dockerExists = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
if ($dockerExists) {
    Write-Host "  OK: Docker installed" -ForegroundColor Green
}
else {
    Write-Host "  ERROR: Docker NOT found" -ForegroundColor Red
    Write-Host "`n    To install Docker:" -ForegroundColor Yellow
    Write-Host "    Download Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Gray
    exit 1
}

# Verify Docker is running
try {
    docker ps | Out-Null
    Write-Host "  OK: Docker daemon running" -ForegroundColor Green
}
catch {
    Write-Host "  ERROR: Docker daemon NOT running" -ForegroundColor Red
    Write-Host "    Please start Docker Desktop" -ForegroundColor Yellow
    exit 1
}

# Check Azure login
Write-Host "`n[2/3] Checking Azure authentication..." -ForegroundColor Yellow
try {
    $currentUser = (az account show --query "user.name" -o tsv 2>$null)
    if ($currentUser) {
        Write-Host "  OK: Already logged in as: $currentUser" -ForegroundColor Green
    }
    else {
        Write-Host "`n  Logging in to Azure..." -ForegroundColor Yellow
        az login | Out-Null
        Write-Host "  OK: Logged in successfully" -ForegroundColor Green
    }
}
catch {
    Write-Host "`n  Logging in to Azure..." -ForegroundColor Yellow
    az login | Out-Null
    Write-Host "  OK: Logged in successfully" -ForegroundColor Green
}

# Collect deployment parameters
Write-Host "`n[3/3] Collecting deployment information..." -ForegroundColor Yellow

# Get subscription - use variable to avoid parsing issues with braces
$accountQuery = "[].{id:id, name:name}"
$subscriptions = az account list --query $accountQuery -o json | ConvertFrom-Json

if ($subscriptions.Count -eq 1) {
    $selectedSub = $subscriptions[0]
    Write-Host "  Using subscription: $($selectedSub.name)" -ForegroundColor Green
}
else {
    Write-Host "`n  Available subscriptions:" -ForegroundColor Yellow
    $subscriptions | ForEach-Object -Begin { $i = 1 } -Process {
        Write-Host "    [$i] $($_.name)" -ForegroundColor Gray
        $i++
    }
    [int]$choice = Read-Host "`n  Select subscription (number)"
    $selectedSub = $subscriptions[$choice - 1]
    Write-Host "  Selected: $($selectedSub.name)" -ForegroundColor Green
}

$subscriptionId = $selectedSub.id

# Get location
Write-Host "`n  Available regions (enter location name, e.g., eastus):" -ForegroundColor Yellow
Write-Host "    eastus, westus, westeurope, eastasia, southeastasia" -ForegroundColor Gray
$location = (Read-Host "  Region (default: eastus)").Trim().ToLower()
if ([string]::IsNullOrWhiteSpace($location)) { $location = "eastus" }

# Get registry name with validation
Write-Host "`n  Registry name (must be globally unique, lowercase, 5-50 chars):" -ForegroundColor Yellow
do {
    $registryName = (Read-Host "  Registry name").Trim().ToLower()
    $validPattern = '^[a-z0-9]+$'
    
    if ($registryName.Length -lt 5) {
        Write-Host "    ERROR: Name too short (minimum 5 characters)" -ForegroundColor Red
    }
    elseif ($registryName.Length -gt 50) {
        Write-Host "    ERROR: Name too long (maximum 50 characters)" -ForegroundColor Red
    }
    elseif ($registryName -notmatch $validPattern) {
        Write-Host "    ERROR: Name contains invalid characters (only lowercase letters and numbers)" -ForegroundColor Red
    }
} while ($registryName.Length -lt 5 -or $registryName.Length -gt 50 -or $registryName -notmatch $validPattern)

# Get ADO settings
Write-Host "`n  Azure DevOps configuration:" -ForegroundColor Yellow
$adoOrgName = "cgSPARC"
$adoOrg = (Read-Host "  Organization name (default: $adoOrgName)").Trim()
if ([string]::IsNullOrWhiteSpace($adoOrg)) { $adoOrg = $adoOrgName }

$adoUrlDefault = "https://dev.azure.com/$adoOrg"
$adoUrl = (Read-Host "  ADO URL (default: $adoUrlDefault)").Trim()
if ([string]::IsNullOrWhiteSpace($adoUrl)) { $adoUrl = $adoUrlDefault }

Write-Host "  Enter your Personal Access Token (PAT)" -ForegroundColor Yellow
Write-Host "  Get it from: https://dev.azure.com/$adoOrg/_usersSettings/tokens" -ForegroundColor Gray
$adoPat = Read-Host "  PAT Token" -AsSecureString
$adoPatPlain = [System.Net.NetworkCredential]::new("", $adoPat).Password

# Summary
Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT SUMMARY" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

Write-Host "`nAzure Configuration:" -ForegroundColor Yellow
Write-Host "  Subscription: $($selectedSub.name)" -ForegroundColor Gray
Write-Host "  Location: $location" -ForegroundColor Gray
Write-Host "  Registry: $registryName.azurecr.io" -ForegroundColor Gray

Write-Host "`nAzure DevOps Configuration:" -ForegroundColor Yellow
Write-Host "  Organization: $adoOrg" -ForegroundColor Gray
Write-Host "  URL: $adoUrl" -ForegroundColor Gray

Write-Host "`n"
$confirm = (Read-Host "Proceed with deployment? (yes/no)").Trim().ToLower()

if ($confirm -ne "yes" -and $confirm -ne "y") {
    Write-Host "Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

# Run deployment
Write-Host "`nStarting deployment..." -ForegroundColor Yellow
Write-Host "(This will take 5-10 minutes)" -ForegroundColor Gray
Write-Host ""

# Use splatting for cleaner parameter passing
$deployParams = @{
    SubscriptionId   = $subscriptionId
    RegistryName     = $registryName
    Location         = $location
    AzureDevOpsOrg   = $adoOrg
    AzureDevOpsPat   = $adoPatPlain
    AzureDevOpsUrl   = $adoUrl
}

& "$PSScriptRoot\deploy.ps1" @deployParams
