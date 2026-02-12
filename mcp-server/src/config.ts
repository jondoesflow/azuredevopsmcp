import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  azureDevOpsOrg: string;
  azureDevOpsPat: string;
  azureDevOpsUrl: string;
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

  const requiredVars = [
    "AZURE_DEVOPS_ORG",
    "AZURE_DEVOPS_PAT",
    "AZURE_DEVOPS_URL",
  ];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error(
      `Error: Missing required environment variables: ${missingVars.join(", ")}`
    );
    console.error(
      "Please create a .env file with the required Azure DevOps configuration."
    );
    console.error(
      "\nRequired variables:\nAZURE_DEVOPS_ORG=<org-name>\nAZURE_DEVOPS_PAT=<personal-access-token>\nAZURE_DEVOPS_URL=<org-url>"
    );
    process.exit(1);
  }

  return {
    azureDevOpsOrg: process.env.AZURE_DEVOPS_ORG!,
    azureDevOpsPat: process.env.AZURE_DEVOPS_PAT!,
    azureDevOpsUrl: process.env.AZURE_DEVOPS_URL!,
  };
}
