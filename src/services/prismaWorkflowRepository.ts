import { PrismaClient } from "../../generated/prisma/client.js";
import { AppConfig, ContractSequenceRecord, IssueRecord, WorkflowEvent } from "../types.js";

export class PrismaWorkflowRepository {
  private readonly schema: string;

  constructor(private readonly prisma: PrismaClient) {
    this.schema = this.quoteIdentifier(String(process.env.PRISMA_SCHEMA ?? "lb_core").trim() || "lb_core");
  }

  async getConfig(): Promise<AppConfig | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ data: AppConfig }>>(
      `SELECT data FROM ${this.schema}.app_config WHERE id = 1`
    );
    return rows[0]?.data ?? null;
  }

  async listIssues(): Promise<IssueRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ data: IssueRecord }>>(
      `SELECT data FROM ${this.schema}.issues ORDER BY sort_index ASC, updated_at DESC`
    );
    return rows.map((row) => row.data);
  }

  async listEvents(): Promise<WorkflowEvent[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ data: WorkflowEvent }>>(
      `SELECT data FROM ${this.schema}.events ORDER BY sort_index ASC, updated_at DESC`
    );
    return rows.map((row) => row.data);
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `
        INSERT INTO ${this.schema}.app_config (id, data, updated_at)
        VALUES (1, $1::jsonb, $2::timestamptz)
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `,
      JSON.stringify(config),
      config.lastSavedAt
    );
  }

  async saveIssues(issues: IssueRecord[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM ${this.schema}.issues`);
      for (const [index, issue] of issues.entries()) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO ${this.schema}.issues (entity_key, sort_index, issue_key, template_key, status, data, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
          `,
          issue.id,
          index,
          issue.issueKey,
          issue.templateKey,
          issue.status,
          JSON.stringify(issue),
          issue.updatedAt
        );
      }
    });
  }

  async saveEvents(events: WorkflowEvent[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM ${this.schema}.events`);
      for (const [index, event] of events.entries()) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO ${this.schema}.events (entity_key, sort_index, event_type, data, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
          `,
          event.id,
          index,
          event.type,
          JSON.stringify(event),
          event.createdAt
        );
      }
    });
  }

  async saveContractSequences(sequences: ContractSequenceRecord[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM ${this.schema}.contract_sequences`);
      for (const [index, sequence] of sequences.entries()) {
        await tx.$executeRawUnsafe(
          `
            INSERT INTO ${this.schema}.contract_sequences (entity_key, sort_index, prefix, year, data, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
          `,
          `${sequence.prefix}-${sequence.year}`,
          index,
          sequence.prefix,
          sequence.year,
          JSON.stringify(sequence),
          sequence.updated_at
        );
      }
    });
  }

  async seedWorkflowRuntime(state: {
    config: AppConfig;
    issues: IssueRecord[];
    events: WorkflowEvent[];
    contractSequences: ContractSequenceRecord[];
  }): Promise<void> {
    const [configCount, issuesCount, eventsCount, sequencesCount] = await Promise.all([
      this.countTable("app_config"),
      this.countTable("issues"),
      this.countTable("events"),
      this.countTable("contract_sequences")
    ]);

    if (configCount === 0) {
      await this.saveConfig(state.config);
    }
    if (issuesCount === 0 && state.issues.length > 0) {
      await this.saveIssues(state.issues);
    }
    if (eventsCount === 0 && state.events.length > 0) {
      await this.saveEvents(state.events);
    }
    if (sequencesCount === 0 && state.contractSequences.length > 0) {
      await this.saveContractSequences(state.contractSequences);
    }
  }

  private async countTable(table: "app_config" | "issues" | "events" | "contract_sequences"): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
      `SELECT COUNT(*) AS count FROM ${this.schema}.${table}`
    );
    return Number(rows[0]?.count ?? 0);
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
}
