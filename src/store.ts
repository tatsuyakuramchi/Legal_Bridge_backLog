import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultConfig,
  defaultContractSequences,
  defaultContracts,
  defaultDeliveries,
  defaultDocuments,
  defaultEvents,
  defaultIssues,
  defaultPartners,
  defaultPollingLogs,
  defaultUsers
} from "./defaultData.js";
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

type StoreShape = {
  config: AppConfig;
  issues: IssueRecord[];
  documents: DocumentRecord[];
  events: WorkflowEvent[];
  users: AdminUser[];
  partners: PartnerRecord[];
  contracts: ContractRecord[];
  deliveries: DeliveryRecord[];
  pollingLogs: PollingLogRecord[];
  contractSequences: ContractSequenceRecord[];
};

const templateAliases: Record<string, string> = {
  contract: "template_service_basic",
  purchase_order: "template_order",
  payment_notice: "template_payment_notice",
  delivery_request: "template_inspection_report",
  royalty_report: "template_royalty_report"
};

export class JsonStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async ensure(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await this.writeIfMissing("config.json", defaultConfig);
    await this.writeIfMissing("issues.json", defaultIssues);
    await this.writeIfMissing("documents.json", defaultDocuments);
    await this.writeIfMissing("events.json", defaultEvents);
    await this.writeIfMissing("users.json", defaultUsers);
    await this.writeIfMissing("partners.json", defaultPartners);
    await this.writeIfMissing("contracts.json", defaultContracts);
    await this.writeIfMissing("deliveries.json", defaultDeliveries);
    await this.writeIfMissing("polling-logs.json", defaultPollingLogs);
    await this.writeIfMissing("contract-sequences.json", defaultContractSequences);
  }

  async load(): Promise<StoreShape> {
    await this.ensure();
    const state = {
      config: await this.readJson<AppConfig>("config.json"),
      issues: await this.readJson<IssueRecord[]>("issues.json"),
      documents: await this.readJson<DocumentRecord[]>("documents.json"),
      events: await this.readJson<WorkflowEvent[]>("events.json"),
      users: await this.readJson<AdminUser[]>("users.json"),
      partners: await this.readJson<PartnerRecord[]>("partners.json"),
      contracts: await this.readJson<ContractRecord[]>("contracts.json"),
      deliveries: await this.readJson<DeliveryRecord[]>("deliveries.json"),
      pollingLogs: await this.readJson<PollingLogRecord[]>("polling-logs.json"),
      contractSequences: await this.readJson<ContractSequenceRecord[]>("contract-sequences.json")
    };
    return {
      ...state,
      issues: state.issues.map((issue) => ({
        ...issue,
        templateKey: templateAliases[issue.templateKey] ?? issue.templateKey
      })),
      documents: state.documents.map((document) => ({
        ...document,
        templateKey: templateAliases[document.templateKey] ?? document.templateKey
      })),
      users: state.users,
      partners: state.partners,
      contracts: state.contracts,
      deliveries: state.deliveries,
      pollingLogs: state.pollingLogs,
      contractSequences: state.contractSequences
    };
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.writeJson("config.json", config);
  }

  async saveIssues(issues: IssueRecord[]): Promise<void> {
    await this.writeJson("issues.json", issues);
  }

  async saveDocuments(documents: DocumentRecord[]): Promise<void> {
    await this.writeJson("documents.json", documents);
  }

  async saveEvents(events: WorkflowEvent[]): Promise<void> {
    await this.writeJson("events.json", events.slice(0, 200));
  }

  async saveUsers(users: AdminUser[]): Promise<void> {
    await this.writeJson("users.json", users);
  }

  async savePartners(partners: PartnerRecord[]): Promise<void> {
    await this.writeJson("partners.json", partners);
  }

  async saveContracts(contracts: ContractRecord[]): Promise<void> {
    await this.writeJson("contracts.json", contracts);
  }

  async saveDeliveries(deliveries: DeliveryRecord[]): Promise<void> {
    await this.writeJson("deliveries.json", deliveries);
  }

  async savePollingLogs(pollingLogs: PollingLogRecord[]): Promise<void> {
    await this.writeJson("polling-logs.json", pollingLogs.slice(0, 500));
  }

  async saveContractSequences(sequences: ContractSequenceRecord[]): Promise<void> {
    await this.writeJson("contract-sequences.json", sequences);
  }

  private filePath(name: string): string {
    return path.join(this.baseDir, name);
  }

  private async writeIfMissing(name: string, data: unknown): Promise<void> {
    try {
      await readFile(this.filePath(name), "utf8");
    } catch {
      await this.writeJson(name, data);
    }
  }

  private async readJson<T>(name: string): Promise<T> {
    const raw = await readFile(this.filePath(name), "utf8");
    return JSON.parse(raw) as T;
  }

  private async writeJson(name: string, data: unknown): Promise<void> {
    await writeFile(this.filePath(name), JSON.stringify(data, null, 2), "utf8");
  }
}
