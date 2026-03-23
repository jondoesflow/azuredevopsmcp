import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { SetupConnectionInput, SetupConnectionState } from "./types.js";

// Derive a 32-byte key from SETUP_ENCRYPTION_KEY env var (or a fallback for dev).
// In production, set SETUP_ENCRYPTION_KEY to a long random string.
const RAW_KEY = process.env.SETUP_ENCRYPTION_KEY ?? "dev-only-insecure-key-set-SETUP_ENCRYPTION_KEY";
const ENCRYPTION_KEY = scryptSync(RAW_KEY, "mcp-setup-store", 32);
const ALGORITHM = "aes-256-gcm";

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) return stored; // not encrypted — return as-is (migration path)
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

function encryptSecret(value: string | undefined): string | undefined {
  return value ? encrypt(value) : undefined;
}

function decryptSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return undefined; // corrupted or wrong key — treat as missing
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "..", ".env");
const perUserPath = path.join(__dirname, "..", ".setup-users.json");

interface ConnectionDefaults {
  platform?: "azure-devops" | "jira";
  azureDevOpsOrg?: string;
  azureDevOpsUrl?: string;
  azureDevOpsProject?: string;
  azureDevOpsPat?: string;
  jiraBaseUrl?: string;
  jiraProject?: string;
  jiraApiToken?: string;
  isValidated: boolean;
  sourceAdoOrgUrl?: string;
  sourceAdoProject?: string;
  sourceAdoProcessName?: string;
  sourceAdoPat?: string;
  enrichmentProcessStatus?: "found" | "migrated" | "not_checked" | "migration_failed" | "assigned" | "migrated_and_assigned";
}

interface StoredUserConfig extends ConnectionDefaults {
  updatedAt: string;
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePlatform(value: string | undefined): "azure-devops" | "jira" | undefined {
  const normalized = normalizeOptional(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "azure-devops" || normalized === "jira") return normalized;
  return undefined;
}

function parseEnv(): Map<string, string> {
  const entries = new Map<string, string>();
  if (!fs.existsSync(envPath)) {
    return entries;
  }

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    entries.set(key, value);
  }

  return entries;
}

function readPerUser(): Record<string, StoredUserConfig> {
  if (!fs.existsSync(perUserPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(perUserPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, StoredUserConfig>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const decrypted: Record<string, StoredUserConfig> = {};
    for (const [userId, config] of Object.entries(parsed)) {
      decrypted[userId] = decryptStoredUserConfig(config);
    }
    return decrypted;
  } catch {
    return {};
  }
}

function encryptStoredUserConfig(config: StoredUserConfig): StoredUserConfig {
  return {
    ...config,
    azureDevOpsPat: encryptSecret(config.azureDevOpsPat),
    jiraApiToken: encryptSecret(config.jiraApiToken),
    sourceAdoPat: encryptSecret(config.sourceAdoPat),
  };
}

function decryptStoredUserConfig(config: StoredUserConfig): StoredUserConfig {
  return {
    ...config,
    azureDevOpsPat: decryptSecret(config.azureDevOpsPat),
    jiraApiToken: decryptSecret(config.jiraApiToken),
    sourceAdoPat: decryptSecret(config.sourceAdoPat),
  };
}

function writePerUser(data: Record<string, StoredUserConfig>): void {
  const encrypted: Record<string, StoredUserConfig> = {};
  for (const [userId, config] of Object.entries(data)) {
    encrypted[userId] = encryptStoredUserConfig(config);
  }
  fs.writeFileSync(perUserPath, `${JSON.stringify(encrypted, null, 2)}\n`, "utf-8");
}

function writeEnv(updates: Map<string, string>): void {
  const existingLines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8").split(/\r?\n/) : [];
  const remainingUpdates = new Map(updates);

  const updatedLines = existingLines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return rawLine;

    const separator = rawLine.indexOf("=");
    if (separator <= 0) return rawLine;

    const key = rawLine.slice(0, separator).trim();
    const next = remainingUpdates.get(key);
    if (next === undefined) return rawLine;

    remainingUpdates.delete(key);
    return `${key}=${next}`;
  });

  for (const [key, value] of remainingUpdates) {
    updatedLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, `${updatedLines.join("\n")}\n`, "utf-8");
}

export class SetupStore {
  private readonly defaults: ConnectionDefaults;

  constructor() {
    const fileDefaults = parseEnv();
    this.defaults = {
      platform: normalizePlatform(fileDefaults.get("TARGET_PLATFORM") ?? process.env.TARGET_PLATFORM),
      azureDevOpsOrg: normalizeOptional(fileDefaults.get("AZURE_DEVOPS_ORG") ?? process.env.AZURE_DEVOPS_ORG),
      azureDevOpsUrl: normalizeOptional(fileDefaults.get("AZURE_DEVOPS_URL") ?? process.env.AZURE_DEVOPS_URL),
      azureDevOpsProject: normalizeOptional(fileDefaults.get("AZURE_DEVOPS_PROJECT") ?? process.env.AZURE_DEVOPS_PROJECT),
      azureDevOpsPat: normalizeOptional(fileDefaults.get("AZURE_DEVOPS_PAT") ?? process.env.AZURE_DEVOPS_PAT),
      jiraBaseUrl: normalizeOptional(fileDefaults.get("JIRA_BASE_URL") ?? fileDefaults.get("JIRA_URL") ?? process.env.JIRA_BASE_URL ?? process.env.JIRA_URL),
      jiraProject: normalizeOptional(fileDefaults.get("JIRA_PROJECT") ?? process.env.JIRA_PROJECT),
      jiraApiToken: normalizeOptional(fileDefaults.get("JIRA_API_TOKEN") ?? fileDefaults.get("JIRA_PAT") ?? process.env.JIRA_API_TOKEN ?? process.env.JIRA_PAT),
      isValidated: (fileDefaults.get("CONNECTION_VALIDATED") ?? process.env.CONNECTION_VALIDATED ?? "").toLowerCase() === "true",
    };
  }

  private resolveForUser(userId?: string): ConnectionDefaults {
    const userConfig = userId ? readPerUser()[userId] : undefined;
    return {
      platform: userConfig?.platform ?? normalizePlatform(process.env.TARGET_PLATFORM) ?? this.defaults.platform,
      azureDevOpsOrg: userConfig?.azureDevOpsOrg ?? normalizeOptional(process.env.AZURE_DEVOPS_ORG) ?? this.defaults.azureDevOpsOrg,
      azureDevOpsUrl: userConfig?.azureDevOpsUrl ?? normalizeOptional(process.env.AZURE_DEVOPS_URL) ?? this.defaults.azureDevOpsUrl,
      azureDevOpsProject: userConfig?.azureDevOpsProject ?? normalizeOptional(process.env.AZURE_DEVOPS_PROJECT) ?? this.defaults.azureDevOpsProject,
      azureDevOpsPat: userConfig?.azureDevOpsPat ?? normalizeOptional(process.env.AZURE_DEVOPS_PAT) ?? this.defaults.azureDevOpsPat,
      jiraBaseUrl: userConfig?.jiraBaseUrl ?? normalizeOptional(process.env.JIRA_BASE_URL) ?? normalizeOptional(process.env.JIRA_URL) ?? this.defaults.jiraBaseUrl,
      jiraProject: userConfig?.jiraProject ?? normalizeOptional(process.env.JIRA_PROJECT) ?? this.defaults.jiraProject,
      jiraApiToken: userConfig?.jiraApiToken ?? normalizeOptional(process.env.JIRA_API_TOKEN) ?? normalizeOptional(process.env.JIRA_PAT) ?? this.defaults.jiraApiToken,
      isValidated: userConfig?.isValidated ?? this.defaults.isValidated,
      sourceAdoOrgUrl: userConfig?.sourceAdoOrgUrl ?? normalizeOptional(process.env.SOURCE_ADO_ORG_URL) ?? this.defaults.sourceAdoOrgUrl,
      sourceAdoProject: userConfig?.sourceAdoProject ?? normalizeOptional(process.env.SOURCE_ADO_PROJECT) ?? this.defaults.sourceAdoProject,
      sourceAdoProcessName: userConfig?.sourceAdoProcessName ?? normalizeOptional(process.env.SOURCE_ADO_PROCESS_NAME) ?? this.defaults.sourceAdoProcessName,
      sourceAdoPat: userConfig?.sourceAdoPat ?? normalizeOptional(process.env.SOURCE_ADO_PAT) ?? this.defaults.sourceAdoPat,
      enrichmentProcessStatus: userConfig?.enrichmentProcessStatus ?? this.defaults.enrichmentProcessStatus,
    };
  }

  getState(userId?: string): SetupConnectionState {
    const resolved = this.resolveForUser(userId);
    return {
      platform: resolved.platform,
      azureDevOpsOrg: resolved.azureDevOpsOrg,
      azureDevOpsUrl: resolved.azureDevOpsUrl,
      azureDevOpsProject: resolved.azureDevOpsProject,
      jiraBaseUrl: resolved.jiraBaseUrl,
      jiraProject: resolved.jiraProject,
      hasAzureDevOpsPat: Boolean(resolved.azureDevOpsPat),
      hasJiraApiToken: Boolean(resolved.jiraApiToken),
      isValidated: resolved.isValidated,
      sourceAdoOrgUrl: resolved.sourceAdoOrgUrl,
      sourceAdoProject: resolved.sourceAdoProject,
      sourceAdoProcessName: resolved.sourceAdoProcessName,
      hasSourceAdoPat: Boolean(resolved.sourceAdoPat),
      enrichmentProcessStatus: resolved.enrichmentProcessStatus,
    };
  }

  getSecrets(userId?: string): { azureDevOpsPat?: string; jiraApiToken?: string; sourceAdoPat?: string } {
    const resolved = this.resolveForUser(userId);
    return {
      azureDevOpsPat: resolved.azureDevOpsPat,
      jiraApiToken: resolved.jiraApiToken,
      sourceAdoPat: resolved.sourceAdoPat,
    };
  }

  save(input: SetupConnectionInput, userId?: string): SetupConnectionState {
    const current = this.resolveForUser(userId);
    const merged: ConnectionDefaults = {
      platform: normalizePlatform(input.platform) ?? current.platform,
      azureDevOpsOrg: normalizeOptional(input.azureDevOpsOrg) ?? current.azureDevOpsOrg,
      azureDevOpsUrl: normalizeOptional(input.azureDevOpsUrl) ?? current.azureDevOpsUrl,
      azureDevOpsProject: normalizeOptional(input.azureDevOpsProject) ?? current.azureDevOpsProject,
      azureDevOpsPat: normalizeOptional(input.azureDevOpsPat) ?? current.azureDevOpsPat,
      jiraBaseUrl: normalizeOptional(input.jiraBaseUrl) ?? current.jiraBaseUrl,
      jiraProject: normalizeOptional(input.jiraProject) ?? current.jiraProject,
      jiraApiToken: normalizeOptional(input.jiraApiToken) ?? current.jiraApiToken,
      isValidated: false,
      sourceAdoOrgUrl: normalizeOptional(input.sourceAdoOrgUrl) ?? current.sourceAdoOrgUrl,
      sourceAdoProject: normalizeOptional(input.sourceAdoProject) ?? current.sourceAdoProject,
      sourceAdoProcessName: normalizeOptional(input.sourceAdoProcessName) ?? current.sourceAdoProcessName,
      sourceAdoPat: normalizeOptional(input.sourceAdoPat) ?? current.sourceAdoPat,
      enrichmentProcessStatus: current.enrichmentProcessStatus,
    };

    if (userId) {
      const existing = readPerUser();
      existing[userId] = {
        ...merged,
        updatedAt: new Date().toISOString(),
      };
      writePerUser(existing);
      return this.getState(userId);
    }

    process.env.AZURE_DEVOPS_ORG = merged.azureDevOpsOrg ?? "";
    process.env.AZURE_DEVOPS_URL = merged.azureDevOpsUrl ?? "";
    process.env.AZURE_DEVOPS_PROJECT = merged.azureDevOpsProject ?? "";
    process.env.AZURE_DEVOPS_PAT = merged.azureDevOpsPat ?? "";
    process.env.TARGET_PLATFORM = merged.platform ?? "";
    process.env.JIRA_BASE_URL = merged.jiraBaseUrl ?? "";
    process.env.JIRA_PROJECT = merged.jiraProject ?? "";
    process.env.JIRA_API_TOKEN = merged.jiraApiToken ?? "";
    process.env.CONNECTION_VALIDATED = "false";

    writeEnv(
      new Map<string, string>([
        ["TARGET_PLATFORM", process.env.TARGET_PLATFORM],
        ["AZURE_DEVOPS_ORG", process.env.AZURE_DEVOPS_ORG],
        ["AZURE_DEVOPS_URL", process.env.AZURE_DEVOPS_URL],
        ["AZURE_DEVOPS_PROJECT", process.env.AZURE_DEVOPS_PROJECT],
        ["AZURE_DEVOPS_PAT", process.env.AZURE_DEVOPS_PAT],
        ["JIRA_BASE_URL", process.env.JIRA_BASE_URL],
        ["JIRA_PROJECT", process.env.JIRA_PROJECT],
        ["JIRA_API_TOKEN", process.env.JIRA_API_TOKEN],
        ["CONNECTION_VALIDATED", process.env.CONNECTION_VALIDATED],
      ])
    );

    return this.getState(userId);
  }

  setEnrichmentStatus(userId: string | undefined, status: "found" | "migrated" | "not_checked" | "migration_failed" | "assigned" | "migrated_and_assigned"): void {
    if (userId) {
      const existing = readPerUser();
      const current = existing[userId] ?? { ...this.resolveForUser(userId), updatedAt: new Date().toISOString() };
      existing[userId] = { ...current, enrichmentProcessStatus: status, updatedAt: new Date().toISOString() };
      writePerUser(existing);
    }
  }

  markValidated(userId?: string): SetupConnectionState {
    if (userId) {
      const existing = readPerUser();
      const current = existing[userId] ?? { ...this.resolveForUser(userId), updatedAt: new Date().toISOString() };
      existing[userId] = {
        ...current,
        isValidated: true,
        updatedAt: new Date().toISOString(),
      };
      writePerUser(existing);
      return this.getState(userId);
    }

    process.env.CONNECTION_VALIDATED = "true";
    writeEnv(new Map<string, string>([["CONNECTION_VALIDATED", process.env.CONNECTION_VALIDATED]]));
    return this.getState(userId);
  }
}
