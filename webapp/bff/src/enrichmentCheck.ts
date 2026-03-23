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
  status: "found" | "migrated" | "not_checked" | "migration_failed";
  message?: string;
}

export async function checkAndMigrateEnrichmentProcess(opts: {
  targetOrgUrl: string;
  targetPat: string;
  sourceOrgUrl?: string;
  sourceProject?: string;
  sourceProcessName?: string;
  sourcePat?: string;
  mcpBaseUrl: string;
  mcpApiKey: string;
}): Promise<EnrichmentCheckResult> {
  try {
    const result = await checkEnrichmentProcessExists(opts.targetOrgUrl, opts.targetPat);

    if (result.found) {
      return { status: "found", message: `Enrichment process "${result.processName}" exists in target org.` };
    }

    // Process not found — attempt migration if source config is provided
    if (!opts.sourceOrgUrl || !opts.sourcePat || !opts.sourceProcessName) {
      return {
        status: "not_checked",
        message: "Enrichment process not found in target org. Provide source ADO config to enable auto-migration.",
      };
    }

    // Trigger migration via the MCP server's process migration by calling an MCP tool
    const migrateResponse = await fetch(`${opts.mcpBaseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        apikey: opts.mcpApiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "migrate-process-init",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "bff-enrichment-check", version: "1.0.0" },
        },
      }),
    });

    if (!migrateResponse.ok) {
      throw new Error(`MCP initialize failed (${migrateResponse.status})`);
    }

    const sessionId = migrateResponse.headers.get("mcp-session-id");
    if (!sessionId) {
      throw new Error("MCP session id header missing");
    }

    try {
      const toolResponse = await fetch(`${opts.mcpBaseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          apikey: opts.mcpApiKey,
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "migrate-process-call",
          method: "tools/call",
          params: {
            name: "migrate_process",
            arguments: {
              sourceOrgUrl: opts.sourceOrgUrl,
              sourceProject: opts.sourceProject,
              sourceProcessName: opts.sourceProcessName,
              sourcePat: opts.sourcePat,
              targetOrgUrl: opts.targetOrgUrl,
              targetPat: opts.targetPat,
            },
          },
        }),
      });

      if (!toolResponse.ok) {
        const text = await toolResponse.text().catch(() => "");
        throw new Error(`MCP migrate_process call failed (${toolResponse.status}): ${text}`);
      }

      // Parse SSE or JSON response
      const contentType = toolResponse.headers.get("content-type")?.toLowerCase() ?? "";
      let resultText: string;
      if (contentType.includes("text/event-stream")) {
        const raw = await toolResponse.text();
        const dataLines = raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
        resultText = dataLines[dataLines.length - 1] ?? "{}";
      } else {
        resultText = await toolResponse.text();
      }

      const parsed = JSON.parse(resultText) as { result?: { content?: Array<{ text?: string }> }; error?: { message?: string } };
      if (parsed.error) {
        throw new Error(parsed.error.message ?? "Migration tool returned an error");
      }

      return { status: "migrated", message: "Enrichment process successfully migrated to target org." };
    } finally {
      // Close MCP session
      await fetch(`${opts.mcpBaseUrl}/mcp`, {
        method: "DELETE",
        headers: { apikey: opts.mcpApiKey, "mcp-session-id": sessionId },
      }).catch(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "migration_failed", message: msg };
  }
}
