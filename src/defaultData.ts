import { AppConfig, DocumentRecord, IssueRecord, WorkflowEvent } from "./types.js";

const now = new Date().toISOString();

export const defaultConfig: AppConfig = {
  appTitle: "Legal Bridge Local App",
  pollingIntervalSec: 30,
  backlogSpace: "",
  backlogProjectId: "",
  driveRootFolderId: "",
  approverSlackId: "",
  legalSlackChannel: "",
  lastSavedAt: now
};

export const defaultIssues: IssueRecord[] = [
  {
    id: "issue-1",
    issueKey: "LEGAL-101",
    title: "基本契約書のドラフト作成",
    requester: "法務部",
    assignee: "local-app",
    templateKey: "template_service_basic",
    status: "Draft",
    contractNo: "CN-2026-0001",
    payload: {
      counterpartyName: "株式会社サンプル",
      subject: "業務委託基本契約",
      effectiveDate: "2026-03-21",
      amountExcludingTax: "1200000",
      approver_name: "法務責任者"
    },
    createdAt: now,
    updatedAt: now
  },
  {
    id: "issue-2",
    issueKey: "LEGAL-102",
    title: "番組案件の発注書発行",
    requester: "制作部",
    assignee: "local-app",
    templateKey: "template_order",
    status: "ReviewRequested",
    payload: {
      vendorName: "合同会社クリエイト",
      projectName: "2026春キャンペーン",
      items: [
        { name: "企画構成", unitPrice: "300000", thisTimeQuantity: "1", spec: "構成案一式" },
        { name: "撮影進行", unitPrice: "180000", thisTimeQuantity: "1", spec: "1日拘束" }
      ],
      person_name: "田中花子"
    },
    createdAt: now,
    updatedAt: now
  }
];

export const defaultDocuments: DocumentRecord[] = [];

export const defaultEvents: WorkflowEvent[] = [
  {
    id: "event-1",
    type: "issue-created",
    message: "ローカル初期データをロードしました。",
    createdAt: now
  }
];
