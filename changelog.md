# Changelog

This changelog tracks updates **from this point onward**, with a focus on MCP server code and deployment behavior.

## 2026-02-16

### MCP Server (mcp-server)
- Updated backlog generation logic to align with the latest Copilot Studio prompt requirements.
- `create_backlog` now creates richer hierarchy content:
  - Epic descriptions include a summary list of child features.
  - Feature descriptions include a summary of intended child user stories.
  - User story titles are now distinct from feature titles (prefixed with `Implement ...`).
  - User story descriptions use more contextual business wording.
- Added MoSCoW support to work item creation using custom Azure DevOps field:
  - Field reference: `Custom.MoSCoW`
  - Default value for generated user stories: `Must`
- Added duplicate-prevention logic in `create_backlog` to avoid recreating Epics, Features, User Stories, and Tasks that already exist by title under the expected parent.
- Added Route iteration support for generated backlog items:
  - `create_backlog` now assigns all created items to iteration path `Project\\Route` by default.
  - Optional `iterationPath` input can override the default if needed.

### Azure DevOps Client
- Extended work item payload support in `azureDevOpsClient.ts`:
  - Added `moscow?: string` to `WorkItemInput`.
  - Added support for writing `/fields/Custom.MoSCoW` during work item creation.
- Added `iterationPath?: string` to `WorkItemInput` and support for writing `/fields/System.IterationPath` on create.
- Added/retained support for additional metadata fields (`priority`, `tags`) in work item create payloads.

### Prompt/Orchestration Alignment
- Updated Copilot Studio guidance to ensure the agent discovers uploaded files via `list_uploaded_files` before analysis.
- Upload flow remains:
  1. Upload via `/upload`
  2. `list_uploaded_files`
  3. `analyse_document`
  4. `create_backlog`
  5. Optional `delete_file`

---

## Format for future entries
Use this structure for each update:

```md
## YYYY-MM-DD

### MCP Server (mcp-server)
- ...

### Azure DevOps Client
- ...

### Prompt/Orchestration Alignment
- ...

### Deployment
- Image tag:
- ACR digest:
- Container endpoint:
```
