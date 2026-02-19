import { AzureDevOpsClient } from "../azureDevOpsClient.js";
import { logger } from "../logger.js";
import { JiraClient } from "../jiraClient.js";

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

function jiraDescriptionToText(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function appendAcceptanceCriteriaBlock(description: string, criteria: string[] | undefined): string {
  const items = (criteria ?? []).map((c) => c.trim()).filter(Boolean);
  if (items.length === 0) return description;

  const base = description.trim();
  const lines = [base, base ? "" : "", "Acceptance Criteria:", ...items.map((c) => `- ${c}`)].filter((l) => l !== "");
  return lines.join("\n");
}

function requireJiraKey(raw: unknown, fieldName: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(`For Jira, provide ${fieldName} (e.g. 'ABC-123').`);
  }
  return value;
}

type AnalysisMode = "themes" | "process";
type StoryMaturity = "placeholder" | "detailed";
type TargetSystem = "azuredevops" | "jira";

interface RubricAssessment {
  id: string;
  name: string;
  mentions: number;
  signals: string[];
}

function parseTargetSystem(raw: unknown): TargetSystem {
  const lowered = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (lowered === "jira") return "jira";
  if (lowered === "ado" || lowered === "azure" || lowered === "azuredevops" || lowered === "azure devops") {
    return "azuredevops";
  }
  return "azuredevops";
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
  // Jira Wiki-style italics
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
        },
        epic: {
          type: "number",
          description: "Parent epic ID.",
        },
        epicKey: {
          type: "string",
          description: "Parent epic key (Jira only), e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
        },
        feature: {
          type: "number",
          description: "Parent feature ID.",
        },
        featureKey: {
          type: "string",
          description: "Parent feature key (Jira only) i.e. Jira issue type 'New Feature', e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
        },
        userStoryId: {
          type: "number",
          description: "User story ID.",
        },
        userStoryKey: {
          type: "string",
          description: "User story key (Jira only), e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
        },
        userStoryId: {
          type: "number",
          description: "User story ID.",
        },
        userStoryKey: {
          type: "string",
          description: "User story key (Jira only), e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
        },
        userStory: {
          type: "number",
          description: "Parent user story ID.",
        },
        userStoryKey: {
          type: "string",
          description: "Parent user story key (Jira only), e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
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
        epicKey: {
          type: "string",
          description: "Parent epic key (Jira only), e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
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
        featureKey: {
          type: "string",
          description: "Parent feature key (Jira only) i.e. Jira issue type 'New Feature', e.g. 'ABC-123'.",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
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
        userStoryKey: {
          type: "string",
          description: "Parent user story key (Jira only), e.g. 'ABC-123'.",
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
    name: "create_backlog",
    description: "Creates a backlog from a previously analysed document. Supports process-first placeholder discovery backlogs and legacy transcript/theme backlog generation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetSystem: {
          type: "string",
          description: "Target system for created work items: 'azuredevops' (default) or 'jira'.",
        },
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
          description: "Target project identifier. For Azure DevOps: project name. For Jira: project key (e.g., 'ABC').",
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
        targetSystem: {
          type: "string",
          description: "Target system: 'azuredevops' (default) or 'jira'.",
        },
        project: {
          type: "string",
          description: "Project identifier. For Azure DevOps: project name. For Jira: project key.",
        },
        workItemId: {
          type: "number",
          description: "Work item ID.",
        },
        workItemKey: {
          type: "string",
          description: "Work item key (Jira only), e.g. 'ABC-123'.",
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
];

interface ToolInput {
  project: string;
  targetSystem?: string;
  analysisMode?: AnalysisMode;
  iterationPath?: string;
  areaPath?: string;
  state?: string;
  assignedTo?: string;
  epic?: number;
  epicKey?: string;
  feature?: number;
  featureKey?: string;
  userStory?: number;
  userStoryKey?: string;
  top?: number;
  userStoryId?: number;
  // Alias used by update_work_item and others in Jira mode
  workItemKey?: string;
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
}

interface WorkItemClients {
  azureDevOpsClient?: AzureDevOpsClient;
  jiraClient?: JiraClient;
}

function requireAzureClient(clients: WorkItemClients): AzureDevOpsClient {
  if (!clients.azureDevOpsClient) {
    throw new Error("Azure DevOps client is not configured on this server. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT, and AZURE_DEVOPS_URL.");
  }
  return clients.azureDevOpsClient;
}

function requireJiraClient(clients: WorkItemClients): JiraClient {
  if (!clients.jiraClient) {
    throw new Error("Jira client is not configured on this server. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.");
  }
  return clients.jiraClient;
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
    content = tryDecodeBase64(input.fileContent);
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
  if (!line || line.length < 8 || line.length > 180) {
    return false;
  }
  return /^(-|\*|•|\d+[.)])\s+/.test(line)
    || /\b(then|after|before|next|submit|approve|validate|handoff|dispatch|book|invoice)\b/i.test(line)
    || line.includes("->")
    || line.includes("→");
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

function analyseProcessDocument(content: string): ProcessStage[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const stages: ProcessStage[] = [];
  let currentStage: ProcessStage = { title: "To-Be Process Flow", steps: [] };

  const pushCurrentStage = () => {
    if (currentStage.steps.length > 0 && !stages.find((s) => normaliseTitle(s.title) === normaliseTitle(currentStage.title))) {
      stages.push(currentStage);
    }
  };

  for (const line of lines) {
    const stageMatch = /^(?:\d+\s*[.)-]?\s*)?(?:stage|phase|process stage|process phase)\s*[:\-]\s*(.+)$/i.exec(line)
      || /^(?:to[-\s]?be|future state)\s*[:\-]\s*(.+)$/i.exec(line);
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
        steps: lines.slice(0, 20).map((line) => ({
          title: line,
          role: extractRoleFromStep(line),
          evidenceTerms: extractEvidenceTerms(line),
        })),
      },
    ];
  }

  return stages.map((stage) => ({
    ...stage,
    steps: stage.steps.slice(0, 12),
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
  extraAcceptanceCriteria: string[]
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

  if (existingStory) {
    if (existingStory.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingStory.id,
        title: storyTitle,
        description: buildStoryDescription(subtopic, themeName, persona, provenance),
        acceptanceCriteria: [...buildGherkinCriteria(subtopic, themeName, persona), ...extraAcceptanceCriteria],
        moscow: "Must",
        iterationPath,
        areaPath,
      });
    }
    logger.info("Reusing existing user story", { id: existingStory.id, title: storyTitle, parentFeatureId: featureId });
    return { story: existingStory, created: false };
  }

  const story = await client.createWorkItem({
    project,
    witType: "User Story",
    title: storyTitle,
    description: buildStoryDescription(subtopic, themeName, persona, provenance),
    parentId: featureId,
    acceptanceCriteria: [...buildGherkinCriteria(subtopic, themeName, persona), ...extraAcceptanceCriteria],
    moscow: "Must",
    iterationPath,
    areaPath,
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
  extraAcceptanceCriteria: string[]
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

  if (existingStory) {
    if (existingStory.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingStory.id,
        title: storyTitle,
        description,
        acceptanceCriteria,
        moscow: "Must",
        iterationPath,
        areaPath,
        tags,
      });
    }
    logger.info("Reusing existing process user story", { id: existingStory.id, title: storyTitle, parentFeatureId: featureId });
    return { story: existingStory, created: false };
  }

  const story = await client.createWorkItem({
    project,
    witType: "User Story",
    title: storyTitle,
    description,
    parentId: featureId,
    acceptanceCriteria,
    moscow: "Must",
    iterationPath,
    areaPath,
    tags,
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
        extraAcceptanceCriteria
      );

      if (storyCreated) {
        storyCount++;
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

  logger.info("Process-first backlog creation complete", { epicCount, featureCount, storyCount, taskCount, storyMaturity });
  return JSON.stringify({
    result: "success",
    analysisMode: "process",
    storyMaturity,
    epics: epicCount,
    features: featureCount,
    userStories: storyCount,
    tasks: taskCount,
  });
}

async function handleCreateBacklogJira(jira: JiraClient, input: ToolInput): Promise<string> {
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

  const storedAnalysis = parseStoredAnalysis(backlogCached.content);
  const projectKey = input.project;

  if (storedAnalysis.analysisMode === "process") {
    return handleCreateBacklogFromProcessJira(jira, input, storedAnalysis, analysisFileName, projectKey);
  }

  const themes: Record<string, { mentions: number; subtopics: string[] }> = storedAnalysis.themes ?? {};
  const sourceContent = backlogStore.get(input.fileName || analysisFileName)?.content ?? "";
  const persona = detectPersonaFromTranscript(sourceContent);
  const extraAcceptanceCriteria = buildRubricAcceptanceCriteria(storedAnalysis.rubrics);

  let epicCount = 0;
  let storyCount = 0;

  for (const [themeName, themeData] of Object.entries(themes)) {
    const epicSummary = themeName;
    const existingEpic = await jira.findIssueBySummary(projectKey, "Epic", epicSummary);
    const epic = existingEpic
      ?? await jira.createIssue({
        projectKey,
        issueType: "Epic",
        summary: epicSummary,
        description: `${themeName}\n\nCreated from analysed transcript themes.`,
        labels: ["mcp", "backlog", "themes"],
      });
    if (!existingEpic) epicCount++;

    const uniqueSubtopics = Array.from(new Set(themeData.subtopics));
    for (const subtopic of uniqueSubtopics) {
      const storySummary = `Implement ${subtopic}`;
      const existingStory = await jira.findIssueBySummary(projectKey, "Story", storySummary);
      if (existingStory) continue;

      const provenance: ProvenanceInfo = {
        sourceFileName: analysisFileName,
        sourceType: "transcript",
        reference: `Theme: ${themeName}; Subtopic: ${subtopic}`,
        excerpt: selectBestExcerpt(sourceContent, [subtopic, themeName]),
      };

      const description = [
        "User Story",
        `As a ${persona}, I need the ability to utilise ${subtopic.toLowerCase()} so that I can effectively manage ${themeName.toLowerCase()} processes and workflows.`,
        "",
        `Context: Theme: ${themeName}`,
        "",
        "Acceptance Criteria:",
        ...[...buildGherkinCriteria(subtopic, themeName, persona), ...extraAcceptanceCriteria].map((c) => `- ${c}`),
        "",
        buildProvenanceText(provenance),
      ].join("\n");

      await jira.createIssue({
        projectKey,
        issueType: "Story",
        summary: storySummary,
        description,
        epicKey: epic.key,
        labels: ["mcp", "backlog", "themes"],
      });
      storyCount++;
    }
  }

  return JSON.stringify({
    result: "success",
    targetSystem: "jira",
    analysisMode: "themes",
    epics: epicCount,
    userStories: storyCount,
  });
}

async function handleCreateBacklogFromProcessJira(
  jira: JiraClient,
  input: ToolInput,
  analysis: StoredAnalysis,
  analysisFileName: string,
  projectKey: string
): Promise<string> {
  const backlogStore = getFileStore();
  const processStages = analysis.processStages ?? [];
  const processContent = backlogStore.get(analysisFileName)?.content ?? "";
  if (processStages.length === 0) {
    return JSON.stringify({ result: "error", message: "No process stages found. Re-run analyse_document with analysisMode='process'." });
  }

  const evidenceFileName = input.evidenceFileName || input.fileName;
  const evidenceContent = evidenceFileName ? backlogStore.get(evidenceFileName)?.content ?? "" : "";
  const storyMaturity: StoryMaturity = input.storyMaturity === "detailed" ? "detailed" : "placeholder";
  const designReferences = (input.designReferences ?? []).filter((item) => item.trim().length > 0);
  const extraAcceptanceCriteria = buildRubricAcceptanceCriteria(analysis.rubrics);

  let epicCount = 0;
  let storyCount = 0;

  for (const stage of processStages) {
    const epicSummary = stage.title;
    const existingEpic = await jira.findIssueBySummary(projectKey, "Epic", epicSummary);
    const epic = existingEpic
      ?? await jira.createIssue({
        projectKey,
        issueType: "Epic",
        summary: epicSummary,
        description: `${stage.title}\n\nTo-Be process stage (process-first discovery).`,
        labels: ["mcp", "backlog", "process"],
      });
    if (!existingEpic) epicCount++;

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

      const storySummary = storyMaturity === "placeholder"
        ? `Discovery placeholder: ${step.title}`
        : `Implement ${step.title}`;

      const existingStory = await jira.findIssueBySummary(projectKey, "Story", storySummary);
      if (existingStory) continue;

      const description = storyMaturity === "placeholder"
        ? [
          "Discovery placeholder story",
          `As a ${persona}, I need clarity on ${step.title} in stage ${stage.title}, so that fit-gap and design decisions can be completed before implementation.`,
          "",
          "Status: Fit-gap assessment: Unassessed",
          "",
          "Provenance snippets:",
          ...(evidenceSnippets.length > 0 ? evidenceSnippets.map((s) => `- ${s}`) : ["- (none linked)"]),
          "",
          "Design references:",
          ...(designReferences.length > 0 ? designReferences.map((r) => `- ${r}`) : ["- (to be linked)"]),
          "",
          buildProvenanceText(provenance),
        ].join("\n")
        : [
          "User Story",
          `As a ${persona}, I need the ability to utilise ${step.title.toLowerCase()} from within the system, so that I can effectively manage ${stage.title.toLowerCase()} processes and workflows.`,
          "",
          `Context: Stage: ${stage.title}`,
          "",
          "Acceptance Criteria:",
          ...[...buildGherkinCriteria(step.title, stage.title, persona), ...extraAcceptanceCriteria].map((c) => `- ${c}`),
          "",
          buildProvenanceText(provenance),
        ].join("\n");

      await jira.createIssue({
        projectKey,
        issueType: "Story",
        summary: storySummary,
        description,
        epicKey: epic.key,
        labels: ["mcp", "backlog", "process"],
      });
      storyCount++;
    }
  }

  return JSON.stringify({
    result: "success",
    targetSystem: "jira",
    analysisMode: "process",
    storyMaturity,
    epics: epicCount,
    userStories: storyCount,
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
        uploadedFile?.content ?? ""
        ,
        extraAcceptanceCriteria
      );
      if (storyCreated) {
        storyCount++;
      }

      taskCount += await createMissingTasks(client, project, iterationPath, areaPath, story.id!, subtopic);
    }
  }

  logger.info("Backlog creation complete", { epicCount, featureCount, storyCount, taskCount });
  return JSON.stringify({ result: "success", epics: epicCount, features: featureCount, userStories: storyCount, tasks: taskCount });
}

export async function handleWorkItemTool(
  clients: WorkItemClients,
  toolName: string,
  input: ToolInput
): Promise<string> {
  try {
    const targetSystem = parseTargetSystem(input.targetSystem);
    switch (toolName) {
      case "list_epics": {
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const epics = await jira.listIssues({
            projectKey: input.project,
            issueType: "Epic",
            state: input.state,
            assignedTo: input.assignedTo,
            maxResults: input.top,
          });
          const items = epics.map((e) => ({
            id: e.key,
            key: e.key,
            title: e.fields?.summary ?? "",
            state: e.fields?.status?.name ?? "",
          }));
          return JSON.stringify({ result: "success", count: items.length, items });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const features = await jira.listIssues({
            projectKey: input.project,
            issueType: "New Feature",
            epicKey: input.epicKey,
            state: input.state,
            maxResults: input.top,
          });
          const items = features.map((f) => ({
            id: f.key,
            key: f.key,
            title: f.fields?.summary ?? "",
            state: f.fields?.status?.name ?? "",
          }));
          return JSON.stringify({ result: "success", count: items.length, items });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const linkTypeName = jira.getHierarchyLinkType();
          const stories = await jira.listIssues({
            projectKey: input.project,
            issueType: "Story",
            linkedToKey: input.featureKey,
            linkTypeName,
            state: input.state,
            assignedTo: input.assignedTo,
            maxResults: input.top,
          });
          const items = stories.map((s) => ({
            id: s.key,
            key: s.key,
            title: s.fields?.summary ?? "",
            state: s.fields?.status?.name ?? "",
          }));
          return JSON.stringify({ result: "success", count: items.length, items });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const storyKey = requireJiraKey(input.userStoryKey, "userStoryKey");
          const story = await jira.getIssue(storyKey);

          const linkTypeName = jira.getHierarchyLinkType();
          const tasks = await jira.listIssues({
            projectKey: input.project,
            issueType: "Task",
            linkedToKey: storyKey,
            linkTypeName,
            maxResults: 200,
          });
          const taskItems = tasks.map((t) => ({ id: t.key, key: t.key, title: t.fields?.summary ?? "" }));

          const description = jiraDescriptionToText(story.fields?.description);
          return JSON.stringify({
            result: "success",
            id: story.key,
            key: story.key,
            title: story.fields?.summary ?? "",
            state: story.fields?.status?.name ?? "",
            description: truncate(description),
            tasks: taskItems,
          });
        }

        if (typeof input.userStoryId !== "number") {
          throw new Error("For Azure DevOps, provide userStoryId (number). For Jira, provide userStoryKey.");
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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const storyKey = requireJiraKey(input.userStoryKey, "userStoryKey");
          const story = await jira.getIssue(storyKey);
          const existing = jiraDescriptionToText(story.fields?.description);
          const updated = appendAcceptanceCriteriaBlock(existing, input.criteria);
          await jira.updateIssue(storyKey, { description: updated });
          return JSON.stringify({ result: "success", key: storyKey });
        }

        if (typeof input.userStoryId !== "number") {
          throw new Error("For Azure DevOps, provide userStoryId (number). For Jira, provide userStoryKey.");
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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const linkTypeName = jira.getHierarchyLinkType();
          const tasks = await jira.listIssues({
            projectKey: input.project,
            issueType: "Task",
            linkedToKey: input.userStoryKey,
            linkTypeName,
            state: input.state,
            assignedTo: input.assignedTo,
            maxResults: input.top,
          });
          const items = tasks.map((t) => ({
            id: t.key,
            key: t.key,
            title: t.fields?.summary ?? "",
            state: t.fields?.status?.name ?? "",
          }));
          return JSON.stringify({ result: "success", count: items.length, items });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const epic = await jira.createIssue({
            projectKey: input.project,
            issueType: "Epic",
            summary: input.title!,
            description: input.description,
            labels: ["mcp", "backlog", "epic"],
          });
          return JSON.stringify({ result: "success", id: epic.key, key: epic.key, title: input.title! });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const feature = await jira.createIssue({
            projectKey: input.project,
            issueType: "New Feature",
            summary: input.title!,
            description: input.description,
            epicKey: input.epicKey,
            labels: ["mcp", "backlog", "feature"],
          });
          return JSON.stringify({ result: "success", id: feature.key, key: feature.key, title: input.title! });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const description = appendAcceptanceCriteriaBlock(input.description ?? "", input.acceptanceCriteria);
          const story = await jira.createIssue({
            projectKey: input.project,
            issueType: "Story",
            summary: input.title!,
            description,
            labels: ["mcp", "backlog", "story"],
          });

          if (input.featureKey?.trim()) {
            await jira.createIssueLink({
              parentKey: input.featureKey.trim(),
              childKey: story.key,
            });
          }

          return JSON.stringify({ result: "success", id: story.key, key: story.key, title: input.title! });
        }

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
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const parentStoryKey = requireJiraKey(input.userStoryKey, "userStoryKey");
          const task = await jira.createIssue({
            projectKey: input.project,
            issueType: "Task",
            summary: input.title!,
            description: input.description,
            labels: ["mcp", "backlog", "task"],
          });

          await jira.createIssueLink({ parentKey: parentStoryKey, childKey: task.key });

          if (input.assignedTo?.trim()) {
            const raw = input.assignedTo.trim();
            if (raw.includes("@") || raw.includes(" ")) {
              throw new Error("Jira assignment requires an accountId. Provide assignedTo as Jira accountId (not email/display name). ");
            }
            await jira.assignIssue(task.key, raw);
          }

          return JSON.stringify({ result: "success", id: task.key, key: task.key, title: input.title! });
        }

        if (typeof input.userStoryId !== "number") {
          throw new Error("For Azure DevOps, provide userStoryId (number). For Jira, provide userStoryKey.");
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

      case "create_backlog":
        if (targetSystem === "jira") {
          return handleCreateBacklogJira(requireJiraClient(clients), input);
        }
        return handleCreateBacklog(requireAzureClient(clients), input);

      case "update_work_item": {
        if (targetSystem === "jira") {
          const jira = requireJiraClient(clients);
          const issueKey = requireJiraKey(input.workItemKey, "workItemKey");

          if (typeof input.description === "string") {
            await jira.updateIssue(issueKey, { description: input.description });
          }

          if (input.assignedTo?.trim()) {
            const raw = input.assignedTo.trim();
            if (raw.toLowerCase() === "unassigned" || raw.toLowerCase() === "none") {
              await jira.assignIssue(issueKey, null);
            } else if (raw.includes("@") || raw.includes(" ")) {
              throw new Error("Jira assignment requires an accountId. Provide assignedTo as Jira accountId (not email/display name). ");
            } else {
              await jira.assignIssue(issueKey, raw);
            }
          }

          if (input.state?.trim()) {
            await jira.transitionIssue(issueKey, input.state);
          }

          return JSON.stringify({ result: "success", key: issueKey });
        }

        if (typeof input.workItemId !== "number") {
          throw new Error("For Azure DevOps, provide workItemId (number). For Jira, provide workItemKey.");
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
