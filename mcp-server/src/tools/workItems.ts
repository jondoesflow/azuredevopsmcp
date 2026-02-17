import { AzureDevOpsClient } from "../azureDevOpsClient.js";
import { logger } from "../logger.js";

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

// Truncate text to avoid large payloads triggering content filters
function truncate(text: string, max: number = 200): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + "...";
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
          description: "Project name.",
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
          description: "Project name.",
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
          description: "Project name.",
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
          description: "Project name.",
        },
        userStoryId: {
          type: "number",
          description: "User story ID.",
        },
      },
      required: ["project", "userStoryId"],
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
          description: "Project name.",
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
      required: ["project", "userStoryId", "criteria"],
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
          description: "Project name.",
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
          description: "Project name.",
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
          description: "Project name.",
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
          description: "Project name.",
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
          description: "Project name.",
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
      required: ["project", "title", "userStoryId"],
    },
  },
  {
    name: "process_transcript",
    description: "Stores an uploaded file for processing. Provide fileContent as plain text or base64 string. Alternatively provide contentUrl which is a data URI like data:text/plain;base64,... from an attachment.",
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
    description: "Returns the full file content if under 100K characters. For larger files, returns metadata and total chunks. Use get_file_chunk to read each chunk of large files.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the file to retrieve.",
        },
      },
      required: ["fileName"],
    },
  },
  {
    name: "get_file_chunk",
    description: "Returns one chunk of a stored file by index.",
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
      },
      required: ["fileName", "chunkIndex"],
    },
  },
  {
    name: "analyse_document",
    description: "Analyses a large uploaded file server-side and returns a list of themes found. Call get_theme_details for each theme to get subtopics before creating work items.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the uploaded file to analyse.",
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
    description: "Creates a full backlog of Epics, Features, User Stories, and Tasks from a previously analysed document. Call analyse_document first. This creates all work items in one operation and returns a count summary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: {
          type: "string",
          description: "Name of the uploaded file that was analysed.",
        },
        project: {
          type: "string",
          description: "Azure DevOps project name.",
        },
        iterationPath: {
          type: "string",
          description: "Optional Azure DevOps iteration path. Defaults to <Project>\\Sprint 0.",
        },
        areaPath: {
          type: "string",
          description: "Optional Azure DevOps area path. Defaults to project root area.",
        },
        persona: {
          type: "string",
          description: "Optional persona used in generated user story wording (for example: salesperson).",
        },
      },
      required: ["fileName", "project"],
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
          description: "Project name.",
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
      required: ["project", "workItemId"],
    },
  },
];

interface ToolInput {
  project: string;
  iterationPath?: string;
  areaPath?: string;
  persona?: string;
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
  fileContent?: string;
  contentUrl?: string;
  contentType?: string;
  themeName?: string;
  chunkIndex?: number;
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
    } catch (err: any) {
      return JSON.stringify({ result: "error", message: "Failed to fetch file from URL: " + err.message });
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
  return JSON.stringify({ result: "success", fileName, size: content.length, contentType, preview: truncate(content, 500) });
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

function handleAnalyseDocument(input: ToolInput): string {
  const fileStore = getFileStore();
  const file = fileStore.get(input.fileName!);
  if (!file) {
    return JSON.stringify({ result: "error", message: "File not found" });
  }
  logger.info("Analysing document server-side", { fileName: file.name, size: file.content.length });

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

  fileStore.set(`__analysis_${file.name}`, {
    name: `__analysis_${file.name}`,
    content: JSON.stringify(finalThemes),
    mimeType: "application/json",
    uploadedAt: new Date(),
  });

  const themeList = Object.entries(finalThemes).map(([name, d]) => ({ name, mentions: d.mentions, subtopicCount: d.subtopics.length }));
  return JSON.stringify({ result: "success", fileName: file.name, totalLines, themesFound: themeList.length, themes: themeList });
}

function handleGetThemeDetails(input: ToolInput): string {
  const analysisStore = getFileStore();
  const cached = analysisStore.get(`__analysis_${input.fileName}`);
  if (!cached) {
    return JSON.stringify({ result: "error", message: "No analysis found. Call analyse_document first." });
  }
  const allThemes: Record<string, { mentions: number; subtopics: string[] }> = JSON.parse(cached.content);
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

function buildStoryDescription(subtopic: string, themeName: string, persona: string): string {
  return [
    `<strong>User Story</strong><br/>`,
    `As a ${persona}, I need the ability to utilise ${subtopic.toLowerCase()} from within the system, `,
    `so that I can effectively manage ${themeName.toLowerCase()} processes and workflows.<br/><br/>`,
    `<strong>Context</strong><br/>Theme: ${themeName}`,
  ].join("");
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
  persona: string
): Promise<{ story: { id?: number; fields?: { [key: string]: unknown } }; created: boolean }> {
  const storyTitle = `Implement ${subtopic}`;
  const existingStories = await client.listWorkItems({ project, witType: "User Story", parentId: featureId, top: 1000 });
  const existingStory = findWorkItemByTitle(existingStories, storyTitle) || findWorkItemByTitle(existingStories, subtopic);
  if (existingStory) {
    if (existingStory.id) {
      await client.updateWorkItem({
        project,
        workItemId: existingStory.id,
        title: storyTitle,
        description: buildStoryDescription(subtopic, themeName, persona),
        acceptanceCriteria: buildGherkinCriteria(subtopic, themeName, persona),
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
    description: buildStoryDescription(subtopic, themeName, persona),
    parentId: featureId,
    acceptanceCriteria: buildGherkinCriteria(subtopic, themeName, persona),
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
  subtopic: string
): Promise<number> {
  const taskTitles = [
    `Analyse requirements for ${subtopic}`,
    `Design and implement ${subtopic}`,
    `Test and validate ${subtopic}`,
  ];
  const existingTasks = await client.listWorkItems({ project, witType: "Task", parentId: storyId, top: 1000 });

  let createdTasks = 0;
  for (const taskTitle of taskTitles) {
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

async function handleCreateBacklog(client: AzureDevOpsClient, input: ToolInput): Promise<string> {
  const backlogStore = getFileStore();
  const backlogCached = backlogStore.get(`__analysis_${input.fileName}`);
  if (!backlogCached) {
    return JSON.stringify({ result: "error", message: "No analysis found. Call analyse_document first." });
  }
  const backlogThemes: Record<string, { mentions: number; subtopics: string[] }> = JSON.parse(backlogCached.content);
  const project = input.project;
  const iterationPath = input.iterationPath || `${project}\\Sprint 0`;
  const areaPath = input.areaPath || project;
  const persona = input.persona || "user";

  let epicCount = 0;
  let featureCount = 0;
  let storyCount = 0;
  let taskCount = 0;

  logger.info("Creating full backlog", { project, themes: Object.keys(backlogThemes).length });

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
        persona
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
  client: AzureDevOpsClient,
  toolName: string,
  input: ToolInput
): Promise<string> {
  try {
    switch (toolName) {
      case "list_epics": {
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
        const updated = await client.addAcceptanceCriteria(
          input.project,
          input.userStoryId!,
          input.criteria!
        );
        return JSON.stringify({ result: "success", id: updated.id });
      }

      case "list_tasks": {
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
        if (file.content.length <= SMALL_FILE_LIMIT) {
          logger.info("Returning full file content", { fileName: file.name, size: file.content.length });
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
        return JSON.stringify({
          result: "success",
          fileName: file.name,
          size: file.content.length,
          mimeType: file.mimeType,
          totalChunks,
          chunkSize: CHUNK_SIZE,
          message: "File is large. Use get_file_chunk with indices 0 to " + (totalChunks - 1) + " to read it, or use analyse_document for a server-side summary.",
          preview: truncate(file.content, 500),
        });
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
        return handleCreateBacklog(client, input);

      case "update_work_item": {
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
      throw new Error(`Operation failed.`);
    }
    throw new Error(`Operation failed.`);
  }
}
