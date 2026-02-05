import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { AzureDevOpsClient } from "./azureDevOpsClient.js";
import { workItemTools, handleWorkItemTool } from "./tools/workItems.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http"; // "http" or "stdio"

// Initialize config and Azure DevOps client
const config = loadConfig();
const azureDevOpsClient = new AzureDevOpsClient(config);

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

// HTTP/SSE Transport for Copilot Studio
async function startHttpServer() {
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers for Copilot Studio
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "healthy",
        server: "mcp-azure-devops-server",
        version: "1.0.0",
        transport: "sse",
        tools: workItemTools.length,
      }));
      return;
    }

    // SSE endpoint for MCP connections
    if (url.pathname === "/sse" && req.method === "GET") {
      logger.info("New SSE connection request");

      const server = createMcpServer();
      const transport = new SSEServerTransport("/messages", res);

      const sessionId = crypto.randomUUID();
      transports.set(sessionId, transport);

      res.on("close", () => {
        logger.info("SSE connection closed", { sessionId });
        transports.delete(sessionId);
      });

      await server.connect(transport);
      logger.info("SSE transport connected", { sessionId });
      return;
    }

    // Messages endpoint for client-to-server communication
    if (url.pathname === "/messages" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          // Find the transport for this session (from query param or header)
          const sessionId = url.searchParams.get("sessionId");
          const transport = sessionId ? transports.get(sessionId) : transports.values().next().value;

          if (transport) {
            await transport.handlePostMessage(req, res, body);
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No active session" }));
          }
        } catch (error) {
          logger.error("Error handling message", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info(`MCP Azure DevOps Server listening on http://0.0.0.0:${PORT}`);
    logger.info("Endpoints:");
    logger.info(`  Health: http://0.0.0.0:${PORT}/health`);
    logger.info(`  SSE: http://0.0.0.0:${PORT}/sse`);
    logger.info(`  Messages: http://0.0.0.0:${PORT}/messages`);
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
process.on("SIGINT", () => {
  logger.info("Server shutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Server terminating");
  process.exit(0);
});

main();

