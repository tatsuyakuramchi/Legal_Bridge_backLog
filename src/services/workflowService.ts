import { writeFile } from "node:fs/promises";
import path from "node:path";
import { JsonStore } from "../store.js";
import { ManagedTemplateDefinition, TemplateValidationResult } from "../templateManagerTypes.js";
import {
  AdminUser,
  AppConfig,
  BulkOrderImportResult,
  BulkOrderOutputMode,
  DashboardSnapshot,
  DocumentRecord,
  IssueRecord,
  IssueStatus,
  WorkflowEvent
} from "../types.js";
import { templateCatalog } from "../templateCatalog.js";
import { BacklogService } from "./backlogService.js";
import { BacklogSetupService, BacklogSetupReport } from "./backlogSetupService.js";
import { BulkOrderService } from "./bulkOrderService.js";
import { CloudSignDocument, CloudSignService } from "./cloudSignService.js";
import { DocumentService } from "./documentService.js";
import { RegistryService } from "./registryService.js";
import { SlackService } from "./slackService.js";
import { TemplateManagerService } from "./templateManagerService.js";

const statusFlow: IssueStatus[] = ["Draft", "ReviewRequested", "Approved", "Fixed", "Completed"];

const statusLabelMap: Record<IssueStatus, string> = {
  Draft: "草案",
  ReviewRequested: "レビュー中",
  Approved: "承認待ち",
  CounterpartyConfirmed: "相手方確認待ち",
  SigningRequested: "押印依頼中",
  Signed: "締結済",
  Fixed: "差戻し",
  Completed: "完了"
};

const legalStatusMessageMap: Record<IssueStatus, string> = {
  Draft: "法務着手または草案化",
  ReviewRequested: "レビュー開始",
  Approved: "承認待ちへ移行",
  CounterpartyConfirmed: "相手方確認フェーズへ移行",
  SigningRequested: "押印依頼フェーズへ移行",
  Signed: "締結完了",
  Fixed: "差戻し",
  Completed: "案件完了"
};

const requesterStatusMessageMap: Partial<Record<IssueStatus, string>> = {
  Draft: "申請を受け付けました。",
  ReviewRequested: "法務レビューを開始しました。",
  Approved: "社内承認待ちです。",
  CounterpartyConfirmed: "相手方確認フェーズに進みました。",
  SigningRequested: "押印手続きに進みました。",
  Signed: "締結が完了しました。",
  Fixed: "申請内容の確認または修正が必要です。",
  Completed: "案件対応が完了しました。"
};

export class WorkflowService {
  private readonly bulkOrderService = new BulkOrderService();
  private readonly registryService: RegistryService;

  constructor(
    private readonly store: JsonStore,
    private readonly documentService: DocumentService,
    private readonly backlogService: BacklogService,
    private readonly cloudSignService: CloudSignService,
    private readonly slackService: SlackService,
    private readonly templateManagerService: TemplateManagerService,
    private readonly backlogSetupService: BacklogSetupService
  ) {
    this.registryService = new RegistryService(store);
  }

  async snapshot(): Promise<DashboardSnapshot> {
    const state = await this.store.load();
    const definitions = await this.templateManagerService.listDefinitions();
    return {
      ...state,
      templates: templateCatalog,
      templateDefinitionsCount: definitions.length,
      contracts: state.contracts,
      pollingLogs: state.pollingLogs,
      deliveries: state.deliveries,
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
    await this.pushEvent("poller-run", `Template validation ${passed}/${results.length} passed`);
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
    await this.pushEvent("issue-created", `Template definition created: ${definition.id}`);
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
    await this.pushEvent("poller-run", "Configuration updated");
    return next;
  }

  async createIssue(input: Partial<IssueRecord>): Promise<IssueRecord> {
    const state = await this.store.load();
    const payload = (input.payload ?? {}) as Record<string, unknown>;
    const requester = input.requester ?? "local-user";
    const requesterSlackId = this.resolveRequesterSlackIdFromPayload(requester, payload, state.users);
    const issue: IssueRecord = {
      id: `issue-${Date.now()}`,
      issueKey: input.issueKey ?? `LEGAL-${100 + state.issues.length + 1}`,
      title: input.title ?? "新規文書ドラフト",
      requester,
      assignee: input.assignee ?? "local-app",
      templateKey: input.templateKey ?? "template_service_basic",
      status: input.status ?? "Draft",
      payload: {
        ...payload,
        ...(requesterSlackId ? { requester_slack_id: requesterSlackId } : {})
      },
      contractNo: input.contractNo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.issues.unshift(issue);
    await this.store.saveIssues(state.issues);
    await this.registryService.recordIssueState(issue);
    await this.pushEvent("issue-created", `${issue.issueKey} created`);
    return issue;
  }

  async runPoller(): Promise<IssueRecord[]> {
    const state = await this.store.load();
    const startedAt = new Date().toISOString();
    if (!this.backlogService.isConfigured(state.config)) {
      const fallback = await this.runMockPoller(state.issues);
      await this.registryService.recordPollerRun({
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        source: "mock",
        fetched_count: fallback.length,
        created_count: 0,
        updated_count: Math.min(fallback.length, 2),
        success: true,
        message: `Mock poller executed: ${Math.min(fallback.length, 2)} issues updated`
      });
      await this.pushEvent("poller-run", `Mock poller executed: ${Math.min(fallback.length, 2)} issues updated`);
      return fallback;
    }

    const remoteIssues = await this.backlogService.fetchIssues(state.config, 30);
    const merged = this.mergeIssues(state.issues, remoteIssues);
    const normalizedIssues = merged.issues.map((issue) => this.withResolvedRequesterSlackId(issue, state.users));
    await this.store.saveIssues(normalizedIssues);

    const message = [
      `Backlog fetched ${remoteIssues.length} issues.`,
      merged.createdCount ? `${merged.createdCount} created.` : "",
      merged.updatedCount ? `${merged.updatedCount} updated.` : ""
    ]
      .filter(Boolean)
      .join(" ");

    await this.registryService.recordPollerRun({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      source: "backlog",
      fetched_count: remoteIssues.length,
      created_count: merged.createdCount,
      updated_count: merged.updatedCount,
      success: true,
      message
    });

    await this.pushEvent("poller-run", message || "Backlog poller executed");
    return normalizedIssues;
  }

  async generateDocument(issueId: string): Promise<DocumentRecord> {
    const state = await this.store.load();
    const currentIssue = state.issues.find((item) => item.id === issueId);
    if (!currentIssue) {
      throw new Error("Issue not found");
    }

    const issue = await this.registryService.ensureContractNumber(currentIssue);
    const childIssues = this.resolveChildIssues(issue, state.issues);
    const workingIssues = new Map(state.issues.map((item) => [item.id, item]));
    workingIssues.set(issue.id, issue);

    const generatedDocuments: DocumentRecord[] = [];
    const normalizedIssues: IssueRecord[] = [];
    const allTargets = [issue, ...childIssues].map((target, index) => {
      if (index === 0) {
        return target;
      }
      return this.mergeParentChildIssue(issue, target);
    });

    for (const target of allTargets) {
      const ensured = target.contractNo ? target : { ...target, contractNo: issue.contractNo, updatedAt: new Date().toISOString() };
      const document = await this.documentService.generate(ensured);
      const nextIssue = {
        ...ensured,
        contractNo: document.contractNo,
        updatedAt: new Date().toISOString()
      };
      generatedDocuments.push(document);
      normalizedIssues.push(nextIssue);
      workingIssues.set(nextIssue.id, nextIssue);
      await this.registryService.recordDocumentLifecycle(nextIssue, document);
    }

    let resultDocument = generatedDocuments[0];
    if (generatedDocuments.length > 1) {
      const mergedFileName = `${issue.issueKey}-bundle-${Date.now()}.pdf`;
      const mergedPdfPath = await this.documentService.mergePdfDocuments(
        generatedDocuments.map((item) => item.pdfPath),
        mergedFileName
      );
      resultDocument = {
        ...generatedDocuments[0],
        id: `doc-bundle-${Date.now()}`,
        fileName: mergedFileName,
        pdfPath: mergedPdfPath,
        htmlPath: generatedDocuments[0].htmlPath,
        driveFolderName: `${issue.contractNo ?? issue.issueKey}_bundle`
      };
      generatedDocuments.unshift(resultDocument);
      await this.registryService.recordDocumentLifecycle(normalizedIssues[0], resultDocument);
    }

    state.documents.unshift(...generatedDocuments);
    state.issues = Array.from(workingIssues.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    await this.store.saveDocuments(state.documents);
    await this.store.saveIssues(state.issues);
    await this.pushEvent(
      "document-generated",
      generatedDocuments.length > 1
        ? `${issue.issueKey} generated bundle with ${generatedDocuments.length - 1} components`
        : `${issue.issueKey} generated ${resultDocument.fileName}`
    );
    return resultDocument;
  }

  async requestIssueApproval(issueId: string): Promise<{ ok: true; channel: string; ts?: string }> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    const approverSlackId =
      String(issue.payload.approverSlackId ?? issue.payload.approver_slack_id ?? state.config.approverSlackId ?? "").trim() ||
      (process.env.APPROVER_SLACK_ID || "").trim();
    if (!approverSlackId) {
      throw new Error("Approver Slack ID is not configured.");
    }

    const channel = state.config.legalSlackChannel || process.env.LEGAL_SLACK_CHANNEL || "";
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*承認依頼* <@${approverSlackId}>\n*${issue.issueKey}* ${issue.title}\nstatus: ${issue.status}\ntemplate: ${issue.templateKey}`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "承認" },
            action_id: "approve_issue",
            value: issue.id
          },
          {
            type: "button",
            style: "danger",
            text: { type: "plain_text", text: "否認" },
            action_id: "reject_issue",
            value: issue.id
          }
        ]
      }
    ];
    const response = await this.slackService.postBlocks(state.config, {
      channel,
      text: `承認依頼 ${issue.issueKey}`,
      blocks
    });

    const nextIssue = this.withApprovalPayload(issue, {
      approval_requested_at: new Date().toISOString(),
      approver_slack_id: approverSlackId,
      approval_status: "pending",
      approval_slack_ts: response.ts,
      approval_channel: response.channel ?? channel
    });
    await this.saveIssue(nextIssue);
    await this.pushEvent("status-changed", `${issue.issueKey} approval requested`);
    return { ok: true, channel: response.channel ?? channel, ts: response.ts };
  }

  async sendApprovalReminders(): Promise<{ reminded: number }> {
    const state = await this.store.load();
    const pending = state.issues.filter((issue) => this.getApprovalStatus(issue) === "pending");
    let reminded = 0;

    for (const issue of pending) {
      const approverSlackId = this.getApprovalValue(issue, "approver_slack_id");
      if (!approverSlackId) {
        continue;
      }
      await this.slackService.postMessage(
        state.config,
        `承認待ちリマインド <@${approverSlackId}> ${issue.issueKey} ${issue.title}`,
        this.getApprovalValue(issue, "approval_channel") || state.config.legalSlackChannel
      );
      reminded += 1;
    }

    await this.pushEvent("status-changed", `Approval reminders sent: ${reminded}`);
    return { reminded };
  }

  async requestStamp(issueId: string): Promise<{ ok: true; channel: string; ts?: string }> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    const approvers = state.users.filter((user) => user.is_business_approver && user.is_active);
    const mentions = approvers.length ? approvers.map((user) => `<@${user.slack_id}>`).join(" ") : "";
    const channel = state.config.legalSlackChannel || process.env.LEGAL_SLACK_CHANNEL || "";
    const latestDocument = this.findLatestDocumentForIssue(state.documents, issue.id);
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*押印依頼* ${mentions}\n*${issue.issueKey}* ${issue.title}\n送付方法を選択してください。${latestDocument ? `\nPDF: ${latestDocument.fileName}` : ""}`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "CloudSign送信" },
            action_id: "stamp_cloudsign",
            value: issue.id
          },
          {
            type: "button",
            text: { type: "plain_text", text: "物理押印" },
            action_id: "stamp_physical",
            value: issue.id
          },
          {
            type: "button",
            text: { type: "plain_text", text: "送信待ち" },
            action_id: "stamp_pending",
            value: issue.id
          }
        ]
      }
    ];
    const response = await this.slackService.postBlocks(state.config, {
      channel,
      text: `押印依頼 ${issue.issueKey}`,
      blocks
    });
    const nextIssue = this.withApprovalPayload(issue, {
      stamp_status: "requested",
      stamp_method: "pending",
      stamp_requested_at: new Date().toISOString(),
      stamp_slack_ts: response.ts,
      stamp_channel: response.channel ?? channel
    });
    await this.saveIssue(nextIssue);
    await this.pushEvent("status-changed", `${issue.issueKey} stamp requested`);
    return { ok: true, channel: response.channel ?? channel, ts: response.ts };
  }

  async sendStampReminders(): Promise<{ reminded: number }> {
    const state = await this.store.load();
    const requested = state.issues.filter((issue) =>
      ["requested", "physical_requested", "cloudsign_sent", "cloudsign_pending"].includes(
        this.getApprovalValue(issue, "stamp_status")
      )
    );
    let reminded = 0;
    for (const issue of requested) {
      const method = this.getApprovalValue(issue, "stamp_method") || "pending";
      await this.slackService.postMessage(
        state.config,
        `押印リマインド [${method}] ${issue.issueKey} ${issue.title}`,
        this.getApprovalValue(issue, "stamp_channel") || state.config.legalSlackChannel
      );
      reminded += 1;
    }
    await this.pushEvent("status-changed", `Stamp reminders sent: ${reminded}`);
    return { reminded };
  }

  async handleSlackEvent(input: {
    type: string;
    event: Record<string, unknown>;
    envelope: Record<string, unknown>;
  }): Promise<void> {
    if (input.type !== "file_shared") {
      return;
    }

    const fileObject = ((input.event.file as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    const fileId = String(input.event.file_id ?? fileObject.id ?? "");
    const threadTs = String(input.event.thread_ts ?? input.event.event_ts ?? "");
    if (!fileId || !threadTs) {
      return;
    }

    const state = await this.store.load();
    const issue = state.issues.find((item) => {
      const approvalTs = this.getApprovalValue(item, "approval_slack_ts");
      const stampTs = this.getApprovalValue(item, "stamp_slack_ts");
      return approvalTs === threadTs || stampTs === threadTs;
    });
    if (!issue) {
      return;
    }

    const file = await this.slackService.getFileInfo(fileId);
    const nextIssue = this.withApprovalPayload(issue, {
      stamp_file_id: fileId,
      stamp_file_name: String(file.name ?? ""),
      stamp_file_url_private: String(file.url_private_download ?? file.url_private ?? ""),
      stamp_uploaded_at: new Date().toISOString(),
      stamp_status: "file_received"
    });
    await this.saveIssue(nextIssue);

    const channel = this.getApprovalValue(issue, "stamp_channel") || this.getApprovalValue(issue, "approval_channel");
    if (channel) {
      await this.slackService.postMessage(
        state.config,
        `${issue.issueKey} の押印済みファイルを受領しました: ${String(file.name ?? fileId)}`,
        channel
      );
    }
    await this.pushEvent("document-generated", `${issue.issueKey} stamp file received`);
  }

  async handleSlackInteraction(payload: Record<string, unknown>): Promise<void> {
    const type = String(payload.type ?? "");
    if (type === "block_actions") {
      const actions = Array.isArray(payload.actions) ? (payload.actions as Array<Record<string, unknown>>) : [];
      const action = actions[0];
      if (!action) {
        return;
      }

      const actionId = String(action.action_id ?? "");
      const issueId = String(action.value ?? "");
      if (actionId === "approve_issue") {
        await this.approveIssueFromSlack(issueId, payload);
        return;
      }
      if (actionId === "reject_issue") {
        const triggerId = String(payload.trigger_id ?? "");
        if (triggerId) {
          await this.openRejectModal(issueId, triggerId);
        }
        return;
      }
      if (actionId === "stamp_done") {
        await this.completeStampFromSlack(issueId, payload);
        return;
      }
      if (actionId === "stamp_physical") {
        await this.markStampPhysical(issueId, payload);
        return;
      }
      if (actionId === "stamp_cloudsign") {
        await this.sendIssueToCloudSign(issueId);
        return;
      }
      if (actionId === "stamp_pending") {
        await this.markStampPending(issueId);
      }
      return;
    }

    if (type === "view_submission") {
      const view = (payload.view as Record<string, unknown> | undefined) ?? {};
      if (String(view.callback_id ?? "") !== "reject_issue_modal") {
        return;
      }

      const issueId = String(view.private_metadata ?? "");
      const stateValues = ((view.state as Record<string, unknown> | undefined)?.values ?? {}) as Record<
        string,
        Record<string, { value?: string }>
      >;
      const reason =
        Object.values(stateValues)
          .flatMap((group) => Object.values(group))
          .map((field) => field?.value ?? "")
          .find(Boolean) ?? "";
      await this.rejectIssueFromSlack(issueId, reason, payload);
    }
  }

  async importBulkOrderCsv(input: {
    csvText: string;
    outputMode?: BulkOrderOutputMode | string;
    createBacklogIssues?: boolean;
    notifySlack?: boolean;
    previewOnly?: boolean;
  }): Promise<BulkOrderImportResult> {
    const state = await this.store.load();
    const outputMode = this.bulkOrderService.normalizeOutputMode(
      typeof input.outputMode === "string" ? input.outputMode : undefined
    );
    const parsed = this.bulkOrderService.parse(input.csvText);

    if (parsed.errors.length > 0) {
      return {
        outputMode,
        totalRows: parsed.rows.length + new Set(parsed.errors.map((item) => item.rowNumber)).size,
        successCount: 0,
        errorCount: parsed.errors.length,
        backlogIssueCreationRequested: Boolean(input.createBacklogIssues),
        backlogIssueCreationSupported: false,
        rows: parsed.errors.map((error) => ({
          rowNumber: error.rowNumber,
          vendorName: error.vendorName,
          projectTitle: error.projectTitle,
          status: "error",
          error: error.message
        }))
      };
    }

    if (input.previewOnly) {
      return {
        outputMode,
        totalRows: parsed.rows.length,
        successCount: parsed.rows.length,
        errorCount: 0,
        backlogIssueCreationRequested: Boolean(input.createBacklogIssues),
        backlogIssueCreationSupported: false,
        rows: parsed.rows.map((row) => ({
          rowNumber: row.rowNumber,
          vendorName: row.vendorName,
          projectTitle: row.projectTitle,
          status: "preview"
        }))
      };
    }

    const results: BulkOrderImportResult["rows"] = [];
    const createdDocuments: DocumentRecord[] = [];

    for (const row of parsed.rows) {
      try {
        const issue = await this.createIssue({
          title: row.title,
          requester: "bulk-order",
          templateKey: "template_order_planning",
          payload: row.payload
        });
        const document = await this.generateDocument(issue.id);
        createdDocuments.push(document);
        results.push({
          rowNumber: row.rowNumber,
          issueId: issue.id,
          issueKey: issue.issueKey,
          fileName: document.fileName,
          pdfPath: document.pdfPath,
          vendorName: row.vendorName,
          projectTitle: row.projectTitle,
          status: "generated"
        });
      } catch (error) {
        results.push({
          rowNumber: row.rowNumber,
          vendorName: row.vendorName,
          projectTitle: row.projectTitle,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    let mergedPdfPath: string | undefined;
    let mergedFileName: string | undefined;
    const generatedDocs = createdDocuments.filter((document) => document.pdfPath);
    if ((outputMode === "merged" || outputMode === "both") && generatedDocs.length > 0) {
      mergedFileName = `bulk-order-planning-${new Date().toISOString().slice(0, 10)}-${generatedDocs.length}.pdf`;
      mergedPdfPath = await this.documentService.mergePdfDocuments(
        generatedDocs.map((document) => document.pdfPath),
        mergedFileName
      );
      const latestState = await this.store.load();
      latestState.documents.unshift({
        id: `doc-bulk-${Date.now()}`,
        issueId: "bulk-order",
        issueKey: "BULK-ORDER",
        templateKey: "template_order_planning",
        fileName: mergedFileName,
        htmlPath: generatedDocs[0].htmlPath,
        pdfPath: mergedPdfPath,
        driveFolderName: `bulk-order-${new Date().toISOString().slice(0, 10)}`,
        driveStatus: "pending",
        createdAt: new Date().toISOString()
      });
      await this.store.saveDocuments(latestState.documents);
    }

    if (input.notifySlack && results.length > 0 && this.slackService.isConfigured(state.config)) {
      const successCount = results.filter((row) => row.status === "generated").length;
      const errorCount = results.filter((row) => row.status === "error").length;
      const lines = [
        `一括発注書を処理しました: ${successCount}件成功 / ${errorCount}件エラー`,
        mergedPdfPath ? `合冊PDF: ${mergedFileName}` : ""
      ].filter(Boolean);
      await this.slackService.postMessage(state.config, lines.join("\n"));
    }

    await this.pushEvent(
      "document-generated",
      `Bulk order import completed: ${results.filter((row) => row.status === "generated").length} generated`
    );

    return {
      outputMode,
      totalRows: parsed.rows.length,
      successCount: results.filter((row) => row.status === "generated").length,
      errorCount: results.filter((row) => row.status === "error").length,
      mergedPdfPath,
      mergedFileName,
      backlogIssueCreationRequested: Boolean(input.createBacklogIssues),
      backlogIssueCreationSupported: false,
      rows:
        outputMode === "merged"
          ? results.map((row) => ({ ...row, pdfPath: undefined, fileName: undefined }))
          : results
    };
  }

  async testBacklogConnection(): Promise<{ ok: true; projectName: string }> {
    const state = await this.store.load();
    const result = await this.backlogService.testConnection(state.config);
    await this.pushEvent("poller-run", `Backlog connection OK: ${result.project.name}`);
    return { ok: true, projectName: result.project.name };
  }

  async testSlackConnection(): Promise<{ ok: true; channel: string }> {
    const state = await this.store.load();
    const result = await this.slackService.testConnection(state.config);
    await this.pushEvent("poller-run", `Slack connection OK: ${result.channel}`);
    return result;
  }

  async testCloudSignConnection(): Promise<{ ok: true; baseUrl: string }> {
    const state = await this.store.load();
    const result = await this.cloudSignService.testConnection(state.config);
    await this.pushEvent("poller-run", `CloudSign connection OK: ${result.baseUrl}`);
    return result;
  }

  async sendIssueToCloudSign(issueId: string): Promise<{ ok: true; documentId: string }> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }
    if (!this.cloudSignService.isConfigured(state.config)) {
      throw new Error("CloudSign is not configured.");
    }

    const latestDocument = this.findLatestDocumentForIssue(state.documents, issue.id);
    if (!latestDocument) {
      throw new Error("Generated PDF was not found.");
    }

    const recipientEmail = this.resolveCounterpartyEmail(issue);
    if (!recipientEmail) {
      throw new Error("Counterparty email is not configured.");
    }
    const recipientName = this.resolveCounterpartyName(issue);
    const company = this.getApprovalValue(issue, "vendorName") || this.getApprovalValue(issue, "counterpartyName") || recipientName;

    const created = await this.cloudSignService.createDocument(state.config, {
      title: `${issue.issueKey} ${issue.title}`,
      note: issue.contractNo ? `contract_no=${issue.contractNo}` : undefined
    });
    const documentId = String(created.id ?? "");
    if (!documentId) {
      throw new Error("CloudSign document id was not returned.");
    }

    await this.cloudSignService.addFile(state.config, documentId, latestDocument.pdfPath);
    await this.cloudSignService.addParticipant(state.config, documentId, {
      email: recipientEmail,
      name: recipientName,
      company
    });
    await this.cloudSignService.sendDocument(state.config, documentId);

    const nextIssue: IssueRecord = {
      ...this.withApprovalPayload(issue, {
        stamp_method: "cloudsign",
        stamp_status: "cloudsign_sent",
        counterparty_ok_method: "cloudsign",
        cloudsign_document_id: documentId,
        cloudsign_sent_at: new Date().toISOString(),
        cloudsign_source_pdf_path: latestDocument.pdfPath,
        cloudsign_recipient_email: recipientEmail,
        cloudsign_recipient_name: recipientName
      }),
      previousStatus: issue.status,
      status: "SigningRequested",
      updatedAt: new Date().toISOString()
    };
    await this.saveIssue(nextIssue);
    await this.updateBacklogStatusIfPossible(state.config, nextIssue, "電子署名依頼中");
    await this.pushEvent("status-changed", `${issue.issueKey} sent to CloudSign`);

    const channel = this.getApprovalValue(nextIssue, "stamp_channel") || state.config.legalSlackChannel;
    if (channel) {
      await this.slackService.postMessage(
        state.config,
        `${issue.issueKey} を CloudSign に送信しました。recipient=${recipientEmail} documentId=${documentId}`,
        channel
      );
    }

    return { ok: true, documentId };
  }

  async syncCloudSignStatuses(): Promise<{ checked: number; completed: number; updated: number }> {
    const state = await this.store.load();
    if (!this.cloudSignService.isConfigured(state.config)) {
      return { checked: 0, completed: 0, updated: 0 };
    }

    const targets = state.issues.filter((issue) => {
      const documentId = this.getApprovalValue(issue, "cloudsign_document_id");
      const stampStatus = this.getApprovalValue(issue, "stamp_status");
      return Boolean(documentId) && ["cloudsign_sent", "cloudsign_viewed", "cloudsign_pending"].includes(stampStatus);
    });

    let completed = 0;
    let updated = 0;
    for (const issue of targets) {
      const documentId = this.getApprovalValue(issue, "cloudsign_document_id");
      const document = await this.cloudSignService.getDocument(state.config, documentId);
      const status = this.normalizeCloudSignStatus(document);
      const nextIssue = this.withApprovalPayload(issue, {
        cloudsign_status_code: Number(document.status ?? 0),
        cloudsign_status: status,
        cloudsign_last_synced_at: new Date().toISOString()
      });

      if (status === "completed") {
        const finalized = await this.finalizeCloudSignIssue(state.config, nextIssue, documentId, document);
        await this.saveIssue(finalized);
        completed += 1;
        updated += 1;
        continue;
      }

      if (status === "declined") {
        const declinedIssue: IssueRecord = {
          ...nextIssue,
          previousStatus: issue.status,
          status: "Fixed",
          updatedAt: new Date().toISOString()
        };
        await this.saveIssue(declinedIssue);
        await this.updateBacklogStatusIfPossible(state.config, declinedIssue, "差戻し");
        await this.pushEvent("status-changed", `${issue.issueKey} CloudSign declined`);
        updated += 1;
        continue;
      }

      if (status !== this.getApprovalValue(issue, "cloudsign_status")) {
        await this.saveIssue(nextIssue);
        updated += 1;
      }
    }

    if (targets.length > 0) {
      await this.pushEvent("poller-run", `CloudSign sync checked=${targets.length} completed=${completed} updated=${updated}`);
    }
    return { checked: targets.length, completed, updated };
  }

  async sendIssueNotification(issueId: string): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    await this.slackService.postMessage(
      state.config,
      `文書案件 ${issue.issueKey}\n件名: ${issue.title}\n状態: ${issue.status}\nテンプレート: ${issue.templateKey}`
    );
    await this.pushEvent("status-changed", `${issue.issueKey} notification sent`);
  }

  async handleSlackCommand(text: string, channel: string): Promise<string> {
    const normalized = text.trim();
    if (/^health$/i.test(normalized)) {
      const snapshot = await this.snapshot();
      return `APP=${snapshot.health.app} BACKLOG=${snapshot.health.backlog} SLACK=${snapshot.health.slack}`;
    }

    if (/^poll$/i.test(normalized)) {
      const issues = await this.runPoller();
      return `Backlog poller executed. total=${issues.length}`;
    }

    const generateMatch = normalized.match(/^generate\s+([A-Z]+-\d+)/i);
    if (generateMatch) {
      const state = await this.store.load();
      const issueKey = generateMatch[1].toUpperCase();
      const issue = state.issues.find((item) => item.issueKey === issueKey);
      if (!issue) {
        return `${issueKey} was not found.`;
      }

      const document = await this.generateDocument(issue.id);
      await this.slackService.postMessage(
        state.config,
        `${issue.issueKey} document generated: ${document.fileName}`,
        channel
      );
      return `${issue.issueKey} generated.`;
    }

    const approvalMatch = normalized.match(/^approve\s+([A-Z]+-\d+)/i);
    if (approvalMatch) {
      const state = await this.store.load();
      const issueKey = approvalMatch[1].toUpperCase();
      const issue = state.issues.find((item) => item.issueKey === issueKey);
      if (!issue) {
        return `${issueKey} was not found.`;
      }
      await this.requestIssueApproval(issue.id);
      return `${issue.issueKey} approval requested.`;
    }

    const reminderMatch = normalized.match(/^remind-approvals$/i);
    if (reminderMatch) {
      const result = await this.sendApprovalReminders();
      return `Approval reminders sent: ${result.reminded}`;
    }

    const stampMatch = normalized.match(/^stamp\s+([A-Z]+-\d+)/i);
    if (stampMatch) {
      const state = await this.store.load();
      const issueKey = stampMatch[1].toUpperCase();
      const issue = state.issues.find((item) => item.issueKey === issueKey);
      if (!issue) {
        return `${issueKey} was not found.`;
      }
      await this.requestStamp(issue.id);
      return `${issue.issueKey} stamp requested.`;
    }

    if (/^remind-stamps$/i.test(normalized)) {
      const result = await this.sendStampReminders();
      return `Stamp reminders sent: ${result.reminded}`;
    }

    const cloudSignMatch = normalized.match(/^cloudsign\s+([A-Z]+-\d+)/i);
    if (cloudSignMatch) {
      const state = await this.store.load();
      const issueKey = cloudSignMatch[1].toUpperCase();
      const issue = state.issues.find((item) => item.issueKey === issueKey);
      if (!issue) {
        return `${issueKey} was not found.`;
      }
      const result = await this.sendIssueToCloudSign(issue.id);
      return `${issue.issueKey} sent to CloudSign. documentId=${result.documentId}`;
    }

    if (/^sync-cloudsign$/i.test(normalized)) {
      const result = await this.syncCloudSignStatuses();
      return `CloudSign sync checked=${result.checked} completed=${result.completed} updated=${result.updated}`;
    }

    return "Commands: health, poll, generate LEGAL-101, approve LEGAL-101, remind-approvals, stamp LEGAL-101, remind-stamps, cloudsign LEGAL-101, sync-cloudsign";
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

  private resolveChildIssues(issue: IssueRecord, issues: IssueRecord[]): IssueRecord[] {
    const explicitKeys = this.readIssueKeyList(issue.payload.childIssueKeys ?? issue.payload.child_issue_keys);
    const children = issues.filter((candidate) => {
      if (candidate.id === issue.id) {
        return false;
      }
      const parentKey = String(candidate.payload.parentIssueKey ?? candidate.payload.parent_issue_key ?? "").trim();
      return parentKey === issue.issueKey || explicitKeys.includes(candidate.issueKey);
    });

    return children.sort((left, right) => left.issueKey.localeCompare(right.issueKey, "ja"));
  }

  private mergeParentChildIssue(parent: IssueRecord, child: IssueRecord): IssueRecord {
    return {
      ...child,
      contractNo: child.contractNo ?? parent.contractNo,
      payload: {
        ...parent.payload,
        ...child.payload,
        parentIssueKey: parent.issueKey,
        parent_issue_key: parent.issueKey
      },
      updatedAt: new Date().toISOString()
    };
  }

  private readIssueKeyList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    const raw = String(value ?? "").trim();
    if (!raw) {
      return [];
    }
    return raw
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async approveIssueFromSlack(issueId: string, payload: Record<string, unknown>): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      return;
    }
    const user = (payload.user as Record<string, unknown> | undefined) ?? {};
    const container = (payload.container as Record<string, unknown> | undefined) ?? {};
    const nextIssue: IssueRecord = {
      ...this.withApprovalPayload(issue, {
        approved_at: new Date().toISOString(),
        approved_by_slack_id: String(user.id ?? ""),
        approval_status: "approved"
      }),
      previousStatus: issue.status,
      status: "Approved",
      updatedAt: new Date().toISOString()
    };
    await this.saveIssue(nextIssue);
    if (container.channel_id && container.message_ts) {
      await this.slackService.updateMessage(state.config, {
        channel: String(container.channel_id),
        ts: String(container.message_ts),
        text: `${issue.issueKey} 承認済み`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*承認済み* ${issue.issueKey}\n${issue.title}\n承認者: <@${String(user.id ?? "")}>`
            }
          }
        ]
      });
    }
    await this.updateBacklogStatusIfPossible(state.config, nextIssue, "Resolved");
    await this.requestStamp(nextIssue.id);
    await this.pushEvent("status-changed", `${issue.issueKey} approved from Slack`);
  }

  private async rejectIssueFromSlack(issueId: string, reason: string, payload: Record<string, unknown>): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      return;
    }
    const user = (payload.user as Record<string, unknown> | undefined) ?? {};
    const nextIssue: IssueRecord = {
      ...this.withApprovalPayload(issue, {
        rejected_at: new Date().toISOString(),
        rejected_reason: reason,
        approval_status: "rejected",
        rejected_by_slack_id: String(user.id ?? "")
      }),
      previousStatus: issue.status,
      status: "Fixed",
      updatedAt: new Date().toISOString()
    };
    await this.saveIssue(nextIssue);
    const channel = this.getApprovalValue(issue, "approval_channel");
    const ts = this.getApprovalValue(issue, "approval_slack_ts");
    if (channel && ts) {
      await this.slackService.updateMessage(state.config, {
        channel,
        ts,
        text: `${issue.issueKey} 否認`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*否認* ${issue.issueKey}\n${issue.title}\n理由: ${reason || "(未入力)"}`
            }
          }
        ]
      });
    }
    await this.updateBacklogStatusIfPossible(state.config, nextIssue, "In Progress");
    await this.pushEvent("status-changed", `${issue.issueKey} rejected from Slack`);
  }

  private async completeStampFromSlack(issueId: string, payload: Record<string, unknown>): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      return;
    }
    const user = (payload.user as Record<string, unknown> | undefined) ?? {};
    const container = (payload.container as Record<string, unknown> | undefined) ?? {};
    const nextIssue: IssueRecord = {
      ...this.withApprovalPayload(issue, {
        stamp_status: "completed",
        stamp_completed_at: new Date().toISOString(),
        stamp_completed_by_slack_id: String(user.id ?? "")
      }),
      previousStatus: issue.status,
      status: "Completed",
      updatedAt: new Date().toISOString()
    };
    await this.saveIssue(nextIssue);
    if (container.channel_id && container.message_ts) {
      await this.slackService.updateMessage(state.config, {
        channel: String(container.channel_id),
        ts: String(container.message_ts),
        text: `${issue.issueKey} 押印完了`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*押印完了* ${issue.issueKey}\n${issue.title}\n対応者: <@${String(user.id ?? "")}>`
            }
          }
        ]
      });
    }
    await this.updateBacklogStatusIfPossible(state.config, nextIssue, "Closed");
    await this.pushEvent("status-changed", `${issue.issueKey} stamp completed`);
  }

  private async markStampPhysical(issueId: string, payload: Record<string, unknown>): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      return;
    }
    const user = (payload.user as Record<string, unknown> | undefined) ?? {};
    const nextIssue: IssueRecord = {
      ...this.withApprovalPayload(issue, {
        stamp_method: "physical",
        stamp_status: "physical_requested",
        stamp_requested_by_slack_id: String(user.id ?? "") || this.getApprovalValue(issue, "stamp_requested_by_slack_id"),
        stamp_physical_selected_at: new Date().toISOString()
      }),
      updatedAt: new Date().toISOString()
    };
    await this.saveIssue(nextIssue);
    await this.updateBacklogStatusIfPossible(state.config, nextIssue, "物理押印依頼中");
    await this.pushEvent("status-changed", `${issue.issueKey} physical stamp selected`);
  }

  private async markStampPending(issueId: string): Promise<void> {
    const state = await this.store.load();
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue) {
      return;
    }
    const nextIssue = this.withApprovalPayload(issue, {
      stamp_status: this.getApprovalValue(issue, "stamp_method") === "cloudsign" ? "cloudsign_pending" : "requested",
      stamp_reminded_at: new Date().toISOString()
    });
    await this.saveIssue(nextIssue);
    await this.pushEvent("status-changed", `${issue.issueKey} stamp kept pending`);
  }

  private findLatestDocumentForIssue(documents: DocumentRecord[], issueId: string): DocumentRecord | undefined {
    return documents
      .filter((item) => item.issueId === issueId && item.pdfPath)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  private resolveCounterpartyEmail(issue: IssueRecord): string {
    return (
      this.getApprovalValue(issue, "counterpartyEmail") ||
      this.getApprovalValue(issue, "vendorEmail") ||
      this.getApprovalValue(issue, "partnerEmail")
    );
  }

  private resolveCounterpartyName(issue: IssueRecord): string {
    return (
      this.getApprovalValue(issue, "vendorContactName") ||
      this.getApprovalValue(issue, "counterpartyName") ||
      this.getApprovalValue(issue, "vendorName") ||
      issue.requester
    );
  }

  private normalizeCloudSignStatus(document: CloudSignDocument): string {
    const raw = String(document.status ?? "");
    if (raw === "3") {
      return "declined";
    }
    if (raw === "2") {
      return "completed";
    }
    if (raw === "1") {
      return "cloudsign_sent";
    }
    return raw ? `status_${raw}` : "unknown";
  }

  private async finalizeCloudSignIssue(
    config: AppConfig,
    issue: IssueRecord,
    documentId: string,
    document: CloudSignDocument
  ): Promise<IssueRecord> {
    const latestFile = Array.isArray(document.files) ? document.files[document.files.length - 1] : undefined;
    const fileId = String(latestFile?.id ?? "");
    const signedPdf = fileId ? await this.cloudSignService.downloadSignedFile(config, documentId, fileId) : undefined;
    const certificate = await this.cloudSignService.downloadCertificate(config, documentId);
    const signedPdfPath = signedPdf
      ? path.join(process.cwd(), "tmp", `${issue.contractNo ?? issue.issueKey}_signed_${Date.now()}.pdf`)
      : "";
    const certificatePath = path.join(process.cwd(), "tmp", `${issue.contractNo ?? issue.issueKey}_certificate_${Date.now()}.pdf`);

    if (signedPdf && signedPdfPath) {
      await writeFile(signedPdfPath, signedPdf);
    }
    await writeFile(certificatePath, certificate);

    const signedAt = new Date().toISOString();
    const nextIssue: IssueRecord = {
      ...this.withApprovalPayload(issue, {
        stamp_method: "cloudsign",
        stamp_status: "completed",
        cloudsign_status: "completed",
        cloudsign_completed_at: signedAt,
        signed_at: signedAt,
        signed_pdf_path: signedPdfPath || undefined,
        cloudsign_certificate_path: certificatePath,
        cloudsign_file_id: fileId || undefined
      }),
      previousStatus: issue.status,
      status: "Completed",
      updatedAt: signedAt
    };

    const state = await this.store.load();
    const signedDocument: DocumentRecord | undefined =
      signedPdf && signedPdfPath
        ? {
            id: `doc-signed-${Date.now()}`,
            issueId: issue.id,
            issueKey: issue.issueKey,
            templateKey: issue.templateKey,
            fileName: path.basename(signedPdfPath),
            htmlPath: this.findLatestDocumentForIssue(state.documents, issue.id)?.htmlPath ?? signedPdfPath,
            pdfPath: signedPdfPath,
            driveFolderName: `${issue.contractNo ?? issue.issueKey}_signed`,
            driveStatus: "pending",
            contractNo: issue.contractNo,
            createdAt: signedAt
          }
        : undefined;
    const certificateDocument: DocumentRecord = {
      id: `doc-cert-${Date.now()}`,
      issueId: issue.id,
      issueKey: issue.issueKey,
      templateKey: issue.templateKey,
      fileName: path.basename(certificatePath),
      htmlPath: certificatePath,
      pdfPath: certificatePath,
      driveFolderName: `${issue.contractNo ?? issue.issueKey}_signed`,
      driveStatus: "pending",
      contractNo: issue.contractNo,
      createdAt: signedAt
    };

    if (signedDocument) {
      state.documents.unshift(signedDocument);
      await this.registryService.recordDocumentLifecycle(nextIssue, signedDocument);
    }
    state.documents.unshift(certificateDocument);
    await this.registryService.recordDocumentLifecycle(nextIssue, certificateDocument);
    await this.store.saveDocuments(state.documents);
    await this.updateBacklogStatusIfPossible(config, nextIssue, "締結済");

    const channel = this.getApprovalValue(issue, "stamp_channel") || config.legalSlackChannel;
    if (channel) {
      await this.slackService.postMessage(
        config,
        `${issue.issueKey} の CloudSign 締結が完了しました。${signedPdfPath ? ` signed=${path.basename(signedPdfPath)}` : ""}`,
        channel
      );
    }

    await this.pushEvent("document-generated", `${issue.issueKey} CloudSign completed`);
    return nextIssue;
  }

  private async openRejectModal(issueId: string, triggerId: string): Promise<void> {
    await this.slackService.openModal(triggerId, {
      type: "modal",
      callback_id: "reject_issue_modal",
      private_metadata: issueId,
      title: { type: "plain_text", text: "否認理由" },
      submit: { type: "plain_text", text: "送信" },
      close: { type: "plain_text", text: "キャンセル" },
      blocks: [
        {
          type: "input",
          block_id: "reason_block",
          label: { type: "plain_text", text: "理由" },
          element: {
            type: "plain_text_input",
            action_id: "reason_input",
            multiline: true
          }
        }
      ]
    });
  }

  private withApprovalPayload(issue: IssueRecord, patch: Record<string, unknown>): IssueRecord {
    return {
      ...issue,
      payload: {
        ...issue.payload,
        ...patch
      },
      updatedAt: new Date().toISOString()
    };
  }

  private getApprovalStatus(issue: IssueRecord): string {
    return this.getApprovalValue(issue, "approval_status");
  }

  private getApprovalValue(issue: IssueRecord, key: string): string {
    const value = issue.payload[key];
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }

  private async saveIssue(nextIssue: IssueRecord): Promise<void> {
    const state = await this.store.load();
    const previousIssue = state.issues.find((item) => item.id === nextIssue.id);
    state.issues = state.issues.map((item) => (item.id === nextIssue.id ? nextIssue : item));
    await this.store.saveIssues(state.issues);
    await this.registryService.recordIssueState(nextIssue);
    await this.notifyStatusChangeIfNeeded(state.config, state.users, previousIssue, nextIssue);
  }

  private async updateBacklogStatusIfPossible(
    config: AppConfig,
    issue: IssueRecord,
    targetStatusName: string
  ): Promise<void> {
    if (!this.backlogService.isConfigured(config)) {
      return;
    }
    try {
      await this.backlogService.updateIssueStatus(
        config,
        {
          issueKey: issue.issueKey || undefined,
          backlogIssueId: issue.payload.backlogIssueId as number | string | undefined
        },
        targetStatusName
      );
    } catch (error) {
      await this.pushEvent(
        "status-changed",
        `${issue.issueKey} backlog status update skipped: ${error instanceof Error ? error.message : "unknown"}`
      );
    }
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

  private async notifyStatusChangeIfNeeded(
    config: AppConfig,
    users: AdminUser[],
    previousIssue: IssueRecord | undefined,
    nextIssue: IssueRecord
  ): Promise<void> {
    if (!previousIssue || previousIssue.status === nextIssue.status || !this.slackService.isConfigured(config)) {
      return;
    }

    const before = this.toStatusLabel(previousIssue.status);
    const after = this.toStatusLabel(nextIssue.status);
    const legalChannel = config.legalSlackChannel || process.env.LEGAL_SLACK_CHANNEL || "";
    const legalLines = this.buildLegalStatusNotificationLines(previousIssue, nextIssue, before, after);

    if (legalChannel) {
      await this.slackService.postMessage(config, legalLines.join("\n"), legalChannel);
    }

    const requesterSlackId = this.resolveRequesterSlackId(nextIssue, users);
    if (!requesterSlackId) {
      return;
    }

    const requesterLines = this.buildRequesterStatusNotificationLines(nextIssue, after);
    await this.slackService.postMessage(config, requesterLines.join("\n"), requesterSlackId);
  }

  private resolveRequesterSlackId(issue: IssueRecord, users: AdminUser[]): string {
    const direct =
      this.getApprovalValue(issue, "requester_slack_id") ||
      this.getApprovalValue(issue, "requesterSlackId") ||
      this.getApprovalValue(issue, "slack_id") ||
      this.getApprovalValue(issue, "requesterSlack");
    if (direct) {
      return direct;
    }

    const matchedUser = users.find(
      (user) =>
        user.name === issue.requester ||
        user.google_email === issue.requester ||
        user.slack_id === issue.requester ||
        this.getApprovalValue(issue, "requester_email") === user.google_email ||
        this.getApprovalValue(issue, "requesterEmail") === user.google_email ||
        this.getApprovalValue(issue, "requester_name") === user.name ||
        this.getApprovalValue(issue, "requesterName") === user.name
    );
    return matchedUser?.slack_id ?? "";
  }

  private withResolvedRequesterSlackId(issue: IssueRecord, users: AdminUser[]): IssueRecord {
    const requesterSlackId = this.resolveRequesterSlackId(issue, users);
    if (!requesterSlackId || this.getApprovalValue(issue, "requester_slack_id") === requesterSlackId) {
      return issue;
    }
    return {
      ...issue,
      payload: {
        ...issue.payload,
        requester_slack_id: requesterSlackId
      },
      updatedAt: new Date().toISOString()
    };
  }

  private resolveRequesterSlackIdFromPayload(
    requester: string,
    payload: Record<string, unknown>,
    users: AdminUser[]
  ): string {
    const direct = [
      payload.requester_slack_id,
      payload.requesterSlackId,
      payload.slack_id,
      payload.requesterSlack
    ]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean);
    if (direct) {
      return direct;
    }

    const requesterName =
      (typeof payload.requester_name === "string" && payload.requester_name.trim()) ||
      (typeof payload.requesterName === "string" && payload.requesterName.trim()) ||
      requester;
    const requesterEmail =
      (typeof payload.requester_email === "string" && payload.requester_email.trim()) ||
      (typeof payload.requesterEmail === "string" && payload.requesterEmail.trim()) ||
      "";

    const matchedUser = users.find(
      (user) =>
        user.slack_id === requester ||
        user.name === requester ||
        user.google_email === requester ||
        (requesterName ? user.name === requesterName : false) ||
        (requesterEmail ? user.google_email === requesterEmail : false)
    );
    return matchedUser?.slack_id ?? "";
  }

  private toStatusLabel(status: IssueStatus): string {
    return statusLabelMap[status] ?? status;
  }

  private buildLegalStatusNotificationLines(
    previousIssue: IssueRecord,
    nextIssue: IssueRecord,
    before: string,
    after: string
  ): string[] {
    return [
      `状態変更: ${nextIssue.issueKey}`,
      `件名: ${nextIssue.title}`,
      `変更: ${before} -> ${after}`,
      `内容: ${legalStatusMessageMap[nextIssue.status] ?? "状態が更新されました。"}`,
      `テンプレート: ${nextIssue.templateKey}`,
      `申請者: ${nextIssue.requester}`,
      `担当者: ${nextIssue.assignee}`
    ];
  }

  private buildRequesterStatusNotificationLines(nextIssue: IssueRecord, after: string): string[] {
    const lines = [
      `申請案件 ${nextIssue.issueKey} の状態が更新されました。`,
      `件名: ${nextIssue.title}`,
      `現在状態: ${after}`,
      requesterStatusMessageMap[nextIssue.status] ?? "詳細は法務担当に確認してください。"
    ];
    if (nextIssue.status === "Fixed") {
      const reason = this.getApprovalValue(nextIssue, "rejected_reason");
      if (reason) {
        lines.push(`差戻し理由: ${reason}`);
      }
    }
    return lines;
  }
}
