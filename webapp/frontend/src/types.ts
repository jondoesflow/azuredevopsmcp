export interface ChatResponse {
  reply: string;
  data?: unknown;
}

export interface ProcessResultData {
  executedTools?: string[];
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
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  azureDevOpsPat?: string;
}

export interface SetupConfigState {
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  hasAzureDevOpsPat: boolean;
  isValidated: boolean;
}

export interface ValidateSetupResponse {
  validated: boolean;
  state: SetupConfigState;
  error?: string;
}

export interface EnrichmentCheckResult {
  result: string;
  hasEnrichmentFields: boolean;
  processName: string;
  missingFieldCount: number;
  missingFields: string[];
}

export interface MigrateEnrichmentPayload {
  sourceOrgUrl: string;
  sourceProject: string;
  sourceProcessName: string;
  sourcePat: string;
  newProjectName: string;
}

export interface MigrateEnrichmentResult {
  result: string;
  message: string;
  processName?: string;
  newProjectName?: string;
  newProjectId?: string;
  boardUrl?: string;
  setupState?: SetupConfigState;
}
