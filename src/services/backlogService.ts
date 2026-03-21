import { AppConfig, IssueRecord, TemplateKey } from "../types.js";

type BacklogProject = {
  id: number;
  projectKey: string;
  name: string;
};

type BacklogIssue = {
  id: number;
  issueKey: string;
  summary: string;
  description?: string;
  created?: string;
  updated?: string;
  assignee?: { name?: string } | null;
  createdUser?: { name?: string } | null;
  status?: { id?: number; name?: string } | null;
  customFields?: Array<{ name?: string; value?: unknown }>;
};

type BacklogStatus = {
  id: number;
  name: string;
};

export class BacklogService {
  isConfigured(config: AppConfig): boolean {
    return Boolean(this.resolveSpace(config) && this.resolveProjectId(config) && process.env.BACKLOG_API_KEY);
  }

  async testConnection(config: AppConfig): Promise<{ ok: true; project: BacklogProject }> {
    const project = await this.fetchProject(config);
    return { ok: true, project };
  }

  async fetchIssues(config: AppConfig, limit = 20): Promise<IssueRecord[]> {
    const project = await this.fetchProject(config);
    const params = new URLSearchParams();
    params.append("projectId[]", String(project.id));
    params.append("count", String(limit));
    params.append("sort", "updated");
    params.append("order", "desc");

    const issues = await this.request<BacklogIssue[]>(config, `/api/v2/issues?${params.toString()}`);
    return issues.map((issue) => this.mapIssue(issue));
  }

  async updateIssueStatus(
    config: AppConfig,
    issue: { issueKey?: string; backlogIssueId?: number | string },
    targetStatusName: string
  ): Promise<{ ok: true; statusName: string }> {
    const issueRef = issue.issueKey || issue.backlogIssueId;
    if (!issueRef) {
      throw new Error("Backlog issue reference is missing.");
    }
    const project = await this.fetchProject(config);
    const statuses = await this.request<BacklogStatus[]>(config, `/api/v2/projects/${project.id}/statuses`);
    const target = statuses.find((status) => this.normalizeStatus(status.name) === this.normalizeStatus(targetStatusName));
    if (!target) {
      throw new Error(`Backlog status not found: ${targetStatusName}`);
    }

    await this.request(config, `/api/v2/issues/${encodeURIComponent(String(issueRef))}`, {
      method: "PATCH",
      body: new URLSearchParams({
        statusId: String(target.id)
      })
    });
    return { ok: true, statusName: target.name };
  }

  private async fetchProject(config: AppConfig): Promise<BacklogProject> {
    const projectId = this.resolveProjectId(config);
    if (!projectId) {
      throw new Error("Backlog project is not configured.");
    }
    return this.request<BacklogProject>(config, `/api/v2/projects/${encodeURIComponent(projectId)}`);
  }

  private async request<T>(
    config: AppConfig,
    pathname: string,
    init?: {
      method?: "GET" | "POST" | "PATCH";
      body?: URLSearchParams;
    }
  ): Promise<T> {
    const apiKey = process.env.BACKLOG_API_KEY;
    const baseUrl = this.resolveBaseUrl(config);
    if (!apiKey || !baseUrl) {
      throw new Error("Backlog credentials are not configured.");
    }

    const separator = pathname.includes("?") ? "&" : "?";
    const url = `${baseUrl}${pathname}${separator}apiKey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" } : {})
      },
      body: init?.body?.toString()
    });

    if (!response.ok) {
      throw new Error(`Backlog API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private mapIssue(issue: BacklogIssue): IssueRecord {
    const payload = {
      backlogIssueId: issue.id,
      backlogStatus: issue.status?.name ?? "",
      description: issue.description ?? "",
      customFields: issue.customFields ?? []
    };

    return {
      id: `backlog-${issue.id}`,
      issueKey: issue.issueKey,
      title: issue.summary,
      requester: issue.createdUser?.name ?? "backlog",
      assignee: issue.assignee?.name ?? "unassigned",
      templateKey: this.detectTemplateKey(issue),
      status: this.mapStatus(issue.status?.id, issue.status?.name),
      payload,
      createdAt: issue.created ?? new Date().toISOString(),
      updatedAt: issue.updated ?? new Date().toISOString()
    };
  }

  private detectTemplateKey(issue: BacklogIssue): TemplateKey {
    const fromDescription = this.matchTemplate(issue.description ?? "");
    if (fromDescription) {
      return fromDescription;
    }

    for (const field of issue.customFields ?? []) {
      if ((field.name ?? "").toLowerCase().includes("template")) {
        const matched = this.matchTemplate(String(field.value ?? ""));
        if (matched) {
          return matched;
        }
      }
    }

    return "template_service_basic";
  }

  private matchTemplate(input: string): TemplateKey | null {
    const match = input.match(/template[_:\-= ]+([a-z0-9_]+)/i);
    if (!match) {
      return null;
    }

    const suffix = match[1].toLowerCase();
    return suffix.startsWith("template_") ? suffix : `template_${suffix}`;
  }

  private mapStatus(statusId?: number, statusName?: string): IssueRecord["status"] {
    const normalized = (statusName ?? "").toLowerCase();
    if (statusId === 4 || statusName === "完了" || normalized === "closed") {
      return "Completed";
    }
    if (statusId === 3 || statusName === "処理済み" || normalized === "resolved") {
      return "Approved";
    }
    if (statusId === 2 || statusName === "処理中" || normalized === "in progress") {
      return "ReviewRequested";
    }
    return "Draft";
  }

  private resolveBaseUrl(config: AppConfig): string {
    const space = this.resolveSpace(config);
    if (!space) {
      return "";
    }
    if (/^https?:\/\//i.test(space)) {
      return space.replace(/\/+$/, "");
    }
    return `https://${space}.backlog.com`;
  }

  private resolveSpace(config: AppConfig): string {
    return (config.backlogSpace || process.env.BACKLOG_SPACE || "").trim();
  }

  private resolveProjectId(config: AppConfig): string {
    return (config.backlogProjectId || process.env.BACKLOG_PROJECT_ID || "").trim();
  }

  private normalizeStatus(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "");
  }
}
