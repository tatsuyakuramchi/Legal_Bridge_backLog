import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfig, defaultDocuments, defaultEvents, defaultIssues } from "./defaultData.js";
import { AppConfig, DocumentRecord, IssueRecord, WorkflowEvent } from "./types.js";

type StoreShape = {
  config: AppConfig;
  issues: IssueRecord[];
  documents: DocumentRecord[];
  events: WorkflowEvent[];
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
  }

  async load(): Promise<StoreShape> {
    await this.ensure();
    const state = {
      config: await this.readJson<AppConfig>("config.json"),
      issues: await this.readJson<IssueRecord[]>("issues.json"),
      documents: await this.readJson<DocumentRecord[]>("documents.json"),
      events: await this.readJson<WorkflowEvent[]>("events.json")
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
      }))
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
