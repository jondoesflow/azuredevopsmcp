import { AzureDevOpsClient } from "../azureDevOpsClient.js";
import { logger } from "../logger.js";
import { checkProjectProcess, checkEnrichmentProcessExists, migrateProcess, createProjectWithProcess, ensureProcessOnProject } from "../processMigration.js";
import { enrichGeneratedWorkItems } from "./enrichment/orchestrator.js";
import {
  EnrichmentFlags,
  EnrichmentWorkItem,
  WorkItemDependencies,
  WorkItemEnrichment,
} from "./enrichment/types.js";
import { generateRefinementSuggestion } from "./enrichment/refinement.js";
import { extractRRAID, matchRRAIDToStories, type RRAIDItem } from "./rraid.js";

// Strip HTML tags and decode entities to plain text
function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll(/\s+/g, " ")
    .trim();
}

async function persistAdoDependencies(
  client: AzureDevOpsClient,
  project: string,
  preview: StoredPreview | undefined,
  storyIdByPreviewId: Map<string, number>
): Promise<number> {
  if (!preview) return 0;

  let linkCount = 0;
  for (const item of preview.items) {
    const sourceStoryId = storyIdByPreviewId.get(item.id);
    if (!sourceStoryId) continue;

    const dependency: WorkItemDependencies | undefined = item.enrichment?.dependencies;
    if (!dependency) continue;

    for (const depId of dependency.dependsOn) {
      const targetStoryId = storyIdByPreviewId.get(depId);
      if (!targetStoryId || targetStoryId === sourceStoryId) continue;
      try {
        await client.addRelation({
          project,
          sourceWorkItemId: sourceStoryId,
          targetWorkItemId: targetStoryId,
          relationType: "System.LinkTypes.Related",
        });
        linkCount++;
      } catch (error) {
        logger.warn("Unable to persist Azure DevOps dependency relation", {
          sourceStoryId,
          targetStoryId,
          error: String(error),
        });
      }
    }
  }

  return linkCount;
}


function getPreviewStoreKey(fileName: string): string {
  return `__preview_${fileName}`;
}

function findEnrichmentForTitle(preview: StoredPreview | undefined, title: string): WorkItemEnrichment | undefined {
  if (!preview) return undefined;
  const target = normaliseTitle(title);
  return preview.items.find((item) => normaliseTitle(item.title) === target)?.enrichment;
}

function toPreviewItemId(analysisMode: AnalysisMode, primary: string, secondary: string): string {
  return `${analysisMode}:${normaliseTitle(primary)}:${normaliseTitle(secondary)}`;
}

function buildThemePreviewItems(
  analysisFileName: string,
  sourceContent: string,
  themes: Record<string, { mentions: number; subtopics: string[] }>,
  extraAcceptanceCriteria: string[]
): EnrichmentWorkItem[] {
  const persona = detectPersonaFromTranscript(sourceContent);
  const items: EnrichmentWorkItem[] = [];

  for (const [themeName, themeData] of Object.entries(themes)) {
    const uniqueSubtopics = Array.from(new Set(themeData.subtopics));
    for (const subtopic of uniqueSubtopics) {
      const title = `Implement ${subtopic}`;
      const provenance: ProvenanceInfo = {
        sourceFileName: analysisFileName,
        sourceType: "transcript",
        reference: `Theme: ${themeName}; Subtopic: ${subtopic}`,
        excerpt: selectBestExcerpt(sourceContent, [subtopic, themeName]),
      };
      const description = buildStoryDescription(subtopic, themeName, persona, provenance);
      const acceptanceCriteria = [...buildGherkinCriteria(subtopic, themeName, persona), ...extraAcceptanceCriteria];
      items.push({
        id: toPreviewItemId("themes", themeName, subtopic),
        title,
        description,
        acceptanceCriteria,
        sourceReferences: [buildProvenanceText(provenance)],
      });
    }
  }

  return items;
}

function buildProcessPreviewItems(
  analysisFileName: string,
  processContent: string,
  evidenceContent: string,
  processStages: ProcessStage[],
  storyMaturity: StoryMaturity,
  designReferences: string[],
  extraAcceptanceCriteria: string[]
): EnrichmentWorkItem[] {
  const items: EnrichmentWorkItem[] = [];

  for (const stage of processStages) {
    const uniqueSteps = Array.from(new Map(stage.steps.map((step) => [normaliseTitle(step.title), step])).values());
    for (const step of uniqueSteps) {
      const persona = getBestPersona(step.role, evidenceContent);
      const evidenceSnippets = selectEvidenceSnippets(evidenceContent, step.evidenceTerms);
      const provenance: ProvenanceInfo = {
        sourceFileName: analysisFileName,
        sourceType: "process",
        reference: `Stage: ${stage.title}; Step: ${step.title}`,
        excerpt: selectBestExcerpt(processContent, [step.title, stage.title]),
      };

      const title = storyMaturity === "placeholder" ? `Discovery placeholder: ${step.title}` : `Implement ${step.title}`;
      const description = storyMaturity === "placeholder"
        ? buildPlaceholderStoryDescription(step, stage.title, persona, evidenceSnippets, designReferences, provenance)
        : buildStoryDescription(step.title, stage.title, persona, provenance);
      const acceptanceCriteria = storyMaturity === "placeholder"
        ? [
          "Given fit-gap analysis has not yet been completed",
          "When the BA/FC reviews this placeholder with stakeholders",
          "Then the requirement intent, constraints, and outcomes are clarified",
          "And linked design references are identified before implementation starts",
        ]
        : [...buildGherkinCriteria(step.title, stage.title, persona), ...extraAcceptanceCriteria];

      items.push({
        id: toPreviewItemId("process", stage.title, step.title),
        title,
        description,
        acceptanceCriteria,
        tags: [storyMaturity === "placeholder" ? "FitGap-Unassessed" : "Ready-For-Detail"],
        sourceReferences: [buildProvenanceText(provenance)],
      });
    }
  }

  return items;
}

function handlePreviewBacklog(input: ToolInput): string {
  const backlogStore = getFileStore();
  const analysisFileName = input.processFileName || input.fileName;
  if (!analysisFileName) {
    return JSON.stringify({ result: "error", message: "Provide processFileName (preferred) or fileName after analyse_document." });
  }

  const cachedAnalysis = backlogStore.get(`__analysis_${analysisFileName}`);
  if (!cachedAnalysis) {
    return JSON.stringify({ result: "error", message: "No analysis found. Call analyse_document first." });
  }

  const analysis = parseStoredAnalysis(cachedAnalysis.content);
  const processContent = backlogStore.get(analysisFileName)?.content ?? "";
  const evidenceFileName = input.evidenceFileName || input.fileName;
  const evidenceContent = evidenceFileName ? backlogStore.get(evidenceFileName)?.content ?? "" : "";
  const storyMaturity: StoryMaturity = input.storyMaturity === "detailed" ? "detailed" : "placeholder";
  const designReferences = (input.designReferences ?? []).filter((item) => item.trim().length > 0);
  const extraAcceptanceCriteria = buildRubricAcceptanceCriteria(analysis.rubrics);

  const baseItems = analysis.analysisMode === "process"
    ? buildProcessPreviewItems(
      analysisFileName,
      processContent,
      evidenceContent,
      analysis.processStages ?? [],
      storyMaturity,
      designReferences,
      extraAcceptanceCriteria
    )
    : buildThemePreviewItems(
      analysisFileName,
      processContent,
      analysis.themes ?? {},
      extraAcceptanceCriteria
    );

  const enrichment = enrichGeneratedWorkItems(
    {
      transcriptContent: processContent,
      analysisMode: analysis.analysisMode,
    },
    baseItems,
    getEnrichmentFlags()
  );

  const preview: StoredPreview = {
    fileName: analysisFileName,
    analysisMode: analysis.analysisMode,
    storyMaturity,
    items: enrichment.items,
    warnings: enrichment.warnings,
    idempotencyKey: enrichment.idempotencyKey,
    createdAt: new Date().toISOString(),
  };

  backlogStore.set(getPreviewStoreKey(analysisFileName), {
    name: getPreviewStoreKey(analysisFileName),
    content: JSON.stringify(preview),
    mimeType: "application/json",
    uploadedAt: new Date(),
  });

  return JSON.stringify({
    result: "success",
    fileName: analysisFileName,
    analysisMode: analysis.analysisMode,
    storyMaturity,
    storyCount: preview.items.length,
    warnings: preview.warnings,
    idempotencyKey: preview.idempotencyKey,
    items: preview.items,
  });
}

function appendAcceptanceCriteriaBlock(description: string, criteria: string[] | undefined): string {
  const items = (criteria ?? []).map((c) => c.trim()).filter(Boolean);
  if (items.length === 0) return description;

  const base = description.trim();
  const lines = [base, base ? "" : "", "Acceptance Criteria:", ...items.map((c) => `- ${c}`)].filter((l) => l !== "");
  return lines.join("\n");
}

type AnalysisMode = "themes" | "process";
type StoryMaturity = "placeholder" | "detailed";
interface RubricAssessment {
  id: string;
  name: string;
  mentions: number;
  signals: string[];
}

interface ProcessStep {
  title: string;
  role?: string;
  evidenceTerms: string[];
}

interface ProcessStage {
  title: string;
  steps: ProcessStep[];
}

interface StoredAnalysis {
  analysisMode: AnalysisMode;
  themes?: Record<string, { mentions: number; subtopics: string[] }>;
  processStages?: ProcessStage[];
  rubrics?: RubricAssessment[];
}

interface StoredPreview {
  fileName: string;
  analysisMode: AnalysisMode;
  storyMaturity: StoryMaturity;
  items: EnrichmentWorkItem[];
  warnings: string[];
  idempotencyKey: string;
  createdAt: string;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (normalised === "1" || normalised === "true" || normalised === "yes" || normalised === "on") return true;
  if (normalised === "0" || normalised === "false" || normalised === "no" || normalised === "off") return false;
  return fallback;
}

function getEnrichmentFlags(): EnrichmentFlags {
  const enabled = parseBooleanEnv(process.env.ENRICHMENT_ENABLED, false);
  return {
    enabled,
    dependencies: parseBooleanEnv(process.env.ENRICH_DEPENDENCIES_ENABLED, enabled),
    definitionOfDone: parseBooleanEnv(process.env.ENRICH_DOD_ENABLED, enabled),
    confidence: parseBooleanEnv(process.env.ENRICH_CONFIDENCE_ENABLED, enabled),
    missingPieces: parseBooleanEnv(process.env.ENRICH_MISSING_PIECES_ENABLED, enabled),
    consistency: parseBooleanEnv(process.env.ENRICH_CONSISTENCY_ENABLED, enabled),
    effort: parseBooleanEnv(process.env.ENRICH_EFFORT_ENABLED, enabled),
    quality: parseBooleanEnv(process.env.ENRICH_QUALITY_ENABLED, enabled),
    aiAssist: parseBooleanEnv(process.env.ENRICH_AI_ASSIST_ENABLED, false),
  };
}

// Truncate text to avoid large payloads triggering content filters
function truncate(text: string, max: number = 200): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + "...";
}

function toSingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RUBRIC_DIMENSIONS: Array<{ id: string; name: string; keywords: string[] }> = [
  { id: "roles", name: "Roles & responsibilities", keywords: ["role", "persona", "dispatcher", "manager", "engineer", "admin", "approver"] },
  { id: "workflow", name: "Workflows & approvals", keywords: ["workflow", "approval", "validate", "exception", "handover", "escalation", "status"] },
  { id: "data", name: "Data model & quality", keywords: ["data", "master data", "attribute", "mandatory", "validation", "duplicate", "audit", "history"] },
  { id: "integration", name: "Integrations & interfaces", keywords: ["integration", "interface", "api", "webhook", "sync", "oracle", "erp", "sap", "gis"] },
  { id: "reporting", name: "Reporting & analytics", keywords: ["report", "dashboard", "kpi", "metric", "power bi", "analytics", "insight"] },
  { id: "security", name: "Security & access control", keywords: ["security", "permission", "access", "rbac", "least privilege", "encryption", "sso", "mfa"] },
  { id: "compliance", name: "Compliance & audit", keywords: ["compliance", "audit", "regulation", "gdpr", "retention", "cni"] },
  { id: "nfr", name: "Non-functional requirements", keywords: ["performance", "latency", "availability", "resilience", "scalability", "sla", "offline"] },
  { id: "ux", name: "UX & usability", keywords: ["ux", "user experience", "usability", "mobile", "tablet", "field", "offline"] },
  { id: "edge_cases", name: "Exceptions & edge cases", keywords: ["edge case", "exception", "workaround", "manual", "fallback", "error"] },
];

function assessRubrics(content: string): RubricAssessment[] {
  const lower = content.toLowerCase();
  return RUBRIC_DIMENSIONS.map((dim) => {
    let mentions = 0;
    const signals: string[] = [];
    for (const keyword of dim.keywords) {
      const pattern = new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "g");
      const matches = lower.match(pattern);
      const count = matches ? matches.length : 0;
      if (count > 0) {
        mentions += count;
        if (signals.length < 5) signals.push(keyword);
      }
    }
    return { id: dim.id, name: dim.name, mentions, signals };
  }).sort((a, b) => b.mentions - a.mentions);
}

function buildRubricAcceptanceCriteria(rubrics: RubricAssessment[] | undefined): string[] {
  const relevant = (rubrics ?? []).filter((r) => r.mentions > 0).slice(0, 4);
  if (relevant.length === 0) return [];

  const criteria: string[] = [];
  for (const item of relevant) {
    switch (item.id) {
      case "security":
        criteria.push("And access is controlled by role-based permissions");
        break;
      case "compliance":
        criteria.push("And key actions are auditable with timestamped history");
        break;
      case "integration":
        criteria.push("And required integrations/interfaces are identified for this capability");
        break;
      case "reporting":
        criteria.push("And the outcome is reportable via dashboards/exports where required");
        break;
      case "nfr":
        criteria.push("And performance/availability expectations are defined and testable");
        break;
      case "edge_cases":
        criteria.push("And exception paths and error handling are defined");
        break;
      case "data":
        criteria.push("And data validation rules and required fields are defined");
        break;
      case "workflow":
        criteria.push("And workflow status transitions and approval gates are defined");
        break;
      default:
        break;
    }
  }

  return Array.from(new Set(criteria));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface ProvenanceInfo {
  sourceFileName: string;
  sourceType: "transcript" | "process";
  reference: string;
  excerpt?: string;
}

function selectBestExcerpt(content: string, terms: string[], maxChars: number = 260): string | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return undefined;

  const loweredTerms = terms
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.toLowerCase());

  const index = loweredTerms.length === 0
    ? 0
    : lines.findIndex((line) => {
      const lower = line.toLowerCase();
      return loweredTerms.some((term) => lower.includes(term));
    });

  const bestIndex = index >= 0 ? index : 0;
  const excerpt = [lines[bestIndex - 1], lines[bestIndex], lines[bestIndex + 1]]
    .filter((line): line is string => Boolean(line))
    .join(" ");

  return truncate(toSingleLine(excerpt), maxChars);
}

function buildProvenanceHtml(info: ProvenanceInfo): string {
  const excerptPart = info.excerpt ? ` — \"${escapeHtml(info.excerpt)}\"` : "";
  return `<br/><br/><em>Source: ${escapeHtml(info.sourceFileName)} (${info.sourceType}) — ${escapeHtml(info.reference)}${excerptPart}</em>`;
}

function buildProvenanceText(info: ProvenanceInfo): string {
  const excerptPart = info.excerpt ? ` — "${toSingleLine(info.excerpt)}"` : "";
  return `_Source: ${info.sourceFileName} (${info.sourceType}) — ${info.reference}${excerptPart}_`;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

// In-memory store for uploaded file content (keyed by filename)
const fileStore: Map<string, { name: string; content: string; mimeType?: string; uploadedAt: Date }> = new Map();

// Server-side chunk size for reading files (15K chars per chunk)
const FILE_CHUNK_SIZE = 15000;

export function getFileStore() {
  return fileStore;
}

export const workItemTools: Tool[] = [
  {
    name: "list_epics",
    description: "Returns epics from a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        state: {
          type: "string",
          description: "State filter.",
        },
        assignedTo: {
          type: "string",
          description: "Assigned user filter.",
        },
        top: {
          type: "number",
          description: "Max results.",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "list_features",
    description: "Returns features from a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        epic: {
          type: "number",
          description: "Parent epic ID.",
        },
        state: {
          type: "string",
          description: "State filter.",
        },
        top: {
          type: "number",
          description: "Max results.",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "list_user_stories",
    description: "Returns user stories from a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        feature: {
          type: "number",
          description: "Parent feature ID.",
        },
        state: {
          type: "string",
          description: "State filter.",
        },
        assignedTo: {
          type: "string",
          description: "Assigned user filter.",
        },
        top: {
          type: "number",
          description: "Max results.",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "get_user_story",
    description: "Returns details of a user story.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        userStoryId: {
          type: "number",
          description: "User story ID.",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "add_acceptance_criteria",
    description: "Adds acceptance criteria to a user story.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        userStoryId: {
          type: "number",
          description: "User story ID.",
        },
        criteria: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Acceptance criteria list.",
        },
      },
      required: ["project", "criteria"],
    },
  },
  {
    name: "list_tasks",
    description: "Returns tasks from a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        userStory: {
          type: "number",
          description: "Parent user story ID.",
        },
        state: {
          type: "string",
          description: "State filter.",
        },
        assignedTo: {
          type: "string",
          description: "Assigned user filter.",
        },
        top: {
          type: "number",
          description: "Max results.",
          default: 50,
        },
      },
      required: ["project"],
    },
  },
  {
    name: "create_epic",
    description: "Creates an epic.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        title: {
          type: "string",
          description: "Title.",
        },
        description: {
          type: "string",
          description: "Description text.",
        },
        assignedTo: {
          type: "string",
          description: "Assigned user.",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "create_feature",
    description: "Creates a feature.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        title: {
          type: "string",
          description: "Title.",
        },
        description: {
          type: "string",
          description: "Description text.",
        },
        epicId: {
          type: "number",
          description: "Parent epic ID.",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "create_user_story",
    description: "Creates a user story.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        title: {
          type: "string",
          description: "Title.",
        },
        description: {
          type: "string",
          description: "Description text.",
        },
        featureId: {
          type: "number",
          description: "Parent feature ID.",
        },
        acceptanceCriteria: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Acceptance criteria list.",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "create_task",
    description: "Creates a task.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        title: {
          type: "string",
          description: "Title.",
        },
        description: {
          type: "string",
          description: "Description text.",
        },
        userStoryId: {
          type: "number",
          description: "Parent user story ID.",
        },
        assignedTo: {
          type: "string",
          description: "Assigned user.",
        },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "process_transcript",
    description: "Stores an uploaded file for processing. By default returns metadata only (no transcript preview). Provide fileContent as plain text or base64 string. Alternatively provide contentUrl which is a data URI like data:text/plain;base64,... from an attachment. Set includePreview=true only when you explicitly need a snippet.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the uploaded file.",
        },
        fileContent: {
          type: "string",
          description: "File content as text or base64 encoded string.",
        },
        contentUrl: {
          type: "string",
          description: "Data URI from attachment e.g. data:text/plain;base64,SGVsbG8=. If provided, fileContent is ignored.",
        },
        contentType: {
          type: "string",
          description: "MIME type of the file.",
        },
        includePreview: {
          type: "boolean",
          description: "If true, includes a short preview snippet in the response. Off by default to avoid leaking sensitive content.",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "list_uploaded_files",
    description: "Returns list of uploaded files.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "delete_file",
    description: "Deletes an uploaded file from the server after processing is complete.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the file to delete.",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "get_file_content",
    description: "Returns stored file content ONLY when explicitly requested (includeContent=true). By default returns metadata only to avoid leaking sensitive content. For large files, use get_file_chunk with includeContent=true.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the file to retrieve.",
        },
        includeContent: {
          type: "boolean",
          description: "If true, includes the full file content in the response (may trigger content filtering). Defaults to false.",
        },
        includePreview: {
          type: "boolean",
          description: "If true, includes a short preview snippet in the response (may trigger content filtering). Defaults to false.",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "get_file_chunk",
    description: "Returns one chunk of a stored file by index ONLY when explicitly requested (includeContent=true). By default returns metadata only to avoid leaking sensitive content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the file.",
        },
        chunkIndex: {
          type: "number",
          description: "Zero-based chunk index.",
        },
        includeContent: {
          type: "boolean",
          description: "If true, includes the chunk content in the response (may trigger content filtering). Defaults to false.",
        },
      },
      required: ["fileName", "chunkIndex"],
    },
  },
  {
    name: "analyse_document",
    description: "Analyses an uploaded file server-side. Supports legacy theme extraction and process-document extraction for process-first backlog creation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the uploaded file to analyse.",
        },
        analysisMode: {
          type: "string",
          description: "Optional analysis mode: 'themes' (legacy) or 'process' (process-first). Defaults to 'themes'.",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "get_theme_details",
    description: "Returns subtopics for a specific theme from a previously analysed document. Call analyse_document first to get the list of themes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the uploaded file.",
        },
        themeName: {
          type: "string",
          description: "Name of the theme to get details for.",
        },
      },
      required: ["fileName", "themeName"],
    },
  },
  {
    name: "preview_backlog",
    description: "Builds backlog stories from a previously analysed document, applies optional enrichment, and returns review data without creating ADO work items.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Legacy analysed file name. Backward compatible alias when processFileName is not provided.",
        },
        processFileName: {
          type: "string",
          description: "Primary analysed process-document file name.",
        },
        evidenceFileName: {
          type: "string",
          description: "Optional supporting transcript/notes file used for persona/provenance snippets.",
        },
        storyMaturity: {
          type: "string",
          description: "Optional story maturity mode: 'placeholder' or 'detailed'.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_backlog",
    description: "Creates a backlog from a previously analysed document. Supports process-first placeholder discovery backlogs and legacy transcript/theme backlog generation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Legacy analysed file name. Backward compatible alias when processFileName is not provided.",
        },
        processFileName: {
          type: "string",
          description: "Primary analysed process-document file name for process-first backlog generation.",
        },
        evidenceFileName: {
          type: "string",
          description: "Optional supporting transcript/notes file name used to add provenance snippets.",
        },
        storyMaturity: {
          type: "string",
          description: "Optional story maturity mode: 'placeholder' (discovery default for process) or 'detailed'.",
        },
        designReferences: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Optional design reference links/IDs to attach in story context for traceability.",
        },
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        areaPath: {
          type: "string",
          description: "Optional Azure DevOps area path. Defaults to project root area.",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "update_work_item",
    description: "Updates a work item.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        workItemId: {
          type: "number",
          description: "Work item ID.",
        },
        state: {
          type: "string",
          description: "New state value.",
        },
        assignedTo: {
          type: "string",
          description: "Assigned user.",
        },
        description: {
          type: "string",
          description: "Description text.",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "check_project_process",
    description:
      "Check whether the target Azure DevOps project uses the expected process template.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        expectedProcessName: {
          type: "string",
          description: "Expected process template name (e.g. 'Agile with Enrichment', 'Finance and Operations').",
        },
      },
      required: ["project", "expectedProcessName"],
    },
  },
  {
    name: "ensure_process_on_project",
    description:
      "Ensures the target Azure DevOps project uses the required process. If the process doesn't exist in the org, it creates it from a built-in definition. If the project uses a different process, it changes the project to use the required one. Returns step-by-step progress.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        requiredProcessName: {
          type: "string",
          description: "Required process template name (e.g. 'Agile with Enrichment', 'Finance and Operations').",
        },
      },
      required: ["project", "requiredProcessName"],
    },
  },
  {
    name: "migrate_enrichment_process",
    description:
      "Migrate a process template (with enrichment custom fields, states, rules, and layout) from a source Azure DevOps org to the target org, then create a new project using that process.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sourceOrgUrl: {
          type: "string",
          description: "Source Azure DevOps org URL (e.g. https://dev.azure.com/myorg).",
        },
        sourceProject: {
          type: "string",
          description: "Source project name that uses the process template.",
        },
        sourceProcessName: {
          type: "string",
          description: "Name of the process template to migrate (e.g. 'Power Platform Agile', 'F&O Agile').",
        },
        sourcePat: {
          type: "string",
          description: "PAT token for the source Azure DevOps org.",
        },
        newProjectName: {
          type: "string",
          description: "Name for the new project to create in the target org using the migrated process.",
        },
      },
      required: ["sourceOrgUrl", "sourceProject", "sourceProcessName", "sourcePat", "newProjectName"],
    },
  },
  {
    name: "get_backlog_health",
    description: "Queries all user stories with enrichment fields and returns aggregated health metrics for the backlog dashboard.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        top: {
          type: "number",
          description: "Maximum number of stories to analyze (default 500).",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "refine_story",
    description: "Reads a user story from ADO, analyzes weak areas, and generates improved title, description, and acceptance criteria suggestions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        workItemId: {
          type: "number",
          description: "The ID of the user story to refine.",
        },
      },
      required: ["project", "workItemId"],
    },
  },
  {
    name: "extract_rraid",
    description: "Analyzes document content to extract Risks, Requirements, Assumptions, Issues, and Dependencies (RRAID log).",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: { type: "string", description: "Name of the uploaded file to analyze." },
        project: { type: "string", description: "Azure DevOps project name (for matching to existing stories)." },
      },
      required: ["fileName", "project"],
    },
  },
  {
    name: "create_rraid_items",
    description: "Creates RRAID items as Issue work items in ADO with category tags and optional links to related stories.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Azure DevOps project name." },
        items: {
          type: "array",
          description: "Array of RRAID items to create.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              category: { type: "string" },
              severity: { type: "string" },
            },
          },
        },
      },
      required: ["project", "items"],
    },
  },
  {
    name: "list_rraid_items",
    description: "Lists RRAID items (Issues tagged with RRAID:*) from the project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Azure DevOps project name." },
        category: { type: "string", description: "Optional filter by RRAID category (Risk, Requirement, Assumption, Issue, Dependency)." },
      },
      required: ["project"],
    },
  },
];

interface ToolInput {
  project: string;
  analysisMode?: AnalysisMode;
  iterationPath?: string;
  areaPath?: string;
  state?: string;
  assignedTo?: string;
  epic?: number;
  feature?: number;
  userStory?: number;
  top?: number;
  userStoryId?: number;
  title?: string;
  description?: string;
  epicId?: number;
  criteria?: string[];
  featureId?: number;
  acceptanceCriteria?: string[];
  workItemId?: number;
  fileName?: string;
  processFileName?: string;
  evidenceFileName?: string;
  storyMaturity?: StoryMaturity;
  designReferences?: string[];
  fileContent?: string;
  contentUrl?: string;
  contentType?: string;
  themeName?: string;
  chunkIndex?: number;
  includeContent?: boolean;
  includePreview?: boolean;
  previewFileName?: string;
  reviewOnly?: boolean;
  expectedProcessName?: string;
  requiredProcessName?: string;
  sourceOrgUrl?: string;
  sourceProject?: string;
  sourceProcessName?: string;
  sourcePat?: string;
  newProjectName?: string;
  items?: Array<{ title: string; description: string; category: string; severity: string }>;
  category?: string;
}

interface WorkItemClients {
  azureDevOpsClient?: AzureDevOpsClient;
}

function requireAzureClient(clients: WorkItemClients): AzureDevOpsClient {
  if (!clients.azureDevOpsClient) {
    throw new Error("Azure DevOps client is not configured on this server. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT, and AZURE_DEVOPS_URL.");
  }
  return clients.azureDevOpsClient;
}

// --- Extracted handlers to reduce cognitive complexity of handleWorkItemTool ---

function tryDecodeBase64(raw: string): string {
  const stripped = raw.replaceAll(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(stripped) || raw.length <= 100) return raw;
  try {
    const decoded = Buffer.from(stripped, "base64").toString("utf-8");
    return (decoded && !decoded.includes("\ufffd")) ? decoded : raw;
  } catch {
    return raw;
  }
}

async function resolveContentUrl(url: string, fileName: string): Promise<{ content: string; contentType: string } | string> {
  const dataUriRegex = /^data:([^;]+);base64,(.+)$/;
  const dataUriMatch = dataUriRegex.exec(url);
  if (dataUriMatch) {
    try {
      const content = Buffer.from(dataUriMatch[2], "base64").toString("utf-8");
      logger.info("Decoded content from data URI", { fileName, contentType: dataUriMatch[1], size: content.length });
      return { content, contentType: dataUriMatch[1] };
    } catch {
      return JSON.stringify({ result: "error", message: "Failed to decode base64 from contentUrl" });
    }
  }
  if (url.startsWith("http")) {
    try {
      const response = await fetch(url);
      if (!response.ok) return JSON.stringify({ result: "error", message: "Failed to fetch file from URL: " + response.status });
      const content = await response.text();
      logger.info("Fetched content from URL", { fileName, size: content.length });
      return { content, contentType: "text/plain" };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return JSON.stringify({ result: "error", message: "Failed to fetch file from URL: " + message });
    }
  }
  return JSON.stringify({ result: "error", message: "contentUrl must be a data: URI or http(s) URL" });
}

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\ufffd/g, "")                   // remove Unicode replacement chars
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // remove control chars (keep \t \n \r)
    .replace(/\r\n/g, "\n")                    // normalize line endings
    .replace(/\n{3,}/g, "\n\n")               // collapse excessive blank lines
    .trim();
}

async function extractTextFromBinary(base64Content: string, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  const buffer = Buffer.from(base64Content, "base64");

  if (ext === ".pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      const text = cleanExtractedText(result.text);
      logger.info("PDF text extracted", { fileName, pages: result.numpages, textLength: text.length });
      return text;
    } catch (err) {
      logger.warn("PDF parse failed, storing raw base64", { fileName, error: String(err) });
      return "";
    }
  }

  if (ext === ".docx" || ext === ".doc") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = cleanExtractedText(result.value);
      logger.info("DOCX text extracted", { fileName, textLength: text.length });
      return text;
    } catch (err) {
      logger.warn("DOCX parse failed", { fileName, error: String(err) });
      return "";
    }
  }

  if (ext === ".xlsx") {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (sheet) {
          sheets.push(`--- ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
        }
      }
      const text = sheets.join("\n\n");
      const cleaned = cleanExtractedText(text);
      logger.info("XLSX text extracted", { fileName, sheets: workbook.SheetNames.length, textLength: cleaned.length });
      return cleaned;
    } catch (err) {
      logger.warn("XLSX parse failed", { fileName, error: String(err) });
      return "";
    }
  }

  return "";
}

async function handleProcessTranscript(input: ToolInput, fileStore: ReturnType<typeof getFileStore>): Promise<string> {
  const fileName = input.fileName!;
  let content = "";
  let contentType = input.contentType || "text/plain";

  if (input.contentUrl) {
    const resolved = await resolveContentUrl(input.contentUrl, fileName);
    if (typeof resolved === "string") return resolved;
    content = resolved.content;
    contentType = resolved.contentType;
  } else if (input.fileContent) {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
    if ([".pdf", ".docx", ".doc", ".xlsx"].includes(ext)) {
      // Binary file — extract text from base64
      content = await extractTextFromBinary(input.fileContent, fileName);
      if (!content) {
        return JSON.stringify({ result: "error", message: `Failed to extract text from ${ext} file. The file may be corrupted or password-protected.` });
      }
    } else {
      content = tryDecodeBase64(input.fileContent);
    }
  } else {
    const existing = fileStore.get(fileName);
    if (existing) {
      logger.info("No content provided but file already exists on server", { fileName, size: existing.content.length });
      return JSON.stringify({ result: "success", fileName, size: existing.content.length, contentType: existing.mimeType, message: "File already exists on server. Use get_file_content or analyse_document to read it." });
    }
    return JSON.stringify({ result: "error", message: "Provide either fileContent or contentUrl" });
  }

  const existingFile = fileStore.get(fileName);
  if (existingFile && existingFile.content.length > content.length && content.length < 100) {
    logger.info("Skipping overwrite - existing file is larger", { fileName, existingSize: existingFile.content.length, newSize: content.length });
    return JSON.stringify({ result: "success", fileName, size: existingFile.content.length, contentType: existingFile.mimeType, message: "File already exists with more content. Use get_file_content or analyse_document to read it." });
  }

  fileStore.set(fileName, { name: fileName, content, mimeType: contentType, uploadedAt: new Date() });
  logger.info("File stored", { fileName, size: content.length, contentType });

  const response: Record<string, unknown> = { result: "success", fileName, size: content.length, contentType };
  if (input.includePreview === true) {
    response.preview = truncate(content, 500);
  }
  return JSON.stringify(response);
}

const THEME_CONFIG: Record<string, { keywords: string[]; subtopicLabels: Record<string, string[]> }> = {
  "Work Management": {
    keywords: ["work order", "job management", "work management", "lifecycle", "workflow", "validation", "approval"],
    subtopicLabels: {
      "Work order creation and tracking": ["work order", "job creation"],
      "Workflow and approval processes": ["workflow", "approval", "validation"],
      "Job lifecycle management": ["lifecycle", "job status", "work management"],
      "Status tracking and updates": ["status", "tracking", "progress"],
    },
  },
  "Scheduling and Dispatch": {
    keywords: ["schedul", "dispatch", "allocat", "priorit", "emergency", "rescheduling", "appointment", "capacity planning"],
    subtopicLabels: {
      "Resource scheduling and allocation": ["schedul", "allocat", "resource"],
      "Emergency and priority management": ["emergency", "priorit", "urgent"],
      "Dispatch and routing": ["dispatch", "route", "travel"],
      "Appointment booking": ["appointment", "booking", "slot"],
      "Capacity planning": ["capacity", "planning", "forecast"],
    },
  },
  "Subcontractor Management": {
    keywords: ["subcontract", "contractor", "supplier", "third party", "supply chain"],
    subtopicLabels: {
      "Subcontractor onboarding and management": ["subcontract", "contractor"],
      "Supplier performance tracking": ["supplier", "performance"],
      "Third party integration": ["third party", "supply chain"],
    },
  },
  "Commercial and Billing": {
    keywords: ["invoice", "billing", "payment", "rate card", "variation", "compensation", "commercial", "application for payment", "cost", "revenue", "margin", "price"],
    subtopicLabels: {
      "Invoice generation and processing": ["invoice", "billing"],
      "Rate card and pricing management": ["rate card", "price", "pricing"],
      "Variations and compensation events": ["variation", "compensation"],
      "Cost tracking and margin analysis": ["cost", "margin", "revenue"],
      "Payment applications": ["application for payment", "payment"],
      "Commercial reporting": ["commercial", "financial"],
    },
  },
  "ERP Integration": {
    keywords: ["oracle", "erp", "project costing", "general ledger", "revenue recognition", "purchase order", "finance system"],
    subtopicLabels: {
      "Oracle ERP integration": ["oracle", "erp"],
      "Project costing and accounting": ["project costing", "general ledger"],
      "Revenue recognition": ["revenue recognition"],
      "Purchase order management": ["purchase order"],
    },
  },
  "Client Integration": {
    keywords: ["client system", "integration", "interface", "api", "e-business", "information flow", "data exchange", "client portal"],
    subtopicLabels: {
      "Client system integration": ["client system", "integration"],
      "API and data exchange": ["api", "data exchange", "interface"],
      "Client portal and self-service": ["portal", "self-service", "e-business"],
      "Information flow automation": ["information flow", "automat"],
    },
  },
  "Field Data Capture": {
    keywords: ["mobile", "photograph", "evidence", "field", "data capture", "digital", "form", "tablet", "offline"],
    subtopicLabels: {
      "Mobile application for field workers": ["mobile", "tablet", "field"],
      "Digital forms and data capture": ["form", "data capture", "digital"],
      "Photo and evidence capture": ["photograph", "evidence", "photo"],
      "Offline capability": ["offline"],
    },
  },
  "Inventory and Materials": {
    keywords: ["inventory", "stock", "material", "consignment", "bill of material", "warehouse", "van stock"],
    subtopicLabels: {
      "Inventory tracking and management": ["inventory", "stock"],
      "Materials planning and ordering": ["material", "ordering"],
      "Consignment and van stock": ["consignment", "van stock"],
      "Bill of materials": ["bill of material"],
    },
  },
  "Reporting and Analytics": {
    keywords: ["report", "dashboard", "analytics", "power bi", "fabric", "kpi", "metric", "predictive", "insight", "data warehouse"],
    subtopicLabels: {
      "Operational dashboards": ["dashboard", "kpi", "metric"],
      "Power BI and Fabric reporting": ["power bi", "fabric"],
      "Predictive analytics": ["predictive", "analytics"],
      "Management reporting": ["report", "insight"],
    },
  },
  "Security and Compliance": {
    keywords: ["security", "compliance", "audit", "cni", "data classification", "sentinel", "regulation", "access control", "encryption"],
    subtopicLabels: {
      "Data security and encryption": ["security", "encryption", "data classification"],
      "Audit and compliance tracking": ["audit", "compliance", "regulation"],
      "Access control and permissions": ["access control", "permission"],
      "Critical infrastructure requirements": ["cni", "sentinel"],
    },
  },
  "Street Works": {
    keywords: ["street works", "permit", "reinstatement", "excavation", "quarantine", "highway", "notice"],
    subtopicLabels: {
      "Permit management": ["permit", "notice"],
      "Reinstatement tracking": ["reinstatement", "quarantine"],
      "Excavation and highway works": ["excavation", "highway", "street works"],
    },
  },
  "Data Migration": {
    keywords: ["migration", "archive", "historical", "data migration", "legacy", "cutover"],
    subtopicLabels: {
      "Legacy data migration": ["migration", "legacy", "data migration"],
      "Historical data archiving": ["archive", "historical"],
      "Cutover planning": ["cutover"],
    },
  },
  "Configuration and Onboarding": {
    keywords: ["onboard", "configur", "templat", "setup", "contract setup", "tenant", "multi-tenant"],
    subtopicLabels: {
      "Contract and tenant configuration": ["configur", "contract setup", "tenant"],
      "Template management": ["templat"],
      "Client onboarding": ["onboard", "setup"],
    },
  },
  "Workforce and Skills": {
    keywords: ["skill", "accreditation", "workforce", "resource management", "capacity", "training", "competenc"],
    subtopicLabels: {
      "Skills and accreditation tracking": ["skill", "accreditation", "competenc"],
      "Workforce planning": ["workforce", "resource management", "capacity"],
      "Training management": ["training"],
    },
  },
};

function scanSectionForThemes(sectionText: string, themeDetails: Record<string, { mentions: number; subtopics: string[] }>): void {
  for (const [theme, cfg] of Object.entries(THEME_CONFIG)) {
    if (!cfg.keywords.some(kw => sectionText.includes(kw))) continue;
    if (!themeDetails[theme]) themeDetails[theme] = { mentions: 0, subtopics: [] };
    themeDetails[theme].mentions++;
    for (const [label, labelKeywords] of Object.entries(cfg.subtopicLabels)) {
      if (labelKeywords.some(kw => sectionText.includes(kw)) && !themeDetails[theme].subtopics.includes(label)) {
        themeDetails[theme].subtopics.push(label);
      }
    }
  }
}

function parseAnalysisMode(rawMode: string | undefined): AnalysisMode {
  return rawMode?.toLowerCase() === "process" ? "process" : "themes";
}

function isLikelyProcessStep(line: string): boolean {
  if (!line || line.length < 8 || line.length > 300) {
    return false;
  }
  // Bullet or numbered lines
  if (/^(-|\*|•|\d+[.)])\s+/.test(line)) return true;
  // Process keywords
  if (/\b(then|after|before|next|submit|approve|validate|handoff|dispatch|book|invoice|create|configure|enable|integrate|implement|define|establish|manage|review|update|process|complete|trigger|generate|send|receive|assign|schedule|perform|execute|verify|ensure|maintain)\b/i.test(line)) return true;
  // Flow arrows
  if (line.includes("->") || line.includes("→")) return true;
  // Any line that looks like a sentence (has a verb-like structure and is long enough)
  if (line.length >= 15 && /^[A-Z]/.test(line)) return true;
  return false;
}

function extractRoleFromStep(line: string): string | undefined {
  const rolePrefix = /^(?:- |\* |• |\d+[.)]\s+)?(?:role|actor|persona|swimlane)\s*[:\-]\s*([a-z][a-z\s\-/]{2,40})/i.exec(line);
  if (rolePrefix?.[1]) {
    return rolePrefix[1].trim().toLowerCase();
  }
  return undefined;
}

function extractEvidenceTerms(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replaceAll(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 3)
        .slice(0, 6)
    )
  );
}

function splitIntoSentencesAndLines(content: string): string[] {
  // First split by newlines to get paragraphs
  const paragraphs = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const result: string[] = [];
  for (const para of paragraphs) {
    // If paragraph is short enough, keep as-is
    if (para.length <= 200) {
      result.push(para);
      continue;
    }
    // Split long paragraphs into sentences
    const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (sentences.length > 1) {
      result.push(...sentences);
    } else {
      // Try splitting on semicolons or commas for list-like content
      const parts = para.split(/;\s*/).map((s) => s.trim()).filter((s) => s.length > 10);
      if (parts.length > 1) {
        result.push(...parts);
      } else {
        result.push(para);
      }
    }
  }
  return result;
}

function analyseProcessDocument(content: string): ProcessStage[] {
  const lines = splitIntoSentencesAndLines(content);
  const stages: ProcessStage[] = [];
  let currentStage: ProcessStage = { title: "To-Be Process Flow", steps: [] };

  const pushCurrentStage = () => {
    if (currentStage.steps.length > 0 && !stages.find((s) => normaliseTitle(s.title) === normaliseTitle(currentStage.title))) {
      stages.push(currentStage);
    }
  };

  for (const line of lines) {
    const stageMatch = /^(?:\d+\s*[.)-]?\s*)?(?:stage|phase|process stage|process phase|module|section|area|workstream|stream|chapter)\s*[:\-]\s*(.+)$/i.exec(line)
      || /^(?:to[-\s]?be|future state)\s*[:\-]\s*(.+)$/i.exec(line)
      || /^(\d+\s*[.)]\s*.{5,60})$/.exec(line)  // numbered headings like "1. Order Management"
      || (line.length <= 60 && line.length >= 5 && /^[A-Z][A-Za-z\s&\-/]+$/.test(line) && !/\b(the|and|for|with|this|that|from|into|will|shall|must|should|have|been|were|are|was|has|can|may)\b/i.test(line.split(/\s+/).slice(0, 2).join(" ")) ? [line, line] : null);
    if (stageMatch?.[1]) {
      pushCurrentStage();
      currentStage = { title: stageMatch[1].trim(), steps: [] };
      continue;
    }

    if (!isLikelyProcessStep(line)) {
      continue;
    }

    const cleanedTitle = line
      .replace(/^(-|\*|•|\d+[.)])\s+/, "")
      .replaceAll(/\s+/g, " ")
      .trim();

    if (!cleanedTitle) {
      continue;
    }

    const role = extractRoleFromStep(cleanedTitle);
    currentStage.steps.push({
      title: cleanedTitle,
      role,
      evidenceTerms: extractEvidenceTerms(cleanedTitle),
    });
  }

  pushCurrentStage();
  if (stages.length === 0) {
    return [
      {
        title: "To-Be Process Flow",
        steps: lines.slice(0, 100).map((line) => ({
          title: line,
          role: extractRoleFromStep(line),
          evidenceTerms: extractEvidenceTerms(line),
        })),
      },
    ];
  }

  return stages.map((stage) => ({
    ...stage,
    steps: stage.steps.slice(0, 50),
  }));
}

function parseStoredAnalysis(rawContent: string): StoredAnalysis {
  const parsed = JSON.parse(rawContent) as unknown;
  if (
    typeof parsed === "object"
    && parsed !== null
    && "analysisMode" in parsed
    && ((parsed as StoredAnalysis).analysisMode === "themes" || (parsed as StoredAnalysis).analysisMode === "process")
  ) {
    return parsed as StoredAnalysis;
  }

  return {
    analysisMode: "themes",
    themes: parsed as Record<string, { mentions: number; subtopics: string[] }>,
  };
}

function handleAnalyseDocument(input: ToolInput): string {
  const fileStore = getFileStore();
  const file = fileStore.get(input.fileName!);
  if (!file) {
    return JSON.stringify({ result: "error", message: "File not found" });
  }
  logger.info("Analysing document server-side", { fileName: file.name, size: file.content.length });

  const analysisMode = parseAnalysisMode(input.analysisMode);
  const rubrics = assessRubrics(file.content);
  const rubricSummary = rubrics.filter((r) => r.mentions > 0).slice(0, 8);

  if (analysisMode === "process") {
    const processStages = analyseProcessDocument(file.content);
    const analysis: StoredAnalysis = {
      analysisMode,
      processStages,
      rubrics,
    };
    fileStore.set(`__analysis_${file.name}`, {
      name: `__analysis_${file.name}`,
      content: JSON.stringify(analysis),
      mimeType: "application/json",
      uploadedAt: new Date(),
    });

    const stageSummary = processStages.map((stage) => ({
      stage: stage.title,
      steps: stage.steps.length,
      rolesDetected: Array.from(new Set(stage.steps.map((step) => step.role).filter((r): r is string => Boolean(r)))).length,
    }));

    return JSON.stringify({
      result: "success",
      analysisMode,
      fileName: file.name,
      stagesFound: stageSummary.length,
      stages: stageSummary,
      rubricsFound: rubricSummary.length,
      rubrics: rubricSummary,
    });
  }

  const lines = file.content.split(/\n/);
  const totalLines = lines.length;
  const SECTION_SIZE = 500;

  const themeDetails: Record<string, { mentions: number; subtopics: string[] }> = {};
  for (let i = 0; i < totalLines; i += SECTION_SIZE) {
    const sectionText = lines.slice(i, i + SECTION_SIZE).join(" ").toLowerCase();
    scanSectionForThemes(sectionText, themeDetails);
  }

  const finalThemes: Record<string, { mentions: number; subtopics: string[] }> = {};
  for (const [theme, details] of Object.entries(themeDetails)) {
    if (details.mentions > 0) {
      finalThemes[theme] = { mentions: details.mentions, subtopics: details.subtopics.slice(0, 8) };
    }
  }

  const analysis: StoredAnalysis = {
    analysisMode,
    themes: finalThemes,
    rubrics,
  };

  fileStore.set(`__analysis_${file.name}`, {
    name: `__analysis_${file.name}`,
    content: JSON.stringify(analysis),
    mimeType: "application/json",
    uploadedAt: new Date(),
  });

  const themeList = Object.entries(finalThemes).map(([name, d]) => ({ name, mentions: d.mentions, subtopicCount: d.subtopics.length }));
  return JSON.stringify({
    result: "success",
    analysisMode,
    fileName: file.name,
    totalLines,
    themesFound: themeList.length,
    themes: themeList,
    rubricsFound: rubricSummary.length,
    rubrics: rubricSummary,
  });
}

function handleGetThemeDetails(input: ToolInput): string {
  const analysisStore = getFileStore();
  const cached = analysisStore.get(`__analysis_${input.fileName}`);
  if (!cached) {
    return JSON.stringify({ result: "error", message: "No analysis found. Call analyse_document first." });
  }
  const storedAnalysis = parseStoredAnalysis(cached.content);
  if (storedAnalysis.analysisMode !== "themes") {
    return JSON.stringify({ result: "error", message: "The analysed file is in process mode. Theme details are only available for analysisMode='themes'." });
  }

  const allThemes: Record<string, { mentions: number; subtopics: string[] }> = storedAnalysis.themes ?? {};
  const theme = allThemes[input.themeName!];
  if (!theme) {
    return JSON.stringify({ result: "error", message: "Theme not found.", availableThemes: Object.keys(allThemes) });
  }
  return JSON.stringify({ result: "success", theme: input.themeName, subtopics: theme.subtopics });
}

function findWorkItemByTitle(
  items: Array<{ id?: number; fields?: { [key: string]: unknown } }>,
  title: string
): { id?: number; fields?: { [key: string]: unknown } } | undefined {
  const target = normaliseTitle(title);
  return items.find((item) => {
    const itemTitle = item.fields?.["System.Title"];
    return typeof itemTitle === "string" && normaliseTitle(itemTitle) === target;
  });
}

function normaliseTitle(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

function detectPersonaFromTranscript(content: string): string {
  if (!content.trim()) {
    return "user";
  }

  const explicitPersona = /as an?\s+([a-z][a-z\s-]{2,40})(?:[,.]|\s+i\s+need|\s+i\s+want)/i.exec(content);
  if (explicitPersona?.[1]) {
    return explicitPersona[1].trim().toLowerCase();
  }

  const lower = content.toLowerCase();
  const personas = [
    { persona: "salesperson", keywords: ["sales", "quote", "quotation", "customer proposal"] },
    { persona: "field engineer", keywords: ["field", "site visit", "technician", "engineer"] },
    { persona: "project manager", keywords: ["project manager", "delivery plan", "milestone", "programme"] },
    { persona: "dispatcher", keywords: ["dispatch", "schedule", "routing", "allocate jobs"] },
    { persona: "finance analyst", keywords: ["invoice", "billing", "cost", "margin", "revenue"] },
  ];

  let bestPersona = "user";
  let bestScore = 0;

  for (const candidate of personas) {
    const score = candidate.keywords.reduce((acc, keyword) => acc + (lower.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestPersona = candidate.persona;
    }
  }

  return bestPersona;
}

function getBestPersona(role: string | undefined, fallbackContent: string): string {
  if (role && role.trim()) {
    return role.trim().toLowerCase();
  }
  return detectPersonaFromTranscript(fallbackContent);
}

function buildEpicDescription(themeName: string, subtopics: string[]): string {
  const featureListHtml = subtopics.map((s) => `<li>${s}</li>`).join("");
  return [
    `<strong>${themeName}</strong><br/><br/>`,
    `This epic summarizes the key delivery areas for ${themeName.toLowerCase()} and provides a consolidated view of expected outcomes.<br/><br/>`,
    `This epic covers the following features:<br/>`,
    `<ul>${featureListHtml}</ul>`,
  ].join("");
}

function buildFeatureDescription(subtopic: string, themeName: string): string {
  const storyTitle = `Implement ${subtopic}`;
  return [
    `<strong>${subtopic}</strong> — part of ${themeName}<br/><br/>`,
    `This feature delivers ${subtopic.toLowerCase()} capability within ${themeName.toLowerCase()} and groups the implementation scope needed to make this outcome usable by delivery teams.<br/><br/>`,
    `This feature includes the following user story:<br/>`,
    `<ul><li>${storyTitle}</li></ul>`,
  ].join("");
}

function buildStoryDescription(subtopic: string, themeName: string, persona: string, provenance?: ProvenanceInfo): string {
  const base = [
    `<strong>User Story</strong><br/>`,
    `As a ${persona}, I need the ability to utilise ${subtopic.toLowerCase()} from within the system, `,
    `so that I can effectively manage ${themeName.toLowerCase()} processes and workflows.<br/><br/>`,
    `<strong>Context</strong><br/>Theme: ${themeName}`,
  ].join("");

  return provenance ? base + buildProvenanceHtml(provenance) : base;
}

function buildGherkinCriteria(subtopic: string, themeName: string, persona: string): string[] {
  return [
    `Given the ${themeName.toLowerCase()} module is available`,
    `When the ${persona} interacts with ${subtopic.toLowerCase()}`,
    `Then the system should process the request successfully`,
    `And the result should be visible to the user`,
  ];
}

function appendUnique(list: string[], values: string[]): string[] {
  return Array.from(new Set([...list, ...values.map((value) => value.trim()).filter(Boolean)]));
}

function toEnrichmentLabelToken(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/(^-|-$)/g, "");
}

function buildEnrichmentSummaryText(enrichment: WorkItemEnrichment | undefined): string {
  if (!enrichment) return "";

  const lines: string[] = ["", "Enrichment Summary:"];

  if (enrichment.confidence) {
    lines.push(`- Confidence: overall ${enrichment.confidence.overall}/100 (title ${enrichment.confidence.title}, description ${enrichment.confidence.description}, AC ${enrichment.confidence.acceptanceCriteria})`);
  }

  if (enrichment.effort) {
    lines.push(`- Effort: ${enrichment.effort.tshirtSize} (confidence ${enrichment.effort.confidence}/100)`);
    lines.push(`- Effort reasoning: ${enrichment.effort.reasoning}`);
  }

  if (enrichment.qualityScore) {
    lines.push(`- Quality score: ${enrichment.qualityScore.score}/100`);
    lines.push(`- Quality breakdown: clarity ${enrichment.qualityScore.breakdown.clarity}, completeness ${enrichment.qualityScore.breakdown.completeness}, testability ${enrichment.qualityScore.breakdown.testability}, consistency ${enrichment.qualityScore.breakdown.consistency}`);
  }

  if (enrichment.missingPieces?.issues?.length) {
    lines.push("- Missing pieces:");
    for (const issue of enrichment.missingPieces.issues) {
      lines.push(`  - ${issue}`);
    }
  }

  if (enrichment.consistencyIssues?.length) {
    lines.push("- Consistency issues:");
    for (const issue of enrichment.consistencyIssues) {
      lines.push(`  - (${issue.severity ?? "low"}) ${issue.description} [${issue.conflictsWith.join(", ")}]`);
    }
  }

  if (enrichment.dependencies) {
    const dependsOn = enrichment.dependencies.dependsOn.length > 0 ? enrichment.dependencies.dependsOn.join(", ") : "none";
    const blocks = enrichment.dependencies.blocks.length > 0 ? enrichment.dependencies.blocks.join(", ") : "none";
    lines.push(`- Dependencies: dependsOn=${dependsOn}; blocks=${blocks}; confidence=${enrichment.dependencies.confidence}/100`);
  }

  return lines.join("\n");
}

function buildEnrichmentSummaryHtml(enrichment: WorkItemEnrichment | undefined): string {
  if (!enrichment) return "";
  const escaped = escapeHtml(buildEnrichmentSummaryText(enrichment)).replaceAll("\n", "<br/>");
  return `<br/><br/><strong>Enrichment Summary</strong><br/>${escaped}`;
}

const ADO_ENRICHMENT_FIELDS = {
  confidenceAcceptanceCriteria: "Custom.EnrichmentConfidenceAcceptanceCriteria",
  confidenceDescription: "Custom.EnrichmentConfidenceDescription",
  confidenceOverall: "Custom.EnrichmentConfidenceOverall",
  confidenceRationale: "Custom.EnrichmentConfidenceRationale",
  confidenceTitle: "Custom.EnrichmentConfidenceTitle",
  consistencyIssues: "Custom.EnrichmentConsistencyIssues",
  definitionOfDone: "Custom.EnrichmentDefinitionofDone",
  dependenciesBlocks: "Custom.EnrichmentDependenciesBlocks",
  dependenciesConfidence: "Custom.EnrichmentDependenciesConfidence",
  dependenciesDependsOn: "Custom.EnrichmentDependenciesDependsOn",
  dependenciesRationale: "Custom.EnrichmentDependenciesRationale",
  effortConfidence: "Custom.EnrichmentEffortConfidence",
  effortReasoning: "Custom.EnrichmentEffortReasoning",
  effortTShirtSize: "Custom.EnrichmentEffortTShirtSize",
  missingPiecesIssues: "Custom.EnrichmentMissingPiecesIssues",
  qualityClarity: "Custom.EnrichmentQualityClarity",
  qualityCompleteness: "Custom.EnrichmentQualityCompleteness",
  qualityConsistency: "Custom.EnrichmentQualityConsistency",
  qualityIssues: "Custom.EnrichmentQualityIssues",
  qualityRecommendations: "Custom.EnrichmentQualityRecommendations",
  qualityScore: "Custom.EnrichmentQualityScore",
  qualityTestability: "Custom.EnrichmentQualityTestability",
} as const;

function toHtmlList(values: string[] | undefined): string | undefined {
  const items = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (items.length === 0) return undefined;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function buildAdoEnrichmentCustomFields(enrichment: WorkItemEnrichment): Record<string, string | number | boolean> {
  const customFields: Record<string, string | number | boolean> = {};

  if (enrichment.confidence) {
    customFields[ADO_ENRICHMENT_FIELDS.confidenceOverall] = enrichment.confidence.overall;
    customFields[ADO_ENRICHMENT_FIELDS.confidenceTitle] = String(enrichment.confidence.title);
    customFields[ADO_ENRICHMENT_FIELDS.confidenceDescription] = String(enrichment.confidence.description);
    customFields[ADO_ENRICHMENT_FIELDS.confidenceAcceptanceCriteria] = enrichment.confidence.acceptanceCriteria;
    const rationale = toHtmlList(enrichment.confidence.rationale);
    if (rationale) customFields[ADO_ENRICHMENT_FIELDS.confidenceRationale] = rationale;
  }

  if (enrichment.definitionOfDone?.length) {
    customFields[ADO_ENRICHMENT_FIELDS.definitionOfDone] = enrichment.definitionOfDone.join("; ");
  }

  if (enrichment.dependencies) {
    customFields[ADO_ENRICHMENT_FIELDS.dependenciesDependsOn] = toHtmlList(enrichment.dependencies.dependsOn) ?? "";
    customFields[ADO_ENRICHMENT_FIELDS.dependenciesBlocks] = toHtmlList(enrichment.dependencies.blocks) ?? "";
    customFields[ADO_ENRICHMENT_FIELDS.dependenciesConfidence] = enrichment.dependencies.confidence;
    const dependencyRationale = toHtmlList(enrichment.dependencies.rationale);
    if (dependencyRationale) customFields[ADO_ENRICHMENT_FIELDS.dependenciesRationale] = dependencyRationale;
  }

  if (enrichment.missingPieces?.issues?.length) {
    customFields[ADO_ENRICHMENT_FIELDS.missingPiecesIssues] = toHtmlList(enrichment.missingPieces.issues) ?? "";
  }

  if (enrichment.consistencyIssues?.length) {
    const formattedIssues = enrichment.consistencyIssues.map((issue) => {
      const severity = issue.severity ?? "low";
      const conflicts = issue.conflictsWith.length > 0 ? ` [${issue.conflictsWith.join(", ")}]` : "";
      return `${severity.toUpperCase()}: ${issue.description}${conflicts}`;
    });
    customFields[ADO_ENRICHMENT_FIELDS.consistencyIssues] = toHtmlList(formattedIssues) ?? "";
  }

  if (enrichment.effort) {
    customFields[ADO_ENRICHMENT_FIELDS.effortTShirtSize] = enrichment.effort.tshirtSize;
    customFields[ADO_ENRICHMENT_FIELDS.effortConfidence] = enrichment.effort.confidence;
    customFields[ADO_ENRICHMENT_FIELDS.effortReasoning] = escapeHtml(enrichment.effort.reasoning);
  }

  if (enrichment.qualityScore) {
    customFields[ADO_ENRICHMENT_FIELDS.qualityScore] = enrichment.qualityScore.score;
    customFields[ADO_ENRICHMENT_FIELDS.qualityClarity] = enrichment.qualityScore.breakdown.clarity;
    customFields[ADO_ENRICHMENT_FIELDS.qualityCompleteness] = enrichment.qualityScore.breakdown.completeness;
    customFields[ADO_ENRICHMENT_FIELDS.qualityTestability] = enrichment.qualityScore.breakdown.testability;
    customFields[ADO_ENRICHMENT_FIELDS.qualityConsistency] = enrichment.qualityScore.breakdown.consistency;
    const qualityIssues = toHtmlList(enrichment.qualityScore.issues);
    const qualityRecommendations = toHtmlList(enrichment.qualityScore.recommendations);
    if (qualityIssues) customFields[ADO_ENRICHMENT_FIELDS.qualityIssues] = qualityIssues;
    if (qualityRecommendations) customFields[ADO_ENRICHMENT_FIELDS.qualityRecommendations] = qualityRecommendations;
  }

  return customFields;
}

function applyAdoEnrichment(
  description: string,
  acceptanceCriteria: string[],
  tags: string | undefined,
  enrichment: WorkItemEnrichment | undefined
): {
  description: string;
  acceptanceCriteria: string[];
  tags: string | undefined;
  customFields?: Record<string, string | number | boolean>;
} {
  if (!enrichment) {
    return { description, acceptanceCriteria, tags, customFields: undefined };
  }

  const mergedCriteria = appendUnique(acceptanceCriteria, enrichment.definitionOfDone ?? []);
  const summary = buildEnrichmentSummaryHtml(enrichment);
  const mergedDescription = summary ? `${description}${summary}` : description;

  const currentTags = (tags ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const enrichmentTags = [
    enrichment.effort ? `effort:${enrichment.effort.tshirtSize}` : undefined,
    enrichment.qualityScore ? `quality:${enrichment.qualityScore.score >= 80 ? "high" : enrichment.qualityScore.score >= 60 ? "medium" : "low"}` : undefined,
    enrichment.confidence ? `confidence:${enrichment.confidence.overall}` : undefined,
  ].filter((item): item is string => Boolean(item));

  const mergedTags = appendUnique(currentTags, enrichmentTags);
  return {
    description: mergedDescription,
    acceptanceCriteria: mergedCriteria,
    tags: mergedTags.length > 0 ? mergedTags.join(";") : undefined,
    customFields: buildAdoEnrichmentCustomFields(enrichment),
  };
}


function parseStoredPreview(rawContent: string): StoredPreview | undefined {
  try {
    const parsed = JSON.parse(rawContent) as StoredPreview;
    if (parsed && Array.isArray(parsed.items) && typeof parsed.fileName === "string") {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function getOrCreateEpic(
  client: AzureDevOpsClient,
  existingEpics: Array<{ id?: number; fields?: { [key: string]: unknown } }>,
  project: string,
  iterationPath: string,
  areaPath: string,
  themeName: string,
  uniqueSubtopics: string[]
): Promise<{ epic: { id?: number; fields?: { [key: string]: unknown } }; created: boolean }> {
  const existingEpic = findWorkItemByTitle(existingEpics, themeName);
  if (existingEpic) {
    if (existingEpic.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingEpic.id,
        description: buildEpicDescription(themeName, uniqueSubtopics),
        iterationPath,
        areaPath,
      });
    }
    logger.info("Reusing existing epic", { id: existingEpic.id, title: themeName });
    return { epic: existingEpic, created: false };
  }

  const epic = await client.createWorkItem({
    project,
    witType: "Epic",
    title: themeName,
    description: buildEpicDescription(themeName, uniqueSubtopics),
    iterationPath,
    areaPath,
  });
  existingEpics.unshift(epic);
  logger.info("Created epic", { id: epic.id, title: themeName });
  return { epic, created: true };
}

async function getOrCreateFeature(
  client: AzureDevOpsClient,
  project: string,
  iterationPath: string,
  areaPath: string,
  epicId: number,
  subtopic: string,
  themeName: string
): Promise<{ feature: { id?: number; fields?: { [key: string]: unknown } }; created: boolean }> {
  const existingFeatures = await client.listWorkItems({ project, witType: "Feature", parentId: epicId, top: 1000 });
  const existingFeature = findWorkItemByTitle(existingFeatures, subtopic);
  if (existingFeature) {
    if (existingFeature.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingFeature.id,
        description: buildFeatureDescription(subtopic, themeName),
        iterationPath,
        areaPath,
      });
    }
    logger.info("Reusing existing feature", { id: existingFeature.id, title: subtopic, parentEpicId: epicId });
    return { feature: existingFeature, created: false };
  }

  const feature = await client.createWorkItem({
    project,
    witType: "Feature",
    title: subtopic,
    description: buildFeatureDescription(subtopic, themeName),
    parentId: epicId,
    iterationPath,
    areaPath,
  });
  return { feature, created: true };
}

async function getOrCreateStory(
  client: AzureDevOpsClient,
  project: string,
  iterationPath: string,
  areaPath: string,
  featureId: number,
  subtopic: string,
  themeName: string,
  persona: string,
  sourceFileName: string,
  sourceContent: string,
  extraAcceptanceCriteria: string[],
  enrichment?: WorkItemEnrichment
): Promise<{ story: { id?: number; fields?: { [key: string]: unknown } }; created: boolean }> {
  const storyTitle = `Implement ${subtopic}`;
  const existingStories = await client.listWorkItems({ project, witType: "User Story", parentId: featureId, top: 1000 });
  const existingStory = findWorkItemByTitle(existingStories, storyTitle) || findWorkItemByTitle(existingStories, subtopic);

  const provenance: ProvenanceInfo = {
    sourceFileName,
    sourceType: "transcript",
    reference: `Theme: ${themeName}; Subtopic: ${subtopic}`,
    excerpt: selectBestExcerpt(sourceContent, [subtopic, themeName]),
  };

  const enrichedPayload = applyAdoEnrichment(
    buildStoryDescription(subtopic, themeName, persona, provenance),
    [...buildGherkinCriteria(subtopic, themeName, persona), ...extraAcceptanceCriteria],
    undefined,
    enrichment
  );

  if (existingStory) {
    if (existingStory.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingStory.id,
        title: storyTitle,
        description: enrichedPayload.description,
        acceptanceCriteria: enrichedPayload.acceptanceCriteria,
        moscow: "Must",
        iterationPath,
        areaPath,
        tags: enrichedPayload.tags,
        customFields: enrichedPayload.customFields,
      });
    }
    logger.info("Reusing existing user story", { id: existingStory.id, title: storyTitle, parentFeatureId: featureId });
    return { story: existingStory, created: false };
  }

  const story = await client.createWorkItem({
    project,
    witType: "User Story",
    title: storyTitle,
    description: enrichedPayload.description,
    parentId: featureId,
    acceptanceCriteria: enrichedPayload.acceptanceCriteria,
    moscow: "Must",
    iterationPath,
    areaPath,
    tags: enrichedPayload.tags,
    customFields: enrichedPayload.customFields,
  });
  return { story, created: true };
}

async function createMissingTasks(
  client: AzureDevOpsClient,
  project: string,
  iterationPath: string,
  areaPath: string,
  storyId: number,
  subtopic: string,
  taskTitles?: string[]
): Promise<number> {
  const titles = taskTitles ?? [
    `Analyse requirements for ${subtopic}`,
    `Design and implement ${subtopic}`,
    `Test and validate ${subtopic}`,
  ];
  const existingTasks = await client.listWorkItems({ project, witType: "Task", parentId: storyId, top: 1000 });

  let createdTasks = 0;
  for (const taskTitle of titles) {
    const existingTask = findWorkItemByTitle(existingTasks, taskTitle);
    if (existingTask) {
      if (existingTask.id) {
        await client.updateWorkItem({
          project,
          workItemId: existingTask.id,
          iterationPath,
          areaPath,
        });
      }
      logger.info("Reusing existing task", { id: existingTask.id, title: taskTitle, parentStoryId: storyId });
      continue;
    }

    await client.createWorkItem({
      project,
      witType: "Task",
      title: taskTitle,
      parentId: storyId,
      iterationPath,
      areaPath,
    });
    createdTasks++;
  }

  return createdTasks;
}

function buildProcessEpicDescription(stage: ProcessStage): string {
  const steps = stage.steps.map((step) => `<li>${step.title}</li>`).join("");
  return [
    `<strong>${stage.title}</strong><br/><br/>`,
    "This epic is aligned to a To-Be process stage for discovery and traceability.<br/><br/>",
    "Stage activities:<br/>",
    `<ul>${steps}</ul>`,
  ].join("");
}

function buildProcessFeatureDescription(step: ProcessStep, stageTitle: string): string {
  return [
    `<strong>${step.title}</strong><br/><br/>`,
    `This feature represents a capability slice within the process stage <strong>${stageTitle}</strong>.`,
  ].join("");
}

function selectEvidenceSnippets(evidenceContent: string, terms: string[]): string[] {
  if (!evidenceContent.trim() || terms.length === 0) {
    return [];
  }

  const lines = evidenceContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 10);

  const matches = lines
    .filter((line) => {
      const lower = line.toLowerCase();
      return terms.some((term) => lower.includes(term));
    })
    .slice(0, 3)
    .map((line) => truncate(line, 220));

  return matches;
}

function buildPlaceholderStoryDescription(
  step: ProcessStep,
  stageTitle: string,
  persona: string,
  evidenceSnippets: string[],
  designReferences: string[],
  provenance?: ProvenanceInfo
): string {
  const evidenceSection = evidenceSnippets.length > 0
    ? `<strong>Provenance snippets</strong><br/><ul>${evidenceSnippets.map((snippet) => `<li>${snippet}</li>`).join("")}</ul><br/>`
    : "<strong>Provenance snippets</strong><br/>No supporting transcript snippet linked.<br/><br/>";

  const designSection = designReferences.length > 0
    ? `<strong>Design references</strong><br/><ul>${designReferences.map((ref) => `<li>${ref}</li>`).join("")}</ul><br/>`
    : "<strong>Design references</strong><br/>To be linked during fit-gap and solution design.<br/><br/>";

  const base = [
    "<strong>Discovery placeholder story</strong><br/>",
    `As a ${persona}, I need clarity on <strong>${step.title.toLowerCase()}</strong> in stage <strong>${stageTitle}</strong>, so that fit-gap and design decisions can be completed before implementation.<br/><br/>`,
    "<strong>Status</strong><br/>Fit-gap assessment: Unassessed<br/>",
    evidenceSection,
    designSection,
  ].join("");

  return provenance ? base + buildProvenanceHtml(provenance) : base;
}

async function getOrCreateProcessStory(
  client: AzureDevOpsClient,
  project: string,
  iterationPath: string,
  areaPath: string,
  featureId: number,
  step: ProcessStep,
  stageTitle: string,
  processFileName: string,
  processContent: string,
  evidenceContent: string,
  storyMaturity: StoryMaturity,
  designReferences: string[],
  extraAcceptanceCriteria: string[],
  enrichment?: WorkItemEnrichment
): Promise<{ story: { id?: number; fields?: { [key: string]: unknown } }; created: boolean }> {
  const storyTitle = storyMaturity === "placeholder" ? `Discovery placeholder: ${step.title}` : `Implement ${step.title}`;
  const existingStories = await client.listWorkItems({ project, witType: "User Story", parentId: featureId, top: 1000 });
  const existingStory = findWorkItemByTitle(existingStories, storyTitle) || findWorkItemByTitle(existingStories, step.title);
  const persona = getBestPersona(step.role, evidenceContent);
  const evidenceSnippets = selectEvidenceSnippets(evidenceContent, step.evidenceTerms);

  const provenance: ProvenanceInfo = {
    sourceFileName: processFileName,
    sourceType: "process",
    reference: `Stage: ${stageTitle}; Step: ${step.title}`,
    excerpt: selectBestExcerpt(processContent, [step.title, stageTitle]),
  };

  const description = storyMaturity === "placeholder"
    ? buildPlaceholderStoryDescription(step, stageTitle, persona, evidenceSnippets, designReferences, provenance)
    : buildStoryDescription(step.title, stageTitle, persona, provenance);

  const acceptanceCriteria = storyMaturity === "placeholder"
    ? [
      "Given fit-gap analysis has not yet been completed",
      "When the BA/FC reviews this placeholder with stakeholders",
      "Then the requirement intent, constraints, and outcomes are clarified",
      "And linked design references are identified before implementation starts",
    ]
    : [...buildGherkinCriteria(step.title, stageTitle, persona), ...extraAcceptanceCriteria];

  const tags = storyMaturity === "placeholder"
    ? "Discovery;Process-First;FitGap-Unassessed"
    : "Discovery;Process-First;Ready-For-Detail";

  const enrichedPayload = applyAdoEnrichment(description, acceptanceCriteria, tags, enrichment);

  if (existingStory) {
    if (existingStory.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingStory.id,
        title: storyTitle,
        description: enrichedPayload.description,
        acceptanceCriteria: enrichedPayload.acceptanceCriteria,
        moscow: "Must",
        iterationPath,
        areaPath,
        tags: enrichedPayload.tags,
        customFields: enrichedPayload.customFields,
      });
    }
    logger.info("Reusing existing process user story", { id: existingStory.id, title: storyTitle, parentFeatureId: featureId });
    return { story: existingStory, created: false };
  }

  const story = await client.createWorkItem({
    project,
    witType: "User Story",
    title: storyTitle,
    description: enrichedPayload.description,
    parentId: featureId,
    acceptanceCriteria: enrichedPayload.acceptanceCriteria,
    moscow: "Must",
    iterationPath,
    areaPath,
    tags: enrichedPayload.tags,
    customFields: enrichedPayload.customFields,
  });
  return { story, created: true };
}

async function handleCreateBacklogFromProcess(
  client: AzureDevOpsClient,
  input: ToolInput,
  analysis: StoredAnalysis,
  analysisFileName: string
): Promise<string> {
  const backlogStore = getFileStore();
  let preview = parseStoredPreview(backlogStore.get(getPreviewStoreKey(analysisFileName))?.content ?? "");
  if (!preview) {
    handlePreviewBacklog(input);
    preview = parseStoredPreview(backlogStore.get(getPreviewStoreKey(analysisFileName))?.content ?? "");
  }
  const processContent = backlogStore.get(analysisFileName)?.content ?? "";
  const processStages = analysis.processStages ?? [];
  if (processStages.length === 0) {
    return JSON.stringify({ result: "error", message: "No process stages found. Re-run analyse_document with analysisMode='process'." });
  }

  const project = input.project;
  const iterationPath = `${project}\\Backlog`;
  const areaPath = input.areaPath || project;
  const evidenceFileName = input.evidenceFileName || input.fileName;
  const evidenceContent = evidenceFileName ? backlogStore.get(evidenceFileName)?.content ?? "" : "";
  const storyMaturity: StoryMaturity = input.storyMaturity === "detailed" ? "detailed" : "placeholder";
  const designReferences = (input.designReferences ?? []).filter((item) => item.trim().length > 0);
  const extraAcceptanceCriteria = buildRubricAcceptanceCriteria(analysis.rubrics);

  let epicCount = 0;
  let featureCount = 0;
  let storyCount = 0;
  let taskCount = 0;
  const storyIdByPreviewId = new Map<string, number>();

  logger.info("Creating process-first backlog", {
    project,
    processFileName: analysisFileName,
    stages: processStages.length,
    storyMaturity,
    iterationPath,
  });

  const existingEpics = await client.listWorkItems({ project, witType: "Epic", top: 1000 });
  for (const stage of processStages) {
    const uniqueSteps = Array.from(new Map(stage.steps.map((step) => [normaliseTitle(step.title), step])).values());

    const { epic, created: epicCreated } = await getOrCreateEpic(
      client,
      existingEpics,
      project,
      iterationPath,
      areaPath,
      stage.title,
      uniqueSteps.map((step) => step.title)
    );

    if (epicCreated) {
      epicCount++;
    } else if (epic.id) {
      await client.updateWorkItem({
        project,
        workItemId: epic.id,
        description: buildProcessEpicDescription(stage),
        iterationPath,
        areaPath,
      });
    }

    for (const step of uniqueSteps) {
      const { feature, created: featureCreated } = await getOrCreateFeature(
        client,
        project,
        iterationPath,
        areaPath,
        epic.id!,
        step.title,
        stage.title
      );

      if (featureCreated) {
        featureCount++;
      } else if (feature.id) {
        await client.updateWorkItem({
          project,
          workItemId: feature.id,
          description: buildProcessFeatureDescription(step, stage.title),
          iterationPath,
          areaPath,
        });
      }

      const { story, created: storyCreated } = await getOrCreateProcessStory(
        client,
        project,
        iterationPath,
        areaPath,
        feature.id!,
        step,
        stage.title,
        analysisFileName,
        processContent,
        evidenceContent,
        storyMaturity,
        designReferences,
        extraAcceptanceCriteria,
        findEnrichmentForTitle(preview, storyMaturity === "placeholder" ? `Discovery placeholder: ${step.title}` : `Implement ${step.title}`)
      );

      if (storyCreated) {
        storyCount++;
      }

      const previewItemId = preview?.items.find((item) => normaliseTitle(item.title) === normaliseTitle(storyMaturity === "placeholder" ? `Discovery placeholder: ${step.title}` : `Implement ${step.title}`))?.id;
      if (previewItemId && story.id) {
        storyIdByPreviewId.set(previewItemId, story.id);
      }

      const processTaskTitles = storyMaturity === "placeholder"
        ? [
          `Run fit-gap for ${step.title}`,
          `Link design artefacts for ${step.title}`,
          `Refine placeholder into implementation story for ${step.title}`,
        ]
        : [
          `Analyse requirements for ${step.title}`,
          `Design and implement ${step.title}`,
          `Test and validate ${step.title}`,
        ];

      taskCount += await createMissingTasks(client, project, iterationPath, areaPath, story.id!, step.title, processTaskTitles);
    }
  }

  const dependencyLinks = await persistAdoDependencies(client, project, preview, storyIdByPreviewId);

  logger.info("Process-first backlog creation complete", { epicCount, featureCount, storyCount, taskCount, storyMaturity });
  return JSON.stringify({
    result: "success",
    analysisMode: "process",
    storyMaturity,
    epics: epicCount,
    features: featureCount,
    userStories: storyCount,
    tasks: taskCount,
    dependencyLinks,
  });
}



async function handleCreateBacklog(client: AzureDevOpsClient, input: ToolInput): Promise<string> {
  const backlogStore = getFileStore();
  const analysisFileName = input.processFileName || input.fileName;
  if (!analysisFileName) {
    return JSON.stringify({
      result: "error",
      message: "Provide processFileName (preferred) or fileName after analyse_document.",
    });
  }

  const backlogCached = backlogStore.get(`__analysis_${analysisFileName}`);
  if (!backlogCached) {
    return JSON.stringify({ result: "error", message: "No analysis found. Call analyse_document first." });
  }
  const uploadedFile = backlogStore.get(input.fileName || analysisFileName);
  const storedAnalysis = parseStoredAnalysis(backlogCached.content);
  let preview = parseStoredPreview(backlogStore.get(getPreviewStoreKey(analysisFileName))?.content ?? "");
  if (!preview) {
    handlePreviewBacklog(input);
    preview = parseStoredPreview(backlogStore.get(getPreviewStoreKey(analysisFileName))?.content ?? "");
  }

  if (storedAnalysis.analysisMode === "process") {
    return handleCreateBacklogFromProcess(client, input, storedAnalysis, analysisFileName);
  }

  const backlogThemes: Record<string, { mentions: number; subtopics: string[] }> = storedAnalysis.themes ?? {};
  const project = input.project;
  const iterationPath = `${project}\\Backlog`;
  const areaPath = input.areaPath || project;
  const persona = detectPersonaFromTranscript(uploadedFile?.content ?? "");
  const extraAcceptanceCriteria = buildRubricAcceptanceCriteria(storedAnalysis.rubrics);

  let epicCount = 0;
  let featureCount = 0;
  let storyCount = 0;
  let taskCount = 0;
  const storyIdByPreviewId = new Map<string, number>();

  logger.info("Creating full backlog", { project, themes: Object.keys(backlogThemes).length, persona, iterationPath });

  const existingEpics = await client.listWorkItems({ project, witType: "Epic", top: 1000 });

  for (const [themeName, themeData] of Object.entries(backlogThemes)) {
    const uniqueSubtopics = Array.from(new Set(themeData.subtopics));
    const { epic, created: epicCreated } = await getOrCreateEpic(
      client,
      existingEpics,
      project,
      iterationPath,
      areaPath,
      themeName,
      uniqueSubtopics
    );
    if (epicCreated) {
      epicCount++;
    }

    for (const subtopic of uniqueSubtopics) {
      const { feature, created: featureCreated } = await getOrCreateFeature(
        client,
        project,
        iterationPath,
        areaPath,
        epic.id!,
        subtopic,
        themeName
      );
      if (featureCreated) {
        featureCount++;
      }

      const { story, created: storyCreated } = await getOrCreateStory(
        client,
        project,
        iterationPath,
        areaPath,
        feature.id!,
        subtopic,
        themeName,
        persona,
        analysisFileName,
        uploadedFile?.content ?? "",
        extraAcceptanceCriteria,
        findEnrichmentForTitle(preview, `Implement ${subtopic}`)
      );
      if (storyCreated) {
        storyCount++;
      }

      const previewItemId = preview?.items.find((item) => normaliseTitle(item.title) === normaliseTitle(`Implement ${subtopic}`))?.id;
      if (previewItemId && story.id) {
        storyIdByPreviewId.set(previewItemId, story.id);
      }

      taskCount += await createMissingTasks(client, project, iterationPath, areaPath, story.id!, subtopic);
    }
  }

  const dependencyLinks = await persistAdoDependencies(client, project, preview, storyIdByPreviewId);

  logger.info("Backlog creation complete", { epicCount, featureCount, storyCount, taskCount, dependencyLinks });
  return JSON.stringify({ result: "success", epics: epicCount, features: featureCount, userStories: storyCount, tasks: taskCount, dependencyLinks });
}

export async function handleWorkItemTool(
  clients: WorkItemClients,
  toolName: string,
  input: ToolInput
): Promise<string> {
  try {
    switch (toolName) {
      case "list_epics": {
        const client = requireAzureClient(clients);
        const epics = await client.listWorkItems({
          project: input.project,
          witType: "Epic",
          state: input.state,
          assignedTo: input.assignedTo,
          top: input.top,
        });
        const items = epics.map((e) => ({ id: e.id, title: e.fields?.["System.Title"] ?? "", state: e.fields?.["System.State"] ?? "" }));
        return JSON.stringify({ result: "success", count: items.length, items });
      }

      case "list_features": {
        const client = requireAzureClient(clients);
        const features = await client.listWorkItems({
          project: input.project,
          witType: "Feature",
          state: input.state,
          parentId: input.epic,
          top: input.top,
        });
        const items = features.map((f) => ({ id: f.id, title: f.fields?.["System.Title"] ?? "", state: f.fields?.["System.State"] ?? "" }));
        return JSON.stringify({ result: "success", count: items.length, items });
      }

      case "list_user_stories": {
        const client = requireAzureClient(clients);
        const stories = await client.listWorkItems({
          project: input.project,
          witType: "User Story",
          state: input.state,
          assignedTo: input.assignedTo,
          parentId: input.feature,
          top: input.top,
        });
        const items = stories.map((s) => ({ id: s.id, title: s.fields?.["System.Title"] ?? "", state: s.fields?.["System.State"] ?? "" }));
        return JSON.stringify({ result: "success", count: items.length, items });
      }

      case "get_user_story": {
        if (typeof input.userStoryId !== "number") {
          throw new Error("Provide userStoryId (number).");
        }

        const client = requireAzureClient(clients);
        const story = await client.getWorkItem(input.project, input.userStoryId!);
        const tasks = await client.listWorkItems({
          project: input.project,
          witType: "Task",
          parentId: input.userStoryId!,
        });
        const taskItems = tasks.map((t) => ({ id: t.id, title: t.fields?.["System.Title"] ?? "" }));
        return JSON.stringify({
          result: "success",
          id: story.id,
          title: stripHtml(story.fields?.["System.Title"]),
          state: story.fields?.["System.State"] ?? "",
          description: truncate(stripHtml(story.fields?.["System.Description"])),
          tasks: taskItems,
        });
      }

      case "add_acceptance_criteria": {
        if (typeof input.userStoryId !== "number") {
          throw new Error("Provide userStoryId (number).");
        }

        const client = requireAzureClient(clients);
        const updated = await client.addAcceptanceCriteria(
          input.project,
          input.userStoryId!,
          input.criteria!
        );
        return JSON.stringify({ result: "success", id: updated.id });
      }

      case "list_tasks": {
        const client = requireAzureClient(clients);
        const tasks = await client.listWorkItems({
          project: input.project,
          witType: "Task",
          state: input.state,
          assignedTo: input.assignedTo,
          parentId: input.userStory,
          top: input.top,
        });
        const items = tasks.map((t) => ({ id: t.id, title: t.fields?.["System.Title"] ?? "", state: t.fields?.["System.State"] ?? "" }));
        return JSON.stringify({ result: "success", count: items.length, items });
      }

      case "create_epic": {
        const client = requireAzureClient(clients);
        const epic = await client.createWorkItem({
          project: input.project,
          witType: "Epic",
          title: input.title!,
          description: input.description,
          assignedTo: input.assignedTo,
        });
        const epicTitle = epic.fields?.["System.Title"] ?? input.title!;
        return JSON.stringify({ result: "success", id: epic.id, title: epicTitle });
      }

      case "create_feature": {
        const client = requireAzureClient(clients);
        const feature = await client.createWorkItem({
          project: input.project,
          witType: "Feature",
          title: input.title!,
          description: input.description,
          parentId: input.epicId,
        });
        const featureTitle = feature.fields?.["System.Title"] ?? input.title!;
        return JSON.stringify({ result: "success", id: feature.id, title: featureTitle });
      }

      case "create_user_story": {
        const client = requireAzureClient(clients);
        const story = await client.createWorkItem({
          project: input.project,
          witType: "User Story",
          title: input.title!,
          description: input.description,
          parentId: input.featureId,
          acceptanceCriteria: input.acceptanceCriteria,
        });
        const storyTitle = story.fields?.["System.Title"] ?? input.title!;
        return JSON.stringify({ result: "success", id: story.id, title: storyTitle });
      }

      case "create_task": {
        if (typeof input.userStoryId !== "number") {
          throw new Error("Provide userStoryId (number).");
        }

        const client = requireAzureClient(clients);
        const task = await client.createWorkItem({
          project: input.project,
          witType: "Task",
          title: input.title!,
          description: input.description,
          parentId: input.userStoryId!,
          assignedTo: input.assignedTo,
        });
        const taskTitle = task.fields?.["System.Title"] ?? input.title!;
        return JSON.stringify({ result: "success", id: task.id, title: taskTitle });
      }

      case "process_transcript":
        return handleProcessTranscript(input, fileStore);

      case "list_uploaded_files": {
        const files = Array.from(fileStore.entries()).map(([key, val]) => ({
          fileName: val.name,
          size: val.content.length,
          mimeType: val.mimeType,
          uploadedAt: val.uploadedAt.toISOString(),
        }));
        return JSON.stringify({ result: "success", count: files.length, files });
      }

      case "delete_file": {
        const deleted = fileStore.delete(input.fileName!);
        if (deleted) {
          logger.info("File deleted", { fileName: input.fileName });
          return JSON.stringify({ result: "success", message: "File deleted" });
        }
        return JSON.stringify({ result: "error", message: "File not found" });
      }

      case "get_file_content": {
        const file = fileStore.get(input.fileName!);
        if (!file) {
          return JSON.stringify({ result: "error", message: "File not found" });
        }
        const SMALL_FILE_LIMIT = 100000;
        const CHUNK_SIZE = 15000;
        const totalChunks = Math.ceil(file.content.length / CHUNK_SIZE);

        // Suppress content by default to reduce risk of content filtering / sensitive data leakage.
        if (input.includeContent !== true) {
          logger.info("Returning file metadata only (content suppressed)", { fileName: file.name, size: file.content.length, totalChunks });
          const response: Record<string, unknown> = {
            result: "success",
            fileName: file.name,
            size: file.content.length,
            mimeType: file.mimeType,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            message: "Content suppressed by default. Set includeContent=true to return the full text, or use analyse_document for a server-side summary.",
          };
          if (input.includePreview === true) {
            response.preview = truncate(file.content, 500);
          }
          return JSON.stringify(response);
        }

        if (file.content.length <= SMALL_FILE_LIMIT) {
          logger.info("Returning full file content (explicit includeContent=true)", { fileName: file.name, size: file.content.length });
          return JSON.stringify({
            result: "success",
            fileName: file.name,
            size: file.content.length,
            mimeType: file.mimeType,
            totalChunks: 1,
            content: file.content,
          });
        }

        logger.info("File too large for single response, returning metadata", { fileName: file.name, size: file.content.length, totalChunks });
        const response: Record<string, unknown> = {
          result: "success",
          fileName: file.name,
          size: file.content.length,
          mimeType: file.mimeType,
          totalChunks,
          chunkSize: CHUNK_SIZE,
          message: "File is large. Use get_file_chunk with indices 0 to " + (totalChunks - 1) + " (and includeContent=true) to read it, or use analyse_document for a server-side summary.",
        };
        if (input.includePreview === true) {
          response.preview = truncate(file.content, 500);
        }
        return JSON.stringify(response);
      }

      case "get_file_chunk": {
        const file = fileStore.get(input.fileName!);
        if (!file) {
          return JSON.stringify({ result: "error", message: "File not found" });
        }
        const CHUNK_SIZE = 15000;
        const totalChunks = Math.ceil(file.content.length / CHUNK_SIZE);
        const idx = input.chunkIndex ?? 0;
        if (idx < 0 || idx >= totalChunks) {
          return JSON.stringify({ result: "error", message: "Chunk index out of range", totalChunks });
        }
        const start = idx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.content.length);
        const chunkContent = file.content.substring(start, end);

        logger.info("Serving file chunk", { fileName: file.name, chunkIndex: idx, totalChunks });

        if (input.includeContent !== true) {
          return JSON.stringify({
            result: "success",
            fileName: file.name,
            chunkIndex: idx,
            totalChunks,
            chunkSize: chunkContent.length,
            message: "Chunk content suppressed by default. Set includeContent=true to return the chunk text.",
          });
        }

        return JSON.stringify({
          result: "success",
          fileName: file.name,
          chunkIndex: idx,
          totalChunks,
          chunkSize: chunkContent.length,
          content: chunkContent,
        });
      }

      case "analyse_document":
        return handleAnalyseDocument(input);

      case "get_theme_details":
        return handleGetThemeDetails(input);

      case "preview_backlog":
        return handlePreviewBacklog(input);

      case "create_backlog":
        return handleCreateBacklog(requireAzureClient(clients), input);

      case "update_work_item": {
        if (typeof input.workItemId !== "number") {
          throw new Error("Provide workItemId (number).");
        }

        const client = requireAzureClient(clients);
        const updated = await client.updateWorkItem({
          project: input.project,
          workItemId: input.workItemId!,
          state: input.state,
          assignedTo: input.assignedTo,
          description: input.description,
        });
        return JSON.stringify({ result: "success", id: updated.id });
      }

      case "check_project_process": {
        const client = requireAzureClient(clients);
        if (!input.expectedProcessName) {
          throw new Error("expectedProcessName is required.");
        }
        const result = await checkProjectProcess(
          client.getOrgUrl(),
          client.getPat(),
          input.project,
          input.expectedProcessName,
        );
        return JSON.stringify({
          result: "success",
          hasCorrectProcess: result.hasCorrectProcess,
          processName: result.processName,
          expectedProcessName: result.expectedProcessName,
        });
      }

      case "ensure_process_on_project": {
        const client = requireAzureClient(clients);
        if (!input.requiredProcessName) {
          throw new Error("requiredProcessName is required.");
        }
        const ensureResult = await ensureProcessOnProject(
          client.getOrgUrl(),
          client.getPat(),
          input.project,
          input.requiredProcessName,
        );
        return JSON.stringify({
          result: "success",
          status: ensureResult.status,
          message: ensureResult.message,
          processName: ensureResult.processName,
          steps: ensureResult.steps,
        });
      }

      case "migrate_enrichment_process": {
        const client = requireAzureClient(clients);
        if (!input.sourceOrgUrl || !input.sourceProject || !input.sourceProcessName || !input.sourcePat || !input.newProjectName) {
          throw new Error("sourceOrgUrl, sourceProject, sourceProcessName, sourcePat, and newProjectName are all required.");
        }

        const targetOrgUrl = client.getOrgUrl();
        const targetPat = client.getPat();

        // Check if the process already exists in the target org (reuse from a prior migration)
        const existing = await checkEnrichmentProcessExists(targetOrgUrl, targetPat);
        let processId: string;
        let processName: string;

        if (existing.found && existing.processId) {
          processId = existing.processId;
          processName = existing.processName ?? input.sourceProcessName;
          logger.info("Enrichment process already exists in target org — reusing", { processName, processId });
        } else {
          const migrationResult = await migrateProcess({
            sourceOrgUrl: input.sourceOrgUrl,
            sourceProject: input.sourceProject,
            sourceProcessName: input.sourceProcessName,
            sourcePat: input.sourcePat,
            targetOrgUrl,
            targetProject: input.newProjectName,
            targetPat,
          });
          processId = migrationResult.processId;
          processName = migrationResult.processName;
        }

        // Create new project using the migrated process
        const newProject = await createProjectWithProcess(
          targetOrgUrl,
          targetPat,
          input.newProjectName,
          processId,
        );

        const boardUrl = `${targetOrgUrl}/${encodeURIComponent(newProject.projectName)}/_backlogs/backlog`;

        return JSON.stringify({
          result: "success",
          message: `Process "${processName}" migrated and new project "${newProject.projectName}" created.`,
          processName,
          newProjectName: newProject.projectName,
          newProjectId: newProject.projectId,
          boardUrl,
        });
      }

    case "get_backlog_health": {
      const client = requireAzureClient(clients);
      const stories = await client.listWorkItems({
        project: input.project,
        witType: "User Story",
        top: input.top || 500,
      });

      let totalStories = stories.length;
      let red = 0, amber = 0, green = 0, unscored = 0;
      const confidenceBuckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
      const qualityBuckets = [0, 0, 0, 0, 0];
      const effortBreakdown: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, Unknown: 0 };
      const dependencyGraph: { id: number; title: string; dependsOn: string[]; blocks: string[] }[] = [];
      const missingPiecesMap: Record<string, number> = {};
      let confidenceSum = 0, confidenceCount = 0;
      let qualitySum = 0, qualityCount = 0;
      let noConfidence = 0, noDependencies = 0, noEffort = 0, noQuality = 0, noDoD = 0;

      for (const story of stories) {
        const fields = story.fields || {};
        const confOverall = Number(fields["Custom.EnrichmentConfidenceOverall"]) || 0;
        const qualScore = Number(fields["Custom.EnrichmentQualityScore"]) || 0;
        const effortSize = String(fields["Custom.EnrichmentEffortTShirtSize"] || "");
        const depsOn = String(fields["Custom.EnrichmentDependenciesDependsOn"] || "");
        const blocks = String(fields["Custom.EnrichmentDependenciesBlocks"] || "");
        const missingIssues = String(fields["Custom.EnrichmentMissingPiecesIssues"] || "");
        const dod = String(fields["Custom.EnrichmentDefinitionOfDone"] || "");

        // RAG distribution
        if (!fields["Custom.EnrichmentConfidenceOverall"]) {
          unscored++;
          noConfidence++;
        } else if (confOverall < 40) {
          red++;
        } else if (confOverall < 70) {
          amber++;
        } else {
          green++;
        }

        // Confidence histogram
        if (fields["Custom.EnrichmentConfidenceOverall"]) {
          const bucket = Math.min(Math.floor(confOverall / 20), 4);
          confidenceBuckets[bucket]++;
          confidenceSum += confOverall;
          confidenceCount++;
        }

        // Quality histogram
        if (fields["Custom.EnrichmentQualityScore"]) {
          const qBucket = Math.min(Math.floor(qualScore / 20), 4);
          qualityBuckets[qBucket]++;
          qualitySum += qualScore;
          qualityCount++;
        } else {
          noQuality++;
        }

        // Effort
        if (effortSize && ["XS", "S", "M", "L", "XL"].includes(effortSize)) {
          effortBreakdown[effortSize]++;
        } else {
          effortBreakdown["Unknown"]++;
          noEffort++;
        }

        // Dependencies
        if (!depsOn && !blocks) {
          noDependencies++;
        }
        if (story.id) {
          dependencyGraph.push({
            id: story.id,
            title: String(fields["System.Title"] || ""),
            dependsOn: depsOn ? depsOn.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
            blocks: blocks ? blocks.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          });
        }

        // Missing pieces heatmap
        if (missingIssues) {
          for (const issue of missingIssues.split(";").map((s: string) => s.trim()).filter(Boolean)) {
            missingPiecesMap[issue] = (missingPiecesMap[issue] || 0) + 1;
          }
        }

        // DoD coverage
        if (!dod) {
          noDoD++;
        }
      }

      const missingPiecesHeatmap = Object.entries(missingPiecesMap)
        .map(([issue, count]) => ({ issue, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      const bucketLabels = ["0-20", "20-40", "40-60", "60-80", "80-100"];

      return JSON.stringify({
        result: "success",
        totalStories,
        ragDistribution: { red, amber, green, unscored },
        confidenceDistribution: bucketLabels.map((bucket, i) => ({ bucket, count: confidenceBuckets[i] })),
        qualityDistribution: bucketLabels.map((bucket, i) => ({ bucket, count: qualityBuckets[i] })),
        effortBreakdown,
        dependencyGraph: dependencyGraph.filter((d) => d.dependsOn.length > 0 || d.blocks.length > 0),
        missingPiecesHeatmap,
        averageConfidence: confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : 0,
        averageQuality: qualityCount > 0 ? Math.round(qualitySum / qualityCount) : 0,
        coverageGaps: {
          noConfidence,
          noDependencies,
          noEffort,
          noQuality,
          noDoD,
        },
      });
    }

    case "refine_story": {
      const client = requireAzureClient(clients);
      if (!input.workItemId) throw new Error("workItemId is required");
      const story = await client.getWorkItem(input.project, input.workItemId);
      const fields = story.fields || {};

      const title = String(fields["System.Title"] || "");
      const descriptionHtml = String(fields["System.Description"] || "");
      const description = stripHtml(descriptionHtml);
      const acHtml = String(fields["Microsoft.VSTS.Common.AcceptanceCriteria"] || "");
      const acceptanceCriteria = stripHtml(acHtml).split(/\n+/).filter(Boolean);
      const confidenceOverall = Number(fields["Custom.EnrichmentConfidenceOverall"]) || 50;
      const missingRaw = String(fields["Custom.EnrichmentMissingPiecesIssues"] || "");
      const missingIssues = missingRaw.split(";").map((s: string) => s.trim()).filter(Boolean);

      const suggestion = generateRefinementSuggestion(
        input.workItemId,
        title,
        description,
        acceptanceCriteria,
        confidenceOverall,
        missingIssues
      );

      return JSON.stringify({ result: "success", ...suggestion });
    }

    case "extract_rraid": {
      if (!input.fileName) throw new Error("fileName is required");
      const fileStore = getFileStore();
      const storedFile = fileStore.get(input.fileName);
      if (!storedFile) throw new Error(`File '${input.fileName}' not found. Upload it first.`);
      const content = storedFile.content || "";
      if (!content) throw new Error(`File '${input.fileName}' has no content.`);

      const items = extractRRAID(content, input.fileName);

      // Match to existing stories
      try {
        const client = requireAzureClient(clients);
        const stories = await client.listWorkItems({ project: input.project, witType: "User Story", top: 200 });
        const storyTitles = stories.map((s) => String(s.fields?.["System.Title"] || "")).filter(Boolean);
        matchRRAIDToStories(items, storyTitles);
      } catch { /* matching is optional */ }

      logger.info("RRAID extraction complete", { fileName: input.fileName, itemCount: items.length });
      return JSON.stringify({ result: "success", itemCount: items.length, items });
    }

    case "create_rraid_items": {
      const client = requireAzureClient(clients);
      const rraItems = input.items || [];
      if (rraItems.length === 0) throw new Error("No items provided.");

      let created = 0;
      for (const item of rraItems) {
        const tags = `RRAID:${item.category};${item.severity}`;
        await client.createWorkItem({
          project: input.project,
          witType: "Issue",
          title: item.title,
          description: `<strong>[${item.category}]</strong> ${item.description}<br/><br/><em>Severity: ${item.severity}</em>`,
          tags,
        });
        created++;
      }

      logger.info("RRAID items created", { project: input.project, created });
      return JSON.stringify({ result: "success", created });
    }

    case "list_rraid_items": {
      const client = requireAzureClient(clients);
      const issues = await client.listWorkItems({
        project: input.project,
        witType: "Issue",
        top: 200,
      });

      // Filter to RRAID-tagged items
      let rraItems = issues.filter((iss) => {
        const tags = String(iss.fields?.["System.Tags"] || "");
        return tags.includes("RRAID:");
      });

      // Optional category filter
      if (input.category) {
        rraItems = rraItems.filter((iss) => {
          const tags = String(iss.fields?.["System.Tags"] || "");
          return tags.includes(`RRAID:${input.category}`);
        });
      }

      const mapped = rraItems.map((iss) => {
        const tags = String(iss.fields?.["System.Tags"] || "");
        const categoryMatch = tags.match(/RRAID:(Risk|Requirement|Assumption|Issue|Dependency)/);
        const severityMatch = tags.match(/\b(High|Medium|Low)\b/);
        return {
          id: iss.id,
          title: String(iss.fields?.["System.Title"] || ""),
          category: categoryMatch?.[1] || "Unknown",
          severity: severityMatch?.[1] || "Low",
          state: String(iss.fields?.["System.State"] || ""),
        };
      });

      return JSON.stringify({ result: "success", count: mapped.length, items: mapped });
    }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error(`Error handling tool ${toolName}`, error);
    if (error instanceof Error) {
      const safeMessage = truncate(toSingleLine(error.message || "Operation failed"), 400);
      throw new Error(`Operation failed: ${safeMessage}`);
    }
    throw new Error(`Operation failed.`);
  }
}

// ---------------------------------------------------------------------------
// Test-only exports — DO NOT USE IN PRODUCTION CODE
// Exposed to allow unit testing of private utility functions.
// ---------------------------------------------------------------------------
export const _testExports = {
  stripHtml,
  parseBooleanEnv,
  getEnrichmentFlags,
  truncate,
  toSingleLine,
  escapeRegExp,
  escapeHtml,
  assessRubrics,
  buildRubricAcceptanceCriteria,
  selectBestExcerpt,
  buildProvenanceHtml,
  buildProvenanceText,
  appendAcceptanceCriteriaBlock,
  tryDecodeBase64,
  extractTextFromBinary,
  resolveContentUrl,
  cleanExtractedText,
  splitIntoSentencesAndLines,
  isLikelyProcessStep,
  extractRoleFromStep,
  extractEvidenceTerms,
  normaliseTitle,
  findWorkItemByTitle,
  detectPersonaFromTranscript,
  getBestPersona,
  toPreviewItemId,
  buildGherkinCriteria,
  buildStoryDescription,
  buildEpicDescription,
  buildFeatureDescription,
  buildProcessEpicDescription,
  buildProcessFeatureDescription,
  buildPlaceholderStoryDescription,
  selectEvidenceSnippets,
  appendUnique,
  toEnrichmentLabelToken,
  buildEnrichmentSummaryText,
  buildEnrichmentSummaryHtml,
  toHtmlList,
  buildAdoEnrichmentCustomFields,
  applyAdoEnrichment,
  parseStoredAnalysis,
  parseStoredPreview,
  scanSectionForThemes,
  parseAnalysisMode,
  getPreviewStoreKey,
  findEnrichmentForTitle,
};
