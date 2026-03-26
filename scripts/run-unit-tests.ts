import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BulkOrderService } from "../src/services/bulkOrderService.js";
import { BacklogSetupService } from "../src/services/backlogSetupService.js";
import { RegistryService } from "../src/services/registryService.js";
import { WorkflowService } from "../src/services/workflowService.js";
import { JsonStore } from "../src/store.js";
import { ManagedTemplateDefinition } from "../src/templateManagerTypes.js";
import { AppConfig, DocumentRecord, IssueRecord } from "../src/types.js";

type TestResult = {
  name: string;
  status: "passed" | "failed";
  durationMs: number;
  details?: string;
};

class FakeSlackService {
  public blockPosts: Array<Record<string, unknown>> = [];
  public messages: Array<Record<string, unknown>> = [];
  public updates: Array<Record<string, unknown>> = [];
  public modals: Array<Record<string, unknown>> = [];

  isConfigured(_config: AppConfig): boolean {
    return true;
  }

  async postBlocks(config: AppConfig, input: { text: string; channel?: string; blocks?: Array<Record<string, unknown>> }) {
    const payload = {
      channel: input.channel ?? config.legalSlackChannel,
      text: input.text,
      blocks: input.blocks ?? []
    };
    this.blockPosts.push(payload);
    return { ok: true as const, channel: String(payload.channel), ts: `ts-${this.blockPosts.length}` };
  }

  async postMessage(config: AppConfig, text: string, channel?: string) {
    const payload = { channel: channel ?? config.legalSlackChannel, text };
    this.messages.push(payload);
    return { ok: true as const, channel: String(payload.channel), ts: `msg-${this.messages.length}` };
  }

  async updateMessage(_config: AppConfig, input: { channel: string; ts: string; text: string; blocks?: Array<Record<string, unknown>> }) {
    this.updates.push(input);
    return { ok: true as const, channel: input.channel, ts: input.ts };
  }

  async openModal(triggerId: string, view: Record<string, unknown>) {
    this.modals.push({ triggerId, view });
  }

  async getFileInfo(fileId: string): Promise<Record<string, unknown>> {
    return {
      id: fileId,
      name: "signed-contract.pdf",
      url_private_download: "https://example.invalid/files/signed-contract.pdf"
    };
  }
}

class FakeBacklogService {
  public statusUpdates: Array<{ issueKey?: string; backlogIssueId?: number | string; targetStatusName: string }> = [];

  isConfigured(_config: AppConfig): boolean {
    return false;
  }

  async updateIssueStatus(
    _config: AppConfig,
    issue: { issueKey?: string; backlogIssueId?: number | string },
    targetStatusName: string
  ) {
    this.statusUpdates.push({ ...issue, targetStatusName });
    return { ok: true as const, statusName: targetStatusName };
  }

  async fetchIssues(): Promise<IssueRecord[]> {
    return [];
  }

  async testConnection() {
    return { ok: true as const, project: { id: 1, projectKey: "LEGAL", name: "LEGAL" } };
  }
}

class FakeCloudSignService {
  isConfigured(_config: AppConfig): boolean {
    return true;
  }

  async testConnection() {
    return { ok: true as const, baseUrl: "https://api-sandbox.cloudsign.jp" };
  }

  async createDocument() {
    return { id: "cs-doc-1", status: 1 };
  }

  async addFile() {
    return { ok: true };
  }

  async addParticipant() {
    return { ok: true };
  }

  async sendDocument() {
    return { ok: true };
  }

  async getDocument() {
    return { id: "cs-doc-1", status: 2, files: [{ id: "file-1", name: "signed.pdf" }] };
  }

  async downloadSignedFile() {
    return new Uint8Array([1, 2, 3]);
  }

  async downloadCertificate() {
    return new Uint8Array([4, 5, 6]);
  }
}

class FakeGoogleDriveService {
  isConfigured(): boolean {
    return false;
  }

  async testConnection() {
    return { ok: true as const, rootFolderId: "root-folder" };
  }

  async uploadDocument(_config: AppConfig, document: DocumentRecord) {
    return {
      fileUrl: `https://drive.google.com/file/d/${document.id}/view`,
      folderUrl: "https://drive.google.com/drive/folders/root-folder"
    };
  }
}

class FakeDocumentService {
  async generate(issue: IssueRecord): Promise<DocumentRecord> {
    return {
      id: `doc-${issue.id}`,
      issueId: issue.id,
      issueKey: issue.issueKey,
      templateKey: issue.templateKey,
      fileName: `${issue.issueKey}.pdf`,
      htmlPath: `C:\\tmp\\${issue.issueKey}.html`,
      pdfPath: `C:\\tmp\\${issue.issueKey}.pdf`,
      driveFolderName: `${issue.contractNo ?? issue.issueKey}_${issue.issueKey}`,
      driveStatus: "pending",
      contractNo: issue.contractNo ?? "C-2099-0001",
      createdAt: new Date().toISOString()
    };
  }

  async mergePdfDocuments(_pdfPaths: string[], outputFileName: string): Promise<string> {
    return `C:\\tmp\\${outputFileName}`;
  }
}

class FakeTemplateManagerService {
  constructor(private readonly definitions: ManagedTemplateDefinition[] = []) {}

  async listDefinitions(): Promise<ManagedTemplateDefinition[]> {
    return this.definitions;
  }

  async validateAll() {
    return [];
  }

  async createDefinition(input: Omit<ManagedTemplateDefinition, "variables" | "topLevelVars"> & { notes?: string }) {
    return {
      ...input,
      variables: [],
      topLevelVars: []
    } as ManagedTemplateDefinition;
  }
}

class FakeBacklogSetupService {
  createReport(definition: ManagedTemplateDefinition) {
    return {
      templateId: definition.id,
      documentName: definition.documentName,
      issueTypes: definition.issueTypes,
      newAttributes: [],
      commonAttributesNote: "",
      statusesNote: ""
    };
  }

  createInitialChecklist() {
    return "# checklist";
  }

  renderReport() {
    return "# report";
  }
}

async function createStoreContext() {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "legal-bridge-unit-"));
  const store = new JsonStore(baseDir);
  await store.ensure();
  const state = await store.load();
  const config: AppConfig = {
    ...state.config,
    legalSlackChannel: "CLEGAL",
    approverSlackId: "UAPPROVER",
    lastSavedAt: new Date().toISOString()
  };
  await store.saveConfig(config);
  return { baseDir, store };
}

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const started = Date.now();
  try {
    await fn();
    return { name, status: "passed", durationMs: Date.now() - started };
  } catch (error) {
    return {
      name,
      status: "failed",
      durationMs: Date.now() - started,
      details: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
}

const tests: Array<() => Promise<TestResult>> = [];

tests.push(() =>
  runTest("BulkOrderService parses valid CSV rows", async () => {
    const service = new BulkOrderService();
    const csv = [
      "vendor_name,project_title,delivery_date,unit_price,quantity,description,payment_terms,notes,has_base_contract",
      "Vendor A,Project Alpha,2026-05-31,50000,3,Artwork production,End of next month,Priority,true"
    ].join("\n");
    const result = service.parse(csv);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].payload.hasBaseContract, true);
    assert.equal(result.rows[0].payload.items instanceof Array, true);
    assert.equal((result.rows[0].payload.items as Array<Record<string, unknown>>)[0].amount, 150000);
  })
);

tests.push(() =>
  runTest("BulkOrderService returns validation errors for invalid CSV", async () => {
    const service = new BulkOrderService();
    const csv = [
      "vendor_name,project_title,delivery_date,unit_price,quantity,description,has_base_contract",
      "Vendor B,Project Beta,2026/05/31,abc,0,Planning,maybe"
    ].join("\n");
    const result = service.parse(csv);
    assert.equal(result.rows.length, 0);
    assert.ok(result.errors.length >= 3);
    assert.ok(result.errors.some((error) => error.message.includes("delivery_date")));
  })
);

tests.push(() =>
  runTest("BacklogSetupService checklist includes issue types and new attributes", async () => {
    const service = new BacklogSetupService();
    const definition: ManagedTemplateDefinition = {
      id: "order_standard",
      templateFile: "template_order.html",
      documentName: "発注書",
      issueTypes: ["発注書"],
      contractNoPrefix: "PO",
      variables: [],
      topLevelVars: [
        {
          name: "PAYMENT_METHOD",
          label: "支払方法",
          required: true,
          source: "backlog.payment_method"
        }
      ]
    };
    const report = service.createReport(definition);
    const checklist = service.createInitialChecklist([definition]);
    assert.equal(report.newAttributes.length, 1);
    assert.equal(report.newAttributes[0].name, "支払方法");
    assert.ok(checklist.includes("発注書"));
  })
);

tests.push(() =>
  runTest("RegistryService assigns sequential contract numbers", async () => {
    const { store } = await createStoreContext();
    const registry = new RegistryService(store);
    const issueA = (await store.load()).issues[0];
    const issueB = { ...issueA, id: "issue-x", issueKey: "LEGAL-999", templateKey: "template_order", contractNo: undefined };
    const nextA = await registry.ensureContractNumber({ ...issueA, contractNo: undefined, templateKey: "template_order" });
    const nextB = await registry.ensureContractNumber(issueB);
    assert.ok(nextA.contractNo?.startsWith("PO-"));
    assert.ok(nextB.contractNo?.startsWith("PO-"));
    assert.notEqual(nextA.contractNo, nextB.contractNo);
  })
);

tests.push(() =>
  runTest("RegistryService records contracts and deliveries after document generation", async () => {
    const { store } = await createStoreContext();
    const registry = new RegistryService(store);
    const state = await store.load();
    const issue = {
      ...state.issues[0],
      contractNo: "C-2026-0007",
      templateKey: "template_inspection_report",
      payload: {
        ...state.issues[0].payload,
        payment_type: "INSPECTION",
        approval_status: "approved",
        stamp_status: "requested"
      }
    };
    const document: DocumentRecord = {
      id: "doc-1",
      issueId: issue.id,
      issueKey: issue.issueKey,
      templateKey: issue.templateKey,
      fileName: "doc.pdf",
      htmlPath: "C:\\tmp\\doc.html",
      pdfPath: "C:\\tmp\\doc.pdf",
      driveFolderName: "C-2026-0007_LEGAL-101",
      driveStatus: "pending",
      contractNo: issue.contractNo,
      createdAt: new Date().toISOString()
    };

    await registry.recordDocumentLifecycle(issue, document);
    const next = await store.load();
    assert.equal(next.contracts.length, 1);
    assert.equal(next.deliveries.length, 1);
    assert.equal(next.contracts[0].contract_no, "C-2026-0007");
    assert.equal(next.deliveries[0].delivery_type, "INSPECTION");
  })
);

tests.push(() =>
  runTest("WorkflowService requests approval and persists Slack metadata", async () => {
    const { store } = await createStoreContext();
    const slack = new FakeSlackService();
    const workflow = new WorkflowService(
      store,
      new FakeDocumentService() as never,
      new FakeGoogleDriveService() as never,
      new FakeBacklogService() as never,
      new FakeCloudSignService() as never,
      slack as never,
      new FakeTemplateManagerService() as never,
      new FakeBacklogSetupService() as never
    );

    const state = await store.load();
    const result = await workflow.requestIssueApproval(state.issues[0].id);
    const next = await store.load();
    const issue = next.issues.find((item) => item.id === state.issues[0].id);

    assert.equal(result.ok, true);
    assert.equal(slack.blockPosts.length, 1);
    assert.equal(issue?.payload.approval_status, "pending");
    assert.equal(issue?.payload.approval_channel, "CLEGAL");
  })
);

tests.push(() =>
  runTest("WorkflowService approve interaction updates status and triggers stamp request", async () => {
    const { store } = await createStoreContext();
    const slack = new FakeSlackService();
    const workflow = new WorkflowService(
      store,
      new FakeDocumentService() as never,
      new FakeGoogleDriveService() as never,
      new FakeBacklogService() as never,
      new FakeCloudSignService() as never,
      slack as never,
      new FakeTemplateManagerService() as never,
      new FakeBacklogSetupService() as never
    );

    const state = await store.load();
    await workflow.requestIssueApproval(state.issues[0].id);
    await workflow.handleSlackInteraction({
      type: "block_actions",
      user: { id: "UAPPROVER" },
      container: { channel_id: "CLEGAL", message_ts: "ts-1" },
      actions: [{ action_id: "approve_issue", value: state.issues[0].id }]
    });

    const next = await store.load();
    const issue = next.issues.find((item) => item.id === state.issues[0].id);
    assert.equal(issue?.status, "Approved");
    assert.equal(issue?.payload.approval_status, "approved");
    assert.equal(issue?.payload.stamp_status, "requested");
    assert.ok(slack.updates.length >= 1);
    assert.ok(slack.blockPosts.length >= 2);
  })
);

tests.push(() =>
  runTest("WorkflowService file_shared event stores uploaded stamp file info", async () => {
    const { store } = await createStoreContext();
    const slack = new FakeSlackService();
    const workflow = new WorkflowService(
      store,
      new FakeDocumentService() as never,
      new FakeGoogleDriveService() as never,
      new FakeBacklogService() as never,
      new FakeCloudSignService() as never,
      slack as never,
      new FakeTemplateManagerService() as never,
      new FakeBacklogSetupService() as never
    );

    const state = await store.load();
    const target = {
      ...state.issues[0],
      payload: {
        ...state.issues[0].payload,
        stamp_slack_ts: "thread-123",
        stamp_channel: "CLEGAL"
      }
    };
    await store.saveIssues(state.issues.map((item) => (item.id === target.id ? target : item)));

    await workflow.handleSlackEvent({
      type: "file_shared",
      event: {
        file_id: "F123",
        thread_ts: "thread-123"
      },
      envelope: {}
    });

    const next = await store.load();
    const issue = next.issues.find((item) => item.id === target.id);
    assert.equal(issue?.payload.stamp_file_id, "F123");
    assert.equal(issue?.payload.stamp_status, "file_received");
    assert.equal(slack.messages.length, 1);
  })
);

async function main() {
  const results: TestResult[] = [];
  for (const test of tests) {
    results.push(await test());
  }

  const passed = results.filter((result) => result.status === "passed");
  const failed = results.filter((result) => result.status === "failed");
  const reportLines = [
    "# Unit Test Results",
    "",
    `- Date: ${new Date().toLocaleString("ja-JP")}`,
    `- Total: ${results.length}`,
    `- Passed: ${passed.length}`,
    `- Failed: ${failed.length}`,
    "",
    "## Details",
    "",
    ...results.map((result) => {
      const lines = [
        `### ${result.status === "passed" ? "PASS" : "FAIL"}: ${result.name}`,
        "",
        `- Duration: ${result.durationMs} ms`
      ];
      if (result.details) {
        lines.push("- Error:");
        lines.push("");
        lines.push("```text");
        lines.push(result.details);
        lines.push("```");
      }
      lines.push("");
      return lines.join("\n");
    })
  ];

  const reportDir = path.join(process.cwd(), "reports");
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "unit-test-results.md");
  await writeFile(reportPath, reportLines.join("\n"), "utf8");

  const summary = await readFile(reportPath, "utf8");
  console.log(summary);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
