export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  authType?: "basic" | "bearer";
  apiVersion?: 2 | 3;
  epicNameFieldId?: string;
  epicLinkFieldId?: string;
  hierarchyLinkType?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    description?: unknown;
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

interface UpdateIssueInput {
  description?: string;
}

interface IssueLinkInput {
  parentKey: string;
  childKey: string;
  linkTypeName?: string;
}

interface TransitionResponse {
  transitions?: Array<{ id?: string; name?: string; to?: { name?: string } }>;
}

function toBasicAuth(email: string, apiToken: string): string {
  // Jira Cloud uses Basic auth with email + API token.
  const token = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function toBearerAuth(apiToken: string): string {
  return `Bearer ${apiToken}`;
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
  private readonly apiBasePath: string;
  private readonly epicNameFieldId?: string;
  private readonly epicLinkFieldId?: string;
  private readonly hierarchyLinkType: string;

  constructor(config: JiraConfig) {
    this.baseUrl = normaliseUrl(config.baseUrl);
    const authType = (config.authType ?? "basic").trim().toLowerCase();
    this.authHeader = authType === "bearer" ? toBearerAuth(config.apiToken) : toBasicAuth(config.email, config.apiToken);

    const apiVersion = config.apiVersion ?? 3;
    if (apiVersion !== 2 && apiVersion !== 3) {
      throw new Error(`Unsupported Jira REST API version '${String(apiVersion)}'. Expected 2 or 3.`);
    }
    this.apiBasePath = `/rest/api/${apiVersion}`;

    this.epicNameFieldId = config.epicNameFieldId;
    this.epicLinkFieldId = config.epicLinkFieldId;
    this.hierarchyLinkType = (config.hierarchyLinkType ?? "Relates").trim() || "Relates";
  }

  getHierarchyLinkType(): string {
    return this.hierarchyLinkType;
  }

  private epicLinkJqlField(): string | undefined {
    if (!this.epicLinkFieldId) return undefined;

    // Prefer cf[12345] JQL form when provided with customfield_12345.
    const match = /customfield_(\d+)/i.exec(this.epicLinkFieldId);
    if (match?.[1]) return `cf[${match[1]}]`;

    // Fall back to literal field ID.
    return `\"${safeJqlLiteral(this.epicLinkFieldId)}\"`;
  }

  private apiPath(path: string): string {
    if (!path) return this.apiBasePath;
    return path.startsWith("/") ? `${this.apiBasePath}${path}` : `${this.apiBasePath}/${path}`;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      // Many Jira Server/DC setups will redirect unauthenticated requests to an SSO/login
      // page that returns HTML. Don't follow redirects silently; surface them as errors.
      redirect: init.redirect ?? "manual",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const text = await res.text();
    if (!res.ok) {
      const location = res.headers.get("location");
      const locationHint = location ? ` (location: ${location})` : "";
      throw new Error(
        `Jira API ${res.status} ${res.statusText}${locationHint}: ${truncate(text, 600)}`
      );
    }

    if (!text) return {} as T;

    if (!contentType.includes("application/json")) {
      throw new Error(
        `Jira API ${res.status} returned non-JSON response (content-type: '${contentType || "unknown"}'): ${truncate(text, 600)}`
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Jira API ${res.status} returned invalid JSON: ${truncate(text, 600)}`);
    }
  }

  async createIssue(input: CreateIssueInput): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { name: input.issueType },
      summary: input.summary,
    };

    // Jira Software (Server/DC) commonly requires a separate "Epic Name" custom field for Epic issue types.
    // If configured, populate it automatically using the issue summary.
    if (this.epicNameFieldId && input.issueType.trim().toLowerCase() === "epic") {
      fields[this.epicNameFieldId] = input.summary;
    }

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

    const created = await this.request<JiraIssue>(this.apiPath("/issue"), {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    return {
      id: String(created.id ?? ""),
      key: String(created.key ?? ""),
    };
  }

  async getIssue(issueKey: string, fields: string[] = ["summary", "issuetype", "status", "description"]): Promise<JiraIssue> {
    const fieldQuery = fields.length > 0 ? `?fields=${encodeURIComponent(fields.join(","))}` : "";
    const issue = await this.request<JiraIssue>(this.apiPath(`/issue/${encodeURIComponent(issueKey)}${fieldQuery}`), {
      method: "GET",
    });

    return {
      id: String(issue.id ?? ""),
      key: String(issue.key ?? issueKey),
      fields: issue.fields,
    };
  }

  async updateIssue(issueKey: string, input: UpdateIssueInput): Promise<void> {
    const fields: Record<string, unknown> = {};
    if (typeof input.description === "string") {
      fields.description = input.description;
    }

    if (Object.keys(fields).length === 0) return;

    await this.request<Record<string, unknown>>(this.apiPath(`/issue/${encodeURIComponent(issueKey)}`), {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  async assignIssue(issueKey: string, accountId: string | null): Promise<void> {
    // Jira Cloud generally requires accountId (email often not accepted).
    await this.request<Record<string, unknown>>(this.apiPath(`/issue/${encodeURIComponent(issueKey)}/assignee`), {
      method: "PUT",
      body: JSON.stringify({ accountId }),
    });
  }

  async transitionIssue(issueKey: string, targetStatusName: string): Promise<void> {
    const desired = targetStatusName.trim().toLowerCase();
    if (!desired) return;

    const transitions = await this.request<TransitionResponse>(
      this.apiPath(`/issue/${encodeURIComponent(issueKey)}/transitions`),
      { method: "GET" }
    );

    const match = (transitions.transitions ?? []).find((t) => (t.to?.name ?? "").trim().toLowerCase() === desired);
    const transitionId = match?.id;
    if (!transitionId) {
      const available = (transitions.transitions ?? []).map((t) => t.to?.name ?? t.name ?? "").filter(Boolean);
      throw new Error(`No Jira transition found for status '${targetStatusName}'. Available: ${available.join(", ")}`);
    }

    await this.request<Record<string, unknown>>(this.apiPath(`/issue/${encodeURIComponent(issueKey)}/transitions`), {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  async createIssueLink(input: IssueLinkInput): Promise<void> {
    const linkTypeName = (input.linkTypeName ?? this.hierarchyLinkType).trim() || this.hierarchyLinkType;

    await this.request<Record<string, unknown>>(this.apiPath("/issueLink"), {
      method: "POST",
      body: JSON.stringify({
        type: { name: linkTypeName },
        outwardIssue: { key: input.parentKey },
        inwardIssue: { key: input.childKey },
      }),
    });
  }

  async searchIssues(
    jql: string,
    maxResults: number = 50,
    fields: string[] = ["summary", "issuetype", "status"]
  ): Promise<JiraIssue[]> {
    const result = await this.request<{ issues?: JiraIssue[] }>(this.apiPath("/search"), {
      method: "POST",
      body: JSON.stringify({ jql, maxResults, fields }),
    });

    return result.issues ?? [];
  }

  async listIssues(input: {
    projectKey: string;
    issueType: string;
    epicKey?: string;
    linkedToKey?: string;
    state?: string;
    assignedTo?: string;
    maxResults?: number;
    linkTypeName?: string;
  }): Promise<JiraIssue[]> {
    const clauses: string[] = [];
    clauses.push(`project = ${input.projectKey}`);
    clauses.push(`issuetype = \"${safeJqlLiteral(input.issueType)}\"`);

    if (input.state?.trim()) {
      clauses.push(`status = \"${safeJqlLiteral(input.state)}\"`);
    }

    if (input.assignedTo?.trim()) {
      clauses.push(`assignee = \"${safeJqlLiteral(input.assignedTo)}\"`);
    }

    if (input.epicKey?.trim()) {
      const epicField = this.epicLinkJqlField();
      if (!epicField) {
        throw new Error("JIRA_EPIC_LINK_FIELD_ID is required to filter by epicKey in Jira.");
      }
      clauses.push(`${epicField} = ${input.epicKey}`);
    }

    if (input.linkedToKey?.trim()) {
      const linkTypeName = (input.linkTypeName ?? this.hierarchyLinkType).trim() || this.hierarchyLinkType;
      clauses.push(`issue in linkedIssues(\"${safeJqlLiteral(input.linkedToKey)}\", \"${safeJqlLiteral(linkTypeName)}\")`);
    }

    const jql = clauses.join(" AND ") + " ORDER BY created DESC";
    return this.searchIssues(jql, input.maxResults ?? 50, ["summary", "issuetype", "status"]);
  }

  async findIssueBySummary(projectKey: string, issueType: string, summary: string): Promise<JiraIssue | undefined> {
    const jql = `project = ${projectKey} AND issuetype = \"${safeJqlLiteral(issueType)}\" AND summary ~ \"${safeJqlLiteral(summary)}\" ORDER BY created DESC`;
    const issues = await this.searchIssues(jql, 20);
    const target = summary.trim().toLowerCase();
    return issues.find((issue) => (issue.fields?.summary ?? "").trim().toLowerCase() === target);
  }
}
