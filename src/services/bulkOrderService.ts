import { BulkOrderOutputMode } from "../types.js";

type BulkOrderCsvRow = {
  vendorName: string;
  vendorInvoiceNum: string;
  projectTitle: string;
  deliveryDate: string;
  unitPrice: number;
  quantity: number;
  description: string;
  paymentTerms: string;
  notes: string;
  hasBaseContract: boolean;
  backlogAssignee: string;
};

export type BulkOrderDraft = {
  rowNumber: number;
  title: string;
  payload: Record<string, unknown>;
  vendorName: string;
  projectTitle: string;
};

export type BulkOrderValidationError = {
  rowNumber: number;
  vendorName: string;
  projectTitle: string;
  message: string;
};

export type BulkOrderParseResult = {
  rows: BulkOrderDraft[];
  errors: BulkOrderValidationError[];
};

export class BulkOrderService {
  parse(csvText: string): BulkOrderParseResult {
    const normalized = csvText.replace(/^\uFEFF/, "").trim();
    if (!normalized) {
      return {
        rows: [],
        errors: [{ rowNumber: 0, vendorName: "", projectTitle: "", message: "CSV is empty." }]
      };
    }

    const records = this.parseCsvRecords(normalized);
    if (records.length < 2) {
      return {
        rows: [],
        errors: [{ rowNumber: 0, vendorName: "", projectTitle: "", message: "CSV must include a header and at least one row." }]
      };
    }

    const header = records[0].map((value) => this.normalizeHeader(value));
    const rows: BulkOrderDraft[] = [];
    const errors: BulkOrderValidationError[] = [];

    for (let index = 1; index < records.length; index += 1) {
      const cells = records[index];
      const rowNumber = index + 1;
      if (cells.every((cell) => !cell.trim())) {
        continue;
      }

      const raw = this.toRow(header, cells);
      const validation = this.validateRow(raw, rowNumber);
      if (validation.length > 0) {
        const vendorName = String(raw.vendor_name ?? "");
        const projectTitle = String(raw.project_title ?? "");
        for (const message of validation) {
          errors.push({ rowNumber, vendorName, projectTitle, message });
        }
        continue;
      }

      const parsed = this.mapRow(raw);
      rows.push({
        rowNumber,
        vendorName: parsed.vendorName,
        projectTitle: parsed.projectTitle,
        title: `${parsed.projectTitle} 発注書`,
        payload: this.toIssuePayload(parsed)
      });
    }

    return { rows, errors };
  }

  normalizeOutputMode(value: string | undefined): BulkOrderOutputMode {
    if (value === "merged" || value === "both") {
      return value;
    }
    return "individual";
  }

  private parseCsvRecords(input: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          currentCell += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
        continue;
      }

      currentCell += char;
    }

    currentRow.push(currentCell.trim());
    rows.push(currentRow);
    return rows;
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "_");
  }

  private toRow(header: string[], cells: string[]): Record<string, string> {
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? "").trim();
    });
    return row;
  }

  private validateRow(row: Record<string, string>, rowNumber: number): string[] {
    const errors: string[] = [];
    for (const key of ["vendor_name", "project_title", "delivery_date", "unit_price", "quantity", "description", "has_base_contract"]) {
      if (!row[key]) {
        errors.push(`${key} is required.`);
      }
    }

    if (row.delivery_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.delivery_date)) {
      errors.push("delivery_date must be YYYY-MM-DD.");
    }

    if (row.unit_price && Number.isNaN(Number(row.unit_price))) {
      errors.push("unit_price must be numeric.");
    }

    if (row.quantity && Number.isNaN(Number(row.quantity))) {
      errors.push("quantity must be numeric.");
    }

    if (row.has_base_contract && !/^(true|false|1|0|yes|no)$/i.test(row.has_base_contract)) {
      errors.push("has_base_contract must be true or false.");
    }

    if (errors.length === 0 && Number(row.quantity) <= 0) {
      errors.push("quantity must be greater than 0.");
    }

    if (errors.length === 0 && Number(row.unit_price) < 0) {
      errors.push("unit_price must be 0 or greater.");
    }

    return errors.map((message) => `Row ${rowNumber}: ${message}`);
  }

  private mapRow(row: Record<string, string>): BulkOrderCsvRow {
    return {
      vendorName: row.vendor_name,
      vendorInvoiceNum: row.vendor_invoice_num ?? "",
      projectTitle: row.project_title,
      deliveryDate: row.delivery_date,
      unitPrice: Number(row.unit_price),
      quantity: Number(row.quantity),
      description: row.description,
      paymentTerms: row.payment_terms ?? "",
      notes: row.notes ?? "",
      hasBaseContract: /^(true|1|yes)$/i.test(row.has_base_contract),
      backlogAssignee: row.backlog_assignee ?? ""
    };
  }

  private toIssuePayload(row: BulkOrderCsvRow): Record<string, unknown> {
    const today = new Date().toISOString().slice(0, 10);
    const amount = row.unitPrice * row.quantity;
    return {
      vendorName: row.vendorName,
      vendorAddress: "",
      vendorEmail: "",
      vendorContactName: row.vendorName,
      vendorContactDepartment: "",
      vendorInvoiceNum: row.vendorInvoiceNum,
      projectTitle: row.projectTitle,
      orderDate: today,
      deliveryDate: row.deliveryDate,
      firstDraftDeadline: row.deliveryDate,
      finalDeadline: row.deliveryDate,
      paymentTerms: row.paymentTerms || "別途協議のうえ定めます。",
      remarks: row.notes,
      specialTerms: row.notes,
      hasBaseContract: row.hasBaseContract,
      backlogAssignee: row.backlogAssignee,
      items: [
        {
          name: row.projectTitle,
          item_name: row.projectTitle,
          spec: row.description,
          detailText: row.description,
          qty: row.quantity,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          unit_price: row.unitPrice,
          amount,
          payment_method_display: "固定報酬",
          pay_method: "FIXED",
          ip_owner: "",
          rights_owner_display: ""
        }
      ]
    };
  }
}
