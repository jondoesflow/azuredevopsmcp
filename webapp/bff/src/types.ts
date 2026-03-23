export interface AuthenticatedUser {
  objectId: string;
  tenantId: string;
  groups: string[];
  displayName?: string;
}

export interface ApiRequestContext {
  user?: AuthenticatedUser;
}

export interface AppConfig {
  port: number;
  corsOrigin: string;
  authMode: "enforced" | "off";
  entraTenantId: string;
  entraAudience: string;
  allowedGroupIds: string[];
  mcpBaseUrl: string;
  mcpApiKey: string;
}

export interface ChatRequestBody {
  message: string;
  project?: string;
  analysisMode?: "process" | "themes";
  fileName?: string;
}

export interface SetupConnectionInput {
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

export interface SetupConnectionState {
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
  enrichmentProcessStatus?: "found" | "migrated" | "not_checked" | "migration_failed";
}

export type ChatIntent =
  | { type: "help" }
  | { type: "listFiles" }
  | { type: "analyseDocument"; fileName?: string; analysisMode?: "process" | "themes" }
  | { type: "createBacklog"; project: string; fileName?: string; analysisMode?: "process" | "themes" }
  | { type: "deleteFile"; fileName?: string };

export interface BacklogReviewResult {
  fileName: string;
  analysisMode: "process" | "themes";
  storyMaturity: "placeholder" | "detailed";
  storyCount: number;
  warnings: string[];
  idempotencyKey: string;
  items: Array<{
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    sourceReferences?: string[];
    enrichment?: {
      dependencies?: {
        dependsOn: string[];
        blocks: string[];
        confidence: number;
        rationale?: string[];
      };
      definitionOfDone?: string[];
      confidence?: {
        title: number;
        description: number;
        acceptanceCriteria: number;
        overall: number;
        rationale?: string[];
      };
      missingPieces?: {
        issues: string[];
        suggestions: string[];
      };
      consistencyIssues?: Array<{
        conflictsWith: string[];
        description: string;
        severity?: "low" | "medium" | "high";
      }>;
      effort?: {
        tshirtSize: "XS" | "S" | "M" | "L" | "XL";
        confidence: number;
        reasoning: string;
      };
      qualityScore?: {
        score: number;
        breakdown: {
          clarity: number;
          completeness: number;
          testability: number;
          consistency: number;
        };
        issues: string[];
        recommendations: string[];
      };
    };
  }>;
}
