#!/usr/bin/env bash
#
# Deploys the MCP Azure DevOps Server to Azure Container Instances (ACI).
#
# Usage:
#   ./deploy.sh \
#     --subscription "12345678-..." \
#     --registry "mcpregistry123" \
#     --ado-org "myOrg" \
#     --ado-pat "xxxx" \
#     --ado-url "https://dev.azure.com/myOrg"
#
# Optional flags:
#   --resource-group  (default: mcp-server-rg)
#   --container-name  (default: mcp-azure-devops)
#   --location        (default: eastus)
#   --mcp-api-key     (optional, enables API key auth)
#   --image-tag       (default: latest)
#   --skip-build      (skip Docker build, reuse existing image)

set -euo pipefail

# Defaults
RESOURCE_GROUP="mcp-server-rg"
CONTAINER_NAME="mcp-azure-devops"
LOCATION="eastus"
IMAGE_TAG="latest"
MCP_API_KEY=""
SKIP_BUILD=false

# Required (must be provided)
SUBSCRIPTION_ID=""
REGISTRY_NAME=""
ADO_ORG=""
ADO_PAT=""
ADO_URL=""

# --- Helpers ---
info()    { echo -e "\033[0;36m[$(date +%H:%M:%S)] $*\033[0m"; }
success() { echo -e "\033[0;32m[$(date +%H:%M:%S)] $*\033[0m"; }
err()     { echo -e "\033[0;31m[$(date +%H:%M:%S)] ERROR: $*\033[0m" >&2; }
header()  { echo -e "\n\033[0;36m$(printf '=%.0s' {1..60})\n$*\n$(printf '=%.0s' {1..60})\033[0m"; }

usage() {
  sed -n '3,16p' "$0"
  exit 1
}

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --subscription)    SUBSCRIPTION_ID="$2"; shift 2 ;;
    --resource-group)  RESOURCE_GROUP="$2";  shift 2 ;;
    --registry)        REGISTRY_NAME="$2";   shift 2 ;;
    --container-name)  CONTAINER_NAME="$2";  shift 2 ;;
    --location)        LOCATION="$2";        shift 2 ;;
    --ado-org)         ADO_ORG="$2";         shift 2 ;;
    --ado-pat)         ADO_PAT="$2";         shift 2 ;;
    --ado-url)         ADO_URL="$2";         shift 2 ;;
    --mcp-api-key)     MCP_API_KEY="$2";     shift 2 ;;
    --image-tag)       IMAGE_TAG="$2";       shift 2 ;;
    --skip-build)      SKIP_BUILD=true;      shift ;;
    -h|--help)         usage ;;
    *) err "Unknown option: $1"; usage ;;
  esac
done

# --- Validate required params ---
missing=()
[[ -z "$SUBSCRIPTION_ID" ]] && missing+=("--subscription")
[[ -z "$REGISTRY_NAME" ]]   && missing+=("--registry")
[[ -z "$ADO_ORG" ]]         && missing+=("--ado-org")
[[ -z "$ADO_PAT" ]]         && missing+=("--ado-pat")
[[ -z "$ADO_URL" ]]         && missing+=("--ado-url")

if [[ ${#missing[@]} -gt 0 ]]; then
  err "Missing required parameters: ${missing[*]}"
  usage
fi

# Validate registry name
if ! [[ "$REGISTRY_NAME" =~ ^[a-z0-9]{5,50}$ ]]; then
  err "Registry name must be 5-50 lowercase alphanumeric characters"
  exit 1
fi

REGISTRY_URL="${REGISTRY_NAME}.azurecr.io"
IMAGE_FULL="${REGISTRY_URL}/${CONTAINER_NAME}:${IMAGE_TAG}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Prerequisites ---
header "Checking Prerequisites"

if ! command -v az &>/dev/null; then
  err "Azure CLI (az) not found. Install: https://aka.ms/installazurecli"
  exit 1
fi
success "Azure CLI found: $(az version --query '\"azure-cli\"' -o tsv 2>/dev/null)"

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install: https://docs.docker.com/get-docker/"
  exit 1
fi
success "Docker found: $(docker --version)"

# --- Azure setup ---
header "Setting Azure Subscription"
info "Subscription: $SUBSCRIPTION_ID"
az account set --subscription "$SUBSCRIPTION_ID"
success "Subscription set"

header "Creating Resource Group"
info "Resource group: $RESOURCE_GROUP in $LOCATION"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --subscription "$SUBSCRIPTION_ID" \
  --output none
success "Resource group ready"

header "Creating Azure Container Registry"
info "Registry: $REGISTRY_NAME"
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$REGISTRY_NAME" \
  --sku Basic \
  --admin-enabled true \
  --subscription "$SUBSCRIPTION_ID" \
  --output none 2>/dev/null || true
success "Container registry ready"

# --- Get ACR credentials ---
header "Retrieving ACR Credentials"
ACR_USERNAME=$(az acr credential show \
  --name "$REGISTRY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "username" -o tsv \
  --subscription "$SUBSCRIPTION_ID")

ACR_PASSWORD=$(az acr credential show \
  --name "$REGISTRY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "passwords[0].value" -o tsv \
  --subscription "$SUBSCRIPTION_ID")

success "ACR credentials obtained"

# --- Docker build & push ---
if [[ "$SKIP_BUILD" == false ]]; then
  header "Building Docker Image"
  info "Building ${CONTAINER_NAME}:${IMAGE_TAG}..."
  docker build -t "${CONTAINER_NAME}:${IMAGE_TAG}" -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"
  success "Docker image built"

  header "Tagging & Pushing Image"
  docker tag "${CONTAINER_NAME}:${IMAGE_TAG}" "$IMAGE_FULL"
  echo "$ACR_PASSWORD" | docker login "$REGISTRY_URL" -u "$ACR_USERNAME" --password-stdin
  docker push "$IMAGE_FULL"
  success "Image pushed to $REGISTRY_URL"
else
  info "Skipping Docker build (--skip-build)"
fi

# --- Deploy to ACI ---
header "Deploying to Azure Container Instances"
info "Creating container: $CONTAINER_NAME"

ENV_VARS=(
  "AZURE_DEVOPS_ORG=$ADO_ORG"
  "AZURE_DEVOPS_PAT=$ADO_PAT"
  "AZURE_DEVOPS_URL=$ADO_URL"
  "PORT=8080"
  "AZURE_DEVOPS_PAT_SCOPE_POLICY=work-items-read-write"
  "TRANSPORT_MODE=http"
)

if [[ -n "$MCP_API_KEY" ]]; then
  ENV_VARS+=("MCP_API_KEY=$MCP_API_KEY")
fi

# Delete existing container if present (ACI doesn't support in-place updates)
az container delete \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_NAME" \
  --subscription "$SUBSCRIPTION_ID" \
  --yes --output none 2>/dev/null || true

az container create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_NAME" \
  --image "$IMAGE_FULL" \
  --cpu 1 \
  --memory 1 \
  --ports 8080 \
  --ip-address Public \
  --os-type Linux \
  --registry-login-server "$REGISTRY_URL" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --environment-variables "${ENV_VARS[@]}" \
  --subscription "$SUBSCRIPTION_ID" \
  --output none

success "Container instance created"

# --- Summary ---
header "Deployment Summary"

CONTAINER_IP=$(az container show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_NAME" \
  --subscription "$SUBSCRIPTION_ID" \
  --query "ipAddress.ip" -o tsv)

CONTAINER_STATE=$(az container show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CONTAINER_NAME" \
  --subscription "$SUBSCRIPTION_ID" \
  --query "instanceView.state" -o tsv 2>/dev/null || echo "Pending")

echo ""
info "Container: $CONTAINER_NAME"
info "State:     $CONTAINER_STATE"
info "IP:        $CONTAINER_IP"
info "Health:    http://${CONTAINER_IP}/health"
info "MCP:       http://${CONTAINER_IP}/mcp"
info "SSE:       http://${CONTAINER_IP}/sse"
echo ""
info "Useful commands:"
info "  Logs:    az container logs -g $RESOURCE_GROUP -n $CONTAINER_NAME"
info "  Restart: az container restart -g $RESOURCE_GROUP -n $CONTAINER_NAME"
info "  Delete:  az group delete -g $RESOURCE_GROUP --yes"
echo ""
success "Deployment complete! Configure Copilot Studio to connect to: http://${CONTAINER_IP}/sse"
