import { randomUUID } from "node:crypto";
import path from "node:path";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest, ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Config, loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { AzureDevOpsClient } from "./azureDevOpsClient.js";
import { workItemTools, handleWorkItemTool, getFileStore } from "./tools/workItems.js";

const PORT = Number.parseInt(process.env.PORT || "80", 10);
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http"; // "http" or "stdio"
const API_KEY = process.env.MCP_API_KEY || "";
const CORS_ALLOWED_ORIGIN = process.env.CORS_ALLOWED_ORIGIN || "";

// Initialize config and Azure DevOps client
const config = loadConfig();
const azureDevOpsClient = config.azureDevOps ? new AzureDevOpsClient(config) : undefined;

interface WorkItemClients {
  azureDevOpsClient?: AzureDevOpsClient;
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveClientsFromHeaders(req: Request): WorkItemClients {
  const adoOrg = normalizeHeaderValue(req.headers["x-ado-org"] as string | string[] | undefined) ?? config.azureDevOps?.org;
  const adoUrl = normalizeHeaderValue(req.headers["x-ado-url"] as string | string[] | undefined) ?? config.azureDevOps?.url;
  const adoPat = normalizeHeaderValue(req.headers["x-ado-pat"] as string | string[] | undefined) ?? config.azureDevOps?.pat;

  const mergedConfig: Config = { enrichment: config.enrichment };
  if (adoOrg && adoUrl && adoPat) {
    mergedConfig.azureDevOps = {
      org: adoOrg,
      url: adoUrl,
      pat: adoPat,
    };
  }

  return {
    azureDevOpsClient: mergedConfig.azureDevOps ? new AzureDevOpsClient(mergedConfig) : undefined,
  };
}

// API Key authentication middleware
function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    next();
    return;
  }

  const authHeader = req.headers["authorization"];
  const xApiKey = req.headers["x-api-key"] as string | undefined;
  const apiKeyHeader = req.headers["apikey"] as string | undefined;
  const queryKey = req.query["api_key"] as string | undefined;

  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === API_KEY) { next(); return; }
  }
  if (xApiKey === API_KEY) { next(); return; }
  if (apiKeyHeader === API_KEY) { next(); return; }
  if (queryKey === API_KEY) { next(); return; }

  logger.warn("Unauthorized request", { ip: req.ip });
  res.status(401).json({ error: "Unauthorized - invalid or missing API key" });
}

function createMcpServer(clients: WorkItemClients): Server {
  const server = new Server(
    {
      name: "mcp-azure-devops-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const parseCallToolRequest = (request: unknown): { toolName: string; args: Record<string, unknown> } => {
    if (typeof request !== "object" || request === null) {
      throw new Error("Invalid tool request payload");
    }

    const params = (request as { params?: unknown }).params;
    if (typeof params !== "object" || params === null) {
      throw new Error("Invalid tool request params");
    }

    const toolName = (params as { name?: unknown }).name;
    if (typeof toolName !== "string" || !toolName.trim()) {
      throw new Error("Invalid tool name");
    }

    const rawArgs = (params as { arguments?: unknown }).arguments;
    const args = (typeof rawArgs === "object" && rawArgs !== null) ? (rawArgs as Record<string, unknown>) : {};
    return { toolName, args };
  };

  // List tools handler
  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => {
      logger.debug("Listing available tools");
      return { tools: workItemTools };
    }
  );

  // Call tool handler
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: unknown) => {
      const { toolName, args } = parseCallToolRequest(request);

      logger.info("Tool call received", { tool: toolName, project: args.project });

      try {
        const result = await handleWorkItemTool(clients, toolName, args as never);

        return {
          content: [
            {
              type: "text" as const,
              text: result,
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool ${toolName} failed`, error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ result: "error" }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Sanitize a file name: extract basename and reject traversal or unsafe characters
function sanitizeFileName(rawName: string): string | null {
  const base = path.basename(rawName);
  if (!base || base === "." || base === ".." || /[/\\<>:"|?*\x00-\x1f]/.test(base)) {
    return null;
  }
  return base;
}

// Extract nested JSON content from Power Automate trigger body
function extractNestedContent(raw: string, fileName: string): string {
  if (typeof raw !== "string" || !raw.trimStart().startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.file?.Content) {
      logger.info("Extracted Content from nested JSON", { fileName, extractedLength: parsed.file.Content.length });
      return parsed.file.Content;
    }
    if (parsed?.file?.contentBytes) {
      logger.info("Extracted contentBytes from nested JSON", { fileName, extractedLength: parsed.file.contentBytes.length });
      return parsed.file.contentBytes;
    }
  } catch {
    // Not JSON, continue with original content
  }
  return raw;
}

// Decode base64 or data URI content
function decodeUploadContent(raw: string, fileName: string): { content: string; error?: string } {
  const dataUriRegex = /^data:([^;]+);base64,(.+)$/s;
  const dataUriMatch = dataUriRegex.exec(raw);
  if (dataUriMatch) {
    try {
      const content = Buffer.from(dataUriMatch[2], "base64").toString("utf-8");
      logger.info("Decoded data URI", { fileName, size: content.length });
      return { content };
    } catch {
      return { content: raw, error: "Failed to decode base64 from data URI" };
    }
  }
  try {
    const stripped = raw.replaceAll(/\s+/g, "");
    const decoded = Buffer.from(stripped, "base64").toString("utf-8");
    if (decoded.length > 100 && decoded.length < stripped.length && !decoded.substring(0, 2000).includes("\ufffd")) {
      logger.info("Decoded base64 content", { fileName, originalSize: raw.length, decodedSize: decoded.length });
      return { content: decoded };
    }
  } catch {
    // Not base64, use as-is
  }
  return { content: raw };
}

// Express HTTP Transport for Copilot Studio
async function startHttpServer() {
  const app = express();

  if (!API_KEY) {
    logger.warn("MCP_API_KEY is not configured. HTTP endpoints are running without API key auth.");
  }

  if (!CORS_ALLOWED_ORIGIN) {
    logger.warn("CORS_ALLOWED_ORIGIN is not set. Cross-origin requests will be blocked.");
  }

  app.use(helmet());

  // Store active transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // CORS — only allow explicitly configured origins; no wildcard fallback
  app.use((req, res, next) => {
    if (CORS_ALLOWED_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", CORS_ALLOWED_ORIGIN);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, x-api-key, apikey, mcp-session-id");
      res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Request logging
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Health check (no auth)
  app.get(["/health", "/"], (_req, res) => {
    res.json({
      status: "healthy",
      server: "mcp-azure-devops-server",
      version: "1.0.0",
      transport: "streamable-http",
      authEnabled: !!API_KEY,
      tools: workItemTools.length,
    });
  });

  // Streamable HTTP handler for POST /mcp and /sse
  async function handleMcpPost(req: Request, res: Response) {
    try {
      const body = req.body;
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && transports[sessionId]) {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res, body);
        return;
      }

      if (!sessionId && isInitializeRequest(body)) {
        logger.info("New Streamable HTTP session initializing");

        const clientsForSession = resolveClientsFromHeaders(req);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            logger.info("Session initialized", { sessionId: sid });
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            logger.info("Transport closed, cleaning up", { sessionId: sid });
            delete transports[sid];
          }
        };

        const server = createMcpServer(clientsForSession);
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID or not an initialization request" },
        id: null,
      });
    } catch (error) {
      logger.error("Error handling MCP POST", error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  }

  // Streamable HTTP handler for GET /mcp and /sse (SSE stream)
  async function handleMcpGet(req: Request, res: Response) {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).json({ error: "Invalid or missing session ID" });
        return;
      }
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error("Error handling MCP GET", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  }

  // Streamable HTTP handler for DELETE /mcp and /sse (terminate session)
  async function handleMcpDelete(req: Request, res: Response) {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).json({ error: "Invalid or missing session ID" });
        return;
      }
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error("Error handling MCP DELETE", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  }

  const uploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many upload requests. Please try again later." },
  });

  // File upload endpoint (REST, not MCP) - accepts JSON body with fileName and fileContent
  app.post("/upload", apiKeyAuth, uploadRateLimit, express.json({ limit: "50mb" }), (req: Request, res: Response) => {
    try {
      const { fileName, fileContent, contentType } = req.body;

      if (!fileName || !fileContent) {
        res.status(400).json({ error: "fileName and fileContent are required" });
        return;
      }

      const safeFileName = sanitizeFileName(fileName);
      if (!safeFileName) {
        res.status(400).json({ error: "Invalid file name" });
        return;
      }

      logger.info("Upload received", { fileName: safeFileName, contentLength: fileContent.length });

      const extracted = extractNestedContent(fileContent, safeFileName);
      const { content, error } = decodeUploadContent(extracted, safeFileName);

      if (error) {
        res.status(400).json({ error });
        return;
      }

      const fileStore = getFileStore();
      fileStore.set(safeFileName, {
        name: safeFileName,
        content,
        mimeType: contentType || "text/plain",
        uploadedAt: new Date(),
      });

      logger.info("File uploaded via REST", { fileName: safeFileName, size: content.length });
      res.json({ result: "success", fileName: safeFileName, size: content.length, contentType: contentType || "text/plain" });
    } catch (error) {
      logger.error("Error handling file upload", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // List uploaded files endpoint (REST)
  app.get("/files", apiKeyAuth, (_req: Request, res: Response) => {
    const fileStore = getFileStore();
    const files = Array.from(fileStore.entries()).map(([key, val]) => ({
      fileName: val.name,
      size: val.content.length,
      mimeType: val.mimeType,
      uploadedAt: val.uploadedAt.toISOString(),
    }));
    res.json({ count: files.length, files });
  });

  // Mount MCP routes on both /mcp and /sse (Copilot Studio uses /sse)
  app.post("/mcp", apiKeyAuth, express.json({ limit: "50mb" }), handleMcpPost);
  app.get("/mcp", apiKeyAuth, handleMcpGet);
  app.delete("/mcp", apiKeyAuth, handleMcpDelete);

  app.post("/sse", apiKeyAuth, express.json({ limit: "50mb" }), handleMcpPost);
  app.get("/sse", apiKeyAuth, handleMcpGet);
  app.delete("/sse", apiKeyAuth, handleMcpDelete);

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`MCP Azure DevOps Server listening on http://0.0.0.0:${PORT}`);
    logger.info("Endpoints:");
    logger.info(`  Health:     http://0.0.0.0:${PORT}/health`);
    logger.info(`  MCP:        http://0.0.0.0:${PORT}/mcp`);
    logger.info(`  SSE:        http://0.0.0.0:${PORT}/sse`);
    logger.info(`  Auth:       ${API_KEY ? "API key required" : "DISABLED (set MCP_API_KEY to enable)"}`);
  });
}

// Stdio Transport for local CLI usage
async function startStdioServer() {
  const server = createMcpServer({ azureDevOpsClient });
  const transport = new StdioServerTransport();
  logger.info("Connecting via stdio transport");
  await server.connect(transport);
  logger.info("Azure DevOps MCP Server started (stdio mode)");
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Server shutting down");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Server terminating");
  process.exit(0);
});

// Catch unhandled errors to prevent crashes
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason);
});

// Top-level await entry point
logger.info("Server initializing", {
  serverName: "mcp-azure-devops-server",
  toolCount: workItemTools.length,
  transport: TRANSPORT_MODE,
});

try {
  if (TRANSPORT_MODE === "stdio") {
    await startStdioServer();
  } else {
    await startHttpServer();
  }
} catch (error) {
  logger.error("Fatal error during startup", error);
  process.exit(1);
}
