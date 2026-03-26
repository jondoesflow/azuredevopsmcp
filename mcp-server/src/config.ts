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
  processMigration?: {
    sourceOrgUrl: string;
    sourceProject: string;
    sourceProcessName: string;
    targetOrgUrl: string;
    targetProject: string;
    sourcePat: string;
    targetPat: string;
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

  // Process migration config (optional – enabled when SOURCE_ADO_ORG_URL is set)
  const sourceOrgUrl = process.env.SOURCE_ADO_ORG_URL;
  if (sourceOrgUrl) {
    const sourcePat = process.env.SOURCE_ADO_PAT;
    const sourceProject = process.env.SOURCE_ADO_PROJECT;
    const sourceProcessName = process.env.SOURCE_ADO_PROCESS_NAME;
    const targetOrgUrl = process.env.TARGET_ADO_ORG_URL || process.env.AZURE_DEVOPS_URL;
    const targetProject = process.env.TARGET_ADO_PROJECT || process.env.AZURE_DEVOPS_ORG;
    const targetPat = process.env.TARGET_ADO_PAT || process.env.AZURE_DEVOPS_PAT;

    if (!sourcePat || !sourceProject || !sourceProcessName || !targetOrgUrl || !targetProject || !targetPat) {
      console.error("Error: Process migration is partially configured. When SOURCE_ADO_ORG_URL is set, these are also required:");
      console.error("  SOURCE_ADO_PAT, SOURCE_ADO_PROJECT, SOURCE_ADO_PROCESS_NAME");
      console.error("  TARGET_ADO_ORG_URL (or AZURE_DEVOPS_URL), TARGET_ADO_PROJECT (or AZURE_DEVOPS_ORG), TARGET_ADO_PAT (or AZURE_DEVOPS_PAT)");
      process.exit(1);
    }

    config.processMigration = {
      sourceOrgUrl,
      sourceProject,
      sourceProcessName,
      targetOrgUrl,
      targetProject,
      sourcePat,
      targetPat,
    };
  }

  return config;
}
