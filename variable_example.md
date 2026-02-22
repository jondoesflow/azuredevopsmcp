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
# Jira Configuration
# ============================

# Jira base URL
# Example: https://your-company.atlassian.net
JIRA_BASE_URL=https://your-jira-instance.atlassian.net

# Jira authentication type
# Common values: Bearer | Basic
JIRA_AUTH_TYPE=Bearer

# Jira username (often an email or service account)
# Example: service-account@company.com
JIRA_USERNAME=your-jira-username

# Jira API token
# Example format: jira_api_token_xxxxxxxxx
JIRA_API_TOKEN=your-jira-api-token


# ============================
# Jira Field & Linking Configuration
# ============================

# Custom field ID used to link Epics
# Example: customfield_10001
JIRA_EPIC_LINK_FIELD_ID=customfield_XXXXX

# Custom field ID for Epic Name
# Example: customfield_10004
JIRA_EPIC_NAME_FIELD_ID=customfield_YYYYY

# Jira issue link type used for hierarchy
# Common examples: Relates, Blocks, Parent/Child
JIRA_HIERARCHY_LINK_TYPE=Relates


# ============================
# MCP Configuration
# ============================

# MCP API key
# Example format: uuid-uuid-uuid
MCP_API_KEY=your-mcp-api-key