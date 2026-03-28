# ============================
# Azure DevOps Configuration
# ============================

# Azure DevOps organisation name (e.g. myOrgName)
AZURE_DEVOPS_ORG=your-org-name

# Azure DevOps Personal Access Token (PAT)
# Example format: azdopat_xxxxxxxxxxxxxxxxxxxxxx
AZURE_DEVOPS_PAT=your-azure-devops-pat

# Base URL for Azure DevOps
# Example: https://dev.azure.com/your-org-name
AZURE_DEVOPS_URL=https://dev.azure.com/your-org-name


# ============================
# Server Configuration
# ============================

# Port the service runs on
# Example: 8080
PORT=8080

# Transport mode: http or https
TRANSPORT_MODE=http

# Enable debug logging (true | false)
DEBUG=false


# ============================
# MCP Configuration
# ============================

# MCP API key
# Example format: uuid-uuid-uuid
MCP_API_KEY=your-mcp-api-key


# ============================
# Process Migration (Optional)
# ============================

# Source Azure DevOps org URL (setting this enables process migration)
# Example: https://dev.azure.com/source-org
SOURCE_ADO_ORG_URL=https://dev.azure.com/your-source-org

# Source project name that uses the Enrichment process
SOURCE_ADO_PROJECT=your-source-project

# Name of the Enrichment process template to migrate
SOURCE_ADO_PROCESS_NAME=Enrichment

# PAT for the source Azure DevOps org
SOURCE_ADO_PAT=your-source-pat

# Target Azure DevOps org URL (defaults to AZURE_DEVOPS_URL if not set)
# TARGET_ADO_ORG_URL=https://dev.azure.com/your-target-org

# Target project (defaults to AZURE_DEVOPS_ORG if not set)
# TARGET_ADO_PROJECT=your-target-project

# Target PAT (defaults to AZURE_DEVOPS_PAT if not set)
# TARGET_ADO_PAT=your-target-pat