import {
  ChatResponse,
  FileListResponse,
  ProcessCheckResult,
  ProcessResultData,
  SetupConfigPayload,
  SetupConfigState,
  UploadResponse,
  ValidateSetupResponse,
} from "./types";

const baseUrl = import.meta.env.VITE_BFF_BASE_URL as string;

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function sendChatMessage(token: string, payload: {
  message: string;
  project?: string;
  analysisMode?: "process" | "themes";
  fileName?: string;
}): Promise<ChatResponse> {
  return request<ChatResponse>("/chat/message", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getFiles(token: string): Promise<FileListResponse> {
  return request<FileListResponse>("/files", token, {
    method: "GET",
  });
}

export async function processDocument(token: string, payload: {
  project: string;
  analysisMode: "process" | "themes";
  fileName?: string;
}): Promise<ChatResponse & { data?: ProcessResultData }> {
  return request<ChatResponse & { data?: ProcessResultData }>("/process/document", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteAllFiles(token: string): Promise<{ deleted: number }> {
  return request<{ deleted: number }>("/files/delete-all", token, {
    method: "POST",
    body: "{}",
  });
}

export async function uploadFile(token: string, file: File): Promise<UploadResponse> {
  const fileContent = await toBase64(file);
  return request<UploadResponse>("/files/upload", token, {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      fileContent,
      contentType: file.type || "application/octet-stream",
    }),
  });
}

export async function getSetupConfig(token: string): Promise<SetupConfigState> {
  return request<SetupConfigState>("/setup/config", token, {
    method: "GET",
  });
}

export async function saveSetupConfig(token: string, payload: SetupConfigPayload): Promise<SetupConfigState> {
  return request<SetupConfigState>("/setup/config", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function validateSetupConfig(token: string, payload: SetupConfigPayload): Promise<ValidateSetupResponse> {
  return request<ValidateSetupResponse>("/setup/validate", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function checkProcess(token: string): Promise<ProcessCheckResult> {
  return request<ProcessCheckResult>("/setup/check-process", token, {
    method: "POST",
    body: "{}",
  });
}

// ── Backlog Health Dashboard ──────────────────────────────────────

export async function getBacklogHealth(token: string): Promise<import("./types").BacklogHealthSummary> {
  return request<import("./types").BacklogHealthSummary>("/dashboard/health", token, { method: "GET" });
}

export async function downloadExport(token: string, format: "excel" | "csv"): Promise<void> {
  const response = await fetch(`${baseUrl}/export/${format === "excel" ? "excel" : "excel"}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backlog-export.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function getStakeholderSummary(token: string): Promise<import("./types").StakeholderSummary> {
  return request<import("./types").StakeholderSummary>("/export/summary", token, { method: "GET" });
}

export async function suggestRefinement(token: string, workItemId: number): Promise<import("./types").RefinementSuggestion> {
  return request<import("./types").RefinementSuggestion>("/refine/suggest", token, {
    method: "POST",
    body: JSON.stringify({ workItemId }),
  });
}

export async function applyRefinement(token: string, payload: {
  workItemId: number;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
}): Promise<{ result: string }> {
  return request<{ result: string }>("/refine/apply", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function extractRRAID(token: string, fileName: string): Promise<{ items: import("./types").RRAIDItem[]; itemCount: number }> {
  return request<{ items: import("./types").RRAIDItem[]; itemCount: number }>("/rraid/extract", token, {
    method: "POST",
    body: JSON.stringify({ fileName }),
  });
}

export async function createRRAIDItems(token: string, items: import("./types").RRAIDItem[]): Promise<{ created: number }> {
  return request<{ created: number }>("/rraid/create", token, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function listRRAIDItems(token: string, category?: string): Promise<{ items: any[]; count: number }> {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  return request<{ items: any[]; count: number }>(`/rraid/list${params}`, token, { method: "GET" });
}

export async function getRandomFact(token: string): Promise<{ fact: string }> {
  return request<{ fact: string }>("/facts/random", token, {
    method: "GET",
  });
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("Failed to read file content"));
        return;
      }

      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}
