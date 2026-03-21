import {
  AdminUser,
  AppConfig,
  ContractRecord,
  ContractSequenceRecord,
  DeliveryRecord,
  DocumentRecord,
  IssueRecord,
  PartnerRecord,
  PollingLogRecord,
  WorkflowEvent
} from "./types.js";

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
    title: "業務委託基本契約書のドラフト作成",
    requester: "営業部",
    assignee: "local-app",
    templateKey: "template_service_basic",
    status: "Draft",
    contractNo: "C-2026-0001",
    payload: {
      subject: "業務委託基本契約書",
      effectiveDate: "2026-03-21",
      counterpartyName: "株式会社サンプル",
      counterpartyAddress: "東京都港区芝公園1-2-3",
      counterpartyEmail: "contact@example.com",
      vendorRepresentative: "代表取締役 山田太郎",
      projectTitle: "2026年キャンペーン施策",
      paymentConditionSummary: "月末締め翌月末払い",
      remarks: "初回ドラフト作成用のサンプル案件",
      partyAName: "株式会社アークライト",
      partyAAddress: "東京都千代田区神田小川町1-1-1",
      partyARepresentative: "代表取締役 佐藤一郎",
      staffName: "営業部 山本恵",
      staffEmail: "yamamoto@example.com",
      staffPhone: "03-1234-5678"
    },
    createdAt: now,
    updatedAt: now
  },
  {
    id: "issue-2",
    issueKey: "LEGAL-102",
    title: "番組企画の発注書作成",
    requester: "制作部",
    assignee: "local-app",
    templateKey: "template_order",
    status: "ReviewRequested",
    contractNo: "PO-2026-0001",
    payload: {
      vendorName: "株式会社クリエイティブ",
      vendorAddress: "大阪府大阪市北区サンプル4-5-6",
      vendorEmail: "vendor@example.com",
      vendorContactName: "田中花子",
      vendorContactDepartment: "制作部",
      projectTitle: "2026年キャンペーン",
      orderDate: "2026-03-21",
      deliveryDate: "2026-04-05",
      paymentTerms: "月末締め翌月末払い",
      remarks: "発注書はPDFで納品",
      partyAName: "株式会社アークライト",
      partyAAddress: "東京都千代田区神田小川町1-1-1",
      partyARepresentative: "代表取締役 佐藤一郎",
      staffName: "制作部 鈴木健",
      staffEmail: "suzuki@example.com",
      staffPhone: "03-9876-5432",
      items: [
        {
          name: "動画制作費",
          spec: "制作一式",
          unitPrice: 300000,
          thisTimeQuantity: 1
        },
        {
          name: "編集調整費",
          spec: "1日想定",
          unitPrice: 180000,
          thisTimeQuantity: 1
        }
      ]
    },
    createdAt: now,
    updatedAt: now
  }
];

export const defaultDocuments: DocumentRecord[] = [];

export const defaultContracts: ContractRecord[] = [];

export const defaultDeliveries: DeliveryRecord[] = [];

export const defaultPollingLogs: PollingLogRecord[] = [];

export const defaultContractSequences: ContractSequenceRecord[] = [];

export const defaultEvents: WorkflowEvent[] = [
  {
    id: "event-1",
    type: "issue-created",
    message: "ローカルアプリの初期データを読み込みました。",
    createdAt: now
  }
];

export const defaultUsers: AdminUser[] = [
  {
    id: 1,
    name: "倉持 達也",
    department: "法務部",
    title: "法務責任者",
    slack_id: "U08217X0A07",
    google_email: "tatsuya@arclight.co.jp",
    is_legal_approver: true,
    is_business_approver: false,
    is_legal_staff: true,
    is_admin: true,
    is_active: true,
    notify_via_dm: true,
    notes: "初期管理ユーザー"
  },
  {
    id: 2,
    name: "総務 承認者",
    department: "総務部",
    title: "部長",
    slack_id: "U000GENERAL01",
    google_email: "somu@example.com",
    is_legal_approver: false,
    is_business_approver: true,
    is_legal_staff: false,
    is_admin: false,
    is_active: true,
    notify_via_dm: false,
    notification_channel: "C090WRVD1TM"
  },
  {
    id: 3,
    name: "法務 担当者",
    department: "法務部",
    title: "担当",
    slack_id: "U000LEGAL01",
    google_email: "legal.staff@example.com",
    is_legal_approver: false,
    is_business_approver: false,
    is_legal_staff: true,
    is_admin: false,
    is_active: true,
    notify_via_dm: true
  }
];

export const defaultPartners: PartnerRecord[] = [
  {
    id: 1,
    partner_code: "GK-001",
    name: "株式会社Gakken",
    name_kana: "カブシキガイシャガッケン",
    is_corporation: true,
    representative: "代表取締役 山田太郎",
    contact_person: "鈴木部長",
    contact_email: "suzuki@gakken.co.jp",
    contact_phone: "03-1111-2222",
    invoice_registration_number: "T1234567890123",
    is_invoice_issuer: true,
    bank_name: "三菱UFJ銀行",
    bank_branch: "新宿支店",
    bank_account_type: "普通",
    bank_account_number: "1234567",
    bank_account_holder: "カ)ガッケン",
    is_active: true,
    notes: "既存主要取引先"
  },
  {
    id: 2,
    partner_code: "IL-001",
    name: "田中 美咲",
    name_kana: "タナカ ミサキ",
    is_corporation: false,
    contact_person: "田中 美咲",
    contact_email: "misaki@example.com",
    contact_phone: "090-0000-1111",
    invoice_registration_number: "T9876543210987",
    is_invoice_issuer: true,
    bank_name: "ゆうちょ銀行",
    bank_branch: "〇一八",
    bank_account_type: "普通",
    bank_account_number: "00120345",
    bank_account_holder: "タナカ ミサキ",
    is_active: true
  },
  {
    id: 3,
    partner_code: "KD-001",
    name: "株式会社KADOKAWA",
    name_kana: "カブシキガイシャカドカワ",
    is_corporation: true,
    representative: "代表取締役 佐々木一郎",
    contact_person: "佐々木 恵",
    contact_email: "sasaki@kadokawa.co.jp",
    contact_phone: "03-2222-3333",
    invoice_registration_number: "T1111111111111",
    is_invoice_issuer: true,
    bank_name: "みずほ銀行",
    bank_branch: "渋谷支店",
    bank_account_type: "普通",
    bank_account_number: "7654321",
    bank_account_holder: "カ)カドカワ",
    is_active: true
  }
];
