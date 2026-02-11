import { randomUUID } from "node:crypto";
import express, { Request, Response, NextFunction } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest, ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { AzureDevOpsClient } from "./azureDevOpsClient.js";
import { workItemTools, handleWorkItemTool, getFileStore } from "./tools/workItems.js";

const PORT = parseInt(process.env.PORT || "80", 10);
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http"; // "http" or "stdio"
const API_KEY = process.env.MCP_API_KEY || "";

// Initialize config and Azure DevOps client
const config = loadConfig();
const azureDevOpsClient = new AzureDevOpsClient(config);

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

function createMcpServer(): Server {
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
    async (request: any) => {
      const toolName = request.params.name as string;
      const args = request.params.arguments as Record<string, unknown>;

      logger.info("Tool call received", { tool: toolName, project: args.project });

      try {
        const result = await handleWorkItemTool(azureDevOpsClient, toolName, args as never);

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

// Express HTTP Transport for Copilot Studio
async function startHttpServer() {
  const app = express();

  // Store active transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // CORS
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, x-api-key, apikey, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
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

        const server = createMcpServer();
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

  // File upload endpoint (REST, not MCP) - accepts JSON body with fileName and fileContent
  app.post("/upload", apiKeyAuth, express.json({ limit: "50mb" }), (req: Request, res: Response) => {
    try {
      const { fileName, fileContent, contentType } = req.body;

      if (!fileName || !fileContent) {
        res.status(400).json({ error: "fileName and fileContent are required" });
        return;
      }

      let content = fileContent;

      // Try to decode base64
      if (/^[A-Za-z0-9+/=]+$/.test(content.replace(/\s/g, "")) && content.length > 100) {
        try {
          const decoded = Buffer.from(content, "base64").toString("utf-8");
          if (decoded && !decoded.includes("\ufffd")) {
            content = decoded;
          }
        } catch {
          // Not base64, use as-is
        }
      }

      const fileStore = getFileStore();
      fileStore.set(fileName, {
        name: fileName,
        content,
        mimeType: contentType || "text/plain",
        uploadedAt: new Date(),
      });

      logger.info("File uploaded via REST", { fileName, size: content.length });

      res.json({
        result: "success",
        fileName,
        size: content.length,
        contentType: contentType || "text/plain",
      });
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
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  logger.info("Connecting via stdio transport");
  await server.connect(transport);
  logger.info("Azure DevOps MCP Server started (stdio mode)");
}

// Main entry point
async function main() {
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

main();
