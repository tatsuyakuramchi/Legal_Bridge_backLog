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
  private readonly schema: string;
  private readonly legacySchema = "public";

  constructor(options: PostgresStoreOptions = {}) {
    this.jsonFallbackDir = options.jsonFallbackDir;
    this.schema = String(process.env.RDS_APP_SCHEMA ?? "lb_app").trim() || "lb_app";
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
    const appConfigTable = this.tableName("app_config");
    const issuesTable = this.tableName("issues");
    const documentsTable = this.tableName("documents");
    const eventsTable = this.tableName("events");
    const usersTable = this.tableName("users");
    const partnersTable = this.tableName("partners");
    const contractsTable = this.tableName("contracts");
    const deliveriesTable = this.tableName("deliveries");
    const pollingLogsTable = this.tableName("polling_logs");
    const contractSequencesTable = this.tableName("contract_sequences");

    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS ${this.quotedSchema()};
      CREATE TABLE IF NOT EXISTS ${appConfigTable} (
        id SMALLINT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${issuesTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${documentsTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${eventsTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${usersTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${partnersTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${contractsTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${deliveriesTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${pollingLogsTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${contractSequencesTable} (
        entity_key TEXT PRIMARY KEY,
        sort_index INTEGER NOT NULL DEFAULT 0,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.migrateLegacySchemaIfNeeded();
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
        INSERT INTO ${this.tableName("app_config")} (id, data, updated_at)
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
    const result = await this.pool.query<{ data: AppConfig }>(
      `SELECT data FROM ${this.tableName("app_config")} WHERE id = 1`
    );
    return result.rows[0]?.data ?? defaultConfig;
  }

  private async loadCollection<T>(table: CollectionName): Promise<T[]> {
    const result = await this.pool.query<{ data: T }>(
      `SELECT data FROM ${this.tableName(table)} ORDER BY sort_index ASC, updated_at DESC, entity_key ASC`
    );
    return result.rows.map((row) => row.data);
  }

  private async replaceCollection<T>(
    table: CollectionName,
    items: T[],
    keyOf: (item: T) => string
  ): Promise<void> {
    const client = await this.pool.connect();
    const tableName = this.tableName(table);
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM ${tableName}`);
      for (const [index, item] of items.entries()) {
        await client.query(
          `
            INSERT INTO ${tableName} (entity_key, sort_index, data, updated_at)
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
    const configCount = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.tableName("app_config")}`
    );
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

  private async migrateLegacySchemaIfNeeded(): Promise<void> {
    if (this.schema === this.legacySchema) {
      return;
    }

    const targetCounts = await Promise.all([
      this.countRows(this.tableName("app_config")),
      this.countRows(this.tableName("issues")),
      this.countRows(this.tableName("documents")),
      this.countRows(this.tableName("users"))
    ]);
    if (targetCounts.some((count) => count > 0)) {
      return;
    }

    const legacyTables = ["app_config", "issues", "documents", "events", "users", "partners", "contracts", "deliveries", "polling_logs", "contract_sequences"] as const;
    const legacyChecks = await Promise.all(
      legacyTables.map(async (table) => ({
        table,
        exists: await this.tableExists(this.tableNameForSchema(this.legacySchema, table))
      }))
    );
    if (!legacyChecks.some((entry) => entry.exists)) {
      return;
    }

    const legacyConfig = await this.pool.query<{ data: AppConfig }>(
      `SELECT data FROM ${this.tableNameForSchema(this.legacySchema, "app_config")} WHERE id = 1`
    );
    if (legacyConfig.rows[0]?.data) {
      await this.saveConfig(legacyConfig.rows[0].data);
    }

    await this.migrateLegacyCollection<IssueRecord>("issues");
    await this.migrateLegacyCollection<DocumentRecord>("documents");
    await this.migrateLegacyCollection<WorkflowEvent>("events");
    await this.migrateLegacyCollection<AdminUser>("users");
    await this.migrateLegacyCollection<PartnerRecord>("partners");
    await this.migrateLegacyCollection<ContractRecord>("contracts");
    await this.migrateLegacyCollection<DeliveryRecord>("deliveries");
    await this.migrateLegacyCollection<PollingLogRecord>("polling_logs");
    await this.migrateLegacyCollection<ContractSequenceRecord>("contract_sequences");
  }

  private async migrateLegacyCollection<T>(table: CollectionName): Promise<void> {
    const legacyTable = this.tableNameForSchema(this.legacySchema, table);
    if (!(await this.tableExists(legacyTable))) {
      return;
    }
    const result = await this.pool.query<{ data: T }>(
      `SELECT data FROM ${legacyTable} ORDER BY sort_index ASC, updated_at DESC, entity_key ASC`
    );
    if (result.rows.length === 0) {
      return;
    }
    await this.replaceCollection(
      table,
      result.rows.map((row) => row.data),
      (item) => {
        if (table === "users" || table === "partners") {
          return String((item as { id: number | string }).id);
        }
        if (table === "contract_sequences") {
          const sequence = item as ContractSequenceRecord;
          return `${sequence.prefix}-${sequence.year}`;
        }
        return String((item as { id?: string; entity_key?: string }).id ?? (item as { entity_key: string }).entity_key);
      }
    );
  }

  private async countRows(tableName: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName}`);
    return Number(result.rows[0]?.count ?? 0);
  }

  private async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.pool.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  private async seedCollectionIfEmpty<T>(
    table: CollectionName,
    items: T[],
    keyOf: (item: T) => string
  ): Promise<void> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.tableName(table)}`
    );
    if (Number(result.rows[0]?.count ?? 0) === 0 && items.length > 0) {
      await this.replaceCollection(table, items, keyOf);
    }
  }

  private async bootstrapFromJsonIfNeeded(): Promise<void> {
    if (!this.jsonFallbackDir || process.env.RDS_BOOTSTRAP_FROM_JSON === "false") {
      return;
    }

    const issuesCount = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.tableName("issues")}`
    );
    const docsCount = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.tableName("documents")}`
    );
    const usersCount = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.tableName("users")}`
    );

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

  private tableName(table: CollectionName | "app_config"): string {
    return this.tableNameForSchema(this.schema, table);
  }

  private tableNameForSchema(schema: string, table: CollectionName | "app_config"): string {
    return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
  }

  private quotedSchema(): string {
    return this.quoteIdentifier(this.schema);
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replaceAll(`"`, `""`)}"`;
  }
}
