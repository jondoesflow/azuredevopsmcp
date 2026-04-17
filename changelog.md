# Changelog

This changelog tracks updates **from this point onward**, with a focus on MCP server code and deployment behavior.

## 2026-04-17

### Security hardening
- **fix(bff)**: Added non-dev startup guard to block `AUTH_MODE=off` outside development.
- **fix(bff)**: Added non-dev startup guard requiring `ENTRA_ALLOWED_GROUP_IDS` when auth mode is enforced.
- **fix(bff)**: Added non-dev startup guard requiring a non-default `SETUP_ENCRYPTION_KEY`.
- **fix(bff)**: Enforced HTTPS-only requests outside development (proxy-aware).
- **fix(mcp)**: Removed query-string API key authentication (`?api_key=...`); headers only.
- **fix(mcp)**: Added MCP/SSE endpoint rate limiting in addition to upload throttling.
- **fix(mcp)**: Enforced HTTPS-only requests outside development (proxy-aware).
- **fix(mcp)**: Sanitized/encoded description and acceptance-criteria fields before Azure DevOps writes.
- **fix(mcp)**: Added PAT/API-key redaction in logger output.
- **fix(container)**: Switched MCP container runtime to non-root user and non-privileged port `8080`.
- **docs**: Updated deployment/setup docs with port `8080`, PAT minimum-scope policy, and TLS requirements.
- **docs**: Added `security_issues.md` with full item-by-item status and external follow-up actions.

## 1.1.0 — 2026-03-30
- **feat**: Auto-provision process templates — tool now creates the required process and assigns it to the project automatically if missing
- **feat**: Configurable process definitions (`processDefinitions/`) — new process types added via config files, no code changes
- **feat**: `ensure_process_on_project` MCP tool — orchestrates check, create, and assign in one step
- **feat**: Progressive validation UI — shows step-by-step provisioning progress instead of manual ADO instructions
- **feat**: Version and build timestamp displayed in header
- **feat**: PDF, DOCX, XLSX file upload support with text extraction (mammoth, pdf-parse, xlsx)
- **feat**: Duplicate detection on `create_backlog` — title-based dedup at all hierarchy levels
- **feat**: Backlog Health Dashboard with RAG donut, confidence histogram, effort/quality breakdowns
- **feat**: Story Refinement Assistant — before/after suggestions for low-confidence stories
- **feat**: RRAID Log — extract Risks, Requirements, Assumptions, Issues, Dependencies from documents
- **feat**: Multi-file analysis — upload multiple documents with role tagging
- **feat**: Excel/CSV/JSON export of backlog data with enrichment fields
- **feat**: In-app User Guide accessible from header (?) button
- **fix**: DOCX text extraction now uses clean plaintext instead of base64 garble
- **fix**: Rate limiter increased to 50 attempts for validation
- **fix**: Config modal UI improvements — consistent button labelling, spacing
- **test**: Expanded unit and integration test coverage for `workItems.ts` core logic, handlers, and utility wrappers (achieved 91.15% coverage)
- **infra**: All packages bumped to v1.1.0

## 1.0.0 — 2026-03-28
- **breaking**: Removed all Jira integration — ADO-only tool (−1,703 lines)
- **feat**: Enrichment field check after connection validation
- **feat**: Process migration UI in web app wizard
- **feat**: New MCP tools: `check_enrichment_fields`, `migrate_enrichment_process`
- **fix**: BFF setupStore now properly resets isValidated on save
- **infra**: Rebuilt ACA environment without VNet (removed Jira networking resources)
- **infra**: Frontend deployed with Entra ID SPA credentials

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
