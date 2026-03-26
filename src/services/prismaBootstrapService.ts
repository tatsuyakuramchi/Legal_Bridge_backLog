import { PrismaClient } from "../../generated/prisma/client.js";
import { AppStore } from "../store.js";
import { PrismaWorkflowRepository } from "./prismaWorkflowRepository.js";

export class PrismaBootstrapService {
  private readonly workflowRepository: PrismaWorkflowRepository;

  constructor(
    private readonly store: AppStore,
    private readonly prisma: PrismaClient
  ) {
    this.workflowRepository = new PrismaWorkflowRepository(prisma);
  }

  async ensureSeeded(): Promise<void> {
    const [usersCount, partnersCount, contractsCount, deliveriesCount, pollingLogsCount] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.partners.count(),
      this.prisma.contracts.count(),
      this.prisma.deliveries.count(),
      this.prisma.polling_logs.count()
    ]);

    const state = await this.store.load();
    await this.workflowRepository.seedWorkflowRuntime(state);

    if (usersCount > 0 && partnersCount > 0 && contractsCount > 0 && deliveriesCount > 0 && pollingLogsCount > 0) {
      return;
    }

    if (usersCount === 0 && state.users.length > 0) {
      await this.prisma.users.createMany({
        data: state.users.map((user) => ({
          id: user.id,
          slack_id: user.slack_id,
          name: user.name,
          department: user.department || null,
          title: user.title || null,
          google_email: user.google_email || null,
          phone: user.phone || null,
          is_legal_approver: user.is_legal_approver,
          is_business_approver: user.is_business_approver,
          is_legal_staff: user.is_legal_staff,
          is_admin: user.is_admin,
          is_active: user.is_active,
          notify_via_dm: user.notify_via_dm,
          notes: user.notes || null
        })),
        skipDuplicates: true
      });
    }

    if (partnersCount === 0 && state.partners.length > 0) {
      await this.prisma.partners.createMany({
        data: state.partners.map((partner) => ({
          id: partner.id,
          partner_code: partner.partner_code,
          name: partner.name,
          is_corporation: partner.is_corporation,
          representative: partner.representative || null,
          contact_person: partner.contact_person || null,
          contact_email: partner.contact_email || null,
          contact_phone: partner.contact_phone || null,
          is_invoice_issuer: partner.is_invoice_issuer,
          invoice_registration_number: partner.invoice_registration_number || null,
          bank_name: partner.bank_name || null,
          bank_branch: partner.bank_branch || null,
          bank_account_type: partner.bank_account_type || null,
          bank_account_number: partner.bank_account_number || null,
          bank_account_holder: partner.bank_account_holder || null,
          is_active: partner.is_active,
          notes: partner.notes || null
        })),
        skipDuplicates: true
      });
    }

    if (contractsCount === 0 && state.contracts.length > 0) {
      for (const contract of state.contracts) {
        const existingPartner = contract.partner_code
          ? await this.prisma.partners.findUnique({ where: { partner_code: contract.partner_code } })
          : null;
        await this.prisma.contracts.create({
          data: {
            backlog_issue_id: this.safeInteger(contract.issue_id),
            backlog_issue_key: contract.issue_key,
            contract_no: contract.contract_no,
            partner_id: existingPartner?.id ?? null,
            counterparty: contract.counterparty_name ?? contract.title,
            counterparty_person: null,
            contract_type: contract.template_key,
            status: contract.workflow_status,
            generation_count: contract.revision_no,
            drive_folder_url: contract.drive_file_url ?? null,
            created_at: new Date(contract.created_at),
            updated_at: new Date(contract.updated_at)
          }
        });
      }
    }

    if (deliveriesCount === 0 && state.deliveries.length > 0) {
      const contracts = await this.prisma.contracts.findMany();
      const byIssueKey = new Map(contracts.map((contract) => [contract.backlog_issue_key, contract]));
      for (const delivery of state.deliveries) {
        const contract = byIssueKey.get(delivery.issue_key);
        if (!contract) {
          continue;
        }
        await this.prisma.deliveries.create({
          data: {
            contract_id: contract.id,
            backlog_issue_id: this.safeNullableInteger(delivery.issue_id),
            backlog_issue_key: delivery.issue_key || null,
            delivery_type: delivery.delivery_type,
            approval_comments: delivery.remarks || null,
            approved_at: delivery.completed_at ? new Date(delivery.completed_at) : null,
            created_at: new Date(delivery.requested_at),
            updated_at: new Date(delivery.completed_at ?? delivery.requested_at)
          }
        });
      }
    }

    if (pollingLogsCount === 0 && state.pollingLogs.length > 0) {
      await this.prisma.polling_logs.createMany({
        data: state.pollingLogs.map((log) => ({
          checked_at: new Date(log.finished_at),
          issues_fetched: log.fetched_count,
          issues_processed: log.updated_count + log.created_count,
          duration_ms: Math.max(new Date(log.finished_at).getTime() - new Date(log.started_at).getTime(), 0),
          error_message: log.success ? null : log.message,
          status: log.success ? "success" : "error"
        }))
      });
    }
  }

  private safeInteger(value: string): number {
    const normalized = Number(String(value).replace(/[^\d]/g, ""));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : Math.floor(Date.now() / 1000);
  }

  private safeNullableInteger(value: string): number | null {
    const normalized = Number(String(value).replace(/[^\d]/g, ""));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
  }
}
