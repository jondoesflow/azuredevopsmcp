export type ConsistencySeverity = "low" | "medium" | "high";
export type TShirtSize = "XS" | "S" | "M" | "L" | "XL";

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
  severity?: ConsistencySeverity;
}

export interface WorkItemEffort {
  tshirtSize: TShirtSize;
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

export interface EnrichmentWorkItem {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  tags?: string[];
  sourceReferences?: string[];
  enrichment?: WorkItemEnrichment;
}

export interface EnrichmentFlags {
  enabled: boolean;
  dependencies: boolean;
  definitionOfDone: boolean;
  confidence: boolean;
  missingPieces: boolean;
  consistency: boolean;
  effort: boolean;
  quality: boolean;
  aiAssist: boolean;
}

export interface EnrichmentContext {
  transcriptContent?: string;
  analysisMode?: "process" | "themes";
}

export interface EnrichmentResult {
  items: EnrichmentWorkItem[];
  warnings: string[];
  idempotencyKey: string;
}

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
