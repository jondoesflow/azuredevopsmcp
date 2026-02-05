import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { AzureDevOpsClient } from "./azureDevOpsClient.js";
import { workItemTools, handleWorkItemTool } from "./tools/workItems.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http"; // "http" or "stdio"
const API_KEY = process.env.MCP_API_KEY || "";

// Initialize config and Azure DevOps client
const config = loadConfig();
const azureDevOpsClient = new AzureDevOpsClient(config);

// API Key authentication middleware
function authenticateRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!API_KEY) {
    // No API key configured - skip auth (development mode)
    return true;
  }

  const authHeader = req.headers["authorization"];
  const queryKey = new URL(req.url || "/", `http://${req.headers.host}`).searchParams.get("api_key");

  // Check Authorization: Bearer <key> header
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === API_KEY) {
      return true;
    }
  }

  // Check x-api-key header
  const xApiKey = req.headers["x-api-key"];
  if (xApiKey === API_KEY) {
    return true;
  }

  // Check query parameter
  if (queryKey === API_KEY) {
    return true;
  }

  logger.warn("Unauthorized request", { ip: req.socket.remoteAddress });
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized - invalid or missing API key" }));
  return false;
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
    { method: "tools/list" } as any,
    async () => {
      logger.debug("Listing available tools");
      return { tools: workItemTools };
    }
  );

  // Call tool handler
  server.setRequestHandler(
    { method: "tools/call" } as any,
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
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Streamable HTTP Transport for Copilot Studio
async function startHttpServer() {
  // Store active transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Helper to read request body as JSON
  function readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : undefined);
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers for Copilot Studio
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, x-api-key, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint (no auth required)
    if (url.pathname === "/health" || url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "healthy",
        server: "mcp-azure-devops-server",
        version: "1.0.0",
        transport: "streamable-http",
        authEnabled: !!API_KEY,
        tools: workItemTools.length,
      }));
      return;
    }

    // --- Streamable HTTP /mcp endpoint ---
    if (url.pathname === "/mcp") {
      // Authenticate all /mcp requests
      if (!authenticateRequest(req, res)) return;

      // POST /mcp - Initialize or send messages
      if (req.method === "POST") {
        const body = await readBody(req);
        (req as any).body = body;

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && transports[sessionId]) {
          // Existing session - forward to transport
          const transport = transports[sessionId];
          await transport.handleRequest(req, res, body);
          return;
        }

        if (!sessionId && isInitializeRequest(body)) {
          // New session - create transport and server
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

        // Invalid request
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID or not an initialization request" },
          id: null,
        }));
        return;
      }

      // GET /mcp - SSE stream for existing session
      if (req.method === "GET") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
          return;
        }
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
        return;
      }

      // DELETE /mcp - Terminate session
      if (req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing session ID" }));
          return;
        }
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
        return;
      }
    }

    // --- Legacy SSE /sse endpoint (backward compatibility) ---
    if (url.pathname === "/sse" && req.method === "GET") {
      if (!authenticateRequest(req, res)) return;

      logger.info("New legacy SSE connection request");
      const server = createMcpServer();
      const transport = new SSEServerTransport("/messages", res);

      res.on("close", () => {
        logger.info("Legacy SSE connection closed");
      });

      await server.connect(transport);
      return;
    }

    // --- Legacy /messages endpoint (backward compatibility) ---
    if (url.pathname === "/messages" && req.method === "POST") {
      if (!authenticateRequest(req, res)) return;

      // For legacy SSE, handled by SSEServerTransport internally
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Use /mcp endpoint for Streamable HTTP transport" }));
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info(`MCP Azure DevOps Server listening on http://0.0.0.0:${PORT}`);
    logger.info("Endpoints:");
    logger.info(`  Health:     http://0.0.0.0:${PORT}/health`);
    logger.info(`  MCP:        http://0.0.0.0:${PORT}/mcp (Streamable HTTP)`);
    logger.info(`  SSE:        http://0.0.0.0:${PORT}/sse (Legacy SSE)`);
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

main();
