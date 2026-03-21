export type IssueStatus =
  | "Draft"
  | "ReviewRequested"
  | "Approved"
  | "CounterpartyConfirmed"
  | "SigningRequested"
  | "Signed"
  | "Fixed"
  | "Completed";

export type TemplateKey = string;

export type SystemHealth = "ok" | "warn" | "error";

export interface AppConfig {
  appTitle: string;
  pollingIntervalSec: number;
  backlogSpace: string;
  backlogProjectId: string;
  driveRootFolderId: string;
  approverSlackId: string;
  legalSlackChannel: string;
  lastSavedAt: string;
}

export interface AdminUser {
  id: number;
  name: string;
  department: string;
  title: string;
  slack_id: string;
  google_email: string;
  is_legal_approver: boolean;
  is_business_approver: boolean;
  is_legal_staff: boolean;
  is_admin: boolean;
  is_active: boolean;
  notify_via_dm: boolean;
  notification_channel?: string;
  notes?: string;
}

export interface PartnerRecord {
  id: number;
  partner_code: string;
  name: string;
  name_kana?: string;
  is_corporation: boolean;
  representative?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  invoice_registration_number?: string;
  is_invoice_issuer: boolean;
  bank_name?: string;
  bank_branch?: string;
  bank_account_type?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  is_active: boolean;
  notes?: string;
}

export interface ContractRecord {
  id: string;
  contract_no: string;
  issue_id: string;
  issue_key: string;
  title: string;
  template_key: TemplateKey;
  workflow_status: string;
  approval_status?: string;
  stamp_status?: string;
  counterparty_name?: string;
  partner_code?: string;
  parent_issue_key?: string;
  child_issue_keys: string[];
  drive_folder_name?: string;
  drive_file_url?: string;
  revision_no: number;
  created_at: string;
  updated_at: string;
}

export interface PollingLogRecord {
  id: string;
  started_at: string;
  finished_at: string;
  source: "backlog" | "mock" | "manual";
  fetched_count: number;
  created_count: number;
  updated_count: number;
  success: boolean;
  message: string;
}

export interface DeliveryRecord {
  id: string;
  contract_id?: string;
  issue_id: string;
  issue_key: string;
  delivery_type: string;
  status: string;
  requested_at: string;
  completed_at?: string;
  document_id?: string;
  drive_folder_name?: string;
  remarks?: string;
}

export interface ContractSequenceRecord {
  prefix: string;
  year: number;
  last_number: number;
  updated_at: string;
}

export interface AdminDashboardSnapshot {
  usersCount: number;
  activeUsersCount: number;
  partnersCount: number;
  activePartnersCount: number;
  legalApproverCount: number;
  recentDocumentsCount: number;
  contractsCount: number;
  pendingApprovalCount: number;
  pendingStampCount: number;
  deliveriesCount: number;
  pendingAlerts: Array<{
    label: string;
    date: string;
    days: number;
    level: "alert" | "warn" | "info";
  }>;
  recentLogs: Array<{
    time: string;
    text: string;
    success: boolean;
  }>;
}

export interface WorkflowEvent {
  id: string;
  type: "issue-created" | "status-changed" | "document-generated" | "poller-run";
  message: string;
  createdAt: string;
}

export interface IssueRecord {
  id: string;
  issueKey: string;
  title: string;
  requester: string;
  assignee: string;
  templateKey: TemplateKey;
  status: IssueStatus;
  previousStatus?: IssueStatus;
  contractNo?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  issueId: string;
  issueKey: string;
  templateKey: TemplateKey;
  fileName: string;
  htmlPath: string;
  pdfPath: string;
  driveFolderName: string;
  driveStatus: "pending" | "uploaded";
  contractNo?: string;
  createdAt: string;
}

export type BulkOrderOutputMode = "individual" | "merged" | "both";

export interface BulkOrderRowResult {
  rowNumber: number;
  issueId?: string;
  issueKey?: string;
  fileName?: string;
  pdfPath?: string;
  vendorName: string;
  projectTitle: string;
  status: "preview" | "generated" | "error";
  error?: string;
}

export interface BulkOrderImportResult {
  outputMode: BulkOrderOutputMode;
  totalRows: number;
  successCount: number;
  errorCount: number;
  mergedPdfPath?: string;
  mergedFileName?: string;
  backlogIssueCreationRequested: boolean;
  backlogIssueCreationSupported: boolean;
  rows: BulkOrderRowResult[];
}

export interface TemplateDefinition {
  key: TemplateKey;
  name: string;
  description: string;
  requiredFields: string[];
  fileName: string;
}

export interface DashboardSnapshot {
  config: AppConfig;
  health: {
    app: SystemHealth;
    backlog: SystemHealth;
    slack: SystemHealth;
    drive: SystemHealth;
    rds: SystemHealth;
  };
  issues: IssueRecord[];
  documents: DocumentRecord[];
  events: WorkflowEvent[];
  contracts?: ContractRecord[];
  pollingLogs?: PollingLogRecord[];
  deliveries?: DeliveryRecord[];
  templates: TemplateDefinition[];
  templateDefinitionsCount?: number;
}
