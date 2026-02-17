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
- Added process-first discovery capabilities alongside legacy tooling:
  - `analyse_document` now supports `analysisMode` with `themes` (legacy default) and `process` (To-Be process-first).
  - Analysis output is now stored with mode metadata for backward compatibility.
  - `create_backlog` now supports process-first inputs:
    - `processFileName` (preferred analysed process document)
    - `evidenceFileName` (optional transcript/supporting evidence)
    - `storyMaturity` (`placeholder` default for process-first, optional `detailed`)
    - `designReferences` (optional traceability links/IDs)
  - Process-first backlog generation now creates discovery placeholder stories with fit-gap and provenance context.
  - Process-first tasks now focus on fit-gap, design linking, and refinement before implementation.
  - Legacy transcript/theme backlog generation remains supported for backward compatibility.

### Azure DevOps Client
- Extended work item create support:
  - Added `areaPath` support (`/fields/System.AreaPath`) on create.
- Extended work item update support to normalize reused items during backlog regeneration:
  - Added support to update title, description, iteration path, area path, MoSCoW, and acceptance criteria.
- Added support to update work item tags (`System.Tags`) during update operations to preserve process-first provenance markers.
- Existing invalid-iteration fallback remains in place: if an iteration path is invalid, create retries without `System.IterationPath`.

### Prompt/Orchestration Alignment
- Updated Copilot Studio prompt to:
  - confirm project before `create_backlog`
  - document fixed server-side iteration path rule: `Project\\Backlog`
  - document server-side persona derivation from transcript
  - enforce strict result formatting and safe metadata-only handling
- Updated prompt with process-first operating guidance:
  - prefer `analysisMode=process` for To-Be process docs
  - use placeholder story maturity during discovery
  - treat transcripts as supporting evidence rather than sole source of truth
  - retain explicit legacy fallback path for transcript/theme workflows

### Deployment
- Image tag: `v33`
- ACR digest: `sha256:cd739d3b54bd5afa9d1bb1f813a17f1c1f2530b1491837c8f156df73f884157a`
- Container endpoint: `http://mcp-cgsparc.uksouth.azurecontainer.io`

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
