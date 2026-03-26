import path from "node:path";
import express, { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { buildHelpMessage, parseChatIntent } from "./chat/intents.js";
import { AppConfig, AuthenticatedUser, ChatRequestBody, SetupConnectionInput } from "./types.js";
import { McpClient } from "./mcpClient.js";
import { SetupStore } from "./setupStore.js";

const validateRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many validation attempts. Please try again later." },
});

const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many upload requests. Please try again later." },
});

const chatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many chat requests. Please try again later." },
});

const processRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many process requests. Please try again later." },
});

const fallbackFacts = [
  "The first computer bug was an actual moth trapped in a relay.",
  "TypeScript was first made public in 2012.",
  "The term 'debugging' became popular in computing in the 1940s.",
  "Git was initially created to support Linux kernel development.",
  "The first 1GB hard drive weighed over 500 pounds.",
];

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function randomFallbackFact(): string {
  return fallbackFacts[Math.floor(Math.random() * fallbackFacts.length)] ?? fallbackFacts[0];
}

function parseSetupBody(req: Request): SetupConnectionInput {
  const body = req.body as Partial<SetupConnectionInput>;

  return {
    azureDevOpsOrg: normalizeOptionalString(body?.azureDevOpsOrg),
    azureDevOpsUrl: normalizeOptionalString(body?.azureDevOpsUrl),
    azureDevOpsProject: normalizeOptionalString(body?.azureDevOpsProject),
    azureDevOpsPat: normalizeOptionalString(body?.azureDevOpsPat),
  };
}

function parseProcessBody(req: Request): { project?: string; analysisMode: "process" | "themes"; fileName?: string } {
  const body = req.body as Partial<ChatRequestBody>;
  return {
    project: typeof body.project === "string" ? body.project.trim() : undefined,
    analysisMode: body.analysisMode === "themes" ? "themes" : "process",
    fileName: typeof body.fileName === "string" ? body.fileName.trim() : undefined,
  };
}

function isTextFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".txt");
}

/**
 * Returns the sanitized basename or null if the name contains traversal
 * sequences, path separators, null bytes, or other dangerous characters.
 */
function sanitizeFileName(rawName: string): string | null {
  const base = path.basename(rawName);
  // Reject empty, dot-only names, or anything with unsafe characters
  if (!base || base === "." || base === ".." || /[/\\<>:"|?*\x00-\x1f]/.test(base)) {
    return null;
  }
  return base;
}

function toConnectionHeaders(input: SetupConnectionInput): Record<string, string> {
  const headers: Record<string, string> = {};

  if (input.azureDevOpsOrg) headers["x-ado-org"] = input.azureDevOpsOrg;
  if (input.azureDevOpsUrl) headers["x-ado-url"] = input.azureDevOpsUrl;
  if (input.azureDevOpsPat) headers["x-ado-pat"] = input.azureDevOpsPat;

  return headers;
}

function getUserId(req: Request): string | undefined {
  const user = (req as Request & { user?: AuthenticatedUser }).user;
  return user?.objectId;
}

function getAzureDevOpsUrl(org?: string, url?: string): string | undefined {
  if (url) {
    return url.replace(/\/+$/, "");
  }
  if (!org) {
    return undefined;
  }
  return `https://dev.azure.com/${org}`;
}

async function validateAzureDevOpsConnection(url: string, project: string, pat: string): Promise<void> {
  const authValue = Buffer.from(`:${pat}`).toString("base64");
  const response = await fetch(`${url}/_apis/projects?api-version=7.1-preview.4`, {
    headers: {
      Authorization: `Basic ${authValue}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Azure DevOps validation failed (${response.status}). Check URL/org and PAT token.`);
  }

  let data: { value?: Array<{ name?: string }> };
  try {
    data = (await response.json()) as { value?: Array<{ name?: string }> };
  } catch {
    throw new Error("Azure DevOps validation failed: received an unexpected response. Check URL/org and PAT token.");
  }

  const found = data.value?.some((entry) => entry.name?.toLowerCase() === project.toLowerCase());
  if (!found) {
    throw new Error(`Azure DevOps project '${project}' was not found for this connection.`);
  }
}

function parseMessageBody(req: Request): ChatRequestBody | undefined {
  const body = req.body as Partial<ChatRequestBody>;
  if (!body || typeof body.message !== "string") {
    return undefined;
  }
  return {
    message: body.message,
    project: typeof body.project === "string" ? body.project : undefined,
    analysisMode: body.analysisMode === "themes" ? "themes" : "process",
    fileName: typeof body.fileName === "string" ? body.fileName : undefined,
  };
}

async function resolveFileName(client: McpClient, explicitFileName?: string): Promise<string | undefined> {
  if (explicitFileName) return explicitFileName;
  const files = await client.listFiles();
  return files.files[0]?.fileName;
}

export function createApiRouter(config: AppConfig) {
  const router = express.Router();
  const setupStore = new SetupStore();

  function createMcpClient(req: Request): McpClient {
    const userId = getUserId(req);
    const state = setupStore.getState(userId);
    const secrets = setupStore.getSecrets(userId);
    return new McpClient(
      config.mcpBaseUrl,
      config.mcpApiKey,
      toConnectionHeaders({
        azureDevOpsOrg: state.azureDevOpsOrg,
        azureDevOpsUrl: state.azureDevOpsUrl,
        azureDevOpsPat: state.hasAzureDevOpsPat ? secrets.azureDevOpsPat : undefined,
      })
    );
  }

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "mcp-webapp-bff" });
  });

  router.get("/setup/config", (req: Request, res: Response) => {
    res.json(setupStore.getState(getUserId(req)));
  });

  router.post("/setup/config", (req: Request, res: Response) => {
    try {
      const body = parseSetupBody(req);
      const updated = setupStore.save(body, getUserId(req));
      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save setup configuration";
      res.status(400).json({ error: message });
    }
  });

  router.post("/setup/validate", validateRateLimit, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const body = parseSetupBody(req);
      const state = setupStore.save(body, userId);
      const secrets = setupStore.getSecrets(userId);

      const url = getAzureDevOpsUrl(state.azureDevOpsOrg, state.azureDevOpsUrl);
      if (!url || !state.azureDevOpsProject || !secrets.azureDevOpsPat) {
        res.status(400).json({ error: "Azure DevOps URL/org, project name, and PAT token are required." });
        return;
      }
      await validateAzureDevOpsConnection(url, state.azureDevOpsProject, secrets.azureDevOpsPat);

      const validated = setupStore.markValidated(userId);
      res.json({ validated: true, state: validated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection validation failed";
      res.status(400).json({ validated: false, error: message });
    }
  });

  router.get("/facts/random", async (_req: Request, res: Response) => {
    const apiKey = process.env.FACTS_API_KEY;
    if (!apiKey) {
      res.json({ fact: randomFallbackFact() });
      return;
    }

    try {
      const response = await fetch("https://api.api-ninjas.com/v1/facts?limit=1", {
        headers: {
          "X-Api-Key": apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        res.json({ fact: randomFallbackFact() });
        return;
      }

      const body = (await response.json()) as Array<{ fact?: string }>;
      res.json({ fact: body[0]?.fact ?? randomFallbackFact() });
    } catch {
      res.json({ fact: randomFallbackFact() });
    }
  });

  router.get("/files", async (_req: Request, res: Response) => {
    try {
      const mcpClient = createMcpClient(_req);
      const result = await mcpClient.listFiles();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list files";
      res.status(502).json({ error: message });
    }
  });

  router.post("/files/upload", uploadRateLimit, async (req: Request, res: Response) => {
    const { fileName, fileContent, contentType } = req.body as {
      fileName?: unknown;
      fileContent?: unknown;
      contentType?: unknown;
    };

    if (typeof fileName !== "string" || !fileName.trim() || typeof fileContent !== "string" || !fileContent.trim()) {
      res.status(400).json({ error: "fileName and fileContent are required" });
      return;
    }

    const safeFileName = sanitizeFileName(fileName);
    if (!safeFileName) {
      res.status(400).json({ error: "Invalid file name" });
      return;
    }

    try {
      const mcpClient = createMcpClient(req);
      const response = await mcpClient.uploadFile(safeFileName, fileContent, typeof contentType === "string" ? contentType : "text/plain");
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload file";
      res.status(502).json({ error: message });
    }
  });

  router.post("/files/delete-all", async (_req: Request, res: Response) => {
    try {
      const mcpClient = createMcpClient(_req);
      const files = await mcpClient.listFiles();

      await Promise.all(files.files.map((file) => mcpClient.executeTool("delete_file", { fileName: file.fileName })));

      res.json({ deleted: files.count });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete files";
      res.status(502).json({ error: message });
    }
  });

  router.post("/process/document", processRateLimit, async (req: Request, res: Response) => {
    const processRequest = parseProcessBody(req);

    try {
      const userId = getUserId(req);
      const setupState = setupStore.getState(userId);
      const secrets = setupStore.getSecrets(userId);
      const hasConfiguredConnection = Boolean((setupState.azureDevOpsOrg || setupState.azureDevOpsUrl) && setupState.azureDevOpsProject && secrets.azureDevOpsPat);

      if (!setupState.isValidated && !hasConfiguredConnection) {
        res.status(400).json({ error: "Connection must be validated before creating backlog items." });
        return;
      }

      const effectiveProject = processRequest.project ?? setupState.azureDevOpsProject;
      if (!effectiveProject) {
        res.status(400).json({ error: "Project is required. Validate your platform connection first." });
        return;
      }

      const mcpClient = createMcpClient(req);
      const files = await mcpClient.listFiles();
      const textFiles = files.files.filter((file) => isTextFile(file.fileName));

      if (textFiles.length === 0) {
        res.status(400).json({ error: "No .txt file found. Upload one .txt file first." });
        return;
      }

      if (!processRequest.fileName && textFiles.length !== 1) {
        res.status(400).json({ error: "Only one .txt file can be processed at a time. Delete extra files first." });
        return;
      }

      const fileName = processRequest.fileName
        ? textFiles.find((file) => file.fileName === processRequest.fileName)?.fileName
        : textFiles[0]?.fileName;

      if (!fileName) {
        res.status(400).json({ error: "Selected file must be a .txt file already uploaded to the MCP server." });
        return;
      }

      const [analysis, review, backlog] = await mcpClient.executeToolsSequential([
        { toolName: "analyse_document", args: { fileName, analysisMode: processRequest.analysisMode } },
        { toolName: "preview_backlog", args: { processFileName: fileName, fileName, storyMaturity: "placeholder" } },
        { toolName: "create_backlog", args: { processFileName: fileName, project: effectiveProject, storyMaturity: "placeholder" } },
      ]);

      const boardUrl = `${getAzureDevOpsUrl(setupState.azureDevOpsOrg, setupState.azureDevOpsUrl)}/${encodeURIComponent(effectiveProject)}/_backlogs/backlog`;

      res.json({
        reply: `Document '${fileName}' processed and backlog creation executed for project '${effectiveProject}'.`,
        data: {
          executedTools: ["analyse_document", "preview_backlog", "create_backlog"],
          platform: "azure-devops" as const,
          project: effectiveProject,
          boardUrl,
          review,
          analysis,
          backlog,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process document";
      res.status(502).json({ error: message });
    }
  });

  router.post("/chat/message", chatRateLimit, async (req: Request, res: Response) => {
    const chatRequest = parseMessageBody(req);
    if (!chatRequest) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const intent = parseChatIntent(chatRequest);

    try {
      const mcpClient = createMcpClient(req);
      if (intent.type === "help") {
        res.json({ reply: buildHelpMessage() });
        return;
      }

      if (intent.type === "listFiles") {
        const files = await mcpClient.listFiles();
        res.json({ reply: `Uploaded files: ${files.count}`, data: files });
        return;
      }

      if (intent.type === "deleteFile") {
        const fileName = await resolveFileName(mcpClient, intent.fileName);
        if (!fileName) {
          res.json({ reply: "No files available to delete." });
          return;
        }

        const deletion = await mcpClient.executeTool("delete_file", { fileName });
        res.json({ reply: `Deleted file '${fileName}'.`, data: deletion });
        return;
      }

      if (intent.type === "analyseDocument") {
        const fileName = await resolveFileName(mcpClient, intent.fileName);
        if (!fileName) {
          res.status(400).json({ error: "No uploaded file found. Upload a file first." });
          return;
        }

        const analysis = await mcpClient.executeTool("analyse_document", {
          fileName,
          analysisMode: intent.analysisMode ?? "process",
        });

        res.json({ reply: `Analysis completed for '${fileName}'.`, data: analysis });
        return;
      }

      const fileName = await resolveFileName(mcpClient, intent.fileName);
      if (!fileName) {
        res.status(400).json({ error: "No uploaded file found. Upload a file first." });
        return;
      }

      const analysisMode = intent.analysisMode ?? "process";
      await mcpClient.executeTool("analyse_document", {
        fileName,
        analysisMode,
      });

      const backlog = await mcpClient.executeTool("create_backlog", {
        processFileName: fileName,
        project: intent.project,
        storyMaturity: "placeholder",
      });

      res.json({
        reply: `Backlog workflow completed for project '${intent.project}' using file '${fileName}'.`,
        data: backlog,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      res.status(502).json({ error: message });
    }
  });

  return router;
}
