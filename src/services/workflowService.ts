import { JsonStore } from "../store.js";
import { ManagedTemplateDefinition, TemplateValidationResult } from "../templateManagerTypes.js";
import {
  AppConfig,
  DashboardSnapshot,
  DocumentRecord,
  IssueRecord,
  IssueStatus,
  WorkflowEvent
} from "../types.js";
import { templateCatalog } from "../templateCatalog.js";
import { BacklogService } from "./backlogService.js";
import { BacklogSetupService, BacklogSetupReport } from "./backlogSetupService.js";
import { DocumentService } from "./documentService.js";
import { SlackService } from "./slackService.js";
import { TemplateManagerService } from "./templateManagerService.js";

const statusFlow: IssueStatus[] = ["Draft", "ReviewRequested", "Approved", "Fixed", "Completed"];

export class WorkflowService {
  constructor(
    private readonly store: JsonStore,
    private readonly documentService: DocumentService,
    private readonly backlogService: BacklogService,
    private readonly slackService: SlackService,
    private readonly templateManagerService: TemplateManagerService,
    private readonly backlogSetupService: BacklogSetupService
  ) {}

  async snapshot(): Promise<DashboardSnapshot> {
    const state = await this.store.load();
    const definitions = await this.templateManagerService.listDefinitions();
    return {
      ...state,
      templates: templateCatalog,
      templateDefinitionsCount: definitions.length,
      health: {
        app: "ok",
        backlog: this.backlogService.isConfigured(state.config) ? "ok" : "warn",
        slack: this.slackService.isConfigured(state.config) ? "ok" : "warn",
        drive: state.config.driveRootFolderId ? "ok" : "warn",
        rds: "warn"
      }
    };
  }

  async listTemplateDefinitions(): Promise<ManagedTemplateDefinition[]> {
    return this.templateManagerService.listDefinitions();
  }

  async validateTemplateDefinitions(): Promise<TemplateValidationResult[]> {
    const results = await this.templateManagerService.validateAll();
    const passed = results.filter((result) => result.passed).length;
    await this.pushEvent("poller-run", `テンプレート定義を検証しました。成功 ${passed}/${results.length} 件。`);
    return results;
  }

  async createTemplateDefinition(input: {
    id: string;
    templateFile: string;
    documentName: string;
    issueTypes: string[];
    contractNoPrefix: "C" | "PO" | "LIC";
    mergeWith?: string[];
    notes?: string;
  }): Promise<ManagedTemplateDefinition> {
    const definition = await this.templateManagerService.createDefinition(input);
    await this.pushEvent("issue-created", `テンプレート定義 ${definition.id} を追加しました。`);
    return definition;
  }

  async getBacklogSetupReports(): Promise<BacklogSetupReport[]> {
    const definitions = await this.templateManagerService.listDefinitions();
    return definitions.map((definition) => this.backlogSetupService.createReport(definition));
  }

  async getBacklogInitialChecklist(): Promise<string> {
    const definitions = await this.templateManagerService.listDefinitions();
    return this.backlogSetupService.createInitialChecklist(definitions);
  }

  async getBacklogSetupReport(templateId: string): Promise<BacklogSetupReport> {
    const definitions = await this.templateManagerService.listDefinitions();
    const definition = definitions.find((item) => item.id === templateId);
    if (!definition) {
      throw new Error("Template definition not found");
    }
    return this.backlogSetupService.createReport(definition);
  }

  async getBacklogSetupReportMarkdown(templateId: string): Promise<string> {
    const report = await this.getBacklogSetupReport(templateId);
    return this.backlogSetupService.renderReport(report);
  }

  async updateConfig(input: Partial<AppConfig>): Promise<AppConfig> {
    const state = await this.store.load();
    const next: AppConfig = {
      ...state.config,
      ...input,
      pollingIntervalSec: Number(input.pollingIntervalSec ?? state.config.pollingIntervalSec),
      lastSavedAt: new Date().toISOString()
    };
    await this.store.saveConfig(next);
    await this.pushEvent("poller-run", "設定を更新しました。");
    return next;
  }

  async createIssue(input: Partial<IssueRecord>): Promise<IssueRecord> {
    const state = await this.store.load();
    const issue: IssueRecord = {
      id: `issue-${Date.now()}`,
      issueKey: input.issueKey ?? `LEGAL-${100 + state.issues.length + 1}`,
      title: input.title ?? "新規文書作成依頼",
      requester: input.requester ?? "依頼者",
      assignee: input.assignee ?? "local-app",
      templateKey: input.templateKey ?? "template_service_basic",
      status: input.status ?? "Draft",
      payload: input.payload ?? {},
      contractNo: input.contractNo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.issues.unshift(issue);
    await this.store.saveIssues(state.issues);
    await this.pushEvent("issue-created", `${issue.issueKey} を登録しました。`);
    return issue;
  }

  async runPoller(): Promise<IssueRecord[]> {
    const state = await this.store.load();
    if (!this.backlogService.isConfigured(state.config)) {
      const fallback = await this.runMockPoller(state.issues);
      await this.pushEvent(
        "poller-run",
        `Backlog 未設定のためローカル模擬更新を実行しました。${Math.min(fallback.length, 2)}件を更新。`
      );
      return fallback;
    }

    const remoteIssues = await this.backlogService.fetchIssues(state.config, 30);
    const merged = this.mergeIssues(state.issues, remoteIssues);
    await this.store.saveIssues(merged.issues);

    const message = [
      `Backlog から ${remoteIssues.length} 件取得。`,
      merged.createdCount ? `${merged.createdCount}件を新規取込。` : "",
      merged.updatedCount ? `${merged.updatedCount}件を更新。` : ""
    ]
      .filter(Boolean)
      .join(" ");

    await this.pushEvent("poller-run", message || "Backlog 同期を実行しました。");
    return merged.issues;
  }

  async generateDocument(issueId: string): Promise<DocumentRecord> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    const document = await this.documentService.generate(issue);
    const nextIssue = {
      ...issue,
      contractNo: document.contractNo,
      updatedAt: new Date().toISOString()
    };

    state.documents.unshift(document);
    state.issues = state.issues.map((item) => (item.id === issueId ? nextIssue : item));
    await this.store.saveDocuments(state.documents);
    await this.store.saveIssues(state.issues);
    await this.pushEvent("document-generated", `${issue.issueKey} から ${document.fileName} を生成しました。`);
    return document;
  }

  async testBacklogConnection(): Promise<{ ok: true; projectName: string }> {
    const state = await this.store.load();
    const result = await this.backlogService.testConnection(state.config);
    await this.pushEvent("poller-run", `Backlog 接続確認に成功しました: ${result.project.name}`);
    return { ok: true, projectName: result.project.name };
  }

  async testSlackConnection(): Promise<{ ok: true; channel: string }> {
    const state = await this.store.load();
    const result = await this.slackService.testConnection(state.config);
    await this.pushEvent("poller-run", `Slack 接続確認に成功しました: ${result.channel}`);
    return result;
  }

  async sendIssueNotification(issueId: string): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    await this.slackService.postMessage(
      state.config,
      `文書依頼 ${issue.issueKey}\n件名: ${issue.title}\n状態: ${issue.status}\nテンプレート: ${issue.templateKey}`
    );
    await this.pushEvent("status-changed", `${issue.issueKey} の Slack 通知を送信しました。`);
  }

  async handleSlackCommand(text: string, channel: string): Promise<string> {
    const normalized = text.trim();
    if (/^health$/i.test(normalized)) {
      const snapshot = await this.snapshot();
      return `APP=${snapshot.health.app} BACKLOG=${snapshot.health.backlog} SLACK=${snapshot.health.slack}`;
    }

    if (/^poll$/i.test(normalized)) {
      const issues = await this.runPoller();
      return `Backlog 同期を実行しました。現在 ${issues.length} 件です。`;
    }

    const generateMatch = normalized.match(/^generate\s+([A-Z]+-\d+)/i);
    if (generateMatch) {
      const state = await this.store.load();
      const issueKey = generateMatch[1].toUpperCase();
      const issue = state.issues.find((item) => item.issueKey === issueKey);
      if (!issue) {
        return `${issueKey} は見つかりません。`;
      }

      const document = await this.generateDocument(issue.id);
      await this.slackService.postMessage(
        state.config,
        `${issue.issueKey} の文書を生成しました: ${document.fileName}`,
        channel
      );
      return `${issue.issueKey} の文書生成を実行しました。`;
    }

    return "利用可能コマンド: health, poll, generate LEGAL-101";
  }

  private async runMockPoller(issues: IssueRecord[]): Promise<IssueRecord[]> {
    const updated = issues.map((issue, index) => {
      if (index > 1) {
        return issue;
      }

      const nextStatus = statusFlow[(statusFlow.indexOf(issue.status) + 1) % statusFlow.length];
      return {
        ...issue,
        previousStatus: issue.status,
        status: nextStatus,
        updatedAt: new Date().toISOString()
      };
    });

    await this.store.saveIssues(updated);
    return updated;
  }

  private mergeIssues(existingIssues: IssueRecord[], remoteIssues: IssueRecord[]) {
    const existingByKey = new Map(existingIssues.map((issue) => [issue.issueKey, issue]));
    let createdCount = 0;
    let updatedCount = 0;

    for (const remote of remoteIssues) {
      const current = existingByKey.get(remote.issueKey);
      if (!current) {
        existingByKey.set(remote.issueKey, remote);
        createdCount += 1;
        continue;
      }

      const changed =
        current.title !== remote.title ||
        current.status !== remote.status ||
        current.assignee !== remote.assignee ||
        current.updatedAt !== remote.updatedAt;

      if (changed) {
        existingByKey.set(remote.issueKey, {
          ...current,
          ...remote,
          previousStatus: current.status !== remote.status ? current.status : current.previousStatus,
          contractNo: current.contractNo ?? remote.contractNo
        });
        updatedCount += 1;
      }
    }

    const issues = Array.from(existingByKey.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
    return { issues, createdCount, updatedCount };
  }

  private async pushEvent(type: WorkflowEvent["type"], message: string): Promise<void> {
    const state = await this.store.load();
    const event: WorkflowEvent = {
      id: `event-${Date.now()}`,
      type,
      message,
      createdAt: new Date().toISOString()
    };
    state.events.unshift(event);
    await this.store.saveEvents(state.events);
  }
}
