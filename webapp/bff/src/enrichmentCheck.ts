/**
 * Checks the target Azure DevOps org for the Enrichment process and optionally
 * triggers migration via the MCP server's process migration endpoint if source
 * ADO config is provided.
 */

interface AdoProcess {
  typeId: string;
  name: string;
  customizationType: string;
  isDefault: boolean;
}

interface AdoWorkItemType {
  referenceName: string;
  name: string;
  customization: string;
}

interface AdoField {
  referenceName: string;
  name: string;
  type: string;
}

async function adoFetch<T>(
  orgUrl: string,
  pat: string,
  path: string,
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${orgUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}${separator}api-version=7.1`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ADO API ${url} returned ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function checkEnrichmentProcessExists(
  targetOrgUrl: string,
  targetPat: string,
): Promise<{ found: boolean; processId?: string; processName?: string }> {
  const processList = await adoFetch<{ value: AdoProcess[] }>(
    targetOrgUrl,
    targetPat,
    "_apis/work/processes",
  );

  for (const proc of processList.value) {
    if (proc.customizationType === "system" && proc.isDefault) continue;

    let witList: { value: AdoWorkItemType[] };
    try {
      witList = await adoFetch<{ value: AdoWorkItemType[] }>(
        targetOrgUrl,
        targetPat,
        `_apis/work/processes/${proc.typeId}/workitemtypes`,
      );
    } catch {
      continue;
    }

    for (const wit of witList.value) {
      let fieldList: { value: AdoField[] };
      try {
        fieldList = await adoFetch<{ value: AdoField[] }>(
          targetOrgUrl,
          targetPat,
          `_apis/work/processes/${proc.typeId}/workitemtypes/${wit.referenceName}/fields`,
        );
      } catch {
        continue;
      }

      const hasEnrichment = fieldList.value.some((f) =>
        f.referenceName.includes("Enrichment"),
      );
      if (hasEnrichment) {
        return { found: true, processId: proc.typeId, processName: proc.name };
      }
    }
  }

  return { found: false };
}

export interface EnrichmentCheckResult {
  status: "found" | "migrated" | "not_checked" | "migration_failed" | "assigned" | "migrated_and_assigned";
  message?: string;
}

async function callMcpTool(
  mcpBaseUrl: string,
  mcpApiKey: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ status: string; message: string }> {
  const initResponse = await fetch(`${mcpBaseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      apikey: mcpApiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "mcp-init",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "bff-enrichment-check", version: "1.0.0" },
      },
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`MCP initialize failed (${initResponse.status})`);
  }

  const sessionId = initResponse.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("MCP session id header missing");
  }

  try {
    const toolResponse = await fetch(`${mcpBaseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        apikey: mcpApiKey,
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `call-${toolName}`,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    if (!toolResponse.ok) {
      const text = await toolResponse.text().catch(() => "");
      throw new Error(`MCP ${toolName} failed (${toolResponse.status}): ${text}`);
    }

    const contentType = toolResponse.headers.get("content-type")?.toLowerCase() ?? "";
    let resultText: string;
    if (contentType.includes("text/event-stream")) {
      const raw = await toolResponse.text();
      const dataLines = raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
      resultText = dataLines[dataLines.length - 1] ?? "{}";
    } else {
      resultText = await toolResponse.text();
    }

    const rpcResult = JSON.parse(resultText) as { result?: { content?: Array<{ text?: string }> }; error?: { message?: string } };
    if (rpcResult.error) {
      throw new Error(rpcResult.error.message ?? "Tool returned an error");
    }

    const toolText = rpcResult.result?.content?.[0]?.text;
    if (!toolText) return { status: "unknown", message: "No response from tool" };

    return JSON.parse(toolText) as { status: string; message: string };
  } finally {
    await fetch(`${mcpBaseUrl}/mcp`, {
      method: "DELETE",
      headers: { apikey: mcpApiKey, "mcp-session-id": sessionId },
    }).catch(() => {});
  }
}

export async function checkAndMigrateEnrichmentProcess(opts: {
  targetOrgUrl: string;
  targetProject: string;
  targetPat: string;
  sourceOrgUrl?: string;
  sourceProject?: string;
  sourceProcessName?: string;
  sourcePat?: string;
  mcpBaseUrl: string;
  mcpApiKey: string;
}): Promise<EnrichmentCheckResult> {
  try {
    const toolResult = await callMcpTool(opts.mcpBaseUrl, opts.mcpApiKey, "migrate_process", {
      project: opts.targetProject,
      targetOrgUrl: opts.targetOrgUrl,
      targetPat: opts.targetPat,
      sourceOrgUrl: opts.sourceOrgUrl,
      sourceProject: opts.sourceProject,
      sourceProcessName: opts.sourceProcessName,
      sourcePat: opts.sourcePat,
    });

    const status = toolResult.status as EnrichmentCheckResult["status"];
    return { status, message: toolResult.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "migration_failed", message: msg };
  }
}
