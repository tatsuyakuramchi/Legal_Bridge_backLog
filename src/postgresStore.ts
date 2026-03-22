import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { Pool } from "pg";
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
import { AppStore, JsonStore, StoreShape, normalizeStoreState } from "./store.js";

type PostgresStoreOptions = {
  jsonFallbackDir?: string;
};

type CollectionName =
  | "issues"
  | "documents"
  | "events"
  | "users"
  | "partners"
  | "contracts"
  | "deliveries"
  | "polling_logs"
  | "contract_sequences";

const defaultState: StoreShape = {
  config: defaultConfig,
  issues: defaultIssues,
  documents: defaultDocuments,
  events: defaultEvents,
  users: defaultUsers,
  partners: defaultPartners,
  contracts: defaultContracts,
  deliveries: defaultDeliveries,
  pollingLogs: defaultPollingLogs,
  contractSequences: defaultContractSequences
};

export class PostgresStore implements AppStore {
  readonly kind = "postgres" as const;
  private readonly pool: Pool;
  private readonly jsonFallbackDir?: string;

  constructor(options: PostgresStoreOptions = {}) {
    this.jsonFallbackDir = options.jsonFallbackDir;
    this.pool = new Pool({
      host: process.env.RDS_HOST,
      port: Number(process.env.RDS_PORT ?? 5432),
      database: process.env.RDS_DB,
      user: process.env.RDS_USER,
      password: process.env.RDS_PASSWORD,
      ssl: this.resolveSsl()
    });
  }

  static isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env.RDS_HOST && env.RDS_DB && env.RDS_USER && env.RDS_PASSWORD);
  }

  async ensure(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id SMALLINT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS issues (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS documents (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS events (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS partners (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS contracts (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS polling_logs (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS contract_sequences (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.seedDefaultsIfEmpty();
    await this.bootstrapFromJsonIfNeeded();
  }

  async load(): Promise<StoreShape> {
    await this.ensure();
    const [config, issues, documents, events, users, partners, contracts, deliveries, pollingLogs, contractSequences] =
      await Promise.all([
        this.loadConfig(),
        this.loadCollection<IssueRecord>("issues"),
        this.loadCollection<DocumentRecord>("documents"),
        this.loadCollection<WorkflowEvent>("events"),
        this.loadCollection<AdminUser>("users"),
        this.loadCollection<PartnerRecord>("partners"),
        this.loadCollection<ContractRecord>("contracts"),
        this.loadCollection<DeliveryRecord>("deliveries"),
        this.loadCollection<PollingLogRecord>("polling_logs"),
        this.loadCollection<ContractSequenceRecord>("contract_sequences")
      ]);

    return normalizeStoreState({
      config,
      issues,
      documents,
      events,
      users,
      partners,
      contracts,
      deliveries,
      pollingLogs,
      contractSequences
    });
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO app_config (id, data, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [JSON.stringify(config)]
    );
  }

  async saveIssues(issues: IssueRecord[]): Promise<void> {
    await this.replaceCollection("issues", issues, (item) => item.id);
  }

  async saveDocuments(documents: DocumentRecord[]): Promise<void> {
    await this.replaceCollection("documents", documents, (item) => item.id);
  }

  async saveEvents(events: WorkflowEvent[]): Promise<void> {
    await this.replaceCollection("events", events.slice(0, 200), (item) => item.id);
  }

  async saveUsers(users: AdminUser[]): Promise<void> {
    await this.replaceCollection("users", users, (item) => String(item.id));
  }

  async savePartners(partners: PartnerRecord[]): Promise<void> {
    await this.replaceCollection("partners", partners, (item) => String(item.id));
  }

  async saveContracts(contracts: ContractRecord[]): Promise<void> {
    await this.replaceCollection("contracts", contracts, (item) => item.id);
  }

  async saveDeliveries(deliveries: DeliveryRecord[]): Promise<void> {
    await this.replaceCollection("deliveries", deliveries, (item) => item.id);
  }

  async savePollingLogs(pollingLogs: PollingLogRecord[]): Promise<void> {
    await this.replaceCollection("polling_logs", pollingLogs.slice(0, 500), (item) => item.id);
  }

  async saveContractSequences(sequences: ContractSequenceRecord[]): Promise<void> {
    await this.replaceCollection(
      "contract_sequences",
      sequences,
      (item) => `${item.prefix}-${item.year}`
    );
  }

  async testConnection(): Promise<{ ok: boolean; kind: "postgres"; message: string }> {
    await this.pool.query("SELECT 1");
    return {
      ok: true,
      kind: "postgres",
      message: "PostgreSQL connection is available"
    };
  }

  private async loadConfig(): Promise<AppConfig> {
    const result = await this.pool.query<{ data: AppConfig }>("SELECT data FROM app_config WHERE id = 1");
    return result.rows[0]?.data ?? defaultConfig;
  }

  private async loadCollection<T>(table: CollectionName): Promise<T[]> {
    const result = await this.pool.query<{ data: T }>(
      `SELECT data FROM ${table} ORDER BY sort_index ASC, updated_at DESC, entity_key ASC`
    );
    return result.rows.map((row) => row.data);
  }

  private async replaceCollection<T>(
    table: CollectionName,
    items: T[],
    keyOf: (item: T) => string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM ${table}`);
      for (const [index, item] of items.entries()) {
        await client.query(
          `
            INSERT INTO ${table} (entity_key, sort_index, data, updated_at)
            VALUES ($1, $2, $3::jsonb, NOW())
          `,
          [keyOf(item), index, JSON.stringify(item)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedDefaultsIfEmpty(): Promise<void> {
    const configCount = await this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM app_config");
    if (Number(configCount.rows[0]?.count ?? 0) === 0) {
      await this.saveConfig(defaultConfig);
    }

    await this.seedCollectionIfEmpty("issues", defaultIssues, (item) => item.id);
    await this.seedCollectionIfEmpty("documents", defaultDocuments, (item) => item.id);
    await this.seedCollectionIfEmpty("events", defaultEvents, (item) => item.id);
    await this.seedCollectionIfEmpty("users", defaultUsers, (item) => String(item.id));
    await this.seedCollectionIfEmpty("partners", defaultPartners, (item) => String(item.id));
    await this.seedCollectionIfEmpty("contracts", defaultContracts, (item) => item.id);
    await this.seedCollectionIfEmpty("deliveries", defaultDeliveries, (item) => item.id);
    await this.seedCollectionIfEmpty("polling_logs", defaultPollingLogs, (item) => item.id);
    await this.seedCollectionIfEmpty(
      "contract_sequences",
      defaultContractSequences,
      (item) => `${item.prefix}-${item.year}`
    );
  }

  private async seedCollectionIfEmpty<T>(
    table: CollectionName,
    items: T[],
    keyOf: (item: T) => string
  ): Promise<void> {
    const result = await this.pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    if (Number(result.rows[0]?.count ?? 0) === 0 && items.length > 0) {
      await this.replaceCollection(table, items, keyOf);
    }
  }

  private async bootstrapFromJsonIfNeeded(): Promise<void> {
    if (!this.jsonFallbackDir || process.env.RDS_BOOTSTRAP_FROM_JSON === "false") {
      return;
    }

    const issuesCount = await this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM issues");
    const docsCount = await this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM documents");
    const usersCount = await this.pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");

    if (
      Number(issuesCount.rows[0]?.count ?? 0) > defaultState.issues.length ||
      Number(docsCount.rows[0]?.count ?? 0) > defaultState.documents.length ||
      Number(usersCount.rows[0]?.count ?? 0) > defaultState.users.length
    ) {
      return;
    }

    try {
      await access(this.jsonFallbackDir, fsConstants.F_OK);
    } catch {
      return;
    }

    const jsonStore = new JsonStore(this.jsonFallbackDir);
    await jsonStore.ensure();
    const jsonState = await jsonStore.load();
    const hasMeaningfulJsonData =
      jsonState.issues.length > defaultState.issues.length ||
      jsonState.documents.length > defaultState.documents.length ||
      jsonState.users.length > defaultState.users.length ||
      jsonState.partners.length > defaultState.partners.length ||
      jsonState.contracts.length > defaultState.contracts.length;

    if (!hasMeaningfulJsonData) {
      return;
    }

    await this.saveConfig(jsonState.config);
    await this.saveIssues(jsonState.issues);
    await this.saveDocuments(jsonState.documents);
    await this.saveEvents(jsonState.events);
    await this.saveUsers(jsonState.users);
    await this.savePartners(jsonState.partners);
    await this.saveContracts(jsonState.contracts);
    await this.saveDeliveries(jsonState.deliveries);
    await this.savePollingLogs(jsonState.pollingLogs);
    await this.saveContractSequences(jsonState.contractSequences);
  }

  private resolveSsl(): boolean | { rejectUnauthorized: boolean } {
    const raw = String(process.env.RDS_SSL ?? "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") {
      return false;
    }
    return { rejectUnauthorized: false };
  }
}
