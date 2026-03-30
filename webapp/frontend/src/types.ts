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

export type ProcessType = "agile-enrichment" | "finance-operations";

export interface SetupConfigPayload {
  processType?: ProcessType;
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  azureDevOpsPat?: string;
}

export interface SetupConfigState {
  processType?: ProcessType;
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  hasAzureDevOpsPat: boolean;
  isValidated: boolean;
}

export interface ProcessCheckResult {
  result: string;
  /** Provided by ensure_process_on_project */
  status?: "already_correct" | "process_exists_assigned" | "process_created_and_assigned" | "failed";
  message?: string;
  steps?: string[];
  /** Legacy fields from check_project_process — kept for backward compat */
  hasCorrectProcess: boolean;
  processName: string;
  expectedProcessName: string;
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

// ── Backlog Health Dashboard ────────────────────────────────────────

export interface BacklogHealthSummary {
  totalStories: number;
  ragDistribution: { red: number; amber: number; green: number; unscored: number };
  confidenceDistribution: { bucket: string; count: number }[];
  qualityDistribution: { bucket: string; count: number }[];
  effortBreakdown: Record<string, number>;
  dependencyGraph: { id: number; title: string; dependsOn: string[]; blocks: string[] }[];
  missingPiecesHeatmap: { issue: string; count: number }[];
  averageConfidence: number;
  averageQuality: number;
  coverageGaps: {
    noConfidence: number;
    noDependencies: number;
    noEffort: number;
    noQuality: number;
    noDoD: number;
  };
}

export interface StakeholderSummary {
  projectName: string;
  exportDate: string;
  epicCount: number;
  featureCount: number;
  storyCount: number;
  overallHealth: { red: number; amber: number; green: number };
  averageConfidence: number;
  averageQuality: number;
  topRisks: string[];
  effortDistribution: Record<string, number>;
}

export interface RefinementSuggestion {
  workItemId: number;
  currentTitle: string;
  currentDescription: string;
  currentAcceptanceCriteria: string[];
  suggestedTitle?: string;
  suggestedDescription?: string;
  suggestedAcceptanceCriteria?: string[];
  confidenceBefore: number;
  estimatedConfidenceAfter: number;
  improvements: string[];
}

export interface RRAIDItem {
  id: string;
  category: "Risk" | "Requirement" | "Assumption" | "Issue" | "Dependency";
  title: string;
  description: string;
  severity: "Low" | "Medium" | "High";
  sourceFile: string;
  sourceExcerpt: string;
  relatedStoryTitles: string[];
}
