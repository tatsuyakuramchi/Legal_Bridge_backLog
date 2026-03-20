export type IssueStatus =
  | "Draft"
  | "ReviewRequested"
  | "Approved"
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
  templates: TemplateDefinition[];
}
