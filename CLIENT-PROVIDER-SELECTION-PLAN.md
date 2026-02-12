# Jira vs Azure MCP Client Selection Plan

## Goal
Enable the MCP client layer to let users choose a work-management provider at runtime:
- **Azure DevOps MCP** (current behavior)
- **Jira MCP** (new option)

---

## Current State (Observed)
The implementation is tightly coupled to Azure DevOps:
- Startup creates a single `AzureDevOpsClient` instance and injects it into all work-item tools.
- Tool handlers call Azure-specific methods and assumptions (work item type names, parent links, fields).
- Configuration only supports Azure environment variables.

This means there is no provider abstraction today.

---

## Required Changes

## 1) Introduce a provider abstraction
Create a common interface for work-management operations used by tools, for example:
- `listEpics(project)`
- `listFeatures(project)`
- `listUserStories(project)`
- `getUserStory(project, id)`
- `listTasks(project)`
- `createEpic(...)`, `createFeature(...)`, `createUserStory(...)`, `createTask(...)`
- `updateWorkItem(...)`
- `addAcceptanceCriteria(...)`

### Deliverables
- New `WorkManagementClient` interface
- Adapter implementation for **Azure** wrapping current `AzureDevOpsClient`
- Adapter implementation for **Jira** wrapping Jira REST/API client

---

## 2) Add provider selection configuration
Add a provider selector in config, e.g.:
- `WORK_PROVIDER=azure|jira`

Provider-specific config blocks:
- Azure (existing): `AZURE_DEVOPS_*`
- Jira (new): e.g. `JIRA_BASE_URL`, `JIRA_EMAIL`/`JIRA_USER`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`

### Validation behavior
- Validate only the active provider’s required variables.
- Fail fast on startup if selected provider configuration is incomplete.

---

## 3) Add a provider factory
Create a factory that returns the right implementation from config:
- `createWorkManagementClient(config): WorkManagementClient`

Startup should use this factory instead of directly instantiating `AzureDevOpsClient`.

---

## 4) Refactor tool handlers to provider-neutral logic
Replace Azure-specific type usage in `tools/workItems.ts` with provider-neutral calls.

### Mapping considerations
Different systems use different domain terms and field models:
- Azure: Epic / Feature / User Story / Task
- Jira: often Epic / Story / Sub-task (Feature may be project-specific)

Implement a mapping strategy:
- Keep external MCP tool names stable.
- Internally map tool intent to provider-native issue/work-item types.
- Put type mapping in provider adapter config (not in tool handlers).

---

## 5) Normalize IDs and links in responses
Define a consistent response shape from adapters:
- `id` (string)
- `title`
- `description`
- `state/status`
- `assignee`
- `parentId`
- `webUrl`

Ensure both providers return this normalized shape so tools and prompts remain consistent.

---

## 6) Update backlog-generation path
`create_backlog` currently assumes Azure hierarchy and names.

Required updates:
- Rework backlog creator to use provider-agnostic operations.
- Make hierarchy depth configurable per provider (Jira may not have a native “Feature” in all projects).
- Keep acceptance criteria generation provider-neutral and map to provider-specific field(s).

---

## 7) Add tests for provider parity
Add tests at three layers:
1. **Unit tests** for each adapter method.
2. **Contract tests** enforcing adapter output matches `WorkManagementClient` contract.
3. **Integration tests** for end-to-end tool calls with `WORK_PROVIDER=azure` and `WORK_PROVIDER=jira`.

Minimum regression coverage:
- list/create/update operations
- parent-child linking
- acceptance criteria persistence
- backlog creation flow

---

## 8) Documentation and rollout
Update docs with:
- New env vars
- Provider selection examples
- Capability differences/limitations per provider
- Migration guidance for existing Azure-only users

Rollout recommendation:
1. Ship behind `WORK_PROVIDER` flag (default `azure`).
2. Validate Jira path in staging.
3. Gradually enable in production tenants.

---

## Suggested File-Level Implementation Plan

1. **New files**
- `mcp-server/src/clients/workManagementClient.ts` (interface)
- `mcp-server/src/clients/providers/azureClientAdapter.ts`
- `mcp-server/src/clients/providers/jiraClientAdapter.ts`
- `mcp-server/src/clients/providerFactory.ts`

2. **Refactors**
- `mcp-server/src/config.ts` (provider selection + validation)
- `mcp-server/src/index.ts` (use provider factory)
- `mcp-server/src/tools/workItems.ts` (use provider-neutral client)

3. **Docs**
- README + setup docs for provider selection and Jira setup

---

## Risks / Decisions to Confirm
- Jira issue type strategy (standard vs custom “Feature” type).
- Where acceptance criteria is stored in Jira (description, custom field, plugin field).
- Whether all 19 tools remain identical across providers or a capability matrix is needed.
- Authentication model for Jira Cloud vs Server/Data Center.

---

## Definition of Done
- Runtime provider selection works via configuration.
- Existing Azure workflows remain backward compatible.
- Jira supports equivalent core tool operations.
- Tool outputs remain stable for Copilot Studio prompts.
- Test suite covers provider-specific and shared behavior.
