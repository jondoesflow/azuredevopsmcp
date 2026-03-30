import type { ProcessDefinition } from "./types.js";

/**
 * Finance and Operations — inherits from "Agile", adds F&O-specific fields.
 * Field definitions TBD — skeleton provided with same enrichment fields for now.
 * Update this file to add/remove fields specific to the F&O process.
 */
const definition: ProcessDefinition = {
  name: "Finance and Operations",
  parentProcess: "Agile",
  description:
    "Agile process customised for Finance and Operations implementations with enrichment fields.",
  workItemTypes: [
    "Microsoft.VSTS.WorkItemTypes.UserStory",
    "Microsoft.VSTS.WorkItemTypes.Bug",
    "Microsoft.VSTS.WorkItemTypes.Feature",
    "Microsoft.VSTS.WorkItemTypes.Epic",
    "Microsoft.VSTS.WorkItemTypes.Task",
  ],
  fields: [
    // Placeholder — update with F&O-specific fields when defined
    // For now, uses the same enrichment fields as Agile with Enrichment
    {
      referenceName: "Custom.EnrichmentConfidenceOverall",
      name: "Enrichment Confidence Overall",
      type: "string",
      description: "Overall confidence score for this work item.",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceTitle",
      name: "Enrichment Confidence Title",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceDescription",
      name: "Enrichment Confidence Description",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceAcceptanceCriteria",
      name: "Enrichment Confidence Acceptance Criteria",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentConfidenceRationale",
      name: "Enrichment Confidence Rationale",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentQualityScore",
      name: "Enrichment Quality Score",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentQualityClarity",
      name: "Enrichment Quality Clarity",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentQualityCompleteness",
      name: "Enrichment Quality Completeness",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentQualityTestability",
      name: "Enrichment Quality Testability",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentQualityConsistency",
      name: "Enrichment Quality Consistency",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentQualityIssues",
      name: "Enrichment Quality Issues",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentQualityRecommendations",
      name: "Enrichment Quality Recommendations",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentEffortTShirtSize",
      name: "Enrichment Effort T-Shirt Size",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentEffortConfidence",
      name: "Enrichment Effort Confidence",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentEffortReasoning",
      name: "Enrichment Effort Reasoning",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesDependsOn",
      name: "Enrichment Dependencies Depends On",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesBlocks",
      name: "Enrichment Dependencies Blocks",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesConfidence",
      name: "Enrichment Dependencies Confidence",
      type: "string",
    },
    {
      referenceName: "Custom.EnrichmentDependenciesRationale",
      name: "Enrichment Dependencies Rationale",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentDefinitionofDone",
      name: "Enrichment Definition of Done",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentMissingPiecesIssues",
      name: "Enrichment Missing Pieces Issues",
      type: "html",
    },
    {
      referenceName: "Custom.EnrichmentConsistencyIssues",
      name: "Enrichment Consistency Issues",
      type: "html",
    },
    {
      referenceName: "Custom.MoSCoW",
      name: "MoSCoW Priority",
      type: "string",
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
          label: "Quality & Effort",
          fields: [
            "Custom.EnrichmentQualityScore",
            "Custom.EnrichmentEffortTShirtSize",
            "Custom.EnrichmentEffortConfidence",
            "Custom.EnrichmentEffortReasoning",
          ],
        },
        {
          label: "Additional",
          fields: [
            "Custom.EnrichmentDefinitionofDone",
            "Custom.EnrichmentMissingPiecesIssues",
            "Custom.MoSCoW",
          ],
        },
      ],
    },
  ],
};

export default definition;
