import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(): void {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseMode(raw: string | undefined): "enforced" | "off" {
  return raw?.toLowerCase() === "off" ? "off" : "enforced";
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  const authMode = parseMode(process.env.AUTH_MODE);

  return {
    port: Number.parseInt(process.env.PORT ?? "8080", 10),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    authMode,
    entraTenantId: authMode === "enforced" ? required("ENTRA_TENANT_ID") : (process.env.ENTRA_TENANT_ID ?? ""),
    entraAudience: authMode === "enforced" ? required("ENTRA_API_AUDIENCE") : (process.env.ENTRA_API_AUDIENCE ?? ""),
    allowedGroupIds: parseList(process.env.ENTRA_ALLOWED_GROUP_IDS),
    mcpBaseUrl: required("MCP_BASE_URL"),
    mcpApiKey: required("MCP_API_KEY"),
  };
}
