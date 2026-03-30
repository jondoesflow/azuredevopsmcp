import type { ProcessDefinition } from "./types.js";

/**
 * Agile with Enrichment — inherits from "Agile", adds confidence, quality,
 * effort, dependency, and MoSCoW fields to all standard work item types.
 */
const definition: ProcessDefinition = {
  name: "Agile with Enrichment",
  parentProcess: "Agile",
  description:
    "Agile process with enrichment fields for confidence scoring, quality metrics, effort estimation, dependency tracking, and MoSCoW prioritisation.",
  workItemTypes: [
    "Microsoft.VSTS.WorkItemTypes.UserStory",
    "Microsoft.VSTS.WorkItemTypes.Bug",
    "Microsoft.VSTS.WorkItemTypes.Feature",
    "Microsoft.VSTS.WorkItemTypes.Epic",
    "Microsoft.VSTS.WorkItemTypes.Task",
  ],
  fields: [
    // --- Confidence ---
    {
      referenceName: "Custom.EnrichmentConfidenceOverall",
      name: "Enrichment Confidence Overall",
      type: "string",
      description: "Overall confidence score for this work item (High / Medium / Low).",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceTitle",
      name: "Enrichment Confidence Title",
      type: "string",
      description: "Confidence score for the title.",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceDescription",
      name: "Enrichment Confidence Description",
      type: "string",
      description: "Confidence score for the description.",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceAcceptanceCriteria",
      name: "Enrichment Confidence Acceptance Criteria",
      type: "string",
      description: "Confidence score for acceptance criteria.",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceRationale",
      name: "Enrichment Confidence Rationale",
      type: "html",
      description: "Rationale for the confidence scores.",
    },

    // --- Quality ---
    {
      referenceName: "Custom.EnrichmentQualityScore",
      name: "Enrichment Quality Score",
      type: "string",
      description: "Overall quality score.",
    },
    {
      referenceName: "Custom.EnrichmentQualityClarity",
      name: "Enrichment Quality Clarity",
      type: "string",
      description: "Quality clarity breakdown.",
    },
    {
      referenceName: "Custom.EnrichmentQualityCompleteness",
      name: "Enrichment Quality Completeness",
      type: "string",
      description: "Quality completeness breakdown.",
    },
    {
      referenceName: "Custom.EnrichmentQualityTestability",
      name: "Enrichment Quality Testability",
      type: "string",
      description: "Quality testability breakdown.",
    },
    {
      referenceName: "Custom.EnrichmentQualityConsistency",
      name: "Enrichment Quality Consistency",
      type: "string",
      description: "Quality consistency breakdown.",
    },
    {
      referenceName: "Custom.EnrichmentQualityIssues",
      name: "Enrichment Quality Issues",
      type: "html",
      description: "Quality issues found.",
    },
    {
      referenceName: "Custom.EnrichmentQualityRecommendations",
      name: "Enrichment Quality Recommendations",
      type: "html",
      description: "Quality improvement recommendations.",
    },

    // --- Effort ---
    {
      referenceName: "Custom.EnrichmentEffortTShirtSize",
      name: "Enrichment Effort T-Shirt Size",
      type: "string",
      description: "T-shirt size effort estimate (XS, S, M, L, XL).",
    },
    {
      referenceName: "Custom.EnrichmentEffortConfidence",
      name: "Enrichment Effort Confidence",
      type: "string",
      description: "Confidence in the effort estimate.",
    },
    {
      referenceName: "Custom.EnrichmentEffortReasoning",
      name: "Enrichment Effort Reasoning",
      type: "html",
      description: "Reasoning behind the effort estimate.",
    },

    // --- Dependencies ---
    {
      referenceName: "Custom.EnrichmentDependenciesDependsOn",
      name: "Enrichment Dependencies Depends On",
      type: "html",
      description: "Work items this depends on.",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesBlocks",
      name: "Enrichment Dependencies Blocks",
      type: "html",
      description: "Work items this blocks.",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesConfidence",
      name: "Enrichment Dependencies Confidence",
      type: "string",
      description: "Confidence in the dependency analysis.",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesRationale",
      name: "Enrichment Dependencies Rationale",
      type: "html",
      description: "Rationale for dependency analysis.",
    },

    // --- Definition of Done ---
    {
      referenceName: "Custom.EnrichmentDefinitionofDone",
      name: "Enrichment Definition of Done",
      type: "html",
      description: "Definition of done criteria.",
    },

    // --- Missing Pieces ---
    {
      referenceName: "Custom.EnrichmentMissingPiecesIssues",
      name: "Enrichment Missing Pieces Issues",
      type: "html",
      description: "Missing pieces and gaps identified.",
    },

    // --- Consistency ---
    {
      referenceName: "Custom.EnrichmentConsistencyIssues",
      name: "Enrichment Consistency Issues",
      type: "html",
      description: "Consistency issues found in the work item.",
    },

    // --- MoSCoW ---
    {
      referenceName: "Custom.MoSCoW",
      name: "MoSCoW Priority",
      type: "string",
      description: "MoSCoW prioritisation (Must, Should, Could, Won't).",
      allowedValues: ["Must", "Should", "Could", "Won't"],
    },
  ],
  layoutPages: [
    {
      label: "Enrichment",
      groups: [
        {
          label: "Confidence Scores",
          fields: [
            "Custom.EnrichmentConfidenceOverall",
            "Custom.EnrichmentConfidenceTitle",
            "Custom.EnrichmentConfidenceDescription",
            "Custom.EnrichmentConfidenceAcceptanceCriteria",
            "Custom.EnrichmentConfidenceRationale",
          ],
        },
        {
          label: "Quality Metrics",
          fields: [
            "Custom.EnrichmentQualityScore",
            "Custom.EnrichmentQualityClarity",
            "Custom.EnrichmentQualityCompleteness",
            "Custom.EnrichmentQualityTestability",
            "Custom.EnrichmentQualityConsistency",
            "Custom.EnrichmentQualityIssues",
            "Custom.EnrichmentQualityRecommendations",
          ],
        },
        {
          label: "Effort Estimation",
          fields: [
            "Custom.EnrichmentEffortTShirtSize",
            "Custom.EnrichmentEffortConfidence",
            "Custom.EnrichmentEffortReasoning",
          ],
        },
        {
          label: "Dependencies",
          fields: [
            "Custom.EnrichmentDependenciesDependsOn",
            "Custom.EnrichmentDependenciesBlocks",
            "Custom.EnrichmentDependenciesConfidence",
            "Custom.EnrichmentDependenciesRationale",
          ],
        },
        {
          label: "Additional",
          fields: [
            "Custom.EnrichmentDefinitionofDone",
            "Custom.EnrichmentMissingPiecesIssues",
            "Custom.EnrichmentConsistencyIssues",
            "Custom.MoSCoW",
          ],
        },
      ],
    },
  ],
};

export default definition;
