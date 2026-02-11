import { AzureDevOpsClient } from "../azureDevOpsClient.js";
import { logger } from "../logger.js";

// Strip HTML tags and decode entities to plain text
function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
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

// In-memory store for file chunks being assembled (keyed by uploadId)
const chunkStore: Map<string, { fileName: string; chunks: Map<number, string>; totalChunks: number; contentType?: string }> = new Map();

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
    description: "Accepts uploaded file content for processing.",
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
        contentType: {
          type: "string",
          description: "MIME type of the file.",
        },
      },
      required: ["fileName", "fileContent"],
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
    name: "get_file_content",
    description: "Returns content of an uploaded file.",
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
    name: "upload_file_chunk",
    description: "Uploads one chunk of a large file.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uploadId: {
          type: "string",
          description: "Unique upload session ID.",
        },
        fileName: {
          type: "string",
          description: "Name of the file being uploaded.",
        },
        chunkIndex: {
          type: "number",
          description: "Zero-based index of this chunk.",
        },
        totalChunks: {
          type: "number",
          description: "Total number of chunks for this file.",
        },
        chunkContent: {
          type: "string",
          description: "Content of this chunk.",
        },
        contentType: {
          type: "string",
          description: "MIME type of the file.",
        },
      },
      required: ["uploadId", "fileName", "chunkIndex", "totalChunks", "chunkContent"],
    },
  },
  {
    name: "complete_file_upload",
    description: "Assembles all chunks into the final file.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uploadId: {
          type: "string",
          description: "Upload session ID used in upload_file_chunk.",
        },
      },
      required: ["uploadId"],
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
  contentType?: string;
  uploadId?: string;
  chunkIndex?: number;
  totalChunks?: number;
  chunkContent?: string;
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

      case "process_transcript": {
        const fileName = input.fileName!;
        let content = input.fileContent!;
        const contentType = input.contentType || "text/plain";

        // Try to decode base64 if it looks like base64
        if (/^[A-Za-z0-9+/=]+$/.test(content.replace(/\s/g, "")) && content.length > 100) {
          try {
            const decoded = Buffer.from(content, "base64").toString("utf-8");
            // Check if decoded content is valid text
            if (decoded && !decoded.includes("\ufffd")) {
              content = decoded;
            }
          } catch {
            // Not base64, use as-is
          }
        }

        // Store the file
        fileStore.set(fileName, {
          name: fileName,
          content,
          mimeType: contentType,
          uploadedAt: new Date(),
        });

        logger.info("File stored", { fileName, size: content.length, contentType });

        return JSON.stringify({
          result: "success",
          fileName,
          size: content.length,
          contentType,
          preview: truncate(content, 500),
        });
      }

      case "list_uploaded_files": {
        const files = Array.from(fileStore.entries()).map(([key, val]) => ({
          fileName: val.name,
          size: val.content.length,
          mimeType: val.mimeType,
          uploadedAt: val.uploadedAt.toISOString(),
        }));
        return JSON.stringify({ result: "success", count: files.length, files });
      }

      case "get_file_content": {
        const file = fileStore.get(input.fileName!);
        if (!file) {
          return JSON.stringify({ result: "error", message: "File not found" });
        }
        return JSON.stringify({
          result: "success",
          fileName: file.name,
          size: file.content.length,
          mimeType: file.mimeType,
          content: file.content,
        });
      }

      case "upload_file_chunk": {
        const uploadId = input.uploadId!;
        const fileName = input.fileName!;
        const chunkIndex = input.chunkIndex!;
        const totalChunks = input.totalChunks!;
        const chunkContent = input.chunkContent!;
        const contentType = input.contentType || "text/plain";

        // Get or create chunk session
        if (!chunkStore.has(uploadId)) {
          chunkStore.set(uploadId, {
            fileName,
            chunks: new Map(),
            totalChunks,
            contentType,
          });
        }

        const session = chunkStore.get(uploadId)!;
        session.chunks.set(chunkIndex, chunkContent);

        const received = session.chunks.size;
        logger.info("Chunk received", { uploadId, chunkIndex, received, totalChunks });

        return JSON.stringify({
          result: "success",
          uploadId,
          chunkIndex,
          chunksReceived: received,
          totalChunks,
          complete: received === totalChunks,
        });
      }

      case "complete_file_upload": {
        const uploadId = input.uploadId!;
        const session = chunkStore.get(uploadId);

        if (!session) {
          return JSON.stringify({ result: "error", message: "Upload session not found" });
        }

        if (session.chunks.size < session.totalChunks) {
          return JSON.stringify({
            result: "error",
            message: "Not all chunks received",
            chunksReceived: session.chunks.size,
            totalChunks: session.totalChunks,
          });
        }

        // Assemble chunks in order
        let fullContent = "";
        for (let i = 0; i < session.totalChunks; i++) {
          const chunk = session.chunks.get(i);
          if (!chunk) {
            return JSON.stringify({ result: "error", message: `Missing chunk ${i}` });
          }
          fullContent += chunk;
        }

        // Try to decode base64
        if (/^[A-Za-z0-9+/=]+$/.test(fullContent.replace(/\s/g, "")) && fullContent.length > 100) {
          try {
            const decoded = Buffer.from(fullContent, "base64").toString("utf-8");
            if (decoded && !decoded.includes("\ufffd")) {
              fullContent = decoded;
            }
          } catch {
            // Not base64, use as-is
          }
        }

        // Store assembled file
        fileStore.set(session.fileName, {
          name: session.fileName,
          content: fullContent,
          mimeType: session.contentType,
          uploadedAt: new Date(),
        });

        // Clean up chunk session
        chunkStore.delete(uploadId);

        logger.info("File assembled from chunks", { fileName: session.fileName, size: fullContent.length });

        return JSON.stringify({
          result: "success",
          fileName: session.fileName,
          size: fullContent.length,
          contentType: session.contentType,
          preview: truncate(fullContent, 500),
        });
      }

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
