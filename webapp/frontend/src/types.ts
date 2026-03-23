export interface ChatResponse {
  reply: string;
  data?: unknown;
}

export interface ProcessResultData {
  executedTools?: string[];
  platform?: "azure-devops" | "jira";
  project?: string;
  boardUrl?: string;
  review?: BacklogReviewResult;
  backlog?: Record<string, unknown>;
}

export interface WorkItemDependencies {
  dependsOn: string[];
  blocks: string[];
  confidence: number;
  rationale?: string[];
}

export interface WorkItemConfidence {
  title: number;
  description: number;
  acceptanceCriteria: number;
  overall: number;
  rationale?: string[];
}

export interface WorkItemMissingPieces {
  issues: string[];
  suggestions: string[];
}

export interface WorkItemConsistencyIssue {
  conflictsWith: string[];
  description: string;
  severity?: "low" | "medium" | "high";
}

export interface WorkItemEffort {
  tshirtSize: "XS" | "S" | "M" | "L" | "XL";
  confidence: number;
  reasoning: string;
}

export interface WorkItemQualityScore {
  score: number;
  breakdown: {
    clarity: number;
    completeness: number;
    testability: number;
    consistency: number;
  };
  issues: string[];
  recommendations: string[];
}

export interface WorkItemEnrichment {
  dependencies?: WorkItemDependencies;
  definitionOfDone?: string[];
  confidence?: WorkItemConfidence;
  missingPieces?: WorkItemMissingPieces;
  consistencyIssues?: WorkItemConsistencyIssue[];
  effort?: WorkItemEffort;
  qualityScore?: WorkItemQualityScore;
}

export interface EnrichedWorkItem {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  sourceReferences?: string[];
  enrichment?: WorkItemEnrichment;
}

export interface BacklogReviewResult {
  fileName: string;
  analysisMode: "process" | "themes";
  storyMaturity: "placeholder" | "detailed";
  storyCount: number;
  warnings: string[];
  idempotencyKey: string;
  items: EnrichedWorkItem[];
}

export interface UploadedFile {
  fileName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export interface FileListResponse {
  count: number;
  files: UploadedFile[];
}

export interface UploadResponse {
  result: string;
  fileName: string;
  size: number;
  contentType: string;
}

export interface SetupConfigPayload {
  platform?: "azure-devops" | "jira";
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  azureDevOpsPat?: string;
  jiraBaseUrl?: string;
  jiraProject?: string;
  jiraApiToken?: string;
  sourceAdoOrgUrl?: string;
  sourceAdoProject?: string;
  sourceAdoProcessName?: string;
  sourceAdoPat?: string;
}

export interface SetupConfigState {
  platform?: "azure-devops" | "jira";
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  jiraBaseUrl?: string;
  jiraProject?: string;
  hasAzureDevOpsPat: boolean;
  hasJiraApiToken: boolean;
  isValidated: boolean;
  sourceAdoOrgUrl?: string;
  sourceAdoProject?: string;
  sourceAdoProcessName?: string;
  hasSourceAdoPat: boolean;
  enrichmentProcessStatus?: "found" | "migrated" | "not_checked" | "migration_failed" | "assigned" | "migrated_and_assigned" | "project_created";
}

export interface ValidateSetupResponse {
  validated: boolean;
  state: SetupConfigState;
  error?: string;
  enrichmentProcess?: {
    status: "found" | "migrated" | "not_checked" | "migration_failed" | "assigned" | "migrated_and_assigned" | "project_created";
    message?: string;
  };
}
