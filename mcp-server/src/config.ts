import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  azureDevOps?: {
    org: string;
    pat: string;
    url: string;
  };
  jira?: {
    baseUrl: string;
    email: string;
    apiToken: string;
    epicLinkFieldId?: string;
  };
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

  const hasAzure = Boolean(process.env.AZURE_DEVOPS_ORG && process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_URL);

  // Support common Jira env var aliases (PAT/URL naming).
  const jiraBaseUrl = process.env.JIRA_BASE_URL || process.env.JIRA_URL;
  const jiraEmail = process.env.JIRA_EMAIL || process.env.JIRA_USERNAME;
  const jiraApiToken = process.env.JIRA_API_TOKEN || process.env.JIRA_PAT;

  const hasJira = Boolean(jiraBaseUrl && jiraEmail && jiraApiToken);

  if (!hasAzure && !hasJira) {
    console.error("Error: No work item system is configured.");
    console.error("Configure at least one of:");
    console.error("- Azure DevOps: AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT, AZURE_DEVOPS_URL");
    console.error("- Jira: JIRA_BASE_URL (or JIRA_URL), JIRA_EMAIL (or JIRA_USERNAME), JIRA_API_TOKEN (or JIRA_PAT)");
    process.exit(1);
  }

  const config: Config = {};
  if (hasAzure) {
    config.azureDevOps = {
      org: process.env.AZURE_DEVOPS_ORG!,
      pat: process.env.AZURE_DEVOPS_PAT!,
      url: process.env.AZURE_DEVOPS_URL!,
    };
  }

  if (hasJira) {
    config.jira = {
      baseUrl: jiraBaseUrl!,
      email: jiraEmail!,
      apiToken: jiraApiToken!,
      epicLinkFieldId: process.env.JIRA_EPIC_LINK_FIELD_ID || undefined,
    };
  }

  return config;
}
