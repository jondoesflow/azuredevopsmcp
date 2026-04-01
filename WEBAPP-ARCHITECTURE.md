# WebApp Architecture Summary

## What This Application Does

This is an **AI-powered Azure DevOps enrichment platform** that:

1. **Uploads & Analyzes Documents** - Users can upload project documentation (.txt, .md, .csv, .json, .xml, .log)
2. **AI Document Processing** - Analyzes documents to extract requirements & backlog items
3. **Auto-creates Azure DevOps Backlog** - Generates user stories, features, epics in an authenticated Azure DevOps project
4. **Enriches Work Items** - Adds AI-generated metadata:
   - Confidence scores
   - Quality scores
   - Story maturity estimates
   - Missing pieces / risks
   - Dependencies
5. **Provides Dashboards & Exports** - Health metrics, CSV exports, summary reports
6. **Manages RRAID Items** - Tracks Risks, Assumptions, Issues, Dependencies
7. **Suggests Story Refinements** - AI-powered improvements to existing backlog items

## User Workflow

```
1. [Setup] Authenticate with Azure DevOps (org, project, PAT)
2. [Validate] Confirm connection works & select/create process template
3. [Upload] Submit project document(s)
4. [Process] Trigger AI analysis → auto-create backlog items
5. [Review] View dashboard metrics, review suggestions
6. [Refine] Accept/apply AI improvements to stories
7. [Track] Monitor RRAID items & project health
8. [Export] Download backlog as CSV or summary report
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Frontend                             │
│              (React/Vue/etc - not shown)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Express.js BFF (Backend-for-Frontend)             │
│  • Setup & validation                                       │
│  • File upload/management                                   │
│  • Request orchestration                                    │
│  • Error handling & rate limiting                           │
│  • Per-user state management                                │
└────────┬─────────────────────────────────────┬──────────────┘
         │                                     │
         ▼ REST API                            ▼ REST API
    ┌─────────────────────┐         ┌──────────────────────┐
    │  Azure DevOps API   │         │   MCP Server         │
    │  • Validate project │         │  • Analyze documents │
    │  • CRUD work items  │         │  • List/delete files │
    │  • Query backlog    │         │  • Create backlog    │
    │  • Update items     │         │  • Process templates │
    └─────────────────────┘         │  • Refine stories    │
                                    │  • Extract RRAID     │
                                    └──────────────────────┘
```

## Key Responsibilities by Layer

### Frontend (Not in this code)
- User login
- Setup wizard (collect Azure DevOps credentials)
- File upload UI
- Document preview
- Backlog & dashboard views
- Refinement suggestion approval UI

### BFF (Express Backend - Code Shown)
- **Authentication**: Extract user identity
- **Validation**: Sanitize inputs, check Azure DevOps connection
- **Orchestration**: Coordinate calls to MCP server
- **State Management**: Track user config via SetupStore
- **Error Handling**: Graceful failures, rate limiting
- **Response Mapping**: Format tool outputs for frontend

### MCP Server (External)
- **AI/LLM Processing**: Analyze documents, suggest improvements
- **Integration**: Connect to Azure DevOps via user credentials
- **Tools**: Provide specialized functions for backlog operations

### Azure DevOps (External)
- **Source of Truth**: Store projects, work items, custom fields
- **Validation**: Confirm credentials and project existence
- **Execution**: Create/update work items with enrichment data

## Data Model

### User Setup State
```typescript
{
  processType?: "agile-enrichment" | "finance-operations"
  azureDevOpsOrg?: string        // "contoso"
  azureDevOpsUrl?: string        // "https://dev.azure.com/contoso"
  azureDevOpsProject?: string    // "MyProject"
  azureDevOpsPat?: string        // Secure storage
  hasAzureDevOpsPat: boolean
  isValidated: boolean
}
```

### Enrichment Custom Fields (Azure DevOps)
- `Custom.EnrichmentConfidenceOverall` - 0-100 score
- `Custom.EnrichmentQualityScore` - Quality metric
- `Custom.EnrichmentEffortTShirtSize` - Small/Medium/Large/XL
- `Custom.EnrichmentMissingPiecesIssues` - Pipe-delimited risks
- `Custom.EnrichmentDependenciesDependsOn` - Link to dependent items

## Integration Points

### Azure DevOps API
- **Auth**: Basic auth (`:PAT` base64 encoded)
- **Validation**: `GET /_apis/projects` → list projects
- **Work Item CRUD**: Create epics, features, user stories with custom fields

### MCP Server Protocol
- **Tools**: Call by name with typed parameters
- **Sequential Execution**: Chain dependent tools (analyze → preview → create)
- **Responses**: JSON or string (auto-parsed)

## Security Model

1. **Per-User Isolation**: Each user has isolated state & credentials
2. **Credential Storage**: PAT tokens stored encrypted (implementation detail)
3. **No Direct Secrets**: Frontend never receives Azure DevOps PAT
4. **Input Sanitization**: File names, URLs validated before use
5. **Rate Limiting**: Prevent abuse of expensive operations
6. **Error Messages**: Don't leak internal/system details

## Performance Considerations

- **SetupStore**: In-memory (single instance) - suitable for small user bases
- **Rate Limiting**: Per-15min windows to prevent DoS
- **Sequential Tools**: Not parallelized - acceptable for one user at a time
- **CSV Export**: String concatenation - fine for <10k items
- **File Uploads**: Text-based, Base64 encoded - limits file size

## Deployment Notes

**Environment Variables**:
- `FACTS_API_KEY` - Optional, for /facts/random endpoint

**Assumptions**:
- MCP Server is running and accessible at `config.mcpBaseUrl`
- Azure DevOps is reachable (public internet)
- Authentication middleware sets `req.user.objectId`
- Node.js environment with Express ecosystem

## Future Enhancements

- [ ] Streaming CSV exports (vs. loading all items)
- [ ] Pagination for dashboard queries
- [ ] Batch work item updates
- [ ] Webhook support (listen to Azure DevOps changes)
- [ ] Import from other sources (Jira, Linear, etc.)
- [ ] Advanced filtering/search on backlog
- [ ] Custom field mapping UI
- [ ] Audit logging for RRAID changes
- [ ] Multi-project support in single session
