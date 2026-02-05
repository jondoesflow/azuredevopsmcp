import {
  Server,
} from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { AzureDevOpsClient } from "./azureDevOpsClient.js";
import { workItemTools, handleWorkItemTool } from "./tools/workItems.js";

// Initialize server and client
const config = loadConfig();
const azureDevOpsClient = new AzureDevOpsClient(config);

const server = new Server({
  name: "mcp-azure-devops-server",
  version: "1.0.0",
});

logger.info("Server initializing", {
  serverName: "mcp-azure-devops-server",
  toolCount: workItemTools.length,
});

// Tool request handler
server.setRequestHandler({ type: "object" } as any, async (request: any) => {
  if (request.method === "tools/list") {
    logger.debug("Listing available tools");
    return { tools: workItemTools };
  }

  if (request.method === "tools/call") {
    const input = request.params as Record<string, unknown>;
    const toolName = request.params.name as string;

    logger.info("Tool call received", { tool: toolName, project: input.project });

    const result = await handleWorkItemTool(azureDevOpsClient, toolName, input as never);

    return {
      content: [
        {
          type: "text" as const,
          text: result,
        },
      ],
    };
  }

  throw new Error(`Unknown method: ${request.method}`);
});

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    logger.info("Connecting to stdio transport");
    await server.connect(transport);
    logger.info("Azure DevOps MCP Server started successfully");
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

