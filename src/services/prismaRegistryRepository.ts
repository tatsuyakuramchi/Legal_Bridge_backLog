import { PrismaClient } from "../../generated/prisma/client.js";
import { DocumentRecord, IssueRecord, PollingLogRecord } from "../types.js";

type PollerRunInput = Omit<PollingLogRecord, "id">;

export class PrismaRegistryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordDocumentLifecycle(issue: IssueRecord, document: DocumentRecord): Promise<void> {
    const contract = await this.upsertContract(issue, document);
    if (!contract) {
      return;
    }

    await this.prisma.documents.create({
      data: {
        contract_id: contract.id,
        document_type: issue.templateKey,
        file_name: document.fileName,
        drive_url: document.pdfPath,
        generated_at: new Date(document.createdAt),
        generated_by: issue.assignee || null,
        template_ids: [issue.templateKey],
        is_merged: /bundle/i.test(document.fileName),
        child_count: this.resolveChildCount(issue),
        notes: this.readString(issue.payload.remarks ?? issue.payload.notes) ?? null
      }
    });

    const deliveryType = this.resolveDeliveryType(issue);
    if (!deliveryType) {
      return;
    }

    const backlogIssueId = this.safeIssueInteger(issue);
    const current = await this.prisma.deliveries.findFirst({
      where: { OR: [{ backlog_issue_id: backlogIssueId }, { backlog_issue_key: issue.issueKey }] },
      orderBy: { id: "desc" }
    });

    const deliveryData = {
      contract_id: contract.id,
      backlog_issue_id: backlogIssueId,
      backlog_issue_key: issue.issueKey,
      delivery_type: deliveryType,
      delivery_date: this.parseDateOnly(issue.payload.delivery_date ?? issue.payload.deliveryDate),
      amount_ex_tax: this.parseDecimal(issue.payload.amount),
      payment_due_date: this.parseDateOnly(issue.payload.PAYMENT_DATE ?? issue.payload.payment_date),
      partial_number: this.parseInteger(issue.payload.partial_number),
      total_partials: this.parseInteger(issue.payload.total_partials),
      is_final_delivery: this.parseBoolean(issue.payload.is_final_delivery),
      drive_url: document.pdfPath,
      approver_name: this.readString(issue.payload.approver_name),
      approver_department: this.readString(issue.payload.approver_department),
      reviewer_name: this.readString(issue.payload.reviewer_name),
      reviewer_department: this.readString(issue.payload.reviewer_department),
      person_name: this.readString(issue.payload.person_name),
      person_department: this.readString(issue.payload.person_department),
      approval_comments: this.readString(issue.payload.approval_comments ?? issue.payload.remarks ?? issue.payload.notes),
      approved_at: this.parseDateTime(issue.payload.approval_date ?? issue.payload.approved_at),
      notes: this.readString(issue.payload.notes)
    };

    if (current) {
      await this.prisma.deliveries.update({
        where: { id: current.id },
        data: {
          ...deliveryData,
          updated_at: new Date()
        }
      });
      return;
    }

    await this.prisma.deliveries.create({
      data: {
        ...deliveryData,
        created_at: new Date(issue.createdAt),
        updated_at: new Date(issue.updatedAt)
      }
    });
  }

  async recordIssueState(issue: IssueRecord): Promise<void> {
    const contract = await this.findContract(issue);
    if (!contract) {
      return;
    }

    const nextStatus = this.readString(issue.payload.workflow_status) ?? issue.status;
    await this.prisma.contracts.update({
      where: { id: contract.id },
      data: {
        status: nextStatus,
        generation_count: this.resolveRevision(issue),
        signing_method: this.readString(issue.payload.stamp_method) ?? contract.signing_method,
        counterparty_ok_at: this.parseDateTime(issue.payload.counterparty_ok_at),
        esign_completed_at: this.parseDateTime(issue.payload.cloudsign_completed_at),
        signed_at: this.parseDateTime(issue.payload.signed_at ?? issue.payload.stamp_completed_at),
        archived_at: nextStatus === "アーカイブ" ? new Date() : null,
        canceled_at: nextStatus === "破棄" ? new Date() : null,
        updated_at: new Date(issue.updatedAt)
      }
    });

    const backlogIssueId = this.safeIssueInteger(issue);
    const delivery = await this.prisma.deliveries.findFirst({
      where: { OR: [{ backlog_issue_id: backlogIssueId }, { backlog_issue_key: issue.issueKey }] },
      orderBy: { id: "desc" }
    });
    if (!delivery) {
      return;
    }

    await this.prisma.deliveries.update({
      where: { id: delivery.id },
      data: {
        approved_at:
          issue.status === "Completed" || issue.status === "Signed"
            ? new Date(issue.updatedAt)
            : this.parseDateTime(issue.payload.approval_date ?? issue.payload.approved_at),
        notes: this.readString(issue.payload.notes) ?? delivery.notes,
        updated_at: new Date(issue.updatedAt)
      }
    });
  }

  async recordPollerRun(input: PollerRunInput): Promise<void> {
    const started = new Date(input.started_at);
    const finished = new Date(input.finished_at);
    await this.prisma.polling_logs.create({
      data: {
        checked_at: finished,
        issues_fetched: input.fetched_count,
        issues_processed: input.created_count + input.updated_count,
        duration_ms: Math.max(finished.getTime() - started.getTime(), 0),
        error_message: input.success ? null : input.message,
        status: input.success ? "success" : "error"
      }
    });
  }

  private async upsertContract(issue: IssueRecord, document?: DocumentRecord) {
    const existing = await this.findContract(issue);
    const partner = await this.findPartner(issue);
    const data = {
      backlog_issue_id: this.safeIssueInteger(issue),
      backlog_issue_key: issue.issueKey,
      backlog_project_id: null,
      contract_no: issue.contractNo ?? document?.contractNo ?? issue.issueKey,
      partner_id: partner?.id ?? null,
      counterparty: this.resolveCounterpartyName(issue),
      counterparty_person: this.readString(issue.payload.vendorContactName ?? issue.payload.vendor_contact_name),
      contract_type: issue.templateKey,
      status: this.readString(issue.payload.workflow_status) ?? issue.status,
      generation_count: this.resolveRevision(issue),
      last_fixed_at: document ? new Date(document.createdAt) : null,
      last_fixed_drive_url: document?.pdfPath ?? null,
      signing_method: this.readString(issue.payload.stamp_method),
      counterparty_ok_at: this.parseDateTime(issue.payload.counterparty_ok_at),
      esign_completed_at: this.parseDateTime(issue.payload.cloudsign_completed_at),
      signed_at: this.parseDateTime(issue.payload.signed_at ?? issue.payload.stamp_completed_at),
      drive_folder_url: document?.pdfPath ?? this.readString(issue.payload.drive_file_url) ?? null,
      archived_at: null,
      canceled_at: null,
      updated_at: new Date(issue.updatedAt)
    };

    if (existing) {
      return this.prisma.contracts.update({
        where: { id: existing.id },
        data
      });
    }

    return this.prisma.contracts.create({
      data: {
        ...data,
        is_parent: this.resolveChildCount(issue) > 0,
        child_count: this.resolveChildCount(issue),
        created_at: new Date(issue.createdAt)
      }
    });
  }

  private async findContract(issue: IssueRecord) {
    const contractNo = issue.contractNo ?? this.readString(issue.payload.CONTRACT_NO);
    const backlogIssueId = this.safeIssueInteger(issue);
    return this.prisma.contracts.findFirst({
      where: {
        OR: [
          { backlog_issue_id: backlogIssueId },
          { backlog_issue_key: issue.issueKey },
          ...(contractNo ? [{ contract_no: contractNo }] : [])
        ]
      },
      orderBy: { id: "desc" }
    });
  }

  private async findPartner(issue: IssueRecord) {
    const partnerCode = this.readString(issue.payload.partnerCode ?? issue.payload.partner_code);
    if (partnerCode) {
      const byCode = await this.prisma.partners.findUnique({ where: { partner_code: partnerCode } });
      if (byCode) {
        return byCode;
      }
    }

    const name = this.resolveCounterpartyName(issue);
    if (!name) {
      return null;
    }

    return this.prisma.partners.findFirst({
      where: { name: { equals: name, mode: "insensitive" } }
    });
  }

  private safeIssueInteger(issue: IssueRecord): number {
    const direct = this.parseInteger(issue.payload.backlogIssueId ?? issue.payload.backlog_issue_id);
    if (direct) {
      return direct;
    }

    const fromKey = this.parseInteger(issue.issueKey);
    if (fromKey) {
      return fromKey;
    }

    const source = issue.id || issue.issueKey;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
    }
    return (hash % 2147483646) + 1;
  }

  private resolveCounterpartyName(issue: IssueRecord): string {
    return (
      this.readString(
        issue.payload.vendorName ??
          issue.payload.counterpartyName ??
          issue.payload.partnerName ??
          issue.payload.PARTY_B_NAME
      ) ??
      issue.title
    );
  }

  private resolveDeliveryType(issue: IssueRecord): string | null {
    const explicit = this.readString(issue.payload.payment_type ?? issue.payload.delivery_type ?? issue.payload.deliveryType);
    if (explicit) {
      return explicit;
    }
    if (issue.templateKey === "template_inspection_report") {
      return "INSPECTION";
    }
    if (issue.templateKey === "template_royalty_report") {
      return "ROYALTY";
    }
    if (issue.templateKey === "template_revenue_share_report") {
      return "REVENUE_SHARE";
    }
    return null;
  }

  private resolveRevision(issue: IssueRecord): number {
    const raw = issue.payload.revision_no ?? issue.payload.revisionNo ?? issue.payload.counterparty_revision_no;
    const parsed = this.parseInteger(raw);
    return parsed && parsed > 0 ? parsed : 1;
  }

  private resolveChildCount(issue: IssueRecord): number {
    const raw = issue.payload.childIssueKeys ?? issue.payload.child_issue_keys;
    if (Array.isArray(raw)) {
      return raw.filter((item) => String(item ?? "").trim()).length;
    }
    const single = this.readString(raw);
    return single ? single.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).length : 0;
  }

  private parseInteger(value: unknown): number | null {
    const normalized = String(value ?? "").replace(/[^\d-]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseDecimal(value: unknown): string | null {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
  }

  private parseBoolean(value: unknown): boolean {
    return /^(true|1|yes|on)$/i.test(String(value ?? "").trim());
  }

  private parseDateOnly(value: unknown): Date | null {
    const normalized = this.readString(value);
    if (!normalized) {
      return null;
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private parseDateTime(value: unknown): Date | null {
    const normalized = this.readString(value);
    if (!normalized) {
      return null;
    }
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private readString(value: unknown): string | undefined {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : undefined;
  }
}
