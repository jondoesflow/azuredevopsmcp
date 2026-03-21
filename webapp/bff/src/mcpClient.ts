interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | null;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface FileSummary {
  fileName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export class McpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly connectionHeaders: Record<string, string>;
  private readonly mcpEndpoint: string;

  constructor(baseUrl: string, apiKey: string, connectionHeaders?: Record<string, string>) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.connectionHeaders = connectionHeaders ?? {};
    this.mcpEndpoint = `${this.baseUrl}/mcp`;
  }

  private buildHeaders(extra?: Record<string, string>): HeadersInit {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      apikey: this.apiKey,
      ...this.connectionHeaders,
      ...(extra ?? {}),
    };
  }

  private async parseRpcResponse(response: Response): Promise<JsonRpcSuccessResponse> {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/event-stream")) {
      return (await response.json()) as JsonRpcSuccessResponse;
    }

    const raw = await response.text();
    const dataLines = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (dataLines.length === 0) {
      throw new Error("MCP SSE response did not include a data payload");
    }

    const lastData = dataLines[dataLines.length - 1];
    return JSON.parse(lastData) as JsonRpcSuccessResponse;
  }

  private async initializeSession(): Promise<string> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: "init-1",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "internal-webapp-bff",
          version: "1.0.0",
        },
      },
    };

    const response = await fetch(this.mcpEndpoint, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP initialize failed with status ${response.status}`);
    }

    const sessionId = response.headers.get("mcp-session-id");
    if (!sessionId) {
      throw new Error("MCP session id header missing from initialize response");
    }

    return sessionId;
  }

  private async closeSession(sessionId: string): Promise<void> {
    await fetch(this.mcpEndpoint, {
      method: "DELETE",
      headers: this.buildHeaders({ "mcp-session-id": sessionId }),
    });
  }

  private async callTool(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: `call-${toolName}-${Date.now()}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const response = await fetch(this.mcpEndpoint, {
      method: "POST",
      headers: this.buildHeaders({ "mcp-session-id": sessionId }),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP tool call '${toolName}' failed with status ${response.status}`);
    }

    const payload = await this.parseRpcResponse(response);
    const text = payload.result?.content?.[0]?.text;
    if (typeof text !== "string") {
      return payload;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { raw: text };
    }
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const sessionId = await this.initializeSession();
    try {
      return await this.callTool(sessionId, toolName, args);
    } finally {
      await this.closeSession(sessionId);
    }
  }

  async executeToolsSequential(calls: Array<{ toolName: string; args: Record<string, unknown> }>): Promise<unknown[]> {
    const sessionId = await this.initializeSession();
    try {
      const results: unknown[] = [];
      for (const { toolName, args } of calls) {
        results.push(await this.callTool(sessionId, toolName, args));
      }
      return results;
    } finally {
      await this.closeSession(sessionId);
    }
  }

  async uploadFile(fileName: string, fileContent: string, contentType: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/upload`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ fileName, fileContent, contentType }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  async listFiles(): Promise<{ count: number; files: FileSummary[] }> {
    const response = await fetch(`${this.baseUrl}/files`, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`List files failed (${response.status}): ${text}`);
    }

    return (await response.json()) as { count: number; files: FileSummary[] };
  }
}
