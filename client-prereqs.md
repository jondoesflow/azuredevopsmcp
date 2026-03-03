# Client Prerequisites — MCP Azure DevOps Backlog Automation

## 1) Platform & Access
- **Azure subscription** with permissions to create and manage:
  - Resource Group
  - Azure Container Registry (ACR)
  - Container hosting (ACI/ACA depending on deployment model)
- **Role requirement**: at least **Contributor** on target subscription/resource group.
- **Azure DevOps organization** with at least one target project.
- **Copilot Studio / Power Platform licensing** for agent + Power Automate flow execution.

## 2) Identity, Secrets, and Security Inputs
- **Azure DevOps PAT** with minimum scope:
  - Work Items: **Read & Write**
- **MCP API key** (random high-entropy secret) used by:
  - Copilot Studio MCP connector (header auth)
  - Power Automate upload call (`/upload`)
- Secure secret handling approach agreed (Key Vault or equivalent CI/CD secret store).
- No plaintext tokens committed to source control; `.env` only for local dev.

## 3) Runtime & Build Tooling
- **Node.js 20+** (local build/test).
- **Azure CLI** installed and authenticated to correct tenant/subscription.
- **Docker Desktop** (if building images locally), or approved cloud build path (ACR build).
- Git access to repository and branch strategy agreed (`dev` / `main`).

## 4) Network & Endpoint Requirements
- Publicly reachable MCP service endpoint for:
  - `GET /health`
  - `POST /upload`
  - `POST /mcp` (and `/sse` if used by client channel)
- Allowed outbound connectivity from hosted MCP container to:
  - Azure DevOps REST API
- Allowed inbound connectivity from:
  - Copilot Studio and Power Automate to MCP endpoint
- TLS strategy agreed (managed cert / ingress) if production security policy requires HTTPS-only traffic.

## 5) Mandatory Application Configuration
Provide/approve values for:
- `AZURE_DEVOPS_ORG`
- `AZURE_DEVOPS_URL`
- `AZURE_DEVOPS_PAT`
- `MCP_API_KEY`
- `PORT`
- `TRANSPORT_MODE`

If Jira parity is in scope, also provide Jira config values (base URL, auth mode, API token, and Jira-specific field IDs).

## 6) Copilot Studio Configuration Prereqs
- Agent created with MCP tool connection.
- MCP connector configured with:
  - URL: MCP `/mcp` endpoint
  - API Key header auth (`apikey`)
- Agent instructions/topic design approved for:
  - file upload
  - document analysis
  - backlog creation sequence

## 7) Power Automate Flow Prereqs
- Flow using **Run a flow from Copilot** trigger.
- Ability to send file attachment content from Copilot topic to flow.
- HTTP action available to call MCP `/upload` with:
  - `Content-Type: application/json`
  - `apikey: <MCP_API_KEY>`
- Base64 encoding of binary file content before upload payload submission.

## 8) Validation & Operational Readiness
- Pre-production validation checklist:
  - `/health` returns healthy
  - tool discovery returns expected tool count
  - upload + analysis + `create_backlog` end-to-end test passes
- Logging/monitoring access available for support team (container logs + deployment status).
- Agreed support model for token rotation, redeployments, and incident triage.

## 9) Client Deliverables Before Implementation Start
1. Named Azure subscription/tenant and deployment region.
2. Azure DevOps org/project details and PAT owner process.
3. MCP API key management owner and secret vault location.
4. Copilot Studio environment and licensing confirmation.
5. Power Automate environment and HTTP connector readiness.
6. Network/security approval for endpoint exposure and API access.

---

### Source Basis
This prerequisite summary is derived from implementation requirements in `mcp-server/SETUP-GUIDE.md` and condensed for client planning and technical onboarding.
