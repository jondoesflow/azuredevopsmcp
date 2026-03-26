import {
  ChatResponse,
  EnrichmentCheckResult,
  FileListResponse,
  MigrateEnrichmentPayload,
  MigrateEnrichmentResult,
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

export async function checkEnrichment(token: string): Promise<EnrichmentCheckResult> {
  return request<EnrichmentCheckResult>("/setup/check-enrichment", token, {
    method: "POST",
    body: "{}",
  });
}

export async function migrateEnrichment(token: string, payload: MigrateEnrichmentPayload): Promise<MigrateEnrichmentResult> {
  return request<MigrateEnrichmentResult>("/setup/migrate-enrichment", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
