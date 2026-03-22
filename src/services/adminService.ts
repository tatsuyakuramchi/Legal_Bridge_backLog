import { AppStore } from "../store.js";
import {
  AdminDashboardSnapshot,
  AdminUser,
  ContractRecord,
  DeliveryRecord,
  PartnerRecord,
  PollingLogRecord
} from "../types.js";
import { SlackService } from "./slackService.js";

type PartnerImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  partners: PartnerRecord[];
};

export class AdminService {
  constructor(
    private readonly store: AppStore,
    private readonly slackService: SlackService
  ) {}

  async getDashboard(): Promise<AdminDashboardSnapshot> {
    const state = await this.store.load();
    const pendingApprovalCount = state.contracts.filter((contract) => contract.approval_status === "pending").length;
    const pendingStampCount = state.contracts.filter((contract) =>
      ["requested", "file_received"].includes(String(contract.stamp_status ?? ""))
    ).length;

    return {
      usersCount: state.users.length,
      activeUsersCount: state.users.filter((user) => user.is_active).length,
      partnersCount: state.partners.length,
      activePartnersCount: state.partners.filter((partner) => partner.is_active).length,
      legalApproverCount: state.users.filter((user) => user.is_legal_approver && user.is_active).length,
      recentDocumentsCount: state.documents.slice(0, 30).length,
      contractsCount: state.contracts.length,
      pendingApprovalCount,
      pendingStampCount,
      deliveriesCount: state.deliveries.length,
      pendingAlerts: [
        ...state.contracts
          .filter((contract) => contract.approval_status === "pending")
          .slice(0, 2)
          .map((contract) => ({
            label: `${contract.issue_key} 承認待ち`,
            date: contract.updated_at.slice(0, 10),
            days: 1,
            level: "alert" as const
          })),
        ...state.contracts
          .filter((contract) => ["requested", "file_received"].includes(String(contract.stamp_status ?? "")))
          .slice(0, 2)
          .map((contract) => ({
            label: `${contract.issue_key} 押印待ち`,
            date: contract.updated_at.slice(0, 10),
            days: 1,
            level: "warn" as const
          })),
        ...state.issues.slice(0, 2).map((issue) => ({
          label: `${issue.issueKey} ${issue.title}`,
          date: issue.updatedAt.slice(0, 10),
          days: 7,
          level: "info" as const
        }))
      ].slice(0, 5),
      recentLogs: [
        ...state.pollingLogs.slice(0, 3).map((log) => ({
          time: new Date(log.finished_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
          text: log.message,
          success: log.success
        })),
        ...state.events.slice(0, 5).map((event) => ({
          time: new Date(event.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
          text: event.message,
          success: !/error|failed/i.test(event.message)
        }))
      ].slice(0, 6)
    };
  }

  async listContracts(): Promise<ContractRecord[]> {
    const state = await this.store.load();
    return [...state.contracts].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  async listDeliveries(): Promise<DeliveryRecord[]> {
    const state = await this.store.load();
    return [...state.deliveries].sort((left, right) => right.requested_at.localeCompare(left.requested_at));
  }

  async listPollingLogs(): Promise<PollingLogRecord[]> {
    const state = await this.store.load();
    return [...state.pollingLogs].sort((left, right) => right.finished_at.localeCompare(left.finished_at));
  }

  async listUsers(): Promise<AdminUser[]> {
    const state = await this.store.load();
    return [...state.users].sort((left, right) =>
      left.department === right.department
        ? left.name.localeCompare(right.name, "ja")
        : left.department.localeCompare(right.department, "ja")
    );
  }

  async getUser(id: number): Promise<AdminUser> {
    const state = await this.store.load();
    const user = state.users.find((item) => item.id === id);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  async updateUser(id: number, input: Partial<AdminUser>): Promise<AdminUser> {
    const state = await this.store.load();
    const index = state.users.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("User not found");
    }

    const current = state.users[index];
    const next: AdminUser = {
      ...current,
      is_legal_approver: input.is_legal_approver ?? current.is_legal_approver,
      is_business_approver: input.is_business_approver ?? current.is_business_approver,
      is_legal_staff: input.is_legal_staff ?? current.is_legal_staff,
      is_admin: input.is_admin ?? current.is_admin,
      is_active: input.is_active ?? current.is_active,
      notify_via_dm: input.notify_via_dm ?? current.notify_via_dm,
      notification_channel: input.notification_channel ?? current.notification_channel,
      notes: input.notes ?? current.notes
    };

    state.users[index] = next;
    await this.store.saveUsers(state.users);
    return next;
  }

  async syncUsersFromSlack(): Promise<{ count: number; users: AdminUser[]; mode: "slack" | "local" }> {
    const state = await this.store.load();
    const botToken = (process.env.SLACK_BOT_TOKEN || "").trim();
    if (!botToken || !state.config.legalSlackChannel) {
      return { count: state.users.length, users: state.users, mode: "local" };
    }

    try {
      const response = await fetch("https://slack.com/api/users.list", {
        headers: { Authorization: `Bearer ${botToken}` }
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; members?: Array<Record<string, unknown>> };
      if (!response.ok || !payload.ok || !payload.members) {
        throw new Error(payload.error ?? response.statusText);
      }

      let nextId = state.users.reduce((max, user) => Math.max(max, user.id), 0) + 1;
      const bySlackId = new Map(state.users.map((user) => [user.slack_id, user]));
      for (const member of payload.members) {
        if (member.is_bot || member.deleted || member.id === "USLACKBOT") {
          continue;
        }

        const slackId = String(member.id ?? "");
        const profile = (member.profile as Record<string, unknown> | undefined) ?? {};
        const current = bySlackId.get(slackId);
        const synced: AdminUser = {
          id: current?.id ?? nextId++,
          name: String(member.real_name ?? member.name ?? ""),
          department: current?.department ?? String(profile.title ?? ""),
          title: current?.title ?? String(profile.title ?? ""),
          slack_id: slackId,
          google_email: String(profile.email ?? current?.google_email ?? ""),
          is_legal_approver: current?.is_legal_approver ?? false,
          is_business_approver: current?.is_business_approver ?? false,
          is_legal_staff: current?.is_legal_staff ?? false,
          is_admin: current?.is_admin ?? false,
          is_active: true,
          notify_via_dm: current?.notify_via_dm ?? true,
          notification_channel: current?.notification_channel,
          notes: current?.notes
        };
        bySlackId.set(slackId, synced);
      }

      const users = Array.from(bySlackId.values()).sort((left, right) => left.name.localeCompare(right.name, "ja"));
      await this.store.saveUsers(users);
      return { count: users.length, users, mode: "slack" };
    } catch {
      return { count: state.users.length, users: state.users, mode: "local" };
    }
  }

  async listPartners(search?: string): Promise<PartnerRecord[]> {
    const state = await this.store.load();
    const keyword = (search || "").trim();
    const partners = [...state.partners].sort((left, right) => left.partner_code.localeCompare(right.partner_code, "ja"));
    if (!keyword) {
      return partners;
    }
    return partners.filter((partner) =>
      [partner.partner_code, partner.name, partner.name_kana, partner.contact_person]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword.toLowerCase()))
    );
  }

  async getPartner(id: number): Promise<PartnerRecord> {
    const state = await this.store.load();
    const partner = state.partners.find((item) => item.id === id);
    if (!partner) {
      throw new Error("Partner not found");
    }
    return partner;
  }

  async createPartner(input: Partial<PartnerRecord>): Promise<PartnerRecord> {
    const state = await this.store.load();
    const partnerCode = String(input.partner_code ?? "").trim();
    if (!partnerCode || !String(input.name ?? "").trim()) {
      throw new Error("partner_code and name are required");
    }
    if (state.partners.some((item) => item.partner_code === partnerCode)) {
      throw new Error("partner_code already exists");
    }

    const partner: PartnerRecord = {
      id: state.partners.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      partner_code: partnerCode,
      name: String(input.name ?? "").trim(),
      name_kana: this.optionalString(input.name_kana),
      is_corporation: Boolean(input.is_corporation),
      representative: this.optionalString(input.representative),
      contact_person: this.optionalString(input.contact_person),
      contact_email: this.optionalString(input.contact_email),
      contact_phone: this.optionalString(input.contact_phone),
      invoice_registration_number: this.optionalString(input.invoice_registration_number),
      is_invoice_issuer: Boolean(input.is_invoice_issuer),
      bank_name: this.optionalString(input.bank_name),
      bank_branch: this.optionalString(input.bank_branch),
      bank_account_type: this.optionalString(input.bank_account_type),
      bank_account_number: this.optionalString(input.bank_account_number),
      bank_account_holder: this.optionalString(input.bank_account_holder),
      is_active: input.is_active ?? true,
      notes: this.optionalString(input.notes)
    };

    state.partners.push(partner);
    await this.store.savePartners(state.partners);
    return partner;
  }

  async updatePartner(id: number, input: Partial<PartnerRecord>): Promise<PartnerRecord> {
    const state = await this.store.load();
    const index = state.partners.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("Partner not found");
    }
    const current = state.partners[index];
    const partnerCode = String(input.partner_code ?? current.partner_code).trim();
    if (partnerCode !== current.partner_code && state.partners.some((item) => item.id !== id && item.partner_code === partnerCode)) {
      throw new Error("partner_code already exists");
    }

    const next: PartnerRecord = {
      ...current,
      ...input,
      partner_code: partnerCode,
      name: String(input.name ?? current.name).trim(),
      is_corporation: input.is_corporation ?? current.is_corporation,
      is_invoice_issuer: input.is_invoice_issuer ?? current.is_invoice_issuer,
      is_active: input.is_active ?? current.is_active
    };
    state.partners[index] = next;
    await this.store.savePartners(state.partners);
    return next;
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
      header
        .map((key) => this.escapeCsvValue(String((partner as unknown as Record<string, unknown>)[key] ?? "")))
        .join(",")
    );
    return [header.join(","), ...rows].join("\n");
  }

  async importPartnersCsv(csvText: string): Promise<PartnerImportResult> {
    const rows = this.parseCsv(csvText);
    if (rows.length < 2) {
      return { imported: 0, skipped: 0, errors: ["CSV must include header and rows"], partners: await this.listPartners() };
    }

    const header = rows[0].map((item) => item.trim());
    const state = await this.store.load();
    const partners = [...state.partners];
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let nextId = partners.reduce((max, item) => Math.max(max, item.id), 0) + 1;

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

      const incoming: PartnerRecord = {
        id: partners.find((item) => item.partner_code === partnerCode)?.id ?? nextId++,
        partner_code: partnerCode,
        name,
        name_kana: this.optionalString(row.name_kana),
        is_corporation: this.parseBoolean(row.is_corporation),
        representative: this.optionalString(row.representative),
        contact_person: this.optionalString(row.contact_person),
        contact_email: this.optionalString(row.contact_email),
        contact_phone: this.optionalString(row.contact_phone),
        invoice_registration_number: this.optionalString(row.invoice_registration_number),
        is_invoice_issuer: this.parseBoolean(row.is_invoice_issuer),
        bank_name: this.optionalString(row.bank_name),
        bank_branch: this.optionalString(row.bank_branch),
        bank_account_type: this.optionalString(row.bank_account_type),
        bank_account_number: this.optionalString(row.bank_account_number),
        bank_account_holder: this.optionalString(row.bank_account_holder),
        is_active: row.is_active ? this.parseBoolean(row.is_active) : true,
        notes: this.optionalString(row.notes)
      };

      const existingIndex = partners.findIndex((item) => item.partner_code === partnerCode);
      if (existingIndex >= 0) {
        partners[existingIndex] = incoming;
      } else {
        partners.push(incoming);
      }
      imported += 1;
    }

    await this.store.savePartners(partners);
    return { imported, skipped, errors, partners };
  }

  private optionalString(value: unknown): string | undefined {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : undefined;
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
