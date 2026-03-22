import { PrismaClient } from "../../generated/prisma/client.js";
import {
  AdminDashboardSnapshot,
  AdminUser,
  ContractRecord,
  DeliveryRecord,
  PartnerRecord,
  PollingLogRecord
} from "../types.js";

type PartnerImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  partners: PartnerRecord[];
};

export class PrismaAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard(): Promise<AdminDashboardSnapshot> {
    const [users, partners, contracts, documentsCount, deliveriesCount, pollingLogs] = await Promise.all([
      this.prisma.users.findMany({ orderBy: { id: "asc" } }),
      this.prisma.partners.findMany({ orderBy: { id: "asc" } }),
      this.prisma.contracts.findMany({ orderBy: { updated_at: "desc" }, take: 20 }),
      this.prisma.documents.count(),
      this.prisma.deliveries.count(),
      this.prisma.polling_logs.findMany({ orderBy: { checked_at: "desc" }, take: 6 })
    ]);

    const userRows = users.map((row) => this.mapUser(row));
    const partnerRows = partners.map((row) => this.mapPartner(row));
    const contractRows = contracts.map((row) => this.mapContract(row));

    return {
      usersCount: userRows.length,
      activeUsersCount: userRows.filter((user) => user.is_active).length,
      partnersCount: partnerRows.length,
      activePartnersCount: partnerRows.filter((partner) => partner.is_active).length,
      legalApproverCount: userRows.filter((user) => user.is_legal_approver && user.is_active).length,
      recentDocumentsCount: documentsCount,
      contractsCount: contractRows.length,
      pendingApprovalCount: contractRows.filter((contract) => contract.approval_status === "pending").length,
      pendingStampCount: contractRows.filter((contract) =>
        ["requested", "file_received"].includes(String(contract.stamp_status ?? ""))
      ).length,
      deliveriesCount,
      pendingAlerts: [
        ...contractRows
          .filter((contract) => contract.approval_status === "pending")
          .slice(0, 2)
          .map((contract) => ({
            label: `${contract.issue_key} 承認待ち`,
            date: contract.updated_at.slice(0, 10),
            days: 1,
            level: "alert" as const
          })),
        ...contractRows
          .filter((contract) => ["requested", "file_received"].includes(String(contract.stamp_status ?? "")))
          .slice(0, 2)
          .map((contract) => ({
            label: `${contract.issue_key} 押印待ち`,
            date: contract.updated_at.slice(0, 10),
            days: 1,
            level: "warn" as const
          }))
      ].slice(0, 5),
      recentLogs: pollingLogs.map((log) => ({
        time: new Date(log.checked_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        text: log.error_message || `issues fetched=${log.issues_fetched}, processed=${log.issues_processed}`,
        success: log.status === "success"
      }))
    };
  }

  async listContracts(): Promise<ContractRecord[]> {
    const rows = await this.prisma.contracts.findMany({ orderBy: { updated_at: "desc" } });
    return rows.map((row) => this.mapContract(row));
  }

  async listDeliveries(): Promise<DeliveryRecord[]> {
    const rows = await this.prisma.deliveries.findMany({ orderBy: { created_at: "desc" } });
    return rows.map((row) => this.mapDelivery(row));
  }

  async listPollingLogs(): Promise<PollingLogRecord[]> {
    const rows = await this.prisma.polling_logs.findMany({ orderBy: { checked_at: "desc" } });
    return rows.map((row) => ({
      id: `poll-${row.id}`,
      started_at: row.checked_at.toISOString(),
      finished_at: row.checked_at.toISOString(),
      source: "backlog",
      fetched_count: row.issues_fetched,
      created_count: 0,
      updated_count: row.issues_processed,
      success: row.status === "success",
      message: row.error_message || `duration=${row.duration_ms ?? 0}ms`
    }));
  }

  async listUsers(): Promise<AdminUser[]> {
    const rows = await this.prisma.users.findMany({
      orderBy: [{ department: "asc" }, { name: "asc" }]
    });
    return rows.map((row) => this.mapUser(row));
  }

  async getUser(id: number): Promise<AdminUser> {
    const row = await this.prisma.users.findUnique({ where: { id } });
    if (!row) {
      throw new Error("User not found");
    }
    return this.mapUser(row);
  }

  async updateUser(id: number, input: Partial<AdminUser>): Promise<AdminUser> {
    const current = await this.prisma.users.findUnique({ where: { id } });
    if (!current) {
      throw new Error("User not found");
    }
    const row = await this.prisma.users.update({
      where: { id },
      data: {
        is_legal_approver: input.is_legal_approver ?? current.is_legal_approver,
        is_business_approver: input.is_business_approver ?? current.is_business_approver,
        is_legal_staff: input.is_legal_staff ?? current.is_legal_staff,
        is_admin: input.is_admin ?? current.is_admin,
        is_active: input.is_active ?? current.is_active,
        notify_via_dm: input.notify_via_dm ?? current.notify_via_dm,
        notes: input.notes ?? current.notes,
        updated_at: new Date()
      }
    });
    return this.mapUser(row);
  }

  async listPartners(search?: string): Promise<PartnerRecord[]> {
    const keyword = (search || "").trim();
    const rows = keyword
      ? await this.prisma.partners.findMany({
          where: {
            OR: [
              { partner_code: { contains: keyword, mode: "insensitive" } },
              { name: { contains: keyword, mode: "insensitive" } },
              { contact_person: { contains: keyword, mode: "insensitive" } }
            ]
          },
          orderBy: { partner_code: "asc" }
        })
      : await this.prisma.partners.findMany({ orderBy: { partner_code: "asc" } });
    return rows.map((row) => this.mapPartner(row));
  }

  async getPartner(id: number): Promise<PartnerRecord> {
    const row = await this.prisma.partners.findUnique({ where: { id } });
    if (!row) {
      throw new Error("Partner not found");
    }
    return this.mapPartner(row);
  }

  async createPartner(input: Partial<PartnerRecord>): Promise<PartnerRecord> {
    const partnerCode = String(input.partner_code ?? "").trim();
    const name = String(input.name ?? "").trim();
    if (!partnerCode || !name) {
      throw new Error("partner_code and name are required");
    }
    const row = await this.prisma.partners.create({
      data: {
        partner_code: partnerCode,
        name,
        is_corporation: Boolean(input.is_corporation),
        representative: this.optionalString(input.representative),
        contact_person: this.optionalString(input.contact_person),
        contact_email: this.optionalString(input.contact_email),
        contact_phone: this.optionalString(input.contact_phone),
        address: this.optionalString((input as Record<string, unknown>).address),
        is_invoice_issuer: Boolean(input.is_invoice_issuer),
        invoice_registration_number: this.optionalString(input.invoice_registration_number),
        bank_name: this.optionalString(input.bank_name),
        bank_branch: this.optionalString(input.bank_branch),
        bank_account_type: this.optionalString(input.bank_account_type),
        bank_account_number: this.optionalString(input.bank_account_number),
        bank_account_holder: this.optionalString(input.bank_account_holder),
        is_active: input.is_active ?? true,
        notes: this.optionalString(input.notes)
      }
    });
    return this.mapPartner(row);
  }

  async updatePartner(id: number, input: Partial<PartnerRecord>): Promise<PartnerRecord> {
    const current = await this.prisma.partners.findUnique({ where: { id } });
    if (!current) {
      throw new Error("Partner not found");
    }
    const row = await this.prisma.partners.update({
      where: { id },
      data: {
        partner_code: String(input.partner_code ?? current.partner_code).trim(),
        name: String(input.name ?? current.name).trim(),
        is_corporation: input.is_corporation ?? current.is_corporation,
        representative: this.coalesceString(input.representative, current.representative),
        contact_person: this.coalesceString(input.contact_person, current.contact_person),
        contact_email: this.coalesceString(input.contact_email, current.contact_email),
        contact_phone: this.coalesceString(input.contact_phone, current.contact_phone),
        address: this.coalesceString((input as Record<string, unknown>).address, current.address),
        is_invoice_issuer: input.is_invoice_issuer ?? current.is_invoice_issuer,
        invoice_registration_number: this.coalesceString(
          input.invoice_registration_number,
          current.invoice_registration_number
        ),
        bank_name: this.coalesceString(input.bank_name, current.bank_name),
        bank_branch: this.coalesceString(input.bank_branch, current.bank_branch),
        bank_account_type: this.coalesceString(input.bank_account_type, current.bank_account_type),
        bank_account_number: this.coalesceString(input.bank_account_number, current.bank_account_number),
        bank_account_holder: this.coalesceString(input.bank_account_holder, current.bank_account_holder),
        is_active: input.is_active ?? current.is_active,
        notes: this.coalesceString(input.notes, current.notes),
        updated_at: new Date()
      }
    });
    return this.mapPartner(row);
  }

  async importPartnersCsv(csvText: string): Promise<PartnerImportResult> {
    const rows = this.parseCsv(csvText);
    if (rows.length < 2) {
      return { imported: 0, skipped: 0, errors: ["CSV must include header and rows"], partners: await this.listPartners() };
    }

    const header = rows[0].map((item) => item.trim());
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let index = 1; index < rows.length; index += 1) {
      const cells = rows[index];
      if (cells.every((cell) => !cell.trim())) {
        continue;
      }
      const row = Object.fromEntries(header.map((key, cellIndex) => [key, (cells[cellIndex] ?? "").trim()]));
      const partnerCode = String(row.partner_code ?? "");
      const name = String(row.name ?? "");
      if (!partnerCode || !name) {
        errors.push(`Row ${index + 1}: partner_code and name are required`);
        skipped += 1;
        continue;
      }

      const existing = await this.prisma.partners.findUnique({ where: { partner_code: partnerCode } });
      if (existing) {
        await this.prisma.partners.update({
          where: { id: existing.id },
          data: {
            name,
            is_corporation: this.parseBoolean(row.is_corporation),
            representative: this.optionalString(row.representative),
            contact_person: this.optionalString(row.contact_person),
            contact_email: this.optionalString(row.contact_email),
            contact_phone: this.optionalString(row.contact_phone),
            is_invoice_issuer: this.parseBoolean(row.is_invoice_issuer),
            invoice_registration_number: this.optionalString(row.invoice_registration_number),
            bank_name: this.optionalString(row.bank_name),
            bank_branch: this.optionalString(row.bank_branch),
            bank_account_type: this.optionalString(row.bank_account_type),
            bank_account_number: this.optionalString(row.bank_account_number),
            bank_account_holder: this.optionalString(row.bank_account_holder),
            is_active: row.is_active ? this.parseBoolean(row.is_active) : true,
            notes: this.optionalString(row.notes),
            updated_at: new Date()
          }
        });
      } else {
        await this.prisma.partners.create({
          data: {
            partner_code: partnerCode,
            name,
            is_corporation: this.parseBoolean(row.is_corporation),
            representative: this.optionalString(row.representative),
            contact_person: this.optionalString(row.contact_person),
            contact_email: this.optionalString(row.contact_email),
            contact_phone: this.optionalString(row.contact_phone),
            is_invoice_issuer: this.parseBoolean(row.is_invoice_issuer),
            invoice_registration_number: this.optionalString(row.invoice_registration_number),
            bank_name: this.optionalString(row.bank_name),
            bank_branch: this.optionalString(row.bank_branch),
            bank_account_type: this.optionalString(row.bank_account_type),
            bank_account_number: this.optionalString(row.bank_account_number),
            bank_account_holder: this.optionalString(row.bank_account_holder),
            is_active: row.is_active ? this.parseBoolean(row.is_active) : true,
            notes: this.optionalString(row.notes)
          }
        });
      }
      imported += 1;
    }

    return { imported, skipped, errors, partners: await this.listPartners() };
  }

  async exportPartnersCsv(): Promise<string> {
    const partners = await this.listPartners();
    const header = [
      "partner_code",
      "name",
      "name_kana",
      "is_corporation",
      "representative",
      "contact_person",
      "contact_email",
      "contact_phone",
      "invoice_registration_number",
      "is_invoice_issuer",
      "bank_name",
      "bank_branch",
      "bank_account_type",
      "bank_account_number",
      "bank_account_holder",
      "is_active",
      "notes"
    ];
    const rows = partners.map((partner) =>
      header.map((key) => this.escapeCsvValue(String((partner as unknown as Record<string, unknown>)[key] ?? ""))).join(",")
    );
    return [header.join(","), ...rows].join("\n");
  }

  private mapUser(row: Record<string, unknown>): AdminUser {
    return {
      id: Number(row.id),
      name: String(row.name ?? ""),
      department: String(row.department ?? ""),
      title: String(row.title ?? ""),
      slack_id: String(row.slack_id ?? ""),
      google_email: String(row.google_email ?? ""),
      is_legal_approver: Boolean(row.is_legal_approver),
      is_business_approver: Boolean(row.is_business_approver),
      is_legal_staff: Boolean(row.is_legal_staff),
      is_admin: Boolean(row.is_admin),
      is_active: Boolean(row.is_active),
      notify_via_dm: Boolean(row.notify_via_dm),
      notification_channel: undefined,
      notes: this.optionalString(row.notes)
    };
  }

  private mapPartner(row: Record<string, unknown>): PartnerRecord {
    return {
      id: Number(row.id),
      partner_code: String(row.partner_code ?? ""),
      name: String(row.name ?? ""),
      name_kana: undefined,
      is_corporation: Boolean(row.is_corporation),
      representative: this.optionalString(row.representative),
      contact_person: this.optionalString(row.contact_person),
      contact_email: this.optionalString(row.contact_email),
      contact_phone: this.optionalString(row.contact_phone),
      invoice_registration_number: this.optionalString(row.invoice_registration_number),
      is_invoice_issuer: Boolean(row.is_invoice_issuer),
      bank_name: this.optionalString(row.bank_name),
      bank_branch: this.optionalString(row.bank_branch),
      bank_account_type: this.optionalString(row.bank_account_type),
      bank_account_number: this.optionalString(row.bank_account_number),
      bank_account_holder: this.optionalString(row.bank_account_holder),
      is_active: Boolean(row.is_active),
      notes: this.optionalString(row.notes)
    };
  }

  private mapContract(row: Record<string, unknown>): ContractRecord {
    return {
      id: `contract-${row.id}`,
      contract_no: String(row.contract_no ?? ""),
      issue_id: String(row.backlog_issue_id ?? ""),
      issue_key: String(row.backlog_issue_key ?? ""),
      title: String(row.counterparty ?? row.contract_no ?? ""),
      template_key: String(row.contract_type ?? ""),
      workflow_status: String(row.status ?? ""),
      approval_status: undefined,
      stamp_status: undefined,
      counterparty_name: this.optionalString(row.counterparty),
      partner_code: undefined,
      parent_issue_key: undefined,
      child_issue_keys: [],
      drive_folder_name: undefined,
      drive_file_url: this.optionalString(row.drive_folder_url),
      revision_no: Number(row.generation_count ?? 0) || 0,
      created_at: new Date(row.created_at as string | Date).toISOString(),
      updated_at: new Date(row.updated_at as string | Date).toISOString()
    };
  }

  private mapDelivery(row: Record<string, unknown>): DeliveryRecord {
    return {
      id: `delivery-${row.id}`,
      contract_id: row.contract_id ? String(row.contract_id) : undefined,
      issue_id: row.backlog_issue_id ? String(row.backlog_issue_id) : "",
      issue_key: String(row.backlog_issue_key ?? ""),
      delivery_type: String(row.delivery_type ?? ""),
      status: row.approved_at ? "approved" : "pending",
      requested_at: new Date((row.created_at as string | Date) ?? new Date()).toISOString(),
      completed_at: row.approved_at ? new Date(row.approved_at as string | Date).toISOString() : undefined,
      document_id: undefined,
      drive_folder_name: undefined,
      remarks: this.optionalString(row.notes)
    };
  }

  private optionalString(value: unknown): string | undefined {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : undefined;
  }

  private coalesceString(value: unknown, fallback: unknown): string | null {
    const normalized = this.optionalString(value);
    if (normalized !== undefined) {
      return normalized;
    }
    return this.optionalString(fallback) ?? null;
  }

  private parseBoolean(value: unknown): boolean {
    return /^(true|1|yes|on)$/i.test(String(value ?? "").trim());
  }

  private escapeCsvValue(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private parseCsv(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;
    const text = input.replace(/^\uFEFF/, "");

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
        continue;
      }
      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }
      cell += char;
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }
}
