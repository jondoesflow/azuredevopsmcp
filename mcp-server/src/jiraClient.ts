export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  epicLinkFieldId?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
  };
}

interface CreateIssueInput {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string;
  parentKey?: string;
  epicKey?: string;
  labels?: string[];
}

function toBasicAuth(email: string, apiToken: string): string {
  // Jira Cloud uses Basic auth with email + API token.
  const token = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function normaliseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "...";
}

function safeJqlLiteral(value: string): string {
  // Escape quotes for JQL string literal.
  return value.replaceAll('"', '\\"');
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly epicLinkFieldId?: string;

  constructor(config: JiraConfig) {
    this.baseUrl = normaliseUrl(config.baseUrl);
    this.authHeader = toBasicAuth(config.email, config.apiToken);
    this.epicLinkFieldId = config.epicLinkFieldId;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Jira API ${res.status} ${res.statusText}: ${truncate(text, 600)}`);
    }

    return (text ? JSON.parse(text) : {}) as T;
  }

  async createIssue(input: CreateIssueInput): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueType },
      summary: input.summary,
    };

    if (input.description?.trim()) {
      fields.description = input.description;
    }

    if (input.labels && input.labels.length > 0) {
      fields.labels = input.labels;
    }

    // Sub-task parent relationship
    if (input.parentKey) {
      fields.parent = { key: input.parentKey };
    }

    // Epic relationship: prefer configured Epic Link field when provided.
    if (input.epicKey && this.epicLinkFieldId) {
      fields[this.epicLinkFieldId] = input.epicKey;
    }

    const created = await this.request<JiraIssue>("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    return {
      id: String(created.id ?? ""),
      key: String(created.key ?? ""),
    };
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraIssue[]> {
    const body = {
      jql,
      maxResults,
      fields: ["summary", "issuetype"],
    };

    const result = await this.request<{ issues?: JiraIssue[] }>("/rest/api/3/search", {
      method: "POST",
      body: JSON.stringify({ jql, maxResults }),
    });

    return result.issues ?? [];
  }

  async findIssueBySummary(projectKey: string, issueType: string, summary: string): Promise<JiraIssue | undefined> {
    const jql = `project = ${projectKey} AND issuetype = \"${safeJqlLiteral(issueType)}\" AND summary ~ \"${safeJqlLiteral(summary)}\" ORDER BY created DESC`;
    const issues = await this.searchIssues(jql, 20);
    const target = summary.trim().toLowerCase();
    return issues.find((issue) => (issue.fields?.summary ?? "").trim().toLowerCase() === target);
  }
}
