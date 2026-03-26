import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  enrichment: {
    enabled: boolean;
    dependencies: boolean;
    definitionOfDone: boolean;
    confidence: boolean;
    missingPieces: boolean;
    consistency: boolean;
    effort: boolean;
    quality: boolean;
    aiAssist: boolean;
  };
  azureDevOps?: {
    org: string;
    pat: string;
    url: string;
  };
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (normalised === "1" || normalised === "true" || normalised === "yes" || normalised === "on") return true;
  if (normalised === "0" || normalised === "false" || normalised === "no" || normalised === "off") return false;
  return fallback;
}

function loadEnvFile(): void {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      const [key, ...valueParts] = line.split("=");
      if (key?.trim() && !key.startsWith("#")) {
        const value = valueParts.join("=").trim();
        process.env[key.trim()] = value;
      }
    }
  }
}

export function loadConfig(): Config {
  loadEnvFile();

  const enrichmentEnabled = parseBooleanEnv(process.env.ENRICHMENT_ENABLED, false);

  const hasAzure = Boolean(process.env.AZURE_DEVOPS_ORG && process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_URL);

  if (!hasAzure) {
    console.error("Error: Azure DevOps is not configured.");
    console.error("Set: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT, AZURE_DEVOPS_URL");
    process.exit(1);
  }

  const config: Config = {
    enrichment: {
      enabled: enrichmentEnabled,
      dependencies: parseBooleanEnv(process.env.ENRICH_DEPENDENCIES_ENABLED, enrichmentEnabled),
      definitionOfDone: parseBooleanEnv(process.env.ENRICH_DOD_ENABLED, enrichmentEnabled),
      confidence: parseBooleanEnv(process.env.ENRICH_CONFIDENCE_ENABLED, enrichmentEnabled),
      missingPieces: parseBooleanEnv(process.env.ENRICH_MISSING_PIECES_ENABLED, enrichmentEnabled),
      consistency: parseBooleanEnv(process.env.ENRICH_CONSISTENCY_ENABLED, enrichmentEnabled),
      effort: parseBooleanEnv(process.env.ENRICH_EFFORT_ENABLED, enrichmentEnabled),
      quality: parseBooleanEnv(process.env.ENRICH_QUALITY_ENABLED, enrichmentEnabled),
      aiAssist: parseBooleanEnv(process.env.ENRICH_AI_ASSIST_ENABLED, false),
    },
  };
  config.azureDevOps = {
    org: process.env.AZURE_DEVOPS_ORG!,
    pat: process.env.AZURE_DEVOPS_PAT!,
    url: process.env.AZURE_DEVOPS_URL!,
  };

  return config;
}
