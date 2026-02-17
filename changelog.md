# Changelog

This changelog tracks updates **from this point onward**, with a focus on MCP server code and deployment behavior.

## 2026-02-17

### MCP Server (mcp-server)
- Improved `create_backlog` quality and consistency behavior:
  - Added optional `areaPath` input for generated work items.
  - `create_backlog` now enforces iteration path `Project\\Backlog` for all generated backlog items.
  - Persona is now derived automatically by the MCP server from the uploaded transcript content.
  - Strengthened deduplication with normalized title matching (case/punctuation insensitive).
  - Added compatibility matching so existing legacy story titles (for example, matching the feature title) are reused and normalized instead of duplicated.
  - Standardized story description format to include explicit **User Story** and **Context** sections.
  - Enhanced feature and epic descriptions with clearer summary wording.

### Azure DevOps Client
- Extended work item create support:
  - Added `areaPath` support (`/fields/System.AreaPath`) on create.
- Extended work item update support to normalize reused items during backlog regeneration:
  - Added support to update title, description, iteration path, area path, MoSCoW, and acceptance criteria.
- Existing invalid-iteration fallback remains in place: if an iteration path is invalid, create retries without `System.IterationPath`.

### Prompt/Orchestration Alignment
- Updated Copilot Studio prompt to:
  - confirm project before `create_backlog`
  - document fixed server-side iteration path rule: `Project\\Backlog`
  - document server-side persona derivation from transcript
  - enforce strict result formatting and safe metadata-only handling

### Deployment
- Prepared for next deployment tag after code validation.

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

### Documentation / Process Policy
- Streamlined markdown documentation to focus on core docs:
  - `mcp-server/AZURE-DEPLOYMENT.md`
  - `mcp-server/SETUP-GUIDE.md`
  - `changelog.md`
- Removed redundant markdown files to reduce maintenance overhead.

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
