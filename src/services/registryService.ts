import { AppStore } from "../store.js";
import { ContractRecord, DeliveryRecord, DocumentRecord, IssueRecord, PollingLogRecord } from "../types.js";
import { PrismaRegistryRepository } from "./prismaRegistryRepository.js";
import { PrismaWorkflowRepository } from "./prismaWorkflowRepository.js";

export class RegistryService {
  constructor(
    private readonly store: AppStore,
    private readonly prismaRepository?: PrismaRegistryRepository,
    private readonly prismaWorkflowRepository?: PrismaWorkflowRepository
  ) {}

  async ensureContractNumber(issue: IssueRecord): Promise<IssueRecord> {
    if (issue.contractNo) {
      return issue;
    }

    const state = await this.store.load();
    const sequences = this.prismaWorkflowRepository
      ? await this.prismaWorkflowRepository.listContractSequences()
      : state.contractSequences;
    const prefix = this.resolvePrefix(issue.templateKey);
    const year = new Date().getFullYear();
    const sequence =
      sequences.find((item) => item.prefix === prefix && item.year === year) ?? {
        prefix,
        year,
        last_number: 0,
        updated_at: new Date().toISOString()
      };

    const nextNumber = sequence.last_number + 1;
    const nextContractNo = `${prefix}-${year}-${String(nextNumber).padStart(4, "0")}`;
    const nextSequence = {
      ...sequence,
      last_number: nextNumber,
      updated_at: new Date().toISOString()
    };

    const otherSequences = sequences.filter((item) => !(item.prefix === prefix && item.year === year));
    const nextSequences = [nextSequence, ...otherSequences];
    if (this.prismaWorkflowRepository) {
      await this.prismaWorkflowRepository.saveContractSequences(nextSequences);
    } else {
      await this.store.saveContractSequences(nextSequences);
    }
    return {
      ...issue,
      contractNo: nextContractNo,
      updatedAt: new Date().toISOString()
    };
  }

  async recordDocumentLifecycle(issue: IssueRecord, document: DocumentRecord): Promise<void> {
    const state = await this.store.load();
    const now = new Date().toISOString();
    const contractId = issue.contractNo || document.contractNo || issue.issueKey;
    const counterpartyName = this.readString(
      issue.payload.vendorName ??
        issue.payload.counterpartyName ??
        issue.payload.partnerName ??
        issue.payload.PARTY_B_NAME
    );
    const partnerCode = this.readString(issue.payload.partnerCode ?? issue.payload.partner_code);
    const parentIssueKey = this.readString(issue.payload.parentIssueKey ?? issue.payload.parent_issue_key);
    const childIssueKeys = this.readStringArray(issue.payload.childIssueKeys ?? issue.payload.child_issue_keys);

    const contract: ContractRecord = {
      id: `contract-${contractId}`,
      contract_no: document.contractNo ?? issue.contractNo ?? "",
      issue_id: issue.id,
      issue_key: issue.issueKey,
      title: issue.title,
      template_key: issue.templateKey,
      workflow_status: issue.status,
      approval_status: this.readString(issue.payload.approval_status),
      stamp_status: this.readString(issue.payload.stamp_status),
      counterparty_name: counterpartyName,
      partner_code: partnerCode,
      parent_issue_key: parentIssueKey,
      child_issue_keys: childIssueKeys,
      drive_folder_name: document.driveFolderName,
      drive_file_url: document.driveFileUrl ?? document.pdfPath,
      revision_no: this.resolveRevision(issue),
      created_at: now,
      updated_at: now
    };

    const contracts = this.upsertById(state.contracts, contract);
    await this.store.saveContracts(contracts);

    const deliveryType = this.resolveDeliveryType(issue);
    if (deliveryType) {
      const delivery: DeliveryRecord = {
        id: `delivery-${issue.issueKey}`,
        contract_id: contract.id,
        issue_id: issue.id,
        issue_key: issue.issueKey,
        delivery_type: deliveryType,
        status: this.resolveDeliveryStatus(issue),
        requested_at: issue.createdAt,
        completed_at: issue.status === "Completed" ? now : undefined,
        document_id: document.id,
        drive_folder_name: document.driveFolderName,
        remarks: this.readString(issue.payload.remarks ?? issue.payload.notes)
      };
      const deliveries = this.upsertById(state.deliveries, delivery);
      await this.store.saveDeliveries(deliveries);
    }

    if (this.prismaRepository) {
      await this.prismaRepository.recordDocumentLifecycle(issue, document);
    }
  }

  async recordIssueState(issue: IssueRecord): Promise<void> {
    const state = await this.store.load();
    const contractNo = issue.contractNo || this.readString(issue.payload.CONTRACT_NO);
    if (!contractNo) {
      return;
    }

    const current = state.contracts.find((item) => item.contract_no === contractNo || item.issue_id === issue.id);
    if (!current) {
      return;
    }

    const next: ContractRecord = {
      ...current,
      workflow_status: issue.status,
      approval_status: this.readString(issue.payload.approval_status),
      stamp_status: this.readString(issue.payload.stamp_status),
      updated_at: new Date().toISOString(),
      revision_no: this.resolveRevision(issue)
    };
    await this.store.saveContracts(this.upsertById(state.contracts, next));

    const delivery = state.deliveries.find((item) => item.issue_id === issue.id);
    if (delivery) {
      const nextDelivery: DeliveryRecord = {
        ...delivery,
        status: this.resolveDeliveryStatus(issue),
        completed_at: issue.status === "Completed" ? new Date().toISOString() : delivery.completed_at
      };
      await this.store.saveDeliveries(this.upsertById(state.deliveries, nextDelivery));
    }

    if (this.prismaRepository) {
      await this.prismaRepository.recordIssueState(issue);
    }
  }

  async recordPollerRun(input: Omit<PollingLogRecord, "id">): Promise<void> {
    const state = await this.store.load();
    const log: PollingLogRecord = {
      id: `poll-${Date.now()}`,
      ...input
    };
    state.pollingLogs.unshift(log);
    await this.store.savePollingLogs(state.pollingLogs);

    if (this.prismaRepository) {
      await this.prismaRepository.recordPollerRun(input);
    }
  }

  private resolvePrefix(templateKey: string): string {
    if (templateKey.includes("order")) {
      return "PO";
    }
    if (templateKey.includes("license") || templateKey.includes("ledger")) {
      return "LIC";
    }
    return "C";
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

  private resolveDeliveryStatus(issue: IssueRecord): string {
    const stampStatus = this.readString(issue.payload.stamp_status);
    if (issue.status === "Completed" || issue.status === "Signed") {
      return "completed";
    }
    if (["requested", "file_received", "physical_requested", "cloudsign_sent", "cloudsign_pending"].includes(stampStatus ?? "")) {
      return "stamping";
    }
    if (issue.status === "Approved" || issue.status === "SigningRequested" || issue.status === "CounterpartyConfirmed") {
      return "approved";
    }
    return issue.status.toLowerCase();
  }

  private resolveRevision(issue: IssueRecord): number {
    const raw = issue.payload.revision_no ?? issue.payload.revisionNo ?? issue.payload.counterparty_revision_no;
    const number = Number(raw ?? 1);
    return Number.isFinite(number) && number > 0 ? number : 1;
  }

  private readString(value: unknown): string | undefined {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : undefined;
  }

  private readStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    const single = this.readString(value);
    return single ? [single] : [];
  }

  private upsertById<T extends { id: string }>(items: T[], next: T): T[] {
    const index = items.findIndex((item) => item.id === next.id);
    if (index < 0) {
      return [next, ...items];
    }
    const clone = [...items];
    clone[index] = next;
    return clone;
  }
}
